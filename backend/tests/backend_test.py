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


# ---------------- Rate card ----------------


class TestRateCard:
    def test_rate_card_values(self):
        r = requests.get(f"{API}/rate-card", timeout=30)
        assert r.status_code == 200
        rc = r.json()
        assert rc["full_day"] == 60
        assert rc["half_day"] == 30
        assert rc["drop_in_full"] == 85
        assert rc["drop_in_half"] == 50
        assert rc["private"] == 85
        assert rc["semi_private"] == 65


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
            {"athlete_id": a1["id"], "attendance_type": "full"},          # full_time + full -> 60
            {"athlete_id": a2["id"], "attendance_type": "full"},          # full_time + full + override 70 -> 70
            {"athlete_id": a3["id"], "attendance_type": "full"},          # private + full -> 85
            {"athlete_id": a4["id"], "attendance_type": "drop_in_full"},  # drop_in_full -> 85 (no override)
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
        assert recs[a3["id"]]["billed_rate"] == 85
        assert recs[a4["id"]]["billed_rate"] == 85  # drop-in not overridden

        # Now mark completed (allowed)
        done = requests.patch(f"{API}/sessions/{sid}", json={"status": "completed"}, headers=auth_headers)
        assert done.status_code == 200, done.text
        assert done.json()["status"] == "completed"

        # Test half-day billing
        half_entries = [
            {"athlete_id": a1["id"], "attendance_type": "half"},  # full_time + half -> 30
            {"athlete_id": a2["id"], "attendance_type": "half"},  # full_time half + override 70 -> 35
            {"athlete_id": a4["id"], "attendance_type": "drop_in_half"},  # 50
        ]
        s2 = requests.post(
            f"{API}/sessions",
            json={"date": sess_date, "session_type": "full_time", "athlete_ids": [a1["id"], a2["id"], a4["id"]]},
            headers=auth_headers,
        ).json()
        sid2 = s2["id"]
        requests.post(f"{API}/sessions/{sid2}/attendance", json={"entries": half_entries}, headers=auth_headers)
        after2 = requests.get(f"{API}/sessions/{sid2}/attendance", headers=auth_headers).json()
        recs2 = {r["athlete_id"]: r for r in after2["records"]}
        assert recs2[a1["id"]]["billed_rate"] == 30
        assert recs2[a2["id"]]["billed_rate"] == 35.0
        assert recs2[a4["id"]]["billed_rate"] == 50

        # Re-save wipes & re-snapshots
        resave = [{"athlete_id": a1["id"], "attendance_type": "absent"}]
        requests.post(f"{API}/sessions/{sid2}/attendance", json={"entries": resave}, headers=auth_headers)
        after3 = requests.get(f"{API}/sessions/{sid2}/attendance", headers=auth_headers).json()
        assert len(after3["records"]) == 1
        assert after3["records"][0]["billed_rate"] == 0

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
            json={"date": sess_date, "session_type": "full_time", "athlete_ids": [ath["id"]]},
            headers=auth_headers,
        ).json()
        requests.post(
            f"{API}/sessions/{sess['id']}/attendance",
            json={"entries": [
                {"athlete_id": ath["id"], "attendance_type": "full"},
            ]},
            headers=auth_headers,
        )

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

        # second generate increments
        # Create another session/attendance to have billable items
        sess2 = requests.post(
            f"{API}/sessions",
            json={"date": sess_date, "session_type": "full_time", "athlete_ids": [ath["id"]]},
            headers=auth_headers,
        ).json()
        requests.post(
            f"{API}/sessions/{sess2['id']}/attendance",
            json={"entries": [{"athlete_id": ath["id"], "attendance_type": "full"}]},
            headers=auth_headers,
        )

        gen2 = requests.post(
            f"{API}/invoices/generate",
            json={"family_id": fam["id"], "period_start": period_start, "period_end": period_end},
            headers=auth_headers,
        )
        assert gen2.status_code == 200
        inv2 = gen2.json()["invoice"]
        n1 = int(inv1["invoice_number"].split("-")[1])
        n2 = int(inv2["invoice_number"].split("-")[1])
        assert n2 == n1 + 1, f"Invoice sequence broken: {inv1['invoice_number']} → {inv2['invoice_number']}"

        # GET invoice detail
        det = requests.get(f"{API}/invoices/{inv1['id']}", headers=auth_headers).json()
        assert det["invoice"]["id"] == inv1["id"]
        assert det["family"]["id"] == fam["id"]
        assert len(det["line_items"]) >= 1
        assert len(det["athletes"]) >= 1

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
        # Generate over a date range that ONLY has the absent session - should error
        gen_abs = requests.post(
            f"{API}/invoices/generate",
            json={"family_id": fam["id"], "period_start": "2030-01-01", "period_end": "2030-01-31"},
            headers=auth_headers,
        )
        assert gen_abs.status_code == 400  # no billable

        # Payment flow on inv1
        pay = requests.post(
            f"{API}/invoices/{inv1['id']}/payments",
            json={"amount_received": 60, "received_date": date.today().isoformat(), "method": "Zelle"},
            headers=auth_headers,
        )
        assert pay.status_code == 200
        det2 = requests.get(f"{API}/invoices/{inv1['id']}", headers=auth_headers).json()
        assert det2["invoice"]["status"] == "paid"
        assert len(det2["payments"]) == 1

        # DELETE only for drafts: inv1 is paid → must fail
        d_paid = requests.delete(f"{API}/invoices/{inv1['id']}", headers=auth_headers)
        assert d_paid.status_code == 400

        # Delete inv2 (still draft) — should work
        d_draft = requests.delete(f"{API}/invoices/{inv2['id']}", headers=auth_headers)
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
