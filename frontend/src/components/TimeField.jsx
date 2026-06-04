import React, { useState } from "react";
import { EatTimePicker } from "./EatTimePicker";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Clock } from "lucide-react";
import { fmtTime } from "../lib/format";

/**
 * Dark-themed time field replacing native `<input type="time">`.
 * Value/onChange use 24h "HH:mm" strings.
 */
export function TimeField({
    value,
    onChange,
    placeholder = "Select time",
    required = false,
    "data-testid": testId,
    disabled = false,
    className = "",
}) {
    const [open, setOpen] = useState(false);

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
                        {value ? fmtTime(value) : placeholder}
                    </span>
                    <Clock size={15} strokeWidth={1.5} className="text-muted ml-2 shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="z-[110] w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 bg-mid border border-subtle rounded-[2px] text-paper"
            >
                <EatTimePicker key={open ? "open" : "closed"} value={value} onChange={onChange} />
            </PopoverContent>
        </Popover>
    );
}
