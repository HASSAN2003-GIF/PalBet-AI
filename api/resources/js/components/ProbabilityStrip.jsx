import React from 'react';

const SEGMENTS = [
    { key: 'home', bar: 'bg-home', text: 'text-home' },
    { key: 'draw', bar: 'bg-draw', text: 'text-draw-ink' },
    { key: 'away', bar: 'bg-away', text: 'text-away' },
];

/**
 * Home / draw / away win chances as one bar. The value outcome (if any) gets a yellow card
 * beside its number. `labels` adds the outcome names under the numbers (detail view).
 */
export default function ProbabilityStrip({ match, animate = false, labels = false, className = '' }) {
    const p = match.probabilities;
    const valueOutcome = match.value?.is_value ? match.value.selection?.outcome : null;
    const segments = SEGMENTS.filter((s) => p[s.key] != null);
    const names = { home: match.home.name, draw: 'Draw', away: match.away.name };

    const summary = segments.map((s) => `${names[s.key]} ${p[s.key]}%`).join(', ');

    return (
        <div className={className} role="img" aria-label={`Model win chances: ${summary}`}>
            <div className={`flex h-2 w-full gap-[2px] overflow-hidden rounded-full ${animate ? 'strip-animate' : ''}`}>
                {segments.map((s) => (
                    <span
                        key={s.key}
                        className={`${s.bar} h-full first:rounded-l-full last:rounded-r-full`}
                        style={{ width: `${Math.max(p[s.key], 2)}%` }}
                    />
                ))}
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-[13px] leading-none" aria-hidden="true">
                {segments.map((s) => (
                    <span
                        key={s.key}
                        className={`flex min-w-0 items-center gap-1 ${s.key === 'draw' ? 'justify-center' : ''} ${s.key === 'away' ? 'justify-end text-right' : ''}`}
                    >
                        {valueOutcome === s.key && s.key !== 'away' && <i className="yellow-card text-[13px]" />}
                        <span className={`cond nums font-bold ${s.text}`}>{p[s.key]}%</span>
                        {labels && <span className="truncate text-xs text-muted">{names[s.key]}</span>}
                        {valueOutcome === s.key && s.key === 'away' && <i className="yellow-card text-[13px]" />}
                    </span>
                ))}
            </div>
        </div>
    );
}
