"""In-memory status for Master Client Directory (Notion roster) sync."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

_meta: dict[str, Any] = {
    "source": "notion",
    "synced_at": None,
    "notion_url": None,
    "error": None,
    "stats": None,
}


def get_roster_sync_status() -> dict[str, Any]:
    return deepcopy(_meta)


def set_roster_sync_status(
    *,
    notion_url: str | None = None,
    error: str | None = None,
    stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    global _meta
    _meta = {
        "source": "notion",
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "notion_url": notion_url or _meta.get("notion_url"),
        "error": error,
        "stats": stats,
    }
    return get_roster_sync_status()
