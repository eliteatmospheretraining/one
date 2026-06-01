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
    const navigate = useNavigate();

    return (
        <div className="min-h-screen w-full bg-white text-obsidian">
            {/* Mobile top bar */}
            <header className="md:hidden sticky top-0 z-40 bg-white border-b-2 border-obsidian px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-obsidian flex items-center justify-center">
                        <img src={LOGO_URL} alt="EAT" className="w-8 h-8 object-contain invert" />
                    </div>
                    <div className="leading-tight">
                        <div className="font-heading font-black text-base uppercase tracking-tight">EAT Portal</div>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Coach Console</div>
                    </div>
                </div>
                <button data-testid={NAV.logout} onClick={signOut} aria-label="Sign out" className="w-10 h-10 border-2 border-obsidian flex items-center justify-center hover:bg-volt">
                    <LogOut size={18} />
                </button>
            </header>

            <div className="md:flex">
                {/* Desktop sidebar */}
                <aside className="hidden md:flex flex-col w-64 border-r-2 border-obsidian min-h-screen sticky top-0 p-6 bg-white">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-12 h-12 bg-obsidian flex items-center justify-center">
                            <img src={LOGO_URL} alt="EAT" className="w-10 h-10 object-contain invert" />
                        </div>
                        <div>
                            <div className="font-heading font-black text-lg uppercase tracking-tight leading-none">EAT</div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Portal</div>
                        </div>
                    </div>
                    <nav className="flex flex-col gap-1 flex-1">
                        {NAV_ITEMS.map(({ to, label, icon: Icon, testid, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                data-testid={testid}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 h-12 font-bold uppercase tracking-widest text-sm border-2 transition-all ${
                                        isActive
                                            ? "bg-obsidian text-white border-obsidian"
                                            : "bg-white border-transparent hover:border-obsidian"
                                    }`
                                }
                            >
                                <Icon size={18} />
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="mt-auto pt-6 border-t-2 border-zinc-200">
                        <div className="text-xs uppercase tracking-widest text-zinc-500">Signed in</div>
                        <div className="font-bold mt-1 text-sm truncate" title={coach?.email}>{coach?.email}</div>
                        <button
                            data-testid={`${NAV.logout}-desktop`}
                            onClick={signOut}
                            className="mt-4 eat-btn-ghost h-10 w-full text-sm justify-start gap-2"
                        >
                            <LogOut size={16} /> Sign out
                        </button>
                    </div>
                </aside>

                <main className="flex-1 min-h-screen pb-28 md:pb-12 animate-fade-in">{children}</main>
            </div>

            {/* Mobile bottom nav */}
            <nav className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t-2 border-obsidian flex justify-around items-center z-50 md:hidden">
                {NAV_ITEMS.map(({ to, label, icon: Icon, testid, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        data-testid={`${testid}-mobile`}
                        className={({ isActive }) =>
                            `flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] ${
                                isActive ? "text-obsidian" : "text-zinc-500"
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <div
                                    className={`w-10 h-10 flex items-center justify-center border-2 transition-all ${
                                        isActive ? "bg-volt border-obsidian shadow-brut-sm" : "border-transparent"
                                    }`}
                                >
                                    <Icon size={20} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
