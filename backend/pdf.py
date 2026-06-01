"""Invoice PDF generation with WeasyPrint."""
from __future__ import annotations

import base64
import os
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional

import requests
from weasyprint import HTML

BUSINESS_NAME = os.environ.get("BUSINESS_NAME", "Elite Atmosphere Training")
BUSINESS_ADDRESS = os.environ.get("BUSINESS_ADDRESS", "")
LOGO_URL = os.environ.get("LOGO_URL", "")

ASSETS_DIR = Path(__file__).parent / "assets"
ASSETS_DIR.mkdir(exist_ok=True)
LOGO_CACHE = ASSETS_DIR / "logo.png"


def _logo_data_uri() -> str:
    """Download and cache the logo, return as data URI."""
    if not LOGO_URL:
        return ""
    if not LOGO_CACHE.exists():
        try:
            r = requests.get(LOGO_URL, timeout=10)
            r.raise_for_status()
            LOGO_CACHE.write_bytes(r.content)
        except Exception:
            return ""
    try:
        data = LOGO_CACHE.read_bytes()
        return "data:image/png;base64," + base64.b64encode(data).decode()
    except Exception:
        return ""


def _fmt_money(v: float) -> str:
    return f"${v:,.2f}"


def render_invoice_pdf(
    *,
    invoice_number: str,
    issue_date: date,
    period_start: date,
    period_end: date,
    family_name: str,
    guardian_name: str,
    guardian_email: str,
    athlete_names: Iterable[str],
    line_items: list[dict],  # [{date, description, quantity, unit_price, amount}]
    subtotal: float,
    total: float,
    payment_date: Optional[date],
    payment_method: Optional[str],
    paid: bool,
) -> bytes:
    logo = _logo_data_uri()
    athletes_str = ", ".join(athlete_names)

    rows_html = "".join(
        f"""
        <tr>
          <td class="cell date">{li.get('date', '')}</td>
          <td class="cell desc">{li['description']}</td>
          <td class="cell qty">{li['quantity']:g}</td>
          <td class="cell price">{_fmt_money(li['unit_price'])}</td>
          <td class="cell amt">{_fmt_money(li['amount'])}</td>
        </tr>
        """
        for li in line_items
    )

    paid_block = ""
    if paid and payment_date:
        paid_block = f"""
        <div class="paid-note">Payment received in full on {payment_date.strftime('%B %d, %Y')} via {payment_method or 'Zelle'}.</div>
        """

    logo_html = f'<img class="logo" src="{logo}" />' if logo else '<div class="logo-text">EAT</div>'

    html_str = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page {{ size: Letter; margin: 0.6in; }}
  body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #0A0A0A; font-size: 11pt; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0A0A0A; padding-bottom: 18px; }}
  .brand .logo {{ width: 130px; }}
  .brand .logo-text {{ font-size: 36pt; font-weight: 900; letter-spacing: -2px; }}
  .brand .biz-name {{ font-size: 9pt; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; color: #52525B; }}
  .brand .biz-addr {{ font-size: 9pt; color: #71717A; margin-top: 2px; max-width: 220px; }}
  .meta {{ text-align: right; }}
  .meta .label {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 2px; color: #71717A; }}
  .meta .invoice-no {{ font-size: 22pt; font-weight: 900; letter-spacing: -0.5px; margin-top: 4px; }}
  .meta .issued {{ font-size: 10pt; color: #52525B; margin-top: 8px; }}

  .title-block {{ margin-top: 28px; display: flex; justify-content: space-between; }}
  .title-block .col {{ width: 48%; }}
  .title-block .label {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 2px; color: #71717A; margin-bottom: 4px; }}
  .title-block .val {{ font-size: 11pt; font-weight: 600; }}

  .paid-note {{ margin-top: 22px; padding: 12px 16px; border: 2px solid #0A0A0A; background: #CCFF00; font-weight: 700; }}

  table.items {{ width: 100%; border-collapse: collapse; margin-top: 28px; }}
  table.items thead th {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 2px; padding: 10px 8px; border-bottom: 2px solid #0A0A0A; text-align: left; color: #0A0A0A; }}
  table.items thead th.qty, table.items thead th.price, table.items thead th.amt {{ text-align: right; }}
  table.items .cell {{ padding: 10px 8px; border-bottom: 1px solid #E4E4E7; font-size: 10pt; vertical-align: top; }}
  table.items .cell.date {{ width: 70px; color: #71717A; font-size: 9pt; white-space: nowrap; }}
  table.items .cell.qty, table.items .cell.price, table.items .cell.amt {{ text-align: right; white-space: nowrap; }}
  table.items .cell.amt {{ font-weight: 700; }}

  .totals {{ display: flex; justify-content: flex-end; margin-top: 18px; }}
  .totals table {{ min-width: 280px; }}
  .totals td {{ padding: 6px 8px; font-size: 11pt; }}
  .totals td.lbl {{ text-align: right; color: #52525B; }}
  .totals td.val {{ text-align: right; font-weight: 700; white-space: nowrap; }}
  .totals .total-row td {{ border-top: 2px solid #0A0A0A; padding-top: 10px; font-size: 14pt; font-weight: 900; text-transform: uppercase; }}

  .footer {{ margin-top: 48px; padding-top: 16px; border-top: 1px solid #E4E4E7; font-size: 8pt; color: #71717A; text-align: center; letter-spacing: 1px; text-transform: uppercase; }}
</style></head>
<body>

<div class="header">
  <div class="brand">
    {logo_html}
    <div class="biz-name">{BUSINESS_NAME}</div>
    <div class="biz-addr">{BUSINESS_ADDRESS}</div>
  </div>
  <div class="meta">
    <div class="label">Invoice</div>
    <div class="invoice-no">{invoice_number}</div>
    <div class="issued">Issued {issue_date.strftime('%B %d, %Y')}</div>
  </div>
</div>

<div class="title-block">
  <div class="col">
    <div class="label">Billed To</div>
    <div class="val">{family_name} Family</div>
    <div style="font-size:10pt;color:#52525B;margin-top:2px;">{guardian_name}</div>
    <div style="font-size:10pt;color:#52525B;">{guardian_email}</div>
  </div>
  <div class="col">
    <div class="label">Period</div>
    <div class="val">{period_start.strftime('%b %d')} – {period_end.strftime('%b %d, %Y')}</div>
    <div class="label" style="margin-top:10px;">Athlete(s)</div>
    <div class="val">{athletes_str}</div>
  </div>
</div>

{paid_block}

<table class="items">
  <thead><tr>
    <th>Date</th><th>Service</th><th class="qty">Qty</th><th class="price">Price</th><th class="amt">Amount</th>
  </tr></thead>
  <tbody>{rows_html}</tbody>
</table>

<div class="totals">
  <table>
    <tr><td class="lbl">Subtotal</td><td class="val">{_fmt_money(subtotal)}</td></tr>
    <tr class="total-row"><td class="lbl">{'Total Paid' if paid else 'Total Due'}</td><td class="val">{_fmt_money(total)}</td></tr>
  </table>
</div>

<div class="footer">
  {BUSINESS_NAME} · {BUSINESS_ADDRESS}
</div>

</body></html>"""

    out = BytesIO()
    HTML(string=html_str).write_pdf(out)
    return out.getvalue()
