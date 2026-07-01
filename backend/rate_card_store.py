"""In-memory rate card used for attendance billing and invoices."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from models import RATE_CARD as DEFAULT_RATE_CARD

_rates: dict[str, float] = deepcopy(DEFAULT_RATE_CARD)
_meta: dict[str, Any] = {
    "source": "built-in",
    "synced_at": None,
    "notion_url": None,
    "error": None,
    "warnings": [],
    "skipped_rows": [],
}


def get_rate_card() -> dict[str, float]:
    return deepcopy(_rates)


def get_rate_card_status() -> dict[str, Any]:
    return {
        "rates": get_rate_card(),
        "source": _meta["source"],
        "synced_at": _meta["synced_at"],
        "notion_url": _meta["notion_url"],
        "error": _meta["error"],
        "warnings": list(_meta.get("warnings") or []),
        "skipped_rows": list(_meta.get("skipped_rows") or []),
    }


def apply_rate_card(
    updates: dict[str, float],
    *,
    source: str,
    notion_url: str | None = None,
    error: str | None = None,
    warnings: list[str] | None = None,
    skipped_rows: list[dict] | None = None,
) -> dict[str, float]:
    global _rates, _meta
    merged = deepcopy(DEFAULT_RATE_CARD)
    for key, value in updates.items():
        if key in merged and value is not None:
            merged[key] = float(value)
    _rates = merged
    _meta = {
        "source": source,
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "notion_url": notion_url,
        "error": error,
        "warnings": warnings or [],
        "skipped_rows": skipped_rows or [],
    }
    return get_rate_card()


def reset_rate_card_to_default(*, error: str | None = None) -> None:
    apply_rate_card({}, source="built-in", notion_url=None, error=error)
