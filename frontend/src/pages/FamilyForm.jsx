import React, { useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { FAMILY_FORM } from "../lib/testIds";
import { toast } from "sonner";

export function FamilyFormModal({ open, onOpenChange, onSaved }) {
    const [selectedParent, setSelectedParent] = useState("one");
    const [emergencyContactParent, setEmergencyContactParent] = useState("one");
    const [form, setForm] = useState({
        family_name: "",
        guardian_name: "",
        guardian_email: "",
        guardian_phone: "",
        guardian_name_secondary: "",
        guardian_email_secondary: "",
        guardian_phone_secondary: "",
    });
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    async function submit(e) {
        e.preventDefault();
        const payload = { ...form };
        Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

        if (emergencyContactParent === "one") {
            payload.emergency_contact_name = form.guardian_name || null;
            payload.emergency_contact_email = form.guardian_email || null;
            payload.emergency_contact_phone = form.guardian_phone || null;
        } else if (emergencyContactParent === "two") {
            payload.emergency_contact_name = form.guardian_name_secondary || null;
            payload.emergency_contact_email = form.guardian_email_secondary || null;
            payload.emergency_contact_phone = form.guardian_phone_secondary || null;
        } else {
            payload.emergency_contact_name = null;
            payload.emergency_contact_email = null;
            payload.emergency_contact_phone = null;
        }

        try {
            await api.post("/families", payload);
            toast.success("Family created");
            setSelectedParent("one");
            setEmergencyContactParent("one");
            setForm({
                family_name: "",
                guardian_name: "",
                guardian_email: "",
                guardian_phone: "",
                guardian_name_secondary: "",
                guardian_email_secondary: "",
                guardian_phone_secondary: "",
            });
            onSaved?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
        }
    }

    const parentLabel = selectedParent === "one" ? "Parent One" : "Parent Two";
    const nameKey = selectedParent === "one" ? "guardian_name" : "guardian_name_secondary";
    const emailKey = selectedParent === "one" ? "guardian_email" : "guardian_email_secondary";
    const phoneKey = selectedParent === "one" ? "guardian_phone" : "guardian_phone_secondary";
    const isPrimary = selectedParent === "one";

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="New Family">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Family Name</label>
                    <input data-testid={FAMILY_FORM.name} required value={form.family_name} onChange={(e) => set("family_name", e.target.value)} className="eat-input mt-1.5" placeholder="Hernandez" />
                </div>

                <div className="flex gap-2 flex-wrap">
                    {[
                        { value: "one", label: "Parent One" },
                        { value: "two", label: "Parent Two" },
                    ].map((option) => (
                        <button
                            type="button"
                            key={option.value}
                            onClick={() => setSelectedParent(option.value)}
                            className={`shrink-0 h-8 px-3 border text-[11px] uppercase tracking-wider2 transition-colors ${
                                selectedParent === option.value
                                    ? "bg-transparent text-accent border-accent"
                                    : "bg-transparent text-muted border-subtle hover:text-paper hover:border-paper/30"
                            }`}
                            style={{ fontWeight: 500 }}
                        >
                            <span className="inline-flex items-center gap-2">
                                {option.label}
                                {emergencyContactParent === option.value && <span className="text-accent">★</span>}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">{parentLabel} Name</label>
                        <input
                            data-testid={isPrimary ? FAMILY_FORM.guardianName : FAMILY_FORM.guardianTwoName}
                            value={form[nameKey]}
                            onChange={(e) => set(nameKey, e.target.value)}
                            className="eat-input mt-1.5"
                            required={isPrimary}
                        />
                    </div>
                    <div>
                        <label className="eat-label">{parentLabel} Phone</label>
                        <input
                            data-testid={isPrimary ? FAMILY_FORM.guardianPhone : FAMILY_FORM.guardianTwoPhone}
                            value={form[phoneKey]}
                            onChange={(e) => set(phoneKey, e.target.value)}
                            className="eat-input mt-1.5"
                            required={isPrimary}
                        />
                    </div>
                </div>
                <div>
                    <label className="eat-label">{parentLabel} Email</label>
                    <input
                        data-testid={isPrimary ? FAMILY_FORM.guardianEmail : FAMILY_FORM.guardianTwoEmail}
                        type="email"
                        value={form[emailKey]}
                        onChange={(e) => set(emailKey, e.target.value)}
                        className="eat-input mt-1.5"
                        required={isPrimary}
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider2 text-muted">
                    <input
                        type="checkbox"
                        checked={emergencyContactParent === selectedParent}
                        onChange={(e) => setEmergencyContactParent(e.target.checked ? selectedParent : null)}
                        className="h-4 w-4 rounded border border-subtle bg-mid accent-accent focus:ring-accent"
                    />
                    Emergency contact
                </label>

                <button data-testid={FAMILY_FORM.submit} type="submit" className="eat-btn-primary w-full mt-2 h-12">Create Family</button>
            </form>
        </Modal>
    );
}
