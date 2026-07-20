"""Athletes CRUD."""
from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response

logger = logging.getLogger(__name__)

from auth import get_current_coach
from db import db, serialize
from enrollment_pdf import enrollment_pdf_filename, render_enrollment_pdf, render_waiver_pdf, waiver_pdf_filename
from enrollment_send import build_enrollment_context_from_records
from models import Athlete, AthleteCreate, AthleteStatus, AthleteUpdate, ProgramType, RateType, EnrollmentTier

router = APIRouter(prefix="/athletes", tags=["athletes"], dependencies=[Depends(get_current_coach)])


def _athlete_on_eat(program_types: list | None, program_type: str | None = None) -> bool:
    types = list(program_types or [])
    if program_type:
        types.append(program_type)
    return ProgramType.full_time.value in {getattr(t, "value", t) for t in types}


def _require_eat_billing_fields(program_types, program_type, rate_type, enrollment_tier) -> None:
    if not _athlete_on_eat(program_types, program_type):
        return
    rt = getattr(rate_type, "value", rate_type)
    et = getattr(enrollment_tier, "value", enrollment_tier)
    if rt not in (
        RateType.weekly.value,
        RateType.monthly.value,
        RateType.daily.value,
    ):
        raise HTTPException(
            400,
            "Eat w/ EAT athletes need a billing cadence (weekly, monthly, or per session)",
        )
    if et not in (EnrollmentTier.full_day.value, EnrollmentTier.half_day.value):
        raise HTTPException(
            400,
            "Eat w/ EAT athletes need an enrollment tier (full day or half day)",
        )


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
    _require_eat_billing_fields(
        payload.program_types,
        payload.program_type,
        payload.rate_type,
        payload.enrollment_tier,
    )
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

    try:
        ctx = build_enrollment_context_from_records(athlete, family)
        pdf_bytes = await asyncio.to_thread(render_enrollment_pdf, ctx)
    except Exception as e:
        logger.exception("Enrollment PDF failed for athlete %s", athlete_id)
        raise HTTPException(500, f"Enrollment PDF failed: {e}") from e

    filename = enrollment_pdf_filename(ctx["athlete_name"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{athlete_id}/send-waiver")
async def send_waiver_link(athlete_id: str):
    """Email parent a magic link to sign the liability waiver."""
    from waiver_send import send_waiver_invite_email

    athlete = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    if not athlete:
        raise HTTPException(404, "Athlete not found")
    family = await db.families.find_one({"id": athlete["family_id"]}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")
    return await send_waiver_invite_email(athlete=athlete, family=family)


@router.get("/{athlete_id}/waiver-pdf")
async def download_waiver_pdf(athlete_id: str):
    athlete = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    if not athlete:
        raise HTTPException(404, "Athlete not found")
    if not (athlete.get("waiver_signature") or "").strip():
        raise HTTPException(404, "No signed waiver on file for this athlete")

    family = await db.families.find_one({"id": athlete["family_id"]}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")

    try:
        ctx = build_enrollment_context_from_records(athlete, family)
        pdf_bytes = await asyncio.to_thread(render_waiver_pdf, ctx)
    except Exception as e:
        logger.exception("Waiver PDF failed for athlete %s", athlete_id)
        raise HTTPException(500, f"Waiver PDF failed: {e}") from e

    filename = waiver_pdf_filename(ctx["athlete_name"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.patch("/{athlete_id}", response_model=Athlete)
async def update_athlete(athlete_id: str, payload: AthleteUpdate):
    existing = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Athlete not found")

    updates = {}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(v, "isoformat"):  # date
            v = v.isoformat()
        if hasattr(v, "value"):  # enum
            v = v.value
        updates[k] = v

    merged = {**existing, **updates}
    _require_eat_billing_fields(
        merged.get("program_types"),
        merged.get("program_type"),
        merged.get("rate_type"),
        merged.get("enrollment_tier"),
    )

    if updates:
        await db.athletes.update_one({"id": athlete_id}, {"$set": updates})
    a = await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
    return a


@router.post("/{athlete_id}/archive", response_model=Athlete)
async def archive_athlete(athlete_id: str):
    res = await db.athletes.update_one({"id": athlete_id}, {"$set": {"status": "archived"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Athlete not found")
    return await db.athletes.find_one({"id": athlete_id}, {"_id": 0})
