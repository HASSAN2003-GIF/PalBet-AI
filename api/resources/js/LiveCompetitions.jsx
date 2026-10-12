import React, { useMemo } from 'react';

/** Groups competitions by region, keeping the server's alphabetical order. */
export function groupByRegion(competitions) {
    const groups = new Map();
    for (const c of competitions) {
        if (!groups.has(c.region)) groups.set(c.region, []);
        groups.get(c.region).push(c);
    }
    return Array.from(groups, ([region, items]) => ({ region, items }));
}

function Item({ active, onClick, label, count, valueCount }) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                    active ? 'bg-ink text-chalk' : 'text-ink-soft hover:bg-paper hover:text-ink'
                }`}
            >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {valueCount > 0 && (
                    <span className="flex items-center gap-1" aria-label={`${valueCount} value price${valueCount > 1 ? 's' : ''}`}>
                        <i className="yellow-card text-[11px]" aria-hidden="true" />
                        <span className={`cond nums text-xs font-bold ${active ? 'text-card' : 'text-card-ink'}`}>{valueCount}</span>
                    </span>
                )}
                <span className={`cond nums w-5 text-right text-xs ${active ? 'text-chalk/70' : 'text-muted'}`}>{count}</span>
            </button>
        </li>
    );
}

/**
 * Competition filter. Desktop: a rail of every competition playing on the selected day.
 * Phones: a native select, which is easier to use with a thumb than a long list.
 */
export default function LiveCompetitions({ competitions, summary, activeKey, onSelect }) {
    const groups = useMemo(() => groupByRegion(competitions), [competitions]);

    if (!competitions.length) return null;

    return (
        <>
            <label className="relative block lg:hidden">
                <span className="sr-only">Competition</span>
                <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <select
                    value={activeKey || ''}
                    onChange={(e) => onSelect(e.target.value || null)}
                    className="w-full appearance-none rounded-full border border-line-strong bg-paper px-4 py-2.5 pr-10 text-sm font-medium text-ink"
                >
                    <option value="">All competitions ({summary.matches})</option>
                    {groups.map((g) => (
                        <optgroup key={g.region} label={g.region}>
                            {g.items.map((c) => (
                                <option key={c.key} value={c.key}>
                                    {c.name} ({c.match_count})
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </label>

            <nav aria-label="Competitions" className="hidden lg:block">
                <ul className="flex flex-col gap-0.5">
                    <Item
                        active={!activeKey}
                        onClick={() => onSelect(null)}
                        label="All competitions"
                        count={summary.matches}
                        valueCount={summary.value}
                    />
                </ul>
                {groups.map((g) => (
                    <div key={g.region} className="mt-4">
                        <h3 className="px-3 pb-1 text-xs font-medium text-muted">{g.region}</h3>
                        <ul className="flex flex-col gap-0.5">
                            {g.items.map((c) => (
                                <Item
                                    key={c.key}
                                    active={activeKey === c.key}
                                    onClick={() => onSelect(c.key)}
                                    label={c.name}
                                    count={c.match_count}
                                    valueCount={c.value_count}
                                />
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>
        </>
    );
}
