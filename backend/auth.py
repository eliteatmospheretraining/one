"""Magic-link and password auth for the EAT portal. Single-admin allowlist."""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
import resend
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import db, now, serialize
from models import Coach, MagicLinkRequest, MagicLinkVerify, PasswordChangeRequest, PasswordLoginRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower().strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"

resend.api_key = os.environ["RESEND_API_KEY"]


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _coach_public(coach: dict) -> dict:
    return {k: v for k, v in coach.items() if k != "password_hash"}


async def ensure_admin_seeded():
    """Make sure the admin coach exists (optional password from ADMIN_PASSWORD)."""
    existing = await db.coaches.find_one({"email": ADMIN_EMAIL}, {"_id": 0})
    pwd_hash = _hash_password(ADMIN_PASSWORD) if ADMIN_PASSWORD else None

    if not existing:
        doc = serialize(Coach(name="Coach Rico", email=ADMIN_EMAIL, role="admin").model_dump())
        if pwd_hash:
            doc["password_hash"] = pwd_hash
        await db.coaches.insert_one(doc)
        logger.info(f"Seeded admin coach: {ADMIN_EMAIL}")
    elif pwd_hash and not existing.get("password_hash"):
        await db.coaches.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"password_hash": pwd_hash}},
        )
        logger.info(f"Set admin password for: {ADMIN_EMAIL}")


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
    from invoice_emails import EAT_ACCENT, EAT_INK, EAT_MUTED, email_layout

    body = f"""
          <h1 style="font-family:Impact,Arial Black,Arial,sans-serif;font-size:20px;color:{EAT_INK};margin:0 0 16px 0;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Your sign-in link</h1>
          <p style="font-size:15px;color:{EAT_INK};line-height:1.65;margin:0 0 24px 0;">
            Tap the button below to sign in to the EAT admin portal. This link expires in 30 minutes and can be used once.
          </p>
          <a href="{magic_url}" style="display:inline-block;background:{EAT_ACCENT};color:{EAT_INK};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;padding:14px 28px;text-decoration:none;border-radius:2px;font-size:12px;">Sign in to EAT</a>
          <p style="font-size:12px;color:{EAT_MUTED};margin:28px 0 0 0;line-height:1.65;">
            If the button doesn&rsquo;t work, copy this link:<br>
            <span style="word-break:break-all;color:{EAT_INK};">{magic_url}</span>
          </p>
    """
    return email_layout(body_html=body)


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


@router.post("/login")
async def login_with_password(req: PasswordLoginRequest):
    email = req.email.lower().strip()
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    coach = await db.coaches.find_one({"email": email}, {"_id": 0})
    if not coach or not coach.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not _verify_password(req.password, coach["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    jwt_token = _create_jwt(coach["email"], coach["id"])
    return {"token": jwt_token, "coach": _coach_public(coach)}


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
    return {"token": jwt_token, "coach": _coach_public(coach)}


@router.get("/me")
async def me(coach: dict = Depends(get_current_coach)):
    return _coach_public(coach)


@router.post("/change-password")
async def change_password(req: PasswordChangeRequest, coach: dict = Depends(get_current_coach)):
    stored = await db.coaches.find_one({"id": coach["id"]}, {"_id": 0})
    if not stored or not stored.get("password_hash"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password login is not set up for this account")

    if not _verify_password(req.current_password, stored["password_hash"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    updated_at = now()
    await db.coaches.update_one(
        {"id": coach["id"]},
        {"$set": {
            "password_hash": _hash_password(req.new_password),
            "password_updated_at": updated_at.isoformat(),
        }},
    )
    return {"status": "ok", "password_updated_at": updated_at.isoformat()}
