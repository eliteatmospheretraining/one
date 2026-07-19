"""
Sync athletes + families from the Notion Master Client Directory.

Property mapping (Notion → app):
  Athlete Name (title)           → athlete.full_name
  Date of Birth                  → athlete.date_of_birth
  Training Start                 → athlete.training_start_date
  UTR / WTN                      → athlete.utr / wtn
  Shirt Size (multi_select)      → athlete.shirt_size
  Program (select)               → athlete.program_type / program_types
  Status (select)                → athlete.status
  Primary Contact (email*)       → family.guardian_name  (*Notion type is email; stores parent name)
  Primary Number                 → family.guardian_phone
  Primary Email                  → family.guardian_email (+ sibling family match)
  Secondary Contact (email*)     → family.guardian_name_secondary
  Secondary Number               → family.guardian_phone_secondary
  Secondary Email                → family.guardian_email_secondary

Sibling families: match by normalized primary email, else primary phone + primary contact name.
Athlete upsert key: Notion page ID → athlete.notion_page_id

Portal edits win for family_name: Notion has no family-name column (it is derived from
the athlete's last name on create only). Sync never overwrites an existing family's name.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import requests

from db import db, serialize
from models import Athlete, AthleteStatus, ProgramType
from notion_rates import (
    _find_prop,
    _normalize_database_id,
    _notion_headers,
    _number,
    _plain_text,
    _resolve_database_id,
)
from roster_sync_store import get_roster_sync_status, set_roster_sync_status

logger = logging.getLogger(__name__)

PROGRAM_ALIASES = {
    "eat w/ eat": ProgramType.full_time.value,
    "eat with eat": ProgramType.full_time.value,
    "full time": ProgramType.full_time.value,
    "private lesson – youth": ProgramType.private.value,
    "private lesson - youth": ProgramType.private.value,
    "private lesson youth": ProgramType.private.value,
    "private lesson – adult": ProgramType.private.value,
    "private lesson - adult": ProgramType.private.value,
    "private lesson adult": ProgramType.private.value,
    "private": ProgramType.private.value,
}

STATUS_ALIASES = {
    "active": AthleteStatus.active.value,
    "archived": AthleteStatus.archived.value,
}

SKIP_ATHLETE_NAMES = frozenset({"new client", "template"})


def clients_configured() -> bool:
    return bool(
        os.environ.get("NOTION_API_KEY", "").strip()
        and os.environ.get("NOTION_CLIENTS_DATABASE_ID", "").strip()
    )


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def _normalize_phone(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _looks_like_email(value: str) -> bool:
    return "@" in value and "." in value.split("@")[-1]


def _contact_name(prop: dict | None) -> str:
    """Primary/Secondary Contact use Notion email fields but often store a name."""
    if not prop:
        return ""
    ptype = prop.get("type")
    if ptype == "email":
        return (prop.get("email") or "").strip()
    return _plain_text(prop)


def _email(prop: dict | None) -> str:
    if not prop or prop.get("type") != "email":
        return ""
    val = (prop.get("email") or "").strip()
    return val if _looks_like_email(val) else ""


def _phone(prop: dict | None) -> str:
    if not prop or prop.get("type") != "phone_number":
        return ""
    return (prop.get("phone_number") or "").strip()


def _date_start(prop: dict | None) -> str | None:
    if not prop or prop.get("type") != "date":
        return None
    block = prop.get("date") or {}
    start = block.get("start")
    if not start:
        return None
    return start[:10]


def _multi_select(prop: dict | None) -> str | None:
    if not prop or prop.get("type") != "multi_select":
        return None
    names = [item.get("name", "") for item in prop.get("multi_select") or [] if item.get("name")]
    return ", ".join(names) if names else None


def _map_program(raw: str) -> str | None:
    key = raw.strip().lower().replace("—", "-").replace("–", "-")
    if not key:
        return None
    if key in PROGRAM_ALIASES:
        return PROGRAM_ALIASES[key]
    normalized = re.sub(r"\s+", " ", key)
    return PROGRAM_ALIASES.get(normalized)


def _map_status(raw: str) -> str:
    key = raw.strip().lower()
    return STATUS_ALIASES.get(key, AthleteStatus.active.value)


def _derive_family_name(full_name: str) -> str:
    parts = (full_name or "").strip().split()
    if not parts:
        return "Family"
    return parts[-1] if len(parts) > 1 else parts[0]


def _family_lookup_key(
    guardian_email: str,
    guardian_phone: str,
    guardian_name: str,
    notion_page_id: str,
) -> str:
    email = _normalize_email(guardian_email)
    if email:
        return f"email:{email}"
    phone = _normalize_phone(guardian_phone)
    name = (guardian_name or "").strip().lower()
    if phone and name:
        return f"phone:{phone}|{name}"
    if phone:
        return f"phone:{phone}"
    return f"notion:{notion_page_id}"


def _parse_row(page: dict) -> dict[str, Any] | None:
    props = page.get("properties") or {}
    name_prop = _find_prop(props, "Athlete Name", "Name", "Athlete")
    full_name = _plain_text(name_prop).strip()
    if not full_name or full_name.lower() in SKIP_ATHLETE_NAMES:
        return None

    program_raw = _plain_text(_find_prop(props, "Program"))
    program_type = _map_program(program_raw)
    program_types = [program_type] if program_type else []

    notion_page_id = page["id"].replace("-", "")
    guardian_name = _contact_name(_find_prop(props, "Primary Contact"))
    guardian_email = _email(_find_prop(props, "Primary Email")) or None
    guardian_phone = _phone(_find_prop(props, "Primary Number")) or None
    lookup = _family_lookup_key(
        guardian_email or "",
        guardian_phone or "",
        guardian_name,
        notion_page_id,
    )

    return {
        "notion_page_id": notion_page_id,
        "notion_page_id_raw": page["id"],
        "full_name": full_name,
        "date_of_birth": _date_start(_find_prop(props, "Date of Birth")),
        "training_start_date": _date_start(_find_prop(props, "Training Start")),
        "utr": _number(_find_prop(props, "UTR")),
        "wtn": _number(_find_prop(props, "WTN")),
        "shirt_size": _multi_select(_find_prop(props, "Shirt Size")),
        "program_type": program_type,
        "program_types": program_types,
        "status": _map_status(_plain_text(_find_prop(props, "Status")) or "Active"),
        "family_name": _derive_family_name(full_name),
        "guardian_name": guardian_name or None,
        "guardian_email": guardian_email,
        "guardian_phone": guardian_phone,
        "guardian_name_secondary": _contact_name(_find_prop(props, "Secondary Contact")) or None,
        "guardian_email_secondary": _email(_find_prop(props, "Secondary Email")) or None,
        "guardian_phone_secondary": _phone(_find_prop(props, "Secondary Number")) or None,
        "family_lookup_key": lookup,
    }


def fetch_client_rows_from_notion() -> list[dict[str, Any]]:
    token = os.environ.get("NOTION_API_KEY", "").strip()
    page_or_db = os.environ.get("NOTION_CLIENTS_DATABASE_ID", "").strip()
    if not token or not page_or_db:
        raise ValueError("NOTION_API_KEY and NOTION_CLIENTS_DATABASE_ID are required")

    headers = _notion_headers(token)
    database_id = _resolve_database_id(page_or_db, headers)
    rows: list[dict[str, Any]] = []
    cursor = None
    while True:
        body: dict[str, Any] = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        resp = requests.post(
            f"https://api.notion.com/v1/databases/{database_id}/query",
            headers=headers,
            json=body,
            timeout=30,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Notion API error {resp.status_code}: {resp.text[:300]}")

        payload = resp.json()
        for page in payload.get("results", []):
            parsed = _parse_row(page)
            if parsed:
                rows.append(parsed)

        if not payload.get("has_more"):
            break
        cursor = payload.get("next_cursor")

    if not rows:
        raise ValueError("No client rows found in Notion (check Athlete Name column)")

    return rows


def _family_payload_from_row(row: dict[str, Any]) -> dict[str, Any]:
    lookup = row["family_lookup_key"]
    emergency = []
    if row.get("guardian_name"):
        emergency.append({
            "name": row["guardian_name"],
            "email": row.get("guardian_email"),
            "phone": row.get("guardian_phone"),
        })
    return {
        "family_name": row["family_name"],
        "guardian_name": row.get("guardian_name"),
        "guardian_email": row.get("guardian_email"),
        "guardian_phone": row.get("guardian_phone"),
        "guardian_name_secondary": row.get("guardian_name_secondary"),
        "guardian_email_secondary": row.get("guardian_email_secondary"),
        "guardian_phone_secondary": row.get("guardian_phone_secondary"),
        "emergency_contacts": emergency,
        "emergency_contact_name": row.get("guardian_name"),
        "emergency_contact_email": row.get("guardian_email"),
        "emergency_contact_phone": row.get("guardian_phone"),
        "notion_lookup_key": lookup,
    }


def _athlete_payload_from_row(row: dict[str, Any], family_id: str) -> dict[str, Any]:
    return {
        "full_name": row["full_name"],
        "date_of_birth": row["date_of_birth"],
        "training_start_date": row["training_start_date"],
        "utr": row["utr"],
        "wtn": row["wtn"],
        "shirt_size": row["shirt_size"],
        "program_type": row["program_type"],
        "program_types": row["program_types"],
        "status": row["status"],
        "family_id": family_id,
        "notion_page_id": row["notion_page_id"],
    }


async def _upsert_family(row: dict[str, Any], families_by_lookup: dict[str, dict]) -> str:
    lookup = row["family_lookup_key"]
    payload = _family_payload_from_row(row)
    existing = families_by_lookup.get(lookup)

    if existing:
        # family_name is derived from athlete last name in Notion — never clobber a
        # name set in the portal or MongoDB after the family was created.
        payload.pop("family_name", None)
        await db.families.update_one({"id": existing["id"]}, {"$set": serialize(payload)})
        return existing["id"]

    doc = serialize(payload)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.families.insert_one(doc)
    families_by_lookup[lookup] = doc
    return doc["id"]


async def _upsert_athlete(
    row: dict[str, Any],
    family_id: str,
    athletes_by_notion: dict[str, dict],
) -> str:
    notion_id = row["notion_page_id"]
    athlete_data = _athlete_payload_from_row(row, family_id)
    existing = athletes_by_notion.get(notion_id)

    if existing:
        await db.athletes.update_one({"id": existing["id"]}, {"$set": serialize(athlete_data)})
        return "updated"

    athlete = Athlete(**athlete_data)
    doc = serialize(athlete.model_dump())
    doc["notion_page_id"] = notion_id
    await db.athletes.insert_one(doc)
    athletes_by_notion[notion_id] = doc
    return "created"


async def refresh_roster_from_notion() -> dict[str, Any]:
    import asyncio

    notion_url = os.environ.get("NOTION_CLIENTS_URL", "").strip() or None
    stats = {"created": 0, "updated": 0, "skipped": 0, "errors": []}

    try:
        rows = await asyncio.to_thread(fetch_client_rows_from_notion)
        lookup_keys = list({row["family_lookup_key"] for row in rows})
        notion_ids = [row["notion_page_id"] for row in rows]

        existing_families = await db.families.find(
            {"notion_lookup_key": {"$in": lookup_keys}},
            {"_id": 0},
        ).to_list(5000)
        families_by_lookup = {
            fam["notion_lookup_key"]: fam
            for fam in existing_families
            if fam.get("notion_lookup_key")
        }

        existing_athletes = await db.athletes.find(
            {"notion_page_id": {"$in": notion_ids}},
            {"_id": 0},
        ).to_list(5000)
        athletes_by_notion = {
            ath["notion_page_id"]: ath
            for ath in existing_athletes
            if ath.get("notion_page_id")
        }

        for row in rows:
            try:
                family_id = await _upsert_family(row, families_by_lookup)
                result = await _upsert_athlete(row, family_id, athletes_by_notion)
                stats[result] += 1
            except Exception as exc:
                stats["skipped"] += 1
                stats["errors"].append(f"{row['full_name']}: {exc}")
                logger.warning("Roster sync row failed (%s): %s", row.get("full_name"), exc)

        logger.info(
            "Roster synced from Notion (%d created, %d updated, %d skipped)",
            stats["created"],
            stats["updated"],
            stats["skipped"],
        )
        return set_roster_sync_status(notion_url=notion_url, error=None, stats=stats)
    except Exception as exc:
        logger.warning("Notion roster sync failed: %s", exc)
        set_roster_sync_status(notion_url=notion_url, error=str(exc), stats=stats)
        return get_roster_sync_status()
