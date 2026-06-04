import React, { useEffect, useRef } from "react";
import { TIME_MINUTE_OPTIONS, formatTime24, from12Hour, parseTime24, to12Hour } from "../lib/format";

const PANEL_H = "h-[15.75rem]";
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function useScrollWheel(scrollRef, deps = []) {
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
    }, deps);
}

function TimeScrollColumn({ label, items, active, onPick, format }) {
    const scrollRef = useRef(null);

    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return;
        const selected = root.querySelector("[data-selected='true']");
        selected?.scrollIntoView({ block: "center" });
    }, [active, items.length]);

    useScrollWheel(scrollRef, [scrollRef, items.length]);

    return (
        <div className="flex-1 flex flex-col min-w-0">
            <div className="text-[10px] uppercase tracking-wider2 text-muted text-center mb-2">{label}</div>
            <div
                ref={scrollRef}
                tabIndex={-1}
                className={`eat-year-scroll overflow-y-auto overscroll-contain ${PANEL_H}`}
            >
                {items.map((item) => {
                    const selected = item === active;
                    return (
                        <button
                            key={item}
                            type="button"
                            data-selected={selected ? "true" : undefined}
                            onClick={() => onPick(item)}
                            className={`h-9 w-full text-sm tracking-wider2 transition-colors hover:bg-subtle ${
                                selected ? "bg-accent text-ink hover:bg-accent hover:text-ink" : "text-paper"
                            }`}
                        >
                            {format(item)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * 12-hour time picker — value/onChange use 24h "HH:mm" (15-minute increments).
 */
export function EatTimePicker({ value, onChange }) {
    const { hour24, minute } = parseTime24(value);
    const { hour12, pm } = to12Hour(hour24);

    function emit(h12, min, isPm) {
        onChange(formatTime24(from12Hour(h12, isPm), min));
    }

    const periodClass = (active) =>
        `h-9 w-full text-sm uppercase tracking-wider2 transition-colors hover:bg-subtle ${
            active ? "bg-accent text-ink hover:bg-accent hover:text-ink" : "text-paper"
        }`;

    return (
        <div className="p-3 w-full box-border">
            <div className="flex gap-2 w-full">
                <TimeScrollColumn
                    label="Hour"
                    items={HOURS_12}
                    active={hour12}
                    onPick={(h) => emit(h, minute, pm)}
                    format={(h) => String(h)}
                />
                <TimeScrollColumn
                    label="Min"
                    items={TIME_MINUTE_OPTIONS}
                    active={minute}
                    onPick={(m) => emit(hour12, m, pm)}
                    format={(m) => String(m).padStart(2, "0")}
                />
                <div className="flex flex-col w-14 shrink-0">
                    <div className="text-[10px] uppercase tracking-wider2 text-muted text-center mb-2">&nbsp;</div>
                    <div className={`flex flex-col gap-1 ${PANEL_H}`}>
                        <button type="button" className={periodClass(!pm)} onClick={() => emit(hour12, minute, false)}>
                            AM
                        </button>
                        <button type="button" className={periodClass(pm)} onClick={() => emit(hour12, minute, true)}>
                            PM
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
