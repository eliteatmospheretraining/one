"""Send and preview guardian invoice emails via Resend."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend
from fastapi import HTTPException

from db import now
from invoice_emails import build_invoice_email_html
from invoice_magic_links import create_invoice_access_token, invoice_pdf_url, invoice_view_url

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.environ["SENDER_EMAIL"]
APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"
resend.api_key = os.environ["RESEND_API_KEY"]


async def _email_context(invoice_id: str) -> dict:
    from routes_invoices import _build_pdf

    pdf_bytes, filename, ctx = await _build_pdf(invoice_id)
    return {**ctx, "pdf_bytes": pdf_bytes, "filename": filename}


async def build_preview_html(invoice_id: str, kind: str) -> tuple[str, str, str]:
    if kind not in ("due", "paid"):
        raise HTTPException(400, "kind must be 'due' or 'paid'")
    ctx = await _email_context(invoice_id)
    inv = ctx["invoice"]
    family = ctx["family"]
    magic_url = invoice_view_url("preview-token", APP_BASE_URL)
    pdf_url = invoice_pdf_url("preview-token", APP_BASE_URL)
    payment = None
    if kind == "paid":
        from db import db
        payments = await db.payments.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1)
        if payments:
            payment = payments[0]
        else:
            # Preview sample when invoice is not paid yet
            payment = {
                "amount_received": inv.get("total"),
                "method": "Zelle",
                "received_date": inv.get("issue_date"),
            }
    subject, html = _subject_and_html(kind, inv, family, magic_url, pdf_url, payment)
    return subject, html, magic_url


def _subject_and_html(kind: str, inv: dict, family: dict, magic_url: str, pdf_url: str, payment: Optional[dict]):
    pay_amount = pay_method = pay_date = None
    if payment:
        pay_amount = float(payment.get("amount_received", 0))
        pay_method = payment.get("method")
        pay_date = str(payment.get("received_date", ""))[:10]
    return build_invoice_email_html(
        kind=kind,
        guardian_name=family["guardian_name"],
        invoice_number=inv["invoice_number"],
        period_start=inv["period_start"],
        period_end=inv["period_end"],
        total=float(inv["total"]),
        magic_url=magic_url,
        pdf_url=pdf_url,
        payment_amount=pay_amount,
        payment_method=pay_method,
        payment_date=pay_date,
    )


async def send_guardian_invoice_email(invoice_id: str, kind: str) -> dict:
    if kind not in ("due", "paid"):
        raise HTTPException(400, "kind must be 'due' or 'paid'")
    ctx = await _email_context(invoice_id)
    inv = ctx["invoice"]
    family = ctx["family"]
    email = (family.get("guardian_email") or "").strip()
    if not email:
        raise HTTPException(400, "Family has no guardian email")

    token = await create_invoice_access_token(
        invoice_id=invoice_id,
        email=email,
        kind=kind,
    )
    magic_url = invoice_view_url(token, APP_BASE_URL)
    pdf_url = invoice_pdf_url(token, APP_BASE_URL)

    from db import db
    payment = None
    if kind == "paid":
        payments = await db.payments.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1)
        if not payments:
            raise HTTPException(400, "Record a payment before sending a paid receipt email")
        payment = payments[0]

    subject, html = _subject_and_html(kind, inv, family, magic_url, pdf_url, payment)

    params = {
        "from": f"Elite Atmosphere Training <{SENDER_EMAIL}>",
        "to": [email],
        "subject": subject,
        "html": html,
        "attachments": [{
            "filename": ctx["filename"],
            "content": list(ctx["pdf_bytes"]),
        }],
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        email_id = (result or {}).get("id")
    except Exception as e:
        logger.error(f"Resend invoice email ({kind}) failed: {e}")
        raise HTTPException(500, f"Email send failed: {e}")

    resp = {
        "status": "sent",
        "kind": kind,
        "email_id": email_id,
        "magic_url": magic_url,
    }
    if DEV_MODE:
        resp["dev_magic_url"] = magic_url
    return resp
