import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API, formatApiError } from "../lib/api";
import { BRAND_LOGO_WHITE, BRAND_NAME } from "../constants/brand";
import "./Enroll.css";

const PROGRAMS = [
    { value: "full_time", label: "Eat w/ EAT — Full-Time" },
    { value: "private", label: "Private Lesson" },
    { value: "semi_private", label: "Semi-Private" },
];

const GOALS = [
    "Fitness",
    "Skill Development",
    "Tournament Prep",
    "High School Prep",
    "College Prep",
    "High-Performance",
];

const MEDICAL_FLAGS = [
    "Allergies",
    "Asthma",
    "Diabetes",
    "Heart Condition",
    "Seizure Disorder",
    "Physical Limitation",
    "Inhaler / EpiPen",
    "Medication",
    "Other",
];

const REFERRALS = ["Referral", "Google", "Instagram", "Tournament", "Other"];

const RELATIONSHIPS = ["Parent", "Caregiver", "Relative", "Guardian"];
const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const ENROLL_SECTION_COUNT = 4;

function EnrollProgress({ step }) {
    return (
        <div className="enroll-pb" aria-hidden="true">
            {Array.from({ length: ENROLL_SECTION_COUNT }, (_, i) => (
                <div key={i} className={`enroll-pb-s${step >= i ? " on" : ""}`} />
            ))}
        </div>
    );
}

const blankForm = () => ({
    full_name: "",
    date_of_birth: "",
    school: "",
    grade: "",
    shirt_size: "",
    program_type: "full_time",
    utr: "",
    wtn: "",
    goals: [],
    guardian_name: "",
    guardian_relationship: "",
    guardian_phone: "",
    guardian_email: "",
    primary_emergency: false,
    guardian_name_secondary: "",
    guardian_relationship_secondary: "",
    guardian_phone_secondary: "",
    guardian_email_secondary: "",
    secondary_emergency: false,
    medical_none: true,
    medical_flags: [],
    medical_details: "",
    referral_source: "",
    additional_notes: "",
});

export default function Enroll() {
    const [form, setForm] = useState(blankForm);
    const [submitted, setSubmitted] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [progressStep, setProgressStep] = useState(0);
    const sectionRefs = useRef([]);

    const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    useEffect(() => {
        function updateProgress() {
            const marker = window.scrollY + window.innerHeight * 0.35;
            let step = 0;
            sectionRefs.current.forEach((el, i) => {
                if (el && el.offsetTop <= marker) step = i;
            });
            setProgressStep(step);
        }

        updateProgress();
        window.addEventListener("scroll", updateProgress, { passive: true });
        window.addEventListener("resize", updateProgress);
        return () => {
            window.removeEventListener("scroll", updateProgress);
            window.removeEventListener("resize", updateProgress);
        };
    }, [submitted]);

    function setSectionRef(index) {
        return (el) => {
            sectionRefs.current[index] = el;
        };
    }

    function toggleGoal(goal) {
        setForm((f) => {
            const goals = f.goals.includes(goal)
                ? f.goals.filter((g) => g !== goal)
                : [...f.goals, goal];
            return { ...f, goals };
        });
    }

    function pickMedicalNone() {
        setForm((f) => {
            if (f.medical_none) {
                return { ...f, medical_none: false };
            }
            return { ...f, medical_none: true, medical_flags: [], medical_details: "" };
        });
    }

    function toggleMedicalFlag(flag) {
        setForm((f) => {
            const flags = f.medical_flags.includes(flag)
                ? f.medical_flags.filter((x) => x !== flag)
                : [...f.medical_flags, flag];
            return { ...f, medical_none: false, medical_flags: flags };
        });
    }

    const showMedicalDetails = !form.medical_none && form.medical_flags.length > 0;

    async function submit(e) {
        e.preventDefault();
        setError(null);

        if (!form.full_name.trim()) return setError("Athlete full name is required");
        if (!form.date_of_birth) return setError("Date of birth is required");
        if (!form.shirt_size) return setError("T-shirt size is required");
        if (!form.program_type) return setError("Select a program");
        if (!form.guardian_name.trim()) return setError("Primary contact name is required");
        if (!form.guardian_relationship) return setError("Primary contact relationship is required");
        if (!form.guardian_phone.trim()) return setError("Primary contact phone is required");
        if (!form.guardian_email.trim()) return setError("Primary contact email is required");
        if (!form.medical_none && form.medical_flags.length === 0) {
            return setError("Select None or flag at least one medical condition");
        }

        const payload = {
            full_name: form.full_name.trim(),
            date_of_birth: form.date_of_birth,
            shirt_size: form.shirt_size,
            program_type: form.program_type,
            school: form.school.trim() || null,
            grade: form.grade.trim() || null,
            utr: form.utr === "" ? null : Number(form.utr),
            wtn: form.wtn === "" ? null : Number(form.wtn),
            goals: form.goals,
            guardian_name: form.guardian_name.trim(),
            guardian_relationship: form.guardian_relationship,
            guardian_phone: form.guardian_phone.trim(),
            guardian_email: form.guardian_email.trim(),
            guardian_name_secondary: form.guardian_name_secondary.trim() || null,
            guardian_relationship_secondary: form.guardian_relationship_secondary || null,
            guardian_phone_secondary: form.guardian_phone_secondary.trim() || null,
            guardian_email_secondary: form.guardian_email_secondary.trim() || null,
            primary_emergency: form.primary_emergency,
            secondary_emergency: form.secondary_emergency,
            medical_none: form.medical_none,
            medical_flags: form.medical_flags,
            medical_details: form.medical_details.trim() || null,
            referral_source: form.referral_source || null,
            additional_notes: form.additional_notes.trim() || null,
        };

        setLoading(true);
        try {
            const r = await axios.post(`${API}/enroll`, payload);
            setSubmitted(r.data);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err) {
            setError(formatApiError(err) || "Could not submit enrollment");
        } finally {
            setLoading(false);
        }
    }

    if (submitted) {
        return (
            <div className="enroll-page">
                <div className="enroll-hd">
                    <div className="enroll-title-row enroll-title-row--end">
                        <img src={BRAND_LOGO_WHITE} alt={BRAND_NAME} className="enroll-header-logo" />
                    </div>
                    <EnrollProgress step={ENROLL_SECTION_COUNT - 1} />
                </div>
                <div className="enroll-ty show">
                    <div className="enroll-ty-ey">Enrollment Received</div>
                    <div className="enroll-ty-h">
                        You&apos;re
                        <br />
                        <span style={{ color: "#c8f000" }}>on deck.</span>
                    </div>
                    <div className="enroll-ty-rule" />
                    <div className="enroll-ty-b">
                        <strong>{submitted.athlete_name}</strong> has been submitted. Coach Rico will review your
                        information and reach out to confirm your program, start date, and first session.
                        <br />
                        <br />
                        A confirmation will be sent to <strong>{submitted.guardian_email}</strong>.
                    </div>
                    <div className="enroll-ty-m">
                        <div className="enroll-ty-mr">
                            <span className="enroll-ty-ml">Status</span>
                            <span className="enroll-ty-mv">Pending review</span>
                        </div>
                        <div className="enroll-ty-mr">
                            <span className="enroll-ty-ml">Program</span>
                            <span className="enroll-ty-mv">{submitted.program_label}</span>
                        </div>
                        <div className="enroll-ty-mr">
                            <span className="enroll-ty-ml">Next Step</span>
                            <span className="enroll-ty-mv">Rico will contact you within 24–48 hours</span>
                        </div>
                        <div className="enroll-ty-mr">
                            <span className="enroll-ty-ml">Location</span>
                            <span className="enroll-ty-mv">Sunrise Athletic Complex · Broward County, FL</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="enroll-page">
            <div className="enroll-hd">
                <div className="enroll-title-row">
                    <div className="enroll-title">
                        Enroll<span style={{ color: "#c8f000" }}>.</span>
                    </div>
                    <img src={BRAND_LOGO_WHITE} alt={BRAND_NAME} className="enroll-header-logo" />
                </div>
                <div className="enroll-sub">
                    Complete all required fields. Coach Rico will confirm your program and start date.
                </div>
                <EnrollProgress step={progressStep} />
            </div>

            <form className="enroll-fb" onSubmit={submit}>
                <section className="enroll-section" ref={setSectionRef(0)}>
                <span className="enroll-cl">
                    Program of Interest <span className="enroll-rq">*</span>
                </span>
                <div className="enroll-cr">
                    {PROGRAMS.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            className={`enroll-ch ${form.program_type === p.value ? "on" : ""}`}
                            onClick={() => set("program_type", p.value)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                <div className="enroll-sl">Athlete Details</div>
                <div className="enroll-r enroll-c2">
                    <div className="enroll-f">
                        <label>Full Name <span className="enroll-rq">*</span></label>
                        <input
                            type="text"
                            value={form.full_name}
                            onChange={(e) => set("full_name", e.target.value)}
                            placeholder="First Last"
                            required
                        />
                    </div>
                    <div className="enroll-f">
                        <label>Date of Birth <span className="enroll-rq">*</span></label>
                        <input
                            type="date"
                            value={form.date_of_birth}
                            onChange={(e) => set("date_of_birth", e.target.value)}
                            required
                        />
                    </div>
                </div>
                <div className="enroll-r enroll-c3">
                    <div className="enroll-f">
                        <label>School</label>
                        <input
                            type="text"
                            value={form.school}
                            onChange={(e) => set("school", e.target.value)}
                            placeholder="School name"
                        />
                    </div>
                    <div className="enroll-f">
                        <label>Grade</label>
                        <input
                            type="text"
                            value={form.grade}
                            onChange={(e) => set("grade", e.target.value)}
                            placeholder="e.g. 9th"
                        />
                    </div>
                    <div className="enroll-f">
                        <label>T-Shirt <span className="enroll-rq">*</span></label>
                        <select
                            value={form.shirt_size}
                            onChange={(e) => set("shirt_size", e.target.value)}
                            required
                        >
                            <option value="">—</option>
                            {SHIRT_SIZES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="enroll-dv" />
                </section>

                <section className="enroll-section" ref={setSectionRef(1)}>
                <div className="enroll-sl">Tennis Background</div>
                <div className="enroll-r enroll-c2">
                    <div className="enroll-f">
                        <label>UTR Rating</label>
                        <input
                            type="number"
                            step="0.01"
                            value={form.utr}
                            onChange={(e) => set("utr", e.target.value)}
                            placeholder="0.00"
                        />
                    </div>
                    <div className="enroll-f">
                        <label>WTN Rating</label>
                        <input
                            type="number"
                            step="0.01"
                            value={form.wtn}
                            onChange={(e) => set("wtn", e.target.value)}
                            placeholder="0.00"
                        />
                    </div>
                </div>
                <span className="enroll-cl">Primary Goal(s)</span>
                <div className="enroll-cr">
                    {GOALS.map((g) => (
                        <button
                            key={g}
                            type="button"
                            className={`enroll-ch ${form.goals.includes(g) ? "on" : ""}`}
                            onClick={() => toggleGoal(g)}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                <div className="enroll-dv" />
                </section>

                <section className="enroll-section" ref={setSectionRef(2)}>
                <div className="enroll-sl">Contact</div>
                <span className="enroll-ss">Primary Contact</span>
                <div className="enroll-r enroll-c2">
                    <div className="enroll-f">
                        <label>Name <span className="enroll-rq">*</span></label>
                        <input
                            type="text"
                            value={form.guardian_name}
                            onChange={(e) => set("guardian_name", e.target.value)}
                            placeholder="Full name"
                            required
                        />
                    </div>
                    <div className="enroll-f">
                        <label>Relationship <span className="enroll-rq">*</span></label>
                        <select
                            value={form.guardian_relationship}
                            onChange={(e) => set("guardian_relationship", e.target.value)}
                            required
                        >
                            <option value="">—</option>
                            {RELATIONSHIPS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="enroll-r enroll-c2">
                    <div className="enroll-f">
                        <label>Phone <span className="enroll-rq">*</span></label>
                        <input
                            type="tel"
                            value={form.guardian_phone}
                            onChange={(e) => set("guardian_phone", e.target.value)}
                            placeholder="(555) 123-4567"
                            required
                        />
                    </div>
                    <div className="enroll-f">
                        <label>Email <span className="enroll-rq">*</span></label>
                        <input
                            type="email"
                            value={form.guardian_email}
                            onChange={(e) => set("guardian_email", e.target.value)}
                            placeholder="Invoices sent here"
                            required
                        />
                        <div className="enroll-hn">Invoices sent to this address</div>
                    </div>
                </div>
                <label className="enroll-check">
                    <input
                        type="checkbox"
                        checked={form.primary_emergency}
                        onChange={(e) => set("primary_emergency", e.target.checked)}
                    />
                    Emergency contact
                </label>

                <span className="enroll-ss">Secondary Contact</span>
                <div className="enroll-r enroll-c2">
                    <div className="enroll-f">
                        <label>Name</label>
                        <input
                            type="text"
                            value={form.guardian_name_secondary}
                            onChange={(e) => set("guardian_name_secondary", e.target.value)}
                            placeholder="Full name"
                        />
                    </div>
                    <div className="enroll-f">
                        <label>Relationship</label>
                        <select
                            value={form.guardian_relationship_secondary}
                            onChange={(e) => set("guardian_relationship_secondary", e.target.value)}
                        >
                            <option value="">—</option>
                            {RELATIONSHIPS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="enroll-r enroll-c2">
                    <div className="enroll-f">
                        <label>Phone</label>
                        <input
                            type="tel"
                            value={form.guardian_phone_secondary}
                            onChange={(e) => set("guardian_phone_secondary", e.target.value)}
                            placeholder="(555) 123-4567"
                        />
                    </div>
                    <div className="enroll-f">
                        <label>Email</label>
                        <input
                            type="email"
                            value={form.guardian_email_secondary}
                            onChange={(e) => set("guardian_email_secondary", e.target.value)}
                            placeholder="Optional"
                        />
                    </div>
                </div>
                <label className="enroll-check">
                    <input
                        type="checkbox"
                        checked={form.secondary_emergency}
                        onChange={(e) => set("secondary_emergency", e.target.checked)}
                    />
                    Emergency contact
                </label>

                <div className="enroll-dv" />
                </section>

                <section className="enroll-section" ref={setSectionRef(3)}>
                <div className="enroll-sl">Medical</div>
                <span className="enroll-cl">
                    Flag any of the following <span className="enroll-rq">*</span>
                </span>
                <div className="enroll-mg">
                    <button
                        type="button"
                        className={`enroll-mi ${form.medical_none ? "on" : ""}`}
                        onClick={pickMedicalNone}
                    >
                        <div className="enroll-ck" />
                        <span className="enroll-mt">None / No known issues</span>
                    </button>
                    {MEDICAL_FLAGS.map((flag) => (
                        <button
                            key={flag}
                            type="button"
                            className={`enroll-mi ${form.medical_flags.includes(flag) ? "on" : ""}`}
                            onClick={() => toggleMedicalFlag(flag)}
                        >
                            <div className="enroll-ck" />
                            <span className="enroll-mt">{flag}</span>
                        </button>
                    ))}
                </div>
                <div className={`enroll-cd ${showMedicalDetails ? "show" : ""}`}>
                    <div className="enroll-f">
                        <label>Please describe</label>
                        <textarea
                            value={form.medical_details}
                            onChange={(e) => set("medical_details", e.target.value)}
                            placeholder="Conditions, medications, devices, or restrictions Coach Rico should know about..."
                        />
                    </div>
                </div>

                <div className="enroll-dv" />
                <div className="enroll-sl">Additional</div>
                <span className="enroll-cl">How did you hear about EAT?</span>
                <div className="enroll-cr">
                    {REFERRALS.map((r) => (
                        <button
                            key={r}
                            type="button"
                            className={`enroll-ch ${form.referral_source === r ? "on" : ""}`}
                            onClick={() => set("referral_source", r)}
                        >
                            {r}
                        </button>
                    ))}
                </div>
                <div className="enroll-r enroll-c1">
                    <div className="enroll-f">
                        <label>Anything else we should know?</label>
                        <textarea
                            value={form.additional_notes}
                            onChange={(e) => set("additional_notes", e.target.value)}
                            placeholder="Training goals, schedule preferences, questions for Coach Rico..."
                        />
                    </div>
                </div>

                {error && <div className="enroll-err">{error}</div>}

                <button type="submit" className="enroll-sb" disabled={loading}>
                    {loading ? "Submitting…" : "Submit Enrollment"}
                </button>
                </section>
            </form>
        </div>
    );
}
