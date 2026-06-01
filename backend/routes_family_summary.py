"""Family summary aggregation."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_coach
from db import db

router = APIRouter(prefix="/families", tags=["families-summary"], dependencies=[Depends(get_current_coach)])


@router.get("/{family_id}/summary")
async def family_summary(family_id: str):
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Family not found")

    athletes = await db.athletes.find({"family_id": family_id}, {"_id": 0}).sort("full_name", 1).to_list(500)
    invoices = await db.invoices.find({"family_id": family_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    invoice_ids = [i["id"] for i in invoices]
    payments: List[dict] = []
    if invoice_ids:
        payments = await db.payments.find({"invoice_id": {"$in": invoice_ids}}, {"_id": 0}).sort("received_date", -1).to_list(1000)

    totals = {
        "invoices_total": round(sum(float(i["total"]) for i in invoices), 2),
        "paid_total": round(sum(float(p["amount_received"]) for p in payments), 2),
        "outstanding_total": 0.0,
        "draft_count": sum(1 for i in invoices if i["status"] == "draft"),
        "sent_count": sum(1 for i in invoices if i["status"] == "sent"),
        "paid_count": sum(1 for i in invoices if i["status"] == "paid"),
    }
    # Outstanding = sum of totals where status == sent (not yet paid)
    totals["outstanding_total"] = round(
        sum(float(i["total"]) for i in invoices if i["status"] == "sent"), 2
    )

    return {
        "family": family,
        "athletes": athletes,
        "invoices": invoices,
        "payments": payments,
        "totals": totals,
    }
