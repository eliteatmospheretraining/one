"""Public athlete enrollment form."""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, HTTPException

from db import db, serialize
from models import (
    Athlete,
    AthleteStatus,
    EnrollmentResponse,
    EnrollmentSubmit,
    Family,
    ProgramType,
)

router = APIRouter(prefix="/enroll", tags=["enrollment"])

PROGRAM_LABELS = {
    ProgramType.full_time: "Eat w/ EAT — Full-Time",
    ProgramType.private: "Private Lesson",
    ProgramType.semi_private: "Semi-Private",
}


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _derive_family_name(full_name: str) -> str:
    parts = (full_name or "").strip().split()
    if not parts:
        return "Family"
    return parts[-1] if len(parts) > 1 else parts[0]


def _family_lookup_key(email: str) -> str:
    return f"email:{_normalize_email(email)}"


def _build_medical(payload: EnrollmentSubmit) -> Optional[str]:
    if payload.medical_none and not payload.medical_flags:
        return "None / No known issues"
    parts = list(payload.medical_flags)
    text = ", ".join(parts)
    details = (payload.medical_details or "").strip()
    if details:
        text = f"{text} — {details}" if text else details
    return text or None


async def _find_family_by_email(email: str) -> Optional[dict]:
    normalized = _normalize_email(email)
    if not normalized:
        return None
    lookup = _family_lookup_key(normalized)
    fam = await db.families.find_one({"notion_lookup_key": lookup}, {"_id": 0})
    if fam:
        return fam
    return await db.families.find_one(
        {"guardian_email": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}},
        {"_id": 0},
    )


async def _upsert_family(payload: EnrollmentSubmit) -> str:
    lookup = _family_lookup_key(str(payload.guardian_email))
    existing = await _find_family_by_email(str(payload.guardian_email))
    emergency = []
    if payload.primary_emergency:
        emergency.append({
            "name": payload.guardian_name,
            "phone": payload.guardian_phone,
            "email": str(payload.guardian_email),
        })
    if payload.secondary_emergency and (payload.guardian_name_secondary or "").strip():
        emergency.append({
            "name": payload.guardian_name_secondary,
            "phone": payload.guardian_phone_secondary,
            "email": str(payload.guardian_email_secondary) if payload.guardian_email_secondary else None,
        })
    first_emergency = emergency[0] if emergency else None
    family_payload = {
        "family_name": _derive_family_name(payload.full_name),
        "guardian_name": payload.guardian_name,
        "guardian_email": str(payload.guardian_email),
        "guardian_phone": payload.guardian_phone,
        "guardian_relationship": payload.guardian_relationship,
        "guardian_name_secondary": payload.guardian_name_secondary or None,
        "guardian_email_secondary": str(payload.guardian_email_secondary) if payload.guardian_email_secondary else None,
        "guardian_phone_secondary": payload.guardian_phone_secondary or None,
        "guardian_relationship_secondary": payload.guardian_relationship_secondary or None,
        "emergency_contacts": emergency,
        "emergency_contact_name": first_emergency["name"] if first_emergency else None,
        "emergency_contact_phone": first_emergency["phone"] if first_emergency else None,
        "emergency_contact_email": first_emergency["email"] if first_emergency else None,
        "notion_lookup_key": lookup,
    }
    if existing:
        await db.families.update_one({"id": existing["id"]}, {"$set": family_payload})
        return existing["id"]

    fam = Family(**family_payload)
    await db.families.insert_one(serialize(fam.model_dump()))
    return fam.id


@router.post("", response_model=EnrollmentResponse)
async def submit_enrollment(payload: EnrollmentSubmit):
    if not payload.medical_none and not payload.medical_flags:
        raise HTTPException(400, "Select a medical option or choose None")

    family_id = await _upsert_family(payload)
    goals = ", ".join(payload.goals) if payload.goals else None
    athlete = Athlete(
        full_name=payload.full_name.strip(),
        date_of_birth=payload.date_of_birth,
        program_type=payload.program_type,
        program_types=[payload.program_type],
        status=AthleteStatus.pending,
        utr=payload.utr,
        wtn=payload.wtn,
        shirt_size=payload.shirt_size,
        school=payload.school or None,
        grade=payload.grade or None,
        enrollment_goals=goals,
        referral_source=payload.referral_source or None,
        enrollment_notes=payload.additional_notes or None,
        medical_conditions=_build_medical(payload),
        family_id=family_id,
    )
    await db.athletes.insert_one(serialize(athlete.model_dump()))
    return EnrollmentResponse(
        athlete_id=athlete.id,
        family_id=family_id,
        athlete_name=athlete.full_name,
        guardian_email=payload.guardian_email,
        program_label=PROGRAM_LABELS.get(payload.program_type, payload.program_type.value),
    )
