import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../lib/api";
import { useAuth } from "../lib/auth";
import { LOGIN } from "../lib/testIds";
import { Mail, ArrowRight, ShieldCheck } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_eat-admin-portal/artifacts/jnekghwj_EAT%20Logo.%20%285%29.png";

export default function Login() {
    const { coach, signIn } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [devLink, setDevLink] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        if (coach) nav("/home", { replace: true });
    }, [coach, nav]);

    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        const token = params.get("token");
        if (token) verify(token);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function verify(token) {
        setLoading(true);
        try {
            const r = await axios.post(`${API}/auth/verify-magic-link`, { token });
            signIn(r.data.token, r.data.coach);
            nav("/home", { replace: true });
        } catch (e) {
            setErr(e.response?.data?.detail || "Could not verify link");
        } finally {
            setLoading(false);
        }
    }

    async function submit(e) {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
            const r = await axios.post(`${API}/auth/request-magic-link`, { email });
            setSent(true);
            if (r.data.dev_magic_link) setDevLink(r.data.dev_magic_link);
        } catch (e) {
            setErr(e.response?.data?.detail || "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-full bg-ink text-paper flex flex-col">
            <div className="flex-1 flex items-center justify-center px-5 py-10">
                <div className="w-full max-w-md">
                    {/* Brand */}
                    <div className="mb-10">
                        <img src={LOGO_URL} alt="EAT" className="w-9 h-9 object-contain invert mb-8" />
                        <div className="font-thunder uppercase text-paper leading-[0.92] tracking-tight text-6xl sm:text-7xl" style={{ fontWeight: 500 }}>
                            EAT<span className="text-accent">.</span>
                        </div>
                    </div>

                    {/* Form / sent state */}
                    {!sent ? (
                        <form onSubmit={submit} className="flex flex-col gap-5">
                            <div className="eat-divider mb-2" />
                            <div className="eat-eyebrow">Sign In</div>
                            <p className="text-sm text-muted -mt-3 font-light">Magic link to your inbox. No password.</p>

                            <div>
                                <label className="eat-label">Email Address</label>
                                <div className="relative mt-1.5">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                    <input
                                        data-testid={LOGIN.emailInput}
                                        type="email"
                                        autoFocus
                                        required
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="eat-input pl-9"
                                        placeholder="you@eliteatmospheretraining.com"
                                    />
                                </div>
                            </div>

                            {err && (
                                <div className="text-sm text-danger border border-danger/60 px-3 py-2 font-light">{err}</div>
                            )}

                            <button
                                data-testid={LOGIN.submitBtn}
                                type="submit"
                                disabled={loading || !email}
                                className="eat-btn-primary w-full disabled:opacity-50"
                            >
                                {loading ? "Sending…" : "Send Magic Link"}
                                <ArrowRight size={16} className="ml-2" strokeWidth={2} />
                            </button>

                            <div className="flex items-center gap-2 text-xs text-muted mt-1 uppercase tracking-wider2" style={{ fontWeight: 300 }}>
                                <ShieldCheck size={13} strokeWidth={1.5} /> Admin only · single-use · 30 min
                            </div>
                        </form>
                    ) : (
                        <div data-testid={LOGIN.sentMessage} className="flex flex-col gap-4">
                            <div className="eat-divider mb-2" />
                            <div className="eat-eyebrow">Check Your Inbox</div>
                            <p className="text-sm text-paper font-light">
                                If <span className="text-paper">{email}</span> is an authorized admin, a sign-in link is on its way. It expires in 30 minutes.
                            </p>
                            {devLink && (
                                <div className="border border-subtle p-3 bg-mid">
                                    <div className="eat-label">Dev Magic Link</div>
                                    <a
                                        data-testid={LOGIN.devLink}
                                        href={devLink}
                                        className="text-xs font-mono break-all text-accent mt-1 block hover:underline"
                                    >
                                        {devLink}
                                    </a>
                                </div>
                            )}
                            <button onClick={() => { setSent(false); setDevLink(null); }} className="eat-btn-ghost self-start px-0">
                                Use a different email
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <footer className="text-center text-[10px] uppercase tracking-wider3 text-muted py-6 border-t border-subtle" style={{ fontWeight: 300 }}>
                1000 Brickell Ave · Miami, FL
            </footer>
        </div>
    );
}
