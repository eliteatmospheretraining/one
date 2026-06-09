"""Enrollment + waiver PDF — matches invoice PDF brand layout."""
from __future__ import annotations

import base64
import hashlib
import html
import logging
import os
import re
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

from pdf import BASE, _font_face, _svg_b64

logger = logging.getLogger(__name__)
_SIG_CACHE = BASE / ".enrollment_sig_cache"

WAIVER_TEXT = """
Assumption of Risk. I am aware that participating in tennis and athletics activities involves inherent risks including physical injury, accidents, and property damage. I voluntarily assume all risks and release Elite Atmosphere Training, its coaches, staff, and affiliates from any liability for injuries or damages during participation.

Medical Consent. I certify the participant is physically fit to participate. In an emergency, I authorize EAT staff to seek medical treatment and agree to be responsible for associated medical expenses.

Code of Conduct. I agree to abide by all rules and instructions provided by EAT staff. Violation may result in dismissal without refund.

Personal Property. EAT is not liable for loss, theft, or damage to personal property on premises.

Photo Release. EAT may photograph or record the participant for promotional use including social media and marketing. First names may be used; full names will not be shared publicly without separate consent. I waive approval and compensation rights for these materials.
""".strip()


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _fmt_date(value: Any) -> str:
    if not value:
        return "—"
    try:
        if isinstance(value, date):
            return value.strftime("%m-%d-%Y")
        return date.fromisoformat(str(value)[:10]).strftime("%m-%d-%Y")
    except ValueError:
        return str(value)[:10]


def _display(value: Any) -> str:
    text = str(value or "").strip()
    return text if text else "—"


def _signature_img_html(signature_data: str) -> str:
    """Embed drawn signature as a cached file (WeasyPrint is unreliable with huge data: URIs)."""
    raw = (signature_data or "").strip()
    if not raw:
        return '<div class="signature-empty">—</div>'
    try:
        b64 = raw.split(",", 1)[1] if raw.startswith("data:") else raw
        img_bytes = base64.b64decode(b64, validate=False)
        if not img_bytes:
            raise ValueError("empty signature image")
        _SIG_CACHE.mkdir(exist_ok=True)
        name = hashlib.sha256(img_bytes).hexdigest()[:20] + ".png"
        path = _SIG_CACHE / name
        if not path.exists():
            path.write_bytes(img_bytes)
        return f'<img class="signature-img" src="{_esc(name)}" alt="Signature" />'
    except Exception as e:
        logger.warning("Enrollment PDF signature embed failed: %s", e)
        return '<div class="signature-empty">Signature on file</div>'


def _row(label: str, value: Any) -> str:
    return f"""
    <tr>
      <td class="fld-lbl">{_esc(label)}</td>
      <td class="fld-val">{_esc(_display(value))}</td>
    </tr>"""


def _section(title: str, rows: str) -> str:
    if not rows.strip():
        return ""
    return f"""
    <div class="section">
      <div class="section-title">{_esc(title)}</div>
      <table class="fields">{rows}</table>
    </div>"""


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (name or "Athlete").strip())
    return cleaned.strip("_") or "Athlete"


def render_enrollment_pdf(ctx: dict) -> bytes:
    business_name = os.environ.get("BUSINESS_NAME", "Elite Atmosphere Training")
    font_faces = "".join(_font_face(w) for w in (800, 500, 300))
    logo = _svg_b64()
    logo_html = (
        f'<img class="logo" src="data:image/svg+xml;base64,{logo}" />'
        if logo
        else '<div class="logo-text">EAT.</div>'
    )

    contact_label = ctx.get("contact_label") or "Contact"
    athlete_rows = "".join([
        _row("Full Name", ctx.get("athlete_name")),
        _row("Date of Birth", _fmt_date(ctx.get("date_of_birth"))),
        _row("School", ctx.get("school")),
        _row("Grade", ctx.get("grade")),
        _row("T-Shirt", ctx.get("shirt_size")),
        _row("Program", ctx.get("program_label")),
        _row("UTR", ctx.get("utr")),
        _row("WTN", ctx.get("wtn")),
        _row("Goals", ctx.get("goals")),
    ])
    contact_rows = "".join([
        _row("Name", ctx.get("contact_name")),
        _row("Relationship", ctx.get("contact_relationship")),
        _row("Phone", ctx.get("contact_phone")),
        _row("Email", ctx.get("contact_email")),
        _row("Street Address", ctx.get("street_address")),
        _row("City / State / Zip", ctx.get("city_state_zip")),
    ])
    emergency_rows = "".join([
        _row("Name", ctx.get("emergency_contact_name")),
        _row("Relationship", ctx.get("emergency_contact_relationship")),
        _row("Phone", ctx.get("emergency_contact_phone")),
        _row("Email", ctx.get("emergency_contact_email")),
    ])
    additional_rows = "".join([
        _row("Referral", ctx.get("referral_source")),
        _row("Notes", ctx.get("additional_notes")),
    ])

    photo_release = ctx.get("photo_release")
    if photo_release is True:
        photo_label = "Yes — authorized for promotional use"
    elif photo_release is False:
        photo_label = "No — not authorized"
    else:
        photo_label = "—"

    sig_html = _signature_img_html(ctx.get("waiver_signature") or "")

    submitted = _fmt_date(ctx.get("submitted_date") or date.today())

    doc = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{font_faces}
@page {{ size: Letter; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  background: #ffffff;
  color: #0d0d0d;
  font-family: 'Thunder', 'Helvetica Neue', sans-serif;
  font-weight: 300;
  font-size: 9.5pt;
}}
.page {{ width: 8.5in; min-height: 11in; padding: 0 0 36pt 0; }}
.header {{
  padding: 36pt 48pt 24pt 48pt;
  border-bottom: 1pt solid #e5e5e5;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}}
.logo {{ width: 88pt; height: auto; margin-left: -14pt; }}
.logo-text {{
  font-weight: 800;
  font-size: 32pt;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}}
.meta-right {{ text-align: right; }}
.meta-eyebrow {{
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #999999;
  margin-bottom: 4pt;
}}
.doc-title {{
  font-weight: 800;
  font-size: 24pt;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1;
}}
.submitted-date {{
  font-weight: 300;
  font-size: 9pt;
  color: #888888;
  margin-top: 5pt;
}}
.body {{ padding: 24pt 48pt 0 48pt; }}
.section {{ margin-bottom: 18pt; }}
.section-title {{
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #999999;
  border-bottom: 1pt solid #ebebeb;
  padding-bottom: 6pt;
  margin-bottom: 8pt;
}}
.fields {{ width: 100%; border-collapse: collapse; }}
.fld-lbl {{
  width: 34%;
  padding: 5pt 10pt 5pt 0;
  vertical-align: top;
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #888888;
}}
.fld-val {{
  padding: 5pt 0;
  vertical-align: top;
  color: #0d0d0d;
  line-height: 1.45;
}}
.waiver-box {{
  border: 1pt solid #e5e5e5;
  padding: 12pt;
  font-size: 8.5pt;
  line-height: 1.55;
  color: #444444;
  white-space: pre-wrap;
}}
.signature-img {{
  display: block;
  max-width: 280pt;
  max-height: 60pt;
  border: 1pt solid #e5e5e5;
  background: #fafafa;
  padding: 6pt;
}}
.signature-empty {{ color: #bbbbbb; }}
.footer {{
  position: fixed;
  bottom: 24pt;
  left: 48pt;
  right: 48pt;
  border-top: 1pt solid #ebebeb;
  padding-top: 8pt;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  letter-spacing: 0.12em;
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
      <div class="meta-eyebrow">Enrollment &amp; Waiver</div>
      <div class="doc-title">{_esc(ctx.get("athlete_name"))}</div>
      <div class="submitted-date">Submitted {submitted}</div>
    </div>
  </div>
  <div class="body">
    {_section("Athlete", athlete_rows)}
    {_section(contact_label, contact_rows)}
    {_section("Emergency Contact", emergency_rows)}
    {_section("Medical", _row("Conditions", ctx.get("medical_conditions")))}
    {_section("Additional", additional_rows)}
    {_section("Waiver", f'<div class="waiver-box">{_esc(WAIVER_TEXT)}</div>')}
    {_section("Photo Release", _row("Authorization", photo_label))}
    {_section("Signature", "".join([
        _row("Typed Name", ctx.get("waiver_typed_signature")),
        f'<tr><td class="fld-lbl">Drawn Signature</td><td class="fld-val">{sig_html}</td></tr>',
    ]))}
  </div>
  <div class="footer">
    <span>{_esc(business_name)}.</span>
    <span>{_esc(ctx.get("program_label"))}</span>
  </div>
</div>
</body>
</html>"""

    from weasyprint import HTML

    out = BytesIO()
    HTML(string=doc, base_url=str(BASE)).write_pdf(out)
    return out.getvalue()


def enrollment_pdf_filename(athlete_name: str) -> str:
    return f"EAT_Enrollment_{_safe_filename(athlete_name)}.pdf"


def sample_enrollment_context() -> dict:
    return {
        "athlete_name": "Sample Athlete",
        "date_of_birth": date(2010, 4, 15),
        "school": "Sample High School",
        "grade": "9th",
        "shirt_size": "M",
        "program_label": "Eat w/ EAT — Full-Time",
        "utr": "4.50",
        "wtn": "—",
        "goals": "Tournament Prep, College Prep",
        "contact_label": "Guardian",
        "contact_name": "Sample Parent",
        "contact_relationship": "Parent",
        "contact_phone": "(555) 123-4567",
        "contact_email": "parent@example.com",
        "street_address": "123 Main St",
        "city_state_zip": "Miami, FL 33131",
        "emergency_contact_name": "Sample Emergency Contact",
        "emergency_contact_relationship": "Parent",
        "emergency_contact_phone": "(555) 987-6543",
        "emergency_contact_email": "emergency@example.com",
        "medical_conditions": "None / No known issues",
        "referral_source": "Referral",
        "additional_notes": "Available after 3pm on weekdays.",
        "photo_release": True,
        "waiver_typed_signature": "Sample Parent",
        "waiver_signature": (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHe"
            "AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABZ0RVh0Q3JlYXRpb24"
            "gVGltZQAxMC8yOS8xMqwAAAAcdEVYdFNvZnR3YXJlAEFkb2JlIEZpcmV3b3JrcyBDUzVx"
            "teMAAABSSURBVHic7doxAQAgEMDA/9s/lqABpJEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwY"
            "BQwAAf8B/9sAAAAASUVORK5CYII="
        ),
        "submitted_date": date.today(),
    }
