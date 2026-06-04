import React, { useEffect, useMemo, useRef, useState } from "react";
import { getPaymentMethodPresets } from "../lib/paymentMethodPresets";

/**
 * Payment method combobox: type to search, pick a saved method, or enter a new one.
 */
export function PaymentMethodField({
    value,
    onChange,
    placeholder = "Zelle, Venmo, check…",
    "data-testid": testId,
    className = "",
}) {
    const [open, setOpen] = useState(false);
    const [presets, setPresets] = useState([]);
    const rootRef = useRef(null);

    useEffect(() => {
        setPresets(getPaymentMethodPresets());
    }, [open]);

    const filtered = useMemo(() => {
        const q = value.trim().toLowerCase();
        if (!q) return presets;
        return presets.filter((m) => m.toLowerCase().includes(q));
    }, [presets, value]);

    const showList = open && filtered.length > 0;

    useEffect(() => {
        function onDocClick(e) {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <input
                data-testid={testId}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                }}
                placeholder={placeholder}
                autoComplete="off"
                required
                className="eat-input w-full"
                aria-label="Payment method"
                aria-expanded={showList}
                aria-autocomplete="list"
            />
            {showList && (
                <ul
                    className="absolute z-[120] left-0 right-0 mt-1 max-h-40 overflow-y-auto eat-year-scroll border border-subtle bg-mid shadow-lg"
                    role="listbox"
                >
                    {filtered.map((method) => (
                        <li key={method} role="option">
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onChange(method);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2.5 text-sm text-paper hover:bg-subtle transition-colors font-light"
                            >
                                {method}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-muted font-light mt-1.5">
                Saved methods appear here. New entries are remembered when you mark paid.
            </p>
        </div>
    );
}
