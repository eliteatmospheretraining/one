"""Invoice + payment routes."""
from __future__ import annotations

import logging
import os
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response

from auth import get_current_coach
from db import db, now, serialize
from invoice_billing import (
    auto_complete_family_sessions_in_period,
    billing_skips_for_period,
    populate_draft_from_attendance,
)
from invoice_services import build_manual_line_item, list_service_options
from models import (
    Invoice,
    InvoiceGenerateRequest,
    InvoiceLineItem,
    InvoiceLineItemCreate,
    InvoiceStatus,
    Payment,
    PaymentCreate,
)
from pdf import render_invoice_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/invoices", tags=["invoices"], dependencies=[Depends(get_current_coach)])

APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")


async def _next_invoice_number() -> str:
    res = await db.counters.find_one_and_update(
        {"_id": "invoice_seq"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = res["seq"] if res and "seq" in res else 1
    return f"EAT-{seq:06d}"


async def _parse_date(v) -> date:
    if isinstance(v, date):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        return date.fromisoformat(v[:10])
    raise ValueError(f"bad date: {v}")


async def _find_family_draft(family_id: str, period_start: date, period_end: date) -> dict | None:
    start = period_start.isoformat()
    end = period_end.isoformat()
    drafts = await db.invoices.find(
        {"family_id": family_id, "status": InvoiceStatus.draft.value},
        {"_id": 0},
    ).to_list(200)
    for inv in drafts:
        ps = str(inv.get("period_start", ""))[:10]
        pe = str(inv.get("period_end", ""))[:10]
        if ps == start and pe == end:
            return inv
    return None


async def _sync_draft_invoice(invoice_id: str, *, replace: bool = False) -> dict:
    """Rebuild draft lines from attendance + rate card."""
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.draft.value:
        raise HTTPException(400, "Only draft invoices can be synced")

    period_start = await _parse_date(inv["period_start"])
    period_end = await _parse_date(inv["period_end"])

    if replace:
        await db.invoice_line_items.delete_many({
            "invoice_id": invoice_id,
            "description": {"$regex": r"Monthly Rate"},
        })

    new_items, skipped, session_count = await populate_draft_from_attendance(
        invoice_id,
        inv["family_id"],
        period_start,
        period_end,
        line_item_cls=InvoiceLineItem,
        replace_attendance_lines=replace,
    )
    total = await _recalc_invoice_totals(invoice_id)
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1000)
    return {
        "status": "ok",
        "added": len(new_items),
        "session_count": session_count,
        "skipped": skipped,
        "invoice": inv,
        "line_items": items,
        "total": total,
        "message": _populate_message(new_items, skipped),
    }


async def _recalc_invoice_totals(invoice_id: str) -> float:
    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(5000)
    total = round(sum(float(li.get("amount") or 0) for li in items), 2)
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"subtotal": total, "total": total}},
    )
    return total


@router.get("", response_model=List[Invoice])
async def list_invoices(status: Optional[InvoiceStatus] = None, family_id: Optional[str] = None):
    query: dict = {}
    if status:
        query["status"] = status.value
    if family_id:
        query["family_id"] = family_id
    docs = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/service-options")
async def invoice_service_options():
    """Preset services for manual draft lines (prices from rate card)."""
    return list_service_options()


async def generate_family_period_invoice(
    family_id: str,
    period_start: date,
    period_end: date,
) -> dict:
    """Create or refresh a draft invoice for a family and period from attendance + rate card."""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")
    if period_end < period_start:
        raise HTTPException(400, "Period end must be on or after period start")

    existing = await _find_family_draft(family_id, period_start, period_end)
    if existing:
        out = await _sync_draft_invoice(existing["id"], replace=True)
        out["reused_draft"] = True
        return out

    invoice_number = await _next_invoice_number()
    invoice = Invoice(
        invoice_number=invoice_number,
        family_id=family_id,
        period_start=period_start,
        period_end=period_end,
        status=InvoiceStatus.draft,
    )
    await db.invoices.insert_one(serialize(invoice.model_dump()))

    out = await _sync_draft_invoice(invoice.id, replace=False)
    out["reused_draft"] = False
    return out


@router.post("/generate")
async def generate_invoice(req: InvoiceGenerateRequest):
    """Create or refresh a draft invoice for a family and period from attendance + rate card."""
    try:
        period_start = await _parse_date(req.period_start)
        period_end = await _parse_date(req.period_end)
        return await generate_family_period_invoice(req.family_id, period_start, period_end)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Invoice generate failed for family %s", req.family_id)
        raise HTTPException(500, f"Invoice generate failed: {e}") from e


@router.post("/run-weekly-batch")
async def run_weekly_invoice_batch(force: bool = True):
    """Create Mon–Fri draft invoices for all families (Saturday auto-batch; coach can run anytime)."""
    from invoice_auto import run_saturday_weekly_batch

    return await run_saturday_weekly_batch(force=force)


@router.get("/ready-to-invoice")
async def ready_to_invoice():
    """Billable completed sessions not yet on any invoice, grouped by family and athlete."""
    from invoice_billing import ready_to_invoice_summary

    return await ready_to_invoice_summary()


def _populate_message(new_items: list, skipped: list[dict]) -> str:
    if new_items:
        return f"Added {len(new_items)} line item(s) from attendance and rate card"
    not_completed = sum(1 for s in skipped if s.get("reason") == "not_completed")
    already = sum(1 for s in skipped if s.get("reason") == "already_invoiced")
    if not_completed:
        return f"No billable attendance — {not_completed} session(s) not marked completed"
    if already:
        return "Attendance already on another invoice for this period"
    return "No billable completed attendance in this period"


@router.post("/{invoice_id}/refresh")
async def refresh_invoice_draft(invoice_id: str):
    """Rebuild draft line items from billable completed attendance in the invoice period."""
    try:
        return await _sync_draft_invoice(invoice_id, replace=True)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Invoice refresh failed for %s", invoice_id)
        raise HTTPException(500, f"Invoice refresh failed: {e}") from e


@router.post("/{invoice_id}/line-items")
async def add_invoice_line_item(invoice_id: str, req: InvoiceLineItemCreate):
    """Add a preset service line to a draft invoice."""
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.draft.value:
        raise HTTPException(400, "Only draft invoices can be edited")

    athlete = await db.athletes.find_one(
        {"id": req.athlete_id, "family_id": inv["family_id"]},
        {"_id": 0},
    )
    if not athlete:
        raise HTTPException(400, "Athlete not found on this family")

    period_start = await _parse_date(inv["period_start"])
    period_end = await _parse_date(inv["period_end"])
    week_start = await _parse_date(req.week_start) if req.week_start else None
    week_end = await _parse_date(req.week_end) if req.week_end else None
    service_date = await _parse_date(req.service_date) if req.service_date else None

    try:
        line = build_manual_line_item(
            invoice_id=invoice_id,
            athlete=athlete,
            service_id=req.service_id,
            period_start=period_start,
            period_end=period_end,
            week_start=week_start,
            week_end=week_end,
            service_date=service_date,
            quantity=req.quantity,
            unit_price=req.unit_price,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    await db.invoice_line_items.insert_one(serialize(line.model_dump()))
    total = await _recalc_invoice_totals(invoice_id)
    return {
        "line_item": line.model_dump(),
        "total": total,
    }


@router.delete("/{invoice_id}/line-items/{line_item_id}")
async def delete_invoice_line_item(invoice_id: str, line_item_id: str):
    """Remove a line from a draft invoice."""
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.draft.value:
        raise HTTPException(400, "Only draft invoices can be edited")

    res = await db.invoice_line_items.delete_one(
        {"id": line_item_id, "invoice_id": invoice_id}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Line item not found")

    total = await _recalc_invoice_totals(invoice_id)
    return {"status": "ok", "total": total}


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, sync: bool = False):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")

    if sync and inv.get("status") == InvoiceStatus.draft.value:
        period_start = await _parse_date(inv["period_start"])
        period_end = await _parse_date(inv["period_end"])
        await auto_complete_family_sessions_in_period(inv["family_id"], period_start, period_end)
        existing = await db.invoice_line_items.count_documents({"invoice_id": invoice_id})
        if existing == 0:
            await populate_draft_from_attendance(
                invoice_id,
                inv["family_id"],
                period_start,
                period_end,
                line_item_cls=InvoiceLineItem,
            )
            await _recalc_invoice_totals(invoice_id)
            inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})

    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1000)
    family = await db.families.find_one({"id": inv["family_id"]}, {"_id": 0})
    athletes = await db.athletes.find({"family_id": inv["family_id"]}, {"_id": 0}).to_list(500)
    payments = await db.payments.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(100)
    out = {
        "invoice": inv,
        "line_items": items,
        "family": family,
        "athletes": athletes,
        "payments": payments,
    }
    if inv.get("status") == InvoiceStatus.draft.value:
        period_start = await _parse_date(inv["period_start"])
        period_end = await _parse_date(inv["period_end"])
        out["billing_skips"] = await billing_skips_for_period(
            inv["family_id"],
            period_start,
            period_end,
            for_invoice_id=invoice_id,
        )
    return out


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.draft.value:
        raise HTTPException(400, "Only draft invoices can be deleted")
    await db.invoice_line_items.delete_many({"invoice_id": invoice_id})
    await db.invoices.delete_one({"id": invoice_id})
    return {"status": "ok"}


async def _build_pdf(invoice_id: str) -> tuple[bytes, str, dict]:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    family = await db.families.find_one({"id": inv["family_id"]}, {"_id": 0})
    if not family:
        raise HTTPException(400, "Family missing")
    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1000)
    athlete_ids = list({li["athlete_id"] for li in items})
    athletes = await db.athletes.find({"id": {"$in": athlete_ids}}, {"_id": 0}).to_list(500)
    payments = await db.payments.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(100)

    payment_date = None
    payment_method = None
    if payments:
        # earliest payment date
        pd = sorted(payments, key=lambda p: p["received_date"])[0]
        payment_date = await _parse_date(pd["received_date"])
        payment_method = pd.get("method", "Zelle")

    # build line items shape for pdf
    pdf_items = []
    for li in items:
        # extract date from description tail if present
        sess_date = ""
        desc_full = li["description"]
        if "(" in desc_full and desc_full.endswith(")"):
            sess_date = desc_full[desc_full.rfind("(") + 1:-1]
            desc = desc_full[:desc_full.rfind("(")].strip().rstrip("—").strip()
        else:
            desc = desc_full
        pdf_items.append({
            "date": sess_date,
            "description": f"{li['athlete_name']} — {desc}",
            "quantity": float(li["quantity"]),
            "unit_price": float(li["unit_price"]),
            "amount": float(li["amount"]),
        })

    pdf_bytes = render_invoice_pdf(
        invoice_number=inv["invoice_number"],
        issue_date=await _parse_date(inv["issue_date"]),
        period_start=await _parse_date(inv["period_start"]),
        period_end=await _parse_date(inv["period_end"]),
        family_name=family["family_name"],
        guardian_name=family["guardian_name"],
        guardian_email=family["guardian_email"],
        athlete_names=[a["full_name"] for a in athletes],
        line_items=pdf_items,
        subtotal=float(inv["subtotal"]),
        total=float(inv["total"]),
        payment_date=payment_date,
        payment_method=payment_method,
        paid=inv["status"] == InvoiceStatus.paid.value,
    )
    filename = f"{inv['invoice_number']}.pdf"
    return pdf_bytes, filename, {"invoice": inv, "family": family}


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str):
    pdf_bytes, filename, _ = await _build_pdf(invoice_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{invoice_id}/send")
async def send_invoice(invoice_id: str):
    """Email guardian a magic link to view the due invoice (PDF attached)."""
    from invoice_send import send_guardian_invoice_email

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] not in (InvoiceStatus.draft.value, InvoiceStatus.sent.value):
        raise HTTPException(400, "Only draft or sent invoices can be emailed as due")

    result = await send_guardian_invoice_email(invoice_id, "due")
    pdf_url = f"{APP_BASE_URL}/api/invoices/{invoice_id}/pdf"
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": InvoiceStatus.sent.value, "sent_at": now().isoformat(), "pdf_url": pdf_url}},
    )
    result["pdf_url"] = pdf_url
    return result


@router.post("/{invoice_id}/send-receipt")
async def send_invoice_receipt(invoice_id: str):
    """Email guardian a magic link confirming payment (PDF receipt attached)."""
    from invoice_send import send_guardian_invoice_email

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.paid.value:
        raise HTTPException(400, "Invoice must be paid before sending a receipt email")

    result = await send_guardian_invoice_email(invoice_id, "paid")
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"receipt_sent_at": now().isoformat()}},
    )
    return result


@router.post("/{invoice_id}/payments")
async def record_payment(invoice_id: str, payload: PaymentCreate, coach: dict = Depends(get_current_coach)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")

    pay = Payment(
        invoice_id=invoice_id,
        amount_received=payload.amount_received,
        received_date=payload.received_date,
        method=payload.method,
        note=payload.note,
        logged_by=coach["email"],
    )
    await db.payments.insert_one(serialize(pay.model_dump()))
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": InvoiceStatus.paid.value}})

    receipt_email = None
    if payload.send_receipt:
        try:
            from invoice_send import send_guardian_invoice_email

            receipt_email = await send_guardian_invoice_email(invoice_id, "paid")
            await db.invoices.update_one(
                {"id": invoice_id},
                {"$set": {"receipt_sent_at": now().isoformat()}},
            )
        except HTTPException as e:
            logger.warning(f"Paid receipt email not sent for {invoice_id}: {e.detail}")
        except Exception as e:
            logger.warning(f"Paid receipt email failed for {invoice_id}: {e}")

    out = {"status": "paid", "payment": pay.model_dump()}
    if receipt_email:
        out["receipt_email"] = receipt_email
    return out
