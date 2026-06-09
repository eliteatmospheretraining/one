"""HTML email templates for guardian invoice magic links."""
from __future__ import annotations

import base64
import os
from datetime import date
from pathlib import Path
from typing import Optional

BASE = Path(__file__).parent

# Brand tokens (match frontend tailwind: ink, paper, accent, muted)
EAT_INK = "#141414"
EAT_PAPER = "#F5F5F5"
EAT_WHITE = "#FFFFFF"
EAT_BORDER = "#EDEDED"
EAT_CANVAS = "#FCFCFC"
EAT_ACCENT = "#CBFF00"
EAT_MUTED = "#888888"
EAT_FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"

# Branded guardian emails — compact header so CTA is visible on mobile open.
BRANDED_LOGO_WIDTH = 72
BRANDED_LOGO_MARGIN = "0 0 12px 0"
BRANDED_OUTER_PADDING = "24px 16px"
BRANDED_CARD_PADDING = "28px 24px"


def _money(amount: float) -> str:
    return f"${amount:,.2f}"


def _format_email_date(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        d = date.fromisoformat(str(iso)[:10])
        return d.strftime("%m-%d-%Y")
    except ValueError:
        return str(iso)[:10]


def _guardian_first_name(guardian_name: str) -> str:
    name = (guardian_name or "").strip()
    if not name:
        return "there"
    return name.split()[0]


def _format_period_range(period_start: str, period_end: str) -> str:
    """Period as MM/DD – MM/DD/YYYY for email copy."""
    start = end = ""
    try:
        start = date.fromisoformat(str(period_start)[:10]).strftime("%m/%d")
    except ValueError:
        start = str(period_start)[:10]
    try:
        end = date.fromisoformat(str(period_end)[:10]).strftime("%m/%d/%Y")
    except ValueError:
        end = str(period_end)[:10]
    return f"{start} &ndash; {end}"


def _email_logo_src() -> str:
    """Hosted HTTPS logo (mobile Gmail) or inline data URI fallback."""
    hosted = (os.environ.get("LOGO_URL") or "").strip()
    if hosted.startswith("https://"):
        return hosted
    candidates = (
        ("assets/AlternateLogo_BLK.png", "image/png"),
        ("assets/AlternateLogo_BLK.jpg", "image/jpeg"),
        ("assets/EAT_black.svg", "image/svg+xml"),
        ("EAT_black.svg", "image/svg+xml"),
    )
    for name, mime in candidates:
        path = BASE / name
        if path.exists():
            encoded = base64.b64encode(path.read_bytes()).decode()
            return f"data:{mime};base64,{encoded}"
    return ""


def email_logo_html(*, width: int = BRANDED_LOGO_WIDTH, margin: str = BRANDED_LOGO_MARGIN) -> str:
    """Centered EAT logo for email headers."""
    logo_src = _email_logo_src()
    if logo_src:
        display_width = width
        return (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:{margin};">'
            f"<tr><td align=\"center\">"
            f'<img src="{logo_src}" alt="Elite Atmosphere Training" width="{display_width}" '
            f'style="display:block;margin:0 auto;width:{display_width}px;max-width:100%;height:auto;border:0;" />'
            f"</td></tr></table>"
        )
    return (
        f'<p style="margin:{margin};font-size:11px;color:{EAT_INK};font-weight:700;'
        f"letter-spacing:0.14em;text-transform:uppercase;text-align:center;font-family:{EAT_FONT};"
        f'">EAT</p>'
    )


def email_button_html(*, href: str, label: str) -> str:
    """Bulletproof CTA button + spacer (margins on <p> after <a> fail in mobile Gmail)."""
    return f"""
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 0 0;">
  <tr>
    <td align="left" bgcolor="{EAT_ACCENT}" style="background-color:{EAT_ACCENT};padding:12px 20px;">
      <a href="{href}" style="color:{EAT_INK};font-family:{EAT_FONT};font-size:12px;font-weight:600;text-decoration:none;display:inline-block;text-transform:uppercase;letter-spacing:0.08em;">{label}</a>
    </td>
  </tr>
</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr><td height="24" style="height:24px;line-height:24px;font-size:1px;">&nbsp;</td></tr>
</table>"""


def branded_email_layout(*, body_html: str) -> str:
    """Compact branded layout: small logo header + body card (no footer)."""
    return email_layout(
        body_html=body_html,
        header_html=email_logo_html(),
        footer_html="",
        outer_padding=BRANDED_OUTER_PADDING,
        card_padding=BRANDED_CARD_PADDING,
    )


def email_layout(
    *,
    body_html: str,
    header_html: Optional[str] = None,
    footer_style: Optional[str] = None,
    footer_html: Optional[str] = None,
    outer_padding: str = "48px 20px",
    card_padding: str = "48px 40px",
    footer_padding: str = "24px",
) -> str:
    if footer_html == "":
        footer_block = ""
    elif footer_html is None:
        if footer_style is None:
            footer_style = (
                f"margin:24px 0 0 0;font-size:11px;color:{EAT_MUTED};letter-spacing:0.14em;"
                f"text-transform:uppercase;text-align:center;font-family:{EAT_FONT};"
            )
        footer_block = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            f'<tr><td align="center" style="padding-top:{footer_padding};">'
            f'<p style="{footer_style}">Elite Atmosphere Training</p>'
            f"</td></tr></table>"
        )
    else:
        footer_block = footer_html
    header_block = header_html or ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
</head>
<body style="margin:0;padding:0;background:{EAT_WHITE};font-family:{EAT_FONT};font-size:12px;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{EAT_WHITE};padding:{outer_padding};">
    <tr>
      <td align="center">
        {header_block}
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:{card_padding};text-align:left;background:{EAT_WHITE};color:{EAT_INK};border:1px solid {EAT_BORDER};">
              {body_html}
            </td>
          </tr>
        </table>
        {footer_block}
      </td>
    </tr>
  </table>
</body>
</html>"""


def build_invoice_email_html(
    *,
    kind: str,
    guardian_name: str,
    invoice_number: str,
    period_start: str,
    period_end: str,
    total: float,
    magic_url: str,
    pdf_url: str,
    payment_amount: Optional[float] = None,
    payment_method: Optional[str] = None,
    payment_date: Optional[str] = None,
) -> tuple[str, str]:
    """Return (subject, html) for kind 'due' or 'paid'."""
    first = _guardian_first_name(guardian_name)
    period = _format_period_range(period_start, period_end)
    text = f"color:{EAT_INK};font-family:{EAT_FONT};"
    p = f"font-size:12px;{text}line-height:1.5;margin:0 0 14px 0;"
    p_last = f"font-size:12px;{text}line-height:1.5;margin:0;"

    if kind == "paid":
        subject = f"Receipt · {invoice_number}"
        body = f"""
          <p style="{p}">{first},</p>
          <p style="{p}">Much appreciated.</p>
          <p style="{p}">Your receipt for <strong>{invoice_number}</strong> covering {period} is attached.</p>
          {email_button_html(href=pdf_url, label="View invoice")}
          <p style="{p_last}">See you on the court.</p>
        """
    else:
        subject = f"EAT Invoice {invoice_number} - Ready"
        body = f"""
          <p style="{p}">{first},</p>
          <p style="{p}">Your invoice <strong>{invoice_number}</strong> covering {period} is ready.</p>
          <p style="{p}">Amount due: <strong>{_money(total)}</strong></p>
          {email_button_html(href=magic_url, label="View invoice")}
          <p style="{p_last}">As always, thank you for trusting us and for being a part of the EAT family.</p>
        """

    return subject, branded_email_layout(body_html=body)


def write_invoice_email_samples(*, app_base_url: str = "https://eliteatmospheretraining.com") -> None:
    """Write static HTML previews to backend/samples (run: python -m invoice_emails)."""
    base = app_base_url.rstrip("/")
    magic_url = f"{base}/invoice?token=preview-token"
    pdf_url = f"{base}/api/invoice-access/pdf?token=preview-token"
    common = dict(
        guardian_name="Maria Hernandez",
        invoice_number="EAT-000001",
        period_start="2026-05-26",
        period_end="2026-05-30",
        total=270.00,
        magic_url=magic_url,
        pdf_url=pdf_url,
    )
    out_dir = BASE / "samples"
    out_dir.mkdir(exist_ok=True)
    for kind, filename in (
        ("due", "EAT_Invoice_Email_Sample_DUE.html"),
        ("paid", "EAT_Invoice_Email_Sample_PAID.html"),
    ):
        kwargs = {**common}
        if kind == "paid":
            kwargs.update(payment_amount=270.00, payment_method="Zelle", payment_date="2026-06-03")
        subject, html = build_invoice_email_html(kind=kind, **kwargs)
        path = out_dir / filename
        path.write_text(html, encoding="utf-8")
        print(f"Wrote {path} ({subject})")


if __name__ == "__main__":
    import os

    from dotenv import load_dotenv

    load_dotenv(BASE / ".env")
    write_invoice_email_samples(
        app_base_url=os.environ.get("APP_BASE_URL", "https://eliteatmospheretraining.com"),
    )
