"""HTML email templates for standalone waiver signing."""
from __future__ import annotations

from invoice_emails import EAT_FONT, EAT_INK, _guardian_first_name, branded_email_layout, email_button_html


def build_waiver_invite_email_html(
    *,
    guardian_name: str,
    athlete_name: str,
    sign_url: str,
) -> tuple[str, str]:
    """Email asking parent to sign the waiver online."""
    first = _guardian_first_name(guardian_name)
    text = f"color:{EAT_INK};font-family:{EAT_FONT};"
    p = f"font-size:12px;{text}line-height:1.5;margin:0 0 14px 0;"
    p_last = f"font-size:12px;{text}line-height:1.5;margin:0;"
    subject = f"Sign EAT waiver — {athlete_name}"
    body = f"""
          <p style="{p}">{first},</p>
          <p style="{p}">Please review and sign the liability waiver for <strong>{athlete_name}</strong>.</p>
          <p style="{p}">Type your name and draw your signature on the form — it only takes a minute.</p>
          {email_button_html(href=sign_url, label="Sign waiver")}
          <p style="{p_last}">Thank you for being part of the EAT family.</p>
        """
    return subject, branded_email_layout(body_html=body)


def build_waiver_signed_email_html(
    *,
    guardian_name: str,
    athlete_name: str,
    pdf_url: str,
) -> tuple[str, str]:
    """Confirmation after parent signs — signed waiver PDF attached."""
    first = _guardian_first_name(guardian_name)
    text = f"color:{EAT_INK};font-family:{EAT_FONT};"
    p = f"font-size:12px;{text}line-height:1.5;margin:0 0 14px 0;"
    p_last = f"font-size:12px;{text}line-height:1.5;margin:0;"
    subject = f"EAT Waiver — {athlete_name}"
    body = f"""
          <p style="{p}">{first},</p>
          <p style="{p}">Thank you — your signed waiver for <strong>{athlete_name}</strong> is attached.</p>
          {email_button_html(href=pdf_url, label="View waiver")}
          <p style="{p_last}">See you on the court.</p>
        """
    return subject, branded_email_layout(body_html=body)
