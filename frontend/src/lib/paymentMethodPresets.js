const STORAGE_KEY = "eat-payment-method-presets";

const DEFAULT_METHODS = ["Zelle"];

function readAll() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** Saved payment methods for the confirm-payment combobox. */
export function getPaymentMethodPresets() {
    const list = readAll();
    return list.length ? list : [...DEFAULT_METHODS];
}

/** Remember a payment method after it is used. */
export function addPaymentMethodPreset(method) {
    const trimmed = String(method || "").trim();
    if (!trimmed) return;

    const list = getPaymentMethodPresets();
    if (list.includes(trimmed)) return;

    writeAll([...list, trimmed].sort((a, b) => a.localeCompare(b)));
}
