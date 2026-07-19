"""Preset invoice line services aligned with Square Service Library."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from billing import format_invoice_display_date
from models import InvoiceLineItem
from rate_card_store import get_rate_card

EAT_BRAND = "Eat w/ EAT"

# Legacy IDs still accepted on POST /line-items
FULL_TIME_MONTH = "full_time_month"
FULL_TIME_WEEK = "full_time_week"


@dataclass(frozen=True)
class ServiceDef:
    id: str
    label: str
    rate_key: str
    group: str
    needs_week_range: bool = False
    needs_service_date: bool = False


SERVICE_CATALOG: tuple[ServiceDef, ...] = (
    # Eat w/ EAT — full-time (Square variations)
    ServiceDef("eat_monthly", f"{EAT_BRAND} — Monthly Rate", "monthly", EAT_BRAND),
    ServiceDef(
        "eat_monthly_half",
        f"{EAT_BRAND} — Monthly Rate (Half-Day)",
        "monthly_half",
        EAT_BRAND,
    ),
    ServiceDef(
        "eat_monthly_legacy",
        f"{EAT_BRAND} — Monthly Rate (Legacy)",
        "monthly_legacy",
        EAT_BRAND,
    ),
    ServiceDef("eat_weekly", f"{EAT_BRAND} — Weekly Rate", "weekly", EAT_BRAND, needs_week_range=True),
    ServiceDef(
        "eat_weekly_half",
        f"{EAT_BRAND} — Weekly Rate (Half-Day)",
        "weekly_half",
        EAT_BRAND,
        needs_week_range=True,
    ),
    ServiceDef(
        "eat_drop_in_full",
        f"{EAT_BRAND} — Drop-In Rate (Full-Day)",
        "drop_in_full",
        EAT_BRAND,
        needs_service_date=True,
    ),
    ServiceDef(
        "eat_drop_in_half",
        f"{EAT_BRAND} — Drop-In Rate (Half-Day)",
        "drop_in_half",
        EAT_BRAND,
        needs_service_date=True,
    ),
    # Other Square services
    ServiceDef(
        "private_lesson",
        "Private Lesson",
        "private",
        "EAT Training",
        needs_service_date=True,
    ),
    ServiceDef(
        "semi_private_lesson",
        "Semi-Private Lesson",
        "semi_private",
        "EAT Training",
        needs_service_date=True,
    ),
    ServiceDef("athlete_travel", "Athlete Travel Support", "travel", "EAT Travel"),
)

_SERVICE_BY_ID = {s.id: s for s in SERVICE_CATALOG}
# Backward compatibility
_SERVICE_BY_ID[FULL_TIME_MONTH] = _SERVICE_BY_ID["eat_monthly"]
_SERVICE_BY_ID[FULL_TIME_WEEK] = _SERVICE_BY_ID["eat_weekly"]


def list_service_options() -> list[dict]:
    card = get_rate_card()
    out: list[dict] = []
    for svc in SERVICE_CATALOG:
        out.append({
            "id": svc.id,
            "label": svc.label,
            "group": svc.group,
            "default_unit_price": float(card.get(svc.rate_key, 0)),
            "rate_card_key": svc.rate_key,
            "needs_week_range": svc.needs_week_range,
            "needs_service_date": svc.needs_service_date,
        })
    return out


def _resolve_service(service_id: str) -> ServiceDef:
    svc = _SERVICE_BY_ID.get(service_id)
    if not svc:
        raise ValueError(f"Unknown service: {service_id}")
    return svc


def build_manual_line_item(
    *,
    invoice_id: str,
    athlete: dict,
    service_id: str,
    period_start: date,
    period_end: date,
    week_start: date | None = None,
    week_end: date | None = None,
    service_date: date | None = None,
    quantity: float = 1.0,
    unit_price: float | None = None,
) -> InvoiceLineItem:
    svc = _resolve_service(service_id)
    card = get_rate_card()
    qty = max(0.01, float(quantity))
    price = float(unit_price if unit_price is not None else card.get(svc.rate_key, 0))

    if svc.id in ("eat_monthly", "eat_monthly_half", "eat_monthly_legacy"):
        month_label = period_start.strftime("%B %Y")
        description = f"{svc.label} ({month_label})"
    elif svc.id in ("eat_weekly", "eat_weekly_half"):
        ws = week_start or period_start
        we = week_end or period_end
        range_label = (
            f"{format_invoice_display_date(ws.isoformat())} – "
            f"{format_invoice_display_date(we.isoformat())}"
        )
        description = f"{svc.label} ({range_label})"
    elif svc.needs_service_date:
        if service_date:
            description = f"{svc.label} ({format_invoice_display_date(service_date.isoformat())})"
        else:
            month_label = period_start.strftime("%B %Y")
            description = f"{svc.label} ({month_label})"
    else:
        description = svc.label

    amount = round(price * qty, 2)
    return InvoiceLineItem(
        invoice_id=invoice_id,
        athlete_id=athlete["id"],
        athlete_name=athlete["full_name"],
        description=description,
        quantity=qty,
        unit_price=price,
        amount=amount,
    )
