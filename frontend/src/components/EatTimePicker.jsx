import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { TIME_MINUTE_OPTIONS, formatTime24, from12Hour, parseTime24, to12Hour } from "../lib/format";

const PANEL_H = "h-[15.75rem]";
/** Clock order: 12 first, then 1–11. */
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const SCROLL_PAD = "h-[4.5rem] shrink-0";
const ROW_PX = 36;
const HOUR_REPEAT = 31;

function TimeScrollColumn({ label, items, active, onPick, format, itemKey }) {
    const scrollRef = useRef(null);
    const userPicked = useRef(false);

    useEffect(() => {
        userPicked.current = false;
    }, [items.length, label]);

    useEffect(() => {
        if (userPicked.current) return;
        const root = scrollRef.current;
        if (!root) return;
        const selected = root.querySelector("[data-selected='true']");
        selected?.scrollIntoView({ block: "center" });
    }, [active, items.length]);

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
    }, [items.length]);

    return (
        <div className="flex-1 flex flex-col min-w-0">
            <div className="text-[10px] uppercase tracking-wider2 text-muted text-center mb-2">{label}</div>
            <div
                ref={scrollRef}
                tabIndex={-1}
                className={`eat-year-scroll overflow-y-auto overscroll-contain ${PANEL_H}`}
            >
                <div className={SCROLL_PAD} aria-hidden />
                {items.map((item) => {
                    const selected = item.value === active;
                    return (
                        <button
                            key={itemKey(item)}
                            type="button"
                            data-selected={selected ? "true" : undefined}
                            onClick={() => {
                                userPicked.current = true;
                                onPick(item.value);
                            }}
                            className={`h-9 w-full text-sm tracking-wider2 transition-colors hover:bg-subtle ${
                                selected ? "bg-accent text-ink hover:bg-accent hover:text-ink" : "text-paper"
                            }`}
                        >
                            {format(item.value)}
                        </button>
                    );
                })}
                <div className={SCROLL_PAD} aria-hidden />
            </div>
        </div>
    );
}

function HourInfiniteScrollColumn({ active, onPick }) {
    const scrollRef = useRef(null);
    const userPicked = useRef(false);
    const adjusting = useRef(false);
    const middleCycle = Math.floor(HOUR_REPEAT / 2);

    const items = useMemo(() => {
        const list = [];
        for (let cycle = 0; cycle < HOUR_REPEAT; cycle += 1) {
            for (const hour of HOURS_12) {
                list.push({ cycle, value: hour });
            }
        }
        return list;
    }, []);

    const blockPx = HOURS_12.length * ROW_PX;

    const scrollToHour = useCallback(
        (hour12, cycle = middleCycle) => {
            const root = scrollRef.current;
            if (!root) return;
            const btn = root.querySelector(`[data-hour="${hour12}"][data-cycle="${cycle}"]`);
            if (!btn) return;
            adjusting.current = true;
            btn.scrollIntoView({ block: "center" });
            requestAnimationFrame(() => {
                adjusting.current = false;
            });
        },
        [middleCycle]
    );

    useEffect(() => {
        userPicked.current = false;
        scrollToHour(active);
    }, [active, scrollToHour]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || blockPx <= 0) return undefined;

        function recycle() {
            if (adjusting.current) return;
            const block = Math.floor(el.scrollTop / blockPx);
            if (block < 3) {
                adjusting.current = true;
                el.scrollTop += blockPx * (HOUR_REPEAT - 6);
                requestAnimationFrame(() => {
                    adjusting.current = false;
                });
            } else if (block >= HOUR_REPEAT - 3) {
                adjusting.current = true;
                el.scrollTop -= blockPx * (HOUR_REPEAT - 6);
                requestAnimationFrame(() => {
                    adjusting.current = false;
                });
            }
        }

        el.addEventListener("scroll", recycle, { passive: true });
        return () => el.removeEventListener("scroll", recycle);
    }, [blockPx]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return undefined;

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
    }, []);

    return (
        <div className="flex-1 flex flex-col min-w-0">
            <div className="text-[10px] uppercase tracking-wider2 text-muted text-center mb-2">Hour</div>
            <div
                ref={scrollRef}
                tabIndex={-1}
                className={`eat-year-scroll overflow-y-auto overscroll-contain ${PANEL_H}`}
            >
                <div className={SCROLL_PAD} aria-hidden />
                {items.map((item) => {
                    const selected = item.value === active;
                    return (
                        <button
                            key={`${item.cycle}-${item.value}`}
                            type="button"
                            data-hour={item.value}
                            data-cycle={item.cycle}
                            data-selected={selected ? "true" : undefined}
                            onClick={() => {
                                userPicked.current = true;
                                onPick(item.value);
                            }}
                            className={`h-9 w-full text-sm tracking-wider2 transition-colors hover:bg-subtle ${
                                selected ? "bg-accent text-ink hover:bg-accent hover:text-ink" : "text-paper"
                            }`}
                        >
                            {item.value}
                        </button>
                    );
                })}
                <div className={SCROLL_PAD} aria-hidden />
            </div>
        </div>
    );
}

/**
 * 12-hour time picker — value/onChange use 24h "HH:mm" (15-minute increments).
 * Hours: 12, 1, 2, … 11 with infinite scroll; opens centered on the selected hour.
 */
export function EatTimePicker({ value, onChange }) {
    const { hour24, minute } = parseTime24(value);
    const { hour12, pm } = to12Hour(hour24);

    const minuteItems = useMemo(
        () => TIME_MINUTE_OPTIONS.map((m) => ({ value: m })),
        []
    );

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
                <HourInfiniteScrollColumn active={hour12} onPick={(h) => emit(h, minute, pm)} />
                <TimeScrollColumn
                    label="Min"
                    items={minuteItems}
                    active={minute}
                    onPick={(m) => emit(hour12, m, pm)}
                    format={(m) => String(m).padStart(2, "0")}
                    itemKey={(item) => `min-${item.value}`}
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
