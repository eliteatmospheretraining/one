"""Sessions + attendance routes."""
from __future__ import annotations

import logging
from datetime import date
from typing import List, Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_coach
from billing import compute_billed_rate
from db import db, now, serialize
from google_calendar import delete_session_event, push_session
from invoice_auto import auto_sync_invoices_for_session
from invoice_billing import billing_status_for_session, relink_invoice_line_items
from models import (
    AttendanceRecord,
    AttendanceSave,
    AttendanceType,
    ProgramType,
    SessionCreate,
    SessionStatus,
    SessionUpdate,
    TrainingSession,
)

router = APIRouter(prefix="/sessions", tags=["sessions"], dependencies=[Depends(get_current_coach)])


@router.get("", response_model=List[TrainingSession])
async def list_sessions(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    status: Optional[SessionStatus] = None,
):
    query: dict = {}
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date.isoformat()
        if end_date:
            query["date"]["$lte"] = end_date.isoformat()
    if status:
        query["status"] = status.value
    docs = await db.sessions.find(query, {"_id": 0}).sort([("date", 1), ("start_time", 1)]).to_list(2000)
    return docs


@router.post("", response_model=TrainingSession)
async def create_session(payload: SessionCreate):
    s = TrainingSession(**payload.model_dump())
    await db.sessions.insert_one(serialize(s.model_dump()))
    await push_session(s.id)
    return s


@router.post("/batch", response_model=List[TrainingSession])
async def create_sessions_batch(payload: List[SessionCreate]):
    """Create many sessions (recurring schedule) in one request."""
    if not payload:
        raise HTTPException(400, "No sessions to create")
    if len(payload) > 200:
        raise HTTPException(400, "Maximum 200 sessions per batch")

    created: list[TrainingSession] = []
    for item in payload:
        s = TrainingSession(**item.model_dump())
        await db.sessions.insert_one(serialize(s.model_dump()))
        created.append(s)
    for s in created:
        await push_session(s.id)
    return created


@router.get("/{session_id}", response_model=TrainingSession)
async def get_session(session_id: str):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.patch("/{session_id}")
async def update_session(session_id: str, payload: SessionUpdate):
    updates = {}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(v, "isoformat"):
            v = v.isoformat()
        if hasattr(v, "value"):
            v = v.value
        updates[k] = v

    if "status" in updates and updates["status"] == SessionStatus.completed.value:
        # Require at least one attendance record for this session
        count = await db.attendance_records.count_documents({"session_id": session_id})
        if count == 0:
            raise HTTPException(400, "Save attendance before marking the session complete.")

    became_completed = updates.get("status") == SessionStatus.completed.value

    if updates:
        res = await db.sessions.update_one({"id": session_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Session not found")
    await push_session(session_id)

    invoices = []
    if became_completed:
        try:
            invoices = await auto_sync_invoices_for_session(session_id)
        except Exception:
            logger.exception("Invoice auto-sync failed after completing session %s", session_id)

    session_doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    extras = {"billing": await billing_status_for_session(session_id)}
    if invoices:
        extras["invoices_synced"] = invoices
    return {**session_doc, **extras}


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    await delete_session_event(s)
    await db.attendance_records.delete_many({"session_id": session_id})
    await db.sessions.delete_one({"id": session_id})
    return {"status": "ok"}


# ---------- Attendance ----------

@router.get("/{session_id}/last-attendance")
async def last_attendance(session_id: str):
    """Return the most recent prior session's attendance for the same program_type.

    Used by the UI to prefill 'Copy from previous session'.
    """
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    prev = await db.sessions.find_one(
        {
            "session_type": s["session_type"],
            "date": {"$lt": s["date"]},
            "id": {"$ne": session_id},
        },
        {"_id": 0},
        sort=[("date", -1), ("start_time", -1)],
    )
    if not prev:
        return {"source": None, "entries": []}
    records = await db.attendance_records.find({"session_id": prev["id"]}, {"_id": 0}).to_list(500)
    entries = [{"athlete_id": r["athlete_id"], "attendance_type": r["attendance_type"]} for r in records]
    return {"source": prev, "entries": entries}


@router.get("/{session_id}/attendance")
async def get_attendance(session_id: str):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    records = await db.attendance_records.find({"session_id": session_id}, {"_id": 0}).to_list(500)

    # Build roster: prefer session.athlete_ids; if empty, fall back to active athletes of session_type
    if session.get("athlete_ids"):
        athletes = await db.athletes.find({"id": {"$in": session["athlete_ids"]}}, {"_id": 0}).to_list(500)
    else:
        athletes = await db.athletes.find(
            {
                "status": "active",
                "$or": [
                    {"program_types": session["session_type"]},
                    {"program_type": session["session_type"]},
                ],
            },
            {"_id": 0},
        ).sort("full_name", 1).to_list(500)

    rec_by_athlete = {r["athlete_id"]: r for r in records}
    return {
        "session": session,
        "athletes": athletes,
        "records": records,
        "roster": [
            {"athlete": a, "record": rec_by_athlete.get(a["id"])} for a in athletes
        ],
    }


@router.post("/{session_id}/attendance")
async def save_attendance(session_id: str, payload: AttendanceSave):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")

    old_records = await db.attendance_records.find({"session_id": session_id}, {"_id": 0}).to_list(500)
    old_id_by_athlete = {r["athlete_id"]: r["id"] for r in old_records}

    # Wipe & re-insert for simplicity (snapshot rates fresh on each save)
    await db.attendance_records.delete_many({"session_id": session_id})

    new_records: list[dict] = []
    for entry in payload.entries:
        athlete = await db.athletes.find_one({"id": entry.athlete_id}, {"_id": 0})
        if not athlete:
            continue
        try:
            from billing import billing_program_type, compute_billed_rate, resolve_attendance_type

            program_type = billing_program_type(athlete, session)
            billing_type = resolve_attendance_type(
                entry.attendance_type,
                program_type=program_type,
                session=session,
            )
        except ValueError as e:
            raise HTTPException(400, f"Invalid program type for {athlete.get('full_name', entry.athlete_id)}") from e
        override = athlete.get("rate_override")
        if override is not None:
            try:
                override = float(override)
            except (TypeError, ValueError) as e:
                raise HTTPException(400, f"Invalid rate override for {athlete.get('full_name', entry.athlete_id)}") from e
        try:
            rate = compute_billed_rate(
                billing_type,
                program_type,
                override,
                session=session,
                rate_type=athlete.get("rate_type"),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise HTTPException(400, f"Could not calculate billing rate for {athlete.get('full_name', entry.athlete_id)}") from e
        rec = AttendanceRecord(
            session_id=session_id,
            athlete_id=entry.athlete_id,
            attendance_type=billing_type,
            billed_rate=rate,
        )
        new_records.append(serialize(rec.model_dump()))

    if new_records:
        await db.attendance_records.insert_many(new_records)
        new_id_by_athlete = {r["athlete_id"]: r["id"] for r in new_records}
        await relink_invoice_line_items(old_id_by_athlete, new_id_by_athlete)
    elif payload.entries:
        raise HTTPException(400, "No attendance was saved — check that each athlete still exists on the roster.")

    # Sync session.athlete_ids to reflect logged roster
    athlete_ids = [r["athlete_id"] for r in new_records]
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"athlete_ids": athlete_ids, "attendance_logged_at": now().isoformat()}},
    )

    invoices = []
    if session.get("status") == SessionStatus.completed.value:
        try:
            invoices = await auto_sync_invoices_for_session(session_id)
        except Exception:
            logger.exception("Invoice auto-sync failed after saving attendance on session %s", session_id)

    billing = await billing_status_for_session(session_id)
    out = {"status": "ok", "count": len(new_records), "billing": billing}
    if invoices:
        out["invoices_synced"] = invoices
    return out


@router.get("/{session_id}/billing")
async def session_billing(session_id: str):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    billing = await billing_status_for_session(session_id)
    return {"session_id": session_id, "billing": billing}


@router.post("/{session_id}/sync-invoice")
async def sync_session_invoice(session_id: str):
    """Create or refresh the monthly draft invoice for this completed session's family."""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    if session.get("status") != SessionStatus.completed.value:
        raise HTTPException(400, "Complete the session before syncing to an invoice.")

    existing = await billing_status_for_session(session_id)
    if existing:
        return {
            "status": "already_billed",
            "billing": existing,
            "message": "This session is already on an invoice.",
        }

    try:
        synced = await auto_sync_invoices_for_session(session_id)
    except Exception as e:
        logger.exception("Manual invoice sync failed for session %s", session_id)
        raise HTTPException(500, "Could not sync invoice") from e

    if synced:
        return {"status": "synced", "invoices_synced": synced, "billing": await billing_status_for_session(session_id)}

    return {
        "status": "nothing_to_add",
        "message": "No billable attendance to add (absent, zero rate, or not linked to a family).",
        "billing": await billing_status_for_session(session_id),
    }
