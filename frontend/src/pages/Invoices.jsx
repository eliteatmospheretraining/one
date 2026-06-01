import React, { useEffect, useMemo, useState } from "react";
import { api, API, getToken } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { InvoiceStatusPill } from "../components/Pills";
import { INVOICES } from "../lib/testIds";
import { fmtDate, fmtMoney, todayISO } from "../lib/format";
import { FileText, Plus, FileDown, Send, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function Invoices() {
    const [invoices, setInvoices] = useState([]);
    const [families, setFamilies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [detailId, setDetailId] = useState(null);

    async function load() {
        setLoading(true);
        try {
            const [inv, fam] = await Promise.all([api.get("/invoices"), api.get("/families")]);
            setInvoices(inv.data);
            setFamilies(fam.data);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    const famById = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

    return (
        <div>
            <PageHeader
                subtitle="Billing"
                title="Invoices"
                testId="page-invoices-header"
                actions={
                    <button
                        data-testid={INVOICES.newBtn}
                        onClick={() => setGenerateOpen(true)}
                        className="eat-btn-primary h-12 text-sm"
                        disabled={families.length === 0}
                    >
                        <Plus size={16} className="mr-1.5" /> New Invoice
                    </button>
                }
            />

            <div className="px-4 md:px-8 mt-4 md:mt-6 pb-8">
                {loading ? (
                    <div className="text-center py-8 text-zinc-400 font-bold uppercase tracking-widest text-sm">Loading…</div>
                ) : invoices.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="No invoices yet"
                        hint="Generate an invoice from a family's attendance for a date range."
                        action={
                            families.length > 0 && (
                                <button onClick={() => setGenerateOpen(true)} className="eat-btn-primary mt-3">
                                    <Plus size={16} className="mr-1.5" /> New Invoice
                                </button>
                            )
                        }
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {invoices.map((inv) => {
                            const fam = famById[inv.family_id];
                            return (
                                <button
                                    key={inv.id}
                                    data-testid={INVOICES.card(inv.id)}
                                    onClick={() => setDetailId(inv.id)}
                                    className="eat-card text-left hover:-translate-y-[2px] transition-transform"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-heading text-2xl uppercase tracking-tight">{inv.invoice_number}</div>
                                            <div className="text-sm font-bold mt-0.5">{fam?.family_name || "—"} Family</div>
                                            <div className="text-xs text-zinc-500 mt-1">
                                                {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <InvoiceStatusPill status={inv.status} testId={`invoice-status-${inv.id}`} />
                                            <div className="eat-stat-num text-2xl mt-2">{fmtMoney(inv.total)}</div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
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
                    <select data-testid={INVOICES.familySelect} required value={familyId} onChange={(e) => setFamilyId(e.target.value)} className="eat-input mt-1">
                        <option value="">Select…</option>
                        {families.map((f) => <option key={f.id} value={f.id}>{f.family_name}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="eat-label">Period Start</label>
                        <input data-testid={INVOICES.periodStart} type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="eat-input mt-1" />
                    </div>
                    <div>
                        <label className="eat-label">Period End</label>
                        <input data-testid={INVOICES.periodEnd} type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className="eat-input mt-1" />
                    </div>
                </div>
                <button data-testid={INVOICES.generateBtn} disabled={busy} type="submit" className="eat-btn-primary w-full mt-2">
                    {busy ? "Generating…" : "Generate Draft"}
                </button>
                <p className="text-xs text-zinc-500">
                    The system will pull every billable attendance record in the period for athletes in this family.
                </p>
            </form>
        </Modal>
    );
}

function InvoiceDetailModal({ invoiceId, open, onOpenChange, onChanged }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [payOpen, setPayOpen] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const r = await api.get(`/invoices/${invoiceId}`);
            setData(r.data);
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
        // Attach auth header via fetch+blob open
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
                <div className="text-center py-8 text-zinc-400 uppercase tracking-widest text-sm font-bold">Loading…</div>
            ) : (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="eat-label">Billed To</div>
                            <div className="font-bold">{data.family?.family_name} Family</div>
                            <div className="text-sm text-zinc-600">{data.family?.guardian_name} · {data.family?.guardian_email}</div>
                        </div>
                        <InvoiceStatusPill status={data.invoice.status} testId={`detail-status-${invoiceId}`} />
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <div><span className="eat-label">Period</span><div className="font-bold">{fmtDate(data.invoice.period_start)} – {fmtDate(data.invoice.period_end)}</div></div>
                        <div><span className="eat-label">Issued</span><div className="font-bold">{fmtDate(data.invoice.issue_date)}</div></div>
                    </div>

                    <div className="border-2 border-obsidian">
                        <div className="grid grid-cols-12 px-3 py-2 bg-obsidian text-volt text-[10px] font-bold uppercase tracking-widest">
                            <div className="col-span-7">Service</div>
                            <div className="col-span-2 text-right">Qty</div>
                            <div className="col-span-3 text-right">Amount</div>
                        </div>
                        {data.line_items.length === 0 && (
                            <div className="p-4 text-sm text-zinc-500">No line items.</div>
                        )}
                        {data.line_items.map((li) => (
                            <div key={li.id} className="grid grid-cols-12 px-3 py-2 border-t border-zinc-200 text-sm">
                                <div className="col-span-7">
                                    <div className="font-bold">{li.athlete_name}</div>
                                    <div className="text-xs text-zinc-500">{li.description}</div>
                                </div>
                                <div className="col-span-2 text-right">{li.quantity}</div>
                                <div className="col-span-3 text-right font-bold">{fmtMoney(li.amount)}</div>
                            </div>
                        ))}
                        <div className="grid grid-cols-12 px-3 py-3 border-t-2 border-obsidian bg-zinc-50">
                            <div className="col-span-9 text-right font-bold uppercase tracking-widest text-xs">Total</div>
                            <div className="col-span-3 text-right eat-stat-num text-2xl" data-testid={`invoice-total-${invoiceId}`}>{fmtMoney(data.invoice.total)}</div>
                        </div>
                    </div>

                    {data.payments?.length > 0 && (
                        <div className="border-2 border-obsidian p-3 bg-volt-soft">
                            <div className="eat-label">Payment</div>
                            {data.payments.map((p) => (
                                <div key={p.id} className="flex items-center justify-between mt-1">
                                    <div className="font-bold">{fmtMoney(p.amount_received)} · {p.method}</div>
                                    <div className="text-xs text-zinc-600">{fmtDate(p.received_date)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                        <button data-testid={INVOICES.previewPdfBtn} onClick={openPdf} className="eat-btn-ghost h-11 text-sm border-2 border-obsidian">
                            <FileDown size={14} className="mr-1.5" /> Preview PDF
                        </button>
                        {data.invoice.status === "draft" && (
                            <>
                                <button data-testid={INVOICES.sendBtn} onClick={send} className="eat-btn-primary h-11 text-sm">
                                    <Send size={14} className="mr-1.5" /> Send to Guardian
                                </button>
                                <button data-testid={INVOICES.deleteBtn} onClick={del} className="eat-btn-ghost h-11 text-sm border-2 border-red-500 text-red-700">
                                    <Trash2 size={14} className="mr-1.5" /> Delete Draft
                                </button>
                            </>
                        )}
                        {data.invoice.status === "sent" && (
                            <button data-testid={INVOICES.markPaidBtn} onClick={() => setPayOpen(true)} className="eat-btn-primary h-11 text-sm">
                                <DollarSign size={14} className="mr-1.5" /> Mark Paid
                            </button>
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
                    <input data-testid={INVOICES.paymentAmount} required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="eat-input mt-1" />
                </div>
                <div>
                    <label className="eat-label">Date Received</label>
                    <input data-testid={INVOICES.paymentDate} required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="eat-input mt-1" />
                </div>
                <div>
                    <label className="eat-label">Method</label>
                    <input value="Zelle" disabled className="eat-input mt-1 bg-zinc-100" />
                </div>
                <div>
                    <label className="eat-label">Note (optional)</label>
                    <input data-testid={INVOICES.paymentNote} value={note} onChange={(e) => setNote(e.target.value)} className="eat-input mt-1" />
                </div>
                <button data-testid={INVOICES.paymentSubmit} disabled={busy} type="submit" className="eat-btn-primary w-full h-14 mt-2">
                    {busy ? "Saving…" : "Mark Paid"}
                </button>
            </form>
        </Modal>
    );
}
