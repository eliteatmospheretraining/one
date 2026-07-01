"""Parent magic links for standalone waiver signing."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException

from db import db, now, serialize

WAIVER_LINK_DAYS = 30


def waiver_sign_url(token: str, app_base_url: str) -> str:
    return f"{app_base_url.rstrip('/')}/waiver?token={token}"


def waiver_pdf_url(token: str, app_base_url: str) -> str:
    return f"{app_base_url.rstrip('/')}/api/waiver-access/pdf?token={token}"


async def create_waiver_access_token(*, athlete_id: str, email: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.waiver_access_tokens.insert_one(serialize({
        "token": token,
        "athlete_id": athlete_id,
        "email": email.lower().strip(),
        "expires_at": now() + timedelta(days=WAIVER_LINK_DAYS),
        "signed_at": None,
        "created_at": now(),
    }))
    return token


async def resolve_waiver_access_token(token: str, *, require_unsigned: bool = False) -> dict:
    rec = await db.waiver_access_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Invalid or expired link")

    exp = rec.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp and exp < now():
        raise HTTPException(400, "This waiver link has expired")

    if require_unsigned and rec.get("signed_at"):
        raise HTTPException(400, "This waiver link has already been used")

    athlete = await db.athletes.find_one({"id": rec["athlete_id"]}, {"_id": 0})
    if not athlete:
        raise HTTPException(404, "Athlete not found")

    family = await db.families.find_one({"id": athlete["family_id"]}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")

    guardian_email = (family.get("guardian_email") or "").lower().strip()
    if rec["email"] != guardian_email:
        raise HTTPException(403, "This link is not valid for this athlete")

    return {"access": rec, "athlete": athlete, "family": family}
