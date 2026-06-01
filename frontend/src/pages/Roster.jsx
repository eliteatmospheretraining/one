import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { ROSTER } from "../lib/testIds";
import { PROGRAM_LABEL, computeAge, fmtMoney } from "../lib/format";
import { Search, Plus, Archive, UserPlus, Users } from "lucide-react";
import { AthleteFormModal } from "./AthleteForm";
import { FamilyFormModal } from "./FamilyForm";

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
                            className="eat-btn-secondary"
                        >
                            <Users size={14} className="mr-1.5" strokeWidth={1.75} /> New Family
                        </button>
                        <button
                            data-testid={ROSTER.newBtn}
                            onClick={() => { setEditingAthlete(null); setAthleteFormOpen(true); }}
                            className="eat-btn-primary"
                            disabled={families.length === 0}
                            title={families.length === 0 ? "Create a family first" : ""}
                        >
                            <UserPlus size={14} className="mr-1.5" strokeWidth={1.75} /> New Athlete
                        </button>
                    </div>
                }
            />

            <div className="px-5 md:px-10 mt-8">
                {/* Search */}
                <div className="relative mb-5">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.75} />
                    <input
                        data-testid={ROSTER.searchInput}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search athletes…"
                        className="eat-input pl-9"
                    />
                </div>

                {/* Filters */}
                <div className="space-y-2.5">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" data-testid={ROSTER.filterProgram}>
                        {PROGRAM_FILTERS.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => setProgram(f.value)}
                                data-testid={`filter-program-${f.value}`}
                                className={`shrink-0 h-8 px-3 border text-[11px] uppercase tracking-wider2 transition-colors ${
                                    program === f.value ? "bg-transparent text-accent border-accent" : "bg-transparent text-muted border-subtle hover:text-paper hover:border-paper/30"
                                }`}
                                style={{ fontWeight: 500 }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" data-testid={ROSTER.filterStatus}>
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => setStatus(f.value)}
                                data-testid={`filter-status-${f.value}`}
                                className={`shrink-0 h-8 px-3 border text-[11px] uppercase tracking-wider2 transition-colors ${
                                    status === f.value ? "bg-transparent text-accent border-accent" : "bg-transparent text-muted border-subtle hover:text-paper hover:border-paper/30"
                                }`}
                                style={{ fontWeight: 500 }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-5 mb-3 eat-eyebrow">
                    {filtered.length} of {athletes.length} athlete{athletes.length === 1 ? "" : "s"}
                </div>

                {loading ? (
                    <div className="text-center py-10 text-muted uppercase tracking-wider2 text-sm">Loading…</div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        title={athletes.length === 0 ? "No athletes yet" : "No matches"}
                        hint={athletes.length === 0 ? "Add a family record first, then add athletes." : "Adjust your search or filters."}
                        action={athletes.length === 0 ? (
                            <button onClick={() => setFamilyFormOpen(true)} className="eat-btn-primary">
                                <Plus size={14} className="mr-1.5" /> New Family
                            </button>
                        ) : null}
                    />
                ) : (
                    <div className="flex flex-col gap-2 pb-10">
                        {filtered.map((a) => {
                            const fam = famById[a.family_id];
                            return (
                                <button
                                    key={a.id}
                                    data-testid={ROSTER.card(a.id)}
                                    onClick={() => { setEditingAthlete(a); setAthleteFormOpen(true); }}
                                    className={`bg-mid border border-subtle p-5 text-left hover:border-paper/30 transition-colors ${a.status === "archived" ? "opacity-50" : ""}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-thunder text-2xl uppercase tracking-tight text-paper truncate leading-none" style={{ fontWeight: 500 }}>
                                                {a.full_name}
                                            </div>
                                            <div className="text-xs text-muted uppercase tracking-wider2 mt-2" style={{ fontWeight: 300 }}>
                                                {PROGRAM_LABEL[a.program_type]}
                                                {a.date_of_birth && <span> · Age {computeAge(a.date_of_birth)}</span>}
                                                {a.status === "archived" && (
                                                    <span className="ml-2 inline-flex items-center gap-1"><Archive size={11} strokeWidth={1.5} /> Archived</span>
                                                )}
                                            </div>
                                            {fam && (
                                                <div className="text-xs text-muted mt-1 font-light">{fam.family_name} family</div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="eat-label">Rate</div>
                                            <div className="eat-numeral text-2xl mt-0.5">
                                                {a.rate_override != null ? fmtMoney(a.rate_override) : <span className="text-muted">—</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {(a.utr != null || a.wtn != null || a.shirt_size) && (
                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted font-light">
                                            {a.utr != null && <span>UTR <span className="text-paper">{a.utr}</span></span>}
                                            {a.wtn != null && <span>WTN <span className="text-paper">{a.wtn}</span></span>}
                                            {a.shirt_size && <span>Shirt <span className="text-paper">{a.shirt_size}</span></span>}
                                        </div>
                                    )}
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
