import React, { useCallback, useEffect, useState } from 'react';
import { getAdminStats } from './lib/api';
import { hoursSince, kickoffTime, percent, timeAgo } from './lib/format';

const KEY = 'pb_admin_key';
const readKey = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveKey = (k) => { try { k ? sessionStorage.setItem(KEY, k) : sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

function Stat({ label, value, note }) {
    return (
        <div className="border-t border-ink pt-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="cond nums mt-1 text-4xl font-extrabold leading-none">{value}</dd>
            {note && <p className="mt-1 text-xs text-muted">{note}</p>}
        </div>
    );
}

function VisitorChart({ days }) {
    const max = Math.max(1, ...days.map((d) => d.visitors));
    return (
        <figure>
            <figcaption className="mb-3 text-sm text-muted">Unique visitors, last 14 days</figcaption>
            <ol className="flex h-36 items-end gap-1.5" aria-label="Unique visitors per day">
                {days.map((d, i) => {
                    const label = new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                    const isToday = i === days.length - 1;
                    return (
                        <li key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${label}: ${d.visitors}`}>
                            <span className="sr-only">{label}: {d.visitors} {d.visitors === 1 ? 'visitor' : 'visitors'}</span>
                            <span className="cond nums mb-1 text-center text-[11px] text-muted" aria-hidden="true">{d.visitors || ''}</span>
                            <span
                                aria-hidden="true"
                                className={`block w-full rounded-t-sm ${isToday ? 'bg-home' : 'bg-ink-soft/30'}`}
                                style={{ height: `${Math.max((d.visitors / max) * 100, d.visitors ? 4 : 1)}%` }}
                            />
                        </li>
                    );
                })}
            </ol>
            <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden="true">
                <span>{new Date(`${days[0].date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                <span>Today</span>
            </div>
        </figure>
    );
}

export default function Admin({ onClose }) {
    const [key, setKey] = useState(readKey);
    const [draft, setDraft] = useState('');
    const [stats, setStats] = useState(null);
    const [status, setStatus] = useState(readKey() ? 'loading' : 'locked');
    const [error, setError] = useState(null);

    const load = useCallback((k) => {
        setStatus('loading');
        setError(null);
        getAdminStats(k)
            .then((s) => { setStats(s); setStatus('ready'); saveKey(k); })
            .catch((err) => {
                setError(err.message);
                if (err.status === 401 || err.status === 503) { saveKey(''); setKey(''); setStatus('locked'); }
                else setStatus('error');
            });
    }, []);

    useEffect(() => { if (key) load(key); }, [key, load]);

    return (
        <div className="min-h-screen">
            <header className="border-b border-line">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-2">
                        <i className="yellow-card text-xl" aria-hidden="true" />
                        <span className="wide text-lg font-extrabold tracking-tight">PalBet AI</span>
                        <span className="ml-2 text-sm text-muted">Admin</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        {status === 'ready' && (
                            <button type="button" className="text-muted hover:text-ink" onClick={() => { saveKey(''); setKey(''); setStats(null); setStatus('locked'); }}>
                                Lock
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="rounded-full border border-line-strong px-4 py-1.5 font-medium hover:border-ink">
                            Back to matches
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
                {status === 'locked' && (
                    <form
                        className="mx-auto flex max-w-sm flex-col gap-3"
                        onSubmit={(e) => { e.preventDefault(); if (draft) setKey(draft); setDraft(''); }}
                    >
                        <h1 className="semi-cond text-2xl font-extrabold">Admin sign-in</h1>
                        <label htmlFor="admin-key" className="text-sm text-muted">Admin password</label>
                        <input
                            id="admin-key"
                            type="password"
                            autoComplete="current-password"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="rounded-lg border border-line-strong bg-paper px-4 py-2.5 focus:border-home focus:outline-none"
                        />
                        {error && <p role="alert" className="text-sm text-alert">{error}</p>}
                        <button type="submit" disabled={!draft} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-chalk hover:bg-home disabled:opacity-40">
                            Sign in
                        </button>
                    </form>
                )}

                {status === 'loading' && <p className="text-muted" aria-busy="true">Loading metrics…</p>}

                {status === 'error' && (
                    <div role="alert" className="flex flex-col items-start gap-3">
                        <p>{error}</p>
                        <button type="button" onClick={() => load(key)} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-chalk">Try again</button>
                    </div>
                )}

                {status === 'ready' && stats && (
                    <div className="flex flex-col gap-12">
                        {hoursSince(stats.fixtures.last_engine_run) > 12 && (
                            <p className="rounded-lg border border-alert/40 bg-paper px-4 py-3 text-sm">
                                The risk engine last ran {timeAgo(stats.fixtures.last_engine_run) ?? 'never'}. Run <code className="rounded bg-chalk px-1">php artisan app:update-fixtures</code> to refresh prices.
                            </p>
                        )}

                        <section aria-labelledby="traffic">
                            <h2 id="traffic" className="semi-cond mb-5 text-xl font-bold">Traffic</h2>
                            <div className="grid gap-10 md:grid-cols-[14rem_1fr]">
                                <dl className="grid grid-cols-2 gap-6 md:grid-cols-1">
                                    <Stat label="Visitors today" value={stats.visitors.today} />
                                    <Stat label="Unique visitors, all time" value={stats.visitors.total} />
                                </dl>
                                <VisitorChart days={stats.visitors.last_14_days} />
                            </div>
                        </section>

                        <section aria-labelledby="engine">
                            <h2 id="engine" className="semi-cond mb-5 text-xl font-bold">Risk engine</h2>
                            <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
                                <Stat label="Upcoming matches" value={stats.fixtures.upcoming} />
                                <Stat label="Upcoming value prices" value={stats.fixtures.upcoming_value} />
                                <Stat label="Competitions" value={stats.fixtures.upcoming_competitions} />
                                <Stat label="Matches stored" value={stats.fixtures.total} note={stats.fixtures.last_engine_run ? `Last run ${timeAgo(stats.fixtures.last_engine_run)}` : 'Never run'} />
                            </dl>
                        </section>

                        <section aria-labelledby="top-value">
                            <h2 id="top-value" className="semi-cond mb-3 text-xl font-bold">Biggest upcoming edges</h2>
                            {stats.top_value.length === 0 ? (
                                <p className="text-sm text-muted">No upcoming value prices.</p>
                            ) : (
                                <ul className="divide-y divide-line border-y border-line">
                                    {stats.top_value.map((t) => (
                                        <li key={t.id} className="flex items-center gap-4 py-3">
                                            <i className="yellow-card text-base" aria-hidden="true" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-semibold">{t.match}</span>
                                                <span className="text-sm text-muted">
                                                    {t.competition}, {new Date(t.kickoff).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} at {kickoffTime(t.kickoff)}
                                                </span>
                                            </span>
                                            <span className="cond nums text-lg font-bold text-home">+{percent(t.edge)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}
