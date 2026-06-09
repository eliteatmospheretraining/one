"""Rate-card computation for attendance billing."""
from __future__ import annotations

import calendar
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from models import AttendanceType, ProgramType, RateType, SessionStatus
from rate_card_store import get_rate_card

SESSION_TIME_ZONE = ZoneInfo("America/New_York")


def format_invoice_display_date(value: str) -> str:
    """ISO date or range to MM-DD-YYYY for invoice line copy."""
    raw = str(value).strip()
    if not raw:
        return ""
    sep = " – "
    if sep in raw:
        return sep.join(format_invoice_display_date(part) for part in raw.split(sep))
    try:
        return date.fromisoformat(raw[:10]).strftime("%m-%d-%Y")
    except ValueError:
        return raw


def session_date_from_line_description(description: str) -> str | None:
    """First session date (ISO) from parentheses in a line description."""
    match = re.search(r"\(([^)]+)\)", description or "")
    if not match:
        return None
    inner = match.group(1).strip()
    if " – " in inner:
        inner = inner.split(" – ")[0].strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", inner):
        return inner
    if re.fullmatch(r"\d{2}-\d{2}-\d{4}", inner):
        try:
            month, day, year = inner.split("-")
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return None
    return None


# Fallback when start/end times are missing (private / semi-private).
DEFAULT_DURATION_BY_SESSION_TYPE: dict[str, float] = {
    ProgramType.private.value: 1.0,
    ProgramType.semi_private.value: 1.0,
}


def _parse_clock_minutes(time24: str) -> int:
    parts = str(time24).strip().split(":")
    hour = int(parts[0]) if parts else 0
    minute = int(parts[1]) if len(parts) > 1 else 0
    return hour * 60 + minute


def _snap_quarter_hours(hours: float) -> float:
    return max(0.25, round(hours * 4) / 4)


def _hours_from_session_clock(session: dict, attendance_type: AttendanceType) -> float:
    start = session.get("start_time")
    end = session.get("end_time")
    if start and end:
        start_m = _parse_clock_minutes(start)
        end_m = _parse_clock_minutes(end)
        if end_m <= start_m:
            end_m += 24 * 60
        base = _snap_quarter_hours((end_m - start_m) / 60.0)
    else:
        st = session.get("session_type") or ProgramType.full_time.value
        base = DEFAULT_DURATION_BY_SESSION_TYPE.get(st, 5.0)
    if attendance_type == AttendanceType.half:
        return base / 2
    return base


def _is_monthly_prepay(rate_type: str | None) -> bool:
    return rate_type == RateType.monthly.value


def full_time_flat_rate(
    attendance_type: AttendanceType,
    rate_override: float | None,
) -> float:
    """Flat $/session for full-time (full day or half day)."""
    card = get_rate_card()
    if attendance_type == AttendanceType.half:
        if rate_override is not None:
            return round(float(rate_override) / 2, 2)
        return float(card["half_day"])
    if rate_override is not None:
        return float(rate_override)
    return float(card["full_day"])


def billable_hours(
    session: dict,
    attendance_type: AttendanceType,
    athlete_program_type: ProgramType,
) -> float | None:
    """Hours for hourly billing. None = flat per-session rate."""
    if attendance_type in (
        AttendanceType.drop_in_full,
        AttendanceType.drop_in_half,
    ):
        return None
    if athlete_program_type == ProgramType.full_time:
        return None
    return _hours_from_session_clock(session, attendance_type)


def session_rate_for(
    program_type: ProgramType,
    attendance_type: AttendanceType,
    rate_override: float | None,
) -> float:
    """Flat per-session rate (drop-ins and full-time)."""
    card = get_rate_card()
    if attendance_type == AttendanceType.drop_in_full:
        return float(card["drop_in_full"])
    if attendance_type == AttendanceType.drop_in_half:
        return float(card["drop_in_half"])
    if program_type == ProgramType.full_time:
        return full_time_flat_rate(attendance_type, rate_override)
    if program_type == ProgramType.private:
        return float(rate_override if rate_override is not None else card["private"])
    if program_type == ProgramType.semi_private:
        return float(rate_override if rate_override is not None else card["semi_private"])
    return float(rate_override if rate_override is not None else card["full_day"])


def hourly_rate_for(
    program_type: ProgramType,
    attendance_type: AttendanceType,
    rate_override: float | None,
) -> float:
    """$/hr for private / semi-private hourly billing."""
    card = get_rate_card()
    if program_type == ProgramType.private:
        return float(rate_override if rate_override is not None else card["private"])
    if program_type == ProgramType.semi_private:
        return float(rate_override if rate_override is not None else card["semi_private"])
    return float(rate_override if rate_override is not None else card["private"])


def per_session_charge(
    attendance_type: AttendanceType,
    program_type: ProgramType,
    rate_override: float | None,
    *,
    session: dict,
    rate_type: str | None = None,
) -> tuple[float, float | None, float | None]:
    """Return (amount per session, billable hours if hourly, hourly rate if hourly)."""
    at = attendance_type
    if at == AttendanceType.absent:
        return 0.0, None, None
    if program_type == ProgramType.full_time and _is_monthly_prepay(rate_type):
        return 0.0, None, None

    hours = billable_hours(session, at, program_type)
    if hours is None:
        return round(session_rate_for(program_type, at, rate_override), 2), None, None

    hourly = hourly_rate_for(program_type, at, rate_override)
    return round(hourly * hours, 2), hours, hourly


def session_has_ended_in_est(session: dict, now: datetime | None = None) -> bool:
    """True when session date + end_time (Eastern wall clock) is at or before now."""
    if not session.get("date") or not session.get("end_time"):
        return False
    now = now or datetime.now(SESSION_TIME_ZONE)
    year, month, day = (int(x) for x in str(session["date"])[:10].split("-"))
    hour, minute = (int(x) for x in str(session["end_time"])[:5].split(":"))
    end = datetime(year, month, day, hour, minute, tzinfo=SESSION_TIME_ZONE)
    return now >= end


def session_is_billable(session: dict, now: datetime | None = None) -> bool:
    """Sessions bill once marked completed or once their Eastern end time has passed."""
    status = session.get("status") or SessionStatus.scheduled.value
    if status == SessionStatus.cancelled.value:
        return False
    if status == SessionStatus.completed.value:
        return True
    if status != SessionStatus.scheduled.value:
        return False
    now = now or datetime.now(SESSION_TIME_ZONE)
    if session_has_ended_in_est(session, now):
        return True
    # Private / semi-private: rostered athletes are present once the session date has passed.
    if session.get("session_type") in (ProgramType.private.value, ProgramType.semi_private.value):
        athlete_ids = session.get("athlete_ids") or []
        if athlete_ids and session.get("date"):
            try:
                session_day = date.fromisoformat(str(session["date"])[:10])
                if session_day < now.date():
                    return True
            except ValueError:
                pass
    # Past session dates with attendance saved (even if end_time missing).
    if session.get("attendance_logged_at") and session.get("date"):
        try:
            session_day = date.fromisoformat(str(session["date"])[:10])
            return session_day < now.date()
        except ValueError:
            pass
    return False


def athlete_on_full_time(athlete: dict) -> bool:
    program_types = athlete.get("program_types") or []
    if program_types:
        return ProgramType.full_time.value in program_types
    return athlete.get("program_type") == ProgramType.full_time.value


def full_time_day_rate_type(block_count: int) -> AttendanceType:
    """Eat w/ EAT: both AM + PM blocks present → full day; one block → half day."""
    if block_count >= 2:
        return AttendanceType.full
    return AttendanceType.half


def _full_time_present_billing_type(session: dict) -> AttendanceType:
    """Each AM/PM block stores as half-day; invoice rolls up same-day blocks to full-day."""
    card = get_rate_card()
    full_hours = float(card.get("full_day_hours", 5.0))
    start = session.get("start_time")
    end = session.get("end_time")
    if start and end:
        start_m = _parse_clock_minutes(start)
        end_m = _parse_clock_minutes(end)
        if end_m <= start_m:
            end_m += 24 * 60
        duration = (end_m - start_m) / 60.0
        if duration >= full_hours - 0.25:
            return AttendanceType.full
        return AttendanceType.half
    return AttendanceType.half


def stored_attendance_type(
    stored: str | AttendanceType,
    *,
    athlete: dict,
    session: dict,
) -> AttendanceType:
    """Normalize a stored attendance row to a billable attendance type."""
    at = AttendanceType(stored) if not isinstance(stored, AttendanceType) else stored
    if at == AttendanceType.present:
        return resolve_attendance_type(
            at,
            program_type=billing_program_type(athlete, session),
            session=session,
        )
    return at


def resolve_attendance_type(
    attendance_type: AttendanceType,
    *,
    program_type: ProgramType,
    session: dict,
) -> AttendanceType:
    """Map coach-facing attendance marks to billable attendance types."""
    if attendance_type == AttendanceType.absent:
        return AttendanceType.absent
    if attendance_type == AttendanceType.present:
        if program_type == ProgramType.full_time:
            return _full_time_present_billing_type(session)
        return AttendanceType.full
    return attendance_type


def billing_program_type(athlete: dict, session: dict) -> ProgramType:
    """Bill for the service delivered on the session, not just enrollment profile."""
    return ProgramType(session["session_type"])


def compute_billed_rate(
    attendance_type: AttendanceType,
    program_type: ProgramType,
    rate_override: float | None,
    *,
    session: dict,
    rate_type: str | None = None,
) -> float:
    """Snapshot billed amount for one attendance record."""
    amount, _, _ = per_session_charge(
        attendance_type,
        program_type,
        rate_override,
        session=session,
        rate_type=rate_type,
    )
    return amount


def describe_line(
    attendance_type: AttendanceType,
    program_type: ProgramType,
    session_date: str = "",
    *,
    session_count: int = 1,
) -> str:
    """Human-readable description for an invoice line item."""
    pt_label = {
        ProgramType.full_time: "Eat w/ EAT",
        ProgramType.private: "Private Lesson",
        ProgramType.semi_private: "Semi-Private Lesson",
    }[program_type]
    if program_type == ProgramType.semi_private:
        return pt_label
    at_label = {
        AttendanceType.full: "Daily Rate",
        AttendanceType.half: "Half-Day Rate",
        AttendanceType.present: "Daily Rate",
        AttendanceType.drop_in_full: "Drop-In Rate (Full-Day)",
        AttendanceType.drop_in_half: "Drop-In Rate (Half-Day)",
        AttendanceType.absent: "Absent",
    }.get(attendance_type, "Session")
    return f"{pt_label} — {at_label}"


def pricing_for_attendance(
    athlete: dict,
    session: dict,
    attendance_type: AttendanceType,
) -> tuple[float, str, float, float]:
    """Return (line amount, description, invoice qty, unit_price) for one attendance row."""
    pt = billing_program_type(athlete, session)
    at = attendance_type
    override = athlete.get("rate_override")
    if override is not None:
        override = float(override)

    per_session, _, _ = per_session_charge(
        at,
        pt,
        override,
        session=session,
        rate_type=athlete.get("rate_type"),
    )
    desc = describe_line(at, pt, session["date"], session_count=1)
    return per_session, desc, 1.0, per_session


def monthly_tuition_amount(athlete: dict) -> float:
    """Flat monthly prepay from rate card or athlete override."""
    if athlete.get("rate_override") is not None:
        return round(float(athlete["rate_override"]), 2)
    return round(float(get_rate_card()["monthly"]), 2)


def describe_monthly_line(athlete_name: str, period_start: date) -> str:
    month_label = period_start.strftime("%B %Y")
    return f"Full-Time Training — Monthly tuition ({month_label}) · {athlete_name}"


def month_period_for(day: date) -> tuple[date, date]:
    last = calendar.monthrange(day.year, day.month)[1]
    return day.replace(day=1), day.replace(day=last)
