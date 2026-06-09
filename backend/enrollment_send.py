"""Send and preview enrollment confirmation emails via Resend."""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date
from typing import Any, Optional

import resend
from fastapi import HTTPException

from enrollment_emails import build_enrollment_email_html
from enrollment_pdf import enrollment_pdf_filename, render_enrollment_pdf, sample_enrollment_context
from models import EnrollmentSubmit, ProgramType

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.environ["SENDER_EMAIL"]
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"
resend.api_key = os.environ["RESEND_API_KEY"]

PROGRAM_LABELS = {
    ProgramType.full_time: "Eat w/ EAT — Full-Time",
    ProgramType.private: "Private Lesson",
    ProgramType.semi_private: "Semi-Private",
}


def _calc_age(dob: date) -> int:
    today = date.today()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return age


def _build_medical_text(medical_none: bool, medical_flags: list[str], medical_details: Optional[str]) -> str:
    if medical_none and not medical_flags:
        return "None / No known issues"
    parts = list(medical_flags)
    text = ", ".join(parts)
    details = (medical_details or "").strip()
    if details:
        text = f"{text} — {details}" if text else details
    return text or "—"


def _program_label_from_athlete(athlete: dict) -> str:
    program_type = athlete.get("program_type")
    if not program_type:
        types = athlete.get("program_types") or []
        program_type = types[0] if types else None
    if not program_type:
        return "—"
    try:
        return PROGRAM_LABELS.get(ProgramType(program_type), str(program_type))
    except ValueError:
        return str(program_type)


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _format_rating(value: Any) -> str:
    if value is None:
        return "—"
    return f"{float(value):.2f}".rstrip("0").rstrip(".")


def build_enrollment_context_from_records(athlete: dict, family: dict) -> dict[str, Any]:
    """Rebuild PDF context from stored athlete + family records."""
    dob = _parse_date(athlete.get("date_of_birth"))
    age = _calc_age(dob) if dob else 18

    submitted = date.today()
    created = athlete.get("created_at")
    if created is not None:
        if hasattr(created, "date"):
            submitted = created.date()
        else:
            parsed = _parse_date(created)
            if parsed:
                submitted = parsed

    ec_rel = athlete.get("emergency_contact_relationship")
    ec_name = family.get("emergency_contact_name")
    if not ec_rel and ec_name:
        if ec_name == family.get("guardian_name"):
            ec_rel = family.get("guardian_relationship")
        elif ec_name == family.get("guardian_name_secondary"):
            ec_rel = family.get("guardian_relationship_secondary")

    return {
        "athlete_name": (athlete.get("full_name") or "").strip(),
        "date_of_birth": dob,
        "school": athlete.get("school"),
        "grade": athlete.get("grade"),
        "shirt_size": athlete.get("shirt_size"),
        "program_label": _program_label_from_athlete(athlete),
        "utr": _format_rating(athlete.get("utr")),
        "wtn": _format_rating(athlete.get("wtn")),
        "goals": athlete.get("enrollment_goals") or "—",
        "contact_label": "Contact" if age >= 18 else "Guardian",
        "contact_name": family.get("guardian_name"),
        "contact_relationship": family.get("guardian_relationship"),
        "contact_phone": family.get("guardian_phone"),
        "contact_email": family.get("guardian_email"),
        "street_address": family.get("street_address"),
        "city_state_zip": family.get("city_state_zip"),
        "emergency_contact_name": ec_name,
        "emergency_contact_relationship": ec_rel,
        "emergency_contact_phone": family.get("emergency_contact_phone"),
        "emergency_contact_email": family.get("emergency_contact_email"),
        "medical_conditions": athlete.get("medical_conditions") or "—",
        "referral_source": athlete.get("referral_source"),
        "additional_notes": athlete.get("enrollment_notes"),
        "photo_release": athlete.get("waiver_photo_release"),
        "waiver_typed_signature": (athlete.get("waiver_typed_signature") or "").strip(),
        "waiver_signature": (athlete.get("waiver_signature") or "").strip(),
        "submitted_date": submitted,
    }


def build_enrollment_context(
    *,
    payload: EnrollmentSubmit,
    contact_name: str,
    contact_email: str,
    contact_phone: str,
    program_label: str,
    submitted_date: Optional[date] = None,
) -> dict[str, Any]:
    age = _calc_age(payload.date_of_birth)
    goals = ", ".join(payload.goals) if payload.goals else "—"
    utr = "—" if payload.utr is None else f"{payload.utr:.2f}".rstrip("0").rstrip(".")
    wtn = "—" if payload.wtn is None else f"{payload.wtn:.2f}".rstrip("0").rstrip(".")
    medical_none = payload.medical_none or not payload.medical_flags
    return {
        "athlete_name": payload.full_name.strip(),
        "date_of_birth": payload.date_of_birth,
        "school": payload.school,
        "grade": payload.grade,
        "shirt_size": payload.shirt_size,
        "program_label": program_label,
        "utr": utr,
        "wtn": wtn,
        "goals": goals,
        "contact_label": "Contact" if age >= 18 else "Guardian",
        "contact_name": contact_name,
        "contact_relationship": payload.guardian_relationship,
        "contact_phone": contact_phone,
        "contact_email": contact_email,
        "street_address": payload.street_address,
        "city_state_zip": payload.city_state_zip,
        "emergency_contact_name": payload.emergency_contact_name,
        "emergency_contact_relationship": payload.emergency_contact_relationship,
        "emergency_contact_phone": payload.emergency_contact_phone,
        "emergency_contact_email": payload.emergency_contact_email,
        "medical_conditions": _build_medical_text(medical_none, payload.medical_flags, payload.medical_details),
        "referral_source": payload.referral_source,
        "additional_notes": payload.additional_notes,
        "photo_release": payload.photo_release,
        "waiver_typed_signature": payload.waiver_typed_signature.strip(),
        "waiver_signature": payload.waiver_signature.strip(),
        "submitted_date": submitted_date or date.today(),
    }


def build_preview_html() -> tuple[str, str, str]:
    ctx = sample_enrollment_context()
    pdf_bytes = render_enrollment_pdf(ctx)
    filename = enrollment_pdf_filename(ctx["athlete_name"])
    subject, html = build_enrollment_email_html(
        contact_name=ctx["contact_name"],
        athlete_name=ctx["athlete_name"],
        program_label=ctx["program_label"],
    )
    return subject, html, filename


async def send_enrollment_confirmation_email(
    *,
    payload: EnrollmentSubmit,
    contact_name: str,
    contact_email: str,
    contact_phone: str,
    program_label: str,
) -> dict:
    email = (contact_email or "").strip()
    if not email:
        raise HTTPException(400, "Contact email is required to send enrollment confirmation")

    ctx = build_enrollment_context(
        payload=payload,
        contact_name=contact_name,
        contact_email=email,
        contact_phone=contact_phone,
        program_label=program_label,
    )
    pdf_bytes = await asyncio.to_thread(render_enrollment_pdf, ctx)
    filename = enrollment_pdf_filename(ctx["athlete_name"])
    subject, html = build_enrollment_email_html(
        contact_name=contact_name,
        athlete_name=ctx["athlete_name"],
        program_label=program_label,
    )

    params = {
        "from": f"Elite Atmosphere Training <{SENDER_EMAIL}>",
        "to": [email],
        "subject": subject,
        "html": html,
        "attachments": [{
            "filename": filename,
            "content": list(pdf_bytes),
        }],
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        email_id = (result or {}).get("id")
    except Exception as e:
        logger.error("Resend enrollment confirmation failed: %s", e)
        raise HTTPException(500, f"Email send failed: {e}")

    resp = {"status": "sent", "email_id": email_id, "to": email}
    if DEV_MODE:
        resp["dev_note"] = "Enrollment confirmation sent"
    return resp
