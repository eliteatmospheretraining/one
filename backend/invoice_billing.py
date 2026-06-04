"""Shared invoice billing helpers (attendance → line items)."""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime

from billing import (
    billing_program_type,
    describe_line,
    format_invoice_display_date,
    per_session_charge,
    session_date_from_line_description,
)
from db import db
from models import AttendanceType, InvoiceStatus, ProgramType, SessionStatus


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
            "status": SessionStatus.completed.value,
        },
        {"_id": 0},
    ).to_list(5000)
    sessions_by_id = {s["id"]: s for s in sessions}
    session_ids = list(sessions_by_id.keys())

    if not session_ids:
        return [], athletes_by_id, sessions_by_id

    records = await db.attendance_records.find(
        {"session_id": {"$in": session_ids}, "athlete_id": {"$in": athlete_ids}},
        {"_id": 0},
    ).to_list(5000)

    if skip_invoiced and for_invoice_id:
        locked = await _locked_attendance_ids(exclude_invoice_id=for_invoice_id)
        billed_pairs = await _billed_session_athletes_locked(
            family_id, exclude_invoice_id=for_invoice_id
        )
    elif skip_invoiced:
        locked = await _invoiced_attendance_ids()
        billed_pairs = await _billed_session_athletes_for_family(family_id)
    else:
        locked = set()
        billed_pairs = set()

    billable = [
        r for r in records
        if r["attendance_type"] != AttendanceType.absent.value
        and r["id"] not in locked
        and (r["session_id"], r["athlete_id"]) not in billed_pairs
    ]
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

    if for_invoice_id:
        locked = await _locked_attendance_ids(exclude_invoice_id=for_invoice_id)
        billed_pairs = await _billed_session_athletes_locked(
            family_id, exclude_invoice_id=for_invoice_id
        )
    else:
        locked = await _invoiced_attendance_ids()
        billed_pairs = await _billed_session_athletes_for_family(family_id)

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
            if sess.get("status") != SessionStatus.completed.value:
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
            skips.append({**base, "reason": "excluded"})
    return skips


def line_items_from_billable(
    invoice_id: str,
    billable: list[dict],
    athletes_by_id: dict,
    sessions_by_id: dict,
    *,
    line_item_cls,
):
    """Build line items; group same athlete + attendance type + per-session rate (qty = session count)."""
    groups: dict[tuple[str, str, float], list[tuple[dict, dict, dict, float, float | None, float | None]]] = defaultdict(list)

    for r in billable:
        athlete = athletes_by_id[r["athlete_id"]]
        sess = sessions_by_id[r["session_id"]]
        at = AttendanceType(r["attendance_type"])
        pt = billing_program_type(athlete, sess)
        override = athlete.get("rate_override")
        if override is not None:
            override = float(override)
        per_session, hours, hourly = per_session_charge(
            at,
            pt,
            override,
            session=sess,
            rate_type=athlete.get("rate_type"),
        )
        key = (r["athlete_id"], at.value, per_session)
        groups[key].append((r, athlete, sess, per_session, hours, hourly))

    items = []
    for rows in groups.values():
        r0, athlete, sess0, unit_price, _, _ = rows[0]
        at = AttendanceType(r0["attendance_type"])
        pt = billing_program_type(athlete, sess0)
        count = len(rows)
        record_ids = [row[0]["id"] for row in rows]
        dates = sorted({row[2]["date"] for row in rows})
        date_label = dates[0] if count == 1 else f"{dates[0]} – {dates[-1]}"
        desc = describe_line(at, pt, date_label, session_count=count)
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
    return items


async def sync_attendance_billed_rates(billable: list[dict], athletes_by_id: dict, sessions_by_id: dict) -> None:
    """Keep attendance billed_rate in sync with current billing rules."""
    from billing import billing_program_type, compute_billed_rate

    for r in billable:
        athlete = athletes_by_id[r["athlete_id"]]
        sess = sessions_by_id[r["session_id"]]
        at = AttendanceType(r["attendance_type"])
        pt = billing_program_type(athlete, sess)
        override = athlete.get("rate_override")
        if override is not None:
            override = float(override)
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
