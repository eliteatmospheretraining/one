const STORAGE_KEY = "eat-location-presets";

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

function writeAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Saved location strings for a program type (full_time, private, semi_private). */
export function getLocationPresets(sessionType) {
    if (!sessionType) return [];
    const all = readAll();
    return Array.isArray(all[sessionType]) ? all[sessionType] : [];
}

/** Remember a location for future picks under this program type. */
export function addLocationPreset(sessionType, location) {
    const trimmed = String(location || "").trim();
    if (!sessionType || !trimmed) return;

    const all = readAll();
    const list = getLocationPresets(sessionType);
    if (list.includes(trimmed)) return;

    all[sessionType] = [...list, trimmed].sort((a, b) => a.localeCompare(b));
    writeAll(all);
}

/** Merge locations already used on sessions (e.g. from API) into presets. */
export function mergeLocationPresetsFromSessions(sessions = []) {
    const all = readAll();
    let changed = false;

    for (const s of sessions) {
        const trimmed = String(s.location || "").trim();
        if (!trimmed || !s.session_type) continue;
        const list = all[s.session_type] || [];
        if (!list.includes(trimmed)) {
            all[s.session_type] = [...list, trimmed];
            changed = true;
        }
    }

    if (changed) {
        for (const type of Object.keys(all)) {
            all[type].sort((a, b) => a.localeCompare(b));
        }
        writeAll(all);
    }
}
