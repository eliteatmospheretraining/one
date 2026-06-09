import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { DateField } from "../components/DateField";
import { LocationField } from "../components/LocationField";
import { TimeField } from "../components/TimeField";
import { addLocationPreset, mergeLocationPresetsFromSessions } from "../lib/locationPresets";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { SESSION_FORM } from "../lib/testIds";
import {
    PROGRAM_LABEL,
    REPEAT_FREQUENCIES,
    REPEAT_WEEKDAY_LABELS,
    addHoursToTime24,
    athleteHasProgram,
    buildRecurringSessionDates,
    defaultRepeatWeekdays,
    fmtDate,
    nextHourStartFromNow,
    parseLocalISO,
    snapTimeToQuarterHour,
} from "../lib/format";
import { toast } from "sonner";

function expectedAthleteIds(athletes, sessionType) {
    return athletes
        .filter((a) => a.status === "active" && athleteHasProgram(a, sessionType))
        .map((a) => a.id);
}

function EatCheckbox({ checked, onChange, testId, children }) {
    return (
        <label className="flex items-start gap-3 cursor-pointer" data-testid={testId}>
            <span
                className={`mt-0.5 w-4 h-4 border shrink-0 flex items-center justify-center ${
                    checked ? "bg-accent border-accent" : "bg-mid border-subtle"
                }`}
            >
                {checked && <span className="text-ink text-xs leading-none">✓</span>}
            </span>
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <span className="min-w-0">{children}</span>
        </label>
    );
}

export function SessionFormModal({ open, onOpenChange, defaultDate, athletes = [], session, onSaved }) {
    const isEdit = !!session;
    const [date, setDate] = useState(defaultDate || "");
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("12:00");
    const [type, setType] = useState("full_time");
    const [location, setLocation] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedIds, setSelectedIds] = useState([]);
    const [repeat, setRepeat] = useState(false);
    const [repeatFrequency, setRepeatFrequency] = useState("weekly");
    const [repeatInterval, setRepeatInterval] = useState(1);
    const [repeatDuration, setRepeatDuration] = useState(1);
    const [repeatWeekdays, setRepeatWeekdays] = useState(() => defaultRepeatWeekdays("full_time"));
    const [saving, setSaving] = useState(false);

    const recurringDates = useMemo(() => {
        if (isEdit || !repeat || !date) return [];
        return buildRecurringSessionDates({
            startIso: date,
            frequency: repeatFrequency,
            interval: repeatInterval,
            duration: repeatDuration,
            weekdays: repeatWeekdays,
        });
    }, [isEdit, repeat, date, repeatFrequency, repeatInterval, repeatDuration, repeatWeekdays]);

    const durationUnit =
        repeatFrequency === "monthly" ? "months" : repeatFrequency === "yearly" ? "years" : "weeks";

    useEffect(() => {
        if (!open) return;
        api.get("/sessions")
            .then((r) => mergeLocationPresetsFromSessions(r.data || []))
            .catch(() => {});
    }, [open]);

    useEffect(() => {
        if (open) {
            if (session) {
                setDate(session.date);
                setStartTime(snapTimeToQuarterHour(session.start_time || ""));
                setEndTime(snapTimeToQuarterHour(session.end_time || ""));
                setType(session.session_type);
                setLocation(session.location || "");
                setNotes(session.notes || "");
                setSelectedIds(session.athlete_ids || []);
            } else {
                const start = nextHourStartFromNow();
                setDate(defaultDate || "");
                setStartTime(start);
                setEndTime(addHoursToTime24(start, 5));
                setType("full_time");
                setLocation("");
                setNotes("");
                setRepeat(false);
                setRepeatFrequency("weekly");
                setRepeatInterval(1);
                setRepeatDuration(1);
                setRepeatWeekdays(defaultRepeatWeekdays("full_time"));
            }
        }
    }, [open, session, defaultDate]);

    useEffect(() => {
        if (!open || session || type !== "full_time") return;
        setSelectedIds(expectedAthleteIds(athletes, type));
    }, [open, session, athletes, type]);

    useEffect(() => {
        if (isEdit || !repeat || repeatFrequency !== "weekly" || type !== "full_time") return;
        setRepeatWeekdays(defaultRepeatWeekdays("full_time"));
    }, [type, isEdit, repeat, repeatFrequency]);

    const filteredAthletes = athletes.filter((a) => a.status === "active" && athleteHasProgram(a, type));

    const toggle = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    function toggleWeekday(index) {
        setRepeatWeekdays((prev) => prev.map((on, i) => (i === index ? !on : on)));
    }

    function enableRepeat(checked) {
        setRepeat(checked);
        if (!checked) return;
        if (type === "full_time") {
            setRepeatFrequency("weekly");
            setRepeatWeekdays(defaultRepeatWeekdays("full_time"));
        } else if (date) {
            const dow = parseLocalISO(date).getDay();
            const days = defaultRepeatWeekdays();
            days[dow] = true;
            setRepeatWeekdays(days);
        }
    }

    async function submit(e) {
        e.preventDefault();
        const payload = {
            date,
            start_time: startTime || null,
            end_time: endTime || null,
            session_type: type,
            location: location || null,
            notes: notes || null,
            athlete_ids: selectedIds,
        };
        const dates =
            !isEdit && repeat && date && recurringDates.length > 0
                ? recurringDates
                : date
                  ? [date]
                  : [];
        if (!isEdit && !dates.length) {
            toast.error(repeat ? "Choose repeat days or a valid date" : "Choose a date");
            return;
        }
        setSaving(true);
        try {
            if (isEdit) {
                await api.patch(`/sessions/${session.id}`, payload);
                toast.success("Session updated");
                if (location?.trim()) addLocationPreset(type, location);
                onSaved?.();
            } else if (dates.length === 1) {
                await api.post("/sessions", { ...payload, date: dates[0] });
                toast.success("Session created");
                if (location?.trim()) addLocationPreset(type, location);
                onSaved?.({ createdDates: dates });
            } else {
                const batch = dates.map((sessionDate) => ({ ...payload, date: sessionDate }));
                const r = await api.post("/sessions/batch", batch);
                const count = r.data?.length ?? dates.length;
                toast.success(
                    `Created ${count} sessions · ${fmtDate(dates[0], { month: "short", day: "numeric" })} – ${fmtDate(
                        dates[dates.length - 1],
                        { month: "short", day: "numeric", year: "numeric" }
                    )}`
                );
                if (location?.trim()) addLocationPreset(type, location);
                onSaved?.({ createdDates: dates });
            }
        } catch (e) {
            toast.error(formatApiError(e) || "Failed to save");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit Session" : "New Session"}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Date</label>
                    <div className="mt-1.5">
                        <DateField value={date} onChange={setDate} data-testid={SESSION_FORM.date} required />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Start</label>
                        <div className="mt-1.5">
                            <TimeField value={startTime} onChange={setStartTime} data-testid={SESSION_FORM.start} required />
                        </div>
                    </div>
                    <div>
                        <label className="eat-label">End</label>
                        <div className="mt-1.5">
                            <TimeField value={endTime} onChange={setEndTime} data-testid={SESSION_FORM.end} required />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="eat-label">Program Type</label>
                    <Select
                        value={type}
                        onValueChange={(v) => {
                            setType(v);
                            if (!isEdit) {
                                setSelectedIds(v === "full_time" ? expectedAthleteIds(athletes, v) : []);
                            }
                        }}
                    >
                        <SelectTrigger data-testid={SESSION_FORM.type} className="mt-1.5 h-11">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(PROGRAM_LABEL).map(([v, l]) => (
                                <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {!isEdit && (
                    <div className="border border-subtle p-4 space-y-3">
                        <EatCheckbox
                            checked={repeat}
                            onChange={(e) => enableRepeat(e.target.checked)}
                            testId={SESSION_FORM.recurringToggle}
                        >
                            <span className="text-paper text-sm" style={{ fontWeight: 500 }}>
                                Repeat
                            </span>
                        </EatCheckbox>

                        {repeat && (
                            <>
                                <div>
                                    <label className="eat-label">Frequency</label>
                                    <Select value={repeatFrequency} onValueChange={setRepeatFrequency}>
                                        <SelectTrigger
                                            data-testid={SESSION_FORM.recurringFrequency}
                                            className="mt-1.5 h-11"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {REPEAT_FREQUENCIES.map((f) => (
                                                <SelectItem key={f.value} value={f.value}>
                                                    {f.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-sm text-paper">
                                    <span className="text-muted font-light">Every</span>
                                    <input
                                        data-testid={SESSION_FORM.recurringInterval}
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={repeatInterval}
                                        onChange={(e) =>
                                            setRepeatInterval(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
                                        }
                                        className="eat-input w-14 h-9 text-center px-1"
                                    />
                                    <span className="text-muted font-light">
                                        {repeatFrequency === "daily"
                                            ? "day"
                                            : repeatFrequency === "weekly"
                                              ? "week"
                                              : repeatFrequency === "monthly"
                                                ? "month"
                                                : "year"}
                                        {repeatInterval === 1 ? "" : "s"}
                                    </span>
                                </div>

                                {repeatFrequency === "weekly" && (
                                    <div>
                                        <div className="text-xs text-muted font-light mb-2">On</div>
                                        <div className="flex gap-1">
                                            {REPEAT_WEEKDAY_LABELS.map((label, index) => {
                                                const on = repeatWeekdays[index];
                                                return (
                                                    <button
                                                        key={`${label}-${index}`}
                                                        type="button"
                                                        data-testid={SESSION_FORM.recurringWeekday(index)}
                                                        onClick={() => toggleWeekday(index)}
                                                        className={`w-9 h-9 text-xs uppercase tracking-wider2 border transition-colors ${
                                                            on
                                                                ? "bg-accent text-ink border-accent"
                                                                : "bg-mid text-muted border-subtle hover:border-paper"
                                                        }`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2 text-sm text-paper">
                                    <span className="text-muted font-light">For</span>
                                    <input
                                        data-testid={SESSION_FORM.recurringWeeks}
                                        type="number"
                                        min={1}
                                        max={52}
                                        value={repeatDuration}
                                        onChange={(e) =>
                                            setRepeatDuration(Math.max(1, Math.min(52, Number(e.target.value) || 1)))
                                        }
                                        className="eat-input w-14 h-9 text-center px-1"
                                    />
                                    <span className="text-muted font-light">{durationUnit}</span>
                                </div>

                                {recurringDates.length > 0 && (
                                    <p className="text-xs text-muted font-light">
                                        {recurringDates.length} session{recurringDates.length === 1 ? "" : "s"} ·{" "}
                                        {fmtDate(recurringDates[0], { month: "short", day: "numeric" })}
                                        {" – "}
                                        {fmtDate(recurringDates[recurringDates.length - 1], {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                        })}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div>
                    <label className="eat-label">Location</label>
                    <div className="mt-1.5">
                        <LocationField
                            value={location}
                            onChange={setLocation}
                            sessionType={type}
                            data-testid={SESSION_FORM.location}
                        />
                    </div>
                </div>

                <div>
                    <label className="eat-label">Notes</label>
                    <textarea data-testid={SESSION_FORM.notes} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="eat-input mt-1.5 h-auto py-2" />
                </div>

                <div>
                    <label className="eat-label">Expected Athletes ({selectedIds.length})</label>
                    <div className="mt-1.5 border border-subtle max-h-48 overflow-y-auto">
                        {filteredAthletes.length === 0 ? (
                            <div className="p-4 text-sm text-muted font-light">No active athletes for {PROGRAM_LABEL[type]}.</div>
                        ) : filteredAthletes.map((a) => {
                            const checked = selectedIds.includes(a.id);
                            return (
                                <label
                                    key={a.id}
                                    data-testid={SESSION_FORM.athleteToggle(a.id)}
                                    className="flex items-center gap-3 px-3 py-2.5 border-b border-subtle last:border-b-0 cursor-pointer hover:bg-ink/60"
                                >
                                    <span className={`w-4 h-4 border flex items-center justify-center ${checked ? "bg-accent border-accent" : "bg-mid border-subtle"}`}>
                                        {checked && <span className="text-ink text-xs leading-none">✓</span>}
                                    </span>
                                    <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="sr-only" />
                                    <span className="text-paper" style={{ fontWeight: 500 }}>{a.full_name}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <button data-testid={SESSION_FORM.submit} disabled={saving} type="submit" className="eat-btn-primary w-full mt-2 h-12">
                    {saving
                        ? "Saving…"
                        : isEdit
                          ? "Save Changes"
                          : repeat && recurringDates.length > 1
                            ? `Create ${recurringDates.length} Sessions`
                            : "Create Session"}
                </button>
            </form>
        </Modal>
    );
}
