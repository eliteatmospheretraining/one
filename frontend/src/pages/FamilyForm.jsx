import React, { useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { FAMILY_FORM } from "../lib/testIds";
import { toast } from "sonner";

export function FamilyFormModal({ open, onOpenChange, onSaved }) {
    const [form, setForm] = useState({
        family_name: "",
        guardian_name: "",
        guardian_email: "",
        guardian_phone: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        emergency_contact_email: "",
    });
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    async function submit(e) {
        e.preventDefault();
        const payload = { ...form };
        Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
        payload.family_name = form.family_name;
        payload.guardian_name = form.guardian_name;
        payload.guardian_email = form.guardian_email;
        payload.guardian_phone = form.guardian_phone;
        try {
            await api.post("/families", payload);
            toast.success("Family created");
            setForm({ family_name: "", guardian_name: "", guardian_email: "", guardian_phone: "", emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_email: "" });
            onSaved?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="New Family">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Family Name</label>
                    <input data-testid={FAMILY_FORM.name} required value={form.family_name} onChange={(e) => set("family_name", e.target.value)} className="eat-input mt-1.5" placeholder="Hernandez" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Guardian Name</label>
                        <input data-testid={FAMILY_FORM.guardianName} required value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} className="eat-input mt-1.5" />
                    </div>
                    <div>
                        <label className="eat-label">Guardian Phone</label>
                        <input data-testid={FAMILY_FORM.guardianPhone} required value={form.guardian_phone} onChange={(e) => set("guardian_phone", e.target.value)} className="eat-input mt-1.5" />
                    </div>
                </div>
                <div>
                    <label className="eat-label">Guardian Email</label>
                    <input data-testid={FAMILY_FORM.guardianEmail} type="email" required value={form.guardian_email} onChange={(e) => set("guardian_email", e.target.value)} className="eat-input mt-1.5" />
                </div>

                <div className="pt-3 border-t border-subtle">
                    <div className="eat-label mb-2">Emergency Contact (optional)</div>
                    <div className="grid grid-cols-2 gap-3">
                        <input data-testid={FAMILY_FORM.ecName} placeholder="Name" value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} className="eat-input" />
                        <input data-testid={FAMILY_FORM.ecPhone} placeholder="Phone" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} className="eat-input" />
                    </div>
                    <input data-testid={FAMILY_FORM.ecEmail} placeholder="Email" type="email" value={form.emergency_contact_email} onChange={(e) => set("emergency_contact_email", e.target.value)} className="eat-input mt-3" />
                </div>

                <button data-testid={FAMILY_FORM.submit} type="submit" className="eat-btn-primary w-full mt-2 h-12">Create Family</button>
            </form>
        </Modal>
    );
}
