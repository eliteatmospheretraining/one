"""EAT Portal backend e2e tests via public REACT_APP_BACKEND_URL.

Covers: auth (magic link), rate-card, families CRUD, athletes CRUD,
sessions CRUD, attendance + billing, invoices generate/get/pdf/send/payment.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fall back to /app/frontend/.env when run inside container
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "coachrico@eliteatmospheretraining.com"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

# ---------------- Fixtures ----------------


@pytest.fixture(scope="session")
def jwt_token() -> str:
    # Request a magic link with admin email; DEV_MODE returns dev_token
    r = requests.post(f"{API}/auth/request-magic-link", json={"email": ADMIN_EMAIL}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "dev_token" in body, f"DEV_MODE not returning dev_token: {body}"
    token = body["dev_token"]

    v = requests.post(f"{API}/auth/verify-magic-link", json={"token": token}, timeout=30)
    assert v.status_code == 200, v.text
    data = v.json()
    assert "token" in data and "coach" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(jwt_token):
    return {"Authorization": f"Bearer {jwt_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def family(auth_headers):
    payload = {
        "family_name": f"TEST_Family_{uuid.uuid4().hex[:6]}",
        "guardian_name": "Test Guardian",
        "guardian_email": f"test_{uuid.uuid4().hex[:6]}@example.com",
        "guardian_phone": "555-0100",
    }
    r = requests.post(f"{API}/families", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    fam = r.json()
    yield fam
    # cleanup: archive athletes then delete family
    ath = requests.get(f"{API}/athletes?family_id={fam['id']}", headers=auth_headers).json()
    for a in ath:
        requests.patch(f"{API}/athletes/{a['id']}", json={"family_id": fam["id"]}, headers=auth_headers)
    # Try delete (may fail if athletes exist; ok)
    requests.delete(f"{API}/families/{fam['id']}", headers=auth_headers)


# ---------------- Auth ----------------


class TestAuth:
    def test_request_magic_link_admin_returns_dev_token(self):
        r = requests.post(f"{API}/auth/request-magic-link", json={"email": ADMIN_EMAIL}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert "dev_token" in body
        assert "dev_magic_link" in body

    def test_request_magic_link_non_admin_silent(self):
        r = requests.post(f"{API}/auth/request-magic-link", json={"email": "rando@example.com"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert "dev_token" not in body
        assert "dev_magic_link" not in body

    def test_verify_magic_link_single_use(self):
        r = requests.post(f"{API}/auth/request-magic-link", json={"email": ADMIN_EMAIL}, timeout=30)
        token = r.json()["dev_token"]

        first = requests.post(f"{API}/auth/verify-magic-link", json={"token": token}, timeout=30)
        assert first.status_code == 200
        data = first.json()
        assert "token" in data
        assert data["coach"]["email"] == ADMIN_EMAIL

        second = requests.post(f"{API}/auth/verify-magic-link", json={"token": token}, timeout=30)
        assert second.status_code == 400, f"Token must be single-use: {second.text}"

    def test_verify_invalid_token(self):
        r = requests.post(f"{API}/auth/verify-magic-link", json={"token": "bogus"}, timeout=30)
        assert r.status_code == 400

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_jwt(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        coach = r.json()
        assert coach["email"] == ADMIN_EMAIL
        assert coach["role"] == "admin"
        assert "password_hash" not in coach

    @pytest.mark.skipif(not ADMIN_PASSWORD, reason="ADMIN_PASSWORD not set on API")
    def test_password_login_success(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["coach"]["email"] == ADMIN_EMAIL
        assert "password_hash" not in data["coach"]

    @pytest.mark.skipif(not ADMIN_PASSWORD, reason="ADMIN_PASSWORD not set on API")
    def test_password_login_wrong_password(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrong-password-xyz"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_password_login_non_admin(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": "rando@example.com", "password": "anything"},
            timeout=30,
        )
        assert r.status_code == 401


# ---------------- Rate card ----------------


class TestRateCard:
    def test_rate_card_values(self):
        r = requests.get(f"{API}/rate-card", timeout=30)
        assert r.status_code == 200
        rc = r.json()
        assert rc["full_day"] == 69
        assert rc["full_day_hours"] == 5
        assert rc["half_day_hours"] == 2.5
        assert rc["half_day"] == 34.5
        assert rc["drop_in"] == 50
        assert rc["weekly"] == 345
        assert rc["weekly_half"] == 172.5
        assert rc["monthly"] == 1380
        assert rc["monthly_half"] == 690
        assert rc["private"] == 85
        assert rc["semi_private"] == 65

    def test_invoice_line_date_format(self):
        from billing import describe_line, format_invoice_display_date
        from models import AttendanceType, ProgramType

        assert format_invoice_display_date("2026-06-03") == "06-03-2026"
        desc = describe_line(AttendanceType.full, ProgramType.full_time, "2026-06-03")
        assert desc == "Eat w/ EAT — Daily Rate"
        assert "06-03-2026" not in desc
        private_desc = describe_line(AttendanceType.full, ProgramType.private, "2026-06-03")
        assert private_desc == "Private Lesson"
        assert "Daily Rate" not in private_desc

    def test_private_rollup_quantity_uses_standard_lesson_rate(self):
        from billing import amount_for_line_quantity_change

        # 5×$85 + 1 two-hour @ $170 → $595; averaged unit price ≈ $99.17
        amount, unit_price = amount_for_line_quantity_change(
            description="Private Lesson",
            old_quantity=6,
            new_quantity=7,
            old_amount=595.0,
            unit_price=99.17,
            rate_override=None,
            has_attendance_records=True,
        )
        assert amount == 680.0
        assert unit_price == round(680 / 7, 2)

        amount_down, _ = amount_for_line_quantity_change(
            description="Private Lesson",
            old_quantity=6,
            new_quantity=5,
            old_amount=595.0,
            unit_price=99.17,
            rate_override=None,
            has_attendance_records=True,
        )
        assert amount_down == 510.0

    def test_other_lines_still_scale_by_unit_price(self):
        from billing import amount_for_line_quantity_change

        amount, unit_price = amount_for_line_quantity_change(
            description="Eat w/ EAT — Monthly Rate (June 2026)",
            old_quantity=1,
            new_quantity=2,
            old_amount=1380.0,
            unit_price=1380.0,
            rate_override=None,
            has_attendance_records=False,
        )
        assert amount == 2760.0
        assert unit_price == 1380.0

    def test_service_catalog_includes_weekly_half_day(self):
        from invoice_services import list_service_options

        options = {o["id"]: o for o in list_service_options()}
        assert "eat_weekly_half" in options
        assert options["eat_weekly_half"]["rate_card_key"] == "weekly_half"
        assert options["eat_weekly_half"]["default_unit_price"] == 172.5
        assert "Half-Day" in options["eat_weekly_half"]["label"]

    def test_service_catalog_includes_monthly_legacy(self):
        from invoice_services import list_service_options

        options = {o["id"]: o for o in list_service_options()}
        assert "eat_monthly_legacy" in options
        assert options["eat_monthly_legacy"]["rate_card_key"] == "monthly_legacy"
        assert options["eat_monthly_legacy"]["default_unit_price"] == 1100.0
        assert "Legacy" in options["eat_monthly_legacy"]["label"]

    def test_full_time_flat_rate_from_card(self):
        from billing import full_time_flat_rate
        from models import AttendanceType
        from rate_card_store import apply_rate_card, reset_rate_card_to_default

        apply_rate_card(
            {"full_day": 55.0, "half_day": 27.5},
            source="test",
            notion_url=None,
            error=None,
        )
        try:
            assert full_time_flat_rate(AttendanceType.full, None) == 55.0
            assert full_time_flat_rate(AttendanceType.half, None) == 27.5
        finally:
            reset_rate_card_to_default()

    def test_weekly_prepay_billing(self):
        from billing import (
            is_monthly_invoice_period,
            is_weekly_invoice_period,
            per_session_charge,
            weekly_tuition_amount,
        )
        from datetime import date
        from models import AttendanceType, ProgramType

        amount, _, _ = per_session_charge(
            AttendanceType.full,
            ProgramType.full_time,
            None,
            session={"session_type": "full_time"},
            rate_type="weekly",
        )
        assert amount == 0.0

        drop_in, _, _ = per_session_charge(
            AttendanceType.drop_in_half,
            ProgramType.full_time,
            None,
            session={"session_type": "full_time"},
            rate_type="weekly",
        )
        assert drop_in == 50.0

        assert weekly_tuition_amount({"enrollment_tier": "full_day"}) == 345.0
        assert weekly_tuition_amount({"enrollment_tier": "half_day"}) == 172.5

        assert is_weekly_invoice_period(date(2026, 6, 1), date(2026, 6, 5))
        assert not is_weekly_invoice_period(date(2026, 6, 1), date(2026, 6, 30))
        assert is_monthly_invoice_period(date(2026, 6, 1), date(2026, 6, 30))
        from billing import monthly_tuition_amount

        assert monthly_tuition_amount({"enrollment_tier": "full_day"}) == 1380.0
        assert monthly_tuition_amount({"enrollment_tier": "half_day"}) == 690.0

    def test_rostered_lesson_invoice_period_routing(self):
        from billing import rostered_lesson_bills_on_invoice
        from datetime import date

        athlete = {"rate_type": "monthly"}
        private = {"session_type": "private"}
        june = (date(2026, 6, 1), date(2026, 6, 30))
        week = (date(2026, 6, 1), date(2026, 6, 5))
        assert rostered_lesson_bills_on_invoice(athlete, private, *june) is True
        assert rostered_lesson_bills_on_invoice(athlete, private, *week) is False

        weekly_athlete = {"rate_type": "weekly"}
        assert rostered_lesson_bills_on_invoice(weekly_athlete, private, *week) is True
        assert rostered_lesson_bills_on_invoice(weekly_athlete, private, *june) is False

    def test_invoice_discount_math(self):
        from invoice_discounts import compute_discount_amount, invoice_totals

        assert compute_discount_amount(1000, "percent", 10) == 100.0
        assert compute_discount_amount(1000, "fixed", 75) == 75.0
        assert compute_discount_amount(50, "fixed", 75) == 50.0
        assert compute_discount_amount(1000, "percent", 150) == 1000.0

        subtotal, discount_amount, total = invoice_totals(
            [{"amount": 345}, {"amount": 50}],
            discount_type="percent",
            discount_value=10,
        )
        assert subtotal == 395.0
        assert discount_amount == 39.5
        assert total == 355.5

    def test_session_is_billable_after_end_time(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo

        from billing import session_is_billable

        est = ZoneInfo("America/New_York")
        session = {
            "date": "2026-06-01",
            "start_time": "08:00",
            "end_time": "11:00",
            "status": "scheduled",
        }
        before = datetime(2026, 6, 1, 10, 59, tzinfo=est)
        after = datetime(2026, 6, 1, 11, 0, tzinfo=est)
        assert session_is_billable(session, now=before) is False
        assert session_is_billable(session, now=after) is True
        assert session_is_billable({**session, "status": "completed"}, now=before) is True

    def test_full_time_day_blocks_roll_up_to_full_or_half(self):
        from billing import full_time_day_rate_type
        from invoice_billing import line_items_from_billable
        from models import AttendanceType, InvoiceLineItem, ProgramType

        athlete = {
            "id": "a1",
            "full_name": "Daniel Carcamo",
            "program_types": ["full_time"],
            "rate_type": "daily",
        }
        am = {"id": "s1", "date": "2026-06-01", "session_type": "full_time", "start_time": "08:00", "end_time": "11:00"}
        pm = {"id": "s2", "date": "2026-06-01", "session_type": "full_time", "start_time": "13:30", "end_time": "15:30"}
        billable = [
            {"id": "r1", "athlete_id": "a1", "session_id": "s1", "attendance_type": AttendanceType.half.value},
            {"id": "r2", "athlete_id": "a1", "session_id": "s2", "attendance_type": AttendanceType.half.value},
        ]
        items = line_items_from_billable(
            "inv1",
            billable,
            {"a1": athlete},
            {"s1": am, "s2": pm},
            line_item_cls=InvoiceLineItem,
        )
        assert len(items) == 1
        assert items[0].amount == 69
        assert items[0].quantity == 1
        assert "Daily Rate" in items[0].description
        assert set(items[0].attendance_record_ids) == {"r1", "r2"}
        assert full_time_day_rate_type(2) == AttendanceType.full
        assert full_time_day_rate_type(1) == AttendanceType.half

        half_only = line_items_from_billable(
            "inv2",
            [billable[0]],
            {"a1": athlete},
            {"s1": am},
            line_item_cls=InvoiceLineItem,
        )
        assert len(half_only) == 1
        assert half_only[0].amount == 34.5
        assert half_only[0].quantity == 1
        assert "Half-Day Rate" in half_only[0].description

        s3 = {"id": "s3", "date": "2026-06-03", "session_type": "full_time", "start_time": "08:00", "end_time": "11:00"}
        s4 = {"id": "s4", "date": "2026-06-04", "session_type": "full_time", "start_time": "08:00", "end_time": "11:00"}
        multi_half = line_items_from_billable(
            "inv3",
            [
                {"id": "r1", "athlete_id": "a1", "session_id": "s1", "attendance_type": AttendanceType.half.value},
                {"id": "r3", "athlete_id": "a1", "session_id": "s3", "attendance_type": AttendanceType.half.value},
                {"id": "r4", "athlete_id": "a1", "session_id": "s4", "attendance_type": AttendanceType.half.value},
            ],
            {"a1": athlete},
            {"s1": am, "s3": s3, "s4": s4},
            line_item_cls=InvoiceLineItem,
        )
        assert len(multi_half) == 1
        assert multi_half[0].quantity == 3
        assert multi_half[0].amount == 103.5
        assert set(multi_half[0].attendance_record_ids) == {"r1", "r3", "r4"}

    def test_billing_program_type_uses_session_service(self):
        from billing import billing_program_type
        from models import ProgramType

        athlete = {
            "id": "a1",
            "full_name": "Rafael Carcamo",
            "program_types": ["full_time"],
            "rate_type": "daily",
        }
        assert billing_program_type(athlete, {"session_type": "full_time"}) == ProgramType.full_time
        assert billing_program_type(athlete, {"session_type": "semi_private"}) == ProgramType.semi_private
        assert billing_program_type(athlete, {"session_type": "private"}) == ProgramType.private

    def test_private_session_billable_without_attendance(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo

        from billing import session_is_billable

        est = ZoneInfo("America/New_York")
        session = {
            "date": "2026-06-01",
            "session_type": "private",
            "athlete_ids": ["a1"],
            "status": "scheduled",
        }
        before = datetime(2026, 6, 1, 10, 0, tzinfo=est)
        after = datetime(2026, 6, 2, 10, 0, tzinfo=est)
        assert session_is_billable(session, now=before) is False
        assert session_is_billable(session, now=after) is True

        semi = {**session, "session_type": "semi_private", "athlete_ids": ["a1", "a2"]}
        assert session_is_billable(semi, now=after) is True

    def test_semi_private_session_combines_athlete_names(self):
        from billing import describe_line
        from invoice_billing import line_items_from_billable
        from models import AttendanceType, InvoiceLineItem, ProgramType

        assert describe_line(AttendanceType.full, ProgramType.semi_private) == "Semi-Private Lesson"

        rafael = {
            "id": "a1",
            "full_name": "Rafael Carcamo",
            "program_types": ["full_time"],
            "rate_type": "daily",
        }
        daniel = {
            "id": "a2",
            "full_name": "Daniel Carcamo",
            "program_types": ["full_time"],
            "rate_type": "daily",
        }
        sp_sess = {
            "id": "s-sp",
            "date": "2026-06-05",
            "session_type": "semi_private",
            "start_time": "10:00",
            "end_time": "11:00",
            "athlete_ids": ["a1", "a2"],
        }
        billable = [
            {"id": "r1", "athlete_id": "a1", "session_id": "s-sp", "attendance_type": AttendanceType.full.value},
            {"id": "r2", "athlete_id": "a2", "session_id": "s-sp", "attendance_type": AttendanceType.full.value},
        ]
        items = line_items_from_billable(
            "inv-sp",
            billable,
            {"a1": rafael, "a2": daniel},
            {"s-sp": sp_sess},
            line_item_cls=InvoiceLineItem,
        )
        assert len(items) == 1
        assert items[0].athlete_name == "Rafael Carcamo + Daniel Carcamo"
        assert items[0].description == "Semi-Private Lesson"
        assert items[0].quantity == 1
        assert items[0].amount == 65
        assert set(items[0].attendance_record_ids) == {"r1", "r2"}

    def test_private_lessons_roll_up_to_one_line(self):
        from invoice_billing import line_items_from_billable
        from models import AttendanceType, InvoiceLineItem

        athlete = {
            "id": "a1",
            "full_name": "Elias Harris",
            "program_types": ["full_time"],
            "rate_type": "monthly",
        }
        sessions = {
            f"s{i}": {
                "id": f"s{i}",
                "date": f"2026-06-{day:02d}",
                "session_type": "private",
                "start_time": "10:00",
                "end_time": "11:00",
                "athlete_ids": ["a1"],
            }
            for i, day in enumerate([5, 12, 19], start=1)
        }
        billable = [
            {"id": f"r{i}", "athlete_id": "a1", "session_id": f"s{i}", "attendance_type": AttendanceType.full.value}
            for i in (1, 2, 3)
        ]
        items = line_items_from_billable(
            "inv-1",
            billable,
            {"a1": athlete},
            sessions,
            line_item_cls=InvoiceLineItem,
        )
        private_items = [li for li in items if li.description == "Private Lesson"]
        assert len(private_items) == 1
        assert private_items[0].quantity == 3
        assert private_items[0].amount == 255.0
        assert len(private_items[0].attendance_record_ids) == 3


# ---------------- Families ----------------


class TestFamilies:
    def test_family_crud(self, auth_headers):
        payload = {
            "family_name": f"TEST_CRUDFamily_{uuid.uuid4().hex[:6]}",
            "guardian_name": "Crud Guardian",
            "guardian_email": f"crud_{uuid.uuid4().hex[:6]}@ex.com",
            "guardian_phone": "555-0101",
        }
        c = requests.post(f"{API}/families", json=payload, headers=auth_headers, timeout=30)
        assert c.status_code == 200
        fam = c.json()
        fid = fam["id"]
        assert fam["family_name"] == payload["family_name"]

        g = requests.get(f"{API}/families/{fid}", headers=auth_headers).json()
        assert g["id"] == fid

        u = requests.patch(f"{API}/families/{fid}", json={"guardian_phone": "555-9999"}, headers=auth_headers)
        assert u.status_code == 200
        assert u.json()["guardian_phone"] == "555-9999"

        # GET to verify persistence
        g2 = requests.get(f"{API}/families/{fid}", headers=auth_headers).json()
        assert g2["guardian_phone"] == "555-9999"

        d = requests.delete(f"{API}/families/{fid}", headers=auth_headers)
        assert d.status_code == 200

        g3 = requests.get(f"{API}/families/{fid}", headers=auth_headers)
        assert g3.status_code == 404

    def test_delete_family_blocks_when_athletes_exist(self, auth_headers, family):
        # Create athlete
        a = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_Block", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        )
        assert a.status_code == 200
        athlete_id = a.json()["id"]

        d = requests.delete(f"{API}/families/{family['id']}", headers=auth_headers)
        assert d.status_code == 400

        # cleanup
        requests.post(f"{API}/athletes/{athlete_id}/archive", headers=auth_headers)


# ---------------- Athletes ----------------


class TestAthletes:
    def test_athlete_requires_existing_family(self, auth_headers):
        r = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_NoFam", "program_type": "full_time", "family_id": "nonexistent"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_athlete_crud_and_filters(self, auth_headers, family):
        a = requests.post(
            f"{API}/athletes",
            json={
                "full_name": "TEST_Athlete_Alpha",
                "program_type": "full_time",
                "family_id": family["id"],
            },
            headers=auth_headers,
        )
        assert a.status_code == 200, a.text
        ath = a.json()
        aid = ath["id"]

        # filter family
        f1 = requests.get(f"{API}/athletes?family_id={family['id']}", headers=auth_headers).json()
        assert any(x["id"] == aid for x in f1)

        # filter q
        f2 = requests.get(f"{API}/athletes?q=Alpha", headers=auth_headers).json()
        assert any(x["id"] == aid for x in f2)

        # patch
        u = requests.patch(f"{API}/athletes/{aid}", json={"rate_override": 70}, headers=auth_headers)
        assert u.status_code == 200
        assert u.json()["rate_override"] == 70

        # archive
        ar = requests.post(f"{API}/athletes/{aid}/archive", headers=auth_headers)
        assert ar.status_code == 200
        assert ar.json()["status"] == "archived"


# ---------------- Sessions + Attendance + Billing ----------------


class TestSessionsAttendance:
    def test_session_create_attendance_billing_and_overrides(self, auth_headers, family):
        # Create athlete with rate_override
        a1 = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_FullA", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        a2 = requests.post(
            f"{API}/athletes",
            json={
                "full_name": "TEST_FullOverride",
                "program_type": "full_time",
                "family_id": family["id"],
                "rate_override": 70,
            },
            headers=auth_headers,
        ).json()
        a3 = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_PrivateA", "program_type": "private", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        a4 = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_SemiA", "program_type": "semi_private", "family_id": family["id"]},
            headers=auth_headers,
        ).json()

        sess_date = (date.today() - timedelta(days=2)).isoformat()
        s = requests.post(
            f"{API}/sessions",
            json={
                "date": sess_date,
                "session_type": "full_time",
                "start_time": "09:00",
                "end_time": "14:00",
                "athlete_ids": [a1["id"], a2["id"], a3["id"], a4["id"]],
            },
            headers=auth_headers,
        )
        assert s.status_code == 200, s.text
        sid = s.json()["id"]

        # cannot mark completed without attendance
        bad = requests.patch(f"{API}/sessions/{sid}", json={"status": "completed"}, headers=auth_headers)
        assert bad.status_code == 400

        # Get attendance roster
        att = requests.get(f"{API}/sessions/{sid}/attendance", headers=auth_headers).json()
        roster_ids = {r["athlete"]["id"] for r in att["roster"]}
        assert {a1["id"], a2["id"], a3["id"], a4["id"]} <= roster_ids

        # Save attendance
        entries = [
            {"athlete_id": a1["id"], "attendance_type": "full"},          # full_time full day $60
            {"athlete_id": a2["id"], "attendance_type": "full"},          # override $70/day
            {"athlete_id": a3["id"], "attendance_type": "full"},          # private $85/hr × 5h
            {"athlete_id": a4["id"], "attendance_type": "drop_in_full"},  # drop-in flat $85
        ]
        save = requests.post(
            f"{API}/sessions/{sid}/attendance", json={"entries": entries}, headers=auth_headers
        )
        assert save.status_code == 200, save.text

        # Verify billed_rates
        after = requests.get(f"{API}/sessions/{sid}/attendance", headers=auth_headers).json()
        recs = {r["athlete_id"]: r for r in after["records"]}
        assert recs[a1["id"]]["billed_rate"] == 60
        assert recs[a2["id"]]["billed_rate"] == 70  # override applied
        assert recs[a3["id"]]["billed_rate"] == 425
        assert recs[a4["id"]]["billed_rate"] == 425

        # Now mark completed (allowed) — auto-creates draft invoice for the family
        done = requests.patch(f"{API}/sessions/{sid}", json={"status": "completed"}, headers=auth_headers)
        assert done.status_code == 200, done.text
        assert done.json()["status"] == "completed"
        synced = done.json().get("invoices_synced") or []
        assert len(synced) >= 1, done.text
        inv = synced[0]["invoice"]
        assert inv["status"] == "draft"
        det = requests.get(f"{API}/invoices/{inv['id']}", headers=auth_headers).json()
        assert len(det["line_items"]) >= 4

        # Test half-day billing
        half_entries = [
            {"athlete_id": a1["id"], "attendance_type": "half"},  # full_time half day $30
            {"athlete_id": a2["id"], "attendance_type": "half"},  # override half $35
            {"athlete_id": a4["id"], "attendance_type": "drop_in_half"},  # 50
        ]
        s2 = requests.post(
            f"{API}/sessions",
            json={
                "date": sess_date,
                "session_type": "full_time",
                "start_time": "09:00",
                "end_time": "14:00",
                "athlete_ids": [a1["id"], a2["id"], a4["id"]],
            },
            headers=auth_headers,
        ).json()
        sid2 = s2["id"]
        requests.post(f"{API}/sessions/{sid2}/attendance", json={"entries": half_entries}, headers=auth_headers)
        after2 = requests.get(f"{API}/sessions/{sid2}/attendance", headers=auth_headers).json()
        recs2 = {r["athlete_id"]: r for r in after2["records"]}
        assert recs2[a1["id"]]["billed_rate"] == 30
        assert recs2[a2["id"]]["billed_rate"] == 35.0
        assert recs2[a4["id"]]["billed_rate"] == 50  # drop-in half flat

        # Re-save wipes & re-snapshots
        resave = [{"athlete_id": a1["id"], "attendance_type": "absent"}]
        requests.post(f"{API}/sessions/{sid2}/attendance", json={"entries": resave}, headers=auth_headers)
        after3 = requests.get(f"{API}/sessions/{sid2}/attendance", headers=auth_headers).json()
        assert len(after3["records"]) == 1
        assert after3["records"][0]["billed_rate"] == 0
        roster_after = {r["athlete"]["id"] for r in after3["roster"]}
        assert {a1["id"], a2["id"], a4["id"]} <= roster_after

        clear = requests.delete(f"{API}/sessions/{sid2}/attendance", headers=auth_headers)
        assert clear.status_code == 200, clear.text
        after_clear = requests.get(f"{API}/sessions/{sid2}/attendance", headers=auth_headers).json()
        assert after_clear["records"] == []
        assert {a1["id"], a2["id"], a4["id"]} <= {r["athlete"]["id"] for r in after_clear["roster"]}

        # cleanup
        requests.delete(f"{API}/sessions/{sid2}", headers=auth_headers)
        # leave sid for invoice test? no, separate flow. delete:
        # actually leave for invoice generation below... but separate tests should be independent
        # We'll save sid info via class var on request from invoice test using its own setup.

    def test_session_list_date_filter(self, auth_headers):
        # Just ensure date range query works
        sd = (date.today() - timedelta(days=30)).isoformat()
        ed = (date.today() + timedelta(days=30)).isoformat()
        r = requests.get(f"{API}/sessions?start_date={sd}&end_date={ed}", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_session_patch_with_date_field(self, auth_headers, family):
        """Regression: field named 'date' must not shadow datetime.date (Input should be None)."""
        a = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_PatchDate", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        sess_date = (date.today() + timedelta(days=3)).isoformat()
        s = requests.post(
            f"{API}/sessions",
            json={"date": sess_date, "session_type": "full_time", "athlete_ids": [a["id"]]},
            headers=auth_headers,
        )
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        patch = requests.patch(
            f"{API}/sessions/{sid}",
            json={
                "date": sess_date,
                "start_time": "08:00",
                "end_time": "11:30",
                "session_type": "full_time",
                "location": "Sunrise Athletic Complex",
                "notes": None,
                "athlete_ids": [a["id"]],
            },
            headers=auth_headers,
        )
        assert patch.status_code == 200, patch.text
        assert patch.json()["athlete_ids"] == [a["id"]]
        requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)

    def test_attendance_roster_sorted_by_name(self, auth_headers, family):
        z = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_Zara Att", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        a = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_Aaron Att", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        m = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_Mia Att", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        sess_date = (date.today() + timedelta(days=4)).isoformat()
        sid = requests.post(
            f"{API}/sessions",
            json={
                "date": sess_date,
                "session_type": "full_time",
                "athlete_ids": [z["id"], a["id"], m["id"]],
            },
            headers=auth_headers,
        ).json()["id"]
        att = requests.get(f"{API}/sessions/{sid}/attendance", headers=auth_headers).json()
        names = [row["athlete"]["full_name"] for row in att["roster"]]
        assert names == sorted(names, key=str.casefold)
        patch = requests.patch(
            f"{API}/sessions/{sid}",
            json={"athlete_ids": [m["id"], z["id"], a["id"]]},
            headers=auth_headers,
        )
        assert patch.status_code == 200, patch.text
        att2 = requests.get(f"{API}/sessions/{sid}/attendance", headers=auth_headers).json()
        names2 = [row["athlete"]["full_name"] for row in att2["roster"]]
        assert names2 == sorted(names2, key=str.casefold)
        requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)

    def test_session_delete_cascades_attendance(self, auth_headers, family):
        a = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_CascA", "program_type": "full_time", "family_id": family["id"]},
            headers=auth_headers,
        ).json()
        s = requests.post(
            f"{API}/sessions",
            json={"date": date.today().isoformat(), "session_type": "full_time", "athlete_ids": [a["id"]]},
            headers=auth_headers,
        ).json()
        sid = s["id"]
        requests.post(
            f"{API}/sessions/{sid}/attendance",
            json={"entries": [{"athlete_id": a["id"], "attendance_type": "full"}]},
            headers=auth_headers,
        )
        # delete session
        d = requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)
        assert d.status_code == 200
        # attendance should be gone (404 on session, and the GET for that session should 404)
        af = requests.get(f"{API}/sessions/{sid}/attendance", headers=auth_headers)
        assert af.status_code == 404


# ---------------- Invoices ----------------


class TestInvoices:
    def test_invoice_generate_and_sequence(self, auth_headers):
        # create dedicated family + athlete + session + attendance
        fam_payload = {
            "family_name": f"TEST_InvFam_{uuid.uuid4().hex[:6]}",
            "guardian_name": "Inv Guardian",
            "guardian_email": f"inv_{uuid.uuid4().hex[:6]}@ex.com",
            "guardian_phone": "555-0200",
        }
        fam = requests.post(f"{API}/families", json=fam_payload, headers=auth_headers).json()
        ath = requests.post(
            f"{API}/athletes",
            json={"full_name": "TEST_InvAthlete", "program_type": "full_time", "family_id": fam["id"]},
            headers=auth_headers,
        ).json()

        sess_date = (date.today() - timedelta(days=1)).isoformat()
        sess = requests.post(
            f"{API}/sessions",
            json={
                "date": sess_date,
                "session_type": "full_time",
                "start_time": "09:00",
                "end_time": "14:00",
                "athlete_ids": [ath["id"]],
            },
            headers=auth_headers,
        ).json()
        requests.post(
            f"{API}/sessions/{sess['id']}/attendance",
            json={"entries": [
                {"athlete_id": ath["id"], "attendance_type": "full"},
            ]},
            headers=auth_headers,
        )
        complete = requests.patch(
            f"{API}/sessions/{sess['id']}",
            json={"status": "completed"},
            headers=auth_headers,
        )
        assert complete.status_code == 200, complete.text

        period_start = (date.today() - timedelta(days=7)).isoformat()
        period_end = (date.today() + timedelta(days=1)).isoformat()

        gen1 = requests.post(
            f"{API}/invoices/generate",
            json={"family_id": fam["id"], "period_start": period_start, "period_end": period_end},
            headers=auth_headers,
        )
        assert gen1.status_code == 200, gen1.text
        inv1 = gen1.json()["invoice"]
        assert inv1["invoice_number"].startswith("EAT-")
        assert int(inv1["invoice_number"].split("-")[1]) >= 1
        assert inv1["total"] == 60
        assert inv1["status"] == "draft"
        assert len(gen1.json()["line_items"]) == 1
        assert gen1.json()["line_items"][0]["amount"] == 60

        add_line = requests.post(
            f"{API}/invoices/{inv1['id']}/line-items",
            json={"athlete_id": ath["id"], "service_id": "eat_monthly", "quantity": 1},
            headers=auth_headers,
        )
        assert add_line.status_code == 200, add_line.text
        assert add_line.json()["total"] == 1160

        gen2 = requests.post(
            f"{API}/invoices/generate",
            json={"family_id": fam["id"], "period_start": period_start, "period_end": period_end},
            headers=auth_headers,
        )
        assert gen2.status_code == 200
        inv2 = gen2.json()["invoice"]
        assert inv2["id"] == inv1["id"], "Same family/period should reuse the existing draft"
        assert gen2.json().get("reused_draft") is True

        # GET invoice detail
        det = requests.get(f"{API}/invoices/{inv1['id']}", headers=auth_headers).json()
        assert det["invoice"]["id"] == inv1["id"]
        assert det["family"]["id"] == fam["id"]
        assert len(det["line_items"]) >= 2
        assert len(det["athletes"]) >= 1
        amounts = sorted(li["amount"] for li in det["line_items"])
        assert amounts == [60, 1100]
        assert any("Eat w/ EAT" in li["description"] for li in det["line_items"])

        # PDF returns application/pdf
        pdf = requests.get(f"{API}/invoices/{inv1['id']}/pdf", headers=auth_headers, timeout=60)
        assert pdf.status_code == 200, pdf.text[:200]
        assert "application/pdf" in pdf.headers.get("content-type", "")
        assert pdf.content[:4] == b"%PDF"

        # Test absent records excluded from invoice
        sess3 = requests.post(
            f"{API}/sessions",
            json={"date": sess_date, "session_type": "full_time", "athlete_ids": [ath["id"]]},
            headers=auth_headers,
        ).json()
        requests.post(
            f"{API}/sessions/{sess3['id']}/attendance",
            json={"entries": [{"athlete_id": ath["id"], "attendance_type": "absent"}]},
            headers=auth_headers,
        )
        # Generate over a date range with no billable completed attendance — empty draft
        gen_abs = requests.post(
            f"{API}/invoices/generate",
            json={"family_id": fam["id"], "period_start": "2030-01-01", "period_end": "2030-01-31"},
            headers=auth_headers,
        )
        assert gen_abs.status_code == 200, gen_abs.text
        assert gen_abs.json()["line_items"] == []
        assert gen_abs.json()["invoice"]["total"] == 0

        # Payment flow on inv1
        pay = requests.post(
            f"{API}/invoices/{inv1['id']}/payments",
            json={"amount_received": 300, "received_date": date.today().isoformat(), "method": "Zelle"},
            headers=auth_headers,
        )
        assert pay.status_code == 200
        det2 = requests.get(f"{API}/invoices/{inv1['id']}", headers=auth_headers).json()
        assert det2["invoice"]["status"] == "paid"
        assert len(det2["payments"]) == 1

        # DELETE only for drafts: inv1 is paid → must fail
        d_paid = requests.delete(f"{API}/invoices/{inv1['id']}", headers=auth_headers)
        assert d_paid.status_code == 400

        # Delete inv1 (still draft) — should work
        d_draft = requests.delete(f"{API}/invoices/{inv1['id']}", headers=auth_headers)
        assert d_draft.status_code == 200

        # Send invoice flow on a fresh draft. May fail if Resend domain not verified.
        # Need new draft → create a new session/attendance
        sess4 = requests.post(
            f"{API}/sessions",
            json={"date": sess_date, "session_type": "full_time", "athlete_ids": [ath["id"]]},
            headers=auth_headers,
        ).json()
        requests.post(
            f"{API}/sessions/{sess4['id']}/attendance",
            json={"entries": [{"athlete_id": ath["id"], "attendance_type": "full"}]},
            headers=auth_headers,
        )
        requests.patch(
            f"{API}/sessions/{sess4['id']}",
            json={"status": "completed"},
            headers=auth_headers,
        )
        gen3 = requests.post(
            f"{API}/invoices/generate",
            json={"family_id": fam["id"], "period_start": period_start, "period_end": period_end},
            headers=auth_headers,
        )
        assert gen3.status_code == 200
        inv3 = gen3.json()["invoice"]
        send = requests.post(f"{API}/invoices/{inv3['id']}/send", headers=auth_headers, timeout=60)
        # Accept either success or graceful 500 (Resend domain may not be verified)
        assert send.status_code in (200, 500), send.text
        if send.status_code == 200:
            det3 = requests.get(f"{API}/invoices/{inv3['id']}", headers=auth_headers).json()
            assert det3["invoice"]["status"] == "sent"
            assert det3["invoice"]["pdf_url"]
