// Status & attendance styling helpers — single source of truth for colors.

export const SESSION_STATUS_STYLES = {
    scheduled: { bg: "bg-zinc-100", text: "text-obsidian", border: "border-zinc-300", label: "Scheduled" },
    completed: { bg: "bg-obsidian", text: "text-white", border: "border-obsidian", label: "Completed" },
    cancelled: { bg: "bg-red-500", text: "text-white", border: "border-red-700", label: "Cancelled" },
    rescheduled: { bg: "bg-blue-500", text: "text-white", border: "border-blue-700", label: "Rescheduled" },
};

/** Business timezone for session schedule (Eastern). */
export const SESSION_TIME_ZONE = "America/New_York";

function estNowParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: SESSION_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(now);
    const pick = (type) => parts.find((p) => p.type === type)?.value ?? "";
    let hour = parseInt(pick("hour"), 10);
    if (hour === 24) hour = 0;
    return {
        year: parseInt(pick("year"), 10),
        month: parseInt(pick("month"), 10),
        day: parseInt(pick("day"), 10),
        hour,
        minute: parseInt(pick("minute"), 10),
    };
}

function ymdHmKey({ year, month, day, hour, minute }) {
    return year * 1e8 + month * 1e6 + day * 1e4 + hour * 100 + minute;
}

/** True when session date + end_time (wall clock in Eastern) is at or before now. */
export function sessionHasEndedInEst(session, now = new Date()) {
    if (!session?.date || !session?.end_time) return false;
    const [year, month, day] = session.date.split("-").map((n) => parseInt(n, 10));
    const [hour, minute] = session.end_time.slice(0, 5).split(":").map((n) => parseInt(n, 10));
    const endKey = ymdHmKey({ year, month, day, hour, minute });
    const nowKey = ymdHmKey(estNowParts(now));
    return nowKey >= endKey;
}

/** Display status: scheduled → completed once Eastern end time has passed. */
export function effectiveSessionStatus(session, now = new Date()) {
    const status = session?.status || "scheduled";
    if (status === "scheduled" && sessionHasEndedInEst(session, now)) {
        return "completed";
    }
    return status;
}

export const ATTENDANCE_STYLES = {
    present: { bg: "bg-obsidian", text: "text-white", border: "border-obsidian", label: "PRESENT" },
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

export const ATTENDANCE_CHIP_LABEL = {
    present: "Present",
    full: "Full",
    half: "Half",
    drop_in_full: "DI · Full",
    drop_in_half: "DI · Half",
    absent: "Absent",
};

/** Coach-facing chips for a session + athlete (Eat w/ EAT → Present | Absent). */
export function attendanceOptionsForAthlete(session, athlete) {
    if (session?.session_type === "full_time" && athleteHasProgram(athlete, "full_time")) {
        return ["present", "absent"];
    }
    if (session?.session_type === "full_time") {
        return ["drop_in_full", "drop_in_half", "absent"];
    }
    return ["present", "absent"];
}

/** Map stored attendance to UI chip (legacy full/half → present for full-time). */
export function uiAttendanceType(storedType, session, athlete) {
    if (!storedType || storedType === "absent") return "absent";
    if (session?.session_type === "full_time" && athleteHasProgram(athlete, "full_time")) {
        return "present";
    }
    if (session?.session_type !== "full_time" && (storedType === "full" || storedType === "half")) {
        return "present";
    }
    return storedType;
}

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

/** Training/home session card: client names for private & semi-private; present count for group sessions. */
export function sessionRosterPreviewLabel(session, { records = [], roster = [], athletesById = {} } = {}) {
    const type = session?.session_type;
    if (type === "private" || type === "semi_private") {
        const names = [];
        const seen = new Set();
        const add = (name) => {
            if (!name || seen.has(name)) return;
            seen.add(name);
            names.push(name);
        };
        if (roster.length) {
            roster.forEach((row) => add(row.athlete?.full_name));
        } else {
            (session?.athlete_ids || []).forEach((id) => add(athletesById[id]?.full_name));
        }
        return names.join(", ");
    }
    return sessionPresentLabel((session?.athlete_ids || []).length, records);
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
    return toLocalISO(new Date());
}

/** YYYY-MM-DD in local calendar (avoids UTC shift from toISOString). */
export function toLocalISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function parseLocalISO(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
    const d = parseLocalISO(iso);
    d.setDate(d.getDate() + n);
    return toLocalISO(d);
}

export function weekStart(iso) {
    const d = parseLocalISO(iso);
    const day = d.getDay(); // 0 = Sun
    d.setDate(d.getDate() - day);
    return toLocalISO(d);
}

/** Monday (ISO) of the week containing `iso`. */
export function mondayOfWeek(iso) {
    const d = parseLocalISO(iso);
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return toLocalISO(d);
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
                const dow = parseLocalISO(iso).getDay();
                if (weekdays[dow]) push(iso);
            }
        }
        return out.sort();
    }

    if (frequency === "monthly") {
        for (let m = 0; m < span; m += step) {
            const d = parseLocalISO(startIso);
            d.setMonth(d.getMonth() + m);
            push(toLocalISO(d));
        }
        return out;
    }

    if (frequency === "yearly") {
        for (let y = 0; y < span; y += step) {
            const d = parseLocalISO(startIso);
            d.setFullYear(d.getFullYear() + y);
            push(toLocalISO(d));
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
 * Default session start: next full hour from now in Eastern (8:42 → 09:00, 12:08 PM → 1:00 PM).
 */
export function nextHourStartFromNow(now = new Date()) {
    const parts = estNowParts(now);
    let hour = parts.hour;
    if (parts.minute > 0) {
        hour = (hour + 1) % 24;
    }
    return formatTime24(hour, 0);
}

/** Settings password row — Eastern date + 12-hour time. */
export function fmtPasswordUpdated(iso) {
    if (!iso) return "Last updated never";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Last updated never";
    const date = d.toLocaleDateString("en-US", {
        timeZone: SESSION_TIME_ZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    const time = d.toLocaleTimeString("en-US", {
        timeZone: SESSION_TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
    return `Last updated ${date} at ${time}`;
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
