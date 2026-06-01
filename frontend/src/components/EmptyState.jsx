import React from "react";

export function EmptyState({ title, hint, action }) {
    return (
        <div className="py-16 md:py-20 text-center flex flex-col items-center gap-3">
            <div className="font-thunder uppercase text-3xl tracking-tight text-paper" style={{ fontWeight: 500 }}>{title}</div>
            {hint && <p className="text-sm text-muted max-w-sm font-light">{hint}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
