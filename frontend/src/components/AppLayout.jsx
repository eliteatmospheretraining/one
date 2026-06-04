import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, Users, FileText, Settings, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { NAV } from "../lib/testIds";
import { BrandWordmark } from "./BrandWordmark";

const NAV_ITEMS = [
    { to: "/home", label: "Home", icon: Home, testid: "nav-home", end: true },
    { to: "/roster", label: "Roster", icon: Users, testid: NAV.roster },
    { to: "/", label: "Training", icon: Calendar, testid: NAV.calendar, end: true },
    { to: "/invoices", label: "Billing", icon: FileText, testid: NAV.invoices },
    { to: "/settings", label: "Settings", icon: Settings, testid: NAV.settings },
];

export default function AppLayout({ children }) {
    const { coach, signOut } = useAuth();
    const { pathname } = useLocation();
    const mainRef = useRef(null);
    const lastScrollY = useRef(0);
    const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);

    useEffect(() => {
        setMobileHeaderVisible(true);
        lastScrollY.current = 0;
        if (mainRef.current) mainRef.current.scrollTop = 0;
    }, [pathname]);

    useEffect(() => {
        const el = mainRef.current;
        if (!el) return undefined;

        const onScroll = () => {
            const y = el.scrollTop;
            const delta = y - lastScrollY.current;

            if (y <= 8) {
                setMobileHeaderVisible(true);
            } else if (delta > 6) {
                setMobileHeaderVisible(false);
            } else if (delta < -6) {
                setMobileHeaderVisible(true);
            }

            lastScrollY.current = y;
        };

        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, [pathname]);

    return (
        <div className="h-screen w-full bg-ink text-paper">
            {/* Mobile top bar — hides on scroll down, returns on scroll up */}
            <header
                className={`md:hidden fixed top-0 left-0 right-0 z-40 bg-ink border-b border-subtle px-5 h-14 flex items-center justify-between transition-transform duration-300 ease-out ${
                    mobileHeaderVisible ? "translate-y-0" : "-translate-y-full"
                }`}
            >
                <BrandWordmark variant="sidebar" className="min-w-0" />
                <button
                    data-testid={NAV.logout}
                    onClick={signOut}
                    aria-label="Sign out"
                    className="h-9 px-2 flex items-center gap-1.5 text-muted hover:text-paper uppercase text-xs tracking-wider2"
                >
                    <LogOut size={14} /> Out
                </button>
            </header>

            <div className="md:flex h-screen">
                {/* Desktop sidebar */}
                <aside className="hidden md:flex flex-col w-56 bg-ink border-r border-subtle h-screen sticky top-0 pt-10 pb-8 px-5">
                    <div className="mb-8 md:mb-9 lg:mb-10 px-1">
                        <BrandWordmark variant="sidebar" />
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

                <main ref={mainRef} className="flex-1 h-screen overflow-y-auto pt-14 md:pt-0 pb-24 md:pb-12 bg-ink animate-fade-in">{children}</main>
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
