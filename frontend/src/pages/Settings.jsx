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
            <PageHeader subtitle="Settings" title="Settings" testId="page-settings-header" />
            <div className="px-5 md:px-10 mt-8 max-w-3xl pb-10 flex flex-col gap-8">
                <section>
                    <div className="eat-label mb-2">Signed In</div>
                    <div className="font-thunder text-3xl uppercase tracking-tight text-paper leading-none" style={{ fontWeight: 500 }}>{coach?.name}</div>
                    <div className="text-sm text-muted mt-1.5 font-light">{coach?.email}</div>
                    <div className="text-xs text-muted mt-1 uppercase tracking-wider2" style={{ fontWeight: 300 }}>Role · <span className="text-paper">{coach?.role}</span></div>
                </section>

                <section>
                    <div className="eat-label mb-3">Rate Card</div>
                    {!card ? (
                        <div className="text-muted text-sm">Loading…</div>
                    ) : (
                        <div className="border-t border-subtle">
                            {Object.entries(card).map(([k, v]) => (
                                <div key={k} className="flex justify-between items-baseline py-3 border-b border-subtle">
                                    <span className="uppercase tracking-wider2 text-sm text-paper" style={{ fontWeight: 500 }}>{k.replace(/_/g, " ")}</span>
                                    <span className="eat-numeral text-2xl">{fmtMoney(v)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-muted mt-3 font-light">Rates can be overridden per athlete on their profile.</p>
                </section>

                <section>
                    <div className="eat-label mb-2">Business</div>
                    <div className="text-paper" style={{ fontWeight: 500 }}>Elite Atmosphere Training</div>
                    <div className="text-sm text-muted font-light">1000 Brickell Ave Ste 715 PMB 5042</div>
                    <div className="text-sm text-muted font-light">Miami, FL 33131</div>
                </section>
            </div>
        </div>
    );
}
