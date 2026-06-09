import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { API, formatApiError } from "../lib/api";
import { BRAND_LOGO_BLACK, BRAND_NAME } from "../constants/brand";
import "./Enroll.css";

const SECTION_COUNT = 6;

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
const EC_RELATIONSHIPS = ["Parent", "Caregiver", "Relative", "Sibling", "Friend", "Guardian"];
const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const blankForm = () => ({
    full_name: "",
    date_of_birth: "",
    school: "",
    grade: "",
    shirt_size: "",
    program_type: "",
    utr: "",
    wtn: "",
    goals: [],
    guardian_name: "",
    guardian_relationship: "",
    guardian_phone: "",
    guardian_email: "",
    street_address: "",
    city_state_zip: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
    emergency_contact_email: "",
    medical_none: false,
    medical_flags: [],
    medical_details: "",
    referral_source: "",
    referral_detail: "",
    additional_notes: "",
});

function calcAge(dobVal) {
    if (!dobVal) return null;
    const today = new Date();
    const birth = new Date(dobVal);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
    return age;
}

function isSectionComplete(form, sectionIdx) {
    switch (sectionIdx) {
        case 0:
            return !!(
                form.full_name.trim() &&
                form.date_of_birth &&
                form.shirt_size &&
                form.program_type
            );
        case 1:
            if (!isSectionComplete(form, 0)) return false;
            if (form.goals.length > 0 || form.utr.trim() || form.wtn.trim()) return true;
            return !!(
                form.guardian_name.trim() ||
                form.guardian_phone.trim() ||
                form.guardian_email.trim()
            );
        case 2:
            return !!(
                form.guardian_name.trim() &&
                form.guardian_phone.trim() &&
                form.guardian_email.trim()
            );
        case 3:
            return !!(form.emergency_contact_name.trim() && form.emergency_contact_phone.trim());
        case 4:
            return form.medical_none || form.medical_flags.length > 0;
        case 5:
            if (!isSectionComplete(form, 4)) return false;
            return !!(form.referral_source || form.additional_notes.trim());
        default:
            return false;
    }
}

function completedSectionCount(form) {
    let count = 0;
    for (let i = 0; i < SECTION_COUNT; i++) {
        if (!isSectionComplete(form, i)) break;
        count += 1;
    }
    return count;
}

function EnrollHeader({ title, children, logoOnly = false }) {
    return (
        <div className="ew-top">
            <div className={`ew-title-row${logoOnly ? " ew-title-row--end" : ""}`}>
                {title}
                <img src={BRAND_LOGO_BLACK} alt={BRAND_NAME} className="ew-brand-logo" />
            </div>
            {children}
        </div>
    );
}

function ProgressBar({ filled, total }) {
    return (
        <div className="prog-wrap" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
                <div key={i} className={`ps${i < filled ? " on" : ""}${i === filled ? " active" : ""}`} />
            ))}
        </div>
    );
}

function useShake() {
    const [shaking, setShaking] = useState(false);
    const shake = useCallback(() => {
        setShaking(true);
        window.setTimeout(() => setShaking(false), 160);
    }, []);
    return [shaking, shake];
}

function SignaturePad({ canvasRef, onDraw }) {
    const drawing = useRef(false);
    const last = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(rect.width, 300);
        canvas.height = 90;
        const ctx = canvas.getContext("2d");
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        function pos(e) {
            const r = canvas.getBoundingClientRect();
            const sx = canvas.width / r.width;
            const sy = canvas.height / r.height;
            if (e.touches) {
                return {
                    x: (e.touches[0].clientX - r.left) * sx,
                    y: (e.touches[0].clientY - r.top) * sy,
                };
            }
            return {
                x: (e.clientX - r.left) * sx,
                y: (e.clientY - r.top) * sy,
            };
        }

        function start(e) {
            if (e.cancelable) e.preventDefault();
            drawing.current = true;
            const p = pos(e);
            last.current = p;
            onDraw(true);
        }

        function move(e) {
            if (!drawing.current) return;
            if (e.cancelable) e.preventDefault();
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
        }

        function end() {
            drawing.current = false;
        }

        canvas.addEventListener("mousedown", start);
        canvas.addEventListener("mousemove", move);
        canvas.addEventListener("mouseup", end);
        canvas.addEventListener("mouseleave", end);
        canvas.addEventListener("touchstart", start, { passive: false });
        canvas.addEventListener("touchmove", move, { passive: false });
        canvas.addEventListener("touchend", end);

        return () => {
            canvas.removeEventListener("mousedown", start);
            canvas.removeEventListener("mousemove", move);
            canvas.removeEventListener("mouseup", end);
            canvas.removeEventListener("mouseleave", end);
            canvas.removeEventListener("touchstart", start);
            canvas.removeEventListener("touchmove", move);
            canvas.removeEventListener("touchend", end);
        };
    }, [canvasRef, onDraw]);

    return null;
}

export default function Enroll() {
    const [phase, setPhase] = useState("enroll");
    const [form, setForm] = useState(blankForm);
    const [photoRelease, setPhotoRelease] = useState(null);
    const [typedSig, setTypedSig] = useState("");
    const [hasSig, setHasSig] = useState(false);
    const [submitted, setSubmitted] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [enrollShake, shakeEnroll] = useShake();
    const [waiverShake, shakeWaiver] = useShake();
    const canvasRef = useRef(null);
    const waiverTopRef = useRef(null);

    const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    const age = calcAge(form.date_of_birth);
    const isAdult = age !== null && age >= 18;

    useEffect(() => {
        if (phase !== "waiver" && phase !== "thanks") return;
        document.activeElement?.blur?.();
        window.scrollTo(0, 0);
        const id = window.requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            waiverTopRef.current?.scrollIntoView({ block: "start" });
        });
        return () => window.cancelAnimationFrame(id);
    }, [phase]);

    function toggleGoal(goal) {
        setForm((f) => ({
            ...f,
            goals: f.goals.includes(goal) ? f.goals.filter((g) => g !== goal) : [...f.goals, goal],
        }));
    }

    function pickMedicalNone() {
        setForm((f) => {
            if (f.medical_none) {
                return { ...f, medical_none: false, medical_flags: [] };
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

    function pickReferral(source) {
        setForm((f) => ({
            ...f,
            referral_source: source,
            referral_detail: source === "Referral" ? f.referral_detail : "",
        }));
    }

    function validateEnroll() {
        const minor = age === null || age < 18;
        if (
            !form.full_name.trim() ||
            !form.date_of_birth ||
            !form.shirt_size ||
            !form.program_type ||
            !form.emergency_contact_name.trim() ||
            !form.emergency_contact_phone.trim()
        ) {
            shakeEnroll();
            return false;
        }
        if (
            (minor || isAdult) &&
            (!form.guardian_name.trim() || !form.guardian_phone.trim() || !form.guardian_email.trim())
        ) {
            shakeEnroll();
            return false;
        }
        return true;
    }

    function continueToWaiver() {
        setError(null);
        if (!validateEnroll()) return;
        setTypedSig(form.guardian_name.trim() || form.full_name.trim());
        setHasSig(false);
        setPhotoRelease(null);
        document.activeElement?.blur?.();
        setPhase("waiver");
    }

    function clearSig() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        setHasSig(false);
    }

    function contactEmail() {
        return form.guardian_email.trim() || form.emergency_contact_email.trim() || null;
    }

    async function submitWaiver() {
        setError(null);
        if (!photoRelease || !typedSig.trim() || !hasSig) {
            shakeWaiver();
            return;
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
            guardian_name: form.guardian_name.trim() || null,
            guardian_relationship: form.guardian_relationship || null,
            guardian_phone: form.guardian_phone.trim() || null,
            guardian_email: contactEmail(),
            street_address: form.street_address.trim() || null,
            city_state_zip: form.city_state_zip.trim() || null,
            emergency_contact_name: form.emergency_contact_name.trim(),
            emergency_contact_relationship: form.emergency_contact_relationship || null,
            emergency_contact_phone: form.emergency_contact_phone.trim(),
            emergency_contact_email: form.emergency_contact_email.trim() || null,
            medical_none: form.medical_none || form.medical_flags.length === 0,
            medical_flags: form.medical_flags,
            medical_details: form.medical_details.trim() || null,
            referral_source: form.referral_source || null,
            referral_detail:
                form.referral_source === "Referral" ? form.referral_detail.trim() || null : null,
            additional_notes: form.additional_notes.trim() || null,
            photo_release: photoRelease === "yes",
            waiver_typed_signature: typedSig.trim(),
            waiver_signature: canvasRef.current?.toDataURL("image/png") || "",
        };

        setLoading(true);
        try {
            const r = await axios.post(`${API}/enroll`, payload);
            setSubmitted(r.data);
            setPhase("thanks");
        } catch (err) {
            setError(formatApiError(err) || "Could not submit enrollment");
        } finally {
            setLoading(false);
        }
    }

    const sectionLabels = useMemo(
        () => [
            "Athlete",
            "Tennis Background",
            isAdult ? "Contact" : "Guardian",
            "Emergency Contact",
            "Medical",
            "Additional",
        ],
        [isAdult]
    );
    const sectionsDone = completedSectionCount(form);
    const activeSection = Math.min(sectionsDone, SECTION_COUNT - 1);
    const phaseLabel =
        phase === "enroll"
            ? sectionLabels[activeSection]
            : phase === "waiver"
              ? "Waiver"
              : "Complete";
    const progFilled =
        phase === "enroll" ? sectionsDone : phase === "waiver" || phase === "thanks" ? SECTION_COUNT : 0;

    if (phase === "thanks" && submitted) {
        const email =
            submitted.guardian_email || form.guardian_email || form.emergency_contact_email || "your email";
        return (
            <div className="enroll-page">
                <EnrollHeader logoOnly />
                <div className="ty-wrap">
                    <div className="ty-ey">You&apos;re all set.</div>
                    <div className="ty-h">
                        Welcome to
                        <br />
                        the <span>team.</span>
                    </div>
                    <div className="ty-rule" />
                    <div className="ty-b">
                        Enrollment and waiver received for{" "}
                        <strong>{submitted.athlete_name || form.full_name || "your athlete"}</strong>.
                        <br />
                        <br />A copy of the signed waiver will be sent to <strong>{email}</strong>. Coach Rico will be
                        in touch to confirm your program and first session.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="enroll-page">
            <EnrollHeader
                title={
                    <div className="ew-title">
                        Enroll<span>.</span>
                    </div>
                }
            >
                <div className="ew-sub">Complete all required fields. We will confirm your program and start date.</div>
                <ProgressBar filled={progFilled} total={SECTION_COUNT} />
                <div className="phase-lbl">{phaseLabel}</div>
            </EnrollHeader>

            {phase === "enroll" && (
                <div className={`enroll-body${enrollShake ? " shake" : ""}`}>
                    <section className="enroll-section">
                    <div className="sec-lbl">Athlete</div>
                    <div className="row col2">
                        <div className="field">
                            <label>
                                Full Name <span className="req">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.full_name}
                                onChange={(e) => set("full_name", e.target.value)}
                                placeholder="First Last"
                            />
                        </div>
                        <div className="field">
                            <label>
                                Date of Birth <span className="req">*</span>
                            </label>
                            <input
                                type="date"
                                value={form.date_of_birth}
                                onChange={(e) => set("date_of_birth", e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="row col3">
                        <div className="field">
                            <label>School</label>
                            <input
                                type="text"
                                value={form.school}
                                onChange={(e) => set("school", e.target.value)}
                                placeholder="School name"
                            />
                        </div>
                        <div className="field">
                            <label>Grade</label>
                            <input
                                type="text"
                                value={form.grade}
                                onChange={(e) => set("grade", e.target.value)}
                                placeholder="e.g. 9th"
                            />
                        </div>
                        <div className="field">
                            <label>
                                T-Shirt <span className="req">*</span>
                            </label>
                            <select
                                value={form.shirt_size}
                                onChange={(e) => set("shirt_size", e.target.value)}
                            >
                                <option value="">—</option>
                                {SHIRT_SIZES.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <span className="chip-lbl">
                        Program of Interest <span className="req">*</span>
                    </span>
                    <div className="chips">
                        {PROGRAMS.map((p) => (
                            <button
                                key={p.value}
                                type="button"
                                className={`chip${form.program_type === p.value ? " on" : ""}`}
                                onClick={() => set("program_type", p.value)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    </section>

                    <section className="enroll-section">
                    <div className="sec-lbl">Tennis Background</div>
                    <div className="row col2">
                        <div className="field">
                            <label>UTR Rating</label>
                            <input
                                type="text"
                                value={form.utr}
                                onChange={(e) => set("utr", e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="field">
                            <label>WTN Rating</label>
                            <input
                                type="text"
                                value={form.wtn}
                                onChange={(e) => set("wtn", e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    <span className="chip-lbl">Primary Goal(s)</span>
                    <div className="chips">
                        {GOALS.map((g) => (
                            <button
                                key={g}
                                type="button"
                                className={`chip${form.goals.includes(g) ? " on" : ""}`}
                                onClick={() => toggleGoal(g)}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                    </section>

                    <section className="enroll-section">
                    <div className="sec-lbl">{isAdult ? "Contact" : "Guardian"}</div>
                    <div className="row col2">
                        <div className="field">
                            <label>
                                Name <span className="req">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.guardian_name}
                                onChange={(e) => set("guardian_name", e.target.value)}
                                placeholder="Full name"
                            />
                        </div>
                        {!isAdult && (
                            <div className="field">
                                <label>Relationship</label>
                                <select
                                    value={form.guardian_relationship}
                                    onChange={(e) => set("guardian_relationship", e.target.value)}
                                >
                                    <option value="">—</option>
                                    {RELATIONSHIPS.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {isAdult && (
                            <div className="field">
                                <label>
                                    Phone <span className="req">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={form.guardian_phone}
                                    onChange={(e) => set("guardian_phone", e.target.value)}
                                    placeholder="(555) 123-4567"
                                />
                            </div>
                        )}
                    </div>
                    {!isAdult && (
                        <div className="row col2">
                            <div className="field">
                                <label>
                                    Phone <span className="req">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={form.guardian_phone}
                                    onChange={(e) => set("guardian_phone", e.target.value)}
                                    placeholder="(555) 123-4567"
                                />
                            </div>
                            <div className="field">
                                <label>
                                    Email <span className="req">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={form.guardian_email}
                                    onChange={(e) => set("guardian_email", e.target.value)}
                                    placeholder="Invoices sent here"
                                />
                            </div>
                        </div>
                    )}
                    {!isAdult && (
                        <div className="row col2">
                            <div className="field">
                                <label>Street Address</label>
                                <input
                                    type="text"
                                    value={form.street_address}
                                    onChange={(e) => set("street_address", e.target.value)}
                                    placeholder="123 Main St"
                                />
                            </div>
                            <div className="field">
                                <label>City / State / Zip</label>
                                <input
                                    type="text"
                                    value={form.city_state_zip}
                                    onChange={(e) => set("city_state_zip", e.target.value)}
                                    placeholder="Miami, FL 33131"
                                />
                            </div>
                        </div>
                    )}
                    {isAdult && (
                        <>
                            <div className="row col2">
                                <div className="field">
                                    <label>
                                        Email <span className="req">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={form.guardian_email}
                                        onChange={(e) => set("guardian_email", e.target.value)}
                                        placeholder="Invoices sent here"
                                    />
                                </div>
                                <div className="field">
                                    <label>Street Address</label>
                                    <input
                                        type="text"
                                        value={form.street_address}
                                        onChange={(e) => set("street_address", e.target.value)}
                                        placeholder="123 Main St"
                                    />
                                </div>
                            </div>
                            <div className="row col1">
                                <div className="field">
                                    <label>City / State / Zip</label>
                                    <input
                                        type="text"
                                        value={form.city_state_zip}
                                        onChange={(e) => set("city_state_zip", e.target.value)}
                                        placeholder="Miami, FL 33131"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    </section>

                    <section className="enroll-section">
                    <div className="sec-lbl">Emergency Contact</div>
                    <div className="row col2">
                        <div className="field">
                            <label>
                                Name <span className="req">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.emergency_contact_name}
                                onChange={(e) => set("emergency_contact_name", e.target.value)}
                                placeholder="Full name"
                            />
                        </div>
                        <div className="field">
                            <label>Relationship</label>
                            <select
                                value={form.emergency_contact_relationship}
                                onChange={(e) => set("emergency_contact_relationship", e.target.value)}
                            >
                                <option value="">—</option>
                                {EC_RELATIONSHIPS.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="row col2">
                        <div className="field">
                            <label>
                                Phone <span className="req">*</span>
                            </label>
                            <input
                                type="tel"
                                value={form.emergency_contact_phone}
                                onChange={(e) => set("emergency_contact_phone", e.target.value)}
                                placeholder="(555) 123-4567"
                            />
                        </div>
                        <div className="field">
                            <label>Email</label>
                            <input
                                type="email"
                                value={form.emergency_contact_email}
                                onChange={(e) => set("emergency_contact_email", e.target.value)}
                                placeholder="Optional"
                            />
                        </div>
                    </div>
                    </section>

                    <section className="enroll-section">
                    <div className="sec-lbl">Medical</div>
                    <span className="chip-lbl">
                        Flag any of the following <span className="req">*</span>
                    </span>
                    <div className="med-grid">
                        <button type="button" className={`mi${form.medical_none ? " on" : ""}`} onClick={pickMedicalNone}>
                            <div className="ck" />
                            <span className="mt">None / No known issues</span>
                        </button>
                        {MEDICAL_FLAGS.map((flag) => (
                            <button
                                key={flag}
                                type="button"
                                className={`mi${form.medical_flags.includes(flag) ? " on" : ""}`}
                                onClick={() => toggleMedicalFlag(flag)}
                            >
                                <div className="ck" />
                                <span className="mt">{flag}</span>
                            </button>
                        ))}
                    </div>
                    <div className={`cond${showMedicalDetails ? " show" : ""}`}>
                        <div className="field">
                            <label>Please describe</label>
                            <textarea
                                value={form.medical_details}
                                onChange={(e) => set("medical_details", e.target.value)}
                                placeholder="Conditions, medications, devices, or restrictions..."
                            />
                        </div>
                    </div>
                    </section>

                    <section className="enroll-section">
                    <div className="sec-lbl">Additional</div>
                    <span className="chip-lbl">How did you hear about EAT?</span>
                    <div className="chips">
                        {REFERRALS.map((r) => (
                            <button
                                key={r}
                                type="button"
                                className={`chip${form.referral_source === r ? " on" : ""}`}
                                onClick={() => pickReferral(r)}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    {form.referral_source === "Referral" && (
                        <div className="row col1">
                            <div className="field">
                                <label>Who referred you?</label>
                                <input
                                    type="text"
                                    value={form.referral_detail}
                                    onChange={(e) => set("referral_detail", e.target.value)}
                                    placeholder="Name of referrer"
                                />
                            </div>
                        </div>
                    )}
                    <div className="row col1">
                        <div className="field">
                            <label>Anything else?</label>
                            <textarea
                                value={form.additional_notes}
                                onChange={(e) => set("additional_notes", e.target.value)}
                                placeholder="Training goals, schedule preferences, questions for Coach Rico..."
                            />
                        </div>
                    </div>
                    </section>

                    <div className="actions">
                        <div />
                        <button type="button" className="btn-next" onClick={continueToWaiver}>
                            Continue to Waiver →
                        </button>
                    </div>
                </div>
            )}

            {phase === "waiver" && (
                <div className={`enroll-body${waiverShake ? " shake" : ""}`} ref={waiverTopRef}>
                    <div className="prefill-tag">{(form.full_name || "Athlete").toUpperCase()}</div>
                    <div className="prefill-sub">
                        Completing waiver for {form.full_name || "your athlete"}
                        {form.guardian_name
                            ? ` · ${isAdult ? "Contact" : "Guardian"}: ${form.guardian_name}`
                            : ""}
                    </div>

                    <div className="waiver-txt">
                        <strong>Assumption of Risk.</strong> I am aware that participating in tennis and athletics
                        activities involves inherent risks including physical injury, accidents, and property damage. I
                        voluntarily assume all risks and release Elite Atmosphere Training, its coaches, staff, and
                        affiliates from any liability for injuries or damages during participation.
                        <br />
                        <br />
                        <strong>Medical Consent.</strong> I certify the participant is physically fit to participate. In
                        an emergency, I authorize EAT staff to seek medical treatment and agree to be responsible for
                        associated medical expenses.
                        <br />
                        <br />
                        <strong>Code of Conduct.</strong> I agree to abide by all rules and instructions provided by EAT
                        staff. Violation may result in dismissal without refund.
                        <br />
                        <br />
                        <strong>Personal Property.</strong> EAT is not liable for loss, theft, or damage to personal
                        property on premises.
                        <br />
                        <br />
                        <strong>Photo Release.</strong> EAT may photograph or record the participant for promotional
                        use including social media and marketing. First names may be used; full names will not be
                        shared publicly without separate consent. I waive approval and compensation rights for these
                        materials.
                    </div>

                    <div className="sec-lbl">Photo Release</div>
                    <div>
                        <button type="button" className="radio-row" onClick={() => setPhotoRelease("yes")}>
                            <div className={`rb${photoRelease === "yes" ? " on" : ""}`} />
                            <div className="rt">
                                <strong>Yes</strong> — I authorize EAT to photograph or record my athlete for
                                promotional purposes.
                            </div>
                        </button>
                        <button type="button" className="radio-row" onClick={() => setPhotoRelease("no")}>
                            <div className={`rb${photoRelease === "no" ? " on" : ""}`} />
                            <div className="rt">
                                <strong>No</strong> — I do not authorize photography or recording of my athlete.
                            </div>
                        </button>
                    </div>

                    <div className="sec-lbl">Confirm Your Name</div>
                    <div className="field" style={{ marginBottom: 14 }}>
                        <input
                            type="text"
                            value={typedSig}
                            onChange={(e) => setTypedSig(e.target.value)}
                            placeholder="Type full name"
                            autoComplete="off"
                        />
                    </div>

                    <div className="sec-lbl">Draw Your Signature</div>
                    <div className="sig-wrap">
                        <canvas ref={canvasRef} />
                        <SignaturePad canvasRef={canvasRef} onDraw={setHasSig} />
                        <button type="button" className="sig-clr" onClick={clearSig}>
                            Clear
                        </button>
                    </div>

                    {error && <div className="enroll-err">{error}</div>}

                    <div className="actions">
                        <button type="button" className="btn-back" onClick={() => setPhase("enroll")}>
                            ← Back
                        </button>
                        <button type="button" className="btn-next" onClick={submitWaiver} disabled={loading}>
                            {loading ? "Submitting…" : "Submit →"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
