import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../lib/auth";
import { fmtMoney } from "../lib/format";
import { Check, ExternalLink, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
    const { coach } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [card, setCard] = useState(null);
    const [biz, setBiz] = useState(null);
    const [google, setGoogle] = useState({ connected: false, email: null });
    const [connecting, setConnecting] = useState(false);

    async function loadGoogle() {
        try {
            const r = await api.get("/oauth/google/status");
            setGoogle(r.data);
        } catch (e) {
            // ignore
        }
    }

    useEffect(() => {
        api.get("/rate-card").then((r) => setCard(r.data));
        api.get("/business-info").then((r) => setBiz(r.data));
        loadGoogle();
    }, []);

    // Show toast based on OAuth redirect status (?google=connected|error)
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
        } catch (e) {
            toast.error("Disconnect failed");
        }
    }

    return (
        <div>
            <PageHeader subtitle="Settings" title="Settings" testId="page-settings-header" />
            <div className="px-5 md:px-10 mt-8 max-w-3xl pb-10 flex flex-col gap-8">
                <section>
                    <div className="eat-label mb-2">Signed In</div>
                    <div className="font-thunder text-3xl uppercase tracking-tight text-paper leading-none" style={{ fontWeight: 500 }}>{coach?.name}</div>
                    <div className="text-sm text-muted mt-1.5 font-light">{coach?.email}</div>
                    <div className="text-xs text-muted mt-1 uppercase tracking-wider2" style={{ fontWeight: 300 }}>Role · <span className="text-paper">{coach?.role}</span></div>
                </section>

                {/* Google Calendar */}
                <section>
                    <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
                        <div>
                            <div className="eat-label">Integrations</div>
                            <div className="font-thunder text-2xl uppercase tracking-tight text-paper leading-none mt-1" style={{ fontWeight: 500 }}>Google Calendar</div>
                        </div>
                        {google.connected ? (
                            <span className="eat-badge-accent">
                                <Check size={11} strokeWidth={2.5} className="mr-1" /> Connected
                            </span>
                        ) : (
                            <span className="eat-badge-outline">Not connected</span>
                        )}
                    </div>
                    {google.connected ? (
                        <div className="border-t border-subtle pt-3">
                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <div className="eat-label">Synced to</div>
                                    <div className="text-paper mt-0.5 break-all" style={{ fontWeight: 500 }}>{google.email}</div>
                                </div>
                            </div>
                            <button
                                data-testid="google-disconnect-btn"
                                onClick={disconnectGoogle}
                                className="eat-btn-danger mt-2"
                            >
                                <Unlink size={13} className="mr-1.5" strokeWidth={1.75} /> Disconnect
                            </button>
                            <p className="text-xs text-muted mt-3 font-light">
                                Every session you create, edit, or cancel in EAT pushes to your Google Calendar in real time. Events are tagged with the EAT session ID.
                            </p>
                        </div>
                    ) : (
                        <div className="border-t border-subtle pt-3">
                            <p className="text-sm text-muted font-light mb-3">
                                Connect your Google account once. After that, every session you create or edit in EAT instantly appears on your Google Calendar.
                            </p>
                            <button
                                data-testid="google-connect-btn"
                                onClick={connectGoogle}
                                disabled={connecting}
                                className="eat-btn-primary disabled:opacity-50"
                            >
                                <Link2 size={14} className="mr-1.5" strokeWidth={1.75} />
                                {connecting ? "Redirecting…" : "Connect Google Calendar"}
                                <ExternalLink size={12} className="ml-1.5 opacity-60" strokeWidth={1.75} />
                            </button>
                            <p className="text-[11px] text-muted mt-3 font-light">
                                You'll be sent to Google to authorize. We only request calendar event access — no contacts, no Gmail.
                            </p>
                        </div>
                    )}
                </section>

                <section>
                    <div className="eat-label mb-3">Rate Card</div>
                    {!card ? (
                        <div className="text-muted text-sm">Loading…</div>
                    ) : (
                        <div className="border-t border-subtle">
                            {Object.entries(card).map(([k, v]) => (
                                <div key={k} className="flex justify-between items-baseline py-3 border-b border-subtle">
                                    <span className="uppercase tracking-wider2 text-sm text-paper" style={{ fontWeight: 500 }}>{k.replace(/_/g, " ")}</span>
                                    <span className="eat-numeral text-2xl">{fmtMoney(v)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-muted mt-3 font-light">Rates can be overridden per athlete on their profile.</p>
                </section>

                {biz && (biz.zelle_email || biz.zelle_phone) && (
                    <section>
                        <div className="eat-label mb-3">Zelle Receiving</div>
                        <div className="border-t border-subtle">
                            {biz.zelle_name && (
                                <div className="flex justify-between items-baseline py-3 border-b border-subtle">
                                    <span className="eat-label">Pay to</span>
                                    <span className="text-paper" style={{ fontWeight: 500 }}>{biz.zelle_name}</span>
                                </div>
                            )}
                            {biz.zelle_email && (
                                <div className="flex justify-between items-baseline py-3 border-b border-subtle">
                                    <span className="eat-label">Email</span>
                                    <span className="text-paper" style={{ fontWeight: 500 }}>{biz.zelle_email}</span>
                                </div>
                            )}
                            {biz.zelle_phone && (
                                <div className="flex justify-between items-baseline py-3 border-b border-subtle">
                                    <span className="eat-label">Phone</span>
                                    <span className="text-paper" style={{ fontWeight: 500 }}>{biz.zelle_phone}</span>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted mt-3 font-light">These appear on invoice PDFs and the guardian email. Update in <span className="text-paper">backend/.env</span>.</p>
                    </section>
                )}

                <section>
                    <div className="eat-label mb-2">Business</div>
                    <div className="text-paper" style={{ fontWeight: 500 }}>{biz?.name || "Elite Atmosphere Training"}</div>
                    <div className="text-sm text-muted font-light">{biz?.address || "1000 Brickell Ave Ste 715 PMB 5042, Miami, FL 33131"}</div>
                </section>
            </div>
        </div>
    );
}
