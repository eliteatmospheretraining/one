import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { SessionStatusPill } from "../components/Pills";
import { CALENDAR } from "../lib/testIds";
import { PROGRAM_LABEL, addDays, fmtDate, fmtDay, fmtDayNum, todayISO, weekStart } from "../lib/format";
import { Calendar, ChevronLeft, ChevronRight, MapPin, Plus, Users } from "lucide-react";
import { SessionFormModal } from "./SessionForm";

export default function CalendarPage() {
    const nav = useNavigate();
    const [today] = useState(todayISO());
    const [selected, setSelected] = useState(todayISO());
    const [weekAnchor, setWeekAnchor] = useState(weekStart(todayISO()));
    const [sessions, setSessions] = useState([]);
    const [athletes, setAthletes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);

    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

    async function load() {
        setLoading(true);
        // Load 2-week window (current + next) for week strip view counts.
        const start = weekDays[0];
        const end = addDays(weekDays[6], 0);
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

    const daySessions = (sessionsByDay[selected] || []).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

    return (
        <div>
            <PageHeader
                subtitle="Schedule"
                title="On Court"
                testId="page-calendar-header"
                actions={
                    <button
                        data-testid={CALENDAR.newSessionBtn}
                        onClick={() => setFormOpen(true)}
                        className="eat-btn-primary h-12 text-sm"
                    >
                        <Plus size={18} className="mr-2" /> New Session
                    </button>
                }
            />

            <div className="px-4 md:px-8 mt-4 md:mt-6">
                {/* Week navigator */}
                <div className="flex items-center justify-between mb-3">
                    <button
                        data-testid="calendar-prev-week"
                        onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                        className="w-10 h-10 border-2 border-obsidian flex items-center justify-center hover:bg-volt"
                        aria-label="Previous week"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <div className="font-heading uppercase tracking-tight text-lg">
                        {fmtDate(weekDays[0], { month: "short", day: "numeric" })} – {fmtDate(weekDays[6], { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <button
                        data-testid="calendar-next-week"
                        onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
                        className="w-10 h-10 border-2 border-obsidian flex items-center justify-center hover:bg-volt"
                        aria-label="Next week"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Week strip */}
                <div className="grid grid-cols-7 gap-1.5 mb-6">
                    {weekDays.map((d) => {
                        const isSelected = d === selected;
                        const isToday = d === today;
                        const count = (sessionsByDay[d] || []).length;
                        return (
                            <button
                                key={d}
                                data-testid={CALENDAR.weekStripDay(d)}
                                onClick={() => setSelected(d)}
                                className={`relative flex flex-col items-center py-2.5 border-2 transition-all ${
                                    isSelected ? "bg-obsidian text-white border-obsidian shadow-brut-volt" : "bg-white border-obsidian hover:bg-zinc-50"
                                }`}
                            >
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelected ? "text-volt" : "text-zinc-500"}`}>
                                    {fmtDay(d)}
                                </span>
                                <span className="eat-stat-num text-2xl leading-none mt-1">{fmtDayNum(d)}</span>
                                {count > 0 && (
                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full ${isSelected ? "bg-volt" : "bg-obsidian"}`} />
                                )}
                                {isToday && !isSelected && (
                                    <span className="absolute top-1 right-1 text-[8px] font-black text-volt-hover">●</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="mb-3 flex items-center justify-between">
                    <div className="eat-label">
                        {fmtDate(selected, { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                    <div className="text-xs text-zinc-500 font-bold">{daySessions.length} session{daySessions.length === 1 ? "" : "s"}</div>
                </div>

                {loading ? (
                    <div className="text-center text-zinc-400 py-8 font-bold uppercase tracking-widest text-sm">Loading…</div>
                ) : daySessions.length === 0 ? (
                    <EmptyState
                        icon={Calendar}
                        title="No sessions today"
                        hint="Tap “New Session” to schedule training, a private, or a semi-private."
                        action={
                            <button onClick={() => setFormOpen(true)} className="eat-btn-primary mt-3" data-testid={CALENDAR.emptyState}>
                                <Plus size={18} className="mr-2" /> New Session
                            </button>
                        }
                    />
                ) : (
                    <div className="flex flex-col gap-3 pb-8">
                        {daySessions.map((s) => (
                            <button
                                key={s.id}
                                data-testid={CALENDAR.sessionCard(s.id)}
                                onClick={() => nav(`/sessions/${s.id}`)}
                                className="eat-card text-left hover:-translate-y-[2px] transition-transform"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-heading text-2xl uppercase tracking-tight">
                                            {s.start_time || "—"}{s.end_time ? ` – ${s.end_time}` : ""}
                                        </div>
                                        <div className="font-bold uppercase tracking-widest text-xs mt-1 text-zinc-500">
                                            {PROGRAM_LABEL[s.session_type]}
                                        </div>
                                    </div>
                                    <SessionStatusPill status={s.status} />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                    {s.location && (
                                        <span className="inline-flex items-center gap-1.5 text-zinc-600"><MapPin size={14} />{s.location}</span>
                                    )}
                                    <span className="inline-flex items-center gap-1.5 text-zinc-600">
                                        <Users size={14} /> {(s.athlete_ids || []).length} expected
                                    </span>
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
                onSaved={() => { setFormOpen(false); load(); }}
            />
        </div>
    );
}
