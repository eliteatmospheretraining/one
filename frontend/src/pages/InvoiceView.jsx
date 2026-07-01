import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "../lib/api";
import { fmtInvoiceDate, fmtMoney } from "../lib/format";
import { BrandWordmark } from "../components/BrandWordmark";
import { FileDown } from "lucide-react";

export default function InvoiceView() {
    const [params] = useSearchParams();
    const token = params.get("token");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!token) {
            setError("Missing invoice link.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        axios
            .get(`${API}/invoice-access/view`, { params: { token } })
            .then((r) => setData(r.data))
            .catch((e) => setError(e.response?.data?.detail || "Could not load invoice"))
            .finally(() => setLoading(false));
    }, [token]);

    function openPdf() {
        window.open(`${API}/invoice-access/pdf?token=${encodeURIComponent(token)}`, "_blank");
    }

    const paid = data?.invoice?.status === "paid";
    const due = data?.access_kind === "due" || data?.invoice?.status === "sent";

    return (
        <div className="min-h-screen bg-ink text-paper">
            <div className="max-w-lg mx-auto px-5 py-10">
                <BrandWordmark variant="login" className="mb-8" />

                {loading && (
                    <p className="text-sm text-muted uppercase tracking-wider2 text-center py-12">Loading invoice…</p>
                )}
                {error && (
                    <p className="text-sm text-danger text-center py-12">{error}</p>
                )}
                {data && (
                    <div className="border border-subtle bg-mid p-6 flex flex-col gap-5">
                        <div>
                            <div className="eat-label">{paid ? "Receipt" : "Invoice"}</div>
                            <div className="font-thunder text-2xl uppercase tracking-tight mt-1" style={{ fontWeight: 800 }}>
                                {data.invoice.invoice_number}
                            </div>
                            <div className="text-sm text-muted font-light mt-1">
                                {data.family?.guardian_name} · {data.family?.family_name} Family
                            </div>
                        </div>

                        <div className="text-sm text-muted font-light">
                            Period {fmtInvoiceDate(data.invoice.period_start)} – {fmtInvoiceDate(data.invoice.period_end)}
                        </div>

                        {due && !paid && (
                            <div className="border border-accent/40 bg-ink p-4">
                                <div className="eat-label text-accent">Amount due</div>
                                <div className="eat-numeral text-3xl mt-1">{fmtMoney(data.invoice.total)}</div>
                            </div>
                        )}

                        {data.payments?.length > 0 && (
                            <div className="border border-subtle p-4 bg-ink">
                                <div className="eat-label">Payment</div>
                                {data.payments.map((p) => (
                                    <div key={p.id} className="flex justify-between mt-2 text-sm">
                                        <span className="text-paper" style={{ fontWeight: 500 }}>
                                            {fmtMoney(p.amount_received)} · {p.method}
                                        </span>
                                        <span className="text-muted font-light">{fmtInvoiceDate(p.received_date)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="border-t border-subtle pt-3 space-y-2">
                            {data.line_items.map((li) => (
                                <div key={li.id} className="flex justify-between gap-3 text-sm">
                                    <div className="min-w-0">
                                        <div className="text-paper" style={{ fontWeight: 500 }}>{li.athlete_name}</div>
                                        <div className="text-xs text-muted font-light truncate">{li.description}</div>
                                    </div>
                                    <div className="text-paper shrink-0" style={{ fontWeight: 500 }}>{fmtMoney(li.amount)}</div>
                                </div>
                            ))}
                            {(data.invoice.discount_amount || 0) > 0 && (
                                <>
                                    <div className="flex justify-between text-sm pt-2">
                                        <span className="eat-label">Subtotal</span>
                                        <span className="text-paper font-light">{fmtMoney(data.invoice.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="eat-label text-accent">
                                            {data.invoice.discount_label || "Discount"}
                                            {data.invoice.discount_type === "percent" && data.invoice.discount_value
                                                ? ` (${data.invoice.discount_value}%)`
                                                : ""}
                                        </span>
                                        <span className="text-accent font-light">−{fmtMoney(data.invoice.discount_amount)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between pt-3 border-t border-subtle">
                                <span className="eat-label">Total</span>
                                <span className="eat-numeral text-2xl">{fmtMoney(data.invoice.total)}</span>
                            </div>
                        </div>

                        <button type="button" onClick={openPdf} className="eat-btn-primary w-full">
                            <FileDown size={13} className="mr-1.5" strokeWidth={1.75} /> Download PDF
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
