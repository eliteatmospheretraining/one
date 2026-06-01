import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Calendar, Users, FileText, Settings, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
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

    return (
        <div className="min-h-screen w-full bg-ink text-paper">
            {/* Mobile top bar */}
            <header className="md:hidden sticky top-0 z-40 bg-ink border-b border-subtle px-5 h-14 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <img src={LOGO_URL} alt="EAT" className="w-8 h-8 object-contain invert" />
                    <div className="leading-tight">
                        <div className="font-thunder uppercase text-base tracking-tight text-paper" style={{ fontWeight: 500 }}>EAT Portal</div>
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
                    <div className="flex items-center gap-2.5 mb-12 px-1">
                        <img src={LOGO_URL} alt="EAT" className="w-9 h-9 object-contain invert" />
                        <div>
                            <div className="font-thunder uppercase text-lg leading-none tracking-tight text-paper" style={{ fontWeight: 500 }}>EAT</div>
                            <div className="text-[10px] uppercase tracking-wider3 text-muted mt-0.5">Coach Console</div>
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
