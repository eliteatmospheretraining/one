// Status & attendance styling helpers — single source of truth for colors.

export const SESSION_STATUS_STYLES = {
    scheduled: { bg: "bg-zinc-100", text: "text-obsidian", border: "border-zinc-300", label: "Scheduled" },
    completed: { bg: "bg-obsidian", text: "text-white", border: "border-obsidian", label: "Completed" },
    cancelled: { bg: "bg-red-500", text: "text-white", border: "border-red-700", label: "Cancelled" },
    rescheduled: { bg: "bg-blue-500", text: "text-white", border: "border-blue-700", label: "Rescheduled" },
};

export const ATTENDANCE_STYLES = {
    full: { bg: "bg-obsidian", text: "text-white", border: "border-obsidian", label: "FULL" },
    half: { bg: "bg-zinc-500", text: "text-white", border: "border-zinc-700", label: "HALF" },
    drop_in_full: { bg: "bg-volt", text: "text-obsidian", border: "border-obsidian", label: "DI FULL" },
    drop_in_half: { bg: "bg-yellow-200", text: "text-obsidian", border: "border-obsidian", label: "DI HALF" },
    absent: { bg: "bg-red-500", text: "text-white", border: "border-red-700", label: "ABSENT" },
};

export const INVOICE_STATUS_STYLES = {
    draft: { bg: "bg-zinc-100", text: "text-zinc-600", border: "border-zinc-400", label: "Draft" },
    sent: { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-400", label: "Sent" },
    paid: { bg: "bg-volt", text: "text-obsidian", border: "border-obsidian", label: "Paid" },
};

export function athleteProgramTypes(athlete) {
    if (Array.isArray(athlete?.program_types) && athlete.program_types.length) {
        return athlete.program_types;
    }
    return athlete?.program_type ? [athlete.program_type] : [];
}

export function athleteHasProgram(athlete, program) {
    return athleteProgramTypes(athlete).includes(program);
}

export function formatAthletePrograms(athlete) {
    const types = athleteProgramTypes(athlete);
    if (!types.length) return "Not set";
    return types
        .map((p) => PROGRAM_LABEL[p] || p)
        .join(" · ");
}

export const PROGRAM_LABEL = {
    full_time: "Eat w/ EAT",
    private: "Private",
    semi_private: "Semi-Private",
};

export const RATE_TYPE_LABEL = {
    daily: "Daily",
    half_day: "Half-Day",
    monthly: "Monthly",
    per_session: "Per Session",
};

export const ATTENDANCE_TYPES = ["full", "half", "drop_in_full", "drop_in_half", "absent"];

/** Attendance types that count as showed up (not absent). */
export function isPresentAttendance(type) {
    return type && type !== "absent";
}

export function countPresentAttendance(records = []) {
    return records.filter((r) => isPresentAttendance(r.attendance_type)).length;
}

export function sessionPresentLabel(expectedCount, records = []) {
    const expected = expectedCount || 0;
    const present = countPresentAttendance(records);
    return `${present}/${expected} present`;
}

export function fmtMoney(v) {
    if (v == null) return "—";
    return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parse a money input string (with or without $) to a number, or null if empty/invalid. */
export function parseMoneyInput(value) {
    const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/** Restrict typing to a valid currency fragment (digits + optional cents). */
export function sanitizeMoneyTyping(value) {
    let t = String(value ?? "").replace(/[^\d.]/g, "");
    const dot = t.indexOf(".");
    if (dot !== -1) {
        t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
    }
    const [whole, frac] = t.split(".");
    if (frac != null && frac.length > 2) return `${whole}.${frac.slice(0, 2)}`;
    return t;
}

/** Format for display in a money input (no $ prefix). */
export function formatMoneyInputValue(value) {
    const n = parseMoneyInput(value);
    if (n == null) return "";
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function computeAge(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

export function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

export function weekStart(iso) {
    const d = new Date(iso + "T00:00:00");
    const day = d.getDay(); // 0 = Sun
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
}

/** Monday (ISO) of the week containing `iso`. */
export function mondayOfWeek(iso) {
    const d = new Date(iso + "T00:00:00");
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
}

export const REPEAT_FREQUENCIES = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
];

export const REPEAT_WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** Mon–Fri selected (index 0 = Sunday). */
export function defaultRepeatWeekdays(sessionType) {
    if (sessionType === "full_time") {
        return [false, true, true, true, true, true, false];
    }
    return [false, false, false, false, false, false, false];
}

function clampRepeatSpan(n) {
    return Math.max(1, Math.min(52, Number(n) || 1));
}

function clampRepeatInterval(n) {
    return Math.max(1, Math.min(30, Number(n) || 1));
}

/**
 * Build session dates from repeat settings (anchor = form date).
 * @param weekdays boolean[7], Sunday = index 0
 */
export function buildRecurringSessionDates({
    startIso,
    frequency,
    interval = 1,
    duration = 1,
    weekdays = defaultRepeatWeekdays("full_time"),
}) {
    if (!startIso) return [];

    const span = clampRepeatSpan(duration);
    const step = clampRepeatInterval(interval);
    const start = new Date(`${startIso}T00:00:00`);
    const out = [];
    const seen = new Set();

    const push = (iso) => {
        if (iso >= startIso && !seen.has(iso)) {
            seen.add(iso);
            out.push(iso);
        }
    };

    if (frequency === "daily") {
        const totalDays = span * 7;
        for (let i = 0; i < totalDays; i += step) {
            push(addDays(startIso, i));
        }
        return out.sort();
    }

    if (frequency === "weekly") {
        const selected = weekdays.some(Boolean);
        if (!selected) return [startIso];

        const week0 = mondayOfWeek(startIso);
        for (let w = 0; w < span; w += step) {
            for (let d = 0; d < 7; d += 1) {
                const iso = addDays(week0, w * 7 + d);
                const dow = new Date(`${iso}T00:00:00`).getDay();
                if (weekdays[dow]) push(iso);
            }
        }
        return out.sort();
    }

    if (frequency === "monthly") {
        for (let m = 0; m < span; m += step) {
            const d = new Date(start);
            d.setMonth(d.getMonth() + m);
            push(d.toISOString().slice(0, 10));
        }
        return out;
    }

    if (frequency === "yearly") {
        for (let y = 0; y < span; y += step) {
            const d = new Date(start);
            d.setFullYear(d.getFullYear() + y);
            push(d.toISOString().slice(0, 10));
        }
        return out;
    }

    return [startIso];
}

export function fmtDate(iso, opts = { month: "short", day: "numeric" }) {
    if (!iso) return "";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString("en-US", opts);
}

/** Friday (YYYY-MM-DD) of the Sun–Sat week that contains `iso`. */
export function fridayOfWeekContaining(iso) {
    if (!iso) return "";
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    const day = d.getDay();
    const daysUntilFriday = (5 - day + 7) % 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d.toISOString().slice(0, 10);
}

/** MM-DD-YYYY for invoices (period, issued, payment dates). */
export function fmtInvoiceDate(iso) {
    if (!iso) return "";
    const raw = String(iso).slice(0, 10);
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return raw;
    return `${m}-${d}-${y}`;
}

export const TIME_MINUTE_OPTIONS = [0, 15, 30, 45];

export function to12Hour(hour24) {
    const h = Number(hour24);
    const pm = h >= 12;
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour12, pm };
}

export function from12Hour(hour12, pm) {
    let hour24 = Number(hour12) % 12;
    if (pm) hour24 += 12;
    return hour24;
}

/** Snap minutes to 0, 15, 30, or 45 (nearest quarter). */
export function snapMinuteToQuarter(minute) {
    const m = Number(minute);
    if (Number.isNaN(m)) return 0;
    const rounded = Math.round(m / 15) * 15;
    return rounded >= 60 ? 0 : rounded;
}

/** Parse "HH:mm" (24h); minutes snap to 15-minute increments. */
export function parseTime24(value) {
    if (!value || !String(value).includes(":")) {
        return { hour24: 9, minute: 0 };
    }
    const [h, m] = String(value).split(":").map(Number);
    let hour24 = Number.isNaN(h) ? 9 : h;
    let minute = snapMinuteToQuarter(Number.isNaN(m) ? 0 : m);
    if (minute === 0 && Math.round((Number.isNaN(m) ? 0 : m) / 15) * 15 >= 60) {
        hour24 = (hour24 + 1) % 24;
    }
    return { hour24, minute };
}

export function formatTime24(hour24, minute) {
    return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Normalize any HH:mm to a 15-minute increment. */
export function snapTimeToQuarterHour(value) {
    if (!value) return value;
    const { hour24, minute } = parseTime24(value);
    return formatTime24(hour24, minute);
}

/**
 * Default session start: next full hour from now (8:42 → 09:00, 3:30 PM → 4:00 PM).
 */
export function nextHourStartFromNow() {
    const d = new Date();
    if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
        d.setHours(d.getHours() + 1);
    }
    d.setMinutes(0, 0, 0);
    return formatTime24(d.getHours(), 0);
}

/** Add hours to HH:mm, keeping 15-minute increments and same-day cap at 23:45. */
export function addHoursToTime24(value, hours) {
    const { hour24, minute } = parseTime24(value);
    let total = hour24 * 60 + minute + hours * 60;
    total = Math.max(0, Math.min(23 * 60 + 45, total));
    const h = Math.floor(total / 60);
    const m = snapMinuteToQuarter(total % 60);
    return formatTime24(h, m);
}

export function fmtTime(value) {
    if (!value) return "";
    const time = String(value).trim();
    if (!time.includes(":")) return time;
    if (/[ap]m$/i.test(time)) return time;

    const { hour24, minute } = parseTime24(time);
    const d = new Date();
    d.setHours(hour24, minute, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function fmtDay(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

export function fmtDayNum(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.getDate();
}

/** Format phone as user types: (555) 123-4567 or +1 (555) 123-4567 */
export function formatPhoneInput(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("1") && digits.length > 1) {
        const national = digits.slice(1, 11);
        if (national.length === 0) return "+1 ";
        if (national.length < 4) return `+1 (${national}`;
        if (national.length < 7) return `+1 (${national.slice(0, 3)}) ${national.slice(3)}`;
        return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    }

    const national = digits.slice(0, 10);
    if (national.length < 4) return national.length ? `(${national}` : "";
    if (national.length < 7) return `(${national.slice(0, 3)}) ${national.slice(3)}`;
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}
