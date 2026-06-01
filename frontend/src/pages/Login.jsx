import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../lib/api";
import { useAuth } from "../lib/auth";
import { LOGIN } from "../lib/testIds";
import { Mail, ArrowRight, ShieldCheck } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_eat-admin-portal/artifacts/jnekghwj_EAT%20Logo.%20%285%29.png";
const BG_URL = "https://static.prod-images.emergentagent.com/jobs/27bd2c08-81a7-4d84-9fd8-a6f133951f25/images/ed7543213097b821a4f66deb480a28ca03722b27c115c242850aa3aafb703655.png";

export default function Login() {
    const { coach } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [devLink, setDevLink] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        if (coach) nav("/", { replace: true });
    }, [coach, nav]);

    // Handle /verify?token=xxx by auto-verifying
    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        const token = params.get("token");
        if (token) {
            verify(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { signIn } = useAuth();

    async function verify(token) {
        setLoading(true);
        try {
            const r = await axios.post(`${API}/auth/verify-magic-link`, { token });
            signIn(r.data.token, r.data.coach);
            nav("/", { replace: true });
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
            if (r.data.dev_magic_link) {
                setDevLink(r.data.dev_magic_link);
            }
        } catch (e) {
            setErr(e.response?.data?.detail || "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="min-h-screen w-full flex items-center justify-center px-4 py-10 relative bg-obsidian"
            style={{
                backgroundImage: `linear-gradient(rgba(10,10,10,0.85), rgba(10,10,10,0.95)), url(${BG_URL})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-20 h-20 bg-white border-2 border-volt flex items-center justify-center mb-4 shadow-brut-volt">
                        <img src={LOGO_URL} alt="EAT" className="w-16 h-16 object-contain" />
                    </div>
                    <div className="font-heading font-black text-4xl uppercase tracking-tight text-white text-center leading-none">
                        Elite Atmosphere
                    </div>
                    <div className="font-heading font-black text-4xl uppercase tracking-tight text-volt text-center leading-none mt-1">
                        Training
                    </div>
                    <div className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-3">Coach Console · V1</div>
                </div>

                <div className="bg-white border-2 border-volt shadow-brut-volt p-6 md:p-8">
                    {!sent ? (
                        <form onSubmit={submit} className="flex flex-col gap-5">
                            <div>
                                <h2 className="font-heading text-3xl uppercase tracking-tight">Sign In</h2>
                                <p className="text-sm text-zinc-600 mt-1">Magic link to your inbox — no password.</p>
                            </div>
                            <div>
                                <label className="eat-label">Email Address</label>
                                <div className="relative mt-2">
                                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                    <input
                                        data-testid={LOGIN.emailInput}
                                        type="email"
                                        autoFocus
                                        required
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="eat-input pl-10"
                                        placeholder="you@eliteatmospheretraining.com"
                                    />
                                </div>
                            </div>
                            {err && (
                                <div className="text-sm font-bold text-red-600 border-2 border-red-600 bg-red-50 px-3 py-2">
                                    {err}
                                </div>
                            )}
                            <button
                                data-testid={LOGIN.submitBtn}
                                type="submit"
                                disabled={loading || !email}
                                className="eat-btn-primary w-full disabled:opacity-50"
                            >
                                {loading ? "Sending…" : "Send Magic Link"}
                                <ArrowRight size={18} className="ml-2" />
                            </button>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                                <ShieldCheck size={14} /> Admin access only · single-use link · 30 min expiry
                            </div>
                        </form>
                    ) : (
                        <div data-testid={LOGIN.sentMessage} className="flex flex-col gap-4">
                            <h2 className="font-heading text-3xl uppercase tracking-tight">Check Your Inbox</h2>
                            <p className="text-sm text-zinc-700">
                                If <strong>{email}</strong> is an authorized admin, a sign-in link is on its way. The link expires in 30 minutes.
                            </p>
                            {devLink && (
                                <div className="border-2 border-dashed border-obsidian p-3 bg-volt-soft">
                                    <div className="eat-label">Dev Magic Link</div>
                                    <a
                                        data-testid={LOGIN.devLink}
                                        href={devLink}
                                        className="text-xs font-mono break-all text-obsidian underline mt-1 block"
                                    >
                                        {devLink}
                                    </a>
                                </div>
                            )}
                            <button onClick={() => { setSent(false); setDevLink(null); }} className="eat-btn-ghost">
                                Use a different email
                            </button>
                        </div>
                    )}
                </div>

                <div className="text-center text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-6">
                    1000 Brickell Ave · Miami, FL
                </div>
            </div>
        </div>
    );
}
