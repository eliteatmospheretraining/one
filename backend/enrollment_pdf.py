"""Enrollment + waiver PDF — filled form layout matching the public enroll page."""
from __future__ import annotations

import base64
import hashlib
import html
import logging
import os
import re
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable, Optional
from zoneinfo import ZoneInfo

from pdf import BASE, _svg_b64

logger = logging.getLogger(__name__)
_SIG_CACHE = BASE / ".enrollment_sig_cache"
_EASTERN = ZoneInfo("America/New_York")

PROGRAMS = [
    ("full_time", "Eat w/ EAT — Full-Time"),
    ("private", "Private Lesson"),
    ("semi_private", "Semi-Private"),
]
GOALS = [
    "Fitness",
    "Skill Development",
    "Tournament Prep",
    "High School Prep",
    "College Prep",
    "High-Performance",
]
MEDICAL_FLAGS = [
    "Allergies",
    "Asthma",
    "Diabetes",
    "Heart Condition",
    "Seizure Disorder",
    "Physical Limitation",
    "Inhaler / EpiPen",
    "Medication",
    "Other",
]
REFERRALS = ["Referral", "Google", "Instagram", "Tournament", "Other"]

WAIVER_SECTIONS = [
    (
        "Assumption of Risk.",
        "I am aware that participating in tennis and athletics activities involves inherent "
        "risks including physical injury, accidents, and property damage. I voluntarily assume "
        "all risks and release Elite Atmosphere Training, its coaches, staff, and affiliates from "
        "any liability for injuries or damages during participation.",
    ),
    (
        "Medical Consent.",
        "I certify the participant is physically fit to participate. In an emergency, I authorize "
        "EAT staff to seek medical treatment and agree to be responsible for associated medical expenses.",
    ),
    (
        "Code of Conduct.",
        "I agree to abide by all rules and instructions provided by EAT staff. Violation may result "
        "in dismissal without refund.",
    ),
    (
        "Personal Property.",
        "EAT is not liable for loss, theft, or damage to personal property on premises.",
    ),
    (
        "Photo Release.",
        "EAT may photograph or record the participant for promotional use including social media and "
        "marketing. First names may be used; full names will not be shared publicly without separate "
        "consent. I waive approval and compensation rights for these materials.",
    ),
]


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _fmt_date(value: Any) -> str:
    if not value:
        return ""
    try:
        if isinstance(value, date):
            return value.strftime("%m-%d-%Y")
        return date.fromisoformat(str(value)[:10]).strftime("%m-%d-%Y")
    except ValueError:
        return str(value)[:10]


def _fmt_signed_at(value: Any) -> str:
    if not value:
        return ""
    try:
        if isinstance(value, datetime):
            dt = value
        elif hasattr(value, "isoformat"):
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        local = dt.astimezone(_EASTERN)
        return local.strftime("%m-%d-%Y at %I:%M %p ET").replace(" 0", " ")
    except (ValueError, TypeError):
        return ""


def _display(value: Any) -> str:
    return str(value or "").strip()


def _signature_img_html(signature_data: str) -> str:
    """Embed drawn signature (cached file path for WeasyPrint)."""
    raw = (signature_data or "").strip()
    if not raw:
        return '<div class="sig-empty">No signature on file</div>'
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
        rel = f".enrollment_sig_cache/{name}"
        return f'<img class="sig-img" src="{_esc(rel)}" alt="Signature" />'
    except Exception as e:
        logger.warning("Enrollment PDF signature embed failed: %s", e)
        return '<div class="sig-empty">Signature on file</div>'


def _field(label: str, value: Any, *, wide: bool = False) -> str:
    val = _display(value)
    cls = "field field-wide" if wide else "field"
    return f"""
    <div class="{cls}">
      <div class="fld-lbl">{_esc(label)}</div>
      <div class="fld-val">{_esc(val) if val else "&nbsp;"}</div>
    </div>"""


def _row(fields: str, cols: int = 2) -> str:
    return f'<div class="row col{cols}">{fields}</div>'


def _sec(title: str) -> str:
    return f'<div class="sec-lbl">{_esc(title)}</div>'


def _chip_lbl(text: str) -> str:
    return f'<div class="chip-lbl">{_esc(text)}</div>'


def _chips(options: Iterable[tuple[str, str]], selected: Any) -> str:
    selected_set = set(selected) if isinstance(selected, (list, tuple, set)) else {selected}
    items = []
    for value, label in options:
        on = " on" if value in selected_set else ""
        items.append(f'<span class="chip{on}">{_esc(label)}</span>')
    return f'<div class="chips">{"".join(items)}</div>'


def _med_grid(medical_none: bool, medical_flags: list[str]) -> str:
    flags = set(medical_flags or [])
    items = [
        f'<div class="mi{" on" if medical_none else ""}"><span class="ck"></span><span class="mt">None / No known issues</span></div>'
    ]
    for flag in MEDICAL_FLAGS:
        on = " on" if flag in flags else ""
        items.append(f'<div class="mi{on}"><span class="ck"></span><span class="mt">{_esc(flag)}</span></div>')
    return f'<div class="med-grid">{"".join(items)}</div>'


def _radio(label: str, detail: str, selected: bool) -> str:
    on = " on" if selected else ""
    return f"""
    <div class="radio-row">
      <span class="rb{on}"></span>
      <span class="rt"><strong>{_esc(label)}</strong> — {_esc(detail)}</span>
    </div>"""


def _waiver_html() -> str:
    parts = []
    for title, body in WAIVER_SECTIONS:
        parts.append(f"<strong>{_esc(title)}</strong> {_esc(body)}")
    return "<br /><br />".join(parts)


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (name or "Athlete").strip())
    return cleaned.strip("_") or "Athlete"


def render_enrollment_pdf(ctx: dict) -> bytes:
    logo = _svg_b64()
    logo_html = (
        f'<img class="brand-logo" src="data:image/svg+xml;base64,{logo}" alt="EAT" />'
        if logo
        else '<div class="brand-fallback">EAT.</div>'
    )

    athlete_name = _display(ctx.get("athlete_name"))
    is_adult = bool(ctx.get("is_adult"))
    contact_label = ctx.get("contact_label") or ("Contact" if is_adult else "Guardian")
    goals = ctx.get("goals_list") or []
    program_type = ctx.get("program_type") or ""
    medical_none = bool(ctx.get("medical_none"))
    medical_flags = list(ctx.get("medical_flags") or [])
    medical_details = _display(ctx.get("medical_details"))
    photo_release = ctx.get("photo_release")
    signed_at = _fmt_signed_at(ctx.get("signed_at"))
    submitted = _fmt_date(ctx.get("submitted_date") or date.today())
    sig_html = _signature_img_html(ctx.get("waiver_signature") or "")
    typed_sig = _display(ctx.get("waiver_typed_signature"))

    # Contact section rows mirror Enroll.jsx adult vs minor layouts.
    if is_adult:
        contact_block = "".join([
            _row("".join([
                _field("Name", ctx.get("contact_name")),
                _field("Phone", ctx.get("contact_phone")),
            ])),
            _row("".join([
                _field("Email", ctx.get("contact_email")),
                _field("Street Address", ctx.get("street_address")),
            ]), cols=2),
            _row(_field("City / State / Zip", ctx.get("city_state_zip"), wide=True), cols=1),
        ])
    else:
        contact_block = "".join([
            _row("".join([
                _field("Name", ctx.get("contact_name")),
                _field("Relationship", ctx.get("contact_relationship")),
            ])),
            _row("".join([
                _field("Phone", ctx.get("contact_phone")),
                _field("Email", ctx.get("contact_email")),
            ])),
            _row("".join([
                _field("Street Address", ctx.get("street_address")),
                _field("City / State / Zip", ctx.get("city_state_zip")),
            ])),
        ])

    medical_details_block = ""
    if medical_details and not medical_none:
        medical_details_block = f"""
        <div class="cond show">
          {_field("Please describe", medical_details, wide=True)}
        </div>"""

    doc = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@300;400;500&display=swap');

@page {{
  size: Letter;
  margin: 0.65in 0.7in 0.75in 0.7in;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  background: #fcfcfc;
  color: #222;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 300;
  font-size: 10pt;
  line-height: 1.4;
}}
.doc {{
  width: 100%;
  max-width: 6.5in;
  margin: 0 auto;
}}
.top {{
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16pt;
  padding-bottom: 14pt;
  margin-bottom: 6pt;
  border-bottom: 1pt solid #ebebeb;
}}
.brand-logo {{ height: 52pt; width: auto; display: block; }}
.brand-fallback {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 28pt;
  text-transform: uppercase;
}}
.top-meta {{ text-align: right; }}
.doc-eyebrow {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #999;
}}
.doc-title {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 22pt;
  text-transform: uppercase;
  line-height: 0.95;
  margin-top: 2pt;
}}
.doc-sub {{
  font-size: 9pt;
  color: #999;
  margin-top: 4pt;
}}
.sec-lbl {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  font-size: 8.5pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #999;
  margin: 18pt 0 8pt;
  padding-bottom: 4pt;
  border-bottom: 1pt solid #e8e8e8;
}}
.row {{ display: grid; gap: 8pt; margin-bottom: 8pt; }}
.col1 {{ grid-template-columns: 1fr; }}
.col2 {{ grid-template-columns: 1fr 1fr; }}
.col3 {{ grid-template-columns: 1fr 1fr 1fr; }}
.field {{ display: flex; flex-direction: column; gap: 3pt; }}
.field-wide {{ grid-column: 1 / -1; }}
.fld-lbl {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  font-size: 7.5pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #999;
}}
.fld-val {{
  background: #fff;
  border: 1pt solid #e0e0e0;
  border-radius: 1pt;
  color: #222;
  font-size: 10pt;
  font-weight: 300;
  padding: 7pt 9pt;
  min-height: 28pt;
}}
.chip-lbl {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  font-size: 7.5pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #999;
  margin: 0 0 6pt;
}}
.chips {{ display: flex; flex-wrap: wrap; gap: 5pt; margin-bottom: 8pt; }}
.chip {{
  background: #fff;
  border: 1pt solid #e0e0e0;
  border-radius: 1pt;
  color: #bbb;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 5pt 9pt;
  text-transform: uppercase;
}}
.chip.on {{
  background: #c8f000;
  border-color: #c8f000;
  color: #222;
}}
.med-grid {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1pt solid #e0e0e0;
  border-radius: 1pt;
  overflow: hidden;
  margin-bottom: 8pt;
}}
.mi {{
  display: flex;
  align-items: center;
  gap: 7pt;
  padding: 7pt 9pt;
  border-bottom: 1pt solid #f0f0f0;
  border-right: 1pt solid #f0f0f0;
  background: #fff;
}}
.mi:nth-child(2n) {{ border-right: none; }}
.mi:nth-last-child(-n+2) {{ border-bottom: none; }}
.mi.on {{ background: #fafef0; }}
.ck {{
  width: 11pt;
  height: 11pt;
  border: 1pt solid #ddd;
  border-radius: 1pt;
  flex-shrink: 0;
  background: #fff;
  position: relative;
}}
.mi.on .ck {{ background: #c8f000; border-color: #c8f000; }}
.mi.on .ck::after {{
  content: '';
  position: absolute;
  left: 2pt;
  top: 1.5pt;
  width: 6pt;
  height: 3.5pt;
  border-left: 1.2pt solid #222;
  border-bottom: 1.2pt solid #222;
  transform: rotate(-45deg);
}}
.mt {{ font-size: 9pt; color: #555; }}
.cond {{
  background: #fafafa;
  border-left: 2pt solid #c8f000;
  padding: 8pt 10pt;
  margin: 0 0 8pt;
}}
.cond .fld-val {{ background: #fff; }}
.waiver-page {{ page-break-before: always; padding-top: 4pt; }}
.prefill-tag {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 16pt;
  text-transform: uppercase;
  margin-bottom: 2pt;
}}
.prefill-sub {{
  font-size: 9pt;
  color: #bbb;
  margin-bottom: 12pt;
}}
.waiver-txt {{
  font-size: 8.5pt;
  color: #666;
  line-height: 1.65;
  border: 1pt solid #e8e8e8;
  background: #fff;
  padding: 11pt;
  margin-bottom: 12pt;
}}
.waiver-txt strong {{ color: #444; font-weight: 500; }}
.radio-row {{
  display: flex;
  align-items: flex-start;
  gap: 8pt;
  padding: 7pt 0;
  border-bottom: 1pt solid #f0f0f0;
}}
.radio-row:last-child {{ border-bottom: none; }}
.rb {{
  width: 11pt;
  height: 11pt;
  border: 1pt solid #ddd;
  border-radius: 1pt;
  flex-shrink: 0;
  margin-top: 1pt;
  background: #fff;
  position: relative;
}}
.rb.on {{ background: #c8f000; border-color: #c8f000; }}
.rb.on::after {{
  content: '';
  position: absolute;
  left: 2pt;
  top: 1.5pt;
  width: 6pt;
  height: 3.5pt;
  border-left: 1.2pt solid #222;
  border-bottom: 1.2pt solid #222;
  transform: rotate(-45deg);
}}
.rt {{ font-size: 9pt; color: #666; line-height: 1.45; }}
.rt strong {{ color: #333; font-weight: 500; }}
.sig-block {{
  margin-top: 10pt;
  padding-top: 10pt;
  border-top: 1pt solid #ebebeb;
}}
.sig-wrap {{
  border: 1pt solid #e0e0e0;
  border-radius: 1pt;
  background: #fafafa;
  padding: 6pt;
  margin: 6pt 0 8pt;
  min-height: 72pt;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}}
.sig-img {{
  display: block;
  max-width: 100%;
  max-height: 64pt;
}}
.sig-empty {{ color: #bbb; font-size: 9pt; padding: 8pt; }}
.sig-meta {{
  font-size: 8.5pt;
  color: #888;
  margin-top: 4pt;
}}
.sig-name {{
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 14pt;
  text-transform: uppercase;
  margin-bottom: 2pt;
}}
</style>
</head>
<body>
<div class="doc">
  <div class="top">
    {logo_html}
    <div class="top-meta">
      <div class="doc-eyebrow">Enrollment</div>
      <div class="doc-title">Enroll.</div>
      <div class="doc-sub">Submitted {_esc(submitted)}</div>
    </div>
  </div>

  {_sec("Athlete")}
  {_row("".join([
      _field("Full Name", athlete_name),
      _field("Date of Birth", _fmt_date(ctx.get("date_of_birth"))),
  ]))}
  {_row("".join([
      _field("School", ctx.get("school")),
      _field("Grade", ctx.get("grade")),
      _field("T-Shirt", ctx.get("shirt_size")),
  ]), cols=3)}
  {_chip_lbl("Program of Interest")}
  {_chips(PROGRAMS, program_type)}

  {_sec("Tennis Background")}
  {_row("".join([
      _field("UTR Rating", ctx.get("utr")),
      _field("WTN Rating", ctx.get("wtn")),
  ]))}
  {_chip_lbl("Primary Goal(s)")}
  {_chips([(g, g) for g in GOALS], goals)}

  {_sec(contact_label)}
  {contact_block}

  {_sec("Emergency Contact")}
  {_row("".join([
      _field("Name", ctx.get("emergency_contact_name")),
      _field("Relationship", ctx.get("emergency_contact_relationship")),
  ]))}
  {_row("".join([
      _field("Phone", ctx.get("emergency_contact_phone")),
      _field("Email", ctx.get("emergency_contact_email")),
  ]))}

  {_sec("Medical")}
  {_chip_lbl("Flag any of the following")}
  {_med_grid(medical_none, medical_flags)}
  {medical_details_block}

  {_sec("Additional")}
  {_chip_lbl("How did you hear about EAT?")}
  {_chips([(r, r) for r in REFERRALS], ctx.get("referral_source") or "")}
  {_row(_field("Anything else?", ctx.get("additional_notes"), wide=True), cols=1)}

  <div class="waiver-page">
    <div class="prefill-tag">{_esc(athlete_name.upper())}</div>
    <div class="prefill-sub">Signed waiver for {_esc(athlete_name)}</div>

    <div class="waiver-txt">{_waiver_html()}</div>

    {_sec("Photo Release")}
    {_radio(
        "Yes",
        "I authorize EAT to photograph or record my athlete for promotional purposes.",
        photo_release is True,
    )}
    {_radio(
        "No",
        "I do not authorize photography or recording of my athlete.",
        photo_release is False,
    )}

    {_sec("Confirm Your Name")}
    {_row(_field("Typed Name", typed_sig, wide=True), cols=1)}

    {_sec("Draw Your Signature")}
    <div class="sig-block">
      <div class="sig-name">{_esc(typed_sig)}</div>
      <div class="sig-wrap">{sig_html}</div>
      <div class="sig-meta">{"Signed " + _esc(signed_at) if signed_at else "Signed " + _esc(submitted)}</div>
    </div>
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
        "program_type": "full_time",
        "program_label": "Eat w/ EAT — Full-Time",
        "utr": "4.50",
        "wtn": "—",
        "goals_list": ["Tournament Prep", "College Prep"],
        "is_adult": False,
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
        "medical_none": True,
        "medical_flags": [],
        "medical_details": "",
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
        "signed_at": datetime.now(_EASTERN),
    }
