"""Pydantic models for Elite Atmosphere Training portal."""
from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field
import uuid


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Enums ----------

class ProgramType(str, Enum):
    full_time = "full_time"
    private = "private"
    semi_private = "semi_private"


class AthleteStatus(str, Enum):
    active = "active"
    archived = "archived"


class RateType(str, Enum):
    daily = "daily"
    half_day = "half_day"
    monthly = "monthly"
    per_session = "per_session"


class SessionStatus(str, Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"
    rescheduled = "rescheduled"


class AttendanceType(str, Enum):
    full = "full"
    half = "half"
    drop_in_full = "drop_in_full"
    drop_in_half = "drop_in_half"
    absent = "absent"


class InvoiceStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    paid = "paid"


# ---------- Families ----------

class FamilyBase(BaseModel):
    family_name: str
    guardian_name: str
    guardian_email: EmailStr
    guardian_phone: str
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None


class Family(FamilyBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    created_at: datetime = Field(default_factory=_now)


class FamilyCreate(FamilyBase):
    pass


class FamilyUpdate(BaseModel):
    family_name: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[EmailStr] = None
    guardian_phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None


# ---------- Athletes ----------

class AthleteBase(BaseModel):
    full_name: str
    date_of_birth: Optional[date] = None
    program_type: ProgramType
    status: AthleteStatus = AthleteStatus.active
    training_start_date: Optional[date] = None
    utr: Optional[float] = None
    wtn: Optional[float] = None
    shirt_size: Optional[str] = None
    rate_type: RateType = RateType.daily
    rate_override: Optional[float] = None  # null = use rate card default
    family_id: str


class Athlete(AthleteBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    created_at: datetime = Field(default_factory=_now)


class AthleteCreate(AthleteBase):
    pass


class AthleteUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    program_type: Optional[ProgramType] = None
    status: Optional[AthleteStatus] = None
    training_start_date: Optional[date] = None
    utr: Optional[float] = None
    wtn: Optional[float] = None
    shirt_size: Optional[str] = None
    rate_type: Optional[RateType] = None
    rate_override: Optional[float] = None
    family_id: Optional[str] = None


# ---------- Sessions ----------

class SessionBase(BaseModel):
    date: date
    start_time: Optional[str] = None  # "09:00"
    end_time: Optional[str] = None
    session_type: ProgramType
    location: Optional[str] = None
    status: SessionStatus = SessionStatus.scheduled
    coach_id: Optional[str] = None
    notes: Optional[str] = None
    athlete_ids: List[str] = Field(default_factory=list)  # expected attendees


class TrainingSession(SessionBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    created_at: datetime = Field(default_factory=_now)


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    date: Optional[date] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    session_type: Optional[ProgramType] = None
    location: Optional[str] = None
    status: Optional[SessionStatus] = None
    coach_id: Optional[str] = None
    notes: Optional[str] = None
    athlete_ids: Optional[List[str]] = None


# ---------- Attendance ----------

class AttendanceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    session_id: str
    athlete_id: str
    attendance_type: AttendanceType
    billed_rate: float = 0.0
    logged_at: datetime = Field(default_factory=_now)


class AttendanceEntry(BaseModel):
    athlete_id: str
    attendance_type: AttendanceType


class AttendanceSave(BaseModel):
    entries: List[AttendanceEntry]


# ---------- Invoices ----------

class InvoiceLineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    invoice_id: str
    athlete_id: str
    athlete_name: str
    attendance_record_id: Optional[str] = None
    description: str
    quantity: float = 1
    unit_price: float
    amount: float


class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    invoice_number: str
    family_id: str
    period_start: date
    period_end: date
    issue_date: date = Field(default_factory=lambda: date.today())
    subtotal: float = 0.0
    total: float = 0.0
    status: InvoiceStatus = InvoiceStatus.draft
    pdf_url: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)


class InvoiceGenerateRequest(BaseModel):
    family_id: str
    period_start: date
    period_end: date


# ---------- Payments ----------

class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    invoice_id: str
    amount_received: float
    received_date: date
    method: str = "Zelle"
    note: Optional[str] = None
    logged_by: Optional[str] = None
    logged_at: datetime = Field(default_factory=_now)


class PaymentCreate(BaseModel):
    amount_received: float
    received_date: date
    method: str = "Zelle"
    note: Optional[str] = None


# ---------- Auth ----------

class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkVerify(BaseModel):
    token: str


class Coach(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    name: str
    email: EmailStr
    role: str = "admin"
    created_at: datetime = Field(default_factory=_now)


# ---------- Rate Card ----------

RATE_CARD = {
    "full_day": 60.00,
    "half_day": 30.00,
    "drop_in_full": 85.00,
    "drop_in_half": 50.00,
    "weekly": 300.00,
    "monthly": 1100.00,
    "private": 85.00,
    "semi_private": 65.00,
}
