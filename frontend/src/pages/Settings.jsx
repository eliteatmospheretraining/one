import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { useAuth } from "../lib/auth";
import { fmtMoney, fmtPasswordUpdated } from "../lib/format";
import { SETTINGS } from "../lib/testIds";
import {
    BookOpen,
    Calendar,
    ChevronRight,
    Loader2,
    Lock,
} from "lucide-react";
import { toast } from "sonner";

function fmtRateValue(key, value) {
    if (value == null) return "—";
    if (key.endsWith("_hours")) return `${Number(value)} hr`;
    return fmtMoney(value);
}

const HIDDEN_RATE_CARD_KEYS = new Set(["full_day_hours", "half_day_hours"]);

const RATE_GRID_SERVICES = [
    { key: "monthly", label: "Eat w/ EAT · Monthly" },
    { key: "weekly", label: "Eat w/ EAT · Weekly" },
    { key: "full_day", label: "Eat w/ EAT · Daily" },
    { key: "half_day", label: "Eat w/ EAT · Half-Day" },
    { key: "drop_in_full", label: "Eat w/ EAT · Drop-In Full" },
    { key: "drop_in_half", label: "Eat w/ EAT · Drop-In Half" },
    { key: "private", label: "Private Lesson" },
    { key: "semi_private", label: "Semi-Private Lesson" },
    { key: "travel", label: "Athlete Travel" },
];

const RATE_LABEL_BY_KEY = Object.fromEntries(RATE_GRID_SERVICES.map(({ key, label }) => [key, label]));

function initials(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatNotionSync(iso) {
    if (!iso) return "Never synced";
    return `Last synced ${new Date(iso).toLocaleString()}`;
}

function latestNotionSync(rateStatus, rosterStatus) {
    const times = [rateStatus?.synced_at, rosterStatus?.synced_at].filter(Boolean);
    if (!times.length) return null;
    return times.sort().reverse()[0];
}

function SectionLabel({ children }) {
    return (
        <h2
            className="text-[10px] uppercase tracking-[0.16em] text-muted mb-3"
            style={{ fontWeight: 300 }}
        >
            {children}
        </h2>
    );
}

function Panel({ children, className = "" }) {
    return (
        <div
            className={`w-full rounded-[12px] border-[0.5px] border-subtle bg-ink overflow-hidden ${className}`}
        >
            {children}
        </div>
    );
}

function DividerRow({ children, last = false }) {
    return (
        <div
            className={`flex items-center gap-3 px-4 py-4 min-h-[60px] ${
                last ? "" : "border-b border-[0.5px] border-subtle"
            }`}
        >
            {children}
        </div>
    );
}

function IconCircle({ children }) {
    return (
        <span className="shrink-0 w-9 h-9 rounded-full bg-subtle/40 border border-[0.5px] border-subtle flex items-center justify-center text-muted">
            {children}
        </span>
    );
}

function RowCopy({ title, subtitle }) {
    return (
        <div className="min-w-0 flex-1">
            <p className="text-[13px] uppercase tracking-[0.06em] text-paper truncate" style={{ fontWeight: 500 }}>
                {title}
            </p>
            {subtitle && (
                <p className="text-sm text-muted font-light mt-1 truncate leading-snug">{subtitle}</p>
            )}
        </div>
    );
}

function TextAction({ children, onClick, disabled, testId, className = "" }) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            disabled={disabled}
            className={`shrink-0 text-[11px] uppercase tracking-[0.14em] text-paper hover:text-accent disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 ${className}`}
            style={{ fontWeight: 500 }}
        >
            {children}
        </button>
    );
}

function StatusPill({ connected }) {
    return (
        <span
            className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border-[0.5px] ${
                connected
                    ? "text-emerald-400 border-emerald-400/35 bg-emerald-400/[0.08]"
                    : "text-muted border-subtle bg-ink/60"
            }`}
            style={{ fontWeight: 500 }}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-muted"}`} />
            {connected ? "Connected" : "Disconnected"}
        </span>
    );
}

function AdminBadge() {
    return (
        <span
            className="shrink-0 text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-accent/[0.08] text-accent border border-accent/30"
            style={{ fontWeight: 500 }}
        >
            Admin
        </span>
    );
}

export default function Settings() {
    const { coach, refreshCoach } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [card, setCard] = useState(null);
    const [rateStatus, setRateStatus] = useState(null);
    const [rosterStatus, setRosterStatus] = useState(null);
    const [syncingNotion, setSyncingNotion] = useState(false);
    const [rateModalOpen, setRateModalOpen] = useState(false);
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [google, setGoogle] = useState({ connected: false, email: null });
    const [connecting, setConnecting] = useState(false);

    const notionConnected =
        rateStatus?.source === "notion"
        && !rateStatus?.error
        && rosterStatus?.configured
        && !rosterStatus?.error;
    const serviceCount = card
        ? Object.keys(card).filter((k) => !HIDDEN_RATE_CARD_KEYS.has(k)).length
        : 0;
    const isAdmin = (coach?.role || "").toLowerCase() === "admin";

    async function loadGoogle() {
        try {
            const r = await api.get("/oauth/google/status");
            setGoogle(r.data);
        } catch {
            /* ignore */
        }
    }

    async function loadRates() {
        const [rates, status] = await Promise.all([
            api.get("/rate-card"),
            api.get("/rate-card/status"),
        ]);
        setCard(rates.data);
        setRateStatus(status.data);
    }

    async function loadRosterStatus() {
        try {
            const status = await api.get("/roster/sync/status");
            setRosterStatus(status.data);
        } catch {
            /* ignore */
        }
    }

    useEffect(() => {
        loadRates();
        loadRosterStatus();
        loadGoogle();
    }, []);

    useEffect(() => {
        if (rateModalOpen && !card) loadRates();
    }, [rateModalOpen, card]);

    async function syncNotion() {
        setSyncingNotion(true);
        try {
            const [ratesRes, rosterRes] = await Promise.all([
                api.post("/rate-card/refresh"),
                api.post("/roster/sync/refresh"),
            ]);
            setCard(ratesRes.data.rates);
            setRateStatus(ratesRes.data);
            setRosterStatus(rosterRes.data);

            const rateErr = ratesRes.data.error;
            const rosterErr = rosterRes.data.error;
            if (rateErr && rosterErr) {
                toast.error("Notion sync failed for rates and roster");
            } else if (rateErr) {
                toast.error(rateErr);
            } else if (rosterErr) {
                toast.error(rosterErr);
            } else {
                const stats = rosterRes.data.stats;
                const rosterNote = stats
                    ? `${stats.created + stats.updated} athletes`
                    : "roster updated";
                toast.success(`Synced from Notion · rates + ${rosterNote}`);
            }
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not sync from Notion");
            try {
                const [status, roster] = await Promise.all([
                    api.get("/rate-card/status"),
                    api.get("/roster/sync/status"),
                ]);
                setRateStatus(status.data);
                setRosterStatus(roster.data);
            } catch {
                /* ignore */
            }
        } finally {
            setSyncingNotion(false);
        }
    }

    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        const g = params.get("google");
        if (g === "connected") {
            toast.success("Google Calendar connected · syncing upcoming sessions");
            loadGoogle();
            nav("/settings", { replace: true });
        } else if (g === "error") {
            toast.error("Google Calendar connection failed");
            nav("/settings", { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function connectGoogle() {
        setConnecting(true);
        try {
            const r = await api.get("/oauth/google/login");
            window.location.href = r.data.authorization_url;
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not start Google sign-in");
            setConnecting(false);
        }
    }

    async function disconnectGoogle() {
        if (!window.confirm("Disconnect Google Calendar? Future sessions will no longer sync.")) return;
        try {
            await api.delete("/oauth/google");
            toast.success("Google Calendar disconnected");
            setGoogle({ connected: false, email: null });
        } catch {
            toast.error("Disconnect failed");
        }
    }

    function openPasswordModal() {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordModalOpen(true);
    }

    async function submitPasswordChange(e) {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }
        setSavingPassword(true);
        try {
            await api.post("/auth/change-password", {
                current_password: currentPassword,
                new_password: newPassword,
            });
            await refreshCoach();
            toast.success("Password updated");
            setPasswordModalOpen(false);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Could not update password");
        } finally {
            setSavingPassword(false);
        }
    }

    return (
        <div className="min-h-full w-full flex flex-col">
            <header
                data-testid="page-settings-header"
                className="w-full px-5 md:px-10 lg:px-12 pt-8 md:pt-12 pb-6 border-b border-[0.5px] border-subtle"
            >
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2" style={{ fontWeight: 300 }}>
                    Elite Atmosphere Training
                </p>
                <h1 className="eat-h1">Settings</h1>
            </header>

            <div className="w-full flex-1 px-5 md:px-10 lg:px-12 py-8 md:py-10 lg:py-12 pb-10">
                <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10 xl:items-stretch">
                        <section className="w-full xl:col-span-5">
                            <SectionLabel>Account</SectionLabel>
                            <Panel>
                                <div className="flex items-center gap-3 px-4 py-4 border-b border-[0.5px] border-subtle">
                                    <IconCircle>
                                        <span className="text-[13px]" style={{ fontWeight: 500 }}>
                                            {initials(coach?.name)}
                                        </span>
                                    </IconCircle>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className="text-[13px] uppercase tracking-wide text-paper truncate"
                                                style={{ fontWeight: 500 }}
                                            >
                                                {coach?.name}
                                            </span>
                                            {isAdmin && <AdminBadge />}
                                        </div>
                                        <p className="text-sm text-muted font-light mt-0.5 truncate">{coach?.email}</p>
                                    </div>
                                </div>
                                <DividerRow last>
                                    <IconCircle>
                                        <Lock size={16} strokeWidth={1.75} />
                                    </IconCircle>
                                    <RowCopy title="Password" subtitle={fmtPasswordUpdated(coach?.password_updated_at)} />
                                    <TextAction testId={SETTINGS.updatePasswordBtn} onClick={openPasswordModal}>
                                        Update
                                    </TextAction>
                                </DividerRow>
                            </Panel>
                        </section>

                        <section className="w-full xl:col-span-5 xl:row-start-2 flex flex-col">
                            <SectionLabel>Integrations</SectionLabel>
                            <Panel className="flex-1 flex flex-col">
                                <DividerRow>
                                    <IconCircle>
                                        <Calendar size={16} strokeWidth={1.75} />
                                    </IconCircle>
                                    <RowCopy
                                        title="Google Calendar"
                                        subtitle={
                                            google.connected && google.email
                                                ? google.email
                                                : "Sync sessions to your calendar"
                                        }
                                    />
                                    <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                                        {google.connected ? (
                                            <>
                                                <StatusPill connected />
                                                <TextAction
                                                    testId="google-disconnect-btn"
                                                    onClick={disconnectGoogle}
                                                    className="text-muted hover:text-danger"
                                                >
                                                    Disconnect
                                                </TextAction>
                                            </>
                                        ) : (
                                            <TextAction
                                                testId="google-connect-btn"
                                                onClick={connectGoogle}
                                                disabled={connecting}
                                            >
                                                {connecting ? "Connecting…" : "Connect"}
                                            </TextAction>
                                        )}
                                    </div>
                                </DividerRow>
                                <DividerRow last>
                                    <IconCircle>
                                        <BookOpen size={16} strokeWidth={1.75} />
                                    </IconCircle>
                                    <RowCopy
                                        title="Notion"
                                        subtitle={formatNotionSync(latestNotionSync(rateStatus, rosterStatus))}
                                    />
                                    <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                                        <StatusPill connected={notionConnected} />
                                        <TextAction
                                            testId={SETTINGS.notionSyncBtn}
                                            onClick={syncNotion}
                                            disabled={syncingNotion}
                                        >
                                            {syncingNotion && <Loader2 size={12} className="animate-spin" />}
                                            {syncingNotion ? "Syncing…" : "Sync"}
                                        </TextAction>
                                    </div>
                                </DividerRow>
                                {(rateStatus?.error || rosterStatus?.error) && (
                                    <div className="border-t border-[0.5px] border-subtle px-4 py-3 space-y-1">
                                        {rateStatus?.error && (
                                            <p className="text-[11px] text-danger font-light">{rateStatus.error}</p>
                                        )}
                                        {rosterStatus?.error && (
                                            <p className="text-[11px] text-danger font-light">{rosterStatus.error}</p>
                                        )}
                                    </div>
                                )}
                            </Panel>
                        </section>

                    <section className="w-full xl:col-span-7 xl:col-start-6 xl:row-start-2 flex flex-col min-h-0 h-full">
                        <SectionLabel>Billing · Rate Card</SectionLabel>
                        <Panel className="relative flex flex-col flex-1 min-h-0 h-full">
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[0.5px] border-subtle">
                                <p className="text-sm text-muted font-light">
                                    Source:{" "}
                                    <span className="text-paper">
                                        {rateStatus?.source === "notion" ? "Notion" : "Built-in fallback"}
                                    </span>
                                    {card && (
                                        <>
                                            {" "}
                                            · {serviceCount} {serviceCount === 1 ? "service" : "services"} active
                                        </>
                                    )}
                                </p>
                                <button
                                    type="button"
                                    data-testid={SETTINGS.rateCardOpenBtn}
                                    onClick={() => setRateModalOpen(true)}
                                    className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-paper hover:text-accent transition-colors"
                                    style={{ fontWeight: 500 }}
                                >
                                    View all
                                    <ChevronRight size={14} strokeWidth={2} />
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 bg-ink">
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 h-full content-start [&>*]:border-[0.5px] [&>*]:border-subtle">
                                    {RATE_GRID_SERVICES.map(({ key, label }) => (
                                        <div
                                            key={key}
                                            className="bg-ink px-3 py-3 flex flex-col gap-1 min-h-[52px] min-w-0"
                                        >
                                            <span className="text-sm uppercase tracking-wide text-muted whitespace-nowrap">
                                                {label}
                                            </span>
                                            <span className="text-sm text-paper tabular-nums" style={{ fontWeight: 500 }}>
                                                {card ? fmtRateValue(key, card[key]) : "—"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {rateStatus?.error && (
                                <p className="text-[11px] text-danger px-4 py-2 font-light border-t border-[0.5px] border-subtle">
                                    {rateStatus.error}
                                </p>
                            )}
                        </Panel>
                    </section>
                </div>
            </div>

            <Modal
                open={passwordModalOpen}
                onOpenChange={setPasswordModalOpen}
                title="Update Password"
                description="Change your sign-in password"
            >
                <form onSubmit={submitPasswordChange} className="flex flex-col gap-4">
                    <div>
                        <label className="eat-label">Current Password</label>
                        <input
                            data-testid={SETTINGS.passwordCurrent}
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="eat-input mt-1.5"
                            required
                        />
                    </div>
                    <div>
                        <label className="eat-label">New Password</label>
                        <input
                            data-testid={SETTINGS.passwordNew}
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="eat-input mt-1.5"
                            minLength={8}
                            required
                        />
                    </div>
                    <div>
                        <label className="eat-label">Confirm New Password</label>
                        <input
                            data-testid={SETTINGS.passwordConfirm}
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="eat-input mt-1.5"
                            minLength={8}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        data-testid={SETTINGS.passwordSubmit}
                        disabled={savingPassword}
                        className="eat-btn-primary w-full h-12 mt-2"
                    >
                        {savingPassword ? "Saving…" : "Save Password"}
                    </button>
                </form>
            </Modal>

            <Modal
                open={rateModalOpen}
                onOpenChange={setRateModalOpen}
                title="Rate Card"
                description="Services and rates synced from Notion"
                maxW="max-w-lg"
            >
                <div className="mb-4">
                    {rateStatus && (
                        <p className="text-sm text-muted font-light">
                            Source:{" "}
                            <span className="text-paper">
                                {rateStatus.source === "notion" ? "Notion" : "Built-in fallback"}
                            </span>
                            {rateStatus.synced_at && (
                                <> · {new Date(rateStatus.synced_at).toLocaleString()}</>
                            )}
                        </p>
                    )}
                </div>
                {rateStatus?.error && (
                    <p className="text-xs text-danger mb-3 font-light">{rateStatus.error}</p>
                )}
                {!card ? (
                    <div className="text-muted text-sm py-6 text-center">Loading…</div>
                ) : (
                    <div className="border-t border-subtle">
                        {Object.entries(card)
                            .filter(([k]) => !HIDDEN_RATE_CARD_KEYS.has(k))
                            .map(([k, v]) => (
                            <div
                                key={k}
                                className="flex flex-col gap-1 py-3 border-b border-subtle last:border-b-0 min-w-0"
                            >
                                <span className="uppercase tracking-wider2 text-sm text-paper whitespace-nowrap" style={{ fontWeight: 500 }}>
                                    {RATE_LABEL_BY_KEY[k] || k.replace(/_/g, " ")}
                                </span>
                                <span className="eat-numeral text-xl">{fmtRateValue(k, v)}</span>
                            </div>
                        ))}
                    </div>
                )}
                <p className="text-sm text-muted mt-4 font-light">
                    Edit rates and roster in Notion, then Sync under Integrations.
                </p>
            </Modal>
        </div>
    );
}
