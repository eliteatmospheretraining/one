import { todayISO, weekStart } from "./format";

const WEEK_KEY = "eat.calendar.week";
const DAY_KEY = "eat.calendar.day";

function navigationType() {
    if (typeof performance === "undefined") return "navigate";
    return performance.getEntriesByType?.("navigation")?.[0]?.type || "navigate";
}

/** Full page reload should reset the training calendar to today. */
export function clearCalendarNavStateIfReload() {
    if (navigationType() === "reload") {
        sessionStorage.removeItem(WEEK_KEY);
        sessionStorage.removeItem(DAY_KEY);
    }
}

export function readCalendarNavState() {
    const today = todayISO();
    const fallback = { weekAnchor: weekStart(today), selected: today };

    if (typeof sessionStorage === "undefined") return fallback;

    const weekAnchor = sessionStorage.getItem(WEEK_KEY);
    const selected = sessionStorage.getItem(DAY_KEY);
    if (!weekAnchor && !selected) return fallback;

    const anchor = weekAnchor || weekStart(selected || today);
    const day = selected || anchor;
    return { weekAnchor: anchor, selected: day };
}

export function saveCalendarNavState(weekAnchor, selected) {
    if (typeof sessionStorage === "undefined") return;
    if (weekAnchor) sessionStorage.setItem(WEEK_KEY, weekAnchor);
    if (selected) sessionStorage.setItem(DAY_KEY, selected);
}
