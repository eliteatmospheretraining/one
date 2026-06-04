import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { InvoiceStatusPill } from "../components/Pills";
import { fmtInvoiceDate, fmtMoney, formatAthletePrograms } from "../lib/format";
import { Mail, Phone } from "lucide-react";

export function FamilySummaryModal({ open, onOpenChange, familyId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!open || !familyId) return;
        setLoading(true);
        api.get(`/families/${familyId}/summary`)
            .then((r) => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [open, familyId]);

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={data?.family?.family_name || "Family"} maxW="max-w-2xl">
            {loading || !data ? (
                <div className="text-center py-10 text-muted uppercase tracking-wider2 text-sm">Loading…</div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Guardian */}
                    <section>
                        <div className="eat-label mb-1">Primary Contact</div>
                        <div className="text-paper" style={{ fontWeight: 500 }}>{data.family.guardian_name}</div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted font-light mt-1">
                            <span className="inline-flex items-center gap-1.5"><Mail size={12} strokeWidth={1.5} />{data.family.guardian_email}</span>
                            <span className="inline-flex items-center gap-1.5"><Phone size={12} strokeWidth={1.5} />{data.family.guardian_phone}</span>
                        </div>
                    </section>
                    {data.family.guardian_name_secondary && (
                        <section>
                            <div className="eat-label mb-1">Secondary Contact</div>
                            <div className="text-paper" style={{ fontWeight: 500 }}>{data.family.guardian_name_secondary}</div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted font-light mt-1">
                                {data.family.guardian_email_secondary && (
                                    <span className="inline-flex items-center gap-1.5"><Mail size={12} strokeWidth={1.5} />{data.family.guardian_email_secondary}</span>
                                )}
                                {data.family.guardian_phone_secondary && (
                                    <span className="inline-flex items-center gap-1.5"><Phone size={12} strokeWidth={1.5} />{data.family.guardian_phone_secondary}</span>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Totals */}
                    <section className="grid grid-cols-3 gap-3">
                        <div className="border border-subtle p-3">
                            <div className="eat-label">Paid YTD</div>
                            <div className="eat-numeral text-2xl mt-1 text-accent">{fmtMoney(data.totals.paid_total)}</div>
                        </div>
                        <div className="border border-subtle p-3">
                            <div className="eat-label">Outstanding</div>
                            <div className="eat-numeral text-2xl mt-1">{fmtMoney(data.totals.outstanding_total)}</div>
                        </div>
                        <div className="border border-subtle p-3">
                            <div className="eat-label">Invoices</div>
                            <div className="eat-numeral text-2xl mt-1">{data.invoices.length}</div>
                            <div className="text-[10px] uppercase tracking-wider2 text-muted mt-0.5" style={{ fontWeight: 300 }}>
                                {data.totals.draft_count} draft · {data.totals.sent_count} sent · {data.totals.paid_count} paid
                            </div>
                        </div>
                    </section>

                    {/* Athletes */}
                    <section>
                        <div className="eat-label mb-2">Athletes ({data.athletes.length})</div>
                        <div className="border-t border-subtle">
                            {data.athletes.length === 0 ? (
                                <div className="text-sm text-muted py-3 font-light">No athletes attached yet.</div>
                            ) : data.athletes.map((a) => (
                                <div key={a.id} className="py-2 border-b border-subtle">
                                    <div className="text-paper" style={{ fontWeight: 500 }}>{a.full_name}</div>
                                    <div className="text-xs text-muted uppercase tracking-wider2" style={{ fontWeight: 300 }}>
                                        {formatAthletePrograms(a)} · {a.status}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Invoices */}
                    <section>
                        <div className="eat-label mb-2">Invoices</div>
                        {data.invoices.length === 0 ? (
                            <div className="text-sm text-muted py-3 font-light">No invoices yet.</div>
                        ) : (
                            <div className="border-t border-subtle">
                                {data.invoices.map((i) => (
                                    <div key={i.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-subtle">
                                        <div className="min-w-0">
                                            <div className="text-paper" style={{ fontWeight: 500 }}>{i.invoice_number}</div>
                                            <div className="text-xs text-muted font-light">{fmtInvoiceDate(i.period_start)} – {fmtInvoiceDate(i.period_end)}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <InvoiceStatusPill status={i.status} />
                                            <div className="eat-numeral text-lg w-24 text-right">{fmtMoney(i.total)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Payment history */}
                    <section>
                        <div className="eat-label mb-2">Payment History</div>
                        {data.payments.length === 0 ? (
                            <div className="text-sm text-muted py-3 font-light">No payments received yet.</div>
                        ) : (
                            <div className="border-t border-subtle">
                                {data.payments.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-subtle">
                                        <div>
                                            <div className="text-paper" style={{ fontWeight: 500 }}>{fmtMoney(p.amount_received)}</div>
                                            <div className="text-xs text-muted font-light">{p.method}{p.note ? ` · ${p.note}` : ""}</div>
                                        </div>
                                        <div className="text-xs text-muted font-light">{fmtInvoiceDate(p.received_date)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </Modal>
    );
}
