import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useGreeting } from "../lib/greeting";
import { SessionStatusPill } from "../components/Pills";
import { fmtMoney, todayISO, fmtTime } from "../lib/format";

const TYPE_BAR = {
    full_time: "bg-accent",
    private: "bg-paper",
    semi_private: "bg-subtle",
};

function formatHeaderDate(iso) {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    }).format(new Date(`${iso}T00:00:00`)).toUpperCase();
}

function formatMonthRange(iso) {
    const [year, month] = iso.split("-").map(Number);
    const paddedMonth = String(month).padStart(2, "0");
    const endDay = new Date(year, month, 0).getDate();
    return [`${year}-${paddedMonth}-01`, `${year}-${paddedMonth}-${String(endDay).padStart(2, "0")}`];
}

function monthKey(dateIso) {
    return dateIso.slice(0, 7);
}

function getUserLabel(name) {
    const first = (name || "Coach").split(" ")[0] || "Coach";
    return `${first.toUpperCase()}.`;
}

export default function Home() {
    const nav = useNavigate();
    const { coach } = useAuth();
    const greeting = useGreeting();
    const today = todayISO();
    const [monthStart, monthEnd] = useMemo(() => formatMonthRange(today), [today]);
    const currentMonthKey = monthKey(today);

    const [todaySessions, setTodaySessions] = useState([]);
    const [attendanceMap, setAttendanceMap] = useState({});
    const [draftCount, setDraftCount] = useState(0);
    const [sentCount, setSentCount] = useState(0);
    const [outstandingTotal, setOutstandingTotal] = useState(0);
    const [sessionsThisMonth, setSessionsThisMonth] = useState(0);
    const [revenueThisMonth, setRevenueThisMonth] = useState(0);
    const [readyToInvoiceCount, setReadyToInvoiceCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchDashboard() {
            setLoading(true);
            setError(null);
            try {
                const [todayResp, invoicesResp, monthlySessionsResp] = await Promise.all([
                    api.get("/sessions", { params: { start_date: today, end_date: today } }),
                    api.get("/invoices"),
                    api.get("/sessions", { params: { status: "completed", start_date: monthStart, end_date: monthEnd } }),
                ]);

                const sessions = (todayResp.data || []).slice().sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
                setTodaySessions(sessions);
                setDraftCount((invoicesResp.data || []).filter((inv) => inv.status === "draft").length);
                const sentInvoices = (invoicesResp.data || []).filter((inv) => inv.status === "sent");
                setSentCount(sentInvoices.length);
                setOutstandingTotal(sentInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0));
                setSessionsThisMonth(monthlySessionsResp.data?.length || 0);

                const allInvoiceDetails = await Promise.all(
                    (invoicesResp.data || []).map((invoice) => api.get(`/invoices/${invoice.id}`))
                );

                const payments = allInvoiceDetails.flatMap((detail) => detail.data.payments || []);
                setRevenueThisMonth(
                    payments
                        .filter((payment) => String(payment.received_date || "").startsWith(currentMonthKey))
                        .reduce((sum, payment) => sum + Number(payment.amount_received || 0), 0)
                );

                const invoicedAttendanceIds = new Set(
                    allInvoiceDetails
                        .flatMap((detail) => detail.data.line_items || [])
                        .map((item) => item.attendance_record_id)
                        .filter(Boolean)
                );

                const completedSessions = (await api.get("/sessions", { params: { status: "completed" } })).data || [];
                const completedAttendances = await Promise.all(
                    completedSessions.map((session) => api.get(`/sessions/${session.id}/attendance`))
                );
                setReadyToInvoiceCount(
                    completedAttendances.filter((recordResp) =>
                        (recordResp.data.records || []).some((record) => !invoicedAttendanceIds.has(record.id))
                    ).length
                );
            } catch (e) {
                setError(e.response?.data?.detail || "Could not load dashboard data.");
            } finally {
                setLoading(false);
            }
        }

        fetchDashboard();
    }, [today, monthStart, monthEnd, currentMonthKey]);

    useEffect(() => {
        if (!todaySessions.length) {
            setAttendanceMap({});
            return;
        }

        async function fetchAttendance() {
            const responses = await Promise.all(
                todaySessions.map((session) => api.get(`/sessions/${session.id}/attendance`).catch(() => null))
            );
            const map = {};
            responses.forEach((resp, index) => {
                if (!resp || !resp.data) return;
                map[todaySessions[index].id] = resp.data.records?.length || 0;
            });
            setAttendanceMap(map);
        }

        fetchAttendance();
    }, [todaySessions]);

    const sessionCards = todaySessions.slice(0, 4);
    const pendingActions = [
        {
            count: draftCount,
            label: "DRAFTS PENDING",
            detail: `${draftCount} invoice${draftCount === 1 ? "" : "s"} not yet sent`,
            onClick: () => nav("/invoices?status=draft"),
        },
        {
            count: sentCount,
            label: "AWAITING PAYMENT",
            detail: `${sentCount} invoice${sentCount === 1 ? "" : "s"} sent, not yet paid — ${fmtMoney(outstandingTotal)}`,
            onClick: () => nav("/invoices?status=sent"),
        },
        {
            count: readyToInvoiceCount,
            label: "READY TO INVOICE",
            detail: `${readyToInvoiceCount} completed session${readyToInvoiceCount === 1 ? "" : "s"} with attendance not yet included in an invoice`,
            onClick: () => nav("/invoices?new=true"),
        },
    ].filter((item) => item.count > 0).slice(0, 3);

    const greetingLabel = `${greeting.toUpperCase()}, ${getUserLabel(coach?.name)}`;
    const topDateLabel = formatHeaderDate(today);
    const shortDateLabel = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(new Date(`${today}T00:00:00`)).toUpperCase();

    function WeatherWidget() {
        const [loadingWeather, setLoadingWeather] = useState(true);
        const [tempF, setTempF] = useState(null);
        const [desc, setDesc] = useState(null);
        const [err, setErr] = useState(null);

        useEffect(() => {
            let mounted = true;
            async function loadWeather() {
                try {
                    // Get lat/lon for zip 33351
                    const zresp = await fetch("https://api.zippopotam.us/us/33351");
                    if (!zresp.ok) throw new Error("No geo");
                    const zjson = await zresp.json();
                    const place = (zjson.places && zjson.places[0]) || null;
                    const lat = place?.latitude;
                    const lon = place?.longitude;
                    if (!lat || !lon) throw new Error("No coords");

                    const wresp = await fetch(
                        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&timezone=America%2FNew_York`
                    );
                    if (!wresp.ok) throw new Error("Weather fetch failed");
                    const wjson = await wresp.json();
                    const cw = wjson.current_weather;
                    if (!cw) throw new Error("No current weather");
                    const c = Number(cw.temperature);
                    const f = Math.round((c * 9) / 5 + 32);
                    const code = Number(cw.weathercode);
                    const map = {
                        0: "Clear",
                        1: "Mainly clear",
                        2: "Partly cloudy",
                        3: "Overcast",
                        45: "Fog",
                        48: "Depositing rime fog",
                        51: "Light drizzle",
                        53: "Moderate drizzle",
                        55: "Dense drizzle",
                        61: "Slight rain",
                        63: "Moderate rain",
                        65: "Heavy rain",
                        80: "Rain showers",
                        95: "Thunderstorm",
                    };
                    if (!mounted) return;
                    setTempF(f);
                    setDesc(map[code] || "Weather");
                } catch (e) {
                    if (!mounted) return;
                    setErr(true);
                } finally {
                    if (mounted) setLoadingWeather(false);
                }
            }

            loadWeather();
            return () => { mounted = false; };
        }, []);

        if (loadingWeather) return <div className="text-sm text-muted">Loading weather…</div>;
        if (err) return <div className="text-sm text-muted">Weather unavailable</div>;
        return (
            <div className="text-right">
                <div className="text-sm text-muted">33351</div>
                <div className="font-thunder text-2xl" style={{ fontWeight: 800 }}>{tempF}°</div>
                <div className="text-xs text-muted mt-0.5">{desc}</div>
            </div>
        );
    }

    return (
        <div className="px-5 md:px-10 pb-10 pt-10 md:pt-12">
            <div className="border-b border-[#2A2A2A] pb-8">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.45em] text-muted font-thunder" style={{ fontWeight: 300 }}>
                            {topDateLabel}
                        </div>
                        <div className="mt-3 font-thunder uppercase text-4xl md:text-5xl tracking-tight text-paper" style={{ fontWeight: 800 }}>
                            {greetingLabel}
                        </div>
                    </div>
                    <div className="ml-4">
                        <WeatherWidget />
                    </div>
                </div>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
                <section className="space-y-5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-[11px] uppercase tracking-wider3 text-paper font-thunder" style={{ fontWeight: 700 }}>
                            TODAY
                        </div>
                        <div className="text-sm text-muted uppercase tracking-wider2 font-thunder" style={{ fontWeight: 500 }}>
                            {shortDateLabel}
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-muted text-sm py-8">Loading…</div>
                    ) : error ? (
                        <div className="text-danger text-sm py-8">{error}</div>
                    ) : sessionCards.length === 0 ? (
                        <div className="text-sm text-muted">No sessions scheduled for today.</div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {sessionCards.map((session) => {
                                const marked = attendanceMap[session.id] ?? 0;
                                const expected = session.athlete_ids?.length || 0;
                                const attendanceLabel = marked > 0 ? `${marked} / ${expected} marked` : `${expected} expected`;
                                return (
                                    <button
                                        key={session.id}
                                        onClick={() => nav(`/sessions/${session.id}`)}
                                        className="relative bg-[#1E1E1E] border border-[#2A2A2A] p-5 text-left hover:border-paper/30 transition-colors flex items-start gap-4"
                                    >
                                        <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${TYPE_BAR[session.session_type] || "bg-subtle"}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="font-thunder uppercase tracking-tight text-paper text-2xl" style={{ fontWeight: 800 }}>
                                                        {fmtTime(session.start_time) || "—"}
                                                        {session.end_time ? <span className="text-muted text-xl"> – {fmtTime(session.end_time)}</span> : null}
                                                    </div>
                                                    <div className="text-sm text-muted uppercase tracking-wider2 mt-2" style={{ fontWeight: 500 }}>
                                                        {session.session_type?.replace(/_/g, " ")}
                                                    </div>
                                                </div>
                                                <SessionStatusPill status={session.status} />
                                            </div>
                                            <div className="mt-4 text-sm text-muted font-light">{attendanceLabel}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {todaySessions.length > 4 ? (
                        <div className="pt-3 text-right">
                            <button
                                onClick={() => nav("/")}
                                className="inline-flex items-center gap-1 text-sm uppercase tracking-wider2 text-paper text-opacity-80 hover:text-paper"
                            >
                                View all
                                <ChevronRight size={16} strokeWidth={2} />
                            </button>
                        </div>
                    ) : null}
                </section>

                <div className="space-y-5">
                    <section className="space-y-4">
                        <div className="text-[11px] uppercase tracking-wider3 text-paper font-thunder" style={{ fontWeight: 700 }}>
                            NEEDS ATTENTION
                        </div>
                        {loading ? (
                            <div className="text-muted text-sm py-8">Loading…</div>
                        ) : pendingActions.length === 0 ? (
                            <div className="text-sm text-muted">You're all caught up.</div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {pendingActions.map((action) => (
                                    <button
                                        key={action.label}
                                        onClick={action.onClick}
                                        className="relative bg-[#1E1E1E] border border-[#2A2A2A] p-5 text-left hover:border-paper/30 transition-colors flex items-start justify-between gap-3"
                                    >
                                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#CBFF00]" />
                                        <div className="pl-3 min-w-0">
                                            <div className="font-thunder uppercase tracking-tight text-paper" style={{ fontWeight: 700 }}>
                                                {action.label}
                                            </div>
                                            <div className="mt-2 text-sm text-muted font-light">
                                                {action.detail}
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-muted" strokeWidth={2} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-4">
                        <div className="text-[11px] uppercase tracking-wider3 text-paper font-thunder" style={{ fontWeight: 700 }}>
                            THIS MONTH
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="bg-[#141414] p-5">
                                <div className="font-thunder uppercase tracking-tight text-paper text-5xl" style={{ fontWeight: 800 }}>
                                    {sessionsThisMonth}
                                </div>
                                <div className="mt-3 text-[11px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>
                                    SESSIONS
                                </div>
                                <div className="text-[11px] uppercase tracking-wider3 text-muted mt-1" style={{ fontWeight: 300 }}>
                                    THIS MONTH
                                </div>
                            </div>
                            <div className="bg-[#141414] p-5">
                                <div className="font-thunder uppercase tracking-tight text-paper text-5xl" style={{ fontWeight: 800 }}>
                                    {fmtMoney(revenueThisMonth)}
                                </div>
                                <div className="mt-3 text-[11px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>
                                    REVENUE
                                </div>
                                <div className="text-[11px] uppercase tracking-wider3 text-muted mt-1" style={{ fontWeight: 300 }}>
                                    THIS MONTH
                                </div>
                            </div>
                            <button
                                onClick={() => nav("/invoices?status=sent")}
                                className="bg-[#141414] p-5 text-left hover:bg-[#1c1c1c] transition-colors"
                            >
                                <div className="font-thunder uppercase tracking-tight text-paper text-5xl" style={{ fontWeight: 800 }}>
                                    {sentCount}
                                </div>
                                <div className="mt-3 text-[11px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>
                                    OUTSTANDING
                                </div>
                                <div className="text-[11px] uppercase tracking-wider3 text-muted mt-1" style={{ fontWeight: 300 }}>
                                    INVOICES
                                </div>
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
