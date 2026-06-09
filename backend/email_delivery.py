"""Outbound email via Resend — suppressed in DEV_MODE so testing never emails clients."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import resend

logger = logging.getLogger(__name__)

DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"
resend.api_key = os.environ.get("RESEND_API_KEY", "")


async def send_email(params: dict, *, context: str = "email") -> dict[str, Any]:
    """Send via Resend, or no-op in DEV_MODE (log only)."""
    recipients = params.get("to") or []
    if DEV_MODE:
        logger.info("DEV_MODE: suppressed %s to %s", context, recipients)
        return {"id": None, "suppressed": True, "would_send_to": recipients}
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return result or {}
    except Exception:
        logger.exception("Resend send failed (%s) to %s", context, recipients)
        raise
