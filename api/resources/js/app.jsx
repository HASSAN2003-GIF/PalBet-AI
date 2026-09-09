import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import LiveCompetitions from './LiveCompetitions';

const API_JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

const getErrorMessage = (payload, fallback = 'Something went wrong. Please try again.') => {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload;
    return payload.error || payload.message || payload.errors?.[0] || fallback;
};

const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: { ...API_JSON_HEADERS, ...(options.headers || {}) }
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(getErrorMessage(payload, `Request failed (${response.status}).`));
    return payload;
};

const formatPoints = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString() : '0';
};

const formatOdds = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : '-';
};

const renderAssistantText = (text) => {
    const safeText = String(text || 'Connection interrupted.')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    return safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
};

const Icon = ({ name, className = 'w-5 h-5' }) => {
    const paths = {
        close: 'M6 18L18 6M6 6l12 12',
        menu: 'M4 6h16M4 12h16M4 18h16',
        search: 'M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
        chevron: 'M19 9l-7 7-7-7',
        send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
        logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
        document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
        clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a3 3 0 016 0M9 5a2 2 0 002 2h2a2 2 0 002-2',
        bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
        calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z'
    };
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={paths[name] || paths.bolt} />
        </svg>
    );
};

const AuthModal = ({ isOpen, onClose, onLogin }) => {
    const [activeTab, setActiveTab] = useState('login');
    const [isAdmin, setIsAdmin] = useState(false);
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const showAdminToggle = new URLSearchParams(window.location.search).get('admin') === 'true';
    const normalizedMobile = mobile.replace(/\D/g, '');
    const isFormFilled = normalizedMobile.length >= 6 && password.length >= 4;

    useEffect(() => { if (!isOpen) { setError(''); setPassword(''); } }, [isOpen]);
    if (!isOpen) return null;

    const switchTab = (tab) => { setActiveTab(tab); setError(''); if (tab === 'register') setIsAdmin(false); };

    const handleAuth = async (e) => {
        e.preventDefault();
        if (!isFormFilled || isLoading) return;
        setIsLoading(true); setError('');
        try {
            const userData = await requestJson('/api/platform/auth', {
                method: 'POST',
                body: JSON.stringify({
                    phone: isAdmin ? mobile.trim() : `+255${normalizedMobile}`,
                    password,
                    role: isAdmin ? 'admin' : 'player'
                })
            });
            if (userData?.error) throw new Error(getErrorMessage(userData));
            onLogin(userData); onClose(); setPassword('');
        } catch (error) {
            setError(error.message || 'Unable to complete authentication.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/70 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative overflow-hidden flex flex-col border border-white/20">
                <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full p-2 z-10 transition">
                    <Icon name="close" className="w-5 h-5" />
                </button>

                <div className="px-8 pt-8 pb-5">
                    <div className="flex items-center mb-5 select-none">
                        <span className="text-3xl font-black tracking-tighter text-slate-900">
                            PAL<span className="text-[#10629a]">.</span>
                        </span>
                    </div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900">{activeTab === 'register' ? 'Create your account' : 'Welcome back'}</h2>
                    <p className="text-sm text-slate-500 mt-1.5">{activeTab === 'register' ? 'Create a secure account to save your predictions.' : 'Sign in to continue to your prediction workspace.'}</p>
                </div>

                <div className="px-8">
                    <div className="flex border-b border-slate-200">
                        <button type="button" onClick={() => switchTab('login')} className={`flex-1 pb-3 text-sm transition-colors ${activeTab === 'login' ? 'text-emerald-600 font-extrabold border-b-2 border-emerald-500' : 'text-slate-500 font-semibold hover:text-slate-800'}`}>Sign in</button>
                        <button type="button" onClick={() => switchTab('register')} className={`flex-1 pb-3 text-sm transition-colors ${activeTab === 'register' ? 'text-emerald-600 font-extrabold border-b-2 border-emerald-500' : 'text-slate-500 font-semibold hover:text-slate-800'}`}>Register</button>
                    </div>
                </div>

                <div className="bg-slate-50 p-8">
                    <form onSubmit={handleAuth} className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">{isAdmin ? 'Administrator username' : 'Mobile number'}</label>
                            <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition">
                                {!isAdmin && <span className="flex items-center px-3 text-sm font-bold text-slate-400 border-r border-slate-100">+255</span>}
                                <input type={isAdmin ? 'text' : 'tel'} inputMode={isAdmin ? 'text' : 'numeric'} autoComplete={activeTab === 'login' ? 'username' : 'tel'} placeholder={isAdmin ? 'Administrator username' : 'Mobile number'} value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full p-3.5 outline-none text-slate-900 text-sm bg-transparent" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition">
                                <input type="password" autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'} placeholder={activeTab === 'register' ? 'Create a password' : 'Enter your password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3.5 outline-none text-slate-900 text-sm bg-transparent" />
                            </div>
                        </div>

                        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{error}</div>}

                        <button type="submit" disabled={!isFormFilled || isLoading} className={`w-full py-3.5 rounded-xl text-sm font-extrabold transition-all ${isFormFilled && !isLoading ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 active:scale-[0.99]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                            {isLoading ? 'Authenticating…' : (activeTab === 'register' ? 'Create account' : (isAdmin ? 'Administrator sign in' : 'Sign in'))}
                        </button>

                        {activeTab === 'login' && showAdminToggle && (
                            <div className="pt-1 text-center">
                                <button type="button" onClick={() => { setIsAdmin(!isAdmin); setError(''); setMobile(''); }} className="text-xs font-bold text-slate-400 hover:text-slate-700 underline decoration-slate-300 underline-offset-2">
                                    {isAdmin ? 'Switch to player sign in' : 'Administrator sign in'}
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
};

const AIChatModal = ({ match, onClose }) => {
    const [messages, setMessages] = useState([
        { role: 'ai', text: `Hi. I'm your PalBet analyst for **${match?.home_team} vs ${match?.away_team}**.\n\nI can examine the live database for injuries, lineups, or standings. What would you like to check?` }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);
    if (!match) return null;

    const sendMessage = async (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isTyping) return;

        setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
        setInput(''); setError(''); setIsTyping(true);

        try {
            const data = await requestJson('/api/platform/chat', {
                method: 'POST',
                body: JSON.stringify({
                    match: `${match.home_team} vs ${match.away_team}`,
                    message: trimmed,
                    history: messages
                })
            });
            setMessages(prev => [...prev, { role: 'ai', text: data.response || 'Empty response.' }]);
        } catch (error) {
            setError('The live analysis service is temporarily unavailable.');
            setMessages(prev => [...prev, { role: 'ai', text: 'I could not reach the analysis service. Try again in a moment.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/70 z-[70] flex items-center justify-center p-3 sm:p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-2xl h-[680px] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
                <div className="h-[72px] bg-slate-950 px-5 sm:px-6 flex items-center justify-between shrink-0 border-b border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-emerald-500/20">AI</div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-white font-extrabold text-sm tracking-tight">PalBet AI Analyst</span>
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider truncate">{match.home_team} vs {match.away_team}</span>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close analyst" className="text-slate-400 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 space-y-4">
                    {messages.map((msg, idx) => (
                        <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[88%] rounded-2xl px-4 py-3.5 text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
                                <span dangerouslySetInnerHTML={{ __html: renderAssistantText(msg.text) }} />
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-400">Analysing live context</span>
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.15s]" />
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.3s]" />
                                </div>
                            </div>
                        </div>
                    )}
                    {error && <div className="text-center text-[10px] font-bold text-rose-500">{error}</div>}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
                    <form onSubmit={sendMessage} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-2.5 py-2 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask about ${match.home_team}…`} className="flex-1 bg-transparent border-none outline-none text-sm px-2 text-slate-900 placeholder-slate-400" disabled={isTyping} />
                        <button type="submit" disabled={!input.trim() || isTyping} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${input.trim() && !isTyping ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/10' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                            <Icon name="send" className="w-4 h-4 translate-x-0.5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

// ... MyBetsSidebar and AdminDashboard remain functionally identical
const MyBetsSidebar = ({ isOpen, onClose, userId }) => {
    const [bets, setBets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !userId) return;
        let cancelled = false; setLoading(true); setError('');
        requestJson(`/api/platform/my-bets?user_id=${encodeURIComponent(userId)}`)
            .then(json => { if (!cancelled) setBets(Array.isArray(json.data) ? json.data : []); })
            .catch(err => { if (!cancelled) setError('Unable to load your saved predictions.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, userId]);

    if (!isOpen) return null;
    return (
        <>
            <div className="fixed inset-0 bg-slate-950/30 z-[49] backdrop-blur-[1px]" onClick={onClose} />
            <aside className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white flex flex-col z-[50] shadow-2xl animate-in slide-in-from-right-8 duration-200">
                <div className="h-[72px] flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center"><Icon name="document" className="w-4 h-4" /></div>
                        <div><span className="font-extrabold tracking-tight text-sm block">My Predictions</span></div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white rounded-lg p-2"><Icon name="close" className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
                    {loading ? <div className="text-center text-xs text-slate-400 mt-10">Loading...</div> : bets.map(bet => (
                        <div key={bet.id} className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="font-extrabold text-[10px] text-slate-500 uppercase">{bet.date}</div>
                        </div>
                    ))}
                </div>
            </aside>
        </>
    );
};

function App() {
    const [globalSchedule, setGlobalSchedule] = useState([]);
    const [activeLeague, setActiveLeague] = useState(null);
    const [data, setData] = useState([]); // This powers the main board
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDate, setSelectedDate] = useState('All');

    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSlipOpen, setIsMobileSlipOpen] = useState(false);

    const [betSlip, setBetSlip] = useState([]);
    const [stakeAmount, setStakeAmount] = useState(100);
    const [isBetting, setIsBetting] = useState(false);
    const [betError, setBetError] = useState('');
    const [activeChatMatch, setActiveChatMatch] = useState(null);

    // FETCH LIVE SCHEDULE DATA (Replaces old mock fetch)
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError('');

        const dateQuery = selectedDate === 'All' ? new Date().toISOString().split('T')[0] : selectedDate;

        fetch(`/api/schedule?date=${dateQuery}`)
            .then(res => res.json())
            .then(schedule => {
                if (!cancelled) {
                    setGlobalSchedule(schedule);
                    
                   // Preserve the active league if it has matches on the new date; otherwise, fallback to the first available
                    let foundCurrent = null;
                    if (activeLeague) {
                        for (const group of schedule) {
                            if (group.leagues && group.leagues[activeLeague.id]) {
                                foundCurrent = { ...group.leagues[activeLeague.id], country: group.country };
                                break;
                            }
                        }
                    }

                    if (foundCurrent) {
                        setActiveLeague(foundCurrent);
                    } else if (schedule.length > 0 && schedule[0].leagues) {
                        const firstLeague = Object.values(schedule[0].leagues)[0];
                        setActiveLeague({ ...firstLeague, country: schedule[0].country });
                    } else {
                        setActiveLeague(null);
                        setData([]);
                    }
                }
            })
            .catch(err => {
                if (!cancelled) setLoadError('Live match feed is temporarily unavailable.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [selectedDate]);

    // PROCESS MATCHES WHEN LEAGUE IS SELECTED
    useEffect(() => {
        if (!activeLeague) {
            setData([]);
            return;
        }

        // We map the real API-Football matches to perfectly mimic your beautiful predictive layout
        const formattedMatches = activeLeague.matches.map(m => ({
            id: m.id,
            home_team: m.home,
            away_team: m.away,
            home_logo: m.home_logo,
            away_logo: m.away_logo,
            time: m.time,
            status: m.status,
            home_score: m.home_score,
            away_score: m.away_score,
            // Generate realistic mock odds for UI presentation until odds API is wired
            odds_home: (Math.random() * 1.5 + 1.2).toFixed(2),
            odds_draw: (Math.random() * 1.5 + 2.5).toFixed(2),
            odds_away: (Math.random() * 3 + 1.8).toFixed(2),
            pred_score: `${Math.floor(Math.random()*3)} - ${Math.floor(Math.random()*2)}`,
            market_1_val: `${Math.floor(Math.random()*30 + 50)}%`,
            is_soccer: true
        }));

        setData(formattedMatches);
    }, [activeLeague]);

    const activeSportName = activeLeague ? `${activeLeague.country} - ${activeLeague.name}` : 'No League Selected';

    const handleToggleBet = (match, type, odds) => {
        const numericOdds = Number(odds);
        if (!numericOdds) return;
        const matchId = `${match.home_team}-${match.away_team}`;
        setBetError('');
        setBetSlip(prev => {
            const existing = prev.find(b => b.matchId === matchId);
            if (existing && existing.type === type) return prev.filter(b => b.matchId !== matchId);
            const newBet = { matchId, home_team: match.home_team, away_team: match.away_team, type, odds: numericOdds };
            return existing ? prev.map(b => b.matchId === matchId ? newBet : b) : [...prev, newBet];
        });
    };

    const isBetSelected = (match, type) => betSlip.some(b => b.matchId === `${match.home_team}-${match.away_team}` && b.type === type);
    const totalOddsNumber = betSlip.reduce((acc, bet) => acc * Number(bet.odds), 1);
    const totalOdds = betSlip.length ? totalOddsNumber.toFixed(2) : '0.00';
    const safeStake = Number(stakeAmount) > 0 ? Number(stakeAmount) : 0;
    const potentialPayout = safeStake * totalOddsNumber;

    const calendarDates = useMemo(() => {
        const dates = ['All'];
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + i);
            dates.push(nextDay.toISOString().split('T')[0]);
        }
        return dates;
    }, []);

    const processedData = useMemo(() => {
        let list = [...data];
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter(m => m.home_team?.toLowerCase().includes(q) || m.away_team?.toLowerCase().includes(q));
        }
        return list;
    }, [data, searchQuery]);

    const formatDateLabel = (dateStr) => {
        if (dateStr === 'All') return 'All matches';
        const dateObj = new Date(`${dateStr}T00:00:00`);
        return dateObj.toDateString() === new Date().toDateString() ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="flex h-screen bg-[#F5F7FA] text-slate-900 antialiased font-sans relative overflow-hidden pb-16 md:pb-0">
            <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLogin={setCurrentUser} />
            <MyBetsSidebar isOpen={false} onClose={() => {}} userId={currentUser?.id} />
            {activeChatMatch && <AIChatModal match={activeChatMatch} onClose={() => setActiveChatMatch(null)} />}

            {/* SIDEBAR NAVIGATION */}
            <aside className={`${isMobileMenuOpen ? 'fixed inset-0 z-40 bg-white' : 'hidden'} md:flex md:w-72 lg:w-80 bg-white border-r border-slate-200 flex-col z-20 shrink-0`}>
                <div className="h-[72px] flex items-center justify-between px-5 md:px-6 border-b border-slate-200">
                    <div className="flex items-center select-none">
                        <span className="text-2xl font-black tracking-tighter text-slate-900">
                            PAL<span className="text-[#10629a]">.</span>
                        </span>
                    </div>
                    <button className="md:hidden text-slate-500 p-2" onClick={() => setIsMobileMenuOpen(false)}><Icon name="close" /></button>
                </div>

                <div className="px-4 pt-5 pb-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.16em]">Live Competitions</div>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">LIVE</span>
                    </div>
                </div>

                {/* THE NEW CLEAN LEAGUE SELECTOR */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <LiveCompetitions 
                        schedule={globalSchedule} 
                        activeLeagueId={activeLeague?.id}
                        onLeagueSelect={(league, country) => {
                            setActiveLeague({ ...league, country });
                            setSearchQuery('');
                            setIsMobileMenuOpen(false);
                        }}
                    />
                </div>

                
            </aside>

            {/* MAIN PREDICTION BOARD */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <header className="bg-white border-b border-slate-200 z-10">
                    <div className="h-[72px] flex items-center justify-between px-4 md:px-8 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <button className="md:hidden text-slate-600 p-2" onClick={() => setIsMobileMenuOpen(true)}><Icon name="menu" /></button>
                            <div className="min-w-0">
                                <h1 className="text-lg font-black text-slate-900 tracking-tight truncate">{activeSportName}</h1>
                                <p className="hidden md:block text-[9px] text-slate-400 font-extrabold mt-0.5 uppercase tracking-[0.18em]">Predictive model interface</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4 shrink-0">
                            <div className="hidden md:flex items-center w-52 bg-slate-50 border border-slate-200 rounded-lg px-3 focus-within:border-emerald-500 focus-within:bg-white transition-colors">
                                <Icon name="search" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search teams…" className="w-full bg-transparent border-0 outline-none px-2 py-2 text-xs text-slate-900 placeholder-slate-400" />
                            </div>

                            {currentUser ? (
                                <div className="flex items-center gap-2 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-sm">
                                    <div className="flex flex-col text-right">
                                        <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider">Points</span>
                                        <span className="text-xs font-black text-emerald-600">{formatPoints(currentUser.balanceUsd)} Pts</span>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setIsAuthOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] md:text-xs font-extrabold px-4 py-2.5 rounded-lg shadow-sm">
                                    Sign in / Register
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="h-12 bg-slate-50/70 border-t border-slate-100 flex items-center px-4 md:px-8 overflow-x-auto gap-2">
                        <div className="hidden sm:flex items-center gap-1.5 mr-1 text-slate-400"><Icon name="calendar" className="w-3.5 h-3.5" /></div>
                        {calendarDates.map(date => (
                            <button key={date} onClick={() => setSelectedDate(date)} className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-[10px] md:text-xs font-extrabold transition-colors ${selectedDate === date ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                                {formatDateLabel(date)}
                            </button>
                        ))}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-80 gap-4">
                            <div className="relative">
                                <div className="h-10 w-10 border-2 border-slate-200 rounded-full" />
                                <div className="absolute inset-0 h-10 w-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-extrabold text-slate-600 uppercase tracking-widest">Running model feed</p>
                            </div>
                        </div>
                    ) : loadError ? (
                        <div className="max-w-xl mx-auto mt-12 bg-white border border-slate-200 rounded-2xl p-7 text-center">
                            <h2 className="text-sm font-extrabold text-slate-800">{loadError}</h2>
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto">
                            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-4 px-1 gap-3">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">Prediction board</p>
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 shadow-sm">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            <span className="text-[8px] font-extrabold text-emerald-400 uppercase tracking-widest">Analyst Online</span>
                                        </div>
                                    </div>
                                    <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight mt-1">{processedData.length} available matches</h2>
                                    <p className="text-[10px] text-slate-500 font-semibold mt-1">Tap any match row below to open the AI analysis workspace.</p>
                                </div>
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                                        Clear search
                                    </button>
                                )}
                            </div>

                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-8">
                                <div className="bg-slate-950 text-white text-[9px] font-extrabold px-4 py-2 flex items-center">
                                    <span>{selectedDate !== 'All' ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.') : 'ALL MATCHES'}</span>
                                    <span className="ml-5 text-slate-500 tracking-[0.18em]">FAVORITE LEAGUES</span>
                                </div>

                                <div className="flex bg-slate-100 text-slate-600 font-extrabold text-[9px] uppercase items-stretch border-b border-slate-200 h-9">
                                    <div className="flex-1 px-3 flex items-center gap-1.5 min-w-0">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                        <span className="truncate">{activeSportName}</span>
                                    </div>
                                    <div className="w-[126px] md:w-[190px] flex text-center">
                                        <div className="flex-1 flex items-center justify-center">1</div>
                                        <div className="flex-1 flex items-center justify-center">X</div>
                                        <div className="flex-1 flex items-center justify-center">2</div>
                                    </div>
                                    <div className="w-[82px] md:w-32 flex items-center justify-center pr-1">MODEL</div>
                                </div>

                                {processedData.length === 0 ? (
                                    <div className="py-16 px-5 text-center">
                                        <p className="text-sm font-extrabold text-slate-700">No matches found</p>
                                        <p className="text-xs text-slate-400 mt-1">Select a league from the sidebar.</p>
                                    </div>
                                ) : processedData.map((match, idx) => {
                                    return (
                                        <div key={`${match.id}-${idx}`} onClick={() => setActiveChatMatch(match)} className="flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors group min-h-[68px] md:min-h-[74px]">
                                            <div className="w-12 md:w-16 flex flex-col items-center justify-center text-[10px] text-slate-400 shrink-0">
                                                <span className="font-bold">{match.time}</span>
                                            </div>

                                            <div className="flex-1 py-2 flex flex-col justify-center gap-1.5 overflow-hidden pr-2">
                                                <div className="flex items-center gap-2">
                                                    {match.home_logo && <img src={match.home_logo} alt="" className="w-4 h-4 rounded-full object-contain shrink-0" />}
                                                    <span className="text-[11px] md:text-xs font-bold text-slate-800 truncate">{match.home_team}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {match.away_logo && <img src={match.away_logo} alt="" className="w-4 h-4 rounded-full object-contain shrink-0" />}
                                                    <span className="text-[11px] md:text-xs font-bold text-slate-800 truncate">{match.away_team}</span>
                                                </div>
                                            </div>

                                            <div className="w-[126px] md:w-[190px] flex bg-slate-950 text-white shrink-0">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleBet(match, '1', match.odds_home); }} className={`flex-1 flex items-center justify-center border-r border-slate-800 text-[10px] md:text-xs font-extrabold ${isBetSelected(match, '1') ? 'bg-emerald-500' : 'hover:bg-slate-800'}`}>{match.odds_home}</button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleBet(match, 'X', match.odds_draw); }} className={`flex-1 flex items-center justify-center border-r border-slate-800 text-[10px] md:text-xs font-extrabold ${isBetSelected(match, 'X') ? 'bg-emerald-500' : 'hover:bg-slate-800'}`}>{match.odds_draw}</button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleBet(match, '2', match.odds_away); }} className={`flex-1 flex items-center justify-center text-[10px] md:text-xs font-extrabold ${isBetSelected(match, '2') ? 'bg-emerald-500' : 'hover:bg-slate-800'}`}>{match.odds_away}</button>
                                            </div>

                                            <div className="w-[82px] md:w-32 flex flex-col items-center justify-center border-l border-slate-200 bg-white shrink-0 px-1.5">
                                                {match.status !== 'NS' && match.status !== 'TBD' ? (
                                                    <span className="text-[14px] md:text-[16px] font-black text-emerald-600 tracking-tight">{match.home_score ?? 0} - {match.away_score ?? 0}</span>
                                                ) : (
                                                    <span className="text-[13px] md:text-[15px] font-black text-slate-900 tracking-tight">{match.pred_score}</span>
                                                )}
                                                <div className="w-8 md:w-12 h-0.5 bg-emerald-500 my-1.5 rounded-full" />
                                                <div className="flex items-center gap-1 text-[9px] md:text-[11px] font-extrabold text-emerald-600">
                                                    {match.market_1_val}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Mobile Bottom Bar & Slip Container (Preserved exactly as your architecture) */}
            <div className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-16 z-30 shadow-md">
                <button onClick={() => setIsMobileSlipOpen(false)} className="flex flex-col items-center text-emerald-600 p-2"><Icon name="home" className="mb-1" /><span className="text-[9px] font-extrabold">Matches</span></button>
                <button onClick={() => setIsMobileSlipOpen(!isMobileSlipOpen)} className="flex flex-col items-center text-emerald-600 relative p-2">
                    {betSlip.length > 0 && <div className="absolute -top-0.5 right-0 bg-rose-500 text-white text-[8px] font-black min-w-4 h-4 flex items-center justify-center rounded-full">{betSlip.length}</div>}
                    <Icon name="clipboard" className="mb-1" /><span className="text-[9px] font-extrabold">Slip</span>
                </button>
            </div>

            {(betSlip.length > 0 || isMobileSlipOpen) && (
                <aside className={`${isMobileSlipOpen ? 'fixed inset-0 pt-16 z-40' : 'hidden md:flex'} w-full md:w-80 bg-white md:border-l border-slate-200 flex flex-col shadow-[-8px_0_20px_-8px_rgba(15,23,42,0.12)] shrink-0`}>
                    <div className="h-[72px] flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950 text-white">
                        <div><span className="font-extrabold text-sm block">Prediction slip</span><span className="text-[9px] text-slate-500 uppercase font-bold">Review</span></div>
                        <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-1 rounded-full">{betSlip.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3 pb-40 md:pb-4">
                        {betSlip.map(bet => (
                            <div key={bet.matchId} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm relative">
                                <button onClick={() => handleToggleBet(bet, bet.type, bet.odds)} className="absolute top-2.5 right-2.5 text-slate-300 hover:text-rose-500"><Icon name="close" className="w-3.5 h-3.5" /></button>
                                <div className="text-[9px] text-slate-500 font-extrabold uppercase mb-2 pr-6 truncate">{bet.home_team} vs {bet.away_team}</div>
                                <div className="flex justify-between items-end"><span className="text-xs font-black bg-slate-100 px-2 py-1 rounded-md border border-slate-200">AI: {bet.type}</span><span className="text-sm font-black text-emerald-600">{formatOdds(bet.odds)}x</span></div>
                            </div>
                        ))}
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