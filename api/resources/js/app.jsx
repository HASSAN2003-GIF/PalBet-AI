import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import LiveCompetitions from './LiveCompetitions';

const requestJson = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(options.headers || {}) }});
    let payload = null; try { payload = await response.json(); } catch { }
    if (!response.ok) throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload;
};

// ================= AI ANALYST MODAL =================
const AIChatModal = ({ match, onClose }) => {
    const [messages, setMessages] = useState([{ role: 'ai', text: `I am the PalBet AI Analyst for **${match.home} vs ${match.away}**.\nAsk me about injuries, tactical formations, or the risk model output.` }]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

    const sendMessage = async (e) => {
        e.preventDefault();
        const msg = input.trim();
        if (!msg || isTyping) return;
        setMessages(prev => [...prev, { role: 'user', text: msg }]);
        setInput(''); setIsTyping(true);
        try {
            // 1. ADD THIS LINE to dynamically grab the cloud URL (or fallback to local)
            const API_URL = import.meta.env.VITE_API_URL || '';
            
            // 2. CHANGE THIS LINE to use the API_URL variable
            const data = await requestJson(`${API_URL}/api/platform/chat`, { 
                method: 'POST', 
                body: JSON.stringify({ matchContext: match, message: msg }) 
            });
            
            setMessages(prev => [...prev, { role: 'ai', text: data.response || 'Analysis generated.' }]);
        } catch (err) { 
            setMessages(prev => [...prev, { role: 'ai', text: `Connection Error: ${err.message}` }]); 
        } finally { setIsTyping(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="flex h-[600px] w-full max-w-2xl flex-col rounded-2xl border border-[#202936] bg-[#0B0F15] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex h-16 items-center justify-between border-b border-[#202936] px-6 bg-[#10151D]">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-[#2FD3C6] flex items-center justify-center font-black text-[#071013] text-xs">AI</div>
                        <div><div className="text-sm font-bold text-white">PalBet AI</div><div className="text-[10px] text-[#707A8D]">{match.home} vs {match.away}</div></div>
                    </div>
                    <button onClick={onClose} className="text-[#707A8D] hover:text-white">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-[#2FD3C6] font-medium text-[#071013]' : 'border border-[#202936] bg-[#151B24] text-[#DDE3EC]'}`}>{m.text}</div>
                        </div>
                    ))}
                    {isTyping && <div className="text-xs text-[#2FD3C6] animate-pulse">Running analysis engine...</div>}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="p-4 border-t border-[#202936] bg-[#10151D] flex gap-2">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type your query..." className="flex-1 rounded-xl bg-[#151B24] border border-[#202936] px-4 py-3 text-sm text-white outline-none focus:border-[#2FD3C6]" />
                    <button type="submit" disabled={isTyping} className="rounded-xl bg-[#2FD3C6] px-6 py-3 font-bold text-xs text-[#071013] transition hover:bg-[#25B9AE]">Send</button>
                </form>
            </div>
        </div>
    );
};

// ================= MATCH ROW COMPONENT (PROGRESSIVE DISCLOSURE) =================
const MatchRow = ({ match, setActiveChatMatch }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isLive = match.status !== 'NS' && match.status !== 'TBD' && match.status !== 'FT';
    
    return (
        <div className="bg-[#10151D] border-b border-[#202936] hover:bg-[#131924] transition-colors flex flex-col">
            <div className="flex items-center px-4 py-3 cursor-pointer select-none group" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="w-14 shrink-0 border-r border-[#202936] pr-3 text-center">
                    <div className={`text-[11px] font-black ${isLive ? 'text-rose-500 animate-pulse' : 'text-[#8B95A7]'}`}>{isLive ? 'LIVE' : match.time}</div>
                    <div className="text-[9px] font-bold text-[#535D70] uppercase mt-0.5">{isLive ? match.time : match.status}</div>
                </div>

                <div className="flex-1 px-4 min-w-0 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5 truncate">
                            {match.home_logo ? <img src={match.home_logo} className="w-4 h-4 object-contain" alt="" /> : <div className="w-4 h-4 rounded-full bg-[#1A222D]" />}
                            <span className="text-[13px] font-bold text-[#F5F7FA] truncate">{match.home}</span>
                        </div>
                        <span className={`text-[13px] font-black ${isLive ? 'text-rose-500' : 'text-[#8B95A7]'}`}>{match.home_score ?? '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5 truncate">
                            {match.away_logo ? <img src={match.away_logo} className="w-4 h-4 object-contain" alt="" /> : <div className="w-4 h-4 rounded-full bg-[#1A222D]" />}
                            <span className="text-[13px] font-bold text-[#F5F7FA] truncate">{match.away}</span>
                        </div>
                        <span className={`text-[13px] font-black ${isLive ? 'text-rose-500' : 'text-[#8B95A7]'}`}>{match.away_score ?? '-'}</span>
                    </div>
                </div>

                <div className="w-[300px] shrink-0 pl-4 flex items-center justify-between border-l border-[#202936]">
                    {match.has_odds && match.odds_home !== '-' ? (
                        <>
                            <div className="flex gap-1.5">
                                <div className="w-11 py-1.5 bg-[#0B0F15] border border-[#202936] rounded text-center"><div className="text-[11px] font-bold text-[#2FD3C6]">{match.odds_home}</div></div>
                                <div className="w-11 py-1.5 bg-[#0B0F15] border border-[#202936] rounded text-center"><div className="text-[11px] font-bold text-[#F4B740]">{match.odds_draw}</div></div>
                                <div className="w-11 py-1.5 bg-[#0B0F15] border border-[#202936] rounded text-center"><div className="text-[11px] font-bold text-[#3B82F6]">{match.odds_away}</div></div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-black text-[#2FD3C6] bg-[#2FD3C6]/10 px-2 py-0.5 rounded border border-[#2FD3C6]/20">Pred: {match.pred_score}</span>
                                <span className={`text-[10px] text-[#707A8D] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                            </div>
                        </>
                    ) : (
                        <div className="w-full flex justify-center items-center gap-4">
                            <span className="text-[10px] font-bold text-[#535D70] bg-[#1A222D] px-3 py-1.5 rounded uppercase tracking-widest border border-[#202936]">League Not Scouted</span>
                            <span className={`text-[10px] text-[#707A8D] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                        </div>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="bg-[#0B0F15] px-6 py-4 border-t border-[#202936] flex flex-col md:flex-row gap-6 shadow-inner cursor-default" onClick={e => e.stopPropagation()}>
                    <div className="flex-1">
                        {match.has_odds ? (
                            <>
                                <div className="flex justify-between text-[10px] font-bold text-[#707A8D] mb-1.5">
                                    <span>1: {match.prob_home}%</span>
                                    {match.prob_draw > 0 && <span>X: {match.prob_draw}%</span>}
                                    <span>2: {match.prob_away}%</span>
                                </div>
                                <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1A222D]">
                                    <div style={{width: `${match.prob_home}%`}} className="bg-[#10B981]" />
                                    {match.prob_draw > 0 && <div style={{width: `${match.prob_draw}%`}} className="bg-[#F59E0B]" /> }
                                    <div style={{width: `${match.prob_away}%`}} className="bg-[#3B82F6]" />
                                </div>
                                <div className="mt-2 text-[10px] font-bold text-[#535D70] uppercase tracking-wider">{match.bookmaker}</div>
                            </>
                        ) : (
                            <div className="flex h-full items-center justify-start text-[11px] font-bold text-[#535D70] uppercase tracking-widest">
                                ⚠️ League Not Scouted By Upstream Odds Provider
                            </div>
                        )}
                    </div>
                    
                    <div className="w-full md:w-48 shrink-0 flex flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-[#202936] pt-3 md:pt-0 md:pl-6">
                        {match.has_odds && match.pred_score !== '-' ? (
                            <div className="bg-[#2FD3C6]/10 text-[#2FD3C6] text-[11px] font-black px-3 py-1.5 rounded text-center border border-[#2FD3C6]/20">Pred: {match.pred_score}</div>
                        ) : (
                            <div className="bg-[#1A222D] text-[#535D70] text-[11px] font-black px-3 py-1.5 rounded text-center border border-[#202936]">No Model Data</div>
                        )}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveChatMatch(match); }} 
                            className="flex items-center justify-center gap-1 w-full text-[#707A8D] hover:text-white text-[10px] font-bold transition underline py-1"
                        >
                            Ask AI Analyst ↗
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ================= MAIN APPLICATION =================
function App() {
    const [apiData, setApiData] = useState([]);
    const [activeContext, setActiveContext] = useState({ sport: '', category: '', league: null });
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [activeChatMatch, setActiveChatMatch] = useState(null);

    const calendarDates = useMemo(() => {
        const dates = []; const today = new Date();
        for (let i = 0; i < 7; i++) {
            const next = new Date(today); next.setDate(today.getDate() + i);
            dates.push(new Date(next.getTime() - (next.getTimezoneOffset() * 60000)).toISOString().split('T')[0]);
        }
        return dates;
    }, []);

    const formatDateLabel = (dateStr) => {
        const dateObj = new Date(`${dateStr}T00:00:00`);
        if (dateObj.toDateString() === new Date().toDateString()) return 'Today';
        return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    useEffect(() => {
        setLoading(true);
        const API_URL = 'https://palbet-ai.onrender.com';
fetch(`${API_URL}/api/schedule?date=${selectedDate}`)
            .then(res => res.json())
            .then(data => {
                const safeData = Array.isArray(data) ? data : [];
                setApiData(safeData);
                if (safeData.length > 0) {
                    setActiveContext(prev => {
                        if (!prev.sport && safeData.length > 0) {
                            return { sport: safeData[0].sport, category: safeData[0].categories[0]?.name, league: safeData[0].categories[0]?.leagues[0] };
                        }
                        return prev;
                    });
                } else {
                    setActiveContext({ sport: '', category: '', league: null });
                }
                setLoading(false);
            }).catch(() => { setApiData([]); setLoading(false); });
    }, [selectedDate]);

    const currentMatches = useMemo(() => {
        if (!activeContext.sport || !activeContext.league) return null;
        const s = apiData.find(x => x.sport === activeContext.sport);
        if (!s) return null;
        const c = s.categories.find(x => x.name === activeContext.category);
        if (!c) return null;
        const l = c.leagues.find(x => x.id === activeContext.league.id || x.name === activeContext.league.name);
        return l ? l.matches : null;
    }, [apiData, activeContext]);

    return (
        <div className="flex h-screen bg-[#080B10] font-sans text-slate-100 overflow-hidden">
            {activeChatMatch && <AIChatModal match={activeChatMatch} onClose={() => setActiveChatMatch(null)} />}

            <aside className="w-[280px] bg-[#0B0F15] border-r border-[#202936] flex flex-col shrink-0">
                <div className="h-16 flex items-center px-6 border-b border-[#202936] shrink-0">
                    <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2FD3C6]"></span>PalBet <span className="text-[#2FD3C6]">AI</span>
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <LiveCompetitions data={apiData} activeLeagueId={activeContext.league?.id} onSelect={(s, c, l) => setActiveContext({ sport: s, category: c, league: l })} />
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-16 bg-[#0B0F15] border-b border-[#202936] flex items-center justify-between px-6 shrink-0 shadow-sm">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        {calendarDates.map(d => (
                            <button key={d} onClick={() => setSelectedDate(d)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${selectedDate === d ? 'bg-[#2FD3C6] text-[#071013]' : 'text-[#707A8D] hover:bg-[#151B24] hover:text-white'}`}>
                                {formatDateLabel(d)}
                            </button>
                        ))}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 bg-[#080B10]">
                    <div className="max-w-5xl mx-auto">
                        {activeContext.league && (
                            <div className="mb-4 flex items-center gap-3">
                                <div className="h-8 w-1 bg-[#2FD3C6] rounded-full"></div>
                                <div>
                                    <h1 className="text-lg font-black text-white uppercase tracking-wide">{activeContext.league.name}</h1>
                                    <div className="text-[10px] font-bold text-[#707A8D] uppercase tracking-widest">{activeContext.sport} • {activeContext.category}</div>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex justify-center items-center h-64 text-[10px] font-bold uppercase tracking-widest text-[#535D70] animate-pulse">Syncing Providers...</div>
                        ) : !activeContext.league ? (
                            <div className="flex justify-center items-center h-64 text-xs font-bold text-[#535D70]">Select a competition from the sidebar.</div>
                        ) : currentMatches === null ? (
                            <div className="flex flex-col justify-center items-center h-64 border border-dashed border-[#202936] rounded-2xl">
                                <span className="text-2xl mb-2">📅</span>
                                <span className="text-xs font-bold text-[#707A8D]">No fixtures available for {activeContext.league.name} on this date.</span>
                            </div>
                        ) : (
                            <div className="bg-[#10151D] border border-[#202936] rounded-xl overflow-hidden shadow-lg">
                                {currentMatches.map(m => (
                                    <MatchRow key={m.id} match={m} setActiveChatMatch={setActiveChatMatch} />
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

const container = document.getElementById('app');
if (container && !container._reactRoot) {
    container._reactRoot = createRoot(container);
    container._reactRoot.render(<React.StrictMode><App /></React.StrictMode>);
}