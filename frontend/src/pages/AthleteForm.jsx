import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { DateField } from "../components/DateField";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
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
            medical_conditions: "",
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
                    medical_conditions: athlete.medical_conditions || "",
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
            medical_conditions: form.medical_conditions || null,
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
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Program</label>
                        <Select value={form.program_type} onValueChange={(v) => set("program_type", v)}>
                            <SelectTrigger data-testid={ATHLETE_FORM.program} className="mt-1.5 h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PROGRAMS.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="eat-label">Status</label>
                        <Select value={form.status} onValueChange={(v) => set("status", v)}>
                            <SelectTrigger data-testid={ATHLETE_FORM.status} className="mt-1.5 h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUSES.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <label className="eat-label">Full Name</label>
                    <input data-testid={ATHLETE_FORM.nameInput} required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className="eat-input mt-1.5" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Date of Birth</label>
                        <div className="mt-1.5"><DateField value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} data-testid={ATHLETE_FORM.dobInput} /></div>
                    </div>
                    <div>
                        <label className="eat-label">Training Start</label>
                        <div className="mt-1.5"><DateField value={form.training_start_date} onChange={(v) => set("training_start_date", v)} data-testid={ATHLETE_FORM.trainingStart} /></div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="eat-label">UTR</label>
                        <input data-testid={ATHLETE_FORM.utr} type="number" step="0.01" value={form.utr} onChange={(e) => set("utr", e.target.value)} className="eat-input mt-1.5" />
                    </div>
                    <div>
                        <label className="eat-label">WTN</label>
                        <input data-testid={ATHLETE_FORM.wtn} type="number" step="0.01" value={form.wtn} onChange={(e) => set("wtn", e.target.value)} className="eat-input mt-1.5" />
                    </div>
                    <div>
                        <label className="eat-label">Shirt</label>
                        <input data-testid={ATHLETE_FORM.shirt} value={form.shirt_size} onChange={(e) => set("shirt_size", e.target.value)} className="eat-input mt-1.5" />
                    </div>
                </div>
                <div>
                    <label className="eat-label">Family</label>
                    <Select value={form.family_id} onValueChange={(v) => set("family_id", v)}>
                        <SelectTrigger data-testid={ATHLETE_FORM.family} className="mt-1.5 h-11">
                            <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                            {families.map((f) => (
                                <SelectItem key={f.id} value={f.id}>{`${f.family_name} (${f.guardian_name})`}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <label className="eat-label">Allergies / Medical Conditions</label>
                    <textarea
                        data-testid={ATHLETE_FORM.medicalConditions}
                        value={form.medical_conditions}
                        onChange={(e) => set("medical_conditions", e.target.value)}
                        className="eat-input mt-1.5 min-h-[5.5rem] resize-none"
                        placeholder="E.g. asthma, peanut allergy, knee surgery"
                    />
                </div>

                <button data-testid={ATHLETE_FORM.submit} type="submit" className="eat-btn-primary w-full mt-2 h-12">
                    {isEdit ? "Save Changes" : "Create Athlete"}
                </button>
                {isEdit && form.status !== "archived" && (
                    <button data-testid={ATHLETE_FORM.archive} type="button" onClick={archive} className="eat-btn-danger h-10">
                        Archive Athlete
                    </button>
                )}
            </form>
        </Modal>
    );
}
