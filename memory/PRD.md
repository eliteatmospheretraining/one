# Elite Atmosphere Training — Coach Portal

## Original problem statement (V1)
Mobile-first web portal for Elite Atmosphere Training, a tennis training program.
Sovereign, purpose-built operating system for the sole admin, Coach Rico. Replaces a manual
Square + Zelle workflow with a single tool for: schedule management, attendance logging,
invoice generation, and payment confirmation.

## Stack (as built)
- **Frontend**: React 19 + CRA + Tailwind 3, mobile-first; deployed via supervisor on port 3000.
- **Backend**: FastAPI on Python 3.x, MongoDB (Motor async); deployed via supervisor on port 8001.
- **PDF**: WeasyPrint (cairo/pango installed) — generates the invoice PDF.
- **Email**: Resend SDK — magic-link emails + invoice send (sender `noreply@eliteatmospheretraining.com`).
- **Auth**: Magic-link only (admin allowlist, single email) + JWT (30-day) for session.

> Note: Original spec called for Supabase/Postgres + Railway. The Emergent runtime is
> FastAPI + Mongo; schema mirrors Supabase tables for an easy future migration.

## User personas
- **Coach Rico (admin, primary user)** — uses the portal on iPhone court-side every day.

## Architecture (file map)
### Backend (`/app/backend/`)
- `server.py` — FastAPI entry, mounts `/api` routers, CORS, startup seed.
- `auth.py` — magic-link request + verify, JWT issuing, `get_current_coach` dep.
- `models.py` — Pydantic models + `RATE_CARD`.
- `db.py` — Motor client + JSON-safe serialization helpers.
- `billing.py` — `compute_billed_rate` snapshot logic.
- `pdf.py` — WeasyPrint invoice renderer (logo + Swiss grid + paid block).
- `routes_families.py`, `routes_athletes.py`, `routes_sessions.py`, `routes_invoices.py`.

### Frontend (`/app/frontend/src/`)
- `App.js` — Router + AuthProvider + Toaster.
- `lib/api.js`, `lib/auth.jsx`, `lib/format.js`, `lib/testIds.js`.
- `components/AppLayout.jsx`, `RequireAuth.jsx`, `Pills.jsx`, `Modal.jsx`, `PageHeader.jsx`, `EmptyState.jsx`.
- `pages/Login.jsx`, `CalendarPage.jsx`, `SessionForm.jsx`, `SessionDetail.jsx`, `Roster.jsx`, `AthleteForm.jsx`, `FamilyForm.jsx`, `Invoices.jsx`, `Settings.jsx`.

## Core requirements (static)
- Mobile-first, fully usable at iPhone viewport.
- Single admin in V1; no parent/athlete portal.
- Zelle is the only payment method (no payment processor).
- `billed_rate` is snapshotted at attendance log time.
- Family grouping rolls siblings into one invoice.
- Invoice numbering starts at EAT-000001 and increments via a Mongo counter.

## What's been implemented — V1 MVP (Feb 2026)
- [x] Magic-link auth (Resend), DEV_MODE returns token for testing.
- [x] Schedule: weekly strip + daily session cards, status pills (Scheduled/Completed/Cancelled/Rescheduled).
- [x] Session create/edit/delete + attendance logging UI (5 chip types per athlete).
- [x] Roster: search + program/status filters; full athlete + family CRUD with archive.
- [x] Invoice generate from attendance, line items grouped by athlete, PDF preview, send via Resend (PDF attachment).
- [x] Payment confirmation (Zelle, amount, date, note) → invoice marked Paid.
- [x] Rate card view in Settings; per-athlete rate override on profile.
- [x] Backend test suite at `/app/backend/tests/backend_test.py` — 15/15 passing.

## Backlog (P0 / P1 / P2)
### P0 — must-have before launch
- Verify Resend sender domain in production (currently uses sandbox-friendly noreply@eliteatmospheretraining.com).
- Per-family deletion safety: also block when sessions/invoices reference the family.

### P1 — high value next
- Replace native date pickers with shadcn Calendar/Popover for consistency.
- Family payment history view (current: only per-invoice payments).
- Bulk attendance: copy attendance from previous session.
- Export: download monthly invoice batch as ZIP.

### P2 — polish / future
- Sliding JWT refresh, shorter expiry.
- Pagination on list endpoints.
- PWA install + offline draft mode.
- Migrate to Supabase for original spec parity (auth + storage + RLS).

## Out of scope for V1 (per problem statement)
Multi-coach login, Google Calendar sync, parent portal, SMS/push, native app,
analytics dashboard, Notion integration, any payment processor.

## Test credentials
See `/app/memory/test_credentials.md`.
