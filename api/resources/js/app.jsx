import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * PALBET AI — Single-file React interface
 *
 * Architecture intentionally preserved:
 * - AuthModal
 * - AIChatModal
 * - MyBetsSidebar
 * - AdminDashboard
 * - App
 *
 * Existing backend endpoints are unchanged.
 * Styling/UX, validation, error handling and presentation have been refined.
 */

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
        headers: {
            ...API_JSON_HEADERS,
            ...(options.headers || {})
        }
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(payload, `Request failed (${response.status}).`));
    }

    return payload;
};

const formatPoints = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return Math.round(numeric).toLocaleString();
};

const formatOdds = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : '-';
};

const calculateConfidence = (match) => {
    const home = Number(match?.prob_home);
    const away = Number(match?.prob_away);
    const validHome = Number.isFinite(home) ? home : 0.33;
    const validAway = Number.isFinite(away) ? away : 0.33;
    return Math.round(Math.max(validHome, validAway) * 100);
};

const renderAssistantText = (text) => {
    const safeText = String(text || 'Connection interrupted.')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    return safeText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br />');
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

    useEffect(() => {
        if (!isOpen) {
            setError('');
            setPassword('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const switchTab = (tab) => {
        setActiveTab(tab);
        setError('');
        if (tab === 'register') setIsAdmin(false);
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        if (!isFormFilled || isLoading) return;

        setIsLoading(true);
        setError('');

        try {
            const userData = await requestJson('/api/platform/auth', {
                method: 'POST',
                body: JSON.stringify({
                    phone: isAdmin ? mobile.trim() : `+255${normalizedMobile}`,
                    password,
                    role: isAdmin ? 'admin' : 'player'
                })
            });

            if (userData?.error) {
                throw new Error(getErrorMessage(userData));
            }

            onLogin(userData);
            onClose();
            setPassword('');
        } catch (error) {
            console.error('Authentication failed:', error);
            setError(error.message || 'Unable to complete authentication.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-slate-950/70 z-[60] flex items-center justify-center p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={activeTab === 'register' ? 'Create account' : 'Sign in'}
        >
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative overflow-hidden flex flex-col border border-white/20">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full p-2 z-10 transition"
                >
                    <Icon name="close" className="w-5 h-5" />
                </button>

                <div className="px-8 pt-8 pb-5">
                    <div className="flex items-center gap-2 mb-5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
                        <span className="text-sm font-black tracking-tight text-slate-900 uppercase">PalBet <span className="text-emerald-500">AI</span></span>
                    </div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900">
                        {activeTab === 'register' ? 'Create your account' : 'Welcome back'}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1.5">
                        {activeTab === 'register'
                            ? 'Create a secure account to save your predictions.'
                            : 'Sign in to continue to your prediction workspace.'}
                    </p>
                </div>

                <div className="px-8">
                    <div className="flex border-b border-slate-200">
                        <button
                            type="button"
                            onClick={() => switchTab('login')}
                            className={`flex-1 pb-3 text-sm transition-colors ${activeTab === 'login' ? 'text-emerald-600 font-extrabold border-b-2 border-emerald-500' : 'text-slate-500 font-semibold hover:text-slate-800'}`}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => switchTab('register')}
                            className={`flex-1 pb-3 text-sm transition-colors ${activeTab === 'register' ? 'text-emerald-600 font-extrabold border-b-2 border-emerald-500' : 'text-slate-500 font-semibold hover:text-slate-800'}`}
                        >
                            Register
                        </button>
                    </div>
                </div>

                <div className="bg-slate-50 p-8">
                    <form onSubmit={handleAuth} className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                                {isAdmin ? 'Administrator username' : 'Mobile number'}
                            </label>
                            <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition">
                                {!isAdmin && (
                                    <span className="flex items-center px-3 text-sm font-bold text-slate-400 border-r border-slate-100">+255</span>
                                )}
                                <input
                                    type={isAdmin ? 'text' : 'tel'}
                                    inputMode={isAdmin ? 'text' : 'numeric'}
                                    autoComplete={activeTab === 'login' ? 'username' : 'tel'}
                                    placeholder={isAdmin ? 'Administrator username' : 'Mobile number'}
                                    value={mobile}
                                    onChange={(e) => setMobile(e.target.value)}
                                    className="w-full p-3.5 outline-none text-slate-900 text-sm bg-transparent"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition">
                                <input
                                    type="password"
                                    autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                                    placeholder={activeTab === 'register' ? 'Create a password' : 'Enter your password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full p-3.5 outline-none text-slate-900 text-sm bg-transparent"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!isFormFilled || isLoading}
                            className={`w-full py-3.5 rounded-xl text-sm font-extrabold transition-all ${isFormFilled && !isLoading
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 active:scale-[0.99]'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                        >
                            {isLoading ? 'Authenticating…' : (activeTab === 'register' ? 'Create account' : (isAdmin ? 'Administrator sign in' : 'Sign in'))}
                        </button>

                        {activeTab === 'login' && showAdminToggle && (
                            <div className="pt-1 text-center">
                                <button
                                    type="button"
                                    onClick={() => { setIsAdmin(!isAdmin); setError(''); setMobile(''); }}
                                    className="text-xs font-bold text-slate-400 hover:text-slate-700 underline decoration-slate-300 underline-offset-2"
                                >
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
        {
            role: 'ai',
            text: `Hi. I'm your PalBet analyst for **${match?.home_team} vs ${match?.away_team}**.\n\nI can examine the model output alongside live context such as lineups, injuries, form and tactical information. What would you like to understand?`
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    if (!match) return null;

    const sendMessage = async (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isTyping) return;

        const updatedHistory = [...messages, { role: 'user', text: trimmed }];
        setMessages(updatedHistory);
        setInput('');
        setError('');
        setIsTyping(true);

        try {
            const data = await requestJson('/api/platform/chat', {
                method: 'POST',
                body: JSON.stringify({
                    match: `${match.home_team} vs ${match.away_team}`,
                    message: trimmed,
                    history: messages,
                    stats: {
                        score: match.pred_score,
                        prediction: match.market_1_val,
                        confidence: calculateConfidence(match)
                    }
                })
            });

            setMessages(prev => [...prev, {
                role: 'ai',
                text: data.response || 'The analyst returned an empty response.'
            }]);
        } catch (error) {
            console.error('AI chat failed:', error);
            setError('The live analysis service is temporarily unavailable.');
            setMessages(prev => [...prev, {
                role: 'ai',
                text: 'I could not reach the analysis service right now. Please try again in a moment.'
            }]);
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
                    <div className="flex flex-wrap gap-2 pb-1">
                        <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                            Model {match.pred_score || '—'}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                            {calculateConfidence(match)}% confidence
                        </span>
                    </div>

                    {messages.map((msg, idx) => (
                        <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[88%] rounded-2xl px-4 py-3.5 text-sm shadow-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-emerald-600 text-white rounded-br-sm'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
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

                    {error && (
                        <div className="text-center text-[10px] font-bold text-rose-500">{error}</div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
                    <form onSubmit={sendMessage} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-2.5 py-2 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={`Ask about ${match.home_team}…`}
                            className="flex-1 bg-transparent border-none outline-none text-sm px-2 text-slate-900 placeholder-slate-400"
                            disabled={isTyping}
                            maxLength={1000}
                        />
                        <button
                            type="submit"
                            aria-label="Send message"
                            disabled={!input.trim() || isTyping}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${input.trim() && !isTyping
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/10'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                        >
                            <Icon name="send" className="w-4 h-4 translate-x-0.5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const MyBetsSidebar = ({ isOpen, onClose, userId }) => {
    const [bets, setBets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !userId) return;

        let cancelled = false;
        setLoading(true);
        setError('');

        requestJson(`/api/platform/my-bets?user_id=${encodeURIComponent(userId)}`)
            .then(json => {
                if (!cancelled) setBets(Array.isArray(json.data) ? json.data : []);
            })
            .catch(err => {
                if (!cancelled) {
                    console.error('Failed to load predictions:', err);
                    setError('Unable to load your saved predictions.');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [isOpen, userId]);

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-slate-950/30 z-[49] backdrop-blur-[1px]" onClick={onClose} />
            <aside className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white flex flex-col z-[50] shadow-2xl animate-in slide-in-from-right-8 duration-200">
                <div className="h-[72px] flex items-center justify-between px-5 sm:px-6 border-b border-slate-800 bg-slate-950 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                            <Icon name="document" className="w-4 h-4" />
                        </div>
                        <div>
                            <span className="font-extrabold tracking-tight text-sm block">My Predictions</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Prediction history</span>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close predictions" className="text-slate-400 hover:text-white hover:bg-white/10 rounded-lg p-2 transition">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4 pb-24">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center mt-16 gap-3">
                            <div className="h-7 w-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Loading predictions</span>
                        </div>
                    ) : error ? (
                        <div className="mt-10 rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs font-semibold text-rose-700">{error}</div>
                    ) : bets.length === 0 ? (
                        <div className="text-center mt-16 px-8">
                            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <Icon name="document" className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-extrabold text-slate-700">No saved predictions</p>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">Your saved prediction slips will appear here.</p>
                        </div>
                    ) : (
                        bets.map(bet => (
                            <div key={bet.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                    <span className="font-extrabold text-[10px] text-slate-500 uppercase tracking-wider">Prediction #{bet.id}</span>
                                    <span className="text-[10px] text-slate-400 font-semibold">{bet.date}</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    {(bet.matches || []).map((m, i) => (
                                        <div key={`${m.home_team}-${m.away_team}-${i}`} className="flex justify-between items-center gap-3">
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-bold text-slate-800 text-xs truncate">{m.home_team} <span className="text-slate-300">vs</span> {m.away_team}</span>
                                                <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-wider mt-0.5">AI pick: {m.type}</span>
                                            </div>
                                            <span className="font-black text-slate-700 text-xs shrink-0">{formatOdds(m.odds)}x</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 bg-slate-50 border-t border-slate-100">
                                    <div className="flex justify-between text-xs mb-2 text-slate-500 font-bold">
                                        <span>Combined odds</span>
                                        <span>{formatOdds(bet.total_odds)}x</span>
                                    </div>
                                    <div className="flex justify-between text-xs mb-3 text-slate-500 font-bold">
                                        <span>Points risked</span>
                                        <span>{formatPoints(bet.stake)} Pts</span>
                                    </div>
                                    <div className="flex justify-between items-end border-t border-slate-200 pt-3">
                                        <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">Projected output</span>
                                        <span className="font-black text-emerald-600 text-base">{formatPoints(bet.potential_payout)} Pts</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </aside>
        </>
    );
};

const AdminDashboard = ({ onExit }) => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        requestJson('/api/platform/admin-stats')
            .then(data => {
                if (!cancelled) setStats(data);
            })
            .catch(err => {
                console.error('Failed to load admin statistics:', err);
                if (!cancelled) setError(err.message || 'Unable to load dashboard data.');
            });

        return () => { cancelled = true; };
    }, []);

    if (!stats && !error) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <div className="text-[10px] text-slate-400 font-extrabold tracking-[0.2em] uppercase">Loading dashboard</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6">
                <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
                    <div className="text-sm font-extrabold text-slate-800">Dashboard unavailable</div>
                    <p className="text-xs text-slate-500 mt-2">{error}</p>
                    <button onClick={onExit} className="mt-5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold">Return to live site</button>
                </div>
            </div>
        );
    }

    const totalAccounts = Number(stats?.totalAccounts) || 0;
    const loggedIn = Number(stats?.loggedIn) || 0;
    const activityFeed = Array.isArray(stats?.activityFeed) ? stats.activityFeed : [];

    return (
        <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans">
            <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col z-20 border-r border-slate-800">
                <div className="h-[72px] flex items-center px-6 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-base font-black tracking-tight text-white uppercase">PalBet <span className="text-emerald-400">Admin</span></span>
                    </div>
                </div>
                <div className="p-4 mt-auto">
                    <button onClick={onExit} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-lg text-xs font-bold transition">
                        <span>Return to live site</span>
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto p-5 md:p-8">
                    <div className="mb-7">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">Operations</p>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Performance overview</h1>
                        <p className="text-sm text-slate-500 mt-1">A concise view of current platform activity.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-5">
                                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Total accounts</span>
                                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><Icon name="document" className="w-4 h-4" /></span>
                            </div>
                            <span className="text-3xl font-black text-slate-900">{totalAccounts.toLocaleString()}</span>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-5">
                                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Currently active</span>
                                <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-emerald-500" /></span>
                            </div>
                            <span className="text-3xl font-black text-slate-900">{loggedIn.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 md:p-6 max-w-3xl">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-sm font-extrabold text-slate-900">Live activity</h3>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-1">Recent platform events</p>
                            </div>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-300" />
                        </div>

                        <div className="space-y-1">
                            {activityFeed.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400">No recent activity.</div>
                            ) : activityFeed.map((log, i) => (
                                <div key={`${log.time || 'event'}-${log.phone || i}-${i}`} className="flex items-center justify-between gap-4 py-3 border-t border-slate-100 first:border-t-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.color || 'bg-slate-100 text-slate-500'}`}>
                                            <Icon name="bolt" className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-bold text-slate-700 truncate">{log.phone || 'Unknown user'}</span>
                                            <span className="text-[10px] font-semibold text-slate-400 truncate">{log.action || 'Platform activity'}</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{log.time || '—'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

function App() {
    const [categories, setCategories] = useState([]);
    const [expandedCategories, setExpandedCategories] = useState({ 'England': true });
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [activeSportKey, setActiveSportKey] = useState('soccer_epl');
    const [activeSportName, setActiveSportName] = useState('Premier League (EPL)');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDate, setSelectedDate] = useState('All');

    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [currentView, setCurrentView] = useState('main');

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSlipOpen, setIsMobileSlipOpen] = useState(false);

    const [betSlip, setBetSlip] = useState([]);
    const [stakeAmount, setStakeAmount] = useState(100);
    const [isBetting, setIsBetting] = useState(false);
    const [betError, setBetError] = useState('');
    const [isMyBetsOpen, setIsMyBetsOpen] = useState(false);
    const [activeChatMatch, setActiveChatMatch] = useState(null);

    const fetchMenu = async () => {
        try {
            const json = await requestJson('/api/risk-analysis?action=menu');
            setCategories(Array.isArray(json.data) ? json.data : []);
        } catch (err) {
            console.error('Failed to load league menu:', err);
        }
    };

    useEffect(() => {
        fetch('/api/platform/track').catch(() => {});
        fetchMenu();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadOdds = async () => {
            setLoading(true);
            setLoadError('');

            try {
                const json = await requestJson(`/api/risk-analysis?action=odds&sport=${encodeURIComponent(activeSportKey)}`);
                if (!cancelled) setData(Array.isArray(json.data) ? json.data : []);
            } catch (err) {
                console.error('Failed to load odds:', err);
                if (!cancelled) {
                    setData([]);
                    setLoadError('Live match data is temporarily unavailable.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadOdds();
        return () => { cancelled = true; };
    }, [activeSportKey]);

    const toggleCategory = (catName) => {
        setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
    };

    const handleToggleBet = (match, type, odds) => {
        const numericOdds = Number(odds);
        if (!Number.isFinite(numericOdds) || numericOdds <= 0) return;

        const matchId = `${match.home_team}-${match.away_team}`;
        setBetError('');

        setBetSlip(prev => {
            const existing = prev.find(b => b.matchId === matchId);

            if (existing && existing.type === type) {
                return prev.filter(b => b.matchId !== matchId);
            }

            const newBet = {
                matchId,
                home_team: match.home_team,
                away_team: match.away_team,
                type,
                odds: numericOdds
            };

            if (existing) return prev.map(b => b.matchId === matchId ? newBet : b);
            return [...prev, newBet];
        });
    };

    const isBetSelected = (match, type) => {
        return betSlip.some(b => b.matchId === `${match.home_team}-${match.away_team}` && b.type === type);
    };

    const totalOddsNumber = betSlip.reduce((acc, bet) => acc * Number(bet.odds), 1);
    const totalOdds = betSlip.length ? totalOddsNumber.toFixed(2) : '0.00';
    const safeStake = Number.isFinite(Number(stakeAmount)) && Number(stakeAmount) > 0 ? Number(stakeAmount) : 0;
    const potentialPayout = safeStake * totalOddsNumber;

    const handlePlaceBet = async () => {
        if (!currentUser) {
            setIsAuthOpen(true);
            return;
        }

        if (!betSlip.length || safeStake <= 0 || !Number.isFinite(totalOddsNumber)) {
            setBetError('Add at least one prediction and enter a valid stake.');
            return;
        }

        setIsBetting(true);
        setBetError('');

        try {
            const result = await requestJson('/api/platform/bet', {
                method: 'POST',
                body: JSON.stringify({
                    phone: currentUser.phone,
                    stake: safeStake,
                    totalOdds: totalOddsNumber,
                    potentialPayout,
                    slip: betSlip
                })
            });

            if (result.error) throw new Error(getErrorMessage(result));

            if (result.newBalance !== undefined) {
                setCurrentUser(prev => ({ ...prev, balanceUsd: result.newBalance }));
            }

            setBetSlip([]);
            setIsMobileSlipOpen(false);
            setIsMyBetsOpen(true);
        } catch (err) {
            console.error('Failed to save prediction:', err);
            setBetError(err.message || 'Unable to save this prediction. Please try again.');
        } finally {
            setIsBetting(false);
        }
    };

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
        let list = [...(data || [])];

        if (selectedDate !== 'All') {
            list = list.filter(m => m.date_str === selectedDate);
        }

        const q = searchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter(m =>
                m.home_team?.toLowerCase().includes(q) ||
                m.away_team?.toLowerCase().includes(q) ||
                m.bookmaker?.toLowerCase().includes(q)
            );
        }

        return list;
    }, [data, searchQuery, selectedDate]);

    const formatTimeOnly = (isoString) => {
        if (!isoString) return '--:--';

        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '--:--';

        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateLabel = (dateStr) => {
        if (dateStr === 'All') return 'All matches';

        const dateObj = new Date(`${dateStr}T00:00:00`);
        const today = new Date();

        if (dateObj.toDateString() === today.toDateString()) return 'Today';

        return dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    if (currentView === 'admin') {
        return <AdminDashboard onExit={() => setCurrentView('main')} />;
    }

    return (
        <div className="flex h-screen bg-[#F5F7FA] text-slate-900 antialiased font-sans relative overflow-hidden pb-16 md:pb-0">
            <AuthModal
                isOpen={isAuthOpen}
                onClose={() => setIsAuthOpen(false)}
                onLogin={(userData) => setCurrentUser(userData)}
            />

            <MyBetsSidebar
                isOpen={isMyBetsOpen}
                onClose={() => setIsMyBetsOpen(false)}
                userId={currentUser?.id}
            />

            {activeChatMatch && (
                <AIChatModal
                    match={activeChatMatch}
                    onClose={() => setActiveChatMatch(null)}
                />
            )}

            <aside className={`${isMobileMenuOpen ? 'fixed inset-0 z-40 bg-white' : 'hidden'} md:flex md:w-80 bg-white border-r border-slate-200 flex-col z-20 shrink-0`}>
                <div className="h-[72px] flex items-center justify-between px-5 md:px-6 border-b border-slate-200">
                    <div className="flex items-center gap-2.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-300" />
                        <span className="text-lg font-black tracking-tight text-slate-900 uppercase">PalBet <span className="text-emerald-500">AI</span></span>
                    </div>
                    <button className="md:hidden text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg p-2" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-4 pt-5 pb-2">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.16em]">AI models & leagues</div>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">LIVE</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
                    {categories.length === 0 ? (
                        <div className="p-4 text-xs text-slate-400 leading-relaxed">League models will appear here when the feed is available.</div>
                    ) : categories.map((item) => {
                        const isExpanded = !!expandedCategories[item.category];

                        return (
                            <div key={item.category} className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-shadow hover:shadow-sm">
                                <button
                                    onClick={() => toggleCategory(item.category)}
                                    className={`w-full flex items-center justify-between px-3.5 py-3.5 text-left transition-colors ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                                >
                                    <div className="flex items-center gap-3 truncate">
                                        <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm shrink-0">{item.icon}</span>
                                        <span className="text-xs font-extrabold text-slate-800 tracking-tight truncate">{item.category}</span>
                                    </div>
                                    <Icon name="chevron" className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {isExpanded && (
                                    <div className="bg-slate-50/70 border-t border-slate-100 py-1">
                                        {(item.leagues || []).map((league) => {
                                            const isActive = activeSportKey === league.key;

                                            return (
                                                <button
                                                    key={league.key}
                                                    onClick={() => {
                                                        setActiveSportKey(league.key);
                                                        setActiveSportName(league.title);
                                                        setIsMobileMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium transition text-left ${isActive
                                                        ? 'bg-emerald-50 text-emerald-700 font-extrabold border-l-4 border-emerald-500 pl-3'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}`}
                                                >
                                                    <span className="truncate pr-2">{league.title}</span>
                                                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="hidden md:block p-4 border-t border-slate-100">
                    <div className="rounded-xl bg-slate-950 text-white p-4">
                        <div className="flex items-center gap-2 text-emerald-400 text-[9px] font-extrabold uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Analyst online
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-2">Tap any match to open the AI analysis workspace.</p>
                    </div>
                </div>
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <header className="bg-white border-b border-slate-200 z-10">
                    <div className="h-[72px] flex items-center justify-between px-4 md:px-8 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <button className="md:hidden text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                                <Icon name="menu" className="w-5 h-5" />
                            </button>
                            <div className="hidden md:block min-w-0">
                                <h1 className="text-lg font-black text-slate-900 tracking-tight truncate">{activeSportName}</h1>
                                <p className="text-[9px] text-slate-400 font-extrabold mt-0.5 uppercase tracking-[0.18em]">Predictive model interface</p>
                            </div>
                            <div className="md:hidden min-w-0">
                                <span className="text-sm font-black text-slate-900 truncate block">{activeSportName}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4 shrink-0">
                            <div className="hidden md:flex items-center w-52 bg-slate-50 border border-slate-200 rounded-lg px-3 focus-within:border-emerald-500 focus-within:bg-white transition-colors">
                                <Icon name="search" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search teams or league…"
                                    className="w-full bg-transparent border-0 outline-none px-2 py-2 text-xs text-slate-900 placeholder-slate-400"
                                />
                            </div>

                            {currentUser ? (
                                <div className="flex items-center gap-2 md:gap-4">
                                    {currentUser.role === 'admin' ? (
                                        <button onClick={() => setCurrentView('admin')} className="bg-slate-950 hover:bg-slate-800 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-2 rounded-lg transition">
                                            Admin
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setIsMyBetsOpen(true)}
                                                className="hidden md:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition"
                                            >
                                                <Icon name="document" className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-extrabold uppercase tracking-wider">My predictions</span>
                                            </button>
                                            <div className="flex items-center gap-2 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-sm">
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider">Points</span>
                                                    <span className="text-xs font-black text-emerald-600">{formatPoints(currentUser.balanceUsd)} Pts</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <button
                                        onClick={() => { setCurrentUser(null); setBetSlip([]); }}
                                        className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition"
                                        aria-label="Sign out"
                                        title="Sign out"
                                    >
                                        <Icon name="logout" className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => setIsAuthOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] md:text-xs font-extrabold px-4 md:px-5 py-2.5 rounded-lg shadow-sm shadow-emerald-500/10 transition">
                                    Sign in / Register
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="h-12 bg-slate-50/70 border-t border-slate-100 flex items-center px-4 md:px-8 overflow-x-auto gap-2">
                        <div className="hidden sm:flex items-center gap-1.5 mr-1 text-slate-400">
                            <Icon name="calendar" className="w-3.5 h-3.5" />
                        </div>
                        {calendarDates.map(date => (
                            <button
                                key={date}
                                onClick={() => setSelectedDate(date)}
                                className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-[10px] md:text-xs font-extrabold transition-colors ${selectedDate === date
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
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
                                <p className="text-[10px] text-slate-400 mt-1">Fetching current match intelligence</p>
                            </div>
                        </div>
                    ) : loadError ? (
                        <div className="max-w-xl mx-auto mt-12 bg-white border border-slate-200 rounded-2xl p-7 text-center shadow-sm">
                            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
                                <Icon name="bolt" className="w-5 h-5" />
                            </div>
                            <h2 className="text-sm font-extrabold text-slate-800">{loadError}</h2>
                            <p className="text-xs text-slate-400 mt-1.5">Try switching leagues or refreshing the page.</p>
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto">
                            <div className="flex items-end justify-between mb-4 px-1">
                                <div>
                                    <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">Prediction board</p>
                                    <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight mt-1">{processedData.length} available matches</h2>
                                </div>
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="text-[10px] font-bold text-slate-400 hover:text-slate-700">
                                        Clear search
                                    </button>
                                )}
                            </div>

                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-8">
                                <div className="bg-slate-950 text-white text-[9px] font-extrabold px-4 py-2 flex items-center">
                                    <span>{selectedDate !== 'All' ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.') : 'ALL MATCHES'}</span>
                                    <span className="ml-5 text-slate-500 tracking-[0.18em]">FAVORITE LEAGUES</span>
                                </div>

                                <div className="flex bg-slate-100 text-slate-600 font-extrabold text-[9px] md:text-[10px] uppercase items-stretch border-b border-slate-200 h-9">
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
                                        <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center mx-auto mb-3">
                                            <Icon name="search" className="w-5 h-5" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">No matches found</p>
                                        <p className="text-xs text-slate-400 mt-1">Try another date, league or search term.</p>
                                    </div>
                                ) : processedData.map((match, idx) => {
                                    const confidence = calculateConfidence(match);

                                    return (
                                        <div
                                            key={`${match.home_team}-${match.away_team}-${match.commence_time || idx}`}
                                            onClick={() => setActiveChatMatch(match)}
                                            className="flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors group min-h-[68px] md:min-h-[74px]"
                                        >
                                            <div className="w-12 md:w-16 flex flex-col items-center justify-center text-[9px] md:text-[10px] text-slate-400 shrink-0">
                                                <span className="font-semibold">{formatTimeOnly(match.commence_time)}</span>
                                            </div>

                                            <div className="flex-1 py-2 flex flex-col justify-center gap-1.5 overflow-hidden pr-2 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={match.home_logo}
                                                        alt=""
                                                        className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full object-contain shrink-0 bg-white"
                                                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                                    />
                                                    <span className="text-[11px] md:text-xs font-bold text-slate-800 truncate">{match.home_team}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={match.away_logo}
                                                        alt=""
                                                        className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full object-contain shrink-0 bg-white"
                                                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                                    />
                                                    <span className="text-[11px] md:text-xs font-bold text-slate-800 truncate">{match.away_team}</span>
                                                </div>
                                            </div>

                                            <div className="w-[126px] md:w-[190px] flex bg-slate-950 text-white shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleToggleBet(match, '1', match.odds_home); }}
                                                    className={`flex-1 flex items-center justify-center border-r border-slate-800 text-[10px] md:text-xs font-extrabold transition-colors ${isBetSelected(match, '1') ? 'bg-emerald-500' : 'hover:bg-slate-800'}`}
                                                >
                                                    {formatOdds(match.odds_home)}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleToggleBet(match, 'X', match.odds_draw); }}
                                                    disabled={!match.is_soccer || !match.odds_draw}
                                                    className={`flex-1 flex items-center justify-center border-r border-slate-800 text-[10px] md:text-xs font-extrabold transition-colors ${!match.is_soccer || !match.odds_draw ? 'text-slate-700 cursor-not-allowed' : isBetSelected(match, 'X') ? 'bg-emerald-500' : 'hover:bg-slate-800'}`}
                                                >
                                                    {formatOdds(match.odds_draw)}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleToggleBet(match, '2', match.odds_away); }}
                                                    className={`flex-1 flex items-center justify-center text-[10px] md:text-xs font-extrabold transition-colors ${isBetSelected(match, '2') ? 'bg-emerald-500' : 'hover:bg-slate-800'}`}
                                                >
                                                    {formatOdds(match.odds_away)}
                                                </button>
                                            </div>

                                            <div className="w-[82px] md:w-32 flex flex-col items-center justify-center border-l border-slate-200 bg-white shrink-0 group-hover:bg-slate-50 px-1.5">
                                                <span className="text-[13px] md:text-[15px] font-black text-slate-900 tracking-tight">
                                                    {match.pred_score || '0 - 0'}
                                                </span>
                                                <div className="w-8 md:w-12 h-0.5 bg-emerald-500 my-1.5 rounded-full" />
                                                <div className="flex items-center gap-1 text-[9px] md:text-[11px] font-extrabold">
                                                    <span className="text-slate-400">{match.market_1_val || '0%'}</span>
                                                    <span className="text-emerald-600">{confidence}%</span>
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

            <div className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-16 z-30 px-2 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
                <button onClick={() => { setIsMobileSlipOpen(false); setIsMyBetsOpen(false); }} className="flex flex-col items-center text-emerald-600 p-2">
                    <Icon name="home" className="w-5 h-5 mb-1" />
                    <span className="text-[9px] font-extrabold">Matches</span>
                </button>
                <button onClick={() => { if (currentUser) { setIsMyBetsOpen(true); setIsMobileSlipOpen(false); } else { setIsAuthOpen(true); } }} className="flex flex-col items-center text-slate-500 hover:text-emerald-500 p-2">
                    <Icon name="document" className="w-5 h-5 mb-1" />
                    <span className="text-[9px] font-extrabold">History</span>
                </button>
                <button onClick={() => setIsMobileSlipOpen(!isMobileSlipOpen)} className="flex flex-col items-center text-emerald-600 relative p-2">
                    {betSlip.length > 0 && (
                        <div className="absolute -top-0.5 right-0 bg-rose-500 text-white text-[8px] font-black min-w-4 h-4 px-1 flex items-center justify-center rounded-full border border-white">
                            {betSlip.length}
                        </div>
                    )}
                    <Icon name="clipboard" className="w-5 h-5 mb-1" />
                    <span className="text-[9px] font-extrabold">Slip</span>
                </button>
            </div>

            {(betSlip.length > 0 || isMobileSlipOpen) && (
                <aside className={`${isMobileSlipOpen ? 'fixed inset-0 pt-16 z-40' : 'hidden md:flex'} w-full md:w-80 bg-white md:border-l border-slate-200 flex flex-col md:z-30 shadow-[-8px_0_20px_-8px_rgba(15,23,42,0.12)] md:shrink-0`}>
                    <div className="h-[72px] flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950 text-white">
                        <div>
                            <span className="font-extrabold tracking-tight text-sm block">Prediction slip</span>
                            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Review before saving</span>
                        </div>
                        <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-1 rounded-full">{betSlip.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3 pb-40 md:pb-4">
                        {betSlip.length === 0 ? (
                            <div className="text-center mt-12 px-6">
                                <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 text-slate-300 flex items-center justify-center mx-auto mb-3">
                                    <Icon name="clipboard" className="w-5 h-5" />
                                </div>
                                <p className="text-sm font-extrabold text-slate-700">Your slip is empty</p>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Select an odd from the match board to add a prediction.</p>
                            </div>
                        ) : betSlip.map(bet => (
                            <div key={bet.matchId} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm relative group">
                                <button
                                    onClick={() => handleToggleBet(bet, bet.type, bet.odds)}
                                    className="absolute top-2.5 right-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md p-1 transition-colors"
                                    aria-label="Remove prediction"
                                >
                                    <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                                <div className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider mb-2 pr-6 truncate">
                                    {bet.home_team} <span className="text-slate-300 mx-1">vs</span> {bet.away_team}
                                </div>
                                <div className="flex justify-between items-end gap-2">
                                    <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">AI: {bet.type}</span>
                                    <span className="text-sm font-black text-emerald-600">{formatOdds(bet.odds)}x</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-5 bg-white border-t border-slate-200 md:relative fixed bottom-16 md:bottom-0 w-full md:w-auto">
                        <div className="flex justify-between items-center text-xs mb-3">
                            <span className="text-slate-500 font-bold">Combined odds</span>
                            <span className="font-black text-slate-900 text-lg">{totalOdds}x</span>
                        </div>

                        <div className="flex items-center justify-between mb-4 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition">
                            <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Risk units</span>
                            <div className="flex items-center">
                                <input
                                    type="number"
                                    value={stakeAmount}
                                    onChange={e => setStakeAmount(Math.max(0, Number(e.target.value) || 0))}
                                    className="w-20 text-right bg-transparent outline-none font-black text-slate-800 text-sm"
                                    min="1"
                                    step="1"
                                />
                                <span className="text-[10px] font-bold text-slate-400 ml-1">Pts</span>
                            </div>
                        </div>

                        <div className="flex justify-between text-sm mb-4 items-end">
                            <span className="text-slate-500 font-extrabold uppercase text-[9px] tracking-widest">Projected output</span>
                            <span className="font-black text-emerald-600 text-lg">{formatPoints(potentialPayout)} Pts</span>
                        </div>

                        {betError && (
                            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
                                {betError}
                            </div>
                        )}

                        <button
                            onClick={handlePlaceBet}
                            disabled={isBetting || betSlip.length === 0}
                            className={`w-full py-3.5 rounded-xl font-extrabold transition-all uppercase tracking-widest text-[10px] ${isBetting || betSlip.length === 0
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/15 active:scale-[0.99]'}`}
                        >
                            {isBetting ? 'Saving prediction…' : (currentUser ? 'Save prediction' : 'Sign in to save')}
                        </button>
                    </div>
                </aside>
            )}
        </div>
    );
}

const container = document.getElementById('app');

if (container) {
    if (!container._reactRoot) {
        container._reactRoot = createRoot(container);
    }

    container._reactRoot.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
