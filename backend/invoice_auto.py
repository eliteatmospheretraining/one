"""Auto-create or refresh draft invoices when sessions are completed."""
from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Optional

from db import db, serialize
from models import AttendanceType, Invoice, InvoiceLineItem, InvoiceStatus, ProgramType

logger = logging.getLogger(__name__)


def month_period_for(session_date: date) -> tuple[date, date]:
    last_day = calendar.monthrange(session_date.year, session_date.month)[1]
    return (
        session_date.replace(day=1),
        session_date.replace(day=last_day),
    )


async def sync_family_draft_invoice(
    family_id: str,
    period_start: date,
    period_end: date,
) -> Optional[dict]:
    """Create or refresh a draft invoice for a family/period. Returns summary or None."""
    from invoice_billing import (
        _billable_records_for_family,
        _monthly_athletes_with_attendance,
        line_items_from_billable,
        monthly_tuition_line_items,
    )
    from routes_invoices import _find_family_draft, _next_invoice_number, _recalc_invoice_totals

    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        return None

    billable, athletes_by_id, sessions_by_id = await _billable_records_for_family(
        family_id, period_start, period_end, skip_invoiced=True
    )
    monthly_attended = await _monthly_athletes_with_attendance(family_id, period_start, period_end)
    if not billable and not monthly_attended:
        return None

    draft = await _find_family_draft(family_id, period_start, period_end)
    created = False

    if draft:
        invoice_id = draft["id"]
        new_items = line_items_from_billable(
            invoice_id, billable, athletes_by_id, sessions_by_id, line_item_cls=InvoiceLineItem
        )
        monthly_items = await monthly_tuition_line_items(
            invoice_id, family_id, period_start, period_end, line_item_cls=InvoiceLineItem
        )
        new_items = new_items + monthly_items
        if new_items:
            await db.invoice_line_items.insert_many([serialize(li.model_dump()) for li in new_items])
        await _recalc_invoice_totals(invoice_id)
        added = len(new_items)
    else:
        invoice_number = await _next_invoice_number()
        invoice = Invoice(
            invoice_number=invoice_number,
            family_id=family_id,
            period_start=period_start,
            period_end=period_end,
            status=InvoiceStatus.draft,
        )
        line_items = line_items_from_billable(
            invoice.id, billable, athletes_by_id, sessions_by_id, line_item_cls=InvoiceLineItem
        )
        monthly_items = await monthly_tuition_line_items(
            invoice.id, family_id, period_start, period_end, line_item_cls=InvoiceLineItem
        )
        line_items = line_items + monthly_items
        invoice.subtotal = round(sum(li.amount for li in line_items), 2)
        invoice.total = invoice.subtotal
        await db.invoices.insert_one(serialize(invoice.model_dump()))
        if line_items:
            await db.invoice_line_items.insert_many([serialize(li.model_dump()) for li in line_items])
        invoice_id = invoice.id
        added = len(line_items)
        created = True

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return None
    return {
        "invoice": inv,
        "added": added,
        "created": created,
        "invoice_number": inv["invoice_number"],
    }


async def auto_sync_invoices_for_session(session_id: str) -> list[dict]:
    """After a completed session has billable attendance, sync draft invoice(s) per family."""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session or session.get("status") != SessionStatus.completed.value:
        return []

    records = await db.attendance_records.find({"session_id": session_id}, {"_id": 0}).to_list(500)
    billable_records = [
        r for r in records
        if r.get("attendance_type") != AttendanceType.absent.value
        and float(r.get("billed_rate") or 0) > 0
    ]
    if not billable_records:
        return []

    athlete_ids = list({r["athlete_id"] for r in billable_records})
    athletes = await db.athletes.find({"id": {"$in": athlete_ids}}, {"_id": 0}).to_list(500)
    family_ids = list({a["family_id"] for a in athletes if a.get("family_id")})
    if not family_ids:
        return []

    session_date = date.fromisoformat(str(session["date"])[:10])
    period_start, period_end = month_period_for(session_date)

    results: list[dict] = []
    for family_id in family_ids:
        try:
            summary = await sync_family_draft_invoice(family_id, period_start, period_end)
            if summary:
                results.append(summary)
        except Exception as e:
            logger.exception(f"Auto-invoice sync failed for family {family_id}: {e}")

    return results
