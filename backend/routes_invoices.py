"""Invoice + payment routes."""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from datetime import date, datetime
from typing import List, Optional

import resend
from fastapi import APIRouter, Depends, HTTPException, Response

from auth import get_current_coach
from billing import describe_line
from db import db, now, serialize
from models import (
    AttendanceType,
    Invoice,
    InvoiceGenerateRequest,
    InvoiceLineItem,
    InvoiceStatus,
    Payment,
    PaymentCreate,
    ProgramType,
)
from pdf import render_invoice_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/invoices", tags=["invoices"], dependencies=[Depends(get_current_coach)])

SENDER_EMAIL = os.environ["SENDER_EMAIL"]
APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
resend.api_key = os.environ["RESEND_API_KEY"]


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


@router.get("", response_model=List[Invoice])
async def list_invoices(status: Optional[InvoiceStatus] = None, family_id: Optional[str] = None):
    query: dict = {}
    if status:
        query["status"] = status.value
    if family_id:
        query["family_id"] = family_id
    docs = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.post("/generate")
async def generate_invoice(req: InvoiceGenerateRequest):
    """Auto-build a draft invoice from attendance records for a family in a period."""
    family = await db.families.find_one({"id": req.family_id}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")

    athletes = await db.athletes.find({"family_id": req.family_id}, {"_id": 0}).to_list(500)
    if not athletes:
        raise HTTPException(400, "No athletes in this family")
    athlete_ids = [a["id"] for a in athletes]
    athletes_by_id = {a["id"]: a for a in athletes}

    # Fetch all attendance for these athletes in date range
    # Attendance records reference sessions whose date is in range.
    sessions = await db.sessions.find(
        {"date": {"$gte": req.period_start.isoformat(), "$lte": req.period_end.isoformat()}},
        {"_id": 0},
    ).to_list(5000)
    session_ids = [s["id"] for s in sessions]
    sessions_by_id = {s["id"]: s for s in sessions}

    if not session_ids:
        records = []
    else:
        records = await db.attendance_records.find(
            {"session_id": {"$in": session_ids}, "athlete_id": {"$in": athlete_ids}},
            {"_id": 0},
        ).to_list(5000)

    # Filter out absents & zero-billed
    billable = [r for r in records if r["attendance_type"] != AttendanceType.absent.value and r["billed_rate"] > 0]

    if not billable:
        raise HTTPException(400, "No billable attendance found in this period for this family")

    invoice_number = await _next_invoice_number()
    invoice = Invoice(
        invoice_number=invoice_number,
        family_id=req.family_id,
        period_start=req.period_start,
        period_end=req.period_end,
        status=InvoiceStatus.draft,
    )

    line_items: list[InvoiceLineItem] = []
    subtotal = 0.0
    # Group by athlete -> sort by date
    billable.sort(key=lambda r: (r["athlete_id"], sessions_by_id[r["session_id"]]["date"]))
    for r in billable:
        athlete = athletes_by_id[r["athlete_id"]]
        sess = sessions_by_id[r["session_id"]]
        sess_date = sess["date"]
        desc = describe_line(
            AttendanceType(r["attendance_type"]),
            ProgramType(athlete["program_type"]),
            sess_date,
        )
        amount = float(r["billed_rate"])
        li = InvoiceLineItem(
            invoice_id=invoice.id,
            athlete_id=athlete["id"],
            athlete_name=athlete["full_name"],
            attendance_record_id=r["id"],
            description=desc,
            quantity=1,
            unit_price=amount,
            amount=amount,
        )
        line_items.append(li)
        subtotal += amount

    invoice.subtotal = round(subtotal, 2)
    invoice.total = round(subtotal, 2)

    await db.invoices.insert_one(serialize(invoice.model_dump()))
    if line_items:
        await db.invoice_line_items.insert_many([serialize(li.model_dump()) for li in line_items])

    return {
        "invoice": invoice.model_dump(),
        "line_items": [li.model_dump() for li in line_items],
    }


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1000)
    family = await db.families.find_one({"id": inv["family_id"]}, {"_id": 0})
    athlete_ids = list({li["athlete_id"] for li in items})
    athletes = await db.athletes.find({"id": {"$in": athlete_ids}}, {"_id": 0}).to_list(500)
    payments = await db.payments.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(100)
    return {
        "invoice": inv,
        "line_items": items,
        "family": family,
        "athletes": athletes,
        "payments": payments,
    }


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
    pdf_bytes, filename, ctx = await _build_pdf(invoice_id)
    inv = ctx["invoice"]
    family = ctx["family"]

    html = f"""
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0A0A0A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:3px solid #0A0A0A;">
        <tr><td style="padding:32px;">
          <div style="font-family:'Arial Black',Arial,sans-serif;font-size:24px;font-weight:900;letter-spacing:-1px;color:#0A0A0A;text-transform:uppercase;">Elite Atmosphere Training</div>
          <div style="height:6px;background:#CCFF00;margin:14px 0 22px 0;width:60px;"></div>
          <h1 style="font-size:20px;color:#0A0A0A;margin:0 0 12px 0;">Invoice {inv['invoice_number']}</h1>
          <p style="font-size:15px;color:#52525B;line-height:1.6;margin:0 0 16px 0;">
            Hi {family['guardian_name']},<br><br>
            Please find your invoice attached for the training period {inv['period_start']} – {inv['period_end']}.<br><br>
            <strong>Total: ${float(inv['total']):,.2f}</strong><br>
            Payment method: Zelle
          </p>
          <p style="font-size:13px;color:#71717A;line-height:1.6;margin:24px 0 0 0;">
            Thanks for being part of the EAT family.<br>— Coach Rico
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""

    params = {
        "from": f"Elite Atmosphere Training <{SENDER_EMAIL}>",
        "to": [family["guardian_email"]],
        "subject": f"EAT Invoice {inv['invoice_number']}",
        "html": html,
        "attachments": [{
            "filename": filename,
            "content": list(pdf_bytes),
        }],
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        email_id = (result or {}).get("id")
    except Exception as e:
        logger.error(f"Resend invoice send failed: {e}")
        raise HTTPException(500, f"Email send failed: {e}")

    pdf_url = f"{APP_BASE_URL}/api/invoices/{invoice_id}/pdf"
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": InvoiceStatus.sent.value, "sent_at": now().isoformat(), "pdf_url": pdf_url}},
    )
    return {"status": "sent", "email_id": email_id, "pdf_url": pdf_url}


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
    return {"status": "paid", "payment": pay.model_dump()}
