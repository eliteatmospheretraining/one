"""Invoice discount math and saved preset helpers."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any


def compute_discount_amount(
    subtotal: float,
    discount_type: str | None,
    discount_value: float | None,
) -> float:
    """Return dollar amount removed from subtotal."""
    if not discount_type or discount_value is None or float(discount_value) <= 0:
        return 0.0
    subtotal = max(0.0, float(subtotal))
    value = float(discount_value)
    if discount_type == "percent":
        pct = min(value, 100.0)
        return round(subtotal * pct / 100, 2)
    if discount_type == "fixed":
        return round(min(value, subtotal), 2)
    return 0.0


def invoice_totals(
    line_items: list[dict],
    *,
    discount_type: str | None,
    discount_value: float | None,
) -> tuple[float, float, float]:
    """Return (subtotal, discount_amount, total)."""
    subtotal = round(sum(float(li.get("amount") or 0) for li in line_items), 2)
    discount_amount = compute_discount_amount(subtotal, discount_type, discount_value)
    total = round(max(0.0, subtotal - discount_amount), 2)
    return subtotal, discount_amount, total


async def list_discount_presets() -> list[dict]:
    from db import db

    docs = await db.discount_presets.find({}, {"_id": 0}).sort("label", 1).to_list(200)
    return docs


async def upsert_discount_preset(
    *,
    label: str,
    discount_type: str,
    default_value: float,
    preset_id: str | None = None,
) -> dict:
    from db import db, now, serialize

    label = label.strip()
    if not label:
        raise ValueError("Discount label is required")
    if default_value <= 0:
        raise ValueError("Discount value must be greater than zero")

    payload: dict[str, Any] = {
        "label": label,
        "discount_type": discount_type,
        "default_value": round(float(default_value), 2),
        "updated_at": now().isoformat(),
    }

    if preset_id:
        existing = await db.discount_presets.find_one({"id": preset_id}, {"_id": 0})
        if existing:
            await db.discount_presets.update_one({"id": preset_id}, {"$set": serialize(payload)})
            return {**existing, **payload}

    by_label = await db.discount_presets.find_one({"label": label}, {"_id": 0})
    if by_label:
        await db.discount_presets.update_one({"id": by_label["id"]}, {"$set": serialize(payload)})
        return {**by_label, **payload}

    doc = serialize({
        "id": str(uuid.uuid4()),
        **payload,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.discount_presets.insert_one(doc)
    return doc


DEFAULT_DISCOUNT_PRESETS: list[dict[str, Any]] = [
    {"label": "Sibling Discount", "discount_type": "percent", "default_value": 10.0},
    {"label": "Missed week (full)", "discount_type": "fixed", "default_value": 345.0},
    {"label": "Missed week (half)", "discount_type": "fixed", "default_value": 172.5},
]


async def ensure_discount_presets_seeded() -> None:
    """Ensure built-in discount presets exist (sibling + missed-week credits)."""
    from db import db

    for preset in DEFAULT_DISCOUNT_PRESETS:
        existing = await db.discount_presets.find_one({"label": preset["label"]}, {"_id": 0})
        if existing:
            continue
        await upsert_discount_preset(
            label=preset["label"],
            discount_type=preset["discount_type"],
            default_value=float(preset["default_value"]),
        )
