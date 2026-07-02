"""Shared invoice billing helpers (attendance → line items)."""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta

from billing import (
    SESSION_TIME_ZONE,
    _is_monthly_prepay,
    _is_package_prepay,
    _is_weekly_prepay,
    athlete_on_full_time,
    attendance_is_drop_in,
    billing_program_type,
    describe_line,
    format_invoice_display_date,
    full_time_day_rate_type,
    full_time_flat_rate,
    is_monthly_invoice_period,
    is_weekly_invoice_period,
    monthly_tuition_amount,
    per_session_charge,
    rostered_lesson_bills_on_invoice,
    session_date_from_line_description,
    session_is_billable,
    stored_attendance_type,
    weekly_tuition_amount,
)
from db import db, now, serialize
from models import AttendanceRecord, AttendanceType, AthleteStatus, InvoiceStatus, ProgramType, SessionStatus


def _attendance_ids_from_line_item(item: dict) -> list[str]:
    ids = list(item.get("attendance_record_ids") or [])
    if ids:
        return ids
    rid = item.get("attendance_record_id")
    return [rid] if rid else []


async def _invoiced_attendance_ids() -> set[str]:
    """Attendance record IDs on invoice line items (including grouped lines)."""
    items = await db.invoice_line_items.find(
        {},
        {"attendance_record_id": 1, "attendance_record_ids": 1, "_id": 0},
    ).to_list(20000)
    ids: set[str] = set()
    for item in items:
        ids.update(_attendance_ids_from_line_item(item))
    if not ids:
        return set()
    existing = await db.attendance_records.find(
        {"id": {"$in": list(ids)}},
        {"id": 1, "_id": 0},
    ).to_list(len(ids))
    return {r["id"] for r in existing}


async def _billed_session_athletes_sent_or_paid(family_id: str) -> set[tuple[str, str]]:
    """(session_id, athlete_id) pairs on sent or paid invoices only (drafts still need billing)."""
    pairs: set[tuple[str, str]] = set()
    invs = await db.invoices.find(
        {
            "family_id": family_id,
            "status": {"$in": [InvoiceStatus.sent.value, InvoiceStatus.paid.value]},
        },
        {"id": 1, "_id": 0},
    ).to_list(500)
    inv_ids = [i["id"] for i in invs]
    if not inv_ids:
        return pairs

    items = await db.invoice_line_items.find(
        {"invoice_id": {"$in": inv_ids}},
        {"_id": 0},
    ).to_list(5000)
    if not items:
        return pairs

    athlete_ids = list({li["athlete_id"] for li in items})
    athletes = await db.athletes.find(
        {"id": {"$in": athlete_ids}, "family_id": family_id},
        {"id": 1, "_id": 0},
    ).to_list(500)
    family_athlete_ids = {a["id"] for a in athletes}

    for li in items:
        aid = li["athlete_id"]
        if aid not in family_athlete_ids:
            continue
        record_ids = _attendance_ids_from_line_item(li)
        if record_ids:
            recs = await db.attendance_records.find(
                {"id": {"$in": record_ids}},
                {"session_id": 1, "_id": 0},
            ).to_list(len(record_ids))
            for rec in recs:
                pairs.add((rec["session_id"], aid))
            if recs:
                continue
        sess_iso = session_date_from_line_description(li.get("description") or "")
        if not sess_iso:
            continue
        sess = await db.sessions.find_one(
            {"date": sess_iso, "athlete_ids": aid},
            {"id": 1, "_id": 0},
        )
        if sess:
            pairs.add((sess["id"], aid))
    return pairs


async def _invoiced_attendance_sent_or_paid() -> set[str]:
    """Attendance on sent/paid invoices only."""
    invs = await db.invoices.find(
        {"status": {"$in": [InvoiceStatus.sent.value, InvoiceStatus.paid.value]}},
        {"id": 1, "_id": 0},
    ).to_list(500)
    inv_ids = [i["id"] for i in invs]
    if not inv_ids:
        return set()
    items = await db.invoice_line_items.find(
        {"invoice_id": {"$in": inv_ids}},
        {"attendance_record_id": 1, "attendance_record_ids": 1, "_id": 0},
    ).to_list(20000)
    locked: set[str] = set()
    for item in items:
        locked.update(_attendance_ids_from_line_item(item))
    return locked


async def _billed_session_athletes_for_family(family_id: str) -> set[tuple[str, str]]:
    """(session_id, athlete_id) pairs already on any invoice for this family."""
    pairs: set[tuple[str, str]] = set()
    invs = await db.invoices.find({"family_id": family_id}, {"id": 1, "_id": 0}).to_list(500)
    inv_ids = [i["id"] for i in invs]
    if not inv_ids:
        return pairs

    items = await db.invoice_line_items.find(
        {"invoice_id": {"$in": inv_ids}},
        {"_id": 0},
    ).to_list(5000)
    if not items:
        return pairs

    athlete_ids = list({li["athlete_id"] for li in items})
    athletes = await db.athletes.find(
        {"id": {"$in": athlete_ids}, "family_id": family_id},
        {"id": 1, "_id": 0},
    ).to_list(500)
    family_athlete_ids = {a["id"] for a in athletes}

    for li in items:
        aid = li["athlete_id"]
        if aid not in family_athlete_ids:
            continue
        record_ids = _attendance_ids_from_line_item(li)
        if record_ids:
            recs = await db.attendance_records.find(
                {"id": {"$in": record_ids}},
                {"session_id": 1, "_id": 0},
            ).to_list(len(record_ids))
            for rec in recs:
                pairs.add((rec["session_id"], aid))
            if recs:
                continue
        sess_iso = session_date_from_line_description(li.get("description") or "")
        if not sess_iso:
            continue
        sess = await db.sessions.find_one(
            {"date": sess_iso, "athlete_ids": aid},
            {"id": 1, "_id": 0},
        )
        if sess:
            pairs.add((sess["id"], aid))
    return pairs


async def ensure_rostered_lesson_attendance(session: dict) -> int:
    """Private and semi-private lessons bill rostered athletes as present without manual attendance."""
    if session.get("session_type") not in (
        ProgramType.private.value,
        ProgramType.semi_private.value,
    ):
        return 0
    athlete_ids = list(session.get("athlete_ids") or [])
    if not athlete_ids:
        return 0

    from billing import billing_program_type, compute_billed_rate, resolve_attendance_type, semi_private_lesson_charge

    existing = await db.attendance_records.find(
        {"session_id": session["id"]},
        {"_id": 0},
    ).to_list(500)
    by_athlete = {r["athlete_id"]: r for r in existing}

    new_records: list[dict] = []
    is_semi_private = session.get("session_type") == ProgramType.semi_private.value
    semi_private_charged = False
    for aid in athlete_ids:
        if aid in by_athlete:
            continue
        athlete = await db.athletes.find_one({"id": aid}, {"_id": 0})
        if not athlete:
            continue
        program_type = billing_program_type(athlete, session)
        billing_type = resolve_attendance_type(
            AttendanceType.present,
            program_type=program_type,
            session=session,
        )
        override = athlete.get("rate_override")
        if override is not None:
            override = float(override)
        if is_semi_private:
            if not semi_private_charged:
                rate = semi_private_lesson_charge(session, override)
                semi_private_charged = True
            else:
                rate = 0.0
        else:
            rate = compute_billed_rate(
                billing_type,
                program_type,
                override,
                session=session,
                rate_type=athlete.get("rate_type"),
            )
        rec = AttendanceRecord(
            session_id=session["id"],
            athlete_id=aid,
            attendance_type=billing_type,
            billed_rate=rate,
        )
        new_records.append(serialize(rec.model_dump()))

    if not new_records:
        return 0

    await db.attendance_records.insert_many(new_records)
    await db.sessions.update_one(
        {"id": session["id"]},
        {"$set": {"attendance_logged_at": now().isoformat()}},
    )
    return len(new_records)


async def ensure_rostered_lessons_for_family(
    family_id: str,
    period_start: date,
    period_end: date,
) -> int:
    """Ensure present attendance exists for billable private/semi-private sessions in the period."""
    athletes = await db.athletes.find({"family_id": family_id}, {"id": 1, "_id": 0}).to_list(500)
    athlete_ids = [a["id"] for a in athletes]
    if not athlete_ids:
        return 0

    sessions = await db.sessions.find(
        {
            "date": {"$gte": period_start.isoformat(), "$lte": period_end.isoformat()},
            "session_type": {
                "$in": [ProgramType.private.value, ProgramType.semi_private.value],
            },
            "athlete_ids": {"$in": athlete_ids},
            "status": {"$ne": SessionStatus.cancelled.value},
        },
        {"_id": 0},
    ).to_list(5000)

    created = 0
    now_ts = datetime.now(SESSION_TIME_ZONE)
    for sess in sessions:
        if not session_is_billable(sess, now_ts):
            continue
        created += await ensure_rostered_lesson_attendance(sess)
    return created


# Backwards-compatible alias
ensure_private_session_attendance = ensure_rostered_lesson_attendance
ensure_private_sessions_for_family = ensure_rostered_lessons_for_family


async def relink_invoice_line_items(old_id_by_athlete: dict[str, str], new_id_by_athlete: dict[str, str]) -> int:
    """Point invoice line items at new attendance record IDs after a re-save."""
    updated = 0
    for athlete_id, old_id in old_id_by_athlete.items():
        new_id = new_id_by_athlete.get(athlete_id)
        if not new_id or old_id == new_id:
            continue
        res = await db.invoice_line_items.update_many(
            {"attendance_record_id": old_id},
            {"$set": {"attendance_record_id": new_id}},
        )
        updated += res.modified_count
    return updated


async def _invoice_lock_sets(
    family_id: str,
    *,
    for_invoice_id: str | None = None,
) -> tuple[set[str], set[tuple[str, str]]]:
    """Draft invoice sync only respects sent/paid locks; auto-batch uses all invoices."""
    if for_invoice_id:
        return (
            await _invoiced_attendance_sent_or_paid(),
            await _billed_session_athletes_sent_or_paid(family_id),
        )
    return (
        await _invoiced_attendance_ids(),
        await _billed_session_athletes_for_family(family_id),
    )


async def _recalc_invoice_totals_inline(invoice_id: str) -> None:
    from invoice_discounts import invoice_totals

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return
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


async def _release_draft_attendance_in_period(
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    keep_invoice_id: str,
) -> list[str]:
    """Remove attendance lines from other drafts in this period so sync can own them."""
    start_iso = period_start.isoformat()
    end_iso = period_end.isoformat()
    other_invoices = await db.invoices.find(
        {
            "family_id": family_id,
            "status": InvoiceStatus.draft.value,
            "id": {"$ne": keep_invoice_id},
        },
        {"id": 1, "_id": 0},
    ).to_list(200)
    touched: list[str] = []
    for inv in other_invoices:
        items = await db.invoice_line_items.find(
            {"invoice_id": inv["id"]},
            {"_id": 0},
        ).to_list(2000)
        changed = False
        for li in items:
            record_ids = _attendance_ids_from_line_item(li)
            if not record_ids:
                continue
            recs = await db.attendance_records.find(
                {"id": {"$in": record_ids}},
                {"session_id": 1, "_id": 0},
            ).to_list(len(record_ids))
            if not recs:
                continue
            sess_ids = [r["session_id"] for r in recs]
            in_period = await db.sessions.count_documents({
                "id": {"$in": sess_ids},
                "date": {"$gte": start_iso, "$lte": end_iso},
            })
            if in_period:
                await db.invoice_line_items.delete_one({"id": li["id"]})
                changed = True
        if changed:
            touched.append(inv["id"])
            await _recalc_invoice_totals_inline(inv["id"])
    return touched


async def _locked_attendance_ids(*, exclude_invoice_id: str | None = None) -> set[str]:
    """Attendance already on another invoice (any draft except exclude, or sent/paid)."""
    locked: set[str] = set()
    inv_query: dict = {}
    if exclude_invoice_id:
        inv_query["id"] = {"$ne": exclude_invoice_id}
    invs = await db.invoices.find(inv_query, {"id": 1, "_id": 0}).to_list(500)
    inv_ids = [i["id"] for i in invs]
    if not inv_ids:
        return locked
    items = await db.invoice_line_items.find(
        {"invoice_id": {"$in": inv_ids}},
        {"attendance_record_id": 1, "attendance_record_ids": 1, "_id": 0},
    ).to_list(20000)
    locked: set[str] = set()
    for item in items:
        locked.update(_attendance_ids_from_line_item(item))
    return locked


async def _billed_session_athletes_locked(
    family_id: str,
    *,
    exclude_invoice_id: str | None = None,
) -> set[tuple[str, str]]:
    """Session+athlete pairs billed on sent/paid invoices, or on a different draft."""
    pairs: set[tuple[str, str]] = set()
    inv_query: dict = {"family_id": family_id}
    if exclude_invoice_id:
        inv_query["id"] = {"$ne": exclude_invoice_id}
    invs = await db.invoices.find(inv_query, {"id": 1, "status": 1, "_id": 0}).to_list(500)
    if not invs:
        return pairs
    inv_ids = [i["id"] for i in invs]
    items = await db.invoice_line_items.find(
        {"invoice_id": {"$in": inv_ids}},
        {"_id": 0},
    ).to_list(5000)
    if not items:
        return pairs

    athlete_ids = list({li["athlete_id"] for li in items})
    athletes = await db.athletes.find(
        {"id": {"$in": athlete_ids}, "family_id": family_id},
        {"id": 1, "_id": 0},
    ).to_list(500)
    family_athlete_ids = {a["id"] for a in athletes}
    inv_status = {i["id"]: i["status"] for i in invs}

    for li in items:
        aid = li["athlete_id"]
        if aid not in family_athlete_ids:
            continue
        inv_id = li["invoice_id"]
        status = inv_status.get(inv_id, "")
        if status not in (InvoiceStatus.paid.value, InvoiceStatus.sent.value, InvoiceStatus.draft.value):
            continue
        record_ids = _attendance_ids_from_line_item(li)
        if record_ids:
            recs = await db.attendance_records.find(
                {"id": {"$in": record_ids}},
                {"session_id": 1, "_id": 0},
            ).to_list(len(record_ids))
            for rec in recs:
                pairs.add((rec["session_id"], aid))
            if recs:
                continue
        sess_iso = session_date_from_line_description(li.get("description") or "")
        if not sess_iso:
            continue
        sess = await db.sessions.find_one(
            {"date": sess_iso, "athlete_ids": aid},
            {"id": 1, "_id": 0},
        )
        if sess:
            pairs.add((sess["id"], aid))
    return pairs


async def _billable_records_for_family(
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    skip_invoiced: bool = True,
    for_invoice_id: str | None = None,
) -> tuple[list[dict], dict, dict]:
    """Billable attendance on completed sessions in period (not yet invoiced)."""
    athletes = await db.athletes.find({"family_id": family_id}, {"_id": 0}).to_list(500)
    if not athletes:
        return [], {}, {}
    athlete_ids = [a["id"] for a in athletes]
    athletes_by_id = {a["id"]: a for a in athletes}

    sessions = await db.sessions.find(
        {
            "date": {
                "$gte": period_start.isoformat(),
                "$lte": period_end.isoformat(),
            },
            "athlete_ids": {"$in": athlete_ids},
            "status": {
                "$in": [
                    SessionStatus.completed.value,
                    SessionStatus.scheduled.value,
                    SessionStatus.rescheduled.value,
                ]
            },
        },
        {"_id": 0},
    ).to_list(5000)
    sessions = [s for s in sessions if session_is_billable(s)]
    sessions_by_id = {s["id"]: s for s in sessions}
    session_ids = list(sessions_by_id.keys())

    if not session_ids:
        return [], athletes_by_id, sessions_by_id

    records = await db.attendance_records.find(
        {"session_id": {"$in": session_ids}, "athlete_id": {"$in": athlete_ids}},
        {"_id": 0},
    ).to_list(5000)

    if skip_invoiced:
        locked, billed_pairs = await _invoice_lock_sets(
            family_id, for_invoice_id=for_invoice_id
        )
    else:
        locked = set()
        billed_pairs = set()

    billable = []
    for r in records:
        if r["attendance_type"] == AttendanceType.absent.value:
            continue
        if r["id"] in locked:
            continue
        if (r["session_id"], r["athlete_id"]) in billed_pairs:
            continue
        athlete = athletes_by_id.get(r["athlete_id"])
        sess = sessions_by_id.get(r["session_id"])
        if athlete and sess:
            if (
                not for_invoice_id
                and not rostered_lesson_bills_on_invoice(athlete, sess, period_start, period_end)
            ):
                continue
            pt = billing_program_type(athlete, sess)
            if (
                pt == ProgramType.full_time
                and _is_package_prepay(athlete.get("rate_type"))
                and not attendance_is_drop_in(r.get("attendance_type"))
            ):
                continue
        billable.append(r)
    billable.sort(key=lambda r: (r["athlete_id"], sessions_by_id[r["session_id"]]["date"]))
    return billable, athletes_by_id, sessions_by_id


async def _invoice_ref_for_attendance(
    attendance_id: str,
    *,
    exclude_invoice_id: str | None = None,
) -> str | None:
    query: dict = {
        "$or": [
            {"attendance_record_id": attendance_id},
            {"attendance_record_ids": attendance_id},
        ]
    }
    if exclude_invoice_id:
        query["invoice_id"] = {"$ne": exclude_invoice_id}
    li = await db.invoice_line_items.find_one(query, {"invoice_id": 1, "_id": 0})
    if not li:
        return None
    inv = await db.invoices.find_one({"id": li["invoice_id"]}, {"invoice_number": 1, "_id": 0})
    return inv.get("invoice_number") if inv else None


async def billing_skips_for_period(
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    for_invoice_id: str | None = None,
) -> list[dict]:
    """Completed sessions in period with attendance that will not appear on refresh."""
    athletes = await db.athletes.find(
        {"family_id": family_id},
        {"_id": 0, "id": 1, "full_name": 1, "rate_type": 1},
    ).to_list(500)
    if not athletes:
        return []
    athlete_ids = {a["id"] for a in athletes}
    athletes_by_id = {a["id"]: a for a in athletes}

    billable, _, sessions_by_id = await _billable_records_for_family(
        family_id,
        period_start,
        period_end,
        skip_invoiced=True,
        for_invoice_id=for_invoice_id,
    )
    billable_keys = {(r["session_id"], r["athlete_id"]) for r in billable}

    locked, billed_pairs = await _invoice_lock_sets(
        family_id, for_invoice_id=for_invoice_id
    )

    sessions = await db.sessions.find(
        {
            "date": {
                "$gte": period_start.isoformat(),
                "$lte": period_end.isoformat(),
            },
            "athlete_ids": {"$in": list(athlete_ids)},
        },
        {"_id": 0},
    ).to_list(5000)

    records = await db.attendance_records.find(
        {
            "session_id": {"$in": [s["id"] for s in sessions]},
            "athlete_id": {"$in": list(athlete_ids)},
        },
        {"_id": 0},
    ).to_list(5000)
    records_by_key = {(r["session_id"], r["athlete_id"]): r for r in records}

    skips: list[dict] = []
    for sess in sorted(sessions, key=lambda s: s["date"]):
        for aid in sess.get("athlete_ids") or []:
            if aid not in athlete_ids:
                continue
            key = (sess["id"], aid)
            if key in billable_keys:
                continue
            display_date = format_invoice_display_date(sess["date"])
            base = {
                "date": sess["date"],
                "display_date": display_date,
                "athlete_name": athletes_by_id.get(aid, {}).get("full_name", ""),
            }
            if not session_is_billable(sess):
                skips.append({**base, "reason": "not_completed"})
                continue
            rec = records_by_key.get(key)
            if not rec:
                skips.append({**base, "reason": "no_attendance"})
                continue
            if rec["attendance_type"] == AttendanceType.absent.value:
                skips.append({**base, "reason": "absent"})
                continue
            if rec["id"] in locked:
                inv_no = await _invoice_ref_for_attendance(
                    rec["id"], exclude_invoice_id=for_invoice_id
                )
                skips.append({
                    **base,
                    "reason": "already_invoiced",
                    "invoice_number": inv_no,
                })
                continue
            if key in billed_pairs:
                skips.append({**base, "reason": "already_invoiced", "invoice_number": None})
                continue
            athlete = athletes_by_id.get(aid, {})
            if (
                sess.get("session_type") == ProgramType.full_time.value
                and _is_package_prepay(athlete.get("rate_type"))
                and not attendance_is_drop_in(rec.get("attendance_type"))
            ):
                reason = "weekly_package" if _is_weekly_prepay(athlete.get("rate_type")) else "monthly_package"
                skips.append({**base, "reason": reason})
                continue
            if (
                not for_invoice_id
                and not rostered_lesson_bills_on_invoice(athlete, sess, period_start, period_end)
            ):
                if _is_monthly_prepay(athlete.get("rate_type")):
                    skips.append({**base, "reason": "monthly_invoice_only"})
                elif _is_weekly_prepay(athlete.get("rate_type")):
                    skips.append({**base, "reason": "weekly_invoice_only"})
                else:
                    skips.append({**base, "reason": "wrong_invoice_period"})
                continue
            skips.append({**base, "reason": "excluded"})
    return skips


def _is_full_time_day_block(athlete: dict, sess: dict, record: dict) -> bool:
    if sess.get("session_type") != ProgramType.full_time.value:
        return False
    if not athlete_on_full_time(athlete):
        return False
    at = record.get("attendance_type")
    if at == AttendanceType.absent.value:
        return False
    if at in (AttendanceType.drop_in_full.value, AttendanceType.drop_in_half.value):
        return False
    return True


def _semi_private_line_items(
    invoice_id: str,
    billable: list[dict],
    athletes_by_id: dict,
    sessions_by_id: dict,
    *,
    line_item_cls,
) -> list:
    """One invoice line per semi-private session; athlete names from session roster."""
    records_by_session: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in billable:
        sess = sessions_by_id.get(r["session_id"])
        if not sess or sess.get("session_type") != ProgramType.semi_private.value:
            continue
        records_by_session[r["session_id"]][r["athlete_id"]] = r

    items = []
    for session_id in sorted(
        records_by_session.keys(),
        key=lambda sid: (sessions_by_id[sid]["date"], sid),
    ):
        sess = sessions_by_id[session_id]
        session_records = records_by_session[session_id]
        roster_ids = [aid for aid in (sess.get("athlete_ids") or []) if aid in athletes_by_id]
        if not roster_ids:
            roster_ids = sorted(
                session_records.keys(),
                key=lambda aid: athletes_by_id[aid]["full_name"].casefold(),
            )
        roster_order = {aid: idx for idx, aid in enumerate(sess.get("athlete_ids") or [])}
        athletes = sorted(
            [athletes_by_id[aid] for aid in roster_ids],
            key=lambda a: (roster_order.get(a["id"], 999), a["full_name"].casefold()),
        )
        names = " + ".join(a["full_name"] for a in athletes)
        record_ids: list[str] = []
        for athlete in athletes:
            r = session_records.get(athlete["id"])
            if r:
                record_ids.append(r["id"])
        if not record_ids:
            continue
        override = None
        for athlete in athletes:
            if athlete.get("rate_override") is not None:
                override = float(athlete["rate_override"])
                break
        from billing import semi_private_lesson_charge

        total = round(semi_private_lesson_charge(sess, override), 2)
        items.append(line_item_cls(
            invoice_id=invoice_id,
            athlete_id=athletes[0]["id"],
            athlete_name=names,
            attendance_record_id=record_ids[0],
            attendance_record_ids=record_ids,
            description=describe_line(AttendanceType.full, ProgramType.semi_private),
            quantity=1.0,
            unit_price=total,
            amount=total,
        ))
    return items


def line_items_from_billable(
    invoice_id: str,
    billable: list[dict],
    athletes_by_id: dict,
    sessions_by_id: dict,
    *,
    line_item_cls,
):
    """Build line items.

    Eat w/ EAT enrolled athletes: same calendar day with both AM + PM blocks → one full-day
    line; one block → half-day. Other programs bill per session as before.
    """
    day_blocks: dict[tuple[str, str], list[tuple[dict, dict, dict]]] = defaultdict(list)
    per_session_rows: list[tuple[dict, dict, dict]] = []

    for r in billable:
        athlete = athletes_by_id[r["athlete_id"]]
        sess = sessions_by_id[r["session_id"]]
        if sess.get("session_type") == ProgramType.semi_private.value:
            continue
        if _is_full_time_day_block(athlete, sess, r):
            day_blocks[(r["athlete_id"], sess["date"])].append((r, athlete, sess))
        else:
            per_session_rows.append((r, athlete, sess))

    items = []
    ft_groups: dict[tuple[str, str, float], list[list[str]]] = defaultdict(list)
    for (athlete_id, session_date), rows in sorted(day_blocks.items(), key=lambda x: (x[0][1], x[0][0])):
        athlete = rows[0][1]
        day_at = full_time_day_rate_type(len(rows))
        override = athlete.get("rate_override")
        if override is not None:
            override = float(override)
        unit_price = full_time_flat_rate(day_at, override)
        record_ids = [row[0]["id"] for row in rows]
        ft_groups[(athlete_id, day_at.value, unit_price)].append(record_ids)

    for (athlete_id, at_value, unit_price), day_record_lists in sorted(
        ft_groups.items(), key=lambda x: (x[0][0], x[0][1])
    ):
        athlete = athletes_by_id[athlete_id]
        day_at = AttendanceType(at_value)
        count = len(day_record_lists)
        record_ids = [rid for day_ids in day_record_lists for rid in day_ids]
        desc = describe_line(day_at, ProgramType.full_time, session_count=count)
        items.append(line_item_cls(
            invoice_id=invoice_id,
            athlete_id=athlete_id,
            athlete_name=athlete["full_name"],
            attendance_record_id=record_ids[0],
            attendance_record_ids=record_ids,
            description=desc,
            quantity=float(count),
            unit_price=unit_price,
            amount=round(unit_price * count, 2),
        ))

    groups: dict[tuple[str, str, str, float], list[tuple[dict, dict, dict, float]]] = defaultdict(list)
    for r, athlete, sess in per_session_rows:
        if sess.get("session_type") == ProgramType.semi_private.value:
            continue
        at = stored_attendance_type(r["attendance_type"], athlete=athlete, session=sess)
        pt = billing_program_type(athlete, sess)
        override = athlete.get("rate_override")
        if override is not None:
            override = float(override)
        per_session, _, _ = per_session_charge(
            at,
            pt,
            override,
            session=sess,
            rate_type=athlete.get("rate_type"),
        )
        groups[(r["athlete_id"], pt.value, at.value, per_session)].append((r, athlete, sess, per_session))

    items.extend(_semi_private_line_items(
        invoice_id,
        billable,
        athletes_by_id,
        sessions_by_id,
        line_item_cls=line_item_cls,
    ))

    for rows in groups.values():
        r0, athlete, sess0, unit_price = rows[0]
        if sess0.get("session_type") == ProgramType.semi_private.value:
            continue
        at = stored_attendance_type(r0["attendance_type"], athlete=athlete, session=sess0)
        pt = billing_program_type(athlete, sess0)
        count = len(rows)
        record_ids = [row[0]["id"] for row in rows]
        desc = describe_line(at, pt, session_count=count)
        items.append(line_item_cls(
            invoice_id=invoice_id,
            athlete_id=athlete["id"],
            athlete_name=athlete["full_name"],
            attendance_record_id=record_ids[0],
            attendance_record_ids=record_ids,
            description=desc,
            quantity=float(count),
            unit_price=unit_price,
            amount=round(unit_price * count, 2),
        ))
    return [item for item in items if float(item.amount) > 0]


async def _athletes_with_package_line(invoice_id: str, label: str) -> set[str]:
    """Athlete IDs that already have a package tuition line on this invoice."""
    items = await db.invoice_line_items.find(
        {"invoice_id": invoice_id},
        {"athlete_id": 1, "description": 1, "attendance_record_id": 1, "attendance_record_ids": 1, "_id": 0},
    ).to_list(500)
    out: set[str] = set()
    for li in items:
        if _attendance_ids_from_line_item(li):
            continue
        if label in (li.get("description") or ""):
            out.add(li["athlete_id"])
    return out


async def _athletes_with_monthly_line(invoice_id: str) -> set[str]:
    return await _athletes_with_package_line(invoice_id, "Monthly Rate")


async def _athletes_with_weekly_line(invoice_id: str) -> set[str]:
    return await _athletes_with_package_line(invoice_id, "Weekly Rate")


async def _athletes_with_attendance_in_period(
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    rate_check,
    require_attendance: bool = True,
) -> list[dict]:
    """Package-prepay athletes in a family, optionally requiring attendance in period."""
    athletes = await db.athletes.find({"family_id": family_id}, {"_id": 0}).to_list(500)
    package_athletes = []
    for a in athletes:
        if not rate_check(a.get("rate_type")):
            continue
        if not require_attendance and a.get("status") not in (
            AthleteStatus.active.value,
            AthleteStatus.pending.value,
        ):
            continue
        program_types = a.get("program_types") or []
        if program_types:
            if ProgramType.full_time.value not in program_types:
                continue
        elif a.get("program_type") != ProgramType.full_time.value:
            continue
        package_athletes.append(a)
    if not package_athletes:
        return []
    if not require_attendance:
        return package_athletes

    athlete_ids = {a["id"] for a in package_athletes}
    sessions = await db.sessions.find(
        {
            "date": {"$gte": period_start.isoformat(), "$lte": period_end.isoformat()},
            "status": {
                "$in": [
                    SessionStatus.completed.value,
                    SessionStatus.scheduled.value,
                ]
            },
            "session_type": ProgramType.full_time.value,
        },
        {"_id": 0},
    ).to_list(5000)
    sessions = [s for s in sessions if session_is_billable(s)]
    if not sessions:
        return []

    records = await db.attendance_records.find(
        {
            "session_id": {"$in": [s["id"] for s in sessions]},
            "athlete_id": {"$in": list(athlete_ids)},
            "attendance_type": {"$ne": AttendanceType.absent.value},
        },
        {"_id": 0},
    ).to_list(5000)
    attended = {r["athlete_id"] for r in records}
    return [a for a in package_athletes if a["id"] in attended]


async def _monthly_athletes_with_attendance(
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    require_attendance: bool = True,
) -> list[dict]:
    """Monthly-prepay athletes for billing in a calendar-month period."""
    if not is_monthly_invoice_period(period_start, period_end):
        return []
    return await _athletes_with_attendance_in_period(
        family_id,
        period_start,
        period_end,
        rate_check=_is_monthly_prepay,
        require_attendance=require_attendance,
    )


async def _weekly_athletes_with_attendance(
    family_id: str,
    period_start: date,
    period_end: date,
) -> list[dict]:
    """Weekly-prepay athletes with billable attendance on completed sessions in period."""
    if not is_weekly_invoice_period(period_start, period_end):
        return []
    return await _athletes_with_attendance_in_period(
        family_id, period_start, period_end, rate_check=_is_weekly_prepay
    )


async def monthly_tuition_line_items(
    invoice_id: str,
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    line_item_cls,
    require_attendance: bool = True,
) -> list:
    """Auto-add monthly package lines for prepay athletes who trained in the period."""
    from invoice_services import build_manual_line_item

    already = await _athletes_with_monthly_line(invoice_id)
    candidates = await _monthly_athletes_with_attendance(
        family_id,
        period_start,
        period_end,
        require_attendance=require_attendance,
    )
    items = []
    for athlete in candidates:
        if athlete["id"] in already:
            continue
        price = monthly_tuition_amount(athlete)
        items.append(
            build_manual_line_item(
                invoice_id=invoice_id,
                athlete=athlete,
                service_id="eat_monthly",
                period_start=period_start,
                period_end=period_end,
                unit_price=price,
            )
        )
        already.add(athlete["id"])
    return items


async def weekly_tuition_line_items(
    invoice_id: str,
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    line_item_cls,
) -> list:
    """Auto-add weekly package lines for prepay athletes who trained in the period."""
    from invoice_services import build_manual_line_item

    already = await _athletes_with_weekly_line(invoice_id)
    candidates = await _weekly_athletes_with_attendance(family_id, period_start, period_end)
    items = []
    for athlete in candidates:
        if athlete["id"] in already:
            continue
        price = weekly_tuition_amount(athlete)
        items.append(
            build_manual_line_item(
                invoice_id=invoice_id,
                athlete=athlete,
                service_id="eat_weekly",
                period_start=period_start,
                period_end=period_end,
                week_start=period_start,
                week_end=period_end,
                unit_price=price,
            )
        )
        already.add(athlete["id"])
    return items


async def package_tuition_line_items(
    invoice_id: str,
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    line_item_cls,
    require_monthly_attendance: bool = True,
) -> list:
    """Monthly and/or weekly package lines for the invoice period."""
    monthly_items = await monthly_tuition_line_items(
        invoice_id,
        family_id,
        period_start,
        period_end,
        line_item_cls=line_item_cls,
        require_attendance=require_monthly_attendance,
    )
    weekly_items = await weekly_tuition_line_items(
        invoice_id, family_id, period_start, period_end, line_item_cls=line_item_cls
    )
    return monthly_items + weekly_items


async def auto_complete_family_sessions_in_period(
    family_id: str,
    period_start: date,
    period_end: date,
) -> int:
    """Mark past sessions with attendance as completed so invoice generation can bill them."""
    athletes = await db.athletes.find({"family_id": family_id}, {"id": 1, "_id": 0}).to_list(500)
    athlete_ids = [a["id"] for a in athletes]
    if not athlete_ids:
        return 0

    sessions = await db.sessions.find(
        {
            "date": {"$gte": period_start.isoformat(), "$lte": period_end.isoformat()},
            "status": {"$nin": [SessionStatus.completed.value, SessionStatus.cancelled.value]},
            "athlete_ids": {"$in": athlete_ids},
        },
        {"_id": 0},
    ).to_list(5000)

    now = datetime.now(SESSION_TIME_ZONE)
    completed = 0
    for sess in sessions:
        if sess.get("session_type") in (ProgramType.private.value, ProgramType.semi_private.value):
            if not sess.get("athlete_ids"):
                continue
            if not session_is_billable(sess, now):
                continue
            await ensure_rostered_lesson_attendance(sess)
            if sess.get("status") != SessionStatus.completed.value:
                await db.sessions.update_one(
                    {"id": sess["id"]},
                    {"$set": {"status": SessionStatus.completed.value}},
                )
                completed += 1
            continue
        has_attendance = await db.attendance_records.count_documents({"session_id": sess["id"]}) > 0
        if not has_attendance:
            continue
        if not session_is_billable(sess, now):
            continue
        await db.sessions.update_one(
            {"id": sess["id"]},
            {"$set": {"status": SessionStatus.completed.value}},
        )
        completed += 1
    return completed


async def populate_draft_from_attendance(
    invoice_id: str,
    family_id: str,
    period_start: date,
    period_end: date,
    *,
    line_item_cls,
    replace_attendance_lines: bool = False,
    require_monthly_attendance: bool = True,
) -> tuple[list, list, int]:
    """Add attendance + package tuition lines. Returns (all_new_items, skipped, session_count)."""
    await auto_complete_family_sessions_in_period(family_id, period_start, period_end)
    await ensure_rostered_lessons_for_family(family_id, period_start, period_end)

    if replace_attendance_lines:
        await _release_draft_attendance_in_period(
            family_id,
            period_start,
            period_end,
            keep_invoice_id=invoice_id,
        )
        await db.invoice_line_items.delete_many({
            "invoice_id": invoice_id,
            "$or": [
                {"attendance_record_id": {"$exists": True, "$ne": None}},
                {"attendance_record_ids.0": {"$exists": True}},
            ],
        })

    billable, athletes_by_id, sessions_by_id = await _billable_records_for_family(
        family_id,
        period_start,
        period_end,
        skip_invoiced=True,
        for_invoice_id=invoice_id,
    )

    attendance_items = []
    if billable:
        await sync_attendance_billed_rates(billable, athletes_by_id, sessions_by_id)
        attendance_items = line_items_from_billable(
            invoice_id,
            billable,
            athletes_by_id,
            sessions_by_id,
            line_item_cls=line_item_cls,
        )

    monthly_items = await package_tuition_line_items(
        invoice_id,
        family_id,
        period_start,
        period_end,
        line_item_cls=line_item_cls,
        require_monthly_attendance=require_monthly_attendance,
    )

    new_items = attendance_items + monthly_items
    if new_items:
        await db.invoice_line_items.insert_many(
            [serialize(li.model_dump()) for li in new_items]
        )

    skipped = await billing_skips_for_period(
        family_id,
        period_start,
        period_end,
        for_invoice_id=invoice_id,
    )
    session_count = sum(int(li.quantity or 1) for li in attendance_items)
    return new_items, skipped, session_count


async def sync_attendance_billed_rates(billable: list[dict], athletes_by_id: dict, sessions_by_id: dict) -> None:
    """Keep attendance billed_rate in sync with current billing rules."""
    from billing import billing_program_type, compute_billed_rate, semi_private_lesson_charge

    semi_private_charged: set[str] = set()

    for r in billable:
        athlete = athletes_by_id[r["athlete_id"]]
        sess = sessions_by_id[r["session_id"]]
        at = stored_attendance_type(r["attendance_type"], athlete=athlete, session=sess)
        pt = billing_program_type(athlete, sess)
        override = athlete.get("rate_override")
        if override is not None:
            override = float(override)
        if sess.get("session_type") == ProgramType.semi_private.value:
            if r["session_id"] in semi_private_charged:
                amount = 0.0
            else:
                amount = semi_private_lesson_charge(sess, override)
                semi_private_charged.add(r["session_id"])
        else:
            amount = compute_billed_rate(
                at,
                pt,
                override,
                session=sess,
                rate_type=athlete.get("rate_type"),
            )
        await db.attendance_records.update_one(
            {"id": r["id"]},
            {"$set": {"billed_rate": amount}},
        )


async def billing_status_for_session(session_id: str) -> list[dict]:
    """Invoices that include this session's attendance (for coach UI)."""
    records = await db.attendance_records.find({"session_id": session_id}, {"_id": 0}).to_list(100)
    if not records:
        return []

    record_ids = {r["id"] for r in records}
    athlete_ids = list({r["athlete_id"] for r in records})
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0, "date": 1})
    session_date = session.get("date") if session else None

    or_clauses: list[dict] = [{"attendance_record_id": {"$in": list(record_ids)}}]
    if session_date:
        display_pat = re.escape(f"({format_invoice_display_date(session_date)})")
        legacy_pat = re.escape(f"({session_date})")
        for aid in athlete_ids:
            or_clauses.append({
                "athlete_id": aid,
                "description": {"$regex": display_pat},
            })
            or_clauses.append({
                "athlete_id": aid,
                "description": {"$regex": legacy_pat},
            })

    items = await db.invoice_line_items.find({"$or": or_clauses}, {"_id": 0}).to_list(100)

    seen: set[str] = set()
    out: list[dict] = []
    for li in items:
        inv_id = li["invoice_id"]
        if inv_id in seen:
            continue
        inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0, "invoice_number": 1, "status": 1})
        if not inv:
            continue
        seen.add(inv_id)
        out.append({
            "invoice_id": inv_id,
            "invoice_number": inv["invoice_number"],
            "status": inv["status"],
            "amount": li.get("amount"),
            "description": li.get("description"),
        })
    return out


async def ready_to_invoice_summary() -> dict:
    """Families with uninvoiced billable attendance for the last completed Mon–Fri week."""
    from invoice_auto import training_week_mon_fri

    today = datetime.now(SESSION_TIME_ZONE).date()
    period_start, period_end = training_week_mon_fri(today)
    billing_week = {
        "start": period_start.isoformat(),
        "end": period_end.isoformat(),
    }

    families = await db.families.find({}, {"_id": 0, "id": 1, "family_name": 1}).to_list(500)
    fam_by_id = {f["id"]: f for f in families}
    athletes = await db.athletes.find(
        {"status": {"$in": ["active", "pending"]}},
        {"_id": 0},
    ).to_list(2000)
    athletes_by_id = {a["id"]: a for a in athletes}
    athlete_family: dict[str, str] = {
        a["id"]: a["family_id"] for a in athletes if a.get("family_id")
    }

    family_billed: dict[str, set[tuple[str, str]]] = {}
    for fam in families:
        family_billed[fam["id"]] = await _billed_session_athletes_sent_or_paid(fam["id"])

    locked = await _invoiced_attendance_sent_or_paid()

    sessions = await db.sessions.find(
        {
            "date": {"$gte": period_start.isoformat(), "$lte": period_end.isoformat()},
            "status": {
                "$in": [
                    SessionStatus.completed.value,
                    SessionStatus.scheduled.value,
                ]
            },
        },
        {"_id": 0},
    ).to_list(10000)
    sessions = [s for s in sessions if session_is_billable(s)]
    sessions_by_id = {s["id"]: s for s in sessions}
    if not sessions_by_id:
        return {
            "visible": True,
            "billing_week": billing_week,
            "total_sessions": 0,
            "total_families": 0,
            "families": [],
        }

    records = await db.attendance_records.find(
        {"session_id": {"$in": list(sessions_by_id.keys())}},
        {"_id": 0},
    ).to_list(20000)

    # family_id -> athlete_id -> {session_ids, dates}
    grouped: dict[str, dict[str, dict]] = defaultdict(
        lambda: defaultdict(lambda: {"session_ids": set(), "dates": set()})
    )
    all_session_ids: set[str] = set()

    for r in records:
        if r.get("attendance_type") == AttendanceType.absent.value:
            continue
        if r["id"] in locked:
            continue
        aid = r["athlete_id"]
        fid = athlete_family.get(aid)
        if not fid or fid not in fam_by_id:
            continue
        sid = r["session_id"]
        if (sid, aid) in family_billed.get(fid, set()):
            continue
        sess = sessions_by_id.get(sid)
        if not sess:
            continue

        grouped[fid][aid]["session_ids"].add(sid)
        grouped[fid][aid]["dates"].add(sess["date"])
        all_session_ids.add(sid)

    family_rows: list[dict] = []
    for fid, by_athlete in grouped.items():
        fam = fam_by_id[fid]
        family_session_ids: set[str] = set()
        athlete_rows: list[dict] = []

        for aid, data in by_athlete.items():
            athlete = athletes_by_id.get(aid)
            if not athlete:
                continue
            family_session_ids.update(data["session_ids"])
            dates = sorted(data["dates"])
            monthly = _is_monthly_prepay(athlete.get("rate_type"))
            weekly = _is_weekly_prepay(athlete.get("rate_type"))
            full_time = athlete_on_full_time(athlete)
            day_count = len(dates)
            session_count = len(data["session_ids"])

            if monthly:
                unit_label = "training day" if day_count == 1 else "training days"
                detail = f"{day_count} {unit_label} · monthly rate"
            elif weekly:
                unit_label = "training day" if day_count == 1 else "training days"
                detail = f"{day_count} {unit_label} · weekly rate"
            elif full_time:
                unit_label = "training day" if day_count == 1 else "training days"
                detail = f"{day_count} {unit_label}"
            else:
                unit_label = "session" if session_count == 1 else "sessions"
                detail = f"{session_count} {unit_label}"

            athlete_rows.append({
                "athlete_id": aid,
                "athlete_name": athlete.get("full_name") or "Athlete",
                "session_count": session_count,
                "training_days": day_count,
                "detail": detail,
                "date_start": dates[0] if dates else None,
                "date_end": dates[-1] if dates else None,
                "rate_type": athlete.get("rate_type"),
                "program_types": athlete.get("program_types") or [],
            })

        if not athlete_rows:
            continue

        athlete_rows.sort(key=lambda a: (-a["session_count"], a["athlete_name"]))
        family_rows.append({
            "family_id": fid,
            "family_name": fam.get("family_name") or "Family",
            "session_count": len(family_session_ids),
            "athletes": athlete_rows,
            "period_start": billing_week["start"],
            "period_end": billing_week["end"],
        })

    family_rows.sort(key=lambda f: (-f["session_count"], f["family_name"]))

    return {
        "visible": True,
        "billing_week": billing_week,
        "total_sessions": len(all_session_ids),
        "total_families": len(family_rows),
        "families": family_rows,
    }
