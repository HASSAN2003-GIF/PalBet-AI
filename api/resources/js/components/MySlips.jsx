import React, { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { tokens, useAccount } from '../lib/account';
import { kickoffTime, price } from '../lib/format';

const STATUS = {
    pending: { label: 'Waiting', cls: 'bg-chalk text-ink-soft border border-line-strong' },
    won: { label: 'Won', cls: 'bg-home text-white' },
    lost: { label: 'Lost', cls: 'bg-ink-soft/15 text-ink-soft' },
    void: { label: 'Void', cls: 'bg-chalk text-muted border border-line' },
};

function Badge({ status }) {
    const s = STATUS[status] ?? STATUS.pending;
    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export default function MySlips() {
    const { user, setUser, checking, setAuthOpen } = useAccount();
    const [slips, setSlips] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!user) return;
        api.getSlips()
            .then((d) => { setSlips(d.slips); setUser(d.user); })
            .catch((e) => setError(e.message));
    // Only reload when the signed-in person changes, not on every balance update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    if (checking) return <main className="mx-auto max-w-3xl px-4 py-10 text-muted sm:px-6">Checking your account…</main>;

    if (!user) {
        return (
            <main id="main" className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
                <h1 className="semi-cond text-3xl font-extrabold">My slips</h1>
                <p className="mx-auto mt-2 max-w-md text-muted">
                    Sign in to see your prediction slips. New accounts get 100 free play-money tokens.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                    <button type="button" onClick={() => setAuthOpen('register')} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-chalk hover:bg-home">Create an account</button>
                    <button type="button" onClick={() => setAuthOpen('signin')} className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold hover:border-ink">Sign in</button>
                </div>
            </main>
        );
    }

    const settled = (slips ?? []).filter((s) => s.status !== 'pending' && s.status !== 'void');
    const staked = settled.reduce((n, s) => n + s.stake, 0);
    const returned = settled.reduce((n, s) => n + (s.payout ?? 0), 0);

    return (
        <main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="semi-cond text-3xl font-extrabold tracking-tight sm:text-4xl">My slips</h1>
                    <p className="mt-1 text-sm text-muted">Settled against real final scores, usually a few hours after the match.</p>
                </div>
                <p className="text-right">
                    <span className="cond nums block text-3xl font-extrabold">{tokens(user.balance)}</span>
                    <span className="text-sm text-muted">tokens to play with</span>
                </p>
            </div>

            {settled.length > 0 && (
                <p className="mt-6 text-sm text-ink-soft">
                    Settled slips: {tokens(staked)} tokens staked, {tokens(returned)} returned
                    (<span className={returned - staked >= 0 ? 'font-semibold text-home' : 'font-semibold text-alert'}>
                        {returned - staked >= 0 ? '+' : '−'}{tokens(Math.abs(returned - staked))}
                    </span>).
                </p>
            )}

            {error && <p role="alert" className="mt-6 text-alert">{error}</p>}
            {!slips && !error && <p className="mt-8 text-muted">Loading your slips…</p>}

            {slips && slips.length === 0 && (
                <div className="mt-8 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
                    <p className="font-semibold">No slips yet.</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Open any upcoming match and tap a result's price to add it to a slip.</p>
                    <a href="#" className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-sm font-semibold text-chalk hover:bg-home">Browse matches</a>
                </div>
            )}

            {slips && slips.length > 0 && (
                <ol className="mt-8 flex flex-col gap-4">
                    {slips.map((s) => (
                        <li key={s.id} className="overflow-hidden rounded-xl border border-line bg-paper">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                                <div className="flex items-center gap-3">
                                    <Badge status={s.status} />
                                    <span className="text-sm text-muted">
                                        {new Date(s.placed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, {s.picks.length} {s.picks.length === 1 ? 'pick' : 'picks'}
                                    </span>
                                </div>
                                <span className="cond nums text-sm">
                                    {tokens(s.stake)} at {price(s.total_odds)}{' '}
                                    {s.status === 'won' && <strong className="text-home">won {tokens(s.payout)}</strong>}
                                    {s.status === 'void' && <span className="text-muted">refunded {tokens(s.payout)}</span>}
                                    {s.status === 'pending' && <span className="text-muted">pays {tokens(s.potential_payout)}</span>}
                                </span>
                            </div>
                            <ul className="divide-y divide-line">
                                {s.picks.map((p) => (
                                    <li key={p.fixture_id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-semibold">{p.label}</span>
                                            <span className="block truncate text-xs text-muted">
                                                {p.home} {p.score ? `${p.score.home}–${p.score.away}` : 'v'} {p.away}, {p.competition}, {kickoffTime(p.kickoff)}
                                            </span>
                                        </span>
                                        <span className="cond nums font-bold">{price(p.price)}</span>
                                        <Badge status={p.status} />
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ol>
            )}
        </main>
    );
}
