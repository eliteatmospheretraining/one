import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLocationPresets } from "../lib/locationPresets";
import { PROGRAM_LABEL } from "../lib/format";

/**
 * Location combobox: type to search, pick a saved value for this program type.
 */
export function LocationField({
    value,
    onChange,
    sessionType,
    placeholder = "Court 3, Tropical Park",
    "data-testid": testId,
    className = "",
}) {
    const [open, setOpen] = useState(false);
    const [presets, setPresets] = useState([]);
    const rootRef = useRef(null);

    useEffect(() => {
        setPresets(getLocationPresets(sessionType));
    }, [sessionType, open]);

    const filtered = useMemo(() => {
        const q = value.trim().toLowerCase();
        if (!q) return presets;
        return presets.filter((p) => p.toLowerCase().includes(q));
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

    const typeLabel = PROGRAM_LABEL[sessionType] || sessionType;

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
                className="eat-input w-full"
                aria-label={`Location for ${typeLabel}`}
                aria-expanded={showList}
                aria-autocomplete="list"
            />
            {showList && (
                <ul
                    className="absolute z-[120] left-0 right-0 mt-1 max-h-40 overflow-y-auto eat-year-scroll border border-subtle bg-mid shadow-lg"
                    role="listbox"
                >
                    {filtered.map((loc) => (
                        <li key={loc} role="option">
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onChange(loc);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2.5 text-sm text-paper hover:bg-subtle transition-colors font-light"
                            >
                                {loc}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-muted font-light mt-1.5">
                Saved for {typeLabel}. New locations you enter are added after you create the session.
            </p>
        </div>
    );
}
