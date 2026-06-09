import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { FAMILY_FORM } from "../lib/testIds";
import { formatPhoneInput } from "../lib/format";
import { toast } from "sonner";

function blank() {
    return {
        family_name: "",
        guardian_name: "",
        guardian_email: "",
        guardian_phone: "",
        guardian_name_secondary: "",
        guardian_email_secondary: "",
        guardian_phone_secondary: "",
    };
}

function buildPayload(form) {
    const payload = {
        family_name: form.family_name.trim(),
        guardian_name: form.guardian_name.trim(),
        guardian_email: form.guardian_email.trim(),
        guardian_phone: form.guardian_phone.trim(),
        guardian_name_secondary: form.guardian_name_secondary.trim() || null,
        guardian_email_secondary: form.guardian_email_secondary.trim() || null,
        guardian_phone_secondary: form.guardian_phone_secondary.trim() || null,
        emergency_contacts: [],
        emergency_contact_name: form.guardian_name.trim(),
        emergency_contact_email: form.guardian_email.trim() || null,
        emergency_contact_phone: form.guardian_phone.trim() || null,
    };
    if (form.guardian_name.trim()) {
        payload.emergency_contacts.push({
            name: form.guardian_name.trim(),
            email: form.guardian_email.trim() || null,
            phone: form.guardian_phone.trim() || null,
        });
    }
    return payload;
}

export function FamilyFormModal({ open, onOpenChange, onSaved }) {
    const [form, setForm] = useState(blank());
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    useEffect(() => {
        if (open) setForm(blank());
    }, [open]);

    async function submit(e) {
        e.preventDefault();
        if (!form.family_name.trim()) {
            toast.error("Family name is required");
            return;
        }
        if (!form.guardian_name.trim() || !form.guardian_email.trim() || !form.guardian_phone.trim()) {
            toast.error("Primary contact name, email, and phone are required");
            return;
        }
        try {
            await api.post("/families", buildPayload(form));
            toast.success("Family created");
            onSaved?.();
        } catch (err) {
            toast.error(formatApiError(err) || "Could not create family");
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="New Family" maxW="max-w-lg">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Family Name</label>
                    <input
                        data-testid={FAMILY_FORM.name}
                        required
                        value={form.family_name}
                        onChange={(e) => set("family_name", e.target.value)}
                        className="eat-input mt-1.5"
                        placeholder="Hernandez"
                    />
                </div>
                <div>
                    <label className="eat-label">Primary Contact Name</label>
                    <input
                        data-testid={FAMILY_FORM.guardianName}
                        required
                        value={form.guardian_name}
                        onChange={(e) => set("guardian_name", e.target.value)}
                        className="eat-input mt-1.5"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Phone</label>
                        <input
                            data-testid={FAMILY_FORM.guardianPhone}
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            required
                            value={form.guardian_phone}
                            onChange={(e) => set("guardian_phone", formatPhoneInput(e.target.value))}
                            className="eat-input mt-1.5"
                            placeholder="(555) 123-4567"
                        />
                    </div>
                    <div>
                        <label className="eat-label">Email</label>
                        <input
                            data-testid={FAMILY_FORM.guardianEmail}
                            type="email"
                            required
                            value={form.guardian_email}
                            onChange={(e) => set("guardian_email", e.target.value)}
                            className="eat-input mt-1.5"
                        />
                    </div>
                </div>
                <div>
                    <label className="eat-label">Secondary Contact Name</label>
                    <input
                        data-testid={FAMILY_FORM.guardianTwoName}
                        value={form.guardian_name_secondary}
                        onChange={(e) => set("guardian_name_secondary", e.target.value)}
                        className="eat-input mt-1.5"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Phone</label>
                        <input
                            data-testid={FAMILY_FORM.guardianTwoPhone}
                            type="tel"
                            inputMode="tel"
                            value={form.guardian_phone_secondary}
                            onChange={(e) => set("guardian_phone_secondary", formatPhoneInput(e.target.value))}
                            className="eat-input mt-1.5"
                        />
                    </div>
                    <div>
                        <label className="eat-label">Email</label>
                        <input
                            data-testid={FAMILY_FORM.guardianTwoEmail}
                            type="email"
                            value={form.guardian_email_secondary}
                            onChange={(e) => set("guardian_email_secondary", e.target.value)}
                            className="eat-input mt-1.5"
                        />
                    </div>
                </div>
                <button data-testid={FAMILY_FORM.submit} type="submit" className="eat-btn-primary w-full mt-2 h-12">
                    Create Family
                </button>
            </form>
        </Modal>
    );
}
