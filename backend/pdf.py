"""EAT Invoice PDF — brand layout via WeasyPrint, Thunder fonts, and EAT SVG logo."""
from __future__ import annotations

import base64
import os
import re
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import quote

BASE = Path(__file__).parent

_FONT_FILES: dict[int, list[str]] = {
    800: ["Thunder-ExtraBoldLC.otf"],
    500: ["Thunder-MediumLC.otf", "Thunder-Medium.ttf"],
    300: ["Thunder-LightLC.otf", "Thunder-Light.ttf"],
}


def _font_b64(name: str) -> str:
    path = BASE / name
    if not path.exists():
        return ""
    return base64.b64encode(path.read_bytes()).decode()


def _font_face(weight: int) -> str:
    for name in _FONT_FILES.get(weight, []):
        b64 = _font_b64(name)
        if not b64:
            continue
        if name.endswith(".otf"):
            return (
                f"@font-face {{ font-family:'Thunder'; "
                f"src:url('data:font/otf;base64,{b64}') format('opentype'); font-weight:{weight}; }}\n"
            )
        return (
            f"@font-face {{ font-family:'Thunder'; "
            f"src:url('data:font/ttf;base64,{b64}') format('truetype'); font-weight:{weight}; }}\n"
        )
    return ""


def _svg_b64() -> str:
    for name in ("EAT_black.svg", "assets/EAT_black.svg"):
        path = BASE / name
        if path.exists():
            return base64.b64encode(path.read_bytes()).decode()
    return ""


def _fmt(v: float) -> str:
    return f"${v:,.2f}"


def invoice_receipt_pdf_title(*, period_start: date, period_end: date) -> str:
    """Display/save title for paid receipt PDFs, e.g. EAT Receipt · 06/08-06/12/2026."""
    start = period_start.strftime("%m/%d")
    end = period_end.strftime("%m/%d/%Y")
    return f"EAT Receipt · {start}-{end}"


def invoice_pdf_filename(
    *,
    invoice_number: str,
    period_start: date,
    period_end: date,
    paid: bool,
) -> str:
    """HTTP attachment/download filename."""
    title = (
        invoice_receipt_pdf_title(period_start=period_start, period_end=period_end)
        if paid
        else invoice_number
    )
    safe = re.sub(r'[<>:"\\|?*\n\r]', "", title)
    return f"{safe}.pdf"


def pdf_content_disposition(filename: str, *, inline: bool = True) -> str:
    """Content-Disposition with UTF-8 filename* so mobile saves the receipt title."""
    disposition = "inline" if inline else "attachment"
    fallback = filename.replace("/", "-")
    encoded = quote(filename)
    return f'{disposition}; filename="{fallback}"; filename*=UTF-8\'\'{encoded}'


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
    line_items: list[dict],
    subtotal: float,
    total: float,
    payment_date: Optional[date] = None,
    payment_method: Optional[str] = None,
    paid: bool = False,
    business_name: str = "",
    business_address: str = "",
    zelle_name: str = "",
    zelle_email: str = "",
    zelle_phone: str = "",
) -> bytes:
    business_name = business_name or os.environ.get("BUSINESS_NAME", "Elite Atmosphere Training")
    business_address = business_address or os.environ.get("BUSINESS_ADDRESS", "")
    zelle_name = zelle_name or os.environ.get("ZELLE_NAME", "")
    zelle_email = zelle_email or os.environ.get("ZELLE_EMAIL", "")
    zelle_phone = zelle_phone or os.environ.get("ZELLE_PHONE", "")

    font_faces = "".join(_font_face(w) for w in (800, 500, 300))
    logo = _svg_b64()
    athletes_str = ", ".join(athlete_names)

    rows_html = "".join(
        f"""<tr>
          <td class="td desc">{li['description']}</td>
          <td class="td num">{li['quantity']:g}</td>
          <td class="td num">{_fmt(li['unit_price'])}</td>
          <td class="td num bold">{_fmt(li['amount'])}</td>
        </tr>"""
        for li in line_items
    )

    paid_banner = ""
    if paid and payment_date:
        method = payment_method or "Zelle"
        paid_banner = f"""
        <div class="paid-banner">
          Payment received in full on {payment_date.strftime('%B %d, %Y')} via {method}.
        </div>"""

    zelle_block = ""
    if not paid:
        zelle_block = f"""
        <div class="zelle-block">
          <div class="zelle-title">Pay via Zelle</div>
          <table class="zelle-table">
            <tr><td class="zk">Pay to</td><td class="zv">{zelle_name}</td></tr>
            <tr><td class="zk">Email</td><td class="zv">{zelle_email}</td></tr>
            <tr><td class="zk">Phone</td><td class="zv">{zelle_phone}</td></tr>
          </table>
          <div class="zelle-flexible"><strong>We're flexible.</strong> If Zelle doesn't work for you, let us know.</div>
        </div>"""

    total_label = "TOTAL PAID" if paid else "TOTAL DUE"
    document_title = (
        invoice_receipt_pdf_title(period_start=period_start, period_end=period_end)
        if paid
        else f"EAT Invoice {invoice_number}"
    )
    meta_eyebrow = "Receipt" if paid else "Invoice"
    logo_html = (
        f'<img class="logo" src="data:image/svg+xml;base64,{logo}" />'
        if logo
        else '<div class="logo-text">EAT.</div>'
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{document_title}</title>
<style>
{font_faces}

@page {{
  size: Letter;
  margin: 0;
}}

* {{ box-sizing: border-box; margin: 0; padding: 0; }}

body {{
  background: #ffffff;
  color: #0d0d0d;
  font-family: 'Thunder', 'Helvetica Neue', sans-serif;
  font-weight: 300;
  font-size: 10pt;
}}

.page {{
  width: 8.5in;
  height: 11in;
  background: #ffffff;
  padding: 0;
  position: relative;
  overflow: hidden;
}}

.header {{
  padding: 36pt 48pt 24pt 48pt;
  border-bottom: 1pt solid #e5e5e5;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}}

.logo {{
  width: 88pt;
  height: auto;
  margin-left: -14pt;
}}

.logo-text {{
  font-weight: 800;
  font-size: 32pt;
  text-transform: uppercase;
  color: #0d0d0d;
  letter-spacing: 0.02em;
}}

.meta-right {{
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
}}

.meta-eyebrow {{
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #999999;
  margin-bottom: 4pt;
}}

.invoice-number {{
  font-weight: 800;
  font-size: 30pt;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #0d0d0d;
  line-height: 1;
}}

.issued-date {{
  font-weight: 300;
  font-size: 9pt;
  color: #888888;
  margin-top: 5pt;
}}

.biz-strip {{
  padding: 10pt 48pt;
  border-bottom: 1pt solid #ebebeb;
}}

.biz-name {{
  font-weight: 500;
  font-size: 9pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #999999;
}}

.biz-addr {{
  font-weight: 300;
  font-size: 8.5pt;
  color: #bbbbbb;
  margin-top: 2pt;
}}

.title-block {{
  padding: 22pt 48pt;
  display: flex;
  justify-content: space-between;
  border-bottom: 1pt solid #ebebeb;
}}

.tb-col {{ width: 48%; }}

.tb-label {{
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #999999;
  margin-bottom: 5pt;
}}

.tb-val {{
  font-weight: 500;
  font-size: 11pt;
  color: #0d0d0d;
  line-height: 1.3;
}}

.tb-sub {{
  font-weight: 300;
  font-size: 9pt;
  color: #888888;
  margin-top: 2pt;
}}

.tb-spacer {{ margin-top: 12pt; }}

.paid-banner {{
  margin: 0 48pt;
  margin-top: 18pt;
  padding: 11pt 16pt;
  background: #c8f000;
  color: #0d0d0d;
  font-weight: 500;
  font-size: 9pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}}

.zelle-block {{
  margin: 18pt 48pt 0;
  padding: 14pt 18pt;
  border: 1pt solid #e5e5e5;
}}

.zelle-flexible {{
  font-weight: 300;
  font-size: 8.5pt;
  color: #888888;
  margin-top: 10pt;
}}

.zelle-flexible strong {{
  font-weight: 500;
  color: #0d0d0d;
}}

.zelle-title {{
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #0d0d0d;
  margin-bottom: 10pt;
}}

.zelle-table {{ border-collapse: collapse; }}

.zk {{
  font-weight: 500;
  font-size: 7.5pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #999999;
  padding-right: 18pt;
  padding-bottom: 5pt;
  vertical-align: top;
}}

.zv {{
  font-weight: 300;
  font-size: 10pt;
  color: #0d0d0d;
  padding-bottom: 5pt;
}}

.items-wrap {{ margin: 22pt 48pt 0; }}

.items-table {{ width: 100%; border-collapse: collapse; }}

.th {{
  font-weight: 500;
  font-size: 7.5pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #999999;
  padding: 8pt 6pt;
  border-bottom: 1pt solid #0d0d0d;
  text-align: left;
}}

.th.num {{ text-align: right; }}

.td {{
  padding: 10pt 6pt;
  border-bottom: 1pt solid #ebebeb;
  font-weight: 300;
  font-size: 10pt;
  color: #333333;
  vertical-align: top;
}}

.td.num {{ text-align: right; white-space: nowrap; }}

.td.bold {{ font-weight: 500; color: #0d0d0d; }}

.totals-wrap {{
  display: flex;
  justify-content: flex-end;
  margin: 16pt 48pt 0;
}}

.totals-table {{ min-width: 260pt; border-collapse: collapse; }}

.tot-lbl {{
  font-weight: 300;
  font-size: 9pt;
  color: #999999;
  text-align: right;
  padding: 5pt 8pt;
}}

.tot-val {{
  font-weight: 500;
  font-size: 9pt;
  color: #333333;
  text-align: right;
  padding: 5pt 0;
  white-space: nowrap;
}}

.tot-total-lbl {{
  font-weight: 500;
  font-size: 14pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #0d0d0d;
  text-align: right;
  padding: 10pt 8pt 6pt;
  border-top: 1pt solid #0d0d0d;
}}

.tot-total-val {{
  font-weight: 500;
  font-size: 14pt;
  color: #0d0d0d;
  text-align: right;
  padding: 10pt 0 6pt;
  border-top: 1pt solid #0d0d0d;
  white-space: nowrap;
}}

.footer {{
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0 48pt;
  height: 28pt;
  border-top: 1pt solid #ebebeb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}}

.footer span {{
  font-weight: 500;
  font-size: 7.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #bbbbbb;
}}
</style>
</head>
<body>
<div class="page">

  <div class="header">
    {logo_html}
    <div class="meta-right">
      <div class="meta-eyebrow">{meta_eyebrow}</div>
      <div class="invoice-number">{invoice_number}</div>
      <div class="issued-date">Issued {issue_date.strftime('%B %d, %Y')}</div>
    </div>
  </div>

  <div class="biz-strip">
    <div class="biz-name">{business_name}</div>
    <div class="biz-addr">{business_address}</div>
  </div>

  <div class="title-block">
    <div class="tb-col">
      <div class="tb-label">Billed To</div>
      <div class="tb-val">{family_name} Family</div>
      <div class="tb-sub">{guardian_name}</div>
      <div class="tb-sub">{guardian_email}</div>
    </div>
    <div class="tb-col">
      <div class="tb-label">Period</div>
      <div class="tb-val">{period_start.strftime('%b %d')} – {period_end.strftime('%b %d, %Y')}</div>
      <div class="tb-spacer"></div>
      <div class="tb-label">Athlete(s)</div>
      <div class="tb-val">{athletes_str}</div>
    </div>
  </div>

  {paid_banner}
  {zelle_block}

  <div class="items-wrap">
    <table class="items-table">
      <thead>
        <tr>
          <th class="th">Service</th>
          <th class="th num">Qty</th>
          <th class="th num">Price</th>
          <th class="th num">Amount</th>
        </tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>

  <div class="totals-wrap">
    <table class="totals-table">
      <tr>
        <td class="tot-lbl">Subtotal</td>
        <td class="tot-val">{_fmt(subtotal)}</td>
      </tr>
      <tr>
        <td class="tot-total-lbl">{total_label}</td>
        <td class="tot-total-val">{_fmt(total)}</td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <span>{business_name}.</span>
    <span>{invoice_number}</span>
  </div>

</div>
</body>
</html>"""

    from weasyprint import HTML  # lazy: needs cairo/pango on Railway

    out = BytesIO()
    HTML(string=html, base_url=str(BASE)).write_pdf(out)
    return out.getvalue()


if __name__ == "__main__":
    sample_lines = [
        {"description": "Carlos Hernandez — Full-Time Training — Full Day", "quantity": 1, "unit_price": 60.00, "amount": 60.00},
        {"description": "Carlos Hernandez — Full-Time Training — Full Day", "quantity": 1, "unit_price": 60.00, "amount": 60.00},
        {"description": "Carlos Hernandez — Full-Time Training — Half Day", "quantity": 1, "unit_price": 30.00, "amount": 30.00},
        {"description": "Carlos Hernandez — Full-Time Training — Full Day", "quantity": 1, "unit_price": 60.00, "amount": 60.00},
        {"description": "Carlos Hernandez — Full-Time Training — Full Day", "quantity": 1, "unit_price": 60.00, "amount": 60.00},
    ]
    common = dict(
        invoice_number="EAT-000001",
        issue_date=date(2026, 6, 2),
        period_start=date(2026, 5, 26),
        period_end=date(2026, 5, 30),
        family_name="Hernandez",
        guardian_name="Maria Hernandez",
        guardian_email="maria@example.com",
        athlete_names=["Carlos Hernandez"],
        line_items=sample_lines,
        subtotal=270.00,
        total=270.00,
    )
    out_dir = BASE / "samples"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "EAT_Invoice_Sample.pdf").write_bytes(render_invoice_pdf(**common, paid=False))
    paid_pdf = render_invoice_pdf(
        **common,
        paid=True,
        payment_date=date(2026, 6, 3),
        payment_method="Zelle",
    )
    paid_name = invoice_pdf_filename(
        invoice_number=common["invoice_number"],
        period_start=common["period_start"],
        period_end=common["period_end"],
        paid=True,
    )
    (out_dir / paid_name).write_bytes(paid_pdf)
    print(f"Wrote {out_dir}/EAT_Invoice_Sample.pdf")
    print(f"Wrote {out_dir}/{paid_name}")
