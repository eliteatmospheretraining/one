"""Public guardian routes for invoice magic links (no coach JWT)."""
from __future__ import annotations

from fastapi import APIRouter, Response

from db import db
from invoice_magic_links import resolve_invoice_access_token
from pdf import pdf_content_disposition
from routes_invoices import _build_pdf

router = APIRouter(prefix="/invoice-access", tags=["invoice-access"])


@router.get("/view")
async def view_invoice(token: str):
    ctx = await resolve_invoice_access_token(token)
    inv = ctx["invoice"]
    invoice_id = inv["id"]
    items = await db.invoice_line_items.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(1000)
    athlete_ids = list({li["athlete_id"] for li in items})
    athletes = await db.athletes.find({"id": {"$in": athlete_ids}}, {"_id": 0}).to_list(500) if athlete_ids else []
    payments = await db.payments.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(100)
    return {
        "invoice": inv,
        "line_items": items,
        "family": ctx["family"],
        "athletes": athletes,
        "payments": payments,
        "access_kind": ctx["access"].get("kind"),
    }


@router.get("/pdf")
async def download_invoice_pdf(token: str):
    ctx = await resolve_invoice_access_token(token)
    pdf_bytes, filename, _ = await _build_pdf(ctx["invoice"]["id"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": pdf_content_disposition(filename)},
    )
