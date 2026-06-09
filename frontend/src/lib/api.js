import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "eat_jwt";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
    const t = getToken();
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        if (err.response?.status === 401) {
            clearToken();
            const path = window.location.pathname;
            if (!path.startsWith("/login") && !path.startsWith("/enroll") && !path.startsWith("/invoice")) {
                window.location.href = "/login";
            }
        }
        return Promise.reject(err);
    }
);

/** Open enrollment + waiver PDF for a coach-authenticated athlete record. */
export async function openEnrollmentPdf(athleteId) {
    const res = await api.get(`/athletes/${athleteId}/enrollment-pdf`, { responseType: "blob" });
    const blob = res.data;
    if (blob?.type?.includes("json")) {
        const text = await blob.text();
        let detail = "Could not open enrollment forms";
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
            /* ignore */
        }
        throw new Error(detail);
    }
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
        URL.revokeObjectURL(url);
        throw new Error("Pop-up blocked — allow pop-ups to view the forms.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Fetch invoice/receipt PDF bytes for in-app preview. */
export async function fetchInvoicePdfBlob(invoiceId) {
    const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: "blob" });
    const blob = res.data;
    if (blob?.type?.includes("json")) {
        const text = await blob.text();
        let detail = "Could not load invoice PDF";
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
            /* ignore */
        }
        throw new Error(detail);
    }
    return blob;
}

/** Fetch guardian invoice/receipt email HTML for in-app preview. */
export async function fetchInvoiceEmailPreviewHtml(invoiceId, kind = "paid") {
    const res = await api.get(`/invoices/${invoiceId}/email-preview`, {
        params: { kind },
        responseType: "text",
    });
    return res.data;
}

/** Open invoice PDF in a new browser tab. */
export async function openInvoicePdf(invoiceId) {
    const blob = await fetchInvoicePdfBlob(invoiceId);
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
        URL.revokeObjectURL(url);
        throw new Error("Pop-up blocked — allow pop-ups to view the PDF.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Human-readable message from a FastAPI / axios error. */
export function formatApiError(err) {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg || JSON.stringify(item)).filter(Boolean).join("; ");
    }
    if (err?.message) return err.message;
    return null;
}
