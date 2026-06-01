import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../lib/auth";
import { fmtMoney } from "../lib/format";

export default function Settings() {
    const { coach } = useAuth();
    const [card, setCard] = useState(null);

    useEffect(() => {
        api.get("/rate-card").then((r) => setCard(r.data));
    }, []);

    return (
        <div>
            <PageHeader subtitle="System" title="Settings" testId="page-settings-header" />
            <div className="px-4 md:px-8 mt-4 md:mt-6 max-w-3xl pb-8 flex flex-col gap-5">
                <div className="eat-card">
                    <div className="eat-label">Signed In As</div>
                    <div className="font-heading text-2xl uppercase tracking-tight mt-1">{coach?.name}</div>
                    <div className="text-sm text-zinc-600">{coach?.email}</div>
                    <div className="mt-3 text-xs text-zinc-500">Role: <span className="font-bold uppercase tracking-widest">{coach?.role}</span></div>
                </div>

                <div className="eat-card">
                    <h2 className="eat-h2 mb-3">Rate Card</h2>
                    {!card ? (
                        <div className="text-zinc-400 text-sm">Loading…</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(card).map(([k, v]) => (
                                <div key={k} className="flex justify-between border-b border-zinc-200 py-2">
                                    <span className="font-bold uppercase text-xs tracking-widest">{k.replace(/_/g, " ")}</span>
                                    <span className="eat-stat-num text-xl">{fmtMoney(v)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-zinc-500 mt-3">Rates can be overridden per athlete on their profile.</p>
                </div>

                <div className="eat-card-flat bg-zinc-50">
                    <div className="eat-label">Business</div>
                    <div className="font-bold mt-1">Elite Atmosphere Training</div>
                    <div className="text-sm text-zinc-600">1000 Brickell Ave Ste 715 PMB 5042, Miami, FL 33131</div>
                </div>
            </div>
        </div>
    );
}
