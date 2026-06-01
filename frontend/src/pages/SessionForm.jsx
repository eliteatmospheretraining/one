import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { DateField } from "../components/DateField";
import { SESSION_FORM } from "../lib/testIds";
import { PROGRAM_LABEL } from "../lib/format";
import { toast } from "sonner";

export function SessionFormModal({ open, onOpenChange, defaultDate, athletes = [], session, onSaved }) {
    const isEdit = !!session;
    const [date, setDate] = useState(defaultDate || "");
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("12:00");
    const [type, setType] = useState("full_time");
    const [location, setLocation] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedIds, setSelectedIds] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            if (session) {
                setDate(session.date);
                setStartTime(session.start_time || "");
                setEndTime(session.end_time || "");
                setType(session.session_type);
                setLocation(session.location || "");
                setNotes(session.notes || "");
                setSelectedIds(session.athlete_ids || []);
            } else {
                setDate(defaultDate || "");
                setStartTime("09:00");
                setEndTime("12:00");
                setType("full_time");
                setLocation("");
                setNotes("");
                setSelectedIds([]);
            }
        }
    }, [open, session, defaultDate]);

    const filteredAthletes = athletes.filter((a) => a.status === "active" && a.program_type === type);

    const toggle = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    async function submit(e) {
        e.preventDefault();
        setSaving(true);
        const payload = {
            date,
            start_time: startTime || null,
            end_time: endTime || null,
            session_type: type,
            location: location || null,
            notes: notes || null,
            athlete_ids: selectedIds,
        };
        try {
            if (isEdit) {
                await api.patch(`/sessions/${session.id}`, payload);
                toast.success("Session updated");
            } else {
                await api.post(`/sessions`, payload);
                toast.success("Session created");
            }
            onSaved?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Failed to save");
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
                        <input data-testid={SESSION_FORM.start} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="eat-input mt-1.5" />
                    </div>
                    <div>
                        <label className="eat-label">End</label>
                        <input data-testid={SESSION_FORM.end} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="eat-input mt-1.5" />
                    </div>
                </div>

                <div>
                    <label className="eat-label">Program Type</label>
                    <select data-testid={SESSION_FORM.type} value={type} onChange={(e) => setType(e.target.value)} className="eat-input mt-1.5">
                        {Object.entries(PROGRAM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>

                <div>
                    <label className="eat-label">Location</label>
                    <input data-testid={SESSION_FORM.location} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Court 3, Tropical Park" className="eat-input mt-1.5" />
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
                    {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Session"}
                </button>
            </form>
        </Modal>
    );
}
