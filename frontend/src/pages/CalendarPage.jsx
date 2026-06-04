import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { SessionStatusPill } from "../components/Pills";
import { CALENDAR } from "../lib/testIds";
import {
    PROGRAM_LABEL,
    addDays,
    fmtDate,
    fmtDay,
    fmtDayNum,
    fmtTime,
    sessionRosterPreviewLabel,
    todayISO,
    weekStart,
} from "../lib/format";
import { ChevronLeft, ChevronRight, MapPin, Plus, Users } from "lucide-react";
import { SessionFormModal } from "./SessionForm";

// Each program type gets a left accent bar color
const TYPE_BAR = {
    full_time: "bg-accent",
    private: "bg-paper",
    semi_private: "bg-subtle",
};

function NewSessionButton({ onClick, className = "" }) {
    return (
        <button
            type="button"
            data-testid={CALENDAR.newSessionBtn}
            onClick={onClick}
            aria-label="New session"
            className={`shrink-0 inline-flex items-center justify-center eat-btn-primary h-9 w-9 p-0 md:h-auto md:w-auto md:px-4 md:py-2.5 ${className}`}
        >
            <Plus size={18} strokeWidth={1.75} className="md:hidden" />
            <Plus size={16} strokeWidth={1.75} className="hidden md:block md:mr-1.5" />
            <span className="hidden md:inline uppercase tracking-wider2 text-sm" style={{ fontWeight: 500 }}>
                New Session
            </span>
        </button>
    );
}

export default function CalendarPage() {
    const nav = useNavigate();
    const [today] = useState(todayISO());
    const [selected, setSelected] = useState(todayISO());
    const [weekAnchor, setWeekAnchor] = useState(weekStart(todayISO()));
    const [sessions, setSessions] = useState([]);
    const [athletes, setAthletes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [attendanceBySession, setAttendanceBySession] = useState({});

    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

    async function load() {
        setLoading(true);
        const start = weekDays[0];
        const end = weekDays[6];
        try {
            const [s, a] = await Promise.all([
                api.get(`/sessions`, { params: { start_date: start, end_date: end } }),
                api.get(`/athletes`),
            ]);
            setSessions(s.data);
            setAthletes(a.data);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekAnchor]);

    const sessionsByDay = useMemo(() => {
        const map = {};
        sessions.forEach((s) => {
            map[s.date] = map[s.date] || [];
            map[s.date].push(s);
        });
        return map;
    }, [sessions]);

    const daySessions = useMemo(
        () =>
            (sessionsByDay[selected] || []).sort((a, b) =>
                (a.start_time || "").localeCompare(b.start_time || "")
            ),
        [sessionsByDay, selected]
    );

    const athletesById = useMemo(
        () => Object.fromEntries(athletes.map((a) => [a.id, a])),
        [athletes]
    );

    useEffect(() => {
        if (!daySessions.length) {
            setAttendanceBySession({});
            return;
        }

        let cancelled = false;

        async function fetchAttendance() {
            const responses = await Promise.all(
                daySessions.map((session) =>
                    api.get(`/sessions/${session.id}/attendance`).catch(() => null)
                )
            );
            if (cancelled) return;
            const map = {};
            responses.forEach((resp, index) => {
                map[daySessions[index].id] = {
                    records: resp?.data?.records || [],
                    roster: resp?.data?.roster || [],
                };
            });
            setAttendanceBySession(map);
        }

        fetchAttendance();
        return () => {
            cancelled = true;
        };
    }, [daySessions]);

    return (
        <div>
            <PageHeader subtitle="Schedule" title="On Court" testId="page-calendar-header" />

            <div className="px-5 md:px-10 mt-8">
                {/* Week navigator */}
                <div className="flex items-center justify-between mb-5">
                    <button
                        data-testid="calendar-prev-week"
                        onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                        className="w-9 h-9 flex items-center justify-center text-muted hover:text-paper"
                        aria-label="Previous week"
                    >
                        <ChevronLeft size={18} strokeWidth={1.75} />
                    </button>
                    <div className="font-thunder uppercase tracking-tight text-lg text-paper" style={{ fontWeight: 500 }}>
                        {fmtDate(weekDays[0], { month: "short", day: "numeric" })} – {fmtDate(weekDays[6], { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <button
                        data-testid="calendar-next-week"
                        onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
                        className="w-9 h-9 flex items-center justify-center text-muted hover:text-paper"
                        aria-label="Next week"
                    >
                        <ChevronRight size={18} strokeWidth={1.75} />
                    </button>
                </div>

                {/* Week strip — minimal columns, accent dot/underline for selected */}
                <div className="grid grid-cols-7 gap-px bg-subtle border border-subtle mb-10">
                    {weekDays.map((d) => {
                        const isSelected = d === selected;
                        const isToday = d === today;
                        const count = (sessionsByDay[d] || []).length;
                        return (
                            <button
                                key={d}
                                data-testid={CALENDAR.weekStripDay(d)}
                                onClick={() => setSelected(d)}
                                className="bg-ink flex flex-col items-center py-3 hover:bg-mid transition-colors relative"
                            >
                                <span className={`text-[10px] uppercase tracking-wider2 ${isSelected ? "text-accent" : "text-muted"}`} style={{ fontWeight: 500 }}>
                                    {fmtDay(d)}
                                </span>
                                <span className={`eat-numeral text-3xl leading-none mt-1 ${isSelected ? "text-paper" : isToday ? "text-paper" : "text-muted"}`}>
                                    {fmtDayNum(d)}
                                </span>
                                <span className="mt-2 h-0.5 w-6 flex items-center justify-center">
                                    {isSelected ? (
                                        <span className="block w-full h-0.5 bg-accent" />
                                    ) : count > 0 ? (
                                        <span className="block w-1 h-1 rounded-full bg-muted" />
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mb-4 flex items-center gap-3">
                    <div className="eat-eyebrow min-w-0 flex-1 truncate">
                        {fmtDate(selected, { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                    <div
                        className="text-xs text-muted uppercase tracking-wider2 shrink-0 text-center flex-1"
                        style={{ fontWeight: 300 }}
                    >
                        {daySessions.length} session{daySessions.length === 1 ? "" : "s"}
                    </div>
                    <div className="flex flex-1 justify-end">
                        <NewSessionButton onClick={() => setFormOpen(true)} />
                    </div>
                </div>

                {loading ? (
                    <div className="text-center text-muted py-10 uppercase tracking-wider2 text-sm">Loading…</div>
                ) : daySessions.length === 0 ? (
                    <EmptyState
                        title="Nothing on this day"
                        hint="Tap “New Session” to schedule training, a private, or a semi-private."
                        action={
                            <button onClick={() => setFormOpen(true)} className="eat-btn-primary mt-2" data-testid={CALENDAR.emptyState}>
                                <Plus size={16} className="mr-1.5" /> New Session
                            </button>
                        }
                    />
                ) : (
                    <div className="flex flex-col gap-3 pb-10">
                        {daySessions.map((s) => (
                            <button
                                key={s.id}
                                data-testid={CALENDAR.sessionCard(s.id)}
                                onClick={() => nav(`/sessions/${s.id}`)}
                                className="relative bg-mid border border-subtle p-5 text-left hover:border-paper/30 transition-colors flex items-start gap-4"
                            >
                                <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${TYPE_BAR[s.session_type]}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-thunder text-3xl uppercase tracking-tight text-paper leading-none" style={{ fontWeight: 500 }}>
                                                {fmtTime(s.start_time) || "—"}
                                                {s.end_time && <span className="text-muted text-2xl"> – {fmtTime(s.end_time)}</span>}
                                            </div>
                                            <div className="eat-eyebrow mt-2">{PROGRAM_LABEL[s.session_type]}</div>
                                        </div>
                                        <SessionStatusPill session={s} />
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted font-light">
                                        {s.location && (
                                            <span className="inline-flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.5} /> {s.location}</span>
                                        )}
                                        {(() => {
                                            const att = attendanceBySession[s.id] || {};
                                            const preview = sessionRosterPreviewLabel(s, {
                                                records: att.records,
                                                roster: att.roster,
                                                athletesById,
                                            });
                                            if (!preview) return null;
                                            return (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Users size={13} strokeWidth={1.5} />
                                                    {preview}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <SessionFormModal
                open={formOpen}
                onOpenChange={setFormOpen}
                defaultDate={selected}
                athletes={athletes}
                onSaved={(meta) => {
                    setFormOpen(false);
                    const first = meta?.createdDates?.[0];
                    if (first) {
                        setWeekAnchor(weekStart(first));
                        setSelected(first);
                    }
                    load();
                }}
            />
        </div>
    );
}
