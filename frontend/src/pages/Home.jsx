import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, MapPin, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, openEnrollmentPdf } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useGreeting } from "../lib/greeting";
import { SessionStatusPill } from "../components/Pills";
import WeatherIcon from "../components/WeatherIcon";
import { fmtMoney, fmtInvoiceDate, sessionRosterPreviewLabel, todayISO, fmtTime, formatAthletePrograms, effectiveSessionStatus } from "../lib/format";
import { AthleteFormModal } from "./AthleteForm";
import { Modal } from "../components/Modal";
import { toast } from "sonner";

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
    })
        .format(new Date(`${iso}T00:00:00`))
        .toUpperCase();
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

function SectionLabel({ children }) {
    return (
        <div className="text-[11px] uppercase tracking-wider3 text-paper font-thunder" style={{ fontWeight: 700 }}>
            {children}
        </div>
    );
}

function StatTile({ children, onClick, className = "" }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`bg-ink border border-subtle p-4 sm:p-5 text-left w-full min-w-0 ${onClick ? "hover:border-paper/30 transition-colors" : ""} ${className}`}
        >
            {children}
        </Tag>
    );
}

function WeatherWidget() {
    const [loadingWeather, setLoadingWeather] = useState(true);
    const [tempF, setTempF] = useState(null);
    const [weatherCode, setWeatherCode] = useState(null);
    const [desc, setDesc] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let mounted = true;
        async function loadWeather() {
            try {
                const r = await api.get("/weather");
                if (!mounted) return;
                setTempF(r.data.temp_f);
                setWeatherCode(r.data.weathercode);
                setDesc(r.data.description);
            } catch {
                if (!mounted) return;
                setErr(true);
            } finally {
                if (mounted) setLoadingWeather(false);
            }
        }

        loadWeather();
        return () => {
            mounted = false;
        };
    }, []);

    if (loadingWeather) {
        return <div className="w-fit text-xs sm:text-sm text-muted shrink-0 text-right">Loading weather…</div>;
    }
    if (err) {
        return <div className="w-fit text-xs sm:text-sm text-muted shrink-0 text-right">Weather unavailable</div>;
    }
    return (
        <div className="w-fit shrink-0 text-right">
            <div className="flex items-center justify-end gap-2">
                {weatherCode != null && <WeatherIcon code={weatherCode} size={26} className="sm:hidden shrink-0" />}
                {weatherCode != null && <WeatherIcon code={weatherCode} size={30} className="hidden sm:block shrink-0" />}
                <div className="font-thunder text-xl sm:text-2xl md:text-3xl leading-none whitespace-nowrap" style={{ fontWeight: 800 }}>
                    {tempF}°
                </div>
            </div>
            <div className="text-[11px] sm:text-xs text-muted mt-0.5 text-right whitespace-nowrap">{desc}</div>
        </div>
    );
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
    const [draftSummary, setDraftSummary] = useState({
        draft_count: 0,
        weekly_draft_count: 0,
        monthly_draft_count: 0,
        weekly_package_draft_count: 0,
        weekly_dropin_draft_count: 0,
        eat_athletes_missing_billing_count: 0,
        other_draft_count: 0,
        monthly_period_label: "",
        weekly_period: null,
    });
    const [draftCount, setDraftCount] = useState(0);
    const [sentCount, setSentCount] = useState(0);
    const [outstandingTotal, setOutstandingTotal] = useState(0);
    const [sessionsThisMonth, setSessionsThisMonth] = useState(0);
    const [revenueThisMonth, setRevenueThisMonth] = useState(0);
    const [readyToInvoice, setReadyToInvoice] = useState({ visible: false, total_sessions: 0, families: [] });
    const [readyToInvoiceOpen, setReadyToInvoiceOpen] = useState(false);
    const [readyToInvoiceLoading, setReadyToInvoiceLoading] = useState(false);
    const [pendingAthletes, setPendingAthletes] = useState([]);
    const [families, setFamilies] = useState([]);
    const [athleteFormOpen, setAthleteFormOpen] = useState(false);
    const [editingAthlete, setEditingAthlete] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    async function viewEnrollmentForms(athleteId, event) {
        event?.stopPropagation();
        event?.preventDefault();
        try {
            await openEnrollmentPdf(athleteId);
        } catch (err) {
            toast.error(formatApiError(err) || "Could not open enrollment forms");
        }
    }

    useEffect(() => {
        async function fetchDashboard() {
            setLoading(true);
            setError(null);
            try {
                const [todayResp, invoicesResp, monthlySessionsResp, pendingResp, familiesResp, draftSummaryResp] = await Promise.all([
                    api.get("/sessions", { params: { start_date: today, end_date: today } }),
                    api.get("/invoices"),
                    api.get("/sessions", { params: { start_date: monthStart, end_date: monthEnd } }),
                    api.get("/athletes", { params: { status: "pending" } }),
                    api.get("/families"),
                    api.get("/invoices/draft-summary"),
                ]);

                const sessions = (todayResp.data || [])
                    .slice()
                    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
                setTodaySessions(sessions);
                setDraftSummary(draftSummaryResp.data || {
                    draft_count: 0,
                    weekly_draft_count: 0,
                    monthly_draft_count: 0,
                    weekly_package_draft_count: 0,
                    weekly_dropin_draft_count: 0,
                    eat_athletes_missing_billing_count: 0,
                    other_draft_count: 0,
                    monthly_period_label: "",
                    weekly_period: null,
                });
                setDraftCount(draftSummaryResp.data?.draft_count ?? (invoicesResp.data || []).filter((inv) => inv.status === "draft").length);
                const sentInvoices = (invoicesResp.data || []).filter((inv) => inv.status === "sent");
                setSentCount(sentInvoices.length);
                setOutstandingTotal(sentInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0));
                setSessionsThisMonth(
                    (monthlySessionsResp.data || []).filter((session) => effectiveSessionStatus(session) === "completed").length
                );
                setPendingAthletes(pendingResp.data || []);
                setFamilies(familiesResp.data || []);

                const allInvoiceDetails = await Promise.all(
                    (invoicesResp.data || []).map((invoice) => api.get(`/invoices/${invoice.id}`))
                );

                const payments = allInvoiceDetails.flatMap((detail) => detail.data.payments || []);
                setRevenueThisMonth(
                    payments
                        .filter((payment) => String(payment.received_date || "").startsWith(currentMonthKey))
                        .reduce((sum, payment) => sum + Number(payment.amount_received || 0), 0)
                );

                const readyResp = await api.get("/invoices/ready-to-invoice");
                setReadyToInvoice(readyResp.data || { visible: false, total_sessions: 0, families: [] });
            } catch (e) {
                setError(e.response?.data?.detail || "Could not load dashboard data.");
            } finally {
                setLoading(false);
            }
        }

        fetchDashboard();
    }, [today, monthStart, monthEnd, currentMonthKey]);

    async function refreshPending() {
        try {
            const [pendingResp, familiesResp] = await Promise.all([
                api.get("/athletes", { params: { status: "pending" } }),
                api.get("/families"),
            ]);
            setPendingAthletes(pendingResp.data || []);
            setFamilies(familiesResp.data || []);
        } catch {
            /* keep existing list on refresh failure */
        }
    }

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
                map[todaySessions[index].id] = {
                    records: resp.data.records || [],
                    roster: resp.data.roster || [],
                };
            });
            setAttendanceMap(map);
        }

        fetchAttendance();
    }, [todaySessions]);

    async function openReadyToInvoice() {
        setReadyToInvoiceOpen(true);
        setReadyToInvoiceLoading(true);
        try {
            const r = await api.get("/invoices/ready-to-invoice");
            setReadyToInvoice(r.data || { visible: false, total_sessions: 0, families: [] });
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not load uninvoiced sessions");
        } finally {
            setReadyToInvoiceLoading(false);
        }
    }

    function createInvoiceForFamily(family) {
        const params = new URLSearchParams({ new: "true" });
        if (family.family_id) params.set("family_id", family.family_id);
        if (family.period_start) params.set("period_start", family.period_start);
        if (family.period_end) params.set("period_end", family.period_end);
        setReadyToInvoiceOpen(false);
        nav(`/invoices?${params.toString()}`);
    }

    const readyToInvoiceCount = readyToInvoice.total_sessions || 0;
    const readyToInvoiceFamilies = readyToInvoice.total_families || readyToInvoice.families?.length || 0;
    const billingWeek = readyToInvoice.billing_week;
    const readyToInvoiceDetail = readyToInvoice.summary
        || (billingWeek
            ? `Week ${fmtInvoiceDate(billingWeek.start)} – ${fmtInvoiceDate(billingWeek.end)} · ${readyToInvoiceCount} unbilled`
            : `${readyToInvoiceCount} unbilled session${readyToInvoiceCount === 1 ? "" : "s"}`);
    const sessionCards = todaySessions.slice(0, 4);
    const weeklyPeriod = draftSummary.weekly_period;
    const weeklyPackageCount = draftSummary.weekly_package_draft_count || 0;
    const weeklyDropinCount = draftSummary.weekly_dropin_draft_count || 0;
    const missingBillingCount = draftSummary.eat_athletes_missing_billing_count || 0;
    const weeklyDraftDetail = (() => {
        const parts = [];
        if (weeklyPeriod?.start && weeklyPeriod?.end) {
            parts.push(`Week ${fmtInvoiceDate(weeklyPeriod.start)} – ${fmtInvoiceDate(weeklyPeriod.end)}`);
        }
        parts.push(`${draftSummary.weekly_draft_count} ready to review`);
        if (weeklyPackageCount || weeklyDropinCount) {
            const bits = [];
            if (weeklyPackageCount) bits.push(`${weeklyPackageCount} package`);
            if (weeklyDropinCount) bits.push(`${weeklyDropinCount} drop-in`);
            parts.push(bits.join(" · "));
        }
        return parts.join(" · ");
    })();
    const monthlyDraftDetail = draftSummary.monthly_period_label
        ? `${draftSummary.monthly_period_label} · ${draftSummary.monthly_draft_count} ready to review`
        : `${draftSummary.monthly_draft_count} ready to review`;

    // One job per cue — only action-true items, no artificial 3-card cap
    const invoiceActions = [
        ...(missingBillingCount > 0
            ? [{
                count: missingBillingCount,
                label: "Billing Setup",
                detail: `${missingBillingCount} Eat w/ EAT athlete${missingBillingCount === 1 ? "" : "s"} missing cadence or tier`,
                onClick: () => nav("/roster"),
            }]
            : []),
        ...(draftSummary.weekly_draft_count > 0
            ? [{
                count: draftSummary.weekly_draft_count,
                label: "Weekly Drafts",
                detail: weeklyDraftDetail,
                onClick: () => nav("/invoices?status=draft"),
            }]
            : []),
        ...(draftSummary.monthly_draft_count > 0
            ? [{
                count: draftSummary.monthly_draft_count,
                label: "Monthly Drafts",
                detail: monthlyDraftDetail,
                onClick: () => nav("/invoices?status=draft"),
            }]
            : []),
        ...(readyToInvoiceCount > 0
            ? [{
                count: readyToInvoiceCount,
                label: "Ready to Invoice",
                detail: readyToInvoiceDetail,
                onClick: openReadyToInvoice,
            }]
            : []),
        ...(draftSummary.other_draft_count > 0
            ? [{
                count: draftSummary.other_draft_count,
                label: "Other Drafts",
                detail: `${draftSummary.other_draft_count} invoice${draftSummary.other_draft_count === 1 ? "" : "s"} not yet sent`,
                onClick: () => nav("/invoices?status=draft"),
            }]
            : []),
        ...(sentCount > 0
            ? [{
                count: sentCount,
                label: "Awaiting Payment",
                detail: `${sentCount} sent · ${fmtMoney(outstandingTotal)} outstanding`,
                onClick: () => nav("/invoices?status=sent"),
            }]
            : []),
    ].filter((item) => item.count > 0);

    const greetingLabel = `${greeting.toUpperCase()}, ${getUserLabel(coach?.name)}`;
    const topDateLabel = formatHeaderDate(today);

    return (
        <div className="w-full px-5 md:px-10 lg:px-12 pb-6 pt-8 md:pt-10 lg:pt-12">
            <header className="border-b border-subtle pb-6 md:pb-8">
                <div className="flex items-end justify-between gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] sm:tracking-[0.32em] lg:tracking-[0.45em] text-muted font-thunder leading-snug line-clamp-2 sm:line-clamp-none" style={{ fontWeight: 300 }}>
                            {topDateLabel}
                        </p>
                        <h1
                            className="mt-3 font-thunder uppercase text-3xl sm:text-4xl lg:text-5xl tracking-tight text-paper min-w-0 leading-[0.92] break-words"
                            style={{ fontWeight: 800 }}
                        >
                            {greetingLabel}
                        </h1>
                    </div>
                    <WeatherWidget />
                </div>
            </header>

            <div className="mt-6 md:mt-8 lg:mt-10 grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-12 xl:gap-10">
                <section className="min-w-0 space-y-4 md:space-y-5 xl:col-span-7">
                    <SectionLabel>Today</SectionLabel>

                    {loading ? (
                        <div className="text-muted text-sm py-6 md:py-8">Loading…</div>
                    ) : error ? (
                        <div className="text-danger text-sm py-6 md:py-8">{error}</div>
                    ) : sessionCards.length === 0 ? (
                        <div className="text-sm text-muted py-2">No sessions scheduled for today.</div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {sessionCards.map((session) => {
                                const att = attendanceMap[session.id] || {};
                                const attendanceLabel = sessionRosterPreviewLabel(session, {
                                    records: att.records,
                                    roster: att.roster,
                                });
                                return (
                                    <button
                                        key={session.id}
                                        type="button"
                                        onClick={() => nav(`/sessions/${session.id}`)}
                                        className="relative bg-mid border border-subtle p-4 sm:p-5 text-left hover:border-paper/30 transition-colors flex items-start gap-3 sm:gap-4 w-full min-h-[44px]"
                                    >
                                        <span
                                            className={`absolute left-0 top-0 bottom-0 w-0.5 ${TYPE_BAR[session.session_type] || "bg-subtle"}`}
                                        />
                                        <div className="flex-1 min-w-0 pl-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="font-thunder uppercase tracking-tight text-paper text-xl sm:text-2xl leading-none" style={{ fontWeight: 800 }}>
                                                        {fmtTime(session.start_time) || "—"}
                                                        {session.end_time ? (
                                                            <span className="text-muted text-lg sm:text-xl">
                                                                {" "}
                                                                – {fmtTime(session.end_time)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-xs sm:text-sm text-muted uppercase tracking-wider2 mt-1.5 sm:mt-2" style={{ fontWeight: 500 }}>
                                                        {session.session_type?.replace(/_/g, " ")}
                                                    </div>
                                                </div>
                                                <div className="shrink-0">
                                                    <SessionStatusPill session={session} />
                                                </div>
                                            </div>
                                            {(session.location || attendanceLabel) ? (
                                                <div className="mt-3 sm:mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs sm:text-sm text-muted font-light">
                                                    {session.location ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <MapPin size={13} strokeWidth={1.5} />
                                                            {session.location}
                                                        </span>
                                                    ) : null}
                                                    {attendanceLabel ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <Users size={13} strokeWidth={1.5} />
                                                            {attendanceLabel}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {todaySessions.length > 4 ? (
                        <div className="pt-1 sm:pt-3 text-right">
                            <button
                                type="button"
                                onClick={() => nav("/")}
                                className="inline-flex items-center gap-1 text-xs sm:text-sm uppercase tracking-wider2 text-paper/80 hover:text-paper min-h-[44px] px-1"
                            >
                                View all
                                <ChevronRight size={16} strokeWidth={2} />
                            </button>
                        </div>
                    ) : null}
                </section>

                <div className="min-w-0 space-y-6 md:space-y-8 xl:col-span-5">
                    <section className="space-y-3 md:space-y-4">
                        <SectionLabel>Needs Attention</SectionLabel>
                        {loading ? (
                            <div className="text-muted text-sm py-6 md:py-8">Loading…</div>
                        ) : pendingAthletes.length === 0 && invoiceActions.length === 0 ? (
                            <div className="text-sm text-muted">You&apos;re all caught up.</div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {pendingAthletes.map((athlete) => (
                                    <button
                                        key={athlete.id}
                                        type="button"
                                        onClick={() => {
                                            setEditingAthlete(athlete);
                                            setAthleteFormOpen(true);
                                        }}
                                        className="relative bg-mid border border-accent/40 p-4 sm:p-5 text-left hover:border-paper/30 transition-colors flex items-start justify-between gap-3 w-full min-h-[44px]"
                                    >
                                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
                                        <div className="pl-3 min-w-0 flex-1">
                                            <div className="font-thunder uppercase tracking-tight text-paper text-sm sm:text-base" style={{ fontWeight: 700 }}>
                                                Pending Enrollment
                                            </div>
                                            <div className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted font-light leading-relaxed flex items-start justify-between gap-3">
                                                <span className="min-w-0">
                                                    {athlete.full_name}
                                                    <span className="text-muted/80"> · {formatAthletePrograms(athlete)}</span>
                                                </span>
                                                {athlete.waiver_signature ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => viewEnrollmentForms(athlete.id, e)}
                                                        className="shrink-0 text-accent hover:underline text-xs sm:text-sm"
                                                    >
                                                        View Forms
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-muted shrink-0 mt-0.5" strokeWidth={2} />
                                    </button>
                                ))}
                                {invoiceActions.map((action) => (
                                    <button
                                        key={action.label}
                                        type="button"
                                        onClick={action.onClick}
                                        className="relative bg-mid border border-subtle p-4 sm:p-5 text-left hover:border-paper/30 transition-colors flex items-start justify-between gap-3 w-full min-h-[44px]"
                                    >
                                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
                                        <div className="pl-3 min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <div className="font-thunder uppercase tracking-tight text-paper text-sm sm:text-base" style={{ fontWeight: 700 }}>
                                                    {action.label}
                                                </div>
                                                <div className="font-thunder text-paper text-lg sm:text-xl leading-none shrink-0" style={{ fontWeight: 800 }}>
                                                    {action.count}
                                                </div>
                                            </div>
                                            <div className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted font-light leading-relaxed">
                                                {action.detail}
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-muted shrink-0 mt-0.5" strokeWidth={2} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-3 md:space-y-4">
                        <SectionLabel>This Month</SectionLabel>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                            <StatTile>
                                <div className="font-thunder uppercase tracking-tight text-paper text-3xl sm:text-4xl xl:text-3xl 2xl:text-4xl leading-none" style={{ fontWeight: 800 }}>
                                    {sessionsThisMonth}
                                </div>
                                <div className="mt-2 sm:mt-3 text-[10px] sm:text-[11px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>
                                    Sessions
                                </div>
                                <div className="text-[10px] sm:text-[11px] uppercase tracking-wider3 text-muted mt-0.5" style={{ fontWeight: 300 }}>
                                    This month
                                </div>
                            </StatTile>
                            <StatTile>
                                <div className="font-thunder uppercase tracking-tight text-paper text-2xl sm:text-3xl lg:text-2xl xl:text-3xl 2xl:text-4xl leading-none break-words" style={{ fontWeight: 800 }}>
                                    {fmtMoney(revenueThisMonth)}
                                </div>
                                <div className="mt-2 sm:mt-3 text-[10px] sm:text-[11px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>
                                    Revenue
                                </div>
                                <div className="text-[10px] sm:text-[11px] uppercase tracking-wider3 text-muted mt-0.5" style={{ fontWeight: 300 }}>
                                    This month
                                </div>
                            </StatTile>
                            <StatTile onClick={() => nav("/invoices?status=sent")}>
                                <div className="font-thunder uppercase tracking-tight text-paper text-3xl sm:text-4xl xl:text-3xl 2xl:text-4xl leading-none" style={{ fontWeight: 800 }}>
                                    {sentCount}
                                </div>
                                <div className="mt-2 sm:mt-3 text-[10px] sm:text-[11px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>
                                    Outstanding
                                </div>
                                <div className="text-[10px] sm:text-[11px] uppercase tracking-wider3 text-muted mt-0.5" style={{ fontWeight: 300 }}>
                                    Invoices
                                </div>
                            </StatTile>
                        </div>
                    </section>
                </div>
            </div>

            <AthleteFormModal
                open={athleteFormOpen}
                onOpenChange={setAthleteFormOpen}
                athlete={editingAthlete}
                families={families}
                onSaved={() => {
                    setAthleteFormOpen(false);
                    refreshPending();
                }}
            />

            <Modal
                open={readyToInvoiceOpen}
                onOpenChange={setReadyToInvoiceOpen}
                title="Ready to Invoice"
                description="Unbilled charges with no draft yet — package-covered Eat days are excluded"
                maxW="max-w-xl"
            >
                {readyToInvoiceLoading ? (
                    <div className="text-center py-8 text-muted uppercase tracking-wider2 text-sm">Loading…</div>
                ) : readyToInvoiceCount === 0 ? (
                    <div className="text-sm text-muted font-light py-4">
                        Nothing waiting. Monthly and weekly package coverage is already handled, and remaining sessions are on drafts or paid invoices.
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-muted font-light">
                            {readyToInvoice.summary || (
                                <>
                                    {readyToInvoiceCount} session{readyToInvoiceCount === 1 ? "" : "s"} across{" "}
                                    {readyToInvoiceFamilies} famil
                                    {readyToInvoiceFamilies === 1 ? "y" : "ies"} need a new invoice.
                                </>
                            )}
                        </p>
                        <div className="flex flex-col gap-3">
                            {(readyToInvoice.families || []).map((family) => (
                                <div key={family.family_id} className="border border-subtle bg-ink p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-thunder uppercase text-paper text-sm sm:text-base" style={{ fontWeight: 700 }}>
                                                {family.family_name} Family
                                            </div>
                                            <div className="text-xs text-muted font-light mt-1">
                                                {family.session_count} session{family.session_count === 1 ? "" : "s"}
                                                {family.period_start && family.period_end ? (
                                                    <span>
                                                        {" "}
                                                        · {fmtInvoiceDate(family.period_start)}
                                                        {family.period_end !== family.period_start
                                                            ? ` – ${fmtInvoiceDate(family.period_end)}`
                                                            : ""}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => createInvoiceForFamily(family)}
                                            className="shrink-0 text-[10px] uppercase tracking-wider2 text-accent hover:underline"
                                        >
                                            Create invoice
                                        </button>
                                    </div>
                                    <ul className="mt-3 flex flex-col gap-2 border-t border-subtle pt-3">
                                        {(family.athletes || []).map((athlete) => (
                                            <li key={athlete.athlete_id} className="flex items-baseline justify-between gap-3 text-sm">
                                                <span className="text-paper font-light min-w-0 truncate">{athlete.athlete_name}</span>
                                                <span className="text-muted text-xs shrink-0 text-right">
                                                    {athlete.detail || athlete.reason}
                                                    {athlete.date_start && athlete.date_end && athlete.date_end !== athlete.date_start ? (
                                                        <span className="block text-[10px] mt-0.5">
                                                            {fmtInvoiceDate(athlete.date_start)} – {fmtInvoiceDate(athlete.date_end)}
                                                        </span>
                                                    ) : athlete.date_start ? (
                                                        <span className="block text-[10px] mt-0.5">{fmtInvoiceDate(athlete.date_start)}</span>
                                                    ) : null}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
