"""Magic-link auth for the EAT portal. Single-admin allowlist."""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
import resend
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import db, now, serialize
from models import Coach, MagicLinkRequest, MagicLinkVerify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower().strip()
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"

resend.api_key = os.environ["RESEND_API_KEY"]


async def ensure_admin_seeded():
    """Make sure the admin coach exists."""
    existing = await db.coaches.find_one({"email": ADMIN_EMAIL}, {"_id": 0})
    if not existing:
        coach = Coach(name="Coach Rico", email=ADMIN_EMAIL, role="admin")
        await db.coaches.insert_one(serialize(coach.model_dump()))
        logger.info(f"Seeded admin coach: {ADMIN_EMAIL}")


def _create_jwt(email: str, coach_id: str) -> str:
    payload = {
        "sub": coach_id,
        "email": email,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_coach(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
    coach = await db.coaches.find_one({"id": payload["sub"]}, {"_id": 0})
    if not coach:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Coach not found")
    return coach


def _build_email_html(magic_url: str) -> str:
    return f"""
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0A0A0A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:3px solid #0A0A0A;">
        <tr><td style="padding:32px;">
          <div style="font-family:'Arial Black',Arial,sans-serif;font-size:28px;font-weight:900;letter-spacing:-1px;color:#0A0A0A;text-transform:uppercase;">Elite Atmosphere Training</div>
          <div style="height:6px;background:#CCFF00;margin:16px 0 24px 0;width:60px;"></div>
          <h1 style="font-size:22px;color:#0A0A0A;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:1px;">Your sign-in link</h1>
          <p style="font-size:15px;color:#52525B;line-height:1.6;margin:0 0 24px 0;">
            Tap the button below to sign in to the EAT admin portal. This link expires in 30 minutes and can be used once.
          </p>
          <a href="{magic_url}" style="display:inline-block;background:#CCFF00;color:#0A0A0A;font-weight:700;text-transform:uppercase;letter-spacing:2px;padding:16px 32px;text-decoration:none;border:2px solid #0A0A0A;">Sign In to EAT</a>
          <p style="font-size:12px;color:#71717A;margin:32px 0 0 0;line-height:1.6;">
            If the button doesn't work, copy this link:<br>
            <span style="word-break:break-all;color:#0A0A0A;">{magic_url}</span>
          </p>
        </td></tr>
      </table>
      <div style="color:#71717A;font-size:11px;margin-top:24px;">Elite Atmosphere Training · Miami, FL</div>
    </td></tr>
  </table>
</body></html>
"""


@router.post("/request-magic-link")
async def request_magic_link(req: MagicLinkRequest):
    email = req.email.lower().strip()
    if email != ADMIN_EMAIL:
        # Don't leak which emails are allowed
        return {"status": "ok", "message": "If that email is authorized, a sign-in link has been sent."}

    token = secrets.token_urlsafe(32)
    expires_at = now() + timedelta(minutes=30)

    await db.magic_links.insert_one(serialize({
        "token": token,
        "email": email,
        "expires_at": expires_at,
        "used": False,
        "created_at": now(),
    }))

    magic_url = f"{APP_BASE_URL}/verify?token={token}"
    html = _build_email_html(magic_url)

    params = {
        "from": f"Elite Atmosphere Training <{SENDER_EMAIL}>",
        "to": [email],
        "subject": "Your EAT Portal sign-in link",
        "html": html,
    }
    try:
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error(f"Resend send failed: {e}")

    resp = {"status": "ok", "message": "If that email is authorized, a sign-in link has been sent."}
    if DEV_MODE:
        resp["dev_magic_link"] = magic_url
        resp["dev_token"] = token
    return resp


@router.post("/verify-magic-link")
async def verify_magic_link(req: MagicLinkVerify):
    rec = await db.magic_links.find_one({"token": req.token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    if rec.get("used"):
        raise HTTPException(status_code=400, detail="This link has already been used")

    exp = rec.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp and exp < now():
        raise HTTPException(status_code=400, detail="Link expired")

    coach = await db.coaches.find_one({"email": rec["email"]}, {"_id": 0})
    if not coach:
        raise HTTPException(status_code=400, detail="Account not found")

    await db.magic_links.update_one({"token": req.token}, {"$set": {"used": True, "used_at": now().isoformat()}})

    jwt_token = _create_jwt(coach["email"], coach["id"])
    return {"token": jwt_token, "coach": coach}


@router.get("/me")
async def me(coach: dict = Depends(get_current_coach)):
    return coach
