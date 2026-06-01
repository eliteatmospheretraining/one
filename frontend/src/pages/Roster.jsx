import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { ROSTER } from "../lib/testIds";
import { PROGRAM_LABEL, computeAge, fmtMoney } from "../lib/format";
import { Search, Plus, Users, Archive, UserPlus } from "lucide-react";
import { AthleteFormModal } from "./AthleteForm";
import { FamilyFormModal } from "./FamilyForm";
import { useNavigate } from "react-router-dom";

const PROGRAM_FILTERS = [
    { value: "all", label: "All" },
    { value: "full_time", label: "Full-Time" },
    { value: "private", label: "Private" },
    { value: "semi_private", label: "Semi-Private" },
];

const STATUS_FILTERS = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
];

export default function Roster() {
    const nav = useNavigate();
    const [athletes, setAthletes] = useState([]);
    const [families, setFamilies] = useState([]);
    const [q, setQ] = useState("");
    const [program, setProgram] = useState("all");
    const [status, setStatus] = useState("active");
    const [loading, setLoading] = useState(true);
    const [athleteFormOpen, setAthleteFormOpen] = useState(false);
    const [editingAthlete, setEditingAthlete] = useState(null);
    const [familyFormOpen, setFamilyFormOpen] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const [a, f] = await Promise.all([api.get("/athletes"), api.get("/families")]);
            setAthletes(a.data);
            setFamilies(f.data);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    const famById = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

    const filtered = athletes.filter((a) => {
        if (program !== "all" && a.program_type !== program) return false;
        if (status !== "all" && a.status !== status) return false;
        if (q && !a.full_name.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
    });

    return (
        <div>
            <PageHeader
                subtitle="Roster"
                title="Athletes"
                testId="page-roster-header"
                actions={
                    <div className="flex gap-2 flex-wrap">
                        <button
                            data-testid={ROSTER.newFamilyBtn}
                            onClick={() => setFamilyFormOpen(true)}
                            className="eat-btn-ghost h-12 text-sm border-2 border-obsidian"
                        >
                            <Users size={16} className="mr-1.5" /> New Family
                        </button>
                        <button
                            data-testid={ROSTER.newBtn}
                            onClick={() => { setEditingAthlete(null); setAthleteFormOpen(true); }}
                            className="eat-btn-primary h-12 text-sm"
                            disabled={families.length === 0}
                            title={families.length === 0 ? "Create a family first" : ""}
                        >
                            <UserPlus size={16} className="mr-1.5" /> New Athlete
                        </button>
                    </div>
                }
            />

            <div className="px-4 md:px-8 mt-4 md:mt-6">
                {/* Search */}
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        data-testid={ROSTER.searchInput}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search athletes…"
                        className="eat-input pl-10"
                    />
                </div>

                {/* Filters */}
                <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1" data-testid={ROSTER.filterProgram}>
                        {PROGRAM_FILTERS.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => setProgram(f.value)}
                                data-testid={`filter-program-${f.value}`}
                                className={`shrink-0 h-9 px-3 border-2 text-xs font-bold uppercase tracking-widest transition-all ${
                                    program === f.value ? "bg-obsidian text-white border-obsidian" : "bg-white border-obsidian hover:bg-zinc-50"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1" data-testid={ROSTER.filterStatus}>
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => setStatus(f.value)}
                                data-testid={`filter-status-${f.value}`}
                                className={`shrink-0 h-9 px-3 border-2 text-xs font-bold uppercase tracking-widest transition-all ${
                                    status === f.value ? "bg-volt text-obsidian border-obsidian" : "bg-white border-obsidian hover:bg-zinc-50"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 text-xs text-zinc-500 font-bold uppercase tracking-widest">
                    {filtered.length} of {athletes.length} athlete{athletes.length === 1 ? "" : "s"}
                </div>

                {loading ? (
                    <div className="text-center py-8 text-zinc-400 font-bold uppercase tracking-widest text-sm">Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="mt-4">
                        <EmptyState
                            icon={Users}
                            title={athletes.length === 0 ? "No athletes yet" : "No matches"}
                            hint={athletes.length === 0
                                ? "Add a family record first, then add athletes."
                                : "Adjust your search or filters."}
                            action={athletes.length === 0 ? (
                                <button onClick={() => setFamilyFormOpen(true)} className="eat-btn-primary mt-3">
                                    <Plus size={16} className="mr-1.5" /> New Family
                                </button>
                            ) : null}
                        />
                    </div>
                ) : (
                    <div className="mt-4 flex flex-col gap-3 pb-8">
                        {filtered.map((a) => {
                            const fam = famById[a.family_id];
                            return (
                                <button
                                    key={a.id}
                                    data-testid={ROSTER.card(a.id)}
                                    onClick={() => { setEditingAthlete(a); setAthleteFormOpen(true); }}
                                    className={`eat-card text-left hover:-translate-y-[2px] transition-transform ${a.status === "archived" ? "opacity-60" : ""}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-heading text-2xl uppercase tracking-tight truncate">
                                                {a.full_name}
                                            </div>
                                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mt-1">
                                                {PROGRAM_LABEL[a.program_type]}
                                                {a.date_of_birth && <span> · Age {computeAge(a.date_of_birth)}</span>}
                                                {a.status === "archived" && <span className="ml-2 inline-flex items-center gap-1 text-zinc-500"><Archive size={11} /> Archived</span>}
                                            </div>
                                            {fam && (
                                                <div className="text-xs text-zinc-500 mt-1">{fam.family_name} family</div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Rate</div>
                                            <div className="eat-stat-num text-2xl">
                                                {a.rate_override != null ? fmtMoney(a.rate_override) : <span className="text-zinc-400">—</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                                        {a.utr != null && <span><span className="text-zinc-400">UTR</span> <b>{a.utr}</b></span>}
                                        {a.wtn != null && <span><span className="text-zinc-400">WTN</span> <b>{a.wtn}</b></span>}
                                        {a.shirt_size && <span><span className="text-zinc-400">Shirt</span> <b>{a.shirt_size}</b></span>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <AthleteFormModal
                open={athleteFormOpen}
                onOpenChange={setAthleteFormOpen}
                athlete={editingAthlete}
                families={families}
                onSaved={() => { setAthleteFormOpen(false); load(); }}
            />
            <FamilyFormModal
                open={familyFormOpen}
                onOpenChange={setFamilyFormOpen}
                onSaved={() => { setFamilyFormOpen(false); load(); }}
            />
        </div>
    );
}
