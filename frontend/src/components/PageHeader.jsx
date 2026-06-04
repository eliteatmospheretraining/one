import React from "react";

export function PageHeader({ title, subtitle, actions, testId }) {
    return (
        <div className="px-5 md:px-10 lg:px-12 pt-8 md:pt-12 pb-6 border-b border-subtle">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div data-testid={testId} className="min-w-0">
                    {subtitle && <div className="eat-eyebrow mb-2">{subtitle}</div>}
                    <h1 className="eat-h1">{title}</h1>
                </div>
                {actions && <div className="flex gap-2 flex-wrap shrink-0 self-end">{actions}</div>}
            </div>
        </div>
    );
}
