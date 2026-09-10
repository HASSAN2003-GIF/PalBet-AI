import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import LiveCompetitions from './LiveCompetitions';

const API_JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: { ...API_JSON_HEADERS, ...(options.headers || {}) }
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload;
};

const formatOdds = (val) => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '-';
};

/* ============================================================================
   AI ANALYST MODAL
   ============================================================================ */
const AIChatModal = ({ match, onClose }) => {
    const [messages, setMessages] = useState([
        {
            role: 'ai',
            text: `Hi! I am your PalBet AI Analyst for **${match.home} vs ${match.away}**.\n\nAsk me about tactical setups, key injuries, scoring form, or model edge values.`
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const sendMessage = async (e) => {
        e.preventDefault();
        const msg = input.trim();
        if (!msg || isTyping) return;

        setMessages(prev => [...prev, { role: 'user', text: msg }]);
        setInput('');
        setIsTyping(true);

        try {
            const data = await requestJson('/api/platform/chat', {
                method: 'POST',
                body: JSON.stringify({
                    match: `${match.home} vs ${match.away}`,
                    message: msg,
                    history: messages
                })
            });
            setMessages(prev => [...prev, { role: 'ai', text: data.response || 'Analysis complete.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'ai', text: 'Analyst service unavailable. Please retry.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="flex h-[640px] max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#202936] bg-[#10151D] shadow-2xl">
                <div className="flex h-16 items-center justify-between border-b border-[#202936] bg-[#0B0F15] px-6">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-[#2FD3C6] text-[#071013] flex items-center justify-center font-black text-xs">AI</div>
                        <div>
                            <span className="block text-sm font-bold text-white">PalBet AI Analyst</span>
                            <span className="text-xs text-[#707A8D]">{match.home} vs {match.away}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 text-[#707A8D] hover:bg-[#151B24] hover:text-white">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto bg-[#080B10] p-6 space-y-4">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-[#2FD3C6] font-medium text-[#071013]' : 'border border-[#202936] bg-[#151B24] text-[#DDE3EC]'}`}>
                                {m.text}
                            </div>
                        </div>
                    ))}
                    {isTyping && <div className="text-xs text-[#2FD3C6] animate-pulse">Running live match analysis…</div>}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="p-4 border-t border-[#202936] bg-[#0B0F15] flex gap-2">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about lineups, injuries, edge..." className="flex-1 rounded-xl bg-[#151B24] border border-[#202936] px-4 py-3 text-sm text-white outline-none focus:border-[#2FD3C6]" />
                    <button type="submit" disabled={isTyping} className="rounded-xl bg-[#2FD3C6] px-5 py-3 font-bold text-xs text-[#071013] hover:bg-[#25B9AE]">Send</button>
                </form>
            </div>
        </div>
    );
};

/* ============================================================================
   AUTH MODAL
   ============================================================================ */
const AuthModal = ({ isOpen, onClose, onLogin }) => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isReg, setIsReg] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const data = await requestJson('/api/platform/auth', {
                method: 'POST',
                body: JSON.stringify({ phone, password, role: 'player' })
            });
            onLogin(data);
            onClose();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-[#202936] bg-[#10151D] p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-white">{isReg ? 'Create Account' : 'Player Sign In'}</h2>
                    <button onClick={onClose} className="text-[#707A8D] hover:text-white">✕</button>
                </div>
                {error && <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg">{error}</div>}
                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="text-[11px] font-bold uppercase text-[#707A8D]">Phone</label>
                        <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+255..." className="mt-1 w-full rounded-xl bg-[#080B10] border border-[#202936] p-3 text-sm text-white outline-none focus:border-[#2FD3C6]" />
                    </div>
                    <div>
                        <label className="text-[11px] font-bold uppercase text-[#707A8D]">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 w-full rounded-xl bg-[#080B10] border border-[#202936] p-3 text-sm text-white outline-none focus:border-[#2FD3C6]" />
                    </div>
                    <button type="submit" className="w-full rounded-xl bg-[#2FD3C6] py-3 text-sm font-bold text-[#071013] hover:bg-[#25B9AE]">{isReg ? 'Register' : 'Sign In'}</button>
                    <div className="text-center pt-2">
                        <button type="button" onClick={() => setIsReg(!isReg)} className="text-xs text-[#707A8D] hover:text-white underline">
                            {isReg ? 'Already have an account? Sign in' : "Don't have an account? Register"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ============================================================================
   MAIN APPLICATION
   ============================================================================ */
function App() {
    const [schedule, setSchedule] = useState([]);
    const [activeLeague, setActiveLeague] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [activeChatMatch, setActiveChatMatch] = useState(null);
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [betSlip, setBetSlip] = useState([]);
    const [stake, setStake] = useState(10);
    const [searchQuery, setSearchQuery] = useState('');

    const calendarDates = useMemo(() => {
        const dates = [];
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const next = new Date(today);
            next.setDate(today.getDate() + i);
            const offset = next.getTimezoneOffset() * 60000;
            dates.push(new Date(next.getTime() - offset).toISOString().split('T')[0]);
        }
        return dates;
    }, []);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/schedule?date=${selectedDate}`)
            .then(res => res.json())
            .then(data => {
                const safeData = Array.isArray(data) ? data : [];
                setSchedule(safeData);

                if (safeData.length > 0 && safeData[0].leagues) {
                    const firstL = Object.values(safeData[0].leagues)[0];
                    setActiveLeague(firstL);
                } else {
                    setActiveLeague(null);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [selectedDate]);

    const handleToggleBet = (match, type, odds) => {
        const numOdds = Number(odds);
        if (!numOdds || numOdds <= 1.0) return;
        const key = `${match.id}-${type}`;
        setBetSlip(prev => {
            if (prev.find(b => b.key === key)) return prev.filter(b => b.key !== key);
            return [...prev, { key, matchId: match.id, home: match.home, away: match.away, type, odds: numOdds }];
        });
    };

    const totalOdds = betSlip.reduce((acc, b) => acc * b.odds, 1);
    const potentialPayout = (stake * totalOdds).toFixed(2);

    const matchesList = useMemo(() => {
        if (!activeLeague?.matches) return [];
        let list = activeLeague.matches;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(m => m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q));
        }
        return list;
    }, [activeLeague, searchQuery]);

    return (
        <div className="flex h-screen bg-[#080B10] font-sans text-slate-100 overflow-hidden">
            {activeChatMatch && <AIChatModal match={activeChatMatch} onClose={() => setActiveChatMatch(null)} />}
            <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLogin={setCurrentUser} />

            {/* SIDEBAR: SOFASCORE ACCORDION */}
            <aside className="w-72 bg-[#0B0F15] border-r border-[#202936] flex flex-col shrink-0">
                <div className="h-16 flex items-center justify-between px-6 border-b border-[#202936]">
                    <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2FD3C6]"></span>
                        PalBet <span className="text-[#2FD3C6]">AI</span>
                    </span>
                    <span className="bg-[#2FD3C6]/10 text-[#2FD3C6] font-bold text-[10px] px-2 py-0.5 rounded-full">LIVE</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <LiveCompetitions schedule={schedule} activeLeagueId={activeLeague?.id} onLeagueSelect={(league) => setActiveLeague(league)} />
                </div>
            </aside>

            {/* MAIN WORKSPACE */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* HEADER */}
                <header className="h-16 bg-[#080B10] border-b border-[#202936] flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <h1 className="text-base font-bold text-white uppercase tracking-wider">{activeLeague?.name || 'Match Center'}</h1>
                        <span className="text-xs text-[#707A8D]">{matchesList.length} matches</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search matches..." className="w-64 rounded-xl bg-[#10151D] border border-[#202936] px-4 py-2 text-xs text-white outline-none focus:border-[#2FD3C6]" />
                        {currentUser ? (
                            <div className="text-xs font-bold text-[#2FD3C6] bg-[#2FD3C6]/10 px-3 py-1.5 rounded-lg border border-[#2FD3C6]/20">
                                {currentUser.phone}
                            </div>
                        ) : (
                            <button onClick={() => setIsAuthOpen(true)} className="rounded-xl bg-[#2FD3C6] px-4 py-2 text-xs font-bold text-[#071013] hover:bg-[#25B9AE]">Sign In</button>
                        )}
                    </div>
                </header>

                {/* CALENDAR STRIP */}
                <div className="bg-[#0B0F15] border-b border-[#202936] px-8 py-2.5 flex gap-2 overflow-x-auto shrink-0">
                    {calendarDates.map(d => (
                        <button key={d} onClick={() => setSelectedDate(d)} className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${selectedDate === d ? 'bg-[#2FD3C6]/15 text-[#2FD3C6] border border-[#2FD3C6]/30' : 'text-[#707A8D] hover:bg-[#151B24]'}`}>
                            {d === new Date().toISOString().split('T')[0] ? 'Today' : d}
                        </button>
                    ))}
                </div>

                {/* MATCH ROWS */}
                <main className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex justify-center items-center h-64 text-xs text-[#707A8D]">Loading live match board…</div>
                    ) : matchesList.length === 0 ? (
                        <div className="flex justify-center items-center h-64 text-xs text-[#707A8D]">No fixtures available. Select another competition.</div>
                    ) : (
                        <div className="max-w-6xl mx-auto space-y-3">
                            {matchesList.map(m => (
                                <div key={m.id} className="bg-[#10151D] border border-[#202936] rounded-2xl p-4 flex items-center justify-between hover:border-[#2FD3C6]/30 transition">
                                    {/* TIME & STATUS */}
                                    <div className="w-20 shrink-0 text-center border-r border-[#202936] pr-4">
                                        <div className="text-xs font-bold text-white">{m.time}</div>
                                        <div className="text-[10px] text-[#707A8D] uppercase mt-0.5">{m.status}</div>
                                    </div>

                                    {/* TEAMS & CRESTS */}
                                    <div className="flex-1 px-6 min-w-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3 truncate">
                                                {m.home_logo ? <img src={m.home_logo} className="w-5 h-5 object-contain" alt="" /> : <div className="w-5 h-5 rounded-full bg-slate-700" />}
                                                <span className="text-xs font-bold text-white truncate">{m.home}</span>
                                            </div>
                                            <span className="text-xs font-black text-white">{m.home_score ?? '-'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 truncate">
                                                {m.away_logo ? <img src={m.away_logo} className="w-5 h-5 object-contain" alt="" /> : <div className="w-5 h-5 rounded-full bg-slate-700" />}
                                                <span className="text-xs font-bold text-white truncate">{m.away}</span>
                                            </div>
                                            <span className="text-xs font-black text-white">{m.away_score ?? '-'}</span>
                                        </div>
                                    </div>

                                    {/* ODDS BOXES */}
                                    <div className="flex items-center gap-2 px-4 border-l border-r border-[#202936]">
                                        <button onClick={() => handleToggleBet(m, '1', m.odds_home)} className={`w-14 py-2 rounded-xl border text-center transition ${betSlip.find(b => b.key === `${m.id}-1`) ? 'bg-[#2FD3C6] text-[#071013] border-[#2FD3C6]' : 'bg-[#080B10] border-[#202936] text-[#2FD3C6] hover:border-[#2FD3C6]/50'}`}>
                                            <div className="text-[9px] text-[#707A8D]">1</div>
                                            <div className="text-xs font-black">{formatOdds(m.odds_home)}</div>
                                        </button>
                                        {m.odds_draw && (
                                            <button onClick={() => handleToggleBet(m, 'X', m.odds_draw)} className={`w-14 py-2 rounded-xl border text-center transition ${betSlip.find(b => b.key === `${m.id}-X`) ? 'bg-[#2FD3C6] text-[#071013] border-[#2FD3C6]' : 'bg-[#080B10] border-[#202936] text-[#F4B740] hover:border-[#F4B740]/50'}`}>
                                                <div className="text-[9px] text-[#707A8D]">X</div>
                                                <div className="text-xs font-black">{formatOdds(m.odds_draw)}</div>
                                            </button>
                                        )}
                                        <button onClick={() => handleToggleBet(m, '2', m.odds_away)} className={`w-14 py-2 rounded-xl border text-center transition ${betSlip.find(b => b.key === `${m.id}-2`) ? 'bg-[#2FD3C6] text-[#071013] border-[#2FD3C6]' : 'bg-[#080B10] border-[#202936] text-[#3B82F6] hover:border-[#3B82F6]/50'}`}>
                                            <div className="text-[9px] text-[#707A8D]">2</div>
                                            <div className="text-xs font-black">{formatOdds(m.odds_away)}</div>
                                        </button>
                                    </div>

                                    {/* PAL MODEL PREDICTION & AI BUTTON */}
                                    <div className="w-36 shrink-0 pl-4 flex flex-col items-center gap-2">
                                        <div className="bg-[#2FD3C6]/10 text-[#2FD3C6] text-[10px] font-black px-3 py-1 rounded-full">
                                            Pred: {m.pred_score}
                                        </div>
                                        <button onClick={() => setActiveChatMatch(m)} className="text-[10px] font-bold text-[#707A8D] hover:text-white underline">
                                            Open AI Analysis ↗
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {/* PREDICTION SLIP */}
            {betSlip.length > 0 && (
                <aside className="w-72 bg-[#0B0F15] border-l border-[#202936] flex flex-col shrink-0 p-4">
                    <div className="flex justify-between items-center pb-4 border-b border-[#202936]">
                        <span className="font-bold text-sm text-white">Slip ({betSlip.length})</span>
                        <button onClick={() => setBetSlip([])} className="text-xs text-[#707A8D] hover:text-white">Clear</button>
                    </div>
                    <div className="flex-1 overflow-y-auto py-4 space-y-2">
                        {betSlip.map(b => (
                            <div key={b.key} className="bg-[#10151D] p-3 rounded-xl border border-[#202936] flex justify-between items-center text-xs">
                                <div>
                                    <div className="font-bold text-white truncate max-w-[150px]">{b.home}</div>
                                    <div className="text-[#2FD3C6] font-bold">Pick: {b.type}</div>
                                </div>
                                <span className="font-black text-white">{b.odds.toFixed(2)}x</span>
                            </div>
                        ))}
                    </div>
                    <div className="pt-4 border-t border-[#202936] space-y-3">
                        <div className="flex justify-between text-xs font-bold text-[#707A8D]">
                            <span>Total Odds</span>
                            <span className="text-white">{totalOdds.toFixed(2)}x</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-[#707A8D]">
                            <span>Potential Payout</span>
                            <span className="text-[#2FD3C6]">${potentialPayout}</span>
                        </div>
                        <input type="number" min="1" value={stake} onChange={e => setStake(Number(e.target.value))} className="w-full rounded-xl bg-[#10151D] border border-[#202936] p-2.5 text-xs text-white outline-none" placeholder="Stake ($)" />
                        <button className="w-full rounded-xl bg-[#2FD3C6] py-3 text-xs font-bold text-[#071013] hover:bg-[#25B9AE]">Place Bet</button>
                    </div>
                </aside>
            )}
        </div>
    );
}

const container = document.getElementById('app');
if (container && !container._reactRoot) {
    container._reactRoot = createRoot(container);
    container._reactRoot.render(<React.StrictMode><App /></React.StrictMode>);
}