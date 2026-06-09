"""Auto-create or refresh draft invoices when sessions are completed."""
from __future__ import annotations

import asyncio
import calendar
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from billing import SESSION_TIME_ZONE
from db import db, now, serialize
from models import AttendanceType, Invoice, InvoiceLineItem, InvoiceStatus, ProgramType

logger = logging.getLogger(__name__)

WEEKLY_BATCH_JOB = "weekly_invoices"


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


def training_week_mon_fri(as_of: date) -> Optional[tuple[date, date]]:
    """Mon–Fri of the training week that ended on the most recent Friday."""
    if as_of.weekday() == 5:  # Saturday — week ended yesterday
        friday = as_of - timedelta(days=1)
    elif as_of.weekday() == 6:  # Sunday — same billing week
        friday = as_of - timedelta(days=2)
    else:
        return None
    monday = friday - timedelta(days=4)
    return monday, friday


def prior_mon_fri_period(as_of: date) -> Optional[tuple[date, date]]:
    """Mon–Fri for Saturday auto-batch runs."""
    if as_of.weekday() != 5:
        return None
    return training_week_mon_fri(as_of)


async def _family_has_billable_period(
    family_id: str,
    period_start: date,
    period_end: date,
) -> bool:
    from invoice_billing import _billable_records_for_family, _monthly_athletes_with_attendance

    billable, _, _ = await _billable_records_for_family(
        family_id, period_start, period_end, skip_invoiced=True
    )
    if billable:
        return True
    monthly = await _monthly_athletes_with_attendance(family_id, period_start, period_end)
    return bool(monthly)


async def run_saturday_weekly_batch(
    *,
    as_of: Optional[date] = None,
    force: bool = False,
) -> dict:
    """Create draft invoices for all families with billable Mon–Fri attendance."""
    as_of = as_of or datetime.now(SESSION_TIME_ZONE).date()
    period = prior_mon_fri_period(as_of)
    if not period and not force:
        return {
            "status": "skipped",
            "reason": "not_saturday",
            "as_of": as_of.isoformat(),
        }

    if period:
        period_start, period_end = period
    else:
        # Manual run on a non-Saturday: bill the most recent Mon–Fri week.
        weekday = as_of.weekday()
        friday = as_of - timedelta(days=(weekday - 4) % 7)
        if weekday == 5:
            friday = as_of - timedelta(days=1)
        elif weekday == 6:
            friday = as_of - timedelta(days=2)
        period_start = friday - timedelta(days=4)
        period_end = friday

    run_key = f"{period_start.isoformat()}_{period_end.isoformat()}"
    if not force:
        existing = await db.scheduled_job_runs.find_one(
            {"job": WEEKLY_BATCH_JOB, "period_key": run_key},
            {"_id": 0},
        )
        if existing:
            return {
                "status": "skipped",
                "reason": "already_ran",
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "ran_at": existing.get("ran_at"),
            }

    from routes_invoices import generate_family_period_invoice

    families = await db.families.find({}, {"_id": 0, "id": 1, "family_name": 1}).to_list(500)
    created: list[dict] = []
    skipped_families: list[str] = []
    errors: list[dict] = []

    for fam in families:
        family_id = fam["id"]
        try:
            if not await _family_has_billable_period(family_id, period_start, period_end):
                skipped_families.append(family_id)
                continue
            summary = await generate_family_period_invoice(family_id, period_start, period_end)
            inv = summary.get("invoice") or {}
            if float(inv.get("total") or 0) <= 0 and not summary.get("added"):
                skipped_families.append(family_id)
                continue
            created.append({
                "family_id": family_id,
                "family_name": fam.get("family_name"),
                "invoice_number": inv.get("invoice_number"),
                "total": inv.get("total"),
                "reused_draft": summary.get("reused_draft"),
            })
        except Exception as e:
            logger.exception("Weekly invoice batch failed for family %s", family_id)
            errors.append({"family_id": family_id, "error": str(e)})

    await db.scheduled_job_runs.insert_one(serialize({
        "job": WEEKLY_BATCH_JOB,
        "period_key": run_key,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "ran_at": now().isoformat(),
        "created_count": len(created),
        "skipped_count": len(skipped_families),
        "error_count": len(errors),
    }))

    return {
        "status": "ok",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "created": created,
        "skipped_families": len(skipped_families),
        "errors": errors,
    }


async def _weekly_invoice_scheduler_loop() -> None:
    """Hourly check: on Saturday (Eastern), auto-create Mon–Fri draft invoices."""
    await asyncio.sleep(30)
    while True:
        try:
            today = datetime.now(SESSION_TIME_ZONE).date()
            if today.weekday() == 5:
                result = await run_saturday_weekly_batch(as_of=today)
                if result.get("status") == "ok":
                    logger.info(
                        "Saturday weekly invoices: %s drafts for %s–%s",
                        len(result.get("created") or []),
                        result.get("period_start"),
                        result.get("period_end"),
                    )
        except Exception:
            logger.exception("Weekly invoice scheduler failed")
        await asyncio.sleep(3600)


def start_weekly_invoice_scheduler() -> None:
    asyncio.create_task(_weekly_invoice_scheduler_loop())
