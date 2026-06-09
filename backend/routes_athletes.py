"""Athletes CRUD."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from auth import get_current_coach
from db import db, serialize
from enrollment_pdf import enrollment_pdf_filename, render_enrollment_pdf
from enrollment_send import build_enrollment_context_from_records
from models import Athlete, AthleteCreate, AthleteStatus, AthleteUpdate, ProgramType

router = APIRouter(prefix="/athletes", tags=["athletes"], dependencies=[Depends(get_current_coach)])


@router.get("", response_model=List[Athlete])
async def list_athletes(
    program_type: Optional[ProgramType] = None,
    status: Optional[AthleteStatus] = None,
    family_id: Optional[str] = None,
    q: Optional[str] = Query(None, description="search by name"),
):
    query: dict = {}
    if program_type:
        query["$or"] = [
            {"program_types": program_type.value},
            {"program_type": program_type.value},
        ]
    if status:
        query["status"] = status.value
    if family_id:
        query["family_id"] = family_id
    if q:
        query["full_name"] = {"$regex": q, "$options": "i"}
    docs = await db.athletes.find(query, {"_id": 0}).sort("full_name", 1).to_list(2000)
    return docs


@router.post("", response_model=Athlete)
async def create_athlete(payload: AthleteCreate):
    # Validate family exists
    fam = await db.families.find_one({"id": payload.family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(400, "family_id does not exist")
    a = Athlete(**payload.model_dump())
    await db.athletes.insert_one(serialize(a.model_dump()))
    return a


@router.get("/{athlete_id}", response_model=Athlete)
async def get_athlete(athlete_id: str):
    a = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Athlete not found")
    return a


@router.get("/{athlete_id}/enrollment-pdf")
async def download_enrollment_pdf(athlete_id: str):
    athlete = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    if not athlete:
        raise HTTPException(404, "Athlete not found")
    if not (athlete.get("waiver_signature") or "").strip():
        raise HTTPException(404, "No enrollment waiver on file for this athlete")

    family = await db.families.find_one({"id": athlete["family_id"]}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")

    ctx = build_enrollment_context_from_records(athlete, family)
    pdf_bytes = render_enrollment_pdf(ctx)
    filename = enrollment_pdf_filename(ctx["athlete_name"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.patch("/{athlete_id}", response_model=Athlete)
async def update_athlete(athlete_id: str, payload: AthleteUpdate):
    updates = {}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(v, "isoformat"):  # date
            v = v.isoformat()
        if hasattr(v, "value"):  # enum
            v = v.value
        updates[k] = v
    if updates:
        res = await db.athletes.update_one({"id": athlete_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Athlete not found")
    a = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    return a


@router.post("/{athlete_id}/archive", response_model=Athlete)
async def archive_athlete(athlete_id: str):
    res = await db.athletes.update_one({"id": athlete_id}, {"$set": {"status": "archived"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Athlete not found")
    return await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
