import React, { useEffect, useMemo, useState } from "react";
import { api, API, getToken } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { DateField } from "../components/DateField";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { InvoiceStatusPill } from "../components/Pills";
import { INVOICES } from "../lib/testIds";
import { fmtDate, fmtMoney, todayISO } from "../lib/format";
import { Plus, FileDown, Send, Trash2, DollarSign, Copy } from "lucide-react";
import { toast } from "sonner";

function copyText(t) {
    if (!t) return;
    try {
        navigator.clipboard.writeText(t);
        toast.success("Copied");
    } catch {
        toast.error("Copy failed");
    }
}

export default function Invoices() {
    const [invoices, setInvoices] = useState([]);
    const [invoiceDetails, setInvoiceDetails] = useState({});
    const [families, setFamilies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [detailId, setDetailId] = useState(null);
    const [selectedYear, setSelectedYear] = useState(2026);
    const [invoiceFilter, setInvoiceFilter] = useState("all"); // "this_month", "last_month", "last_3_months", "all"

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
            // "all"
            return true;
        });
    }, [invoices, invoiceFilter]);

    return (
        <div>
            <PageHeader
                subtitle="Billing"
                title="Revenue"
                testId="page-invoices-header"
                actions={
                    <button
                        data-testid={INVOICES.newBtn}
                        onClick={() => setGenerateOpen(true)}
                        className="eat-btn-primary"
                        disabled={families.length === 0}
                    >
                        <Plus size={14} className="mr-1.5" strokeWidth={1.75} /> New Invoice
                    </button>
                }
            />

            <div className="px-5 md:px-10 mt-8 pb-10">
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <button
                            onClick={() => setSelectedYear((y) => Math.max(2026, y - 1))}
                            className="eat-btn-ghost"
                            aria-label="Previous year"
                        >
                            ◀
                        </button>
                        <div className="text-lg font-thunder uppercase tracking-tight" style={{ fontWeight: 800 }}>{selectedYear}</div>
                        <button
                            onClick={() => setSelectedYear((y) => y + 1)}
                            className="eat-btn-ghost"
                            aria-label="Next year"
                        >
                            ▶
                        </button>
                    </div>
                    <div className="flex gap-4 mb-4">
                        <div className="bg-[#141414] p-4 text-center">
                            <div className="text-sm text-muted">Total Invoiced</div>
                            <div className="text-2xl font-thunder" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.totalInvoiced)}</div>
                        </div>
                        <div className="bg-[#141414] p-4 text-center">
                            <div className="text-sm text-muted">Collected</div>
                            <div className="text-2xl font-thunder" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.collected)}</div>
                        </div>
                        <div className="bg-[#141414] p-4 text-center">
                            <div className="text-sm text-muted">Outstanding</div>
                            <div className="text-2xl font-thunder" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.outstanding)}</div>
                        </div>
                        <div className="bg-[#141414] p-4 text-center">
                            <div className="text-sm text-muted">MRR (avg)</div>
                            <div className="text-2xl font-thunder" style={{ fontWeight: 800 }}>{fmtMoney(metricsForYear.mrrAvg)}</div>
                        </div>
                    </div>
                </div>

                {/* Invoices list with date filters */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="text-sm text-muted uppercase tracking-wider2" style={{ fontWeight: 500 }}>Filter:</div>
                    {["this_month", "last_month", "last_3_months", "all"].map((f) => (
                        <button
                            key={f}
                            onClick={() => setInvoiceFilter(f)}
                            className={`text-xs uppercase tracking-wider2 px-3 py-1 rounded transition-colors ${invoiceFilter === f ? "bg-paper text-ink" : "border border-subtle text-paper hover:border-paper"}`}
                        >
                            {f === "this_month" ? "This Month" : f === "last_month" ? "Last Month" : f === "last_3_months" ? "Last 3 Months" : "All"}
                        </button>
                    ))}
                </div>
                {loading ? (
                    <div className="text-center py-10 text-muted uppercase tracking-wider2 text-sm">Loading…</div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="bg-mid border border-subtle p-5 text-center text-muted">
                        {invoices.length === 0 ? (
                            <>
                                <div className="font-light">No invoices yet</div>
                                {families.length > 0 && (
                                    <button onClick={() => setGenerateOpen(true)} className="eat-btn-primary mt-3">
                                        <Plus size={14} className="mr-1.5" /> New Invoice
                                    </button>
                                )}
                            </>
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
                                                {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
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
                <div className="mt-8 bg-[#0F0F0F] p-6 rounded">
                    <div className="text-sm text-muted mb-3">Monthly Revenue ({selectedYear})</div>
                    <div className="w-full h-48 flex items-end gap-3">
                        {metricsForYear.monthly.map((val, idx) => {
                            const max = Math.max(...metricsForYear.monthly, 1);
                            const height = Math.round((val / max) * 100);
                            const monthLabel = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][idx];
                            return (
                                <div key={idx} className="flex-1 text-center">
                                    <div className="mx-auto bg-paper rounded-sm" style={{ width: 20, height: `${Math.max(8, height)}%`, marginBottom: 8 }} />
                                    <div className="text-xs text-muted">{monthLabel}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <GenerateInvoiceModal
                open={generateOpen}
                onOpenChange={setGenerateOpen}
                families={families}
                onCreated={(invId) => { setGenerateOpen(false); load(); setDetailId(invId); }}
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

function GenerateInvoiceModal({ open, onOpenChange, families, onCreated }) {
    const [familyId, setFamilyId] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState(todayISO());
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setFamilyId(families[0]?.id || "");
            const d = new Date();
            d.setDate(1);
            setStart(d.toISOString().slice(0, 10));
            setEnd(todayISO());
        }
    }, [open, families]);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await api.post("/invoices/generate", { family_id: familyId, period_start: start, period_end: end });
            toast.success(`Invoice ${r.data.invoice.invoice_number} created`);
            onCreated?.(r.data.invoice.id);
        } catch (e) {
            toast.error(e.response?.data?.detail || "Generate failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Generate Invoice">
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
                        <div className="mt-1.5"><DateField value={start} onChange={setStart} data-testid={INVOICES.periodStart} required /></div>
                    </div>
                    <div>
                        <label className="eat-label">Period End</label>
                        <div className="mt-1.5"><DateField value={end} onChange={setEnd} data-testid={INVOICES.periodEnd} required /></div>
                    </div>
                </div>
                <button data-testid={INVOICES.generateBtn} disabled={busy} type="submit" className="eat-btn-primary w-full mt-2">
                    {busy ? "Generating…" : "Generate Draft"}
                </button>
                <p className="text-xs text-muted font-light">
                    The system will pull every billable attendance record in the period for athletes in this family.
                </p>
            </form>
        </Modal>
    );
}

function InvoiceDetailModal({ invoiceId, open, onOpenChange, onChanged }) {
    const [data, setData] = useState(null);
    const [biz, setBiz] = useState(null);
    const [loading, setLoading] = useState(true);
    const [payOpen, setPayOpen] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const [r, b] = await Promise.all([api.get(`/invoices/${invoiceId}`), api.get(`/business-info`)]);
            setData(r.data);
            setBiz(b.data);
        } catch (e) {
            toast.error("Could not load invoice");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, invoiceId]);

    async function send() {
        if (!window.confirm("Send this invoice to the guardian via email?")) return;
        try {
            await api.post(`/invoices/${invoiceId}/send`);
            toast.success("Invoice emailed");
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Send failed");
        }
    }

    async function del() {
        if (!window.confirm("Delete this draft invoice?")) return;
        try {
            await api.delete(`/invoices/${invoiceId}`);
            toast.success("Deleted");
            onOpenChange(false);
            onChanged?.();
        } catch (e) {
            toast.error("Delete failed");
        }
    }

    function openPdf() {
        const url = `${API}/invoices/${invoiceId}/pdf`;
        fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then((r) => r.blob())
            .then((b) => {
                const u = URL.createObjectURL(b);
                window.open(u, "_blank");
            })
            .catch(() => toast.error("Could not open PDF"));
    }

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={data?.invoice?.invoice_number || "Invoice"} maxW="max-w-2xl">
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
                        <div><div className="eat-label">Period</div><div className="text-paper mt-0.5" style={{ fontWeight: 500 }}>{fmtDate(data.invoice.period_start)} – {fmtDate(data.invoice.period_end)}</div></div>
                        <div><div className="eat-label">Issued</div><div className="text-paper mt-0.5" style={{ fontWeight: 500 }}>{fmtDate(data.invoice.issue_date)}</div></div>
                    </div>

                    <div className="border-t border-subtle pt-3">
                        <div className="grid grid-cols-12 pb-2 eat-label">
                            <div className="col-span-7">Service</div>
                            <div className="col-span-2 text-right">Qty</div>
                            <div className="col-span-3 text-right">Amount</div>
                        </div>
                        {data.line_items.length === 0 && (
                            <div className="py-4 text-sm text-muted font-light">No line items.</div>
                        )}
                        {data.line_items.map((li) => (
                            <div key={li.id} className="grid grid-cols-12 py-3 border-t border-subtle text-sm">
                                <div className="col-span-7">
                                    <div className="text-paper" style={{ fontWeight: 500 }}>{li.athlete_name}</div>
                                    <div className="text-xs text-muted font-light mt-0.5">{li.description}</div>
                                </div>
                                <div className="col-span-2 text-right text-paper font-light">{li.quantity}</div>
                                <div className="col-span-3 text-right text-paper" style={{ fontWeight: 500 }}>{fmtMoney(li.amount)}</div>
                            </div>
                        ))}
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
                                    <div className="text-xs text-muted font-light">{fmtDate(p.received_date)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {data.invoice.status === "sent" && biz && (biz.zelle_email || biz.zelle_phone) && (
                        <div className="border border-subtle p-4" data-testid="invoice-zelle-block">
                            <div className="eat-label mb-2">Pay via Zelle</div>
                            {biz.zelle_name && <div className="text-paper mb-2" style={{ fontWeight: 500 }}>{biz.zelle_name}</div>}
                            {biz.zelle_email && (
                                <button
                                    type="button"
                                    onClick={() => copyText(biz.zelle_email)}
                                    data-testid="zelle-copy-email"
                                    className="flex items-center justify-between w-full py-2 border-b border-subtle text-left hover:bg-ink/40 transition-colors"
                                >
                                    <div>
                                        <div className="eat-label">Email</div>
                                        <div className="text-paper" style={{ fontWeight: 500 }}>{biz.zelle_email}</div>
                                    </div>
                                    <Copy size={14} strokeWidth={1.75} className="text-muted" />
                                </button>
                            )}
                            {biz.zelle_phone && (
                                <button
                                    type="button"
                                    onClick={() => copyText(biz.zelle_phone)}
                                    data-testid="zelle-copy-phone"
                                    className="flex items-center justify-between w-full py-2 text-left hover:bg-ink/40 transition-colors"
                                >
                                    <div>
                                        <div className="eat-label">Phone</div>
                                        <div className="text-paper" style={{ fontWeight: 500 }}>{biz.zelle_phone}</div>
                                    </div>
                                    <Copy size={14} strokeWidth={1.75} className="text-muted" />
                                </button>
                            )}
                            <div className="text-[11px] text-muted mt-2 font-light">Open your bank app · Send via Zelle · Enter {fmtMoney(data.invoice.total)}.</div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                        <div className="flex gap-2">
                            <button data-testid={INVOICES.previewPdfBtn} onClick={openPdf} className="eat-btn-secondary">
                                <FileDown size={13} className="mr-1.5" strokeWidth={1.75} /> Preview PDF
                            </button>
                            {data.invoice.status === "draft" && (
                                <button data-testid={INVOICES.sendBtn} onClick={send} className="eat-btn-primary">
                                    <Send size={13} className="mr-1.5" strokeWidth={1.75} /> Send to Guardian
                                </button>
                            )}
                            {data.invoice.status === "sent" && (
                                <button data-testid={INVOICES.markPaidBtn} onClick={() => setPayOpen(true)} className="eat-btn-primary">
                                    <DollarSign size={13} className="mr-1.5" strokeWidth={1.75} /> Mark Paid
                                </button>
                            )}
                        </div>

                        {data.invoice.status === "draft" && (
                            <div className="ml-auto">
                                <button data-testid={INVOICES.deleteBtn} onClick={del} className="eat-btn-danger">
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
    );
}

function PaymentModal({ open, onOpenChange, invoiceId, amountSuggest, onPaid }) {
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(todayISO());
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) { setAmount(String(amountSuggest || "")); setDate(todayISO()); setNote(""); }
    }, [open, amountSuggest]);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post(`/invoices/${invoiceId}/payments`, {
                amount_received: Number(amount),
                received_date: date,
                method: "Zelle",
                note: note || null,
            });
            toast.success("Payment logged · Invoice paid");
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
                    <input data-testid={INVOICES.paymentAmount} required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="eat-input mt-1.5" />
                </div>
                <div>
                    <label className="eat-label">Date Received</label>
                    <div className="mt-1.5"><DateField value={date} onChange={setDate} data-testid={INVOICES.paymentDate} required /></div>
                </div>
                <div>
                    <label className="eat-label">Method</label>
                    <input value="Zelle" disabled className="eat-input mt-1.5 opacity-60" />
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
