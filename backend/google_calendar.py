"""Google Calendar integration for the EAT Portal.

One-way push: every session create/update/cancel/delete pushes to the connected
coach's primary Google Calendar. Idempotent via stored `google_event_id`.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from auth import get_current_coach
from db import db, now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/oauth/google", tags=["google-calendar"])

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")
SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "https://www.googleapis.com/auth/userinfo.email"]

DEFAULT_TZ = "America/New_York"


def _client_config():
    return {
        "web": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }


# ---------- OAuth endpoints ----------

@router.get("/login")
async def google_login(coach: dict = Depends(get_current_coach)):
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured on server")
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
    url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
        state=coach["id"],
    )
    # PKCE: authorization_url sets flow.code_verifier; callback must send it on token exchange.
    if flow.code_verifier:
        await db.coaches.update_one(
            {"id": coach["id"]},
            {"$set": {"google_oauth_pkce_verifier": flow.code_verifier}},
        )
    return {"authorization_url": url}


@router.get("/callback")
async def google_callback(code: str = Query(...), state: str = Query(...)):
    """OAuth redirect target. Exchanges code → tokens, stores on the coach."""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured on server")

    coach = await db.coaches.find_one({"id": state}, {"_id": 0})
    if not coach:
        raise HTTPException(400, "Unknown coach state")

    pkce_verifier = coach.get("google_oauth_pkce_verifier")
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
    if pkce_verifier:
        flow.code_verifier = pkce_verifier

    try:
        await asyncio.to_thread(flow.fetch_token, code=code)
    except Exception as exc:
        logger.error("Google token exchange failed: %s", exc)
        await db.coaches.update_one(
            {"id": coach["id"]},
            {"$unset": {"google_oauth_pkce_verifier": ""}},
        )
        return RedirectResponse(f"{APP_BASE_URL}/settings?google=error")

    creds = flow.credentials
    if not creds or not creds.token:
        logger.error("Google token exchange returned no credentials")
        await db.coaches.update_one(
            {"id": coach["id"]},
            {"$unset": {"google_oauth_pkce_verifier": ""}},
        )
        return RedirectResponse(f"{APP_BASE_URL}/settings?google=error")

    user_info = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
        timeout=10,
    ).json()

    if creds.expiry:
        expires_at = creds.expiry.replace(tzinfo=timezone.utc).isoformat()
    else:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=3600)).isoformat()

    payload = {
        "google_tokens": {
            "access_token": creds.token,
            "refresh_token": creds.refresh_token or coach.get("google_tokens", {}).get("refresh_token"),
            "scope": " ".join(creds.scopes) if creds.scopes else None,
            "token_type": "Bearer",
            "expires_at": expires_at,
        },
        "google_email": user_info.get("email"),
        "google_connected_at": now().isoformat(),
    }
    await db.coaches.update_one(
        {"id": coach["id"]},
        {"$set": payload, "$unset": {"google_oauth_pkce_verifier": ""}},
    )

    # Backfill: push all upcoming sessions on first connect
    asyncio.create_task(backfill_upcoming(coach["id"]))

    return RedirectResponse(f"{APP_BASE_URL}/settings?google=connected")


@router.get("/status")
async def google_status(coach: dict = Depends(get_current_coach)):
    fresh = await db.coaches.find_one({"id": coach["id"]}, {"_id": 0})
    tokens = (fresh or {}).get("google_tokens") or {}
    connected = bool(tokens.get("refresh_token") or tokens.get("access_token"))
    return {
        "connected": connected,
        "email": (fresh or {}).get("google_email") if connected else None,
        "connected_at": (fresh or {}).get("google_connected_at") if connected else None,
    }


@router.delete("")
async def google_disconnect(coach: dict = Depends(get_current_coach)):
    await db.coaches.update_one(
        {"id": coach["id"]},
        {"$unset": {
            "google_tokens": "",
            "google_email": "",
            "google_connected_at": "",
            "google_oauth_pkce_verifier": "",
        }},
    )
    return {"status": "disconnected"}


# ---------- Credentials helper ----------

async def _creds_for(coach_id: str) -> Optional[Credentials]:
    coach = await db.coaches.find_one({"id": coach_id}, {"_id": 0})
    if not coach or not coach.get("google_tokens"):
        return None
    tk = coach["google_tokens"]
    creds = Credentials(
        token=tk.get("access_token"),
        refresh_token=tk.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=SCOPES,
    )
    if creds.expired and creds.refresh_token:
        try:
            await asyncio.to_thread(creds.refresh, GoogleRequest())
            await db.coaches.update_one(
                {"id": coach_id},
                {"$set": {
                    "google_tokens.access_token": creds.token,
                    "google_tokens.expires_at": (datetime.now(timezone.utc) + timedelta(seconds=3600)).isoformat(),
                }},
            )
        except Exception as e:
            logger.error(f"Refresh failed for coach {coach_id}: {e}")
            return None
    return creds


# ---------- Event mapping ----------

PROGRAM_TITLE = {
    "full_time": "EAT · Full-Time Training",
    "private": "EAT · Private Lesson",
    "semi_private": "EAT · Semi-Private Lesson",
}


def _session_to_event(session: dict, athlete_names: list[str]) -> dict:
    """Build a Google Calendar event body from an EAT session document."""
    sdate = session["date"]  # ISO yyyy-mm-dd
    start_t = session.get("start_time") or "09:00"
    end_t = session.get("end_time") or "10:00"

    summary = PROGRAM_TITLE.get(session.get("session_type"), "EAT · Session")

    desc_lines = []
    if athlete_names:
        desc_lines.append("Athletes: " + ", ".join(athlete_names))
    if session.get("notes"):
        desc_lines.append("")
        desc_lines.append(session["notes"])
    desc_lines.append("")
    desc_lines.append(f"EAT Session ID: {session['id']}")

    body = {
        "summary": summary,
        "location": session.get("location") or "",
        "description": "\n".join(desc_lines),
        "start": {"dateTime": f"{sdate}T{start_t}:00", "timeZone": DEFAULT_TZ},
        "end": {"dateTime": f"{sdate}T{end_t}:00", "timeZone": DEFAULT_TZ},
        "status": "cancelled" if session.get("status") == "cancelled" else "confirmed",
        "extendedProperties": {"private": {"eat_session_id": session["id"]}},
        "transparency": "opaque",
    }
    return body


# ---------- Sync helpers (called from routes_sessions) ----------

async def _athlete_names(athlete_ids: list[str]) -> list[str]:
    if not athlete_ids:
        return []
    docs = await db.athletes.find({"id": {"$in": athlete_ids}}, {"_id": 0, "full_name": 1}).to_list(500)
    return [d["full_name"] for d in docs]


async def _connected_coach_id() -> Optional[str]:
    # Single-admin: pick the only coach that has google tokens.
    c = await db.coaches.find_one({"google_tokens.refresh_token": {"$exists": True}}, {"_id": 0, "id": 1})
    return c["id"] if c else None


async def push_session(session_id: str) -> None:
    """Upsert a session as a Google Calendar event for the connected coach."""
    coach_id = await _connected_coach_id()
    if not coach_id:
        return
    creds = await _creds_for(coach_id)
    if not creds:
        return
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        return
    names = await _athlete_names(session.get("athlete_ids") or [])
    body = _session_to_event(session, names)
    google_event_id = session.get("google_event_id")

    def _do():
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        if google_event_id:
            try:
                return service.events().update(
                    calendarId="primary", eventId=google_event_id, body=body
                ).execute()
            except HttpError as he:
                if he.resp.status == 404:
                    return service.events().insert(calendarId="primary", body=body).execute()
                raise
        return service.events().insert(calendarId="primary", body=body).execute()

    try:
        result = await asyncio.to_thread(_do)
        new_id = result.get("id")
        if new_id and new_id != google_event_id:
            await db.sessions.update_one({"id": session_id}, {"$set": {"google_event_id": new_id}})
    except Exception as e:
        logger.error(f"Google push failed for session {session_id}: {e}")


async def delete_session_event(session: dict) -> None:
    coach_id = await _connected_coach_id()
    if not coach_id:
        return
    google_event_id = session.get("google_event_id")
    if not google_event_id:
        return
    creds = await _creds_for(coach_id)
    if not creds:
        return

    def _do():
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        service.events().delete(calendarId="primary", eventId=google_event_id).execute()

    try:
        await asyncio.to_thread(_do)
    except Exception as e:
        logger.warning(f"Google delete failed (non-fatal) for event {google_event_id}: {e}")


async def backfill_upcoming(coach_id: str) -> None:
    """On first connect, push all sessions from today forward."""
    today = date.today().isoformat()
    cursor = db.sessions.find({"date": {"$gte": today}}, {"_id": 0})
    async for s in cursor:
        try:
            await push_session(s["id"])
        except Exception as e:
            logger.error(f"Backfill failed for {s.get('id')}: {e}")
