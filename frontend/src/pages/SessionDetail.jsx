import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SessionStatusPill } from "../components/Pills";
import { ATTENDANCE_STYLES, ATTENDANCE_TYPES, PROGRAM_LABEL, fmtDate, fmtMoney } from "../lib/format";
import { SESSION, CALENDAR } from "../lib/testIds";
import { CheckCircle2, ChevronLeft, MapPin, Pencil, Trash2, X } from "lucide-react";
import { SessionFormModal } from "./SessionForm";
import { toast } from "sonner";

const CHIP_ABBREV = {
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
    const [marks, setMarks] = useState({}); // athlete_id -> attendance_type
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
        return <div className="p-10 text-center text-zinc-400 uppercase tracking-widest font-bold text-sm">Loading…</div>;
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

    const attendanceComplete = Object.keys(marks).length > 0 && roster.every((r) => marks[r.athlete.id]);

    return (
        <div>
            <PageHeader
                subtitle={
                    <span className="inline-flex items-center gap-2">
                        <button onClick={() => nav("/")} className="inline-flex items-center gap-1 hover:text-obsidian">
                            <ChevronLeft size={14} /> Back to Schedule
                        </button>
                    </span>
                }
                title={
                    <span className="flex items-baseline gap-3 flex-wrap">
                        <span>{session.start_time || "—"}</span>
                        <span className="text-xl text-zinc-400 font-bold">{PROGRAM_LABEL[session.session_type]}</span>
                    </span>
                }
                actions={<SessionStatusPill status={session.status} />}
            />

            <div className="px-4 md:px-8 mt-4 md:mt-6">
                <div className="eat-card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span className="font-bold uppercase tracking-widest text-xs">{fmtDate(session.date, { weekday: "long", month: "long", day: "numeric" })}</span>
                    {session.location && (
                        <span className="inline-flex items-center gap-1.5 text-zinc-600"><MapPin size={14} /> {session.location}</span>
                    )}
                    {session.end_time && <span className="text-zinc-600">Ends {session.end_time}</span>}
                </div>

                {/* Action row */}
                <div className="flex flex-wrap gap-2 mt-4">
                    <button data-testid={SESSION.editBtn} onClick={() => setEditOpen(true)} className="eat-btn-ghost h-10 text-sm border-2 border-obsidian">
                        <Pencil size={14} className="mr-1.5" /> Edit
                    </button>
                    {session.status !== "completed" && (
                        <button
                            data-testid={SESSION.completeBtn}
                            disabled={!attendanceComplete}
                            onClick={() => setStatus("completed")}
                            className="eat-btn-secondary h-10 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            title={attendanceComplete ? "Mark complete" : "Save attendance for all athletes first"}
                        >
                            <CheckCircle2 size={14} className="mr-1.5" /> Complete
                        </button>
                    )}
                    {session.status !== "cancelled" && (
                        <button data-testid={SESSION.cancelBtn} onClick={() => setStatus("cancelled")} className="eat-btn-ghost h-10 text-sm border-2 border-red-500 text-red-700">
                            <X size={14} className="mr-1.5" /> Cancel
                        </button>
                    )}
                    <button data-testid={SESSION.deleteBtn} onClick={deleteSession} className="eat-btn-ghost h-10 text-sm border-2 border-zinc-300">
                        <Trash2 size={14} className="mr-1.5" /> Delete
                    </button>
                </div>

                <div className="mt-6">
                    <div className="flex items-end justify-between mb-3">
                        <h2 className="eat-h2">Attendance</h2>
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                            {Object.keys(marks).length}/{roster.length} marked
                        </span>
                    </div>

                    {roster.length === 0 ? (
                        <div className="border-2 border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
                            No athletes attached. Add expected attendees by editing the session.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {roster.map(({ athlete }) => (
                                <div key={athlete.id} className="eat-card-flat">
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="min-w-0">
                                            <div className="font-heading text-xl uppercase tracking-tight truncate">{athlete.full_name}</div>
                                            <div className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                                                {PROGRAM_LABEL[athlete.program_type]}
                                                {athlete.rate_override != null && <span className="ml-2 text-volt-hover">Override {fmtMoney(athlete.rate_override)}</span>}
                                            </div>
                                        </div>
                                        {marks[athlete.id] && (
                                            <div className="text-right">
                                                <span
                                                    className={`eat-pill ${ATTENDANCE_STYLES[marks[athlete.id]].bg} ${ATTENDANCE_STYLES[marks[athlete.id]].text} ${ATTENDANCE_STYLES[marks[athlete.id]].border}`}
                                                >
                                                    {ATTENDANCE_STYLES[marks[athlete.id]].label}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-5 gap-1.5">
                                        {ATTENDANCE_TYPES.map((t) => {
                                            const s = ATTENDANCE_STYLES[t];
                                            const active = marks[athlete.id] === t;
                                            return (
                                                <button
                                                    key={t}
                                                    data-testid={SESSION.chip(athlete.id, t)}
                                                    onClick={() => setMarks((m) => ({ ...m, [athlete.id]: t }))}
                                                    className={`h-12 border-2 text-[10px] sm:text-xs font-black uppercase tracking-tight transition-all eat-tile-tap ${
                                                        active ? `${s.bg} ${s.text} ${s.border} shadow-brut-sm` : "bg-white border-zinc-300 text-zinc-500 hover:border-obsidian"
                                                    }`}
                                                >
                                                    {CHIP_ABBREV[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {roster.length > 0 && (
                        <div className="sticky bottom-24 md:bottom-6 mt-6">
                            <button
                                data-testid={SESSION.saveAttendanceBtn}
                                onClick={saveAttendance}
                                disabled={saving || Object.keys(marks).length === 0}
                                className="eat-btn-primary w-full h-14 disabled:opacity-50"
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
