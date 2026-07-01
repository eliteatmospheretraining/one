"""Send waiver invite and signed-waiver confirmation emails."""
from __future__ import annotations

import asyncio
import logging
import os

import resend
from fastapi import HTTPException

from enrollment_pdf import render_waiver_pdf, waiver_pdf_filename
from enrollment_send import build_enrollment_context_from_records
from waiver_emails import build_waiver_invite_email_html, build_waiver_signed_email_html
from waiver_magic_links import create_waiver_access_token, waiver_pdf_url, waiver_sign_url

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.environ["SENDER_EMAIL"]
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000")
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"
resend.api_key = os.environ["RESEND_API_KEY"]


async def send_waiver_invite_email(*, athlete: dict, family: dict) -> dict:
    """Email parent a magic link to sign the waiver online."""
    email = (family.get("guardian_email") or "").strip()
    if not email:
        raise HTTPException(400, "Family has no guardian email")

    if (athlete.get("waiver_signature") or "").strip():
        raise HTTPException(400, "Waiver already signed for this athlete")

    guardian_name = (family.get("guardian_name") or "").strip() or "there"
    athlete_name = (athlete.get("full_name") or "").strip() or "your athlete"

    token = await create_waiver_access_token(athlete_id=athlete["id"], email=email)
    sign_url = waiver_sign_url(token, APP_BASE_URL)
    subject, html = build_waiver_invite_email_html(
        guardian_name=guardian_name,
        athlete_name=athlete_name,
        sign_url=sign_url,
    )

    params = {
        "from": f"Elite Atmosphere Training <{SENDER_EMAIL}>",
        "to": [email],
        "subject": subject,
        "html": html,
    }
    from email_delivery import send_email

    try:
        result = await send_email(params, context="waiver invite")
        email_id = result.get("id")
    except Exception as e:
        logger.error("Resend waiver invite failed: %s", e)
        raise HTTPException(500, f"Email send failed: {e}") from e

    resp = {"status": "sent", "email_id": email_id, "to": email, "sign_url": sign_url}
    if DEV_MODE:
        resp["dev_sign_url"] = sign_url
        resp["email_suppressed"] = True
    return resp


async def send_waiver_signed_email(*, athlete: dict, family: dict, token: str) -> dict:
    """Email parent a copy of the signed waiver PDF."""
    email = (family.get("guardian_email") or "").strip()
    if not email:
        raise HTTPException(400, "Family has no guardian email")

    guardian_name = (family.get("guardian_name") or "").strip() or "there"
    athlete_name = (athlete.get("full_name") or "").strip() or "your athlete"
    pdf_url = waiver_pdf_url(token, APP_BASE_URL)

    ctx = build_enrollment_context_from_records(athlete, family)
    pdf_bytes = await asyncio.to_thread(render_waiver_pdf, ctx)
    filename = waiver_pdf_filename(ctx["athlete_name"])
    subject, html = build_waiver_signed_email_html(
        guardian_name=guardian_name,
        athlete_name=athlete_name,
        pdf_url=pdf_url,
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
    from email_delivery import send_email

    try:
        result = await send_email(params, context="waiver signed")
        email_id = result.get("id")
    except Exception as e:
        logger.error("Resend waiver signed email failed: %s", e)
        raise HTTPException(500, f"Email send failed: {e}") from e

    resp = {"status": "sent", "email_id": email_id, "to": email}
    if DEV_MODE:
        resp["email_suppressed"] = True
    return resp
