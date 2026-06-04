import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ATTENDANCE_CHIP_LABEL, PROGRAM_LABEL, SESSION_STATUS_STYLES, attendanceOptionsForAthlete, fmtDate, fmtMoney, fmtTime, formatAthletePrograms, uiAttendanceType } from "../lib/format";
import { SESSION } from "../lib/testIds";
import { CheckCircle2, MapPin, RotateCcw } from "lucide-react";
import { SessionFormModal } from "./SessionForm";
import { toast } from "sonner";

const CHIP_LABEL = ATTENDANCE_CHIP_LABEL;

const META_ACTION_CLASS =
    "uppercase tracking-wider2 text-paper text-sm hover:text-accent transition-colors disabled:opacity-40 disabled:pointer-events-none";

const SESSION_STATUS_ORDER = ["scheduled", "completed", "rescheduled", "cancelled"];

function sessionStatusMenuOptions(currentStatus) {
    return SESSION_STATUS_ORDER.filter(
        (status) => status !== currentStatus && !(status === "cancelled" && currentStatus === "completed")
    );
}

export default function SessionDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [marks, setMarks] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [athletesAll, setAthletesAll] = useState([]);
    const [billing, setBilling] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.get(`/sessions/${id}/attendance`);
            setData(r.data);
            const sessionDoc = r.data.session;
            const rosterById = Object.fromEntries(
                (r.data.roster || []).map((row) => [row.athlete.id, row.athlete])
            );
            const m = {};
            (r.data.records || []).forEach((rec) => {
                m[rec.athlete_id] = uiAttendanceType(
                    rec.attendance_type,
                    sessionDoc,
                    rosterById[rec.athlete_id]
                );
            });
            setMarks(m);
            const [ath, bill] = await Promise.all([
                api.get(`/athletes`),
                api.get(`/sessions/${id}/billing`).catch(() => ({ data: { billing: [] } })),
            ]);
            setAthletesAll(ath.data);
            setBilling(bill.data?.billing || []);
        } catch (e) {
            toast.error("Could not load session");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    if (loading || !data) {
        return <div className="p-10 text-center text-muted uppercase tracking-wider2 text-sm">Loading…</div>;
    }

    const session = data.session;
    const roster = data.roster;

    async function saveAttendance() {
        setSaving(true);
        const entries = Object.entries(marks).map(([athlete_id, attendance_type]) => ({ athlete_id, attendance_type }));
        try {
            const r = await api.post(`/sessions/${id}/attendance`, { entries });
            const synced = r.data?.invoices_synced || [];
            if (synced.length > 0) {
                const nums = synced.map((s) => s.invoice_number).join(", ");
                toast.success(`Attendance saved · Draft invoice ${nums} updated`);
            } else {
                toast.success("Attendance saved");
            }
            await load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
        } finally {
            setSaving(false);
        }
    }

    async function setStatus(status) {
        try {
            await api.patch(`/sessions/${id}`, { status });
            toast.success(`Session ${SESSION_STATUS_STYLES[status]?.label?.toLowerCase() || status}`);
            await load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Update failed");
        }
    }

    async function confirmDeleteSession() {
        setDeleting(true);
        try {
            await api.delete(`/sessions/${id}`);
            toast.success("Session deleted");
            setDeleteOpen(false);
            nav("/");
        } catch (e) {
            toast.error("Delete failed");
        } finally {
            setDeleting(false);
        }
    }

    async function resetAttendance() {
        if (!window.confirm("Clear all saved attendance for this session? You can mark everyone again.")) return;
        setSaving(true);
        try {
            const r = await api.delete(`/sessions/${id}/attendance`);
            const synced = r.data?.invoices_synced || [];
            if (synced.length > 0) {
                const nums = synced.map((s) => s.invoice_number).join(", ");
                toast.success(`Attendance reset · Draft invoice ${nums} updated`);
            } else {
                toast.success("Attendance reset");
            }
            setMarks({});
            await load();
        } catch (e) {
            toast.error(formatApiError(e) || "Could not reset attendance");
        } finally {
            setSaving(false);
        }
    }

    const attendanceComplete = Object.keys(marks).length > 0 && roster.every((r) => marks[r.athlete.id]);
    const hasSavedAttendance = (data.records || []).length > 0 || Boolean(session.attendance_logged_at);

    async function pickStatus(nextStatus) {
        if (nextStatus === session.status) return;
        if (nextStatus === "cancelled" && !window.confirm("Cancel this session?")) return;
        if (nextStatus === "completed" && !attendanceComplete) {
            toast.error("Mark attendance for all athletes first");
            return;
        }
        if (nextStatus === "completed") {
            setSaving(true);
            try {
                const entries = Object.entries(marks).map(([athlete_id, attendance_type]) => ({
                    athlete_id,
                    attendance_type,
                }));
                await api.post(`/sessions/${id}/attendance`, { entries });
                const patchRes = await api.patch(`/sessions/${id}`, { status: "completed" });
                const synced = Array.isArray(patchRes.data?.invoices_synced) ? patchRes.data.invoices_synced : [];
                const billAfter = Array.isArray(patchRes.data?.billing) ? patchRes.data.billing : [];
                if (synced.length > 0) {
                    const nums = synced.map((s) => s.invoice_number).filter(Boolean).join(", ");
                    toast.success(
                        nums
                            ? `Session completed · Draft invoice ${nums} updated`
                            : "Session completed · Draft invoice updated"
                    );
                } else if (billAfter.length > 0) {
                    const nums = billAfter.map((b) => b.invoice_number).join(", ");
                    toast.success(`Session completed · Already on invoice ${nums}`);
                } else {
                    toast.success("Attendance saved · Session completed");
                }
            } catch (e) {
                toast.error(formatApiError(e) || "Could not complete session");
            } finally {
                setSaving(false);
                await load();
            }
            return;
        }
        await setStatus(nextStatus);
    }

    return (
        <div>
            <PageHeader
                title={
                    <span className="flex items-baseline gap-4 flex-wrap">
                        <span>{fmtTime(session.start_time) || "—"}</span>
                        <span className="text-3xl text-muted" style={{ fontWeight: 300 }}>{PROGRAM_LABEL[session.session_type]}</span>
                    </span>
                }
                actions={
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                data-testid={SESSION.statusBtn}
                                className="eat-btn-primary shrink-0"
                                title={
                                    session.status === "completed" || attendanceComplete
                                        ? "Change session status"
                                        : "Save attendance for all athletes first"
                                }
                            >
                                <CheckCircle2 size={13} className="mr-1.5" strokeWidth={1.75} />
                                {SESSION_STATUS_STYLES[session.status]?.label || session.status}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="min-w-[10rem] rounded-none border border-subtle bg-mid p-1 shadow-lg"
                        >
                            {sessionStatusMenuOptions(session.status).map((status) => {
                                const disabled = status === "completed" && !attendanceComplete;
                                return (
                                    <DropdownMenuItem
                                        key={status}
                                        data-testid={SESSION.statusOption(status)}
                                        disabled={disabled}
                                        onSelect={() => pickStatus(status)}
                                        className="uppercase tracking-wider2 text-sm text-paper focus:bg-subtle focus:text-paper cursor-pointer rounded-none font-thunder"
                                        style={{ fontWeight: 500 }}
                                    >
                                        {SESSION_STATUS_STYLES[status]?.label || status}
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            />

            <div className="px-5 md:px-10 mt-6">
                {/* Meta row */}
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm text-muted pb-5 border-b border-subtle">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 min-w-0">
                        <span className="uppercase tracking-wider2 text-paper" style={{ fontWeight: 500 }}>
                            {fmtDate(session.date, { weekday: "long", month: "long", day: "numeric" })}
                        </span>
                        {session.location && (
                            <span className="inline-flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.5} /> {session.location}</span>
                        )}
                        {session.end_time && <span>Ends {fmtTime(session.end_time)}</span>}
                        {billing.length > 0 && (
                            <span className="text-xs text-accent font-light">
                                On invoice{" "}
                                {billing.map((b, i) => (
                                    <span key={b.invoice_id}>
                                        {i > 0 ? ", " : ""}
                                        <button
                                            type="button"
                                            className="underline hover:text-paper"
                                            onClick={() => nav(`/invoices?open=${b.invoice_id}`)}
                                        >
                                            {b.invoice_number}
                                        </button>
                                        {b.status ? ` (${b.status})` : ""}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                    <div className="hidden md:flex flex-wrap items-center gap-x-5 gap-y-2 shrink-0 ml-auto">
                        <button
                            type="button"
                            data-testid={SESSION.editBtn}
                            onClick={() => setEditOpen(true)}
                            className={META_ACTION_CLASS}
                            style={{ fontWeight: 500 }}
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            data-testid={SESSION.deleteBtn}
                            onClick={() => setDeleteOpen(true)}
                            className={META_ACTION_CLASS}
                            style={{ fontWeight: 500 }}
                        >
                            Delete
                        </button>
                    </div>
                </div>

                {/* Attendance */}
                <div className="mt-10">
                    <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
                        <h2 className="eat-h2">Attendance</h2>
                        <div className="flex items-center gap-3">
                            {hasSavedAttendance && (
                                <button
                                    data-testid="session-reset-attendance-btn"
                                    onClick={resetAttendance}
                                    disabled={saving}
                                    className="eat-btn-ghost h-9 text-xs px-2"
                                    title="Clear saved attendance and start over"
                                >
                                    <RotateCcw size={12} className="mr-1" strokeWidth={1.75} /> Reset
                                </button>
                            )}
                            <span className="text-xs text-muted uppercase tracking-wider2" style={{ fontWeight: 300 }}>
                                {Object.keys(marks).length}/{roster.length} marked
                            </span>
                        </div>
                    </div>

                    {roster.length === 0 ? (
                        <div className="py-10 text-center text-muted text-sm font-light">
                            No athletes attached. Edit the session to add expected attendees.
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {roster.map(({ athlete }, idx) => (
                                <div key={athlete.id} className={`py-5 ${idx > 0 ? "border-t border-subtle" : ""}`}>
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0">
                                            <div className="font-thunder text-2xl uppercase tracking-tight text-paper truncate" style={{ fontWeight: 500 }}>
                                                {athlete.full_name}
                                            </div>
                                            <div className="text-xs text-muted uppercase tracking-wider2 mt-0.5" style={{ fontWeight: 300 }}>
                                                {formatAthletePrograms(athlete)}
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className={`grid gap-1.5 ${
                                            attendanceOptionsForAthlete(session, athlete).length <= 2
                                                ? "grid-cols-2"
                                                : "grid-cols-3"
                                        }`}
                                    >
                                        {attendanceOptionsForAthlete(session, athlete).map((t) => {
                                            const active = marks[athlete.id] === t;
                                            const isAbsent = t === "absent";
                                            return (
                                                <button
                                                    key={t}
                                                    data-testid={SESSION.chip(athlete.id, t)}
                                                    onClick={() => setMarks((m) => ({ ...m, [athlete.id]: t }))}
                                                    className={`h-10 text-[11px] sm:text-xs uppercase tracking-wider2 transition-colors border ${
                                                        active
                                                            ? isAbsent
                                                                ? "bg-transparent text-danger border-danger"
                                                                : "bg-accent text-ink border-accent"
                                                            : "bg-mid text-muted border-subtle hover:text-paper hover:border-paper/40"
                                                    }`}
                                                    style={{ fontWeight: 500 }}
                                                >
                                                    {CHIP_LABEL[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-subtle space-y-3">
                        {roster.length > 0 && (
                            <button
                                data-testid={SESSION.saveAttendanceBtn}
                                onClick={saveAttendance}
                                disabled={saving || Object.keys(marks).length === 0}
                                className="eat-btn-primary w-full h-12 disabled:opacity-50"
                            >
                                {saving ? "Saving…" : `Save Attendance (${Object.keys(marks).length})`}
                            </button>
                        )}
                        <div className="flex flex-col gap-3 md:hidden">
                            <button
                                type="button"
                                data-testid={SESSION.editBtn}
                                onClick={() => setEditOpen(true)}
                                className="eat-btn-primary w-full h-12"
                                style={{ fontWeight: 500 }}
                            >
                                Edit Session
                            </button>
                            <button
                                type="button"
                                data-testid={SESSION.deleteBtn}
                                onClick={() => setDeleteOpen(true)}
                                className="eat-btn-primary w-full h-12"
                                style={{ fontWeight: 500 }}
                            >
                                Delete Session
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <SessionFormModal
                open={editOpen}
                onOpenChange={setEditOpen}
                session={session}
                athletes={athletesAll}
                onSaved={() => { setEditOpen(false); load(); }}
            />

            <Modal
                open={deleteOpen}
                onOpenChange={(open) => !deleting && setDeleteOpen(open)}
                title="Delete session?"
                description="This permanently removes the session and its attendance records."
            >
                <p className="text-sm text-muted font-light">
                    {fmtDate(session.date, { weekday: "long", month: "long", day: "numeric" })}
                    {session.start_time ? ` · ${fmtTime(session.start_time)}` : ""}
                    {" · "}
                    {PROGRAM_LABEL[session.session_type]}
                </p>
                <div className="flex flex-wrap gap-2 mt-6">
                    <button
                        type="button"
                        onClick={() => setDeleteOpen(false)}
                        disabled={deleting}
                        className="eat-btn-secondary flex-1 min-w-[7rem]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        data-testid={SESSION.deleteConfirmBtn}
                        onClick={confirmDeleteSession}
                        disabled={deleting}
                        className="eat-btn-danger flex-1 min-w-[7rem] disabled:opacity-50"
                    >
                        {deleting ? "Deleting…" : "Delete"}
                    </button>
                </div>
            </Modal>
        </div>
    );
}
