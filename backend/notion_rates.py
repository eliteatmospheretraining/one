"""
Sync services + rates from a Notion database.

Expected database columns (names configurable via env):
  - Key (rich_text or select): billing key, e.g. full_day, half_day, weekly, monthly
  - Rate (number): dollar amount ($/day for full_day, $/month for monthly, etc.)

Package keys (June 2026): weekly, weekly_half, monthly, monthly_half

Optional:
  - Active (checkbox): if false, row is ignored
  - Hours / Duration (number): billable block for full-time rows

Full-time duration blocks (edit in Notion, applied on Sync):
  - Row Key ``full_day_hours`` with Rate = 5  (or Hours on a ``full_day`` row)
  - Row Key ``half_day_hours`` with Rate = 2.5

Title column is used as a label only when Key is empty (slugified).
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

import requests

from models import RATE_CARD as DEFAULT_RATE_CARD
from rate_card_store import apply_rate_card, get_rate_card_status, reset_rate_card_to_default

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"
KNOWN_KEYS = set(DEFAULT_RATE_CARD.keys())

KEY_ALIASES = {
    "full day": "full_day",
    "full-day": "full_day",
    "fullday": "full_day",
    "full day hours": "full_day_hours",
    "full-day hours": "full_day_hours",
    "full day duration": "full_day_hours",
    "full time full day": "full_day_hours",
    "full time full day hours": "full_day_hours",
    "half day": "half_day",
    "half-day": "half_day",
    "halfday": "half_day",
    "half day hours": "half_day_hours",
    "half-day hours": "half_day_hours",
    "half day duration": "half_day_hours",
    "full time half day": "half_day_hours",
    "full time half day hours": "half_day_hours",
    "weekly": "weekly",
    "weekly rate": "weekly",
    "eat weekly": "weekly",
    "weekly full": "weekly",
    "weekly full day": "weekly",
    "weekly_full": "weekly",
    "weekly half": "weekly_half",
    "weekly half day": "weekly_half",
    "weekly half-day": "weekly_half",
    "monthly": "monthly",
    "monthly rate": "monthly",
    "eat monthly": "monthly",
    "monthly full": "monthly",
    "monthly full day": "monthly",
    "monthly half": "monthly_half",
    "monthly half day": "monthly_half",
    "monthly half-day": "monthly_half",
    "monthly legacy": "monthly_legacy",
    "monthly_legacy": "monthly_legacy",
    "legacy monthly": "monthly_legacy",
    "drop in": "drop_in",
    "drop-in": "drop_in",
    "drop in full": "drop_in",
    "drop-in full": "drop_in",
    "drop in half": "drop_in",
    "drop-in half": "drop_in",
    "drop_in_full": "drop_in",
    "drop_in_half": "drop_in",
    "semi private": "semi_private",
    "semi-private": "semi_private",
    "semiprivate": "semi_private",
}

KNOWN_KEY_HINT = ", ".join(sorted(k for k in KNOWN_KEYS if not k.endswith("_hours")))


def _slug_key(raw: str) -> str | None:
    s = raw.strip().lower()
    if not s:
        return None
    if s in KEY_ALIASES:
        return KEY_ALIASES[s]
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s if s in KNOWN_KEYS else None


def _plain_text(prop: dict | None) -> str:
    if not prop:
        return ""
    ptype = prop.get("type")
    if ptype == "title":
        return "".join(t.get("plain_text", "") for t in prop.get("title") or [])
    if ptype == "rich_text":
        return "".join(t.get("plain_text", "") for t in prop.get("rich_text") or [])
    if ptype == "select":
        sel = prop.get("select")
        return (sel or {}).get("name", "") or ""
    if ptype == "status":
        st = prop.get("status")
        return (st or {}).get("name", "") or ""
    return ""


def _number(prop: dict | None) -> float | None:
    if not prop or prop.get("type") != "number":
        return None
    val = prop.get("number")
    if val is None:
        return None
    return float(val)


def _checkbox(prop: dict | None) -> bool:
    if not prop or prop.get("type") != "checkbox":
        return True
    return bool(prop.get("checkbox", True))


def _find_prop(props: dict, *names: str) -> dict | None:
    for name in names:
        if name in props:
            return props[name]
    lower = {k.lower(): v for k, v in props.items()}
    for name in names:
        if name.lower() in lower:
            return lower[name.lower()]
    return None


_DURATION_KEYS = frozenset({"full_day_hours", "half_day_hours"})
_DURATION_FROM_SERVICE_KEY = {
    "full_day": "full_day_hours",
}


def _row_label(properties: dict, key_prop: str) -> str:
    key_field = _find_prop(properties, key_prop, "Key", "Service Key", "Code", "Slug")
    key_raw = _plain_text(key_field)
    if key_raw:
        return key_raw
    title_field = _find_prop(properties, "Name", "Service", "Title")
    return _plain_text(title_field) or "(untitled row)"


def _row_skip_reason(
    properties: dict,
    key_prop: str,
    rate_prop: str,
    hours_prop_names: tuple[str, ...],
) -> dict | None:
    """Return skip metadata when a Notion row is visible but not applied."""
    active_prop = _find_prop(properties, "Active", "active", "Enabled")
    if active_prop is not None and not _checkbox(active_prop):
        return None

    label = _row_label(properties, key_prop)
    key_field = _find_prop(properties, key_prop, "Key", "Service Key", "Code", "Slug")
    rate_field = _find_prop(properties, rate_prop, "Rate", "Price", "Amount", "Cost")
    hours_field = _find_prop(properties, *hours_prop_names)

    key_raw = _plain_text(key_field)
    if not key_raw:
        title_field = _find_prop(properties, "Name", "Service", "Title")
        key_raw = _plain_text(title_field)

    key = _slug_key(key_raw)
    if key:
        return None

    amount = _number(rate_field)
    block_hours = _number(hours_field)
    if amount is None and block_hours is None:
        return {"label": label, "reason": "Missing Rate (or Hours for duration rows)"}

    return {
        "label": label,
        "reason": f"Unknown Key — set Key to one of: {KNOWN_KEY_HINT}",
    }


def _parse_row(
    properties: dict,
    key_prop: str,
    rate_prop: str,
    hours_prop_names: tuple[str, ...],
) -> dict[str, float] | None:
    active_prop = _find_prop(properties, "Active", "active", "Enabled")
    if active_prop is not None and not _checkbox(active_prop):
        return None

    key_field = _find_prop(properties, key_prop, "Key", "Service Key", "Code", "Slug")
    rate_field = _find_prop(properties, rate_prop, "Rate", "Price", "Amount", "Cost")

    key_raw = _plain_text(key_field)
    if not key_raw:
        title_field = _find_prop(properties, "Name", "Service", "Title")
        key_raw = _plain_text(title_field)

    key = _slug_key(key_raw)
    if not key:
        return None

    amount = _number(rate_field)
    hours_field = _find_prop(properties, *hours_prop_names)
    block_hours = _number(hours_field)

    out: dict[str, float] = {}

    if key in _DURATION_KEYS:
        if amount is None and block_hours is None:
            return None
        out[key] = float(block_hours if block_hours is not None else amount)
        return out

    if amount is None:
        return None

    out[key] = amount

    if block_hours is not None:
        duration_key = _DURATION_FROM_SERVICE_KEY.get(key)
        if duration_key:
            out[duration_key] = block_hours

    return out


def _normalize_database_id(raw: str) -> str:
    """Strip URL query/hash fragments accidentally pasted from Notion links."""
    s = raw.strip().split("?")[0].split("#")[0].strip()
    return s.replace("-", "")


def _notion_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _find_child_database_id(block_id: str, headers: dict[str, str]) -> str | None:
    """Walk page blocks until we find an embedded database (Service Rates table)."""
    cursor = None
    while True:
        params: dict[str, str] = {}
        if cursor:
            params["start_cursor"] = cursor
        resp = requests.get(
            f"https://api.notion.com/v1/blocks/{block_id}/children",
            headers=headers,
            params=params,
            timeout=30,
        )
        if resp.status_code >= 400:
            return None

        payload = resp.json()
        for block in payload.get("results", []):
            if block.get("type") == "child_database":
                return _normalize_database_id(block["id"])
            if block.get("has_children"):
                nested = _find_child_database_id(block["id"], headers)
                if nested:
                    return nested

        if not payload.get("has_more"):
            break
        cursor = payload.get("next_cursor")
    return None


def _resolve_database_id(page_or_db_id: str, headers: dict[str, str]) -> str:
    """Accept a database ID or a Notion page URL/ID that contains the rates table."""
    normalized = _normalize_database_id(page_or_db_id)
    probe = requests.post(
        f"https://api.notion.com/v1/databases/{normalized}/query",
        headers=headers,
        json={"page_size": 1},
        timeout=30,
    )
    if probe.status_code == 200:
        return normalized

    if probe.status_code == 400 and "page" in probe.text.lower():
        child = _find_child_database_id(normalized, headers)
        if child:
            logger.info("Resolved Notion rates database inside page %s", normalized)
            return child
        raise ValueError(
            "NOTION_RATES_DATABASE_ID points to a page with no embedded database. "
            "Open the table in Notion → ⋯ → Copy link to database, or paste the database ID."
        )

    raise RuntimeError(f"Notion API error {probe.status_code}: {probe.text[:300]}")


def _query_database(
    database_id: str,
    headers: dict[str, str],
    key_prop: str,
    rate_prop: str,
    hours_prop_names: tuple[str, ...],
) -> tuple[dict[str, float], list[dict]]:
    rates: dict[str, float] = {}
    skipped: list[dict] = []
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
        for row in payload.get("results", []):
            props = row.get("properties", {})
            parsed = _parse_row(
                props,
                key_prop,
                rate_prop,
                hours_prop_names,
            )
            if parsed:
                rates.update(parsed)
                continue
            skip = _row_skip_reason(props, key_prop, rate_prop, hours_prop_names)
            if skip:
                skipped.append(skip)

        if not payload.get("has_more"):
            break
        cursor = payload.get("next_cursor")

    if not rates:
        raise ValueError("No rate rows found in Notion database (check Key + Rate columns)")

    return rates, skipped


def fetch_rates_from_notion() -> tuple[dict[str, float], list[dict]]:
    token = os.environ.get("NOTION_API_KEY", "").strip()
    page_or_db = os.environ.get("NOTION_RATES_DATABASE_ID", "").strip()
    if not token or not page_or_db:
        raise ValueError("NOTION_API_KEY and NOTION_RATES_DATABASE_ID are required")

    key_prop = os.environ.get("NOTION_RATE_KEY_PROPERTY", "Key")
    rate_prop = os.environ.get("NOTION_RATE_AMOUNT_PROPERTY", "Rate")
    hours_prop = os.environ.get("NOTION_RATE_HOURS_PROPERTY", "Hours")
    hours_names = tuple(
        n.strip()
        for n in (hours_prop, "Duration", "Block", "Billable Hours", "Hours")
        if n.strip()
    )
    headers = _notion_headers(token)
    database_id = _resolve_database_id(page_or_db, headers)
    return _query_database(database_id, headers, key_prop, rate_prop, hours_names)


async def refresh_rate_card_from_notion() -> dict[str, Any]:
    import asyncio

    notion_url = os.environ.get("NOTION_RATES_URL", "").strip() or None
    try:
        rates, skipped = await asyncio.to_thread(fetch_rates_from_notion)
        warnings = [
            f"{row['label']}: {row['reason']}"
            for row in skipped
        ]
        apply_rate_card(
            rates,
            source="notion",
            notion_url=notion_url,
            error=None,
            warnings=warnings,
            skipped_rows=skipped,
        )
        logger.info("Rate card synced from Notion (%d keys, %d skipped)", len(rates), len(skipped))
        return get_rate_card_status()
    except Exception as exc:
        logger.warning("Notion rate sync failed: %s", exc)
        reset_rate_card_to_default(error=str(exc))
        return get_rate_card_status()


def notion_configured() -> bool:
    return bool(os.environ.get("NOTION_API_KEY", "").strip() and os.environ.get("NOTION_RATES_DATABASE_ID", "").strip())
