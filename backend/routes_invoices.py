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
    DiscountPreset,
    DiscountPresetCreate,
    DiscountPresetUpdate,
    Invoice,
    InvoiceDiscountUpdate,
    InvoiceGenerateRequest,
    InvoiceLineItem,
    InvoiceLineItemCreate,
    InvoiceLineItemUpdate,
    InvoiceStatus,
    Payment,
    PaymentCreate,
)
from pdf import invoice_pdf_filename, pdf_content_disposition, render_invoice_pdf

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


async def _sync_draft_invoice(
    invoice_id: str,
    *,
    replace: bool = False,
    require_monthly_attendance: bool = True,
) -> dict:
    """Rebuild draft lines from attendance + rate card."""
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.draft.value:
        raise HTTPException(400, "Only draft invoices can be synced")

    period_start = await _parse_date(inv["period_start"])
    period_end = await _parse_date(inv["period_end"])

    if replace:
        # Clear auto package + attendance-linked lines so classifier rebuilds cleanly
        await db.invoice_line_items.delete_many({
            "invoice_id": invoice_id,
            "description": {"$regex": r"(Monthly|Weekly) Rate"},
        })
        await db.invoice_line_items.delete_many({
            "invoice_id": invoice_id,
            "description": {"$regex": r"Drop-In Rate"},
            "$or": [
                {"attendance_record_id": {"$exists": True, "$ne": None}},
                {"attendance_record_ids.0": {"$exists": True}},
            ],
        })

    new_items, skipped, session_count = await populate_draft_from_attendance(
        invoice_id,
        inv["family_id"],
        period_start,
        period_end,
        line_item_cls=InvoiceLineItem,
        replace_attendance_lines=replace,
        require_monthly_attendance=require_monthly_attendance,
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
    from invoice_discounts import invoice_totals

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return 0.0
    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(5000)
    discount_type = inv.get("discount_type")
    discount_value = inv.get("discount_value")
    subtotal, discount_amount, total = invoice_totals(
        items,
        discount_type=discount_type,
        discount_value=discount_value,
    )
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"subtotal": subtotal, "discount_amount": discount_amount, "total": total}},
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
    *,
    require_monthly_attendance: bool = True,
) -> dict:
    """Create or refresh a draft invoice for a family and period from attendance + rate card."""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")
    if period_end < period_start:
        raise HTTPException(400, "Period end must be on or after period start")

    existing = await _find_family_draft(family_id, period_start, period_end)
    if existing:
        out = await _sync_draft_invoice(
            existing["id"],
            replace=True,
            require_monthly_attendance=require_monthly_attendance,
        )
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

    out = await _sync_draft_invoice(
        invoice.id,
        replace=False,
        require_monthly_attendance=require_monthly_attendance,
    )
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
    """Create Mon–Fri draft invoices for all families (Friday 5pm ET auto-batch; coach can run anytime)."""
    from invoice_auto import run_friday_weekly_batch

    return await run_friday_weekly_batch(force=force)


@router.post("/run-monthly-batch")
async def run_monthly_invoice_batch(force: bool = True):
    """Create next-month prepaid draft invoices for monthly families (last-day-of-month auto-batch)."""
    from invoice_auto import run_monthly_batch

    return await run_monthly_batch(force=force)


@router.get("/draft-summary")
async def invoice_draft_summary():
    """Draft counts split by weekly vs monthly billing period, plus billing hygiene cues."""
    from billing import is_monthly_invoice_period, is_weekly_invoice_period, month_period_for
    from invoice_auto import next_month_period, training_week_mon_fri
    from models import AthleteStatus, ProgramType

    drafts = await db.invoices.find(
        {"status": InvoiceStatus.draft.value},
        {"_id": 0, "id": 1, "period_start": 1, "period_end": 1},
    ).to_list(500)

    weekly_count = 0
    monthly_count = 0
    other_count = 0
    weekly_ids: list[str] = []
    monthly_labels: list[str] = []
    for inv in drafts:
        ps = await _parse_date(inv["period_start"])
        pe = await _parse_date(inv["period_end"])
        if is_weekly_invoice_period(ps, pe):
            weekly_count += 1
            weekly_ids.append(inv["id"])
        elif is_monthly_invoice_period(ps, pe):
            monthly_count += 1
            monthly_labels.append(ps.strftime("%B %Y"))
        else:
            other_count += 1

    weekly_package_count = 0
    weekly_dropin_count = 0
    if weekly_ids:
        items = await db.invoice_line_items.find(
            {"invoice_id": {"$in": weekly_ids}},
            {"_id": 0, "invoice_id": 1, "description": 1},
        ).to_list(5000)
        by_inv: dict[str, list[str]] = {}
        for li in items:
            by_inv.setdefault(li["invoice_id"], []).append(li.get("description") or "")
        for inv_id in weekly_ids:
            descs = by_inv.get(inv_id) or []
            if any("Weekly Rate" in d for d in descs):
                weekly_package_count += 1
            elif any("Drop-In Rate" in d for d in descs):
                weekly_dropin_count += 1

    today = date.today()
    week_start, week_end = training_week_mon_fri(today)

    monthly_period_start = None
    monthly_period_end = None
    if monthly_labels:
        month_label = max(set(monthly_labels), key=monthly_labels.count)
        for inv in drafts:
            ps = await _parse_date(inv["period_start"])
            pe = await _parse_date(inv["period_end"])
            if is_monthly_invoice_period(ps, pe) and ps.strftime("%B %Y") == month_label:
                monthly_period_start, monthly_period_end = ps, pe
                break
    else:
        from invoice_auto import is_last_day_of_month
        if is_last_day_of_month(today):
            monthly_period_start, monthly_period_end = next_month_period(today)
        else:
            monthly_period_start, monthly_period_end = month_period_for(today)
        month_label = monthly_period_start.strftime("%B %Y")

    eat_athletes = await db.athletes.find(
        {
            "status": {"$in": [AthleteStatus.active.value, AthleteStatus.pending.value]},
            "$or": [
                {"program_types": ProgramType.full_time.value},
                {"program_type": ProgramType.full_time.value},
            ],
        },
        {"_id": 0, "id": 1, "full_name": 1, "rate_type": 1, "enrollment_tier": 1},
    ).to_list(2000)
    missing_billing = [
        {"id": a["id"], "full_name": a.get("full_name")}
        for a in eat_athletes
        if a.get("rate_type") not in ("weekly", "monthly", "daily")
        or a.get("enrollment_tier") not in ("full_day", "half_day")
    ]

    return {
        "draft_count": len(drafts),
        "weekly_draft_count": weekly_count,
        "weekly_package_draft_count": weekly_package_count,
        "weekly_dropin_draft_count": weekly_dropin_count,
        "monthly_draft_count": monthly_count,
        "other_draft_count": other_count,
        "monthly_period_label": month_label,
        "monthly_period": {
            "start": monthly_period_start.isoformat() if monthly_period_start else None,
            "end": monthly_period_end.isoformat() if monthly_period_end else None,
        },
        "weekly_period": {
            "start": week_start.isoformat(),
            "end": week_end.isoformat(),
        },
        "eat_athletes_missing_billing_count": len(missing_billing),
        "eat_athletes_missing_billing": missing_billing[:10],
    }


@router.get("/discount-presets", response_model=list[DiscountPreset])
async def list_discount_presets():
    from invoice_discounts import list_discount_presets as _list

    return await _list()


@router.post("/discount-presets", response_model=DiscountPreset)
async def create_discount_preset(body: DiscountPresetCreate):
    from invoice_discounts import upsert_discount_preset

    try:
        return await upsert_discount_preset(
            label=body.label,
            discount_type=body.discount_type.value,
            default_value=body.default_value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/discount-presets/{preset_id}", response_model=DiscountPreset)
async def update_discount_preset(preset_id: str, body: DiscountPresetUpdate):
    from invoice_discounts import upsert_discount_preset

    existing = await db.discount_presets.find_one({"id": preset_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Discount preset not found")
    try:
        dt = body.discount_type.value if body.discount_type else existing["discount_type"]
        return await upsert_discount_preset(
            preset_id=preset_id,
            label=body.label or existing["label"],
            discount_type=dt,
            default_value=body.default_value if body.default_value is not None else existing["default_value"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{invoice_id}/discount", response_model=Invoice)
async def update_invoice_discount(invoice_id: str, body: InvoiceDiscountUpdate):
    from invoice_discounts import upsert_discount_preset

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("status") != InvoiceStatus.draft.value:
        raise HTTPException(status_code=400, detail="Discount can only be edited on draft invoices")

    if body.clear:
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "discount_preset_id": None,
                "discount_label": None,
                "discount_type": None,
                "discount_value": None,
            }},
        )
        await _recalc_invoice_totals(invoice_id)
        return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})

    preset_id = body.preset_id
    label = (body.label or "").strip() or None
    discount_type = body.discount_type.value if body.discount_type else None
    discount_value = body.value

    if preset_id:
        preset = await db.discount_presets.find_one({"id": preset_id}, {"_id": 0})
        if not preset:
            raise HTTPException(status_code=404, detail="Discount preset not found")
        label = label or preset["label"]
        discount_type = discount_type or preset["discount_type"]
        if discount_value is None:
            discount_value = preset["default_value"]

    if not label or not discount_type or discount_value is None:
        raise HTTPException(
            status_code=400,
            detail="Provide a preset, or label + type + value for a custom discount",
        )

    if body.save_preset:
        saved = await upsert_discount_preset(
            preset_id=preset_id,
            label=label,
            discount_type=discount_type,
            default_value=discount_value,
        )
        preset_id = saved["id"]

    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "discount_preset_id": preset_id,
            "discount_label": label,
            "discount_type": discount_type,
            "discount_value": round(float(discount_value), 2),
        }},
    )
    await _recalc_invoice_totals(invoice_id)
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@router.get("/ready-to-invoice")
async def ready_to_invoice():
    """Billable completed sessions not yet on any invoice, grouped by family and athlete."""
    from invoice_billing import ready_to_invoice_summary

    return await ready_to_invoice_summary()


def _populate_message(new_items: list, skipped: list[dict]) -> str:
    session_lines = sum(
        1 for li in new_items
        if getattr(li, "attendance_record_id", None) or getattr(li, "attendance_record_ids", None)
    )
    if new_items:
        if session_lines:
            return f"Added {session_lines} session line(s) and {len(new_items)} total item(s)"
        return f"Added {len(new_items)} line item(s) from attendance and rate card"
    not_completed = sum(1 for s in skipped if s.get("reason") == "not_completed")
    no_attendance = sum(1 for s in skipped if s.get("reason") == "no_attendance")
    already = sum(1 for s in skipped if s.get("reason") == "already_invoiced")
    if not_completed:
        return f"No billable attendance — {not_completed} session(s) not marked completed"
    if no_attendance:
        return f"{no_attendance} session(s) in this period have no attendance yet"
    if already:
        return "Some sessions are already on a sent or paid invoice"
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


@router.patch("/{invoice_id}/line-items/{line_item_id}", response_model=InvoiceLineItem)
async def update_invoice_line_item(
    invoice_id: str,
    line_item_id: str,
    body: InvoiceLineItemUpdate,
):
    """Update quantity on a draft invoice line; amount recalculates from unit price."""
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] != InvoiceStatus.draft.value:
        raise HTTPException(400, "Only draft invoices can be edited")

    li = await db.invoice_line_items.find_one(
        {"id": line_item_id, "invoice_id": invoice_id},
        {"_id": 0},
    )
    if not li:
        raise HTTPException(404, "Line item not found")

    athlete = await db.athletes.find_one({"id": li["athlete_id"]}, {"_id": 0, "rate_override": 1})
    override = athlete.get("rate_override") if athlete else None
    if override is not None:
        override = float(override)

    qty = round(float(body.quantity), 2)
    has_attendance = bool(li.get("attendance_record_ids") or li.get("attendance_record_id"))
    from billing import amount_for_line_quantity_change

    amount, unit_price = amount_for_line_quantity_change(
        description=li.get("description") or "",
        old_quantity=float(li["quantity"]),
        new_quantity=qty,
        old_amount=float(li["amount"]),
        unit_price=float(li["unit_price"]),
        rate_override=override,
        has_attendance_records=has_attendance,
    )
    await db.invoice_line_items.update_one(
        {"id": line_item_id},
        {"$set": {"quantity": qty, "amount": amount, "unit_price": unit_price}},
    )
    await _recalc_invoice_totals(invoice_id)
    updated = await db.invoice_line_items.find_one({"id": line_item_id}, {"_id": 0})
    return updated


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


@router.get("/email-preview")
async def preview_sample_invoice_email(kind: str = "due"):
    """Coach-only HTML preview of guardian invoice emails (sample data)."""
    from invoice_send import build_sample_preview_html

    _, html, _ = build_sample_preview_html(kind)
    return Response(content=html, media_type="text/html; charset=utf-8")


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

    period_start = await _parse_date(inv["period_start"])
    period_end = await _parse_date(inv["period_end"])
    paid = inv["status"] == InvoiceStatus.paid.value
    pdf_bytes = render_invoice_pdf(
        invoice_number=inv["invoice_number"],
        issue_date=await _parse_date(inv["issue_date"]),
        period_start=period_start,
        period_end=period_end,
        family_name=family["family_name"],
        guardian_name=family["guardian_name"],
        guardian_email=family["guardian_email"],
        athlete_names=[a["full_name"] for a in athletes],
        line_items=pdf_items,
        subtotal=float(inv["subtotal"]),
        total=float(inv["total"]),
        discount_label=inv.get("discount_label"),
        discount_amount=float(inv.get("discount_amount") or 0),
        payment_date=payment_date,
        payment_method=payment_method,
        paid=paid,
    )
    filename = invoice_pdf_filename(
        invoice_number=inv["invoice_number"],
        period_start=period_start,
        period_end=period_end,
        paid=paid,
    )
    return pdf_bytes, filename, {"invoice": inv, "family": family}


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str):
    pdf_bytes, filename, _ = await _build_pdf(invoice_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": pdf_content_disposition(filename)},
    )


@router.get("/{invoice_id}/email-preview")
async def preview_invoice_email(invoice_id: str, kind: str = "due"):
    """Coach-only HTML preview of the guardian email for this invoice."""
    from invoice_send import build_preview_html

    _, html, _ = await build_preview_html(invoice_id, kind)
    return Response(content=html, media_type="text/html; charset=utf-8")


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
