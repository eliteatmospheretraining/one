"""HTML email templates for enrollment + waiver confirmation."""
from __future__ import annotations

from invoice_emails import EAT_FONT, EAT_INK, _guardian_first_name, branded_email_layout


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
    return subject, branded_email_layout(body_html=body)


def write_enrollment_email_sample() -> None:
    """Write static HTML preview to backend/samples (run: python -m enrollment_emails)."""
    from pathlib import Path

    from dotenv import load_dotenv

    from enrollment_pdf import sample_enrollment_context

    base = Path(__file__).parent
    load_dotenv(base / ".env")
    ctx = sample_enrollment_context()
    subject, html = build_enrollment_email_html(
        contact_name=ctx["contact_name"],
        athlete_name=ctx["athlete_name"],
        program_label=ctx["program_label"],
    )
    out_dir = base / "samples"
    out_dir.mkdir(exist_ok=True)
    path = out_dir / "EAT_Enrollment_Email_Sample.html"
    path.write_text(html, encoding="utf-8")
    print(f"Wrote {path} ({subject})")


if __name__ == "__main__":
    write_enrollment_email_sample()
