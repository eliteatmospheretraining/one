import React, { useState } from "react";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { fmtDate } from "../lib/format";

/**
 * Dark-themed date field replacing the native `<input type="date">`.
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
    const selected = value ? new Date(value + "T00:00:00") : undefined;

    function handle(d) {
        if (!d) {
            onChange("");
        } else {
            // serialize as local yyyy-mm-dd (avoid UTC offset shifting day)
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
                className="w-auto p-0 bg-mid border border-subtle rounded-[2px] text-paper"
            >
                <Calendar
                    mode="single"
                    selected={selected}
                    onSelect={handle}
                    initialFocus
                    classNames={{
                        months: "p-3",
                        month: "space-y-3",
                        caption: "flex justify-center pt-1 relative items-center text-paper",
                        caption_label: "text-sm uppercase tracking-wider2",
                        nav: "space-x-1 flex items-center",
                        nav_button: "h-7 w-7 p-0 inline-flex items-center justify-center text-muted hover:text-paper",
                        nav_button_previous: "absolute left-1",
                        nav_button_next: "absolute right-1",
                        table: "w-full border-collapse",
                        head_row: "flex",
                        head_cell: "text-muted w-9 text-[10px] uppercase tracking-wider2 font-light",
                        row: "flex w-full mt-1",
                        cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                        day: "h-9 w-9 p-0 inline-flex items-center justify-center text-paper hover:bg-subtle transition-colors",
                        day_selected: "bg-accent text-ink hover:bg-accent hover:text-ink",
                        day_today: "border border-subtle text-accent",
                        day_outside: "text-muted/50",
                        day_disabled: "text-muted/30 cursor-not-allowed",
                        day_hidden: "invisible",
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}
