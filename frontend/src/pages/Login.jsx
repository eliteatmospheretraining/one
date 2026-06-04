import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../lib/api";
import { useAuth } from "../lib/auth";
import { LOGIN } from "../lib/testIds";
import { Mail, ArrowRight, Lock } from "lucide-react";
import { BrandWordmark } from "../components/BrandWordmark";

export default function Login() {
    const { coach, signIn } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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

    async function submitPassword(e) {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
            const r = await axios.post(`${API}/auth/login`, { email, password });
            signIn(r.data.token, r.data.coach);
            nav("/home", { replace: true });
        } catch (e) {
            setErr(e.response?.data?.detail || "Invalid email or password");
        } finally {
            setLoading(false);
        }
    }

    async function sendMagicLink() {
        if (!email) {
            setErr("Enter your email first");
            return;
        }
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
        <div className="min-h-screen w-full bg-ink text-paper">
            <div className="min-h-screen flex items-center justify-center px-5 py-10">
                <div className="w-full max-w-md">
                    <div className="mb-8 flex justify-center">
                        <BrandWordmark variant="login" />
                    </div>

                    {!sent ? (
                        <form onSubmit={submitPassword} className="flex flex-col gap-5">
                            <div className="eat-divider mb-2" />

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

                            <div>
                                <label className="eat-label">Password</label>
                                <div className="relative mt-1.5">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                    <input
                                        data-testid={LOGIN.passwordInput}
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="eat-input pl-9"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {err && (
                                <div className="text-sm text-danger border border-danger/60 px-3 py-2 font-light">{err}</div>
                            )}

                            <button
                                data-testid={LOGIN.passwordSubmitBtn}
                                type="submit"
                                disabled={loading || !email || !password}
                                className="eat-btn-primary w-full disabled:opacity-50"
                            >
                                {loading ? "Signing in…" : "Sign In"}
                                <ArrowRight size={16} className="ml-2" strokeWidth={2} />
                            </button>

                            <button
                                type="button"
                                data-testid={LOGIN.magicLinkBtn}
                                onClick={sendMagicLink}
                                disabled={loading || !email}
                                className="eat-btn-ghost w-full text-xs uppercase tracking-wider2 disabled:opacity-50"
                                style={{ fontWeight: 500 }}
                            >
                                {loading ? "Sending…" : "Send Magic Link"}
                            </button>

                            <div className="eat-divider my-2" />
                            <a
                                href="/enroll"
                                className="text-center text-xs uppercase tracking-wider2 text-muted hover:text-accent transition-colors"
                                style={{ fontWeight: 500 }}
                            >
                                New athlete? Enroll here
                            </a>
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
                            <button
                                type="button"
                                onClick={() => { setSent(false); setDevLink(null); setErr(null); }}
                                className="eat-btn-ghost self-start px-0"
                            >
                                Back to sign in
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
