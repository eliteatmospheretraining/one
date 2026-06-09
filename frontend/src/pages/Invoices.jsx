import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { DateField } from "../components/DateField";
import { MoneyField } from "../components/MoneyField";
import { PaymentMethodField } from "../components/PaymentMethodField";
import { addPaymentMethodPreset } from "../lib/paymentMethodPresets";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    SelectGroup,
    SelectLabel,
} from "../components/ui/select";
import { InvoiceStatusPill } from "../components/Pills";
import { INVOICES } from "../lib/testIds";
import {
    fmtInvoiceDate,
    fmtMoney,
    formatMoneyInputValue,
    fridayOfWeekContaining,
    parseMoneyInput,
    todayISO,
} from "../lib/format";
import { Plus, Send, Trash2, DollarSign, ChevronLeft, ChevronRight, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/** First calendar year with billing data — revenue view won't go earlier than this. */
const FIRST_DATA_YEAR = 2026;

const DESKTOP_INVOICE_FILTERS = [
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "last_3_months", label: "Last 3 Months" },
    { value: "all", label: "All" },
];

const MOBILE_INVOICE_FILTERS = [
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "all", label: "All" },
];

function lastDayOfMonthIso(iso) {
    const [y, m] = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(y, m, 0).toISOString().slice(0, 10);
}

export default function Invoices() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [invoices, setInvoices] = useState([]);
    const [invoiceDetails, setInvoiceDetails] = useState({});
    const [families, setFamilies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [generatePresets, setGeneratePresets] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const currentCalendarYear = new Date().getFullYear();
    const revenueYearMax = Math.max(FIRST_DATA_YEAR, currentCalendarYear);
    const [selectedYear, setSelectedYear] = useState(revenueYearMax);
    const [invoiceFilter, setInvoiceFilter] = useState("this_month");

    async function load() {
        setLoading(true);
        try {
            const [inv, fam] = await Promise.all([api.get("/invoices"), api.get("/families")]);
            setInvoices(inv.data);
            setFamilies(fam.data);
            // fetch invoice details (payments, line_items) for metrics
            try {
                const details = await Promise.all((inv.data || []).map((i) => api.get(`/invoices/${i.id}`).catch(() => null)));
                const map = {};
                details.forEach((d) => { if (d && d.data && d.data.invoice) map[d.data.invoice.id] = d.data; });
                setInvoiceDetails(map);
            } catch (e) { /* ignore detail fetch failures */ }
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)");
        const sync = () => {
            if (mq.matches && invoiceFilter === "last_3_months") {
                setInvoiceFilter("all");
            }
        };
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, [invoiceFilter]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        let changed = false;
        const openId = next.get("open");
        if (openId) {
            setDetailId(openId);
            next.delete("open");
            changed = true;
        }
        if (next.get("new") === "true") {
            setGenerateOpen(true);
            const presets = {};
            const familyId = next.get("family_id");
            const periodStart = next.get("period_start");
            const periodEnd = next.get("period_end");
            if (familyId) presets.familyId = familyId;
            if (periodStart) presets.periodStart = periodStart;
            if (periodEnd) presets.periodEnd = periodEnd;
            if (Object.keys(presets).length) setGeneratePresets(presets);
            next.delete("new");
            next.delete("family_id");
            next.delete("period_start");
            next.delete("period_end");
            changed = true;
        }
        if (changed) setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const famById = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

    const metricsForYear = useMemo(() => {
        const yearStr = String(selectedYear);
        let totalInvoiced = 0;
        let collected = 0;
        let outstanding = 0;
        const monthly = Array.from({ length: 12 }, () => 0);

        (invoices || []).forEach((inv) => {
            const issue = String(inv.issue_date || "");
            const invYearMatches = issue.startsWith(yearStr);
            if (invYearMatches) totalInvoiced += Number(inv.total || 0);
            const details = invoiceDetails[inv.id];
            const payments = (details && details.payments) || [];
            const paidForThisInvoice = payments.reduce((s, p) => s + Number(p.amount_received || 0), 0);
            // collected: payments received in selected year (counting payments across invoices)
            payments.forEach((p) => {
                const rd = String(p.received_date || "");
                if (rd.startsWith(yearStr)) {
                    collected += Number(p.amount_received || 0);
                    const month = Number((rd || "").slice(5, 7)) || 0;
                    if (month >= 1 && month <= 12) monthly[month - 1] += Number(p.amount_received || 0);
                }
            });
            // outstanding: invoices that are sent and belong to the year (issue_date), minus payments (all payments)
            if (inv.status === "sent" && invYearMatches) {
                outstanding += Math.max(0, Number(inv.total || 0) - paidForThisInvoice);
            }
        });

        const mrR = Math.round((monthly.reduce((s, v) => s + v, 0) / 12) || 0);
        return { totalInvoiced, collected, outstanding, monthly, mrrAvg: mrR };
    }, [invoices, invoiceDetails, selectedYear]);

    const filteredInvoices = useMemo(() => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        return (invoices || []).filter((inv) => {
            const issueDate = new Date(`${inv.issue_date}T00:00:00`);
            const invMonth = issueDate.getMonth();
            const invYear = issueDate.getFullYear();

            if (invoiceFilter === "this_month") {
                return invMonth === currentMonth && invYear === currentYear;
            } else if (invoiceFilter === "last_month") {
                const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                return invMonth === lastMonth && invYear === lastMonthYear;
            } else if (invoiceFilter === "last_3_months") {
                const threeMonthsAgo = new Date(today);
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                return issueDate >= threeMonthsAgo;
            }
            return true;
        });
    }, [invoices, invoiceFilter]);

    return (
        <div>
            <PageHeader subtitle="Billing" title="Revenue" testId="page-invoices-header" />

            <div className="w-full px-5 md:px-10 lg:px-12 mt-8 pb-10 flex flex-col gap-6">
                <section className="border border-subtle">
                    <div className="grid grid-cols-[auto_1fr_auto] items-center border-b border-subtle">
                        <button
                            type="button"
                            onClick={() => setSelectedYear((y) => Math.max(FIRST_DATA_YEAR, y - 1))}
                            className="h-11 px-3 flex items-center justify-center text-muted hover:text-paper hover:bg-subtle/50 disabled:opacity-30 disabled:pointer-events-none border-r border-subtle"
                            aria-label="Previous year"
                            disabled={selectedYear <= FIRST_DATA_YEAR}
                        >
                            <ChevronLeft size={18} strokeWidth={1.75} />
                        </button>
                        <span
                            className="text-center font-thunder uppercase tracking-tight text-lg tabular-nums px-3 border-x border-subtle py-2.5"
                            style={{ fontWeight: 800 }}
                        >
                            {selectedYear}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedYear((y) => Math.min(revenueYearMax, y + 1))}
                            className="h-11 px-3 flex items-center justify-end text-muted hover:text-paper hover:bg-subtle/50 disabled:opacity-30 disabled:pointer-events-none border-l border-subtle"
                            aria-label="Next year"
                            disabled={selectedYear >= revenueYearMax}
                        >
                            <ChevronRight size={18} strokeWidth={1.75} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-subtle">
                        <div className="bg-ink p-3 sm:p-4 text-center min-w-0">
                            <div className="text-[11px] sm:text-sm text-muted uppercase tracking-wide">Total Invoiced</div>
                            <div className="text-xl sm:text-2xl font-thunder mt-1 leading-none" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.totalInvoiced)}</div>
                        </div>
                        <div className="bg-ink p-3 sm:p-4 text-center min-w-0">
                            <div className="text-[11px] sm:text-sm text-muted uppercase tracking-wide">Collected</div>
                            <div className="text-xl sm:text-2xl font-thunder mt-1 leading-none" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.collected)}</div>
                        </div>
                        <div className="bg-ink p-3 sm:p-4 text-center min-w-0">
                            <div className="text-[11px] sm:text-sm text-muted uppercase tracking-wide">Outstanding</div>
                            <div className="text-xl sm:text-2xl font-thunder mt-1 leading-none" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.outstanding)}</div>
                        </div>
                        <div className="bg-ink p-3 sm:p-4 text-center min-w-0">
                            <div className="text-[11px] sm:text-sm text-muted uppercase tracking-wide">MRR (avg)</div>
                            <div className="text-xl sm:text-2xl font-thunder mt-1 leading-none" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.mrrAvg)}</div>
                        </div>
                    </div>
                </section>

                <div className="flex items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-none flex-nowrap md:overflow-visible md:flex-wrap">
                        <div className="text-sm text-muted uppercase tracking-wider2 shrink-0" style={{ fontWeight: 500 }}>Filter:</div>
                        <div className="hidden md:flex items-center gap-2 flex-wrap">
                            {DESKTOP_INVOICE_FILTERS.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setInvoiceFilter(f.value)}
                                    className={`shrink-0 text-xs uppercase tracking-wider2 px-3 py-1 rounded transition-colors ${
                                        invoiceFilter === f.value ? "bg-paper text-ink" : "border border-subtle text-paper hover:text-accent"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex md:hidden items-center gap-2 flex-nowrap">
                            {MOBILE_INVOICE_FILTERS.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setInvoiceFilter(f.value)}
                                    className={`shrink-0 text-xs uppercase tracking-wider2 px-3 py-1 rounded transition-colors ${
                                        invoiceFilter === f.value ? "bg-paper text-ink" : "border border-subtle text-paper hover:text-accent"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        data-testid={INVOICES.newBtn}
                        onClick={() => setGenerateOpen(true)}
                        disabled={families.length === 0}
                        aria-label="New invoice"
                        className="shrink-0 inline-flex items-center justify-center eat-btn-primary disabled:opacity-50 h-9 w-9 p-0 md:h-auto md:w-auto md:px-4 md:py-2.5"
                    >
                        <Plus size={18} strokeWidth={1.75} className="md:hidden" />
                        <Plus size={14} strokeWidth={1.75} className="hidden md:block mr-1.5" />
                        <span className="hidden md:inline uppercase tracking-wider2 text-sm" style={{ fontWeight: 500 }}>
                            New Invoice
                        </span>
                    </button>
                </div>
                {loading ? (
                    <div className="text-center py-10 text-muted uppercase tracking-wider2 text-sm">Loading…</div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="bg-mid border border-subtle p-5 text-center text-muted">
                        {invoices.length === 0 ? (
                            <div className="font-light">No invoices yet</div>
                        ) : (
                            <div className="font-light">No invoices match the selected filter</div>
                        )}
                    </div>
                ) : (
                    <div className="bg-mid border border-subtle overflow-y-auto" style={{ maxHeight: "400px" }}>
                        {filteredInvoices.map((inv) => {
                            const fam = famById[inv.family_id];
                            return (
                                <button
                                    key={inv.id}
                                    data-testid={INVOICES.card(inv.id)}
                                    onClick={() => setDetailId(inv.id)}
                                    className="w-full p-5 text-left hover:bg-subtle transition-colors border-b border-subtle last:border-b-0"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-thunder text-2xl uppercase tracking-tight text-paper leading-none" style={{ fontWeight: 500 }}>{inv.invoice_number}</div>
                                            <div className="text-sm text-paper mt-2 font-light">{fam?.family_name || "—"} Family</div>
                                            <div className="text-xs text-muted mt-1 font-light">
                                                {fmtInvoiceDate(inv.period_start)} – {fmtInvoiceDate(inv.period_end)}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <InvoiceStatusPill status={inv.status} testId={`invoice-status-${inv.id}`} />
                                            <div className="eat-numeral text-3xl mt-2">{fmtMoney(inv.total)}</div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Larger MRR chart — rendered last */}
                <div className="bg-mid border border-subtle p-6">
                    <div className="text-sm text-muted mb-3">Monthly Revenue ({selectedYear})</div>
                    <div className="w-full h-48 flex items-stretch gap-2 sm:gap-3">
                        {(() => {
                            const max = Math.max(...metricsForYear.monthly, 1);
                            const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            return metricsForYear.monthly.map((val, idx) => {
                                const pct = val > 0 ? Math.max(8, Math.round((val / max) * 100)) : 0;
                                return (
                                    <div key={idx} className="flex-1 min-w-0 h-full flex flex-col items-center">
                                        <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-end gap-1">
                                            {val > 0 && (
                                                <div className="text-[10px] sm:text-xs text-paper font-light leading-none">
                                                    {fmtMoney(val)}
                                                </div>
                                            )}
                                            <div
                                                className="w-4 sm:w-5 bg-paper rounded-sm"
                                                style={{ height: pct ? `${pct}%` : 0, minHeight: val > 0 ? 4 : 0 }}
                                                title={val > 0 ? fmtMoney(val) : undefined}
                                            />
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-muted shrink-0 pt-1.5">{monthLabels[idx]}</div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            </div>

            <GenerateInvoiceModal
                open={generateOpen}
                onOpenChange={(v) => { setGenerateOpen(v); if (!v) setGeneratePresets(null); }}
                families={families}
                presets={generatePresets}
                onCreated={(invId) => { setGenerateOpen(false); setGeneratePresets(null); load(); setDetailId(invId); }}
            />

            {detailId && (
                <InvoiceDetailModal
                    invoiceId={detailId}
                    open={!!detailId}
                    onOpenChange={(v) => !v && setDetailId(null)}
                    onChanged={load}
                />
            )}
        </div>
    );
}

function DraftLineEditor({ invoiceId, athletes, periodStart, periodEnd, onAdded }) {
    const [services, setServices] = useState([]);
    const [athleteId, setAthleteId] = useState("");
    const [serviceId, setServiceId] = useState("");
    const [weekStart, setWeekStart] = useState(periodStart || "");
    const [weekEnd, setWeekEnd] = useState(periodEnd || "");
    const [serviceDate, setServiceDate] = useState(periodStart || "");
    const [busy, setBusy] = useState(false);

    const selectedService = services.find((s) => s.id === serviceId);
    const needsWeek = selectedService?.needs_week_range;
    const needsDate = selectedService?.needs_service_date;

    const servicesByGroup = useMemo(() => {
        const map = {};
        services.forEach((s) => {
            const g = s.group || "Services";
            if (!map[g]) map[g] = [];
            map[g].push(s);
        });
        return map;
    }, [services]);

    useEffect(() => {
        api.get("/invoices/service-options")
            .then((r) => setServices(r.data || []))
            .catch(() => setServices([]));
    }, []);

    useEffect(() => {
        if (!athleteId && athletes.length) setAthleteId(athletes[0].id);
        if (!serviceId && services.length) setServiceId(services[0].id);
    }, [athletes, services, athleteId, serviceId]);

    useEffect(() => {
        const start = periodStart || "";
        setServiceDate(start);
        setWeekStart(start);
        if (needsWeek && start) {
            setWeekEnd(fridayOfWeekContaining(start));
        } else {
            setWeekEnd(periodEnd || "");
        }
    }, [periodStart, periodEnd, needsWeek]);

    function onServiceChange(id) {
        setServiceId(id);
        const svc = services.find((s) => s.id === id);
        if (svc?.needs_week_range) {
            const start = weekStart || periodStart || "";
            if (start) {
                setWeekStart(start);
                setWeekEnd(fridayOfWeekContaining(start));
            }
        }
    }

    function onWeekStartChange(iso) {
        setWeekStart(iso);
        if (iso) setWeekEnd(fridayOfWeekContaining(iso));
    }

    async function addLine(e) {
        e.preventDefault();
        if (!athleteId || !serviceId) {
            toast.error("Select an athlete and service");
            return;
        }
        setBusy(true);
        try {
            const body = { athlete_id: athleteId, service_id: serviceId, quantity: 1 };
            if (needsWeek) {
                body.week_start = weekStart;
                body.week_end = weekEnd;
            }
            if (needsDate) {
                body.service_date = serviceDate;
            }
            await api.post(`/invoices/${invoiceId}/line-items`, body);
            toast.success("Service added");
            onAdded?.();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Could not add line");
        } finally {
            setBusy(false);
        }
    }

    if (!athletes.length) {
        return (
            <p className="text-xs text-muted font-light py-3 border-t border-subtle">
                Add an athlete to this family before adding invoice lines.
            </p>
        );
    }

    return (
        <form onSubmit={addLine} className="border-t border-subtle pt-4 mt-2 flex flex-col gap-3">
            <div className="eat-label">Add service</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="text-[10px] uppercase tracking-wider2 text-muted">Athlete</label>
                    <Select value={athleteId} onValueChange={setAthleteId}>
                        <SelectTrigger data-testid={INVOICES.lineAthleteSelect} className="mt-1 h-10">
                            <SelectValue placeholder="Athlete" />
                        </SelectTrigger>
                        <SelectContent>
                            {athletes.map((a) => (
                                <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider2 text-muted">Service</label>
                    <Select value={serviceId} onValueChange={onServiceChange}>
                        <SelectTrigger data-testid={INVOICES.serviceSelect} className="mt-1 h-10">
                            <SelectValue placeholder="Service" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(servicesByGroup).map(([group, items]) => (
                                <SelectGroup key={group}>
                                    <SelectLabel className="text-[10px] uppercase tracking-wider2 text-muted px-2 py-1.5">
                                        {group}
                                    </SelectLabel>
                                    {items.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.label} · {fmtMoney(s.default_unit_price)}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {needsWeek && (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] uppercase tracking-wider2 text-muted">Week start</label>
                        <div className="mt-1"><DateField value={weekStart} onChange={onWeekStartChange} required /></div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-wider2 text-muted">Week end</label>
                        <div className="mt-1"><DateField value={weekEnd} onChange={setWeekEnd} required /></div>
                    </div>
                </div>
            )}
            {needsDate && !needsWeek && (
                <div>
                    <label className="text-[10px] uppercase tracking-wider2 text-muted">Service date</label>
                    <div className="mt-1"><DateField value={serviceDate} onChange={setServiceDate} required /></div>
                </div>
            )}
            <button
                type="submit"
                data-testid={INVOICES.addLineBtn}
                disabled={busy || !services.length}
                className="eat-btn-secondary w-full sm:w-auto"
            >
                {busy ? "Adding…" : "Add to invoice"}
            </button>
        </form>
    );
}

function GenerateInvoiceModal({ open, onOpenChange, families, presets, onCreated }) {
    const [familyId, setFamilyId] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState(todayISO());
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            const d = new Date();
            d.setDate(1);
            const monthStart = d.toISOString().slice(0, 10);
            const defaultFamily = families[0]?.id || "";
            const presetFamily = presets?.familyId && families.some((f) => f.id === presets.familyId)
                ? presets.familyId
                : defaultFamily;
            setFamilyId(presetFamily);
            setStart(presets?.periodStart || monthStart);
            setEnd(presets?.periodEnd || lastDayOfMonthIso(presets?.periodStart || monthStart));
        }
    }, [open, families, presets]);

    function onPeriodStartChange(iso) {
        setStart(iso);
        if (iso) setEnd(lastDayOfMonthIso(iso));
    }

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await api.post("/invoices/generate", { family_id: familyId, period_start: start, period_end: end });
            const inv = r.data.invoice;
            const lineCount = r.data.line_items?.length ?? 0;
            const verb = r.data.reused_draft ? "Updated" : "Created";
            if (lineCount > 0) {
                toast.success(
                    `${verb} ${inv.invoice_number} · ${lineCount} line${lineCount === 1 ? "" : "s"} · ${fmtMoney(r.data.total ?? inv.total)}`
                );
            } else {
                toast.message(`${verb} ${inv.invoice_number}`, {
                    description: r.data.message || "No billable attendance in this period",
                });
            }
            onCreated?.(r.data.invoice.id);
        } catch (e) {
            toast.error(formatApiError(e) || "Generate failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Create invoice">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Family</label>
                    <Select value={familyId} onValueChange={(v) => setFamilyId(v)}>
                        <SelectTrigger data-testid={INVOICES.familySelect} className="mt-1.5 h-11">
                            <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                            {families.map((f) => (
                                <SelectItem key={f.id} value={f.id}>{f.family_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Period Start</label>
                        <div className="mt-1.5"><DateField value={start} onChange={onPeriodStartChange} data-testid={INVOICES.periodStart} required /></div>
                    </div>
                    <div>
                        <label className="eat-label">Period End</label>
                        <div className="mt-1.5"><DateField value={end} onChange={setEnd} data-testid={INVOICES.periodEnd} required /></div>
                    </div>
                </div>
                <button data-testid={INVOICES.generateBtn} disabled={busy} type="submit" className="eat-btn-primary w-full mt-2">
                    {busy ? "Creating…" : "Create invoice"}
                </button>
            </form>
        </Modal>
    );
}

function InvoiceDetailModal({ invoiceId, open, onOpenChange, onChanged }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [payOpen, setPayOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.get(`/invoices/${invoiceId}`, {
                params: { sync: true },
            });
            setData(r.data);
        } catch (e) {
            toast.error("Could not load invoice");
        } finally {
            setLoading(false);
        }
    }, [invoiceId]);
    useEffect(() => {
        if (open) load();
    }, [open, load]);

    async function send() {
        if (!window.confirm("Email the guardian a magic link to view this invoice (PDF attached)?")) return;
        try {
            const r = await api.post(`/invoices/${invoiceId}/send`);
            toast.success("Invoice emailed with magic link");
            if (r.data?.dev_magic_url) {
                toast.message("Dev link", { description: r.data.dev_magic_url, duration: 12000 });
            }
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Send failed");
        }
    }

    async function sendReceipt() {
        const isResend = Boolean(data?.invoice?.receipt_sent_at);
        const prompt = isResend
            ? "Resend the paid receipt email with a magic link?"
            : "Email the guardian their paid invoice receipt (PDF attached)?";
        if (!window.confirm(prompt)) return;
        try {
            const r = await api.post(`/invoices/${invoiceId}/send-receipt`);
            toast.success(isResend ? "Receipt re-sent" : "Receipt emailed");
            if (r.data?.dev_magic_url) {
                toast.message("Dev link", { description: r.data.dev_magic_url, duration: 12000 });
            }
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Send failed");
        }
    }

    async function refreshFromAttendance() {
        setRefreshing(true);
        try {
            const r = await api.post(`/invoices/${invoiceId}/refresh`);
            toast.success(r.data.message || "Invoice refreshed from training");
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not refresh invoice");
        } finally {
            setRefreshing(false);
        }
    }

    async function removeLine(lineItemId) {
        try {
            await api.delete(`/invoices/${invoiceId}/line-items/${lineItemId}`);
            toast.success("Line removed");
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not remove line");
        }
    }

    async function confirmDeleteDraft() {
        setDeleting(true);
        try {
            await api.delete(`/invoices/${invoiceId}`);
            toast.success("Deleted");
            setDeleteOpen(false);
            onOpenChange(false);
            onChanged?.();
        } catch (e) {
            toast.error("Delete failed");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title={(
                <span className="inline-flex items-center gap-2.5">
                    {data?.invoice?.invoice_number || "Invoice"}
                    {data?.invoice?.status === "draft" && (
                        <button
                            type="button"
                            data-testid={INVOICES.refreshBtn}
                            onClick={refreshFromAttendance}
                            disabled={refreshing || loading}
                            title="Refresh from training attendance"
                            aria-label="Refresh from training attendance"
                            className="inline-flex items-center justify-center text-muted hover:text-accent transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={16} strokeWidth={1.75} className={refreshing ? "animate-spin" : ""} />
                        </button>
                    )}
                </span>
            )}
            maxW="max-w-2xl"
        >
            {loading || !data ? (
                <div className="text-center py-10 text-muted uppercase tracking-wider2 text-sm">Loading…</div>
            ) : (
                <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <div className="eat-label">Billed To</div>
                            <div className="text-paper text-base mt-0.5" style={{ fontWeight: 500 }}>{data.family?.family_name} Family</div>
                            <div className="text-sm text-muted font-light">{data.family?.guardian_name} · {data.family?.guardian_email}</div>
                        </div>
                        <InvoiceStatusPill status={data.invoice.status} testId={`detail-status-${invoiceId}`} />
                    </div>
                    <div className="flex items-center gap-8 text-sm">
                        <div><div className="eat-label">Period</div><div className="text-paper mt-0.5" style={{ fontWeight: 500 }}>{fmtInvoiceDate(data.invoice.period_start)} – {fmtInvoiceDate(data.invoice.period_end)}</div></div>
                        <div><div className="eat-label">Issued</div><div className="text-paper mt-0.5" style={{ fontWeight: 500 }}>{fmtInvoiceDate(data.invoice.issue_date)}</div></div>
                    </div>

                    <div className="border-t border-subtle pt-3">
                        <div className="grid grid-cols-12 pb-2 eat-label">
                            <div className="col-span-7">Service</div>
                            <div className="col-span-2 text-right">Qty</div>
                            <div className="col-span-3 text-right">Amount</div>
                        </div>
                        {data.line_items.length === 0 && (
                            <div className="py-4 text-sm text-muted font-light">
                                No billable attendance in this period.
                            </div>
                        )}
                        {data.line_items.map((li) => (
                            <div key={li.id} className="grid grid-cols-12 py-3 border-t border-subtle text-sm items-start gap-2">
                                <div className="col-span-7">
                                    <div className="text-paper" style={{ fontWeight: 500 }}>{li.athlete_name}</div>
                                    <div className="text-xs text-muted font-light mt-0.5">{li.description}</div>
                                </div>
                                <div className="col-span-2 text-right text-paper font-light">{li.quantity}</div>
                                <div className="col-span-3 text-right flex flex-col items-end gap-1">
                                    <span className="text-paper" style={{ fontWeight: 500 }}>{fmtMoney(li.amount)}</span>
                                    {data.invoice.status === "draft" && (
                                        <button
                                            type="button"
                                            onClick={() => removeLine(li.id)}
                                            className="text-[10px] uppercase tracking-wider2 text-muted hover:text-danger"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {data.invoice.status === "draft" && (
                            <DraftLineEditor
                                invoiceId={invoiceId}
                                athletes={data.athletes || []}
                                periodStart={data.invoice.period_start}
                                periodEnd={data.invoice.period_end}
                                onAdded={() => { load(); onChanged?.(); }}
                            />
                        )}
                        <div className="grid grid-cols-12 pt-4 mt-2 border-t border-subtle items-baseline">
                            <div className="col-span-9 text-right eat-label">Total</div>
                            <div className="col-span-3 text-right eat-numeral text-3xl" data-testid={`invoice-total-${invoiceId}`}>{fmtMoney(data.invoice.total)}</div>
                        </div>
                    </div>

                    {data.payments?.length > 0 && (
                        <div className="border border-subtle p-4 bg-ink">
                            <div className="eat-label">Payment</div>
                            {data.payments.map((p) => (
                                <div key={p.id} className="flex items-center justify-between mt-1">
                                    <div className="text-paper" style={{ fontWeight: 500 }}>{fmtMoney(p.amount_received)} · {p.method}</div>
                                    <div className="text-xs text-muted font-light">{fmtInvoiceDate(p.received_date)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-subtle">
                        <div className="flex flex-wrap gap-2">
                            {(data.invoice.status === "draft" || data.invoice.status === "sent") && (
                                <button data-testid={INVOICES.markPaidBtn} onClick={() => setPayOpen(true)} className="eat-btn-primary">
                                    <DollarSign size={13} className="mr-1.5" strokeWidth={1.75} /> Mark Paid
                                </button>
                            )}
                            {data.invoice.status === "paid" && (
                                <button data-testid={INVOICES.sendReceiptBtn} type="button" onClick={sendReceipt} className="eat-btn-primary">
                                    <Mail size={13} className="mr-1.5" strokeWidth={1.75} />
                                    {data.invoice.receipt_sent_at ? "Resend receipt" : "Send receipt"}
                                </button>
                            )}
                            {data.invoice.status === "draft" && (
                                <button data-testid={INVOICES.sendBtn} onClick={send} className="eat-btn-secondary">
                                    <Send size={13} className="mr-1.5" strokeWidth={1.75} /> Send due invoice
                                </button>
                            )}
                        </div>

                        {data.invoice.status === "draft" && (
                            <div className="ml-auto">
                                <button data-testid={INVOICES.deleteBtn} type="button" onClick={() => setDeleteOpen(true)} className="eat-btn-danger">
                                    <Trash2 size={13} className="mr-1.5" strokeWidth={1.75} /> Delete Draft
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {data && (
                <PaymentModal
                    open={payOpen}
                    onOpenChange={setPayOpen}
                    invoiceId={invoiceId}
                    amountSuggest={data.invoice.total}
                    onPaid={() => { setPayOpen(false); load(); onChanged?.(); }}
                />
            )}
        </Modal>

        <Modal
            open={deleteOpen}
            onOpenChange={(next) => !deleting && setDeleteOpen(next)}
            title="Delete draft invoice?"
            description="This permanently removes the draft and its line items."
        >
            {data?.invoice && (
                <p className="text-sm text-muted font-light">
                    {data.invoice.invoice_number}
                    {" · "}
                    {data.family?.family_name} Family
                    {" · "}
                    {fmtMoney(data.invoice.total)}
                </p>
            )}
            <div className="flex flex-wrap gap-2 mt-6">
                <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    disabled={deleting}
                    className="eat-btn-secondary flex-1 min-w-[7rem]"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    data-testid={INVOICES.deleteConfirmBtn}
                    onClick={confirmDeleteDraft}
                    disabled={deleting}
                    className="eat-btn-danger flex-1 min-w-[7rem] disabled:opacity-50"
                >
                    {deleting ? "Deleting…" : "Delete"}
                </button>
            </div>
        </Modal>
        </>
    );
}

function PaymentModal({ open, onOpenChange, invoiceId, amountSuggest, onPaid }) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("Zelle");
    const [date, setDate] = useState(todayISO());
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            const n = amountSuggest != null ? Number(amountSuggest) : null;
            setAmount(n != null && Number.isFinite(n) ? formatMoneyInputValue(n) : "");
            setMethod("Zelle");
            setDate(todayISO());
            setNote("");
        }
    }, [open, amountSuggest]);

    async function submit(e) {
        e.preventDefault();
        const amountNum = parseMoneyInput(amount);
        const methodTrimmed = method.trim();
        if (amountNum == null || amountNum <= 0) {
            toast.error("Enter a valid amount");
            return;
        }
        if (!methodTrimmed) {
            toast.error("Enter a payment method");
            return;
        }
        setBusy(true);
        try {
            await api.post(`/invoices/${invoiceId}/payments`, {
                amount_received: amountNum,
                received_date: date,
                method: methodTrimmed,
                note: note || null,
            });
            addPaymentMethodPreset(methodTrimmed);
            toast.success("Payment logged — send receipt when ready");
            onPaid?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Confirm Payment">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label className="eat-label">Amount Received</label>
                    <MoneyField
                        data-testid={INVOICES.paymentAmount}
                        value={amount}
                        onChange={setAmount}
                        className="mt-1.5"
                        required
                    />
                </div>
                <div>
                    <label className="eat-label">Date Received</label>
                    <div className="mt-1.5"><DateField value={date} onChange={setDate} data-testid={INVOICES.paymentDate} required /></div>
                </div>
                <div>
                    <label className="eat-label">Method</label>
                    <div className="mt-1.5">
                        <PaymentMethodField
                            data-testid={INVOICES.paymentMethod}
                            value={method}
                            onChange={setMethod}
                        />
                    </div>
                </div>
                <div>
                    <label className="eat-label">Note (optional)</label>
                    <input data-testid={INVOICES.paymentNote} value={note} onChange={(e) => setNote(e.target.value)} className="eat-input mt-1.5" />
                </div>
                <button data-testid={INVOICES.paymentSubmit} disabled={busy} type="submit" className="eat-btn-primary w-full h-12 mt-2">
                    {busy ? "Saving…" : "Mark Paid"}
                </button>
            </form>
        </Modal>
    );
}
