"""Sessions + attendance routes."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_coach
from billing import compute_billed_rate
from db import db, now, serialize
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
    return s


@router.get("/{session_id}", response_model=TrainingSession)
async def get_session(session_id: str):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.patch("/{session_id}", response_model=TrainingSession)
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

    if updates:
        res = await db.sessions.update_one({"id": session_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Session not found")
    return await db.sessions.find_one({"id": session_id}, {"_id": 0})


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    await db.attendance_records.delete_many({"session_id": session_id})
    res = await db.sessions.delete_one({"id": session_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Session not found")
    return {"status": "ok"}


# ---------- Attendance ----------

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
            {"program_type": session["session_type"], "status": "active"}, {"_id": 0}
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

    # Wipe & re-insert for simplicity (snapshot rates fresh on each save)
    await db.attendance_records.delete_many({"session_id": session_id})

    new_records: list[dict] = []
    for entry in payload.entries:
        athlete = await db.athletes.find_one({"id": entry.athlete_id}, {"_id": 0})
        if not athlete:
            continue
        rate = compute_billed_rate(
            entry.attendance_type,
            ProgramType(athlete["program_type"]),
            athlete.get("rate_override"),
        )
        rec = AttendanceRecord(
            session_id=session_id,
            athlete_id=entry.athlete_id,
            attendance_type=entry.attendance_type,
            billed_rate=rate,
        )
        new_records.append(serialize(rec.model_dump()))

    if new_records:
        await db.attendance_records.insert_many(new_records)

    # Sync session.athlete_ids to reflect logged roster
    athlete_ids = [r["athlete_id"] for r in new_records]
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"athlete_ids": athlete_ids, "attendance_logged_at": now().isoformat()}},
    )

    return {"status": "ok", "count": len(new_records)}
