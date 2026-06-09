import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ROSTER } from "../lib/testIds";
import { computeAge, athleteHasProgram, formatAthletePrograms } from "../lib/format";
import { Archive, Plus } from "lucide-react";
import { AthleteFormModal } from "./AthleteForm";
import { FamilyFormModal } from "./FamilyForm";
import { toast } from "sonner";

const PROGRAM_FILTERS = [
    { value: "full_time", label: "Eat w/ EAT" },
    { value: "private", label: "Private" },
    { value: "semi_private", label: "Semi-Private" },
    { value: "all", label: "All" },
];

const STATUS_FILTERS = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
];

export default function Roster() {
    const [athletes, setAthletes] = useState([]);
    const [families, setFamilies] = useState([]);
    const [program, setProgram] = useState("full_time");
    const [status, setStatus] = useState("active");
    const [loading, setLoading] = useState(true);
    const [athleteFormOpen, setAthleteFormOpen] = useState(false);
    const [familyFormOpen, setFamilyFormOpen] = useState(false);
    const [editingAthlete, setEditingAthlete] = useState(null);

    function openNewAthlete() {
        setEditingAthlete(null);
        setAthleteFormOpen(true);
    }

    async function load() {
        setLoading(true);
        try {
            const [a, f] = await Promise.all([api.get("/athletes"), api.get("/families")]);
            setAthletes(a.data || []);
            setFamilies(f.data || []);
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not load roster");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    const filtered = athletes.filter((a) => {
        if (program !== "all" && !athleteHasProgram(a, program)) return false;
        if (status !== "all" && a.status !== status) return false;
        return true;
    });

    return (
        <div>
            <PageHeader
                subtitle="Roster"
                title="Athletes"
                testId="page-roster-header"
            />

            <div className="px-5 md:px-10 mt-8">
                <div className="space-y-2.5">
                    <div
                        className="flex items-center gap-2 max-md:-mx-5 max-md:px-5"
                        data-testid={ROSTER.filterProgram}
                    >
                        <div className="flex flex-1 min-w-0 flex-wrap max-md:flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none">
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
                        <div className="hidden md:flex flex-wrap items-center gap-2 overflow-x-auto scrollbar-none shrink-0" data-testid={ROSTER.filterStatus}>
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    data-testid={ROSTER.addBtn}
                                    aria-label="Add family or athlete"
                                    className="shrink-0 inline-flex items-center justify-center eat-btn-primary h-9 w-9 p-0 md:h-auto md:w-auto md:px-4 md:py-2.5"
                                >
                                    <Plus size={18} strokeWidth={1.75} className="md:hidden" />
                                    <Plus size={16} strokeWidth={1.75} className="hidden md:block md:mr-1.5" />
                                    <span className="hidden md:inline uppercase tracking-wider2 text-sm" style={{ fontWeight: 500 }}>
                                        Add
                                    </span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="min-w-[10rem] rounded-none border border-subtle bg-mid p-1 shadow-lg"
                            >
                                <DropdownMenuItem
                                    data-testid={ROSTER.newFamilyBtn}
                                    onSelect={() => setFamilyFormOpen(true)}
                                    className="uppercase tracking-wider2 text-sm text-paper focus:bg-subtle focus:text-paper cursor-pointer rounded-none font-thunder"
                                    style={{ fontWeight: 500 }}
                                >
                                    New Family
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid={ROSTER.newBtn}
                                    onSelect={openNewAthlete}
                                    className="uppercase tracking-wider2 text-sm text-paper focus:bg-subtle focus:text-paper cursor-pointer rounded-none font-thunder"
                                    style={{ fontWeight: 500 }}
                                >
                                    New Athlete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
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
                        hint={athletes.length === 0 ? "Athletes enroll at eliteatmospheretraining.com/enroll." : "Adjust your filters."}
                    />
                ) : (
                    <div className="flex flex-col gap-2 pb-10">
                        {filtered.map((a) => (
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
                                                {formatAthletePrograms(a)}
                                                {a.date_of_birth && <span> · Age {computeAge(a.date_of_birth)}</span>}
                                                {a.status === "archived" && (
                                                    <span className="ml-2 inline-flex items-center gap-1"><Archive size={11} strokeWidth={1.5} /> Archived</span>
                                                )}
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
                        ))}
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
