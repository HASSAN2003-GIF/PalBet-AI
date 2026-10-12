import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from './api';

const AccountContext = createContext(null);
const PICKS_KEY = 'pb_slip_picks';
const MAX_PICKS = 10;

function readPicks() {
    try {
        const raw = JSON.parse(localStorage.getItem(PICKS_KEY) || '[]');
        // Drop picks for matches that have kicked off since they were added.
        return Array.isArray(raw) ? raw.filter((p) => new Date(p.kickoff) > new Date()) : [];
    } catch { return []; }
}

/**
 * Who is signed in, their token balance, and the slip being built. Picks live in this browser
 * only (a convenience); the server re-checks every pick and price when the slip is placed.
 */
export function AccountProvider({ children }) {
    const [user, setUser] = useState(null);
    const [checking, setChecking] = useState(() => Boolean(api.getToken()));
    const [authOpen, setAuthOpen] = useState(null); // null | 'signin' | 'register'
    const [picks, setPicks] = useState(readPicks);
    const [slipOpen, setSlipOpen] = useState(false);

    useEffect(() => {
        if (!api.getToken()) return;
        api.getMe()
            .then((d) => setUser(d.user))
            .catch((e) => { if (e.status === 401) api.setToken(null); })
            .finally(() => setChecking(false));
    }, []);

    useEffect(() => { try { localStorage.setItem(PICKS_KEY, JSON.stringify(picks)); } catch { /* ignore */ } }, [picks]);

    const finishAuth = useCallback((data) => {
        api.setToken(data.token);
        setUser(data.user);
        setAuthOpen(null);
    }, []);

    const signOut = useCallback(async () => {
        try { await api.logout(); } catch { /* token may already be gone */ }
        api.setToken(null);
        setUser(null);
    }, []);

    const togglePick = useCallback((match, outcome) => {
        setPicks((cur) => {
            const same = cur.find((p) => p.fixture_id === match.id);
            const rest = cur.filter((p) => p.fixture_id !== match.id);
            if (same?.outcome === outcome) return rest; // tapping the same pick removes it
            if (!same && cur.length >= MAX_PICKS) return cur;
            const label = outcome === 'home' ? match.home.name : outcome === 'away' ? match.away.name : 'Draw';
            return [...rest, {
                fixture_id: match.id, outcome, price: match.odds[outcome], label,
                home: match.home.name, away: match.away.name, kickoff: match.kickoff,
            }];
        });
        setSlipOpen(true);
    }, []);

    const value = useMemo(() => ({
        user, setUser, checking, authOpen, setAuthOpen, finishAuth, signOut,
        picks, setPicks, togglePick, slipOpen, setSlipOpen, maxPicks: MAX_PICKS,
        pickFor: (fixtureId) => picks.find((p) => p.fixture_id === fixtureId)?.outcome ?? null,
    }), [user, checking, authOpen, finishAuth, signOut, picks, togglePick, slipOpen]);

    return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);

export const tokens = (n) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
