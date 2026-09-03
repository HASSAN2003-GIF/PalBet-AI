import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

const CURRENCIES = {
    USD: { symbol: '$', rate: 1.0, label: 'USD ($)' },
    EUR: { symbol: '€', rate: 0.92, label: 'EUR (€)' },
    GBP: { symbol: '£', rate: 0.79, label: 'GBP (£)' },
    TZS: { symbol: 'TSh ', rate: 2600.0, label: 'TZS (TSh)' },
    KES: { symbol: 'KSh ', rate: 130.0, label: 'KES (KSh)' },
};

const FormBadges = ({ formString }) => {
    if (!formString) return null;
    const matches = formString.split(',');
    
    return (
        <div className="flex space-x-1 mt-1.5 justify-start">
            {matches.map((result, i) => {
                let bgColor = "bg-slate-200 text-slate-600"; 
                if (result === 'W') bgColor = "bg-emerald-500 text-white";
                if (result === 'L') bgColor = "bg-rose-500 text-white";
                
                return (
                    <div key={i} className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${bgColor}`}>
                        {result}
                    </div>
                );
            })}
        </div>
    );
};

function App() {
    const [menuData, setMenuData] = useState([]);
    const [expandedGroups, setExpandedGroups] = useState({ 'Soccer': true });
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSportKey, setActiveSportKey] = useState('soccer_epl');
    const [activeSportName, setActiveSportName] = useState('Premier League (EPL)');
    const [searchQuery, setSearchQuery] = useState('');
    const [currency, setCurrency] = useState('TZS');
    const [selectedDate, setSelectedDate] = useState('All');

    useEffect(() => {
        fetch('/api/risk-analysis?action=menu')
            .then(res => res.json())
            .then(json => setMenuData(json.data || []))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/risk-analysis?action=odds&sport=${encodeURIComponent(activeSportKey)}`)
            .then(res => res.json())
            .then(json => {
                setData(json.data || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [activeSportKey]);

    const groupedMenu = useMemo(() => {
        return menuData.reduce((acc, sport) => {
            if (!acc[sport.group]) acc[sport.group] = [];
            acc[sport.group].push(sport);
            return acc;
        }, {});
    }, [menuData]);

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

    const formatMoney = (baseUsdAmount) => {
        const curr = CURRENCIES[currency];
        const val = baseUsdAmount * curr.rate;
        return (currency === 'TZS' || currency === 'KES') 
            ? `${curr.symbol}${Math.round(val).toLocaleString()}` 
            : `${curr.symbol}${val.toFixed(2)}`;
    };

    const processedData = useMemo(() => {
        let list = [...(data || [])];
        
        if (selectedDate !== 'All') {
            list = list.filter(m => m.date_str === selectedDate);
        }

        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            list = list.filter(m => m.match.toLowerCase().includes(q) || m.bookmaker.toLowerCase().includes(q));
        }

        return list.sort((a, b) => {
            if (a.is_value_bet && !b.is_value_bet) return -1;
            if (!a.is_value_bet && b.is_value_bet) return 1;
            return (b.edge || 0) - (a.edge || 0);
        });
    }, [data, searchQuery, selectedDate]);

    const formatTime = (isoString) => {
        if (!isoString) return 'TBA';
        return new Date(isoString).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };

    const formatDateLabel = (dateStr) => {
        if (dateStr === 'All') return 'All Matches';
        const dateObj = new Date(dateStr);
        const today = new Date();
        if (dateObj.toDateString() === today.toDateString()) return 'Today';
        return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="flex h-screen bg-[#F4F6F9] text-slate-900 antialiased font-sans">
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm">
                <div className="h-16 flex items-center px-6 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                        <span className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">
                            PalBet <span className="text-emerald-500">AI</span>
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Competitions</div>
                    {Object.keys(groupedMenu).sort().map(group => (
                        <div key={group} className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden mb-1">
                            <button onClick={() => setExpandedGroups(p => ({ ...p, [group]: !p[group] }))} className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition">
                                <span className="uppercase">{group}</span>
                                <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full shadow-sm">{groupedMenu[group].length}</span>
                            </button>
                            {expandedGroups[group] && (
                                <div className="bg-white border-t border-slate-100 py-1">
                                    {groupedMenu[group].map(item => (
                                        <button key={item.key} onClick={() => { setActiveSportKey(item.key); setActiveSportName(item.title); }} className={`w-full text-left px-4 py-2 text-xs font-semibold transition truncate block ${activeSportKey === item.key ? 'text-emerald-700 bg-emerald-50 border-l-2 border-emerald-500' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
                                            {item.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main Stage */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-slate-200 z-10 shadow-sm">
                    <div className="h-16 flex items-center justify-between px-8">
                        <div>
                            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{activeSportName}</h1>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">Professional Predictive Analytics & Lines</p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-1.5 rounded focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer">
                                {Object.keys(CURRENCIES).map(code => (<option key={code} value={code}>{CURRENCIES[code].label}</option>))}
                            </select>
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search teams or bookmakers..." className="w-64 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                        </div>
                    </div>
                    
                    {/* Calendar Strip */}
                    <div className="h-12 bg-slate-50/50 border-t border-slate-100 flex items-center px-8 overflow-x-auto space-x-2">
                        {calendarDates.map(date => (
                            <button 
                                key={date} 
                                onClick={() => setSelectedDate(date)}
                                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                                    selectedDate === date 
                                    ? 'bg-slate-800 text-white shadow-sm' 
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                {formatDateLabel(date)}
                            </button>
                        ))}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-80 space-y-3">
                            <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Live Markets...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
                            {processedData.map((match, idx) => (
                                <div key={idx} className={`bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition duration-200 border ${match.is_value_bet ? 'border-emerald-300' : 'border-slate-200'}`}>
                                    
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-slate-500 text-xs font-semibold">{formatTime(match.commence_time)}</span>
                                        <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-slate-200">{match.bookmaker}</span>
                                    </div>

                                    {/* Teams, Logos, Form Badges & Scoreline Layout */}
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center space-x-3 w-2/5">
                                            <img src={match.home_logo} alt="Home" className="w-9 h-9 rounded-full border border-slate-200 shadow-sm shrink-0" />
                                            <div className="flex flex-col truncate">
                                                <h3 className="text-sm font-extrabold text-slate-900 truncate">{match.home_team}</h3>
                                                <FormBadges formString={match.home_form} />
                                            </div>
                                        </div>
                                        
                                        <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded text-center shrink-0">
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-widest">Pred</span>
                                            <span className="text-sm font-black text-slate-800">{match.pred_score}</span>
                                        </div>
                                        
                                        <div className="flex items-center justify-end space-x-3 w-2/5">
                                            <div className="flex flex-col items-end truncate">
                                                <h3 className="text-sm font-extrabold text-slate-900 truncate text-right">{match.away_team}</h3>
                                                <FormBadges formString={match.away_form} />
                                            </div>
                                            <img src={match.away_logo} alt="Away" className="w-9 h-9 rounded-full border border-slate-200 shadow-sm shrink-0" />
                                        </div>
                                    </div>

                                    {/* Probabilities */}
                                    <div className="space-y-1.5 mb-5">
                                        {match.is_soccer ? (
                                            <>
                                                <div className="flex justify-between text-[11px] font-bold text-slate-500 font-mono">
                                                    <span>1: {(match.prob_home * 100).toFixed(0)}%</span>
                                                    <span>X: {(match.prob_draw * 100).toFixed(0)}%</span>
                                                    <span>2: {(match.prob_away * 100).toFixed(0)}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                                    <div style={{ width: `${match.prob_home * 100}%` }} className="bg-emerald-500"></div>
                                                    <div style={{ width: `${match.prob_draw * 100}%` }} className="bg-amber-400"></div>
                                                    <div style={{ width: `${match.prob_away * 100}%` }} className="bg-sky-500"></div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex justify-between text-[11px] font-bold text-slate-500 font-mono">
                                                    <span>1: {(match.prob_home * 100).toFixed(0)}%</span>
                                                    <span>2: {(match.prob_away * 100).toFixed(0)}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                                    <div style={{ width: `${match.prob_home * 100}%` }} className="bg-emerald-500"></div>
                                                    <div style={{ width: `${match.prob_away * 100}%` }} className="bg-sky-500"></div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Dynamic Markets Footer */}
                                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                                        <div className="flex space-x-3 text-slate-600 text-xs font-semibold">
                                            <span>{match.market_1_label}: <span className="text-slate-900">{match.market_1_val}</span></span>
                                            <span>{match.market_2_label}: <span className="text-slate-900">{match.market_2_val}</span></span>
                                        </div>

                                        {match.is_value_bet ? (
                                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded text-xs border border-emerald-200">
                                                Risk {formatMoney(match.stake)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">No Edge</span>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {processedData.length === 0 && (
                                <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-700 mb-1">No Matches Found</h3>
                                    <p className="text-sm">There are no fixtures matching your filters for {formatDateLabel(selectedDate)}.</p>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
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