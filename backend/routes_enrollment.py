"""Public athlete enrollment form."""
from __future__ import annotations

import re
from datetime import date
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


def _build_medical(medical_none: bool, medical_flags: list[str], medical_details: Optional[str]) -> Optional[str]:
    if medical_none and not medical_flags:
        return "None / No known issues"
    parts = list(medical_flags)
    text = ", ".join(parts)
    details = (medical_details or "").strip()
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


def _calc_age(dob: date) -> int:
    today = date.today()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return age


def _resolve_contact(payload: EnrollmentSubmit) -> tuple[str, str, str, str]:
    """Return family contact name, email, phone, and lookup email."""
    age = _calc_age(payload.date_of_birth)
    minor = age < 18
    if minor:
        if not (payload.guardian_name or "").strip():
            raise HTTPException(400, "Guardian name is required for athletes under 18")
        if not (payload.guardian_phone or "").strip():
            raise HTTPException(400, "Guardian phone is required for athletes under 18")
        if not payload.guardian_email:
            raise HTTPException(400, "Guardian email is required for athletes under 18")
        name = payload.guardian_name.strip()
        phone = payload.guardian_phone.strip()
        email = str(payload.guardian_email)
        return name, email, phone, email

    name = (payload.guardian_name or "").strip() or payload.full_name.strip()
    phone = (payload.guardian_phone or "").strip() or (payload.emergency_contact_phone or "").strip()
    email = str(payload.guardian_email) if payload.guardian_email else (
        str(payload.emergency_contact_email) if payload.emergency_contact_email else ""
    )
    if not email:
        raise HTTPException(400, "An email address is required for enrollment")
    if not phone:
        raise HTTPException(400, "A phone number is required for enrollment")
    return name, email, phone, email


async def _upsert_family(payload: EnrollmentSubmit, contact_name: str, contact_email: str, contact_phone: str) -> str:
    lookup = _family_lookup_key(contact_email)
    existing = await _find_family_by_email(contact_email)
    emergency = []
    if (payload.emergency_contact_name or "").strip():
        emergency.append({
            "name": payload.emergency_contact_name,
            "phone": payload.emergency_contact_phone,
            "email": str(payload.emergency_contact_email) if payload.emergency_contact_email else None,
        })
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
        "guardian_name": contact_name,
        "guardian_email": contact_email,
        "guardian_phone": contact_phone,
        "guardian_relationship": payload.guardian_relationship or None,
        "guardian_name_secondary": payload.guardian_name_secondary or None,
        "guardian_email_secondary": str(payload.guardian_email_secondary) if payload.guardian_email_secondary else None,
        "guardian_phone_secondary": payload.guardian_phone_secondary or None,
        "guardian_relationship_secondary": payload.guardian_relationship_secondary or None,
        "street_address": payload.street_address or None,
        "city_state_zip": payload.city_state_zip or None,
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
    if not (payload.waiver_typed_signature or "").strip():
        raise HTTPException(400, "Typed signature is required")
    if not (payload.waiver_signature or "").strip():
        raise HTTPException(400, "Drawn signature is required")

    contact_name, contact_email, contact_phone, lookup_email = _resolve_contact(payload)
    family_id = await _upsert_family(payload, contact_name, contact_email, contact_phone)
    goals = ", ".join(payload.goals) if payload.goals else None
    medical_none = payload.medical_none or not payload.medical_flags
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
        medical_conditions=_build_medical(medical_none, payload.medical_flags, payload.medical_details),
        waiver_photo_release=payload.photo_release,
        waiver_typed_signature=payload.waiver_typed_signature.strip(),
        waiver_signature=payload.waiver_signature.strip(),
        family_id=family_id,
    )
    await db.athletes.insert_one(serialize(athlete.model_dump()))
    return EnrollmentResponse(
        athlete_id=athlete.id,
        family_id=family_id,
        athlete_name=athlete.full_name,
        guardian_email=lookup_email,
        program_label=PROGRAM_LABELS.get(payload.program_type, payload.program_type.value),
    )
