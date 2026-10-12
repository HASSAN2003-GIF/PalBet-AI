import React, { useState } from 'react';
import * as api from '../lib/api';
import { tokens, useAccount } from '../lib/account';
import { kickoffTime, price } from '../lib/format';

const QUICK_STAKES = [5, 10, 25];

/** The prediction slip being built: picks, stake, combined price, and placing it. */
export default function SlipPanel() {
    const { user, setUser, picks, setPicks, slipOpen, setSlipOpen, setAuthOpen } = useAccount();
    const [stake, setStake] = useState(10);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [placed, setPlaced] = useState(null);

    if (!picks.length && !placed) return null;

    const combined = picks.reduce((acc, p) => acc * (p.price || 1), 1);
    const stakeNum = Number.isFinite(+stake) ? Math.floor(+stake) : 0;
    const returns = stakeNum * combined;
    const short = user && stakeNum > user.balance;

    async function place() {
        if (!user) { setAuthOpen('register'); return; }
        setPending(true);
        setError(null);
        try {
            const data = await api.placeSlip(stakeNum, picks.map(({ fixture_id, outcome }) => ({ fixture_id, outcome })));
            setUser(data.user);
            setPlaced(data.slip);
            setPicks([]);
        } catch (err) {
            setError(err.message);
        } finally {
            setPending(false);
        }
    }

    if (!slipOpen) {
        return (
            <button
                type="button"
                onClick={() => setSlipOpen(true)}
                className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-2.5 pl-4 pr-5 text-sm font-semibold text-chalk shadow-[0_10px_30px_rgba(19,33,27,0.3)] hover:bg-home sm:left-auto sm:right-6 sm:translate-x-0"
            >
                <span className="cond nums grid h-6 min-w-6 place-items-center rounded-full bg-card px-1.5 text-sm font-extrabold text-card-ink">{picks.length}</span>
                Your slip
                <span className="cond nums font-bold text-chalk/70">{price(combined)}</span>
            </button>
        );
    }

    return (
        <aside
            aria-label="Prediction slip"
            className="panel-in fixed inset-x-0 bottom-0 z-30 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-line bg-paper shadow-[0_-12px_40px_rgba(19,33,27,0.2)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[23rem] sm:rounded-2xl"
        >
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="semi-cond text-lg font-bold">Your slip</h2>
                <button type="button" onClick={() => { setSlipOpen(false); setPlaced(null); }} className="text-sm text-muted hover:text-ink">
                    {placed ? 'Close' : 'Hide'}
                </button>
            </header>

            {placed ? (
                <div className="px-5 py-5">
                    <p className="font-semibold">Slip placed.</p>
                    <p className="mt-1 text-sm text-ink-soft">
                        {tokens(placed.stake)} tokens on {placed.picks.length} {placed.picks.length === 1 ? 'pick' : 'picks'} at {price(placed.total_odds)}.
                        It pays {tokens(placed.potential_payout)} tokens if every pick is right. Slips settle after the final whistle.
                    </p>
                    <a href="#slips" onClick={() => { setSlipOpen(false); setPlaced(null); }} className="mt-4 inline-block rounded-full bg-ink px-4 py-2 text-sm font-semibold text-chalk hover:bg-home">
                        See my slips
                    </a>
                </div>
            ) : (
                <>
                    <ul className="divide-y divide-line">
                        {picks.map((p) => (
                            <li key={p.fixture_id} className="flex items-start gap-3 px-5 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{p.label}</p>
                                    <p className="truncate text-xs text-muted">{p.home} v {p.away}, {kickoffTime(p.kickoff)}</p>
                                </div>
                                <span className="cond nums pt-0.5 text-base font-bold">{price(p.price)}</span>
                                <button
                                    type="button"
                                    onClick={() => setPicks((cur) => cur.filter((x) => x.fixture_id !== p.fixture_id))}
                                    aria-label={`Remove ${p.label} from the slip`}
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-chalk hover:text-ink"
                                >
                                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
                        <div className="flex items-end gap-3">
                            <label className="flex flex-1 flex-col gap-1 text-sm">
                                <span className="text-ink-soft">Stake (tokens)</span>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={100}
                                    step={1}
                                    value={stake}
                                    onChange={(e) => setStake(e.target.value)}
                                    className="cond nums w-full rounded-lg border border-line-strong bg-chalk px-3 py-2 text-lg font-bold focus:border-home focus:outline-none"
                                />
                            </label>
                            <div className="flex gap-1 pb-0.5">
                                {QUICK_STAKES.map((q) => (
                                    <button key={q} type="button" onClick={() => setStake(q)}
                                            className={`cond nums rounded-full border px-3 py-1.5 text-sm font-bold ${stakeNum === q ? 'border-ink bg-ink text-chalk' : 'border-line-strong hover:border-ink'}`}>
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <dl className="grid grid-cols-2 gap-y-1 text-sm">
                            <dt className="text-muted">Combined price</dt>
                            <dd className="cond nums text-right text-base font-bold">{price(combined)}</dd>
                            <dt className="text-muted">Pays if all picks win</dt>
                            <dd className="cond nums text-right text-base font-bold text-home">{tokens(returns)} tokens</dd>
                            {user && (<><dt className="text-muted">Your balance</dt><dd className="cond nums text-right">{tokens(user.balance)} tokens</dd></>)}
                        </dl>

                        {short && <p className="text-sm text-alert">That's more than your {tokens(user.balance)} tokens.</p>}
                        {error && <p role="alert" className="text-sm text-alert">{error}</p>}

                        <button
                            type="button"
                            onClick={place}
                            disabled={pending || stakeNum < 1 || short}
                            className="rounded-full bg-home px-5 py-3 text-sm font-semibold text-white hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {pending ? 'Placing…' : user ? `Place slip for ${stakeNum || 0} tokens` : 'Create a free account to place it'}
                        </button>
                        <p className="text-xs leading-relaxed text-muted">
                            Tokens are play money. Prices are checked again when you place the slip.
                        </p>
                    </div>
                </>
            )}
        </aside>
    );
}
