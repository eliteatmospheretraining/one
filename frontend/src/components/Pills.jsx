import React, { useEffect, useState } from "react";
import { effectiveSessionStatus } from "../lib/format";

const SESSION_STATUS = {
    scheduled: { cls: "eat-badge-outline", label: "Scheduled" },
    completed: { cls: "eat-badge-accent", label: "Complete" },
    cancelled: { cls: "eat-badge-muted", label: "Cancelled" },
    rescheduled: { cls: "eat-badge-paper", label: "Rescheduled" },
};

const INVOICE_STATUS = {
    draft: { cls: "eat-badge-outline", label: "Draft" },
    sent: { cls: "eat-badge-paper", label: "Sent" },
    paid: { cls: "eat-badge-accent", label: "Paid" },
};

const ATTENDANCE_BADGE = {
    present: { cls: "eat-badge-accent", label: "Present" },
    full: { cls: "eat-badge-accent", label: "Full" },
    half: { cls: "eat-badge-paper", label: "Half" },
    drop_in_full: { cls: "eat-badge-accent", label: "DI · Full" },
    drop_in_half: { cls: "eat-badge-paper", label: "DI · Half" },
    absent: { cls: "eat-badge-danger", label: "Absent" },
};

export function SessionStatusPill({ status, session }) {
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => tick((n) => n + 1), 60_000);
        return () => clearInterval(id);
    }, []);

    const resolved = session ? effectiveSessionStatus(session) : status;
    const s = SESSION_STATUS[resolved] || SESSION_STATUS.scheduled;
    return <span className={s.cls}>{s.label}</span>;
}

export function InvoiceStatusPill({ status, testId }) {
    const s = INVOICE_STATUS[status] || INVOICE_STATUS.draft;
    return <span data-testid={testId} className={s.cls}>{s.label}</span>;
}

export function AttendanceLabel({ type }) {
    const s = ATTENDANCE_BADGE[type];
    if (!s) return null;
    return <span className={s.cls}>{s.label}</span>;
}
