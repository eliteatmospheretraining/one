"""HTML email templates for guardian invoice magic links."""
from __future__ import annotations

from datetime import date
from typing import Optional

# Brand tokens (match frontend tailwind: ink, paper, accent, muted)
EAT_INK = "#141414"
EAT_PAPER = "#F5F5F5"
EAT_WHITE = "#FFFFFF"
EAT_BORDER = "#EDEDED"
EAT_CANVAS = "#FCFCFC"
EAT_ACCENT = "#CBFF00"
EAT_MUTED = "#888888"
EAT_FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"


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


def email_layout(*, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
</head>
<body style="margin:0;padding:0;background:{EAT_WHITE};font-family:{EAT_FONT};font-size:12px;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{EAT_WHITE};padding:48px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:{EAT_WHITE};border:1px solid {EAT_BORDER};border-radius:0;">
          <tr>
            <td style="padding:48px 40px;text-align:left;background:{EAT_WHITE};color:{EAT_INK};">
              {body_html}
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0;font-size:11px;color:{EAT_MUTED};letter-spacing:0.14em;text-transform:uppercase;text-align:center;font-family:{EAT_FONT};">
          Elite Atmosphere Training
        </p>
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
    btn = (
        f"display:inline-block;background:{EAT_ACCENT};color:{EAT_INK};font-family:{EAT_FONT};"
        f"font-size:12px;font-weight:600;padding:12px 20px;text-decoration:none;"
        f"border-radius:0;margin:4px 0 0 0;"
    )

    if kind == "paid":
        subject = f"EAT Invoice {invoice_number} - Paid"
        body = f"""
          <p style="{p}">{first},</p>
          <p style="{p}">Much appreciated.</p>
          <p style="{p}">Your receipt for <strong>{invoice_number}</strong> covering {period} is attached.</p>
          <a href="{pdf_url}" style="{btn}margin:16px 0 0 0;text-transform:uppercase;letter-spacing:0.08em;">View invoice</a>
          <p style="{p}margin:24px 0 0 0;">See you on the court.</p>
        """
    else:
        subject = f"EAT Invoice {invoice_number} - Ready"
        body = f"""
          <p style="{p}">{first},</p>
          <p style="{p}">Your invoice <strong>{invoice_number}</strong> covering {period} is ready.</p>
          <p style="{p}">Amount due: <strong>{_money(total)}</strong></p>
          <a href="{magic_url}" style="{btn}margin:16px 0 0 0;text-transform:uppercase;letter-spacing:0.08em;">View invoice</a>
          <p style="font-size:12px;{text}line-height:1.5;margin:24px 0 0 0;">As always, thank you for trusting us and for being a part of the EAT family.</p>
        """

    return subject, email_layout(body_html=body)
