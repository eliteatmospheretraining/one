import React, { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FROM_YEAR = 1980;
const YEARS_AHEAD = 5;
const PANEL_H = "h-[15.75rem]";

function addMonths(date, delta) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + delta);
    return d;
}

function setMonthYear(date, monthIndex, year) {
    return new Date(year, monthIndex, 1);
}

function EmptyCaption() {
    return null;
}

function EmptyNav() {
    return null;
}

function PickerHeader({ displayMonth, panel, setPanel, onMonthChange, fromYear, toYear }) {
    const monthLabel = displayMonth
        .toLocaleString("en-US", { month: "long" })
        .toUpperCase();
    const year = displayMonth.getFullYear();
    const showArrows = panel === "days" || panel === "months";

    function prev() {
        if (panel === "days") onMonthChange(addMonths(displayMonth, -1));
        else if (panel === "months") onMonthChange(setMonthYear(displayMonth, displayMonth.getMonth(), year - 1));
    }

    function next() {
        if (panel === "days") onMonthChange(addMonths(displayMonth, 1));
        else if (panel === "months") onMonthChange(setMonthYear(displayMonth, displayMonth.getMonth(), year + 1));
    }

    const titleClass =
        "uppercase tracking-wider2 text-sm transition-colors hover:text-accent focus:outline-none focus-visible:text-accent";

    return (
        <div className="flex justify-center relative items-center min-h-9 pt-1 mb-3 w-full">
            {showArrows && (
                <button
                    type="button"
                    aria-label="Previous"
                    onClick={prev}
                    className="absolute left-0 h-7 w-7 inline-flex items-center justify-center text-muted hover:text-paper"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
            )}

            {panel === "years" ? (
                <span className="text-sm uppercase tracking-wider2 text-muted">
                    {fromYear} – {toYear}
                </span>
            ) : (
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setPanel("months")}
                        className={`${titleClass} ${panel === "months" ? "text-accent" : "text-paper"}`}
                    >
                        {monthLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => setPanel("years")}
                        className={`${titleClass} ${panel === "years" ? "text-accent" : "text-paper"}`}
                    >
                        {year}
                    </button>
                </div>
            )}

            {showArrows && (
                <button
                    type="button"
                    aria-label="Next"
                    onClick={next}
                    className="absolute right-0 h-7 w-7 inline-flex items-center justify-center text-muted hover:text-paper"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

function MonthGrid({ displayMonth, onPick }) {
    const active = displayMonth.getMonth();
    return (
        <div className={`grid grid-cols-3 gap-1 w-full ${PANEL_H} content-start`}>
            {MONTHS.map((label, i) => (
                <button
                    key={label}
                    type="button"
                    onClick={() => onPick(i)}
                    className={`h-9 w-full text-sm uppercase tracking-wider2 transition-colors hover:bg-subtle ${
                        i === active ? "bg-accent text-ink hover:bg-accent hover:text-ink" : "text-paper"
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function YearGrid({ displayMonth, fromYear, toYear, onPick }) {
    const active = displayMonth.getFullYear();
    const scrollRef = useRef(null);
    const years = useMemo(() => {
        const list = [];
        for (let y = fromYear; y <= toYear; y += 1) list.push(y);
        return list;
    }, [fromYear, toYear]);

    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return;
        const selected = root.querySelector("[data-selected-year='true']");
        selected?.scrollIntoView({ block: "center" });
    }, [active, fromYear, toYear]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        function onWheel(e) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            if (scrollHeight <= clientHeight) return;

            const maxScroll = scrollHeight - clientHeight;
            const next = Math.max(0, Math.min(maxScroll, scrollTop + e.deltaY));
            if (next === scrollTop) return;

            e.preventDefault();
            e.stopPropagation();
            el.scrollTop = next;
        }

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [years.length]);

    return (
        <div
            ref={scrollRef}
            tabIndex={-1}
            className={`eat-year-scroll w-full overflow-y-auto overflow-x-hidden overscroll-contain ${PANEL_H}`}
        >
            <div className="grid grid-cols-4 gap-1">
                {years.map((y) => (
                    <button
                        key={y}
                        type="button"
                        data-selected-year={y === active ? "true" : undefined}
                        onClick={() => onPick(y)}
                        className={`h-9 w-full text-sm tracking-wider2 transition-colors hover:bg-subtle ${
                            y === active ? "bg-accent text-ink hover:bg-accent hover:text-ink" : "text-paper"
                        }`}
                    >
                        {y}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Day/month/year picker with the original caption look: clickable month + year labels.
 */
export function EatDatePicker({
    selected,
    onSelect,
    month,
    onMonthChange,
    panel,
    setPanel,
    classNames = {},
}) {
    const toYear = new Date().getFullYear() + YEARS_AHEAD;

    function pickMonth(monthIndex) {
        onMonthChange(setMonthYear(month, monthIndex, month.getFullYear()));
        setPanel("days");
    }

    function pickYear(year) {
        onMonthChange(setMonthYear(month, month.getMonth(), year));
        setPanel("months");
    }

    return (
        <div className="p-3 w-full box-border">
            <PickerHeader
                displayMonth={month}
                panel={panel}
                setPanel={setPanel}
                onMonthChange={onMonthChange}
                fromYear={FROM_YEAR}
                toYear={toYear}
            />

            {panel === "days" && (
                <DayPicker
                    mode="single"
                    selected={selected}
                    onSelect={onSelect}
                    month={month}
                    onMonthChange={onMonthChange}
                    fixedWeeks
                    showOutsideDays
                    initialFocus
                    components={{ Caption: EmptyCaption, Nav: EmptyNav }}
                    classNames={{
                        months: "flex flex-col w-full",
                        month: "space-y-3 w-full",
                        table: "w-full border-collapse",
                        head_row: "flex w-full",
                        head_cell:
                            "text-muted flex-1 text-center text-[10px] uppercase tracking-wider2 font-light",
                        row: "flex w-full mt-1",
                        cell: "relative flex-1 p-0 text-center text-sm focus-within:relative focus-within:z-20",
                        day: "h-9 w-full p-0 inline-flex items-center justify-center text-paper hover:bg-subtle transition-colors",
                        day_selected: "bg-accent text-ink hover:bg-accent hover:text-ink",
                        day_today: "border border-subtle text-accent",
                        day_outside: "text-muted/50",
                        day_disabled: "text-muted/30 cursor-not-allowed",
                        day_hidden: "invisible",
                        ...classNames,
                    }}
                />
            )}

            {panel === "months" && (
                <MonthGrid displayMonth={month} onPick={pickMonth} />
            )}

            {panel === "years" && (
                <YearGrid
                    displayMonth={month}
                    fromYear={FROM_YEAR}
                    toYear={toYear}
                    onPick={pickYear}
                />
            )}
        </div>
    );
}
