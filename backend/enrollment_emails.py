"""HTML email templates for enrollment + waiver confirmation."""
from __future__ import annotations

from invoice_emails import EAT_FONT, EAT_INK, _guardian_first_name, email_layout, email_logo_html


def build_enrollment_email_html(
    *,
    contact_name: str,
    athlete_name: str,
    program_label: str,
) -> tuple[str, str]:
    """Return (subject, html) for guardian/contact enrollment confirmation."""
    athlete_first = _guardian_first_name(athlete_name)
    text = f"color:{EAT_INK};font-family:{EAT_FONT};"
    p = f"font-size:12px;{text}line-height:1.5;margin:0 0 14px 0;"
    p_last = f"font-size:12px;{text}line-height:1.5;margin:0;"
    subject = f"EAT Enrollment — {athlete_name}"
    body = f"""
          <p style="{p}">{athlete_first},</p>
          <p style="{p}">Thank you for enrolling with EAT.</p>
          <p style="{p}">Your completed enrollment and signed waiver are attached.</p>
          <p style="{p_last}">We will confirm your program and start date shortly.</p>
        """
    return subject, email_layout(
        body_html=body,
        header_html=email_logo_html(margin="0 0 24px 0"),
        footer_style=(
            f"margin:24px 0 0 0;font-size:11px;color:{EAT_INK};font-weight:700;"
            f"letter-spacing:0.04em;text-transform:uppercase;text-align:center;font-family:{EAT_FONT};"
        ),
    )
