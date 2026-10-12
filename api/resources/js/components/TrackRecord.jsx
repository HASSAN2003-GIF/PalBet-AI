import React, { useEffect, useState } from 'react';
import { getTrackRecord } from '../lib/api';
import { kickoffTime, price } from '../lib/format';

const PERIODS = [
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
    { days: 365, label: 'Year' },
];

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const signed = (x, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`;

function CalibrationChart({ rows }) {
    if (!rows.length) return null;
    return (
        <figure>
            <figcaption className="mb-4 max-w-2xl text-sm leading-relaxed text-muted">
                Every win chance the model gave, grouped by size. The tick is what it said on average; the bar is how often
                that result really happened. A well-calibrated model has bars ending at their ticks.
            </figcaption>
            <ol className="flex flex-col gap-3">
                {rows.map((r) => (
                    <li key={r.from} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-3 text-sm sm:grid-cols-[6.5rem_1fr_10rem]">
                        <span className="cond nums font-semibold">{Math.round(r.from * 100)}–{Math.round(r.to * 100)}%</span>
                        <span className="relative h-3 rounded-full bg-line" role="img"
                              aria-label={`Said ${pct(r.predicted)}, happened ${pct(r.observed)} across ${r.forecasts} forecasts`}>
                            <span className="absolute inset-y-0 left-0 rounded-full bg-home" style={{ width: `${r.observed * 100}%` }} />
                            <span className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `calc(${r.predicted * 100}% - 1px)` }} />
                        </span>
                        <span className="cond nums text-right text-muted" aria-hidden="true">
                            {pct(r.predicted)} → <span className="font-bold text-ink">{pct(r.observed)}</span>
                            <span className="ml-1 hidden sm:inline">({r.forecasts})</span>
                        </span>
                    </li>
                ))}
            </ol>
        </figure>
    );
}

export default function TrackRecord() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState(null);

    useEffect(() => {
        const c = new AbortController();
        setStatus('loading');
        getTrackRecord(days, c.signal)
            .then((d) => { setData(d); setStatus('ready'); })
            .catch((e) => { if (e.name !== 'AbortError') { setError(e.message); setStatus('error'); } });
        return () => c.abort();
    }, [days]);

    return (
        <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <h1 className="semi-cond text-3xl font-extrabold tracking-tight sm:text-4xl">Track record</h1>
                <div role="tablist" aria-label="Period" className="inline-flex self-start rounded-full border border-line-strong bg-paper p-1">
                    {PERIODS.map((p) => (
                        <button key={p.days} type="button" role="tab" aria-selected={days === p.days} onClick={() => setDays(p.days)}
                                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${days === p.days ? 'bg-ink text-chalk' : 'text-ink-soft hover:text-ink'}`}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {status === 'loading' && <p className="mt-10 text-muted" aria-busy="true">Checking results…</p>}
            {status === 'error' && <p role="alert" className="mt-10 text-alert">{error}</p>}

            {status === 'ready' && data.matches === 0 && (
                <div className="mt-10 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
                    <p className="font-semibold">No finished matches with results in this period yet.</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                        Final scores are collected a couple of hours after each match ends. Try a longer period.
                    </p>
                </div>
            )}

            {status === 'ready' && data.matches > 0 && (
                <div className="mt-8 flex flex-col gap-14">
                    <p className="semi-cond max-w-3xl text-2xl font-semibold leading-snug sm:text-[28px]">
                        The model's favourite won <span className="cond nums font-extrabold">{pct(data.favourite.rate)}</span> of {data.matches} matches.
                        It expected <span className="cond nums font-extrabold">{pct(data.favourite.expected_rate)}</span>.
                    </p>

                    <dl className="grid gap-8 sm:grid-cols-3">
                        <div className="border-t-2 border-card pt-3">
                            <dt className="flex items-center gap-2 text-sm text-muted"><i className="yellow-card text-[13px]" aria-hidden="true" />Value prices</dt>
                            <dd className="mt-1">
                                <span className="cond nums text-4xl font-extrabold">{data.value.won}/{data.value.count}</span>
                                <span className="ml-2 text-sm text-muted">won ({pct(data.value.hit_rate)})</span>
                            </dd>
                            {data.value.count > 0 && (
                                <p className="mt-1 text-sm text-ink-soft">
                                    One token on each, at an average price of {price(data.value.average_price)}:{' '}
                                    <span className={`font-semibold ${data.value.profit >= 0 ? 'text-home' : 'text-alert'}`}>
                                        {signed(data.value.profit)} tokens ({signed(data.value.roi * 100)}%)
                                    </span>
                                </p>
                            )}
                        </div>
                        <div className="border-t-2 border-ink pt-3">
                            <dt className="text-sm text-muted">Exact score right</dt>
                            <dd className="cond nums mt-1 text-4xl font-extrabold">{pct(data.exact_score.rate)}</dd>
                            <p className="mt-1 text-sm text-ink-soft">{data.exact_score.hits} of {data.exact_score.total} matches. Exact scores are hard; 10–12% is typical.</p>
                        </div>
                        <div className="border-t-2 border-ink pt-3">
                            <dt className="text-sm text-muted">Brier score</dt>
                            <dd className="cond nums mt-1 text-4xl font-extrabold">{data.brier?.toFixed(3)}</dd>
                            <p className="mt-1 text-sm text-ink-soft">Accuracy of all the win chances. Lower is better; always guessing a third scores 0.667.</p>
                        </div>
                    </dl>

                    <section aria-labelledby="calibration">
                        <h2 id="calibration" className="semi-cond mb-3 text-xl font-bold">Did the win chances hold up?</h2>
                        <CalibrationChart rows={data.calibration} />
                    </section>

                    {data.value.recent.length > 0 && (
                        <section aria-labelledby="recent-value">
                            <h2 id="recent-value" className="semi-cond mb-3 text-xl font-bold">Latest value prices</h2>
                            <ul className="divide-y divide-line border-y border-line">
                                {data.value.recent.map((v) => (
                                    <li key={v.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_auto_auto]">
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold">{v.selection} at {price(v.price)}</span>
                                            <span className="block truncate text-sm text-muted">
                                                {v.home} {v.score} {v.away}, {v.competition}, {new Date(v.kickoff).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} {kickoffTime(v.kickoff)}
                                            </span>
                                        </span>
                                        <span className="cond nums hidden text-right text-sm text-muted sm:block">
                                            {v.won ? `+${(v.price - 1).toFixed(2)}` : '−1.00'}
                                        </span>
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.won ? 'bg-home text-white' : 'bg-ink-soft/15 text-ink-soft'}`}>
                                            {v.won ? 'Won' : 'Lost'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <p className="max-w-2xl text-sm leading-relaxed text-muted">
                        Results come from The Odds API after each match. Past results don't predict future ones, and a positive
                        record over a short period is mostly luck.
                    </p>
                </div>
            )}
        </main>
    );
}
