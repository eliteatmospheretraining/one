import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SessionStatusPill } from "../components/Pills";
import { ATTENDANCE_TYPES, PROGRAM_LABEL, fmtDate, fmtMoney } from "../lib/format";
import { SESSION } from "../lib/testIds";
import { CheckCircle2, ChevronLeft, ClipboardCopy, MapPin, Pencil, Trash2, X } from "lucide-react";
import { SessionFormModal } from "./SessionForm";
import { toast } from "sonner";

const CHIP_LABEL = {
    full: "Full",
    half: "Half",
    drop_in_full: "DI · Full",
    drop_in_half: "DI · Half",
    absent: "Absent",
};

export default function SessionDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [marks, setMarks] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [athletesAll, setAthletesAll] = useState([]);

    async function load() {
        setLoading(true);
        try {
            const r = await api.get(`/sessions/${id}/attendance`);
            setData(r.data);
            const m = {};
            (r.data.records || []).forEach((rec) => { m[rec.athlete_id] = rec.attendance_type; });
            setMarks(m);
            const ath = await api.get(`/athletes`);
            setAthletesAll(ath.data);
        } catch (e) {
            toast.error("Could not load session");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

    if (loading || !data) {
        return <div className="p-10 text-center text-muted uppercase tracking-wider2 text-sm">Loading…</div>;
    }

    const session = data.session;
    const roster = data.roster;

    async function saveAttendance() {
        setSaving(true);
        const entries = Object.entries(marks).map(([athlete_id, attendance_type]) => ({ athlete_id, attendance_type }));
        try {
            await api.post(`/sessions/${id}/attendance`, { entries });
            toast.success("Attendance saved");
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
            toast.success(`Session ${status}`);
            await load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Update failed");
        }
    }

    async function deleteSession() {
        if (!window.confirm("Delete this session? This also removes its attendance records.")) return;
        try {
            await api.delete(`/sessions/${id}`);
            toast.success("Session deleted");
            nav("/");
        } catch (e) {
            toast.error("Delete failed");
        }
    }

    async function copyFromPrevious() {
        try {
            const r = await api.get(`/sessions/${id}/last-attendance`);
            if (!r.data.source || (r.data.entries || []).length === 0) {
                toast.info("No previous session to copy from");
                return;
            }
            const rosterIds = new Set(roster.map((x) => x.athlete.id));
            const next = { ...marks };
            let copied = 0;
            r.data.entries.forEach((e) => {
                if (rosterIds.has(e.athlete_id)) {
                    next[e.athlete_id] = e.attendance_type;
                    copied += 1;
                }
            });
            setMarks(next);
            toast.success(`Copied ${copied} from ${r.data.source.date}`);
        } catch (e) {
            toast.error("Could not load previous session");
        }
    }

    const attendanceComplete = Object.keys(marks).length > 0 && roster.every((r) => marks[r.athlete.id]);

    return (
        <div>
            <PageHeader
                subtitle={
                    <button onClick={() => nav("/")} className="inline-flex items-center gap-1 hover:text-paper">
                        <ChevronLeft size={13} /> Back to Schedule
                    </button>
                }
                title={
                    <span className="flex items-baseline gap-4 flex-wrap">
                        <span>{session.start_time || "—"}</span>
                        <span className="text-3xl text-muted" style={{ fontWeight: 300 }}>{PROGRAM_LABEL[session.session_type]}</span>
                    </span>
                }
                actions={<SessionStatusPill status={session.status} />}
            />

            <div className="px-5 md:px-10 mt-6">
                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted pb-5 border-b border-subtle">
                    <span className="uppercase tracking-wider2 text-paper" style={{ fontWeight: 500 }}>
                        {fmtDate(session.date, { weekday: "long", month: "long", day: "numeric" })}
                    </span>
                    {session.location && (
                        <span className="inline-flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.5} /> {session.location}</span>
                    )}
                    {session.end_time && <span>Ends {session.end_time}</span>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-5">
                    <button data-testid={SESSION.editBtn} onClick={() => setEditOpen(true)} className="eat-btn-secondary">
                        <Pencil size={13} className="mr-1.5" strokeWidth={1.75} /> Edit
                    </button>
                    {session.status !== "completed" && (
                        <button
                            data-testid={SESSION.completeBtn}
                            disabled={!attendanceComplete}
                            onClick={() => setStatus("completed")}
                            className="eat-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                            title={attendanceComplete ? "Mark complete" : "Save attendance for all athletes first"}
                        >
                            <CheckCircle2 size={13} className="mr-1.5" strokeWidth={1.75} /> Complete
                        </button>
                    )}
                    {session.status !== "cancelled" && (
                        <button data-testid={SESSION.cancelBtn} onClick={() => setStatus("cancelled")} className="eat-btn-danger">
                            <X size={13} className="mr-1.5" strokeWidth={1.75} /> Cancel
                        </button>
                    )}
                    <button data-testid={SESSION.deleteBtn} onClick={deleteSession} className="eat-btn-ghost">
                        <Trash2 size={13} className="mr-1.5" strokeWidth={1.75} /> Delete
                    </button>
                </div>

                {/* Attendance */}
                <div className="mt-10">
                    <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
                        <h2 className="eat-h2">Attendance</h2>
                        <div className="flex items-center gap-3">
                            <button
                                data-testid="session-copy-previous-btn"
                                onClick={copyFromPrevious}
                                className="eat-btn-ghost h-9 text-xs px-2"
                                title="Copy attendance from the most recent prior session of the same type"
                            >
                                <ClipboardCopy size={12} className="mr-1" strokeWidth={1.75} /> Copy previous
                            </button>
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
                                                {PROGRAM_LABEL[athlete.program_type]}
                                                {athlete.rate_override != null && <span className="ml-2 text-accent">Override {fmtMoney(athlete.rate_override)}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-5 gap-1.5">
                                        {ATTENDANCE_TYPES.map((t) => {
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

                    {roster.length > 0 && (
                        <div className="sticky bottom-20 md:bottom-6 mt-8">
                            <button
                                data-testid={SESSION.saveAttendanceBtn}
                                onClick={saveAttendance}
                                disabled={saving || Object.keys(marks).length === 0}
                                className="eat-btn-primary w-full h-12 disabled:opacity-50"
                            >
                                {saving ? "Saving…" : `Save Attendance (${Object.keys(marks).length})`}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <SessionFormModal
                open={editOpen}
                onOpenChange={setEditOpen}
                session={session}
                athletes={athletesAll}
                onSaved={() => { setEditOpen(false); load(); }}
            />
        </div>
    );
}
