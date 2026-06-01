import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { ATHLETE_FORM } from "../lib/testIds";
import { toast } from "sonner";

const PROGRAMS = [
    { value: "full_time", label: "Full-Time" },
    { value: "private", label: "Private" },
    { value: "semi_private", label: "Semi-Private" },
];
const STATUSES = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
];
const RATE_TYPES = [
    { value: "daily", label: "Daily" },
    { value: "half_day", label: "Half-Day" },
    { value: "monthly", label: "Monthly" },
    { value: "per_session", label: "Per Session" },
];

export function AthleteFormModal({ open, onOpenChange, athlete, families, onSaved }) {
    const isEdit = !!athlete;
    const [form, setForm] = useState(blank());

    function blank() {
        return {
            full_name: "",
            date_of_birth: "",
            program_type: "full_time",
            status: "active",
            training_start_date: "",
            utr: "",
            wtn: "",
            shirt_size: "",
            rate_type: "daily",
            rate_override: "",
            family_id: families[0]?.id || "",
        };
    }

    useEffect(() => {
        if (open) {
            if (athlete) {
                setForm({
                    full_name: athlete.full_name || "",
                    date_of_birth: athlete.date_of_birth || "",
                    program_type: athlete.program_type || "full_time",
                    status: athlete.status || "active",
                    training_start_date: athlete.training_start_date || "",
                    utr: athlete.utr ?? "",
                    wtn: athlete.wtn ?? "",
                    shirt_size: athlete.shirt_size || "",
                    rate_type: athlete.rate_type || "daily",
                    rate_override: athlete.rate_override ?? "",
                    family_id: athlete.family_id || families[0]?.id || "",
                });
            } else {
                setForm(blank());
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, athlete, families]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    async function submit(e) {
        e.preventDefault();
        const payload = {
            full_name: form.full_name,
            date_of_birth: form.date_of_birth || null,
            program_type: form.program_type,
            status: form.status,
            training_start_date: form.training_start_date || null,
            utr: form.utr === "" ? null : Number(form.utr),
            wtn: form.wtn === "" ? null : Number(form.wtn),
            shirt_size: form.shirt_size || null,
            rate_type: form.rate_type,
            rate_override: form.rate_override === "" ? null : Number(form.rate_override),
            family_id: form.family_id,
        };
        try {
            if (isEdit) {
                await api.patch(`/athletes/${athlete.id}`, payload);
                toast.success("Athlete updated");
            } else {
                await api.post(`/athletes`, payload);
                toast.success("Athlete created");
            }
            onSaved?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
        }
    }

    async function archive() {
        if (!window.confirm("Archive this athlete?")) return;
        try {
            await api.post(`/athletes/${athlete.id}/archive`);
            toast.success("Archived");
            onSaved?.();
        } catch (e) {
            toast.error("Archive failed");
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit Athlete" : "New Athlete"}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Full Name</label>
                    <input data-testid={ATHLETE_FORM.nameInput} required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className="eat-input mt-1" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Date of Birth</label>
                        <input data-testid={ATHLETE_FORM.dobInput} type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="eat-input mt-1" />
                    </div>
                    <div>
                        <label className="eat-label">Training Start</label>
                        <input data-testid={ATHLETE_FORM.trainingStart} type="date" value={form.training_start_date} onChange={(e) => set("training_start_date", e.target.value)} className="eat-input mt-1" />
                    </div>
                </div>

                <div>
                    <label className="eat-label">Family</label>
                    <select data-testid={ATHLETE_FORM.family} required value={form.family_id} onChange={(e) => set("family_id", e.target.value)} className="eat-input mt-1">
                        <option value="">Select…</option>
                        {families.map((f) => <option key={f.id} value={f.id}>{f.family_name} ({f.guardian_name})</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Program</label>
                        <select data-testid={ATHLETE_FORM.program} value={form.program_type} onChange={(e) => set("program_type", e.target.value)} className="eat-input mt-1">
                            {PROGRAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="eat-label">Status</label>
                        <select data-testid={ATHLETE_FORM.status} value={form.status} onChange={(e) => set("status", e.target.value)} className="eat-input mt-1">
                            {STATUSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Rate Type</label>
                        <select data-testid={ATHLETE_FORM.rateType} value={form.rate_type} onChange={(e) => set("rate_type", e.target.value)} className="eat-input mt-1">
                            {RATE_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="eat-label">Rate Override ($)</label>
                        <input data-testid={ATHLETE_FORM.rateOverride} type="number" step="0.01" placeholder="default" value={form.rate_override} onChange={(e) => set("rate_override", e.target.value)} className="eat-input mt-1" />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="eat-label">UTR</label>
                        <input data-testid={ATHLETE_FORM.utr} type="number" step="0.01" value={form.utr} onChange={(e) => set("utr", e.target.value)} className="eat-input mt-1" />
                    </div>
                    <div>
                        <label className="eat-label">WTN</label>
                        <input data-testid={ATHLETE_FORM.wtn} type="number" step="0.01" value={form.wtn} onChange={(e) => set("wtn", e.target.value)} className="eat-input mt-1" />
                    </div>
                    <div>
                        <label className="eat-label">Shirt</label>
                        <input data-testid={ATHLETE_FORM.shirt} value={form.shirt_size} onChange={(e) => set("shirt_size", e.target.value)} className="eat-input mt-1" />
                    </div>
                </div>

                <button data-testid={ATHLETE_FORM.submit} type="submit" className="eat-btn-primary w-full mt-2">
                    {isEdit ? "Save Changes" : "Create Athlete"}
                </button>
                {isEdit && form.status !== "archived" && (
                    <button data-testid={ATHLETE_FORM.archive} type="button" onClick={archive} className="eat-btn-ghost h-10 text-sm border-2 border-red-500 text-red-700">
                        Archive Athlete
                    </button>
                )}
            </form>
        </Modal>
    );
}
