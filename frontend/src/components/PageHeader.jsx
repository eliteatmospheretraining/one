import React from "react";

export function PageHeader({ title, subtitle, actions, testId }) {
    return (
        <div className="px-5 md:px-10 lg:px-12 pt-8 md:pt-12 pb-6 border-b border-subtle">
            <div className="flex flex-row items-end justify-between gap-3">
                <div data-testid={testId} className="min-w-0 flex-1">
                    {subtitle && <div className="eat-eyebrow mb-2">{subtitle}</div>}
                    <h1 className="eat-h1">{title}</h1>
                </div>
                {actions && <div className="flex shrink-0 items-end">{actions}</div>}
            </div>
        </div>
    );
}
