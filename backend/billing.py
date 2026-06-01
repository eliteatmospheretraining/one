"""Rate-card computation for attendance billing."""
from __future__ import annotations

from models import RATE_CARD, AttendanceType, ProgramType


def compute_billed_rate(
    attendance_type: AttendanceType,
    program_type: ProgramType,
    rate_override: float | None,
) -> float:
    """Snapshot the rate at the time of attendance logging.

    Rules:
      - absent -> 0
      - drop_in_full / drop_in_half -> drop-in rate (overrides do NOT apply to drop-ins)
      - private + full -> override or $85
      - semi_private + full -> override or $65
      - full_time + full -> override or $60
      - full_time + half / private+half / semi_private+half -> half of corresponding rate or override/2
    """
    at = attendance_type
    pt = program_type

    if at == AttendanceType.absent:
        return 0.0
    if at == AttendanceType.drop_in_full:
        return RATE_CARD["drop_in_full"]
    if at == AttendanceType.drop_in_half:
        return RATE_CARD["drop_in_half"]

    if pt == ProgramType.private:
        base = rate_override if rate_override is not None else RATE_CARD["private"]
    elif pt == ProgramType.semi_private:
        base = rate_override if rate_override is not None else RATE_CARD["semi_private"]
    else:  # full_time
        base = rate_override if rate_override is not None else RATE_CARD["full_day"]
        # If no override, half rate has its own price ($30)
        if at == AttendanceType.half and rate_override is None:
            return RATE_CARD["half_day"]

    if at == AttendanceType.half:
        return round(base / 2, 2)
    return round(base, 2)


def describe_line(attendance_type: AttendanceType, program_type: ProgramType, session_date: str) -> str:
    """Human-readable description for an invoice line item."""
    pt_label = {
        ProgramType.full_time: "Full-Time Training",
        ProgramType.private: "Private Lesson",
        ProgramType.semi_private: "Semi-Private Lesson",
    }[program_type]
    at_label = {
        AttendanceType.full: "Full Day",
        AttendanceType.half: "Half Day",
        AttendanceType.drop_in_full: "Drop-In · Full Day",
        AttendanceType.drop_in_half: "Drop-In · Half Day",
        AttendanceType.absent: "Absent",
    }[attendance_type]
    return f"{pt_label} — {at_label} ({session_date})"
