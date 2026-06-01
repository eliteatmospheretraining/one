import React from "react";
import { NavLink } from "react-router-dom";
import { Calendar, Users, FileText, Settings, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useGreeting } from "../lib/greeting";
import { NAV } from "../lib/testIds";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_eat-admin-portal/artifacts/jnekghwj_EAT%20Logo.%20%285%29.png";

const NAV_ITEMS = [
    { to: "/", label: "Schedule", icon: Calendar, testid: NAV.calendar, end: true },
    { to: "/roster", label: "Roster", icon: Users, testid: NAV.roster },
    { to: "/invoices", label: "Invoices", icon: FileText, testid: NAV.invoices },
    { to: "/settings", label: "Settings", icon: Settings, testid: NAV.settings },
];

export default function AppLayout({ children }) {
    const { coach, signOut } = useAuth();
    const greeting = useGreeting();
    const firstName = (coach?.name || "").split(" ")[0];

    return (
        <div className="min-h-screen w-full bg-ink text-paper">
            {/* Mobile top bar */}
            <header className="md:hidden sticky top-0 z-40 bg-ink border-b border-subtle px-5 h-14 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <img src={LOGO_URL} alt="EAT" className="w-8 h-8 object-contain invert shrink-0" />
                    <div className="leading-tight min-w-0">
                        <div className="text-[10px] uppercase tracking-wider3 text-muted" style={{ fontWeight: 300 }}>{greeting}</div>
                        <div className="font-thunder uppercase text-sm tracking-tight text-paper truncate" style={{ fontWeight: 500 }}>
                            {firstName || "Coach"}<span className="text-accent">.</span>
                        </div>
                    </div>
                </div>
                <button
                    data-testid={NAV.logout}
                    onClick={signOut}
                    aria-label="Sign out"
                    className="h-9 px-2 flex items-center gap-1.5 text-muted hover:text-paper uppercase text-xs tracking-wider2"
                >
                    <LogOut size={14} /> Out
                </button>
            </header>

            <div className="md:flex">
                {/* Desktop sidebar */}
                <aside className="hidden md:flex flex-col w-56 bg-ink border-r border-subtle min-h-screen sticky top-0 py-8 px-5">
                    <div className="mb-12 px-1">
                        <img src={LOGO_URL} alt="EAT" className="w-12 h-12 object-contain invert" />
                        <div className="mt-5">
                            <div className="eat-eyebrow">{greeting}</div>
                            <div className="font-thunder uppercase text-2xl leading-none tracking-tight text-paper mt-1.5 truncate" style={{ fontWeight: 500 }}>
                                {firstName || "Coach"}<span className="text-accent">.</span>
                            </div>
                        </div>
                    </div>
                    <nav className="flex flex-col gap-0.5 flex-1">
                        {NAV_ITEMS.map(({ to, label, icon: Icon, testid, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                data-testid={testid}
                                className={({ isActive }) =>
                                    `relative flex items-center gap-3 px-3 h-10 uppercase tracking-wider2 text-sm transition-colors font-thunder ${
                                        isActive ? "text-paper" : "text-muted hover:text-paper"
                                    }`
                                }
                                style={{ fontWeight: 500 }}
                            >
                                {({ isActive }) => (
                                    <>
                                        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent" />}
                                        <Icon size={16} className={isActive ? "text-accent" : ""} strokeWidth={1.75} />
                                        {label}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="mt-auto pt-6">
                        <div className="eat-label mb-1">Signed in</div>
                        <div className="text-sm text-paper truncate" title={coach?.email} style={{ fontWeight: 300 }}>{coach?.email}</div>
                        <button
                            data-testid={`${NAV.logout}-desktop`}
                            onClick={signOut}
                            className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-wider2 text-muted hover:text-paper font-thunder"
                            style={{ fontWeight: 500 }}
                        >
                            <LogOut size={13} /> Sign out
                        </button>
                    </div>
                </aside>

                <main className="flex-1 min-h-screen pb-24 md:pb-12 bg-ink animate-fade-in">{children}</main>
            </div>

            {/* Mobile bottom nav */}
            <nav className="fixed bottom-0 left-0 right-0 h-16 bg-ink border-t border-subtle flex justify-around items-stretch z-50 md:hidden">
                {NAV_ITEMS.map(({ to, label, icon: Icon, testid, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        data-testid={`${testid}-mobile`}
                        className="flex-1 flex flex-col items-center justify-center gap-1"
                    >
                        {({ isActive }) => (
                            <>
                                <Icon size={18} strokeWidth={1.75} className={isActive ? "text-accent" : "text-muted"} />
                                <span
                                    className={`text-[10px] uppercase tracking-wider2 font-thunder ${isActive ? "text-paper" : "text-muted"}`}
                                    style={{ fontWeight: 500 }}
                                >
                                    {label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
