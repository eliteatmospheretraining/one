"""Pydantic models for Elite Atmosphere Training portal."""
from __future__ import annotations

from datetime import date, date as DateType, datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
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
    pending = "pending"
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
    present = "present"  # UI: coach marks showed up; billing resolves to full/half/drop-in
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

class EmergencyContact(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None


class FamilyBase(BaseModel):
    family_name: str
    guardian_name: Optional[str] = None
    guardian_email: Optional[EmailStr] = None
    guardian_phone: Optional[str] = None
    guardian_name_secondary: Optional[str] = None
    guardian_email_secondary: Optional[EmailStr] = None
    guardian_phone_secondary: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_relationship_secondary: Optional[str] = None
    street_address: Optional[str] = None
    city_state_zip: Optional[str] = None
    emergency_contacts: List[EmergencyContact] = Field(default_factory=list)
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None
    notion_lookup_key: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_emergency_contacts(cls, data):
        if not isinstance(data, dict):
            return data
        contacts = data.get("emergency_contacts") or []
        if contacts:
            first = contacts[0]
            data.setdefault("emergency_contact_name", first.get("name"))
            data.setdefault("emergency_contact_phone", first.get("phone"))
            data.setdefault("emergency_contact_email", first.get("email"))
        elif data.get("emergency_contact_name"):
            data["emergency_contacts"] = [{
                "name": data["emergency_contact_name"],
                "phone": data.get("emergency_contact_phone"),
                "email": data.get("emergency_contact_email"),
            }]
        return data


class Family(FamilyBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    created_at: datetime = Field(default_factory=_now)


class FamilyCreate(FamilyBase):
    @model_validator(mode="after")
    def require_primary_contact(self):
        if not (self.guardian_name or "").strip():
            raise ValueError("Primary contact name is required")
        if not self.guardian_email:
            raise ValueError("Primary contact email is required")
        if not (self.guardian_phone or "").strip():
            raise ValueError("Primary contact phone is required")
        return self


class FamilyUpdate(BaseModel):
    family_name: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[EmailStr] = None
    guardian_phone: Optional[str] = None
    guardian_name_secondary: Optional[str] = None
    guardian_email_secondary: Optional[EmailStr] = None
    guardian_phone_secondary: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_relationship_secondary: Optional[str] = None
    street_address: Optional[str] = None
    city_state_zip: Optional[str] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None


# ---------- Athletes ----------

class AthleteBase(BaseModel):
    full_name: str
    date_of_birth: Optional[date] = None
    program_type: Optional[ProgramType] = None
    program_types: List[ProgramType] = Field(default_factory=list)
    status: AthleteStatus = AthleteStatus.active
    training_start_date: Optional[date] = None
    utr: Optional[float] = None
    wtn: Optional[float] = None
    shirt_size: Optional[str] = None
    school: Optional[str] = None
    grade: Optional[str] = None
    enrollment_goals: Optional[str] = None
    referral_source: Optional[str] = None
    enrollment_notes: Optional[str] = None
    medical_conditions: Optional[str] = None
    rate_type: RateType = RateType.daily
    rate_override: Optional[float] = None  # null = use rate card default
    family_id: str
    notion_page_id: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_program_types(cls, data):
        if not isinstance(data, dict):
            return data
        types = data.get("program_types") or []
        primary = data.get("program_type")
        if types:
            data["program_types"] = types
            data["program_type"] = primary or types[0]
        elif primary:
            data["program_types"] = [primary]
        else:
            data["program_type"] = None
            data["program_types"] = []
        return data


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
    program_types: Optional[List[ProgramType]] = None
    status: Optional[AthleteStatus] = None
    training_start_date: Optional[date] = None
    utr: Optional[float] = None
    wtn: Optional[float] = None
    shirt_size: Optional[str] = None
    school: Optional[str] = None
    grade: Optional[str] = None
    enrollment_goals: Optional[str] = None
    referral_source: Optional[str] = None
    enrollment_notes: Optional[str] = None
    medical_conditions: Optional[str] = None
    rate_type: Optional[RateType] = None
    rate_override: Optional[float] = None
    family_id: Optional[str] = None
    notion_page_id: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_program_types(cls, data):
        if not isinstance(data, dict):
            return data
        if "program_types" not in data and "program_type" not in data:
            return data
        types = data.get("program_types") or []
        primary = data.get("program_type")
        if types:
            data["program_types"] = types
            data["program_type"] = primary or types[0]
        elif primary:
            data["program_types"] = [primary]
        return data


# ---------- Enrollment ----------

class EnrollmentSubmit(BaseModel):
    full_name: str
    date_of_birth: date
    shirt_size: str
    program_type: ProgramType
    school: Optional[str] = None
    grade: Optional[str] = None
    utr: Optional[float] = None
    wtn: Optional[float] = None
    goals: List[str] = Field(default_factory=list)
    guardian_name: str
    guardian_relationship: str
    guardian_phone: str
    guardian_email: EmailStr
    guardian_name_secondary: Optional[str] = None
    guardian_relationship_secondary: Optional[str] = None
    guardian_phone_secondary: Optional[str] = None
    guardian_email_secondary: Optional[EmailStr] = None
    primary_emergency: bool = False
    secondary_emergency: bool = False
    medical_none: bool = True
    medical_flags: List[str] = Field(default_factory=list)
    medical_details: Optional[str] = None
    referral_source: Optional[str] = None
    additional_notes: Optional[str] = None


class EnrollmentResponse(BaseModel):
    athlete_id: str
    family_id: str
    athlete_name: str
    guardian_email: EmailStr
    program_label: str


# ---------- Sessions ----------

class SessionBase(BaseModel):
    date: DateType
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
    date: Optional[DateType] = None
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
    attendance_record_ids: List[str] = Field(default_factory=list)
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


class InvoiceLineItemCreate(BaseModel):
    """Add a preset service line to a draft invoice."""
    athlete_id: str
    service_id: str
    week_start: Optional[date] = None
    week_end: Optional[date] = None
    service_date: Optional[date] = None
    quantity: float = 1.0
    unit_price: Optional[float] = None


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


class PasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class Coach(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    name: str
    email: EmailStr
    role: str = "admin"
    created_at: datetime = Field(default_factory=_now)
    password_updated_at: Optional[datetime] = None


# ---------- Rate Card ----------

RATE_CARD = {
    "full_day": 60.00,  # full-time full day ($/session); synced from Notion
    "full_day_hours": 5.0,  # optional schedule block (hr); not multiplied into full-time billing
    "half_day": 30.00,  # full-time half day ($/session)
    "half_day_hours": 2.5,  # optional schedule block (hr)
    "drop_in_full": 85.00,
    "drop_in_half": 50.00,
    "weekly": 300.00,
    "monthly": 1100.00,
    "private": 85.00,
    "semi_private": 65.00,
    "travel": 150.00,
}
