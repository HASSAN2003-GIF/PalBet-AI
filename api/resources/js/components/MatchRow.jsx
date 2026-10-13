import React from 'react';
import ProbabilityStrip from './ProbabilityStrip';
import { kickoffTime, outcomeName, percent, price } from '../lib/format';
import { useAccount } from '../lib/account';

const dash = (s) => (s ? s.replace(' - ', '–') : null);

/** Final score when known (with the model's call underneath), otherwise the predicted score. */
function ScoreCell({ match, size }) {
    const big = size === 'lg' ? 'text-xl' : 'text-[17px]';
    if (match.result) {
        return (
            <span className="flex flex-col items-end gap-0.5">
                <span className={`cond nums ${big} font-extrabold leading-none text-ink`} title="Final score">
                    {match.result.home}–{match.result.away}
                </span>
                {match.predicted_score && (
                    <span className="text-[11px] leading-none text-muted">Model {dash(match.predicted_score)}</span>
                )}
            </span>
        );
    }
    return match.predicted_score
        ? <span className={`cond nums ${big} font-bold leading-none`} title="Most likely score">{dash(match.predicted_score)}</span>
        : <span className="text-muted">–</span>;
}

function StateLabel({ match }) {
    if (match.result) return <span className="text-[11px] font-semibold text-ink-soft">Full time</span>;
    if (match.state === 'in_play') {
        return (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-alert">
                <span className="h-1.5 w-1.5 rounded-full bg-alert" aria-hidden="true" />
                Kicked off
            </span>
        );
    }
    if (match.state === 'finished') return <span className="text-[11px] text-muted">Played</span>;
    return null;
}

function FormDots({ form }) {
    if (!form) return null;
    const tone = { W: 'bg-home text-on-home', D: 'bg-draw text-on-draw', L: 'bg-ink-soft/15 text-ink-soft' };
    const word = { W: 'win', D: 'draw', L: 'loss' };
    return (
        <span className="flex gap-0.5" role="img" aria-label={`Recent results: ${form.results.map((r) => word[r]).join(', ')}`}>
            {form.results.map((r, i) => (
                <span key={i} className={`cond grid h-4 w-4 place-items-center rounded-[3px] text-[10px] font-bold ${tone[r]}`} aria-hidden="true">
                    {r}
                </span>
            ))}
        </span>
    );
}

export default function MatchRow({ match, expanded, onToggle, onAsk, animate, headline = null }) {
    const detailId = `match-${match.id}-detail`;
    const past = match.state !== 'upcoming';

    return (
        <li className={`border-b border-line last:border-b-0 ${expanded ? 'bg-paper' : ''}`}>
            {headline}
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={detailId}
                className="grid w-full grid-cols-[3.25rem_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-paper sm:grid-cols-[3.5rem_minmax(0,1fr)_13rem_3.75rem_1rem] sm:px-5"
            >
                <span className="flex flex-col items-start gap-0.5 self-start pt-0.5 sm:self-center sm:pt-0">
                    <span className={`cond nums text-[17px] font-bold leading-none ${past ? 'text-muted' : 'text-ink'}`}>
                        {kickoffTime(match.kickoff)}
                    </span>
                    <StateLabel match={match} />
                </span>

                <span className="flex min-w-0 flex-col gap-1">
                    {['home', 'away'].map((side) => (
                        <span key={side} className="flex min-w-0 items-center gap-2">
                            <span className={`truncate text-[15px] ${past ? 'text-ink-soft' : 'text-ink'} font-semibold`}>
                                {match[side].name}
                            </span>
                            <span className="hidden md:inline-flex"><FormDots form={match[side].form} /></span>
                        </span>
                    ))}
                </span>

                {/* Mobile: score on the right of the teams; desktop has its own column. The value
                    card lives in the strip, next to the outcome it applies to. */}
                <span className="flex flex-col items-end self-start sm:hidden">
                    <ScoreCell match={match} />
                </span>

                <ProbabilityStrip match={match} animate={animate} className="col-span-3 sm:col-span-1" />

                <span className="hidden flex-col items-end sm:flex">
                    <ScoreCell match={match} size="lg" />
                </span>

                <svg aria-hidden="true" viewBox="0 0 16 16" className={`hidden h-4 w-4 text-muted transition-transform sm:block ${expanded ? 'rotate-180' : ''}`}>
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {expanded && <MatchDetail id={detailId} match={match} onAsk={onAsk} />}
        </li>
    );
}

function MatchDetail({ id, match, onAsk }) {
    const v = match.value;
    const outcomes = ['home', ...(match.three_way ? ['draw'] : []), 'away'];
    const selected = v?.is_value ? v.selection?.outcome : null;
    const { togglePick, pickFor } = useAccount();
    const canPick = match.state === 'upcoming';
    const picked = pickFor(match.id);

    return (
        <div id={id} className="grid gap-6 border-t border-line px-4 pb-6 pt-5 sm:px-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
            <div className="flex flex-col gap-5">
                <table className="w-full text-sm">
                    <caption className="sr-only">Model chance and best available price for each result</caption>
                    <thead>
                        <tr className="text-left text-xs text-muted">
                            <th scope="col" className="pb-2 font-medium">Result</th>
                            <th scope="col" className="pb-2 text-right font-medium">Model chance</th>
                            <th scope="col" className="pb-2 text-right font-medium">{canPick ? 'Best price, tap to pick' : 'Best price'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {outcomes.map((o) => (
                            <tr key={o} className={`border-t border-line ${selected === o ? 'bg-card/15' : ''}`}>
                                <th scope="row" className="py-2.5 pr-3 text-left font-semibold">
                                    <span className="flex items-center gap-2">
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${o === 'home' ? 'bg-home' : o === 'away' ? 'bg-away' : 'bg-draw'}`} aria-hidden="true" />
                                        <span className="truncate">{o === 'draw' ? 'Draw' : outcomeName(match, o)}</span>
                                        {selected === o && <i className="yellow-card text-sm" role="img" aria-label="Value price" />}
                                        {match.result?.outcome === o && (
                                            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-chalk">Result</span>
                                        )}
                                    </span>
                                </th>
                                <td className="cond nums py-2.5 text-right text-base font-bold">{match.probabilities[o]}%</td>
                                <td className="py-1.5 pl-2 text-right">
                                    {canPick && match.odds[o] ? (
                                        <button
                                            type="button"
                                            onClick={() => togglePick(match, o)}
                                            aria-pressed={picked === o}
                                            aria-label={`${picked === o ? 'Remove' : 'Add'} ${o === 'draw' ? 'the draw' : outcomeName(match, o)} at ${price(match.odds[o])} ${picked === o ? 'from' : 'to'} your slip`}
                                            className={`cond nums min-w-16 rounded-md border px-2.5 py-1.5 text-base font-bold transition-colors ${
                                                picked === o ? 'border-ink bg-ink text-chalk' : 'border-line-strong bg-chalk hover:border-ink'
                                            }`}
                                        >
                                            {price(match.odds[o])}
                                        </button>
                                    ) : (
                                        <span className="cond nums text-base font-bold">{price(match.odds[o])}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {v?.is_value ? (
                    <div className="rounded-lg border border-card bg-card/20 px-4 py-3 text-sm leading-relaxed text-card-ink">
                        <p className="font-semibold text-ink">
                            {v.selection ? `${v.selection.label} at ${price(v.selection.price)} ${v.won == null ? 'is' : 'was'} a value price.` : 'This match has a value price.'}
                            {v.won === true && ' It won.'}
                            {v.won === false && ' It lost.'}
                        </p>
                        <p className="mt-1 text-ink-soft">
                            That price is {percent(v.edge)} better than what the rest of the market says the result is worth
                            {match.bookmaker ? `, offered by ${match.bookmaker}` : ''}. Value means a fair price, not a likely winner.
                            {v.bankroll_share ? ` The engine would size it at ${percent(v.bankroll_share)} of a bankroll.` : ''}
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-muted">The best prices are in line with the market. No value price on this match.</p>
                )}
            </div>

            <div className="flex flex-col gap-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {match.result && (
                        <div>
                            <dt className="text-xs text-muted">Final score</dt>
                            <dd className="cond nums mt-1 text-3xl font-extrabold leading-none">{match.result.home}–{match.result.away}</dd>
                        </div>
                    )}
                    {match.predicted_score && (
                        <div>
                            <dt className="text-xs text-muted">{match.result ? 'Model expected' : 'Most likely score'}</dt>
                            <dd className={`cond nums mt-1 text-3xl font-extrabold leading-none ${match.result ? 'text-muted' : ''}`}>{dash(match.predicted_score)}</dd>
                        </div>
                    )}
                    {match.markets.map((m) => {
                        const n = parseInt(m.value, 10);
                        return (
                            <div key={m.label}>
                                <dt className="text-xs text-muted">{m.label}</dt>
                                <dd className="mt-1">
                                    <span className="cond nums text-xl font-bold leading-none">{m.value}</span>
                                    {!Number.isNaN(n) && (
                                        <span className="mt-1.5 block h-1 w-full rounded-full bg-line" aria-hidden="true">
                                            <span className="block h-full rounded-full bg-ink-soft" style={{ width: `${n}%` }} />
                                        </span>
                                    )}
                                </dd>
                            </div>
                        );
                    })}
                </dl>

                {(match.home.form || match.away.form) && (
                    <div className="flex flex-col gap-1.5 text-sm">
                        <p className="text-xs text-muted">Recent results (ESPN)</p>
                        {['home', 'away'].map((s) => match[s].form && (
                            <div key={s} className="flex items-center justify-between gap-3">
                                <span className="truncate">{match[s].name}</span>
                                <FormDots form={match[s].form} />
                            </div>
                        ))}
                    </div>
                )}

                {match.rationale && (
                    <details className="group text-sm text-ink-soft">
                        <summary className="cursor-pointer list-none text-xs text-muted hover:text-ink">
                            <span className="underline decoration-line-strong underline-offset-4">How the engine read this match</span>
                        </summary>
                        <p className="mt-2 leading-relaxed">{match.rationale}</p>
                    </details>
                )}

                <button
                    type="button"
                    onClick={() => onAsk(match)}
                    className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-chalk transition hover:bg-home"
                >
                    Ask the analyst about this match
                </button>
            </div>
        </div>
    );
}
