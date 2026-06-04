import React, { useEffect, useState } from "react";
import { EatDatePicker } from "./EatDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { fmtDate } from "../lib/format";

/**
 * Dark-themed date field replacing the native `<input type="date"`.
 * Value/onChange use ISO yyyy-mm-dd strings to keep the existing form contracts.
 */
export function DateField({
    value,
    onChange,
    placeholder = "Select date",
    required = false,
    "data-testid": testId,
    disabled = false,
    className = "",
}) {
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState("days");
    const selected = value ? new Date(value + "T00:00:00") : undefined;
    const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());

    useEffect(() => {
        if (open) {
            setViewMonth(selected ?? new Date());
            setPanel("days");
        }
    }, [open, selected]);

    function handle(d) {
        if (!d) {
            onChange("");
        } else {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            onChange(`${y}-${m}-${day}`);
        }
        setOpen(false);
    }

    return (
        <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-testid={testId}
                    disabled={disabled}
                    className={`eat-input flex items-center justify-between text-left pr-3 ${className}`}
                >
                    <span className={value ? "text-paper" : "text-muted"}>
                        {value ? fmtDate(value, { month: "short", day: "numeric", year: "numeric" }) : placeholder}
                    </span>
                    <CalendarIcon size={15} strokeWidth={1.5} className="text-muted ml-2 shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="z-[110] w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 bg-mid border border-subtle roun[...]"
            >
                <EatDatePicker
                    selected={selected}
                    onSelect={handle}
                    month={viewMonth}
                    onMonthChange={setViewMonth}
                    panel={panel}
                    setPanel={setPanel}
                />
            </PopoverContent>
        </Popover>
    );
}
