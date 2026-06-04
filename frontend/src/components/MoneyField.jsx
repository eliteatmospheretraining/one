import React, { useState } from "react";
import { formatMoneyInputValue, parseMoneyInput, sanitizeMoneyTyping } from "../lib/format";

/**
 * Currency input with $ prefix. Text-based (no browser number spinners).
 */
export function MoneyField({
    value,
    onChange,
    "data-testid": testId,
    className = "",
    required = false,
}) {
    const [focused, setFocused] = useState(false);

    const display = focused ? value : formatMoneyInputValue(value);

    function handleChange(e) {
        onChange(sanitizeMoneyTyping(e.target.value));
    }

    function handleBlur() {
        setFocused(false);
        const n = parseMoneyInput(value);
        if (n != null) onChange(formatMoneyInputValue(n));
    }

    return (
        <div className={`relative ${className}`}>
            <span
                className="absolute inset-y-0 left-3.5 flex items-center text-muted pointer-events-none text-base font-light"
                aria-hidden
            >
                $
            </span>
            <input
                data-testid={testId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required={required}
                value={display}
                onChange={handleChange}
                onFocus={() => setFocused(true)}
                onBlur={handleBlur}
                placeholder="0.00"
                className="eat-input w-full pl-8"
                aria-label="Amount in US dollars"
            />
        </div>
    );
}
