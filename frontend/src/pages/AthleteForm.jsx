import React, { useEffect, useState } from "react";
import { api, formatApiError, openEnrollmentPdf } from "../lib/api";
import { Modal } from "../components/Modal";
import { DateField } from "../components/DateField";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { ATHLETE_FORM, FAMILY_FORM } from "../lib/testIds";
import { athleteProgramTypes, formatPhoneInput } from "../lib/format";
import { toast } from "sonner";

const PROGRAMS = [
    { value: "full_time", label: "Eat w/ EAT" },
    { value: "private", label: "Private" },
    { value: "semi_private", label: "Semi-Private" },
];
const STATUSES = [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
];

function deriveFamilyName(fullName) {
    const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "Family";
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

function buildEmergencyContacts(form, emergencyContacts) {
    const contacts = [];
    if (emergencyContacts.has("one") && form.guardian_name) {
        contacts.push({
            name: form.guardian_name,
            email: form.guardian_email || null,
            phone: form.guardian_phone || null,
        });
    }
    if (emergencyContacts.has("two") && form.guardian_name_secondary) {
        contacts.push({
            name: form.guardian_name_secondary,
            email: form.guardian_email_secondary || null,
            phone: form.guardian_phone_secondary || null,
        });
    }
    return contacts;
}

function buildFamilyPayload(form, emergencyContacts) {
    const payload = {
        family_name: deriveFamilyName(form.full_name),
        guardian_name: form.guardian_name,
        guardian_email: form.guardian_email,
        guardian_phone: form.guardian_phone,
        guardian_name_secondary: form.guardian_name_secondary || null,
        guardian_email_secondary: form.guardian_email_secondary || null,
        guardian_phone_secondary: form.guardian_phone_secondary || null,
    };
    const emergency_contacts = buildEmergencyContacts(form, emergencyContacts);
    payload.emergency_contacts = emergency_contacts;
    if (emergency_contacts[0]) {
        payload.emergency_contact_name = emergency_contacts[0].name;
        payload.emergency_contact_email = emergency_contacts[0].email;
        payload.emergency_contact_phone = emergency_contacts[0].phone;
    } else {
        payload.emergency_contact_name = null;
        payload.emergency_contact_email = null;
        payload.emergency_contact_phone = null;
    }
    return payload;
}

export function AthleteFormModal({ open, onOpenChange, athlete, families, onSaved }) {
    const isEdit = !!athlete;
    const [selectedContact, setSelectedContact] = useState("one");
    const [emergencyContacts, setEmergencyContacts] = useState(() => new Set(["one"]));
    const [form, setForm] = useState(blank());

    function blank() {
        return {
            full_name: "",
            date_of_birth: "",
            program_types: ["full_time"],
            status: "active",
            training_start_date: "",
            utr: "",
            wtn: "",
            shirt_size: "",
            medical_conditions: "",
            guardian_name: "",
            guardian_email: "",
            guardian_phone: "",
            guardian_name_secondary: "",
            guardian_email_secondary: "",
            guardian_phone_secondary: "",
        };
    }

    useEffect(() => {
        if (open) {
            if (athlete) {
                const family = families.find((f) => f.id === athlete.family_id);
                setSelectedContact("one");
                setEmergencyContacts(() => {
                    const next = new Set();
                    const ec = family?.emergency_contacts || [];
                    if (ec.some((c) => c.name === family?.guardian_name)) next.add("one");
                    if (ec.some((c) => c.name === family?.guardian_name_secondary)) next.add("two");
                    if (next.size === 0) next.add("one");
                    return next;
                });
                setForm({
                    full_name: athlete.full_name || "",
                    date_of_birth: athlete.date_of_birth || "",
                    program_types: athleteProgramTypes(athlete),
                    status: athlete.status || "active",
                    training_start_date: athlete.training_start_date || "",
                    utr: athlete.utr ?? "",
                    wtn: athlete.wtn ?? "",
                    shirt_size: athlete.shirt_size || "",
                    medical_conditions: athlete.medical_conditions || "",
                    guardian_name: family?.guardian_name || "",
                    guardian_email: family?.guardian_email || "",
                    guardian_phone: family?.guardian_phone || "",
                    guardian_name_secondary: family?.guardian_name_secondary || "",
                    guardian_email_secondary: family?.guardian_email_secondary || "",
                    guardian_phone_secondary: family?.guardian_phone_secondary || "",
                });
            } else {
                setSelectedContact("one");
                setEmergencyContacts(new Set(["one"]));
                setForm(blank());
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, athlete, families]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    function toggleEmergency(contact) {
        setEmergencyContacts((prev) => {
            const next = new Set(prev);
            if (next.has(contact)) next.delete(contact);
            else next.add(contact);
            return next;
        });
    }

    function toggleProgram(value) {
        setForm((f) => {
            const current = f.program_types || [];
            if (current.includes(value)) {
                if (current.length === 1) return f;
                return { ...f, program_types: current.filter((x) => x !== value) };
            }
            return { ...f, program_types: [...current, value] };
        });
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.program_types?.length) {
            toast.error("Select at least one program");
            return;
        }
        if (!form.guardian_name || !form.guardian_email || !form.guardian_phone) {
            toast.error("Primary contact name, email, and phone are required");
            return;
        }

        const athletePayload = {
            full_name: form.full_name,
            date_of_birth: form.date_of_birth || null,
            program_types: form.program_types,
            program_type: form.program_types[0],
            status: form.status,
            training_start_date: form.training_start_date || null,
            utr: form.utr === "" ? null : Number(form.utr),
            wtn: form.wtn === "" ? null : Number(form.wtn),
            shirt_size: form.shirt_size || null,
            medical_conditions: form.medical_conditions || null,
        };

        try {
            if (isEdit) {
                const familyPayload = buildFamilyPayload(form, emergencyContacts);
                await api.patch(`/families/${athlete.family_id}`, familyPayload);
                await api.patch(`/athletes/${athlete.id}`, athletePayload);
                toast.success("Athlete updated");
            } else {
                const familyPayload = buildFamilyPayload(form, emergencyContacts);
                const famRes = await api.post("/families", familyPayload);
                await api.post("/athletes", { ...athletePayload, family_id: famRes.data.id });
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

    const contactLabel = selectedContact === "one" ? "Primary Contact" : "Secondary Contact";
    const nameKey = selectedContact === "one" ? "guardian_name" : "guardian_name_secondary";
    const emailKey = selectedContact === "one" ? "guardian_email" : "guardian_email_secondary";
    const phoneKey = selectedContact === "one" ? "guardian_phone" : "guardian_phone_secondary";
    const isPrimary = selectedContact === "one";

    async function viewEnrollmentForms(event) {
        event?.preventDefault();
        event?.stopPropagation();
        if (!athlete?.id) return;
        try {
            await openEnrollmentPdf(athlete.id);
        } catch (err) {
            toast.error(formatApiError(err) || "Could not open enrollment forms");
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit Athlete" : "New Athlete"}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <label className="eat-label">Programs</label>
                        {isEdit && athlete?.waiver_signature ? (
                            <button
                                type="button"
                                onClick={viewEnrollmentForms}
                                className="text-accent hover:underline text-xs shrink-0"
                            >
                                View Forms
                            </button>
                        ) : null}
                    </div>
                    <div className="flex gap-2 flex-wrap mt-1.5">
                        {PROGRAMS.map((p) => {
                            const selected = form.program_types?.includes(p.value);
                            return (
                                <button
                                    key={p.value}
                                    type="button"
                                    data-testid={ATHLETE_FORM.program}
                                    onClick={() => toggleProgram(p.value)}
                                    className={`shrink-0 h-8 px-3 border text-[11px] uppercase tracking-wider2 transition-colors ${
                                        selected
                                            ? "bg-transparent text-accent border-accent"
                                            : "bg-transparent text-muted border-subtle hover:text-paper hover:border-paper/30"
                                    }`}
                                    style={{ fontWeight: 500 }}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>
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

                <div className="flex flex-col gap-4 mt-4 mb-4">
                    <div className="flex gap-2 flex-wrap">
                        {[
                            { value: "one", label: "Primary Contact" },
                            { value: "two", label: "Secondary Contact" },
                        ].map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                onClick={() => setSelectedContact(option.value)}
                                className={`shrink-0 h-8 px-3 border text-[11px] uppercase tracking-wider2 transition-colors ${
                                    selectedContact === option.value
                                        ? "bg-transparent text-accent border-accent"
                                        : "bg-transparent text-muted border-subtle hover:text-paper hover:border-paper/30"
                                }`}
                                style={{ fontWeight: 500 }}
                            >
                                <span className="inline-flex items-center gap-2">
                                    {option.label}
                                    {emergencyContacts.has(option.value) && <span className="text-accent">★</span>}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="eat-label">{contactLabel} Name</label>
                            <input
                                data-testid={isPrimary ? FAMILY_FORM.guardianName : FAMILY_FORM.guardianTwoName}
                                value={form[nameKey]}
                                onChange={(e) => set(nameKey, e.target.value)}
                                className="eat-input mt-1.5"
                                required={isPrimary}
                            />
                        </div>
                        <div>
                            <label className="eat-label">{contactLabel} Phone</label>
                            <input
                                data-testid={isPrimary ? FAMILY_FORM.guardianPhone : FAMILY_FORM.guardianTwoPhone}
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                value={form[phoneKey]}
                                onChange={(e) => set(phoneKey, formatPhoneInput(e.target.value))}
                                className="eat-input mt-1.5"
                                placeholder="(555) 123-4567"
                                required={isPrimary}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="eat-label">{contactLabel} Email</label>
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
                            checked={emergencyContacts.has(selectedContact)}
                            onChange={() => toggleEmergency(selectedContact)}
                            className="h-4 w-4 rounded border border-subtle bg-mid accent-accent focus:ring-accent"
                        />
                        Emergency contact
                    </label>
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

                <button
                    data-testid={ATHLETE_FORM.submit}
                    type="submit"
                    className="eat-btn-primary w-full mt-2 h-12"
                >
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
