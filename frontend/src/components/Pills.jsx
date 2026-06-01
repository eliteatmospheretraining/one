import React from "react";
import { INVOICE_STATUS_STYLES, SESSION_STATUS_STYLES, ATTENDANCE_STYLES } from "../lib/format";

export function SessionStatusPill({ status }) {
    const s = SESSION_STATUS_STYLES[status] || SESSION_STATUS_STYLES.scheduled;
    return <span className={`eat-pill ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}

export function InvoiceStatusPill({ status, testId }) {
    const s = INVOICE_STATUS_STYLES[status] || INVOICE_STATUS_STYLES.draft;
    return <span data-testid={testId} className={`eat-pill ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}

export function AttendanceLabel({ type }) {
    const s = ATTENDANCE_STYLES[type];
    if (!s) return null;
    return <span className={`eat-pill ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}
