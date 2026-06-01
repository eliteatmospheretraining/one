import React from "react";

export function PageHeader({ title, subtitle, actions, testId }) {
    return (
        <div className="px-4 md:px-8 pt-6 md:pt-10 pb-4 md:pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b-2 border-obsidian">
            <div data-testid={testId}>
                {subtitle && (
                    <div className="eat-label">{subtitle}</div>
                )}
                <h1 className="eat-h1 mt-1">{title}</h1>
            </div>
            {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
        </div>
    );
}
