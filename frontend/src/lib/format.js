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

export const PROGRAM_LABEL = {
    full_time: "Full-Time",
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

export function fmtMoney(v) {
    if (v == null) return "—";
    return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export function fmtDate(iso, opts = { month: "short", day: "numeric" }) {
    if (!iso) return "";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString("en-US", opts);
}

export function fmtTime(value) {
    if (!value) return "";
    const time = String(value).trim();
    if (!time.includes(":")) return time;
    if (/[ap]m$/i.test(time)) return time;

    const [hourPart, minutePart] = time.split(":");
    const hour = Number(hourPart);
    const minute = Number(minutePart);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return time;

    const d = new Date();
    d.setHours(hour, minute, 0, 0);
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
