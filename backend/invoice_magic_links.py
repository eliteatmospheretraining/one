"""Guardian magic links for viewing invoices (due / paid receipts)."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException

from db import db, now, serialize

DUE_LINK_DAYS = 30
PAID_LINK_DAYS = 365


def invoice_view_url(token: str, app_base_url: str) -> str:
    return f"{app_base_url.rstrip('/')}/invoice?token={token}"


def invoice_pdf_url(token: str, app_base_url: str) -> str:
    return f"{app_base_url.rstrip('/')}/api/invoice-access/pdf?token={token}"


async def create_invoice_access_token(*, invoice_id: str, email: str, kind: str) -> str:
    token = secrets.token_urlsafe(32)
    days = PAID_LINK_DAYS if kind == "paid" else DUE_LINK_DAYS
    await db.invoice_access_tokens.insert_one(serialize({
        "token": token,
        "invoice_id": invoice_id,
        "email": email.lower().strip(),
        "kind": kind,
        "expires_at": now() + timedelta(days=days),
        "created_at": now(),
    }))
    return token


async def resolve_invoice_access_token(token: str) -> dict:
    rec = await db.invoice_access_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Invalid or expired link")

    exp = rec.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp and exp < now():
        raise HTTPException(400, "This invoice link has expired")

    inv = await db.invoices.find_one({"id": rec["invoice_id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")

    family = await db.families.find_one({"id": inv["family_id"]}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")

    guardian_email = (family.get("guardian_email") or "").lower().strip()
    if rec["email"] != guardian_email:
        raise HTTPException(403, "This link is not valid for this invoice")

    return {"access": rec, "invoice": inv, "family": family}
