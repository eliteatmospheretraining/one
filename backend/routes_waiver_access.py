"""Public parent routes for standalone waiver signing (no coach JWT)."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Response

from db import db, now, serialize
from enrollment_pdf import render_waiver_pdf, waiver_pdf_filename
from enrollment_send import build_enrollment_context_from_records
from models import WaiverAccessSubmit
from pdf import pdf_content_disposition
from waiver_magic_links import resolve_waiver_access_token
from waiver_send import send_waiver_signed_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/waiver-access", tags=["waiver-access"])


@router.get("/view")
async def view_waiver(token: str):
    ctx = await resolve_waiver_access_token(token)
    athlete = ctx["athlete"]
    family = ctx["family"]
    already_signed = bool((athlete.get("waiver_signature") or "").strip())
    return {
        "athlete_name": athlete.get("full_name"),
        "guardian_name": family.get("guardian_name"),
        "already_signed": already_signed,
        "link_used": bool(ctx["access"].get("signed_at")),
    }


@router.post("/submit")
async def submit_waiver(payload: WaiverAccessSubmit):
    if not (payload.waiver_typed_signature or "").strip():
        raise HTTPException(400, "Typed signature is required")
    if not (payload.waiver_signature or "").strip():
        raise HTTPException(400, "Drawn signature is required")

    ctx = await resolve_waiver_access_token(payload.token, require_unsigned=True)
    athlete = ctx["athlete"]
    family = ctx["family"]

    if (athlete.get("waiver_signature") or "").strip():
        raise HTTPException(400, "Waiver already signed for this athlete")

    signed_at = now()
    updates = {
        "waiver_photo_release": payload.photo_release,
        "waiver_typed_signature": payload.waiver_typed_signature.strip(),
        "waiver_signature": payload.waiver_signature.strip(),
        "waiver_signed_at": signed_at,
    }
    await db.athletes.update_one({"id": athlete["id"]}, {"$set": serialize(updates)})
    await db.waiver_access_tokens.update_one(
        {"token": payload.token},
        {"$set": serialize({"signed_at": signed_at})},
    )

    athlete = await db.athletes.find_one({"id": athlete["id"]}, {"_id": 0})
    try:
        await send_waiver_signed_email(athlete=athlete, family=family, token=payload.token)
    except Exception as e:
        logger.error("Waiver saved but confirmation email failed: %s", e)

    return {
        "status": "signed",
        "athlete_name": athlete.get("full_name"),
        "guardian_email": family.get("guardian_email"),
    }


@router.get("/pdf")
async def download_waiver_pdf(token: str):
    ctx = await resolve_waiver_access_token(token)
    athlete = ctx["athlete"]
    if not (athlete.get("waiver_signature") or "").strip():
        raise HTTPException(404, "Waiver not signed yet")

    family = ctx["family"]
    pdf_ctx = build_enrollment_context_from_records(athlete, family)
    pdf_bytes = await asyncio.to_thread(render_waiver_pdf, pdf_ctx)
    filename = waiver_pdf_filename(pdf_ctx["athlete_name"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": pdf_content_disposition(filename)},
    )
