import React from "react";

export function EmptyState({ title, hint, action, icon: Icon }) {
    return (
        <div className="border-2 border-dashed border-zinc-300 p-8 md:p-12 text-center flex flex-col items-center gap-3">
            {Icon && (
                <div className="w-14 h-14 bg-zinc-100 border-2 border-obsidian flex items-center justify-center mb-2">
                    <Icon size={26} className="text-obsidian" />
                </div>
            )}
            <div className="font-heading uppercase text-2xl tracking-tight">{title}</div>
            {hint && <p className="text-sm text-zinc-500 max-w-sm">{hint}</p>}
            {action}
        </div>
    );
}
