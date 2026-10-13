import React from 'react';
import MatchRow from './MatchRow';
import { percent, price } from '../lib/format';

/** Every value price on the day: upcoming matches first, then biggest edge first. */
export default function ValueBoard({ competitions, expandedId, onToggle, onAsk, animate }) {
    const items = competitions
        .flatMap((c) => c.matches.filter((m) => m.value?.is_value).map((m) => ({ match: m, competition: c })))
        .sort((a, b) =>
            (a.match.state !== 'upcoming') - (b.match.state !== 'upcoming') ||
            b.match.value.edge - a.match.value.edge);

    if (!items.length) {
        return (
            <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
                <p className="font-semibold">No value prices on this day.</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                    Every best price is in line with the market consensus. Try another day, or browse all matches.
                </p>
            </div>
        );
    }

    return (
        <ul className="overflow-hidden rounded-xl border border-line bg-chalk">
            {items.map(({ match, competition }) => {
                const sel = match.value.selection;
                return (
                    <MatchRow
                        key={match.id}
                        match={match}
                        expanded={expandedId === match.id}
                        onToggle={() => onToggle(match.id)}
                        onAsk={onAsk}
                        animate={animate}
                        headline={
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 sm:px-5">
                                <i className="yellow-card self-center text-lg" aria-hidden="true" />
                                <span className="semi-cond text-lg font-bold">
                                    {sel ? `${sel.label} at ${price(sel.price)}` : 'Value price'}
                                </span>
                                <span className="cond nums text-lg font-bold text-home">+{percent(match.value.edge)}</span>
                                {match.value.won === true && <span className="rounded-full bg-home px-2.5 py-0.5 text-xs font-semibold text-on-home">Won</span>}
                                {match.value.won === false && <span className="rounded-full bg-ink-soft/15 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Lost</span>}
                                <span className="text-sm text-muted">{competition.name}, {competition.region}</span>
                            </div>
                        }
                    />
                );
            })}
        </ul>
    );
}
