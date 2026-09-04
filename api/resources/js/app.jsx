import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

const AuthModal = ({ isOpen, onClose, onLogin }) => {
    const [activeTab, setActiveTab] = useState('login');
    const [isAdmin, setIsAdmin] = useState(false);
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const isFormFilled = mobile.length > 5 && password.length > 3;
    const showAdminToggle = new URLSearchParams(window.location.search).get('admin') === 'true';

    const handleAuth = async (e) => {
        e.preventDefault();
        if (!isFormFilled) return;
        setIsLoading(true);

        try {
            const response = await fetch('/api/platform/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: `+255${mobile}`, // Defaulting to Tz prefix for simplicity in UI
                    password: password,
                    role: isAdmin ? 'admin' : 'player'
                })
            });
            const userData = await response.json();
            
            // Give users 10,000 free starting points instead of $15
            if (!isAdmin && userData.balanceUsd === 15) {
                userData.balanceUsd = 10000; 
            }
            
            onLogin(userData);
            onClose();
        } catch (error) {
            console.error("Auth failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded shadow-2xl relative overflow-hidden flex flex-col">
                <button onClick={onClose} className="absolute top-3 right-4 text-slate-400 hover:text-slate-600 z-10">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="flex border-b border-slate-200 pt-6 px-12 bg-white">
                    <button onClick={() => { setActiveTab('register'); setIsAdmin(false); }} className={`flex-1 pb-3 text-center text-sm transition-colors ${activeTab === 'register' ? 'text-emerald-600 font-extrabold border-b-2 border-emerald-500' : 'text-slate-500 font-semibold hover:text-slate-800'}`}>Register</button>
                    <button onClick={() => setActiveTab('login')} className={`flex-1 pb-3 text-center text-sm transition-colors ${activeTab === 'login' ? 'text-emerald-600 font-extrabold border-b-2 border-emerald-500' : 'text-slate-500 font-semibold hover:text-slate-800'}`}>Login</button>
                </div>
                <div className="bg-stone-50 p-8 flex-1 relative">
                    <div className="relative z-10">
                        <form onSubmit={handleAuth}>
                            <div className="bg-white rounded border border-slate-300 overflow-hidden shadow-sm focus-within:border-emerald-500 transition-colors">
                                <div className="flex border-b border-slate-200">
                                    <input type="text" placeholder={isAdmin ? "Administrator Username" : "Mobile Number (Exclude Prefix)"} value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full p-3 outline-none text-slate-900 text-sm" />
                                </div>
                                <div>
                                    <input type="password" placeholder={activeTab === 'register' ? "Set Password" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 outline-none text-slate-900 text-sm" />
                                </div>
                            </div>
                            
                            <button type="submit" disabled={!isFormFilled || isLoading} className={`w-full mt-6 py-3 rounded text-sm font-bold transition-colors ${isFormFilled ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-md' : 'bg-slate-300 text-white cursor-not-allowed'}`}>
                                {isLoading ? 'Processing...' : (activeTab === 'register' ? 'Create Account' : (isAdmin ? 'Admin Login' : 'Login'))}
                            </button>

                            {(activeTab === 'login' && showAdminToggle) && (
                                <div className="mt-6 text-center">
                                    <button type="button" onClick={() => setIsAdmin(!isAdmin)} className="text-xs font-bold text-slate-400 hover:text-slate-600 underline decoration-slate-300">
                                        {isAdmin ? "Switch to Player Login" : "Login as Administrator"}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 🟢 MY PREDICTIONS SIDEBAR (Pivoted Terminology)
const MyBetsSidebar = ({ isOpen, onClose, userId }) => {
    const [bets, setBets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && userId) {
            setLoading(true);
            fetch(`/api/platform/my-bets?user_id=${userId}`)
                .then(res => res.json())
                .then(json => {
                    setBets(json.data || []);
                    setLoading(false);
                });
        }
    }, [isOpen, userId]);

    if (!isOpen) return null;

    return (
        <aside className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white border-l border-slate-200 flex flex-col z-[50] shadow-2xl animate-in slide-in-from-right-8 duration-200">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 bg-slate-900 text-white shadow-sm">
                <span className="font-extrabold uppercase tracking-widest text-sm flex items-center">
                    <svg className="w-4 h-4 mr-2 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    My Predictions
                </span>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4 pb-24">
                {loading ? (
                    <div className="text-center text-xs font-bold text-slate-400 mt-10 uppercase tracking-widest">Loading Data...</div>
                ) : bets.length === 0 ? (
                    <div className="text-center text-xs font-bold text-slate-400 mt-10 uppercase tracking-widest">No Predictions Saved</div>
                ) : (
                    bets.map(bet => (
                        <div key={bet.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500">ID #{bet.id}</span>
                                <span className="text-slate-400 font-semibold">{bet.date}</span>
                            </div>
                            <div className="p-4 space-y-3 border-b border-slate-100">
                                {bet.matches.map((m, i) => (
                                    <div key={i} className="flex justify-between items-center text-sm">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-800">{m.home_team} vs {m.away_team}</span>
                                            <span className="text-[10px] text-slate-500 font-bold uppercase">AI Pick: {m.type}</span>
                                        </div>
                                        <span className="font-black text-slate-700">{m.odds.toFixed(2)}x</span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-slate-50">
                                <div className="flex justify-between text-xs mb-1 text-slate-500 font-bold">
                                    <span>Model Multiplier:</span>
                                    <span>{bet.total_odds.toFixed(2)}x</span>
                                </div>
                                <div className="flex justify-between text-xs mb-3 text-slate-500 font-bold">
                                    <span>Tokens Risked:</span>
                                    <span>{Math.round(bet.stake).toLocaleString()} Pts</span>
                                </div>
                                <div className="flex justify-between text-sm items-end border-t border-slate-200 pt-2">
                                    <span className="text-slate-800 font-extrabold uppercase text-[10px] tracking-wider">Projected Output</span>
                                    <span className="font-black text-emerald-600 text-base">{Math.round(bet.potential_payout).toLocaleString()} Pts</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
};

const AdminDashboard = ({ onExit }) => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        fetch('/api/platform/admin-stats')
            .then(res => res.json())
            .then(data => setStats(data));
    }, []);

    if (!stats) return <div className="flex h-screen w-full items-center justify-center bg-slate-50"><div className="animate-pulse text-emerald-600 font-bold tracking-widest text-sm">FETCHING...</div></div>;

    return (
        <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans">
            <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col z-20">
                <div className="h-16 flex items-center px-6 border-b border-slate-800">
                    <span className="text-lg font-black tracking-tight text-white uppercase">PalBet <span className="text-emerald-400">Admin</span></span>
                </div>
                <div className="p-4 border-t border-slate-800 mt-auto">
                    <button onClick={onExit} className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold transition">
                        <span>Return to Live Site</span>
                    </button>
                </div>
            </aside>
            <main className="flex-1 overflow-y-auto p-8">
                <h1 className="text-xl font-bold text-slate-800 mb-6">Performance Overview</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Accounts</span>
                        <span className="text-3xl font-black text-slate-800">{stats.totalAccounts.toLocaleString()}</span>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Currently Logged In</span>
                        <span className="text-3xl font-black text-slate-800">{stats.loggedIn}</span>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Live Activity Stream</h3>
                    <div className="space-y-4">
                        {stats.activityFeed.map((log, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${log.color}`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-700">{log.phone}</span>
                                        <span className="text-[10px] font-semibold text-slate-400">{log.action}</span>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-slate-400">{log.time}</span>
                            </div>
                        ))}
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
    const [activeSportKey, setActiveSportKey] = useState('soccer_epl');
    const [activeSportName, setActiveSportName] = useState('Premier League (EPL)');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDate, setSelectedDate] = useState('All');
    
    // Auth & View State
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null); 
    const [currentView, setCurrentView] = useState('main');

    // Mobile States
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSlipOpen, setIsMobileSlipOpen] = useState(false);

    // AI Prediction State
    const [betSlip, setBetSlip] = useState([]);
    const [stakeAmount, setStakeAmount] = useState(100); 
    const [isBetting, setIsBetting] = useState(false);
    const [isMyBetsOpen, setIsMyBetsOpen] = useState(false); 

    const fetchMenu = () => {
        fetch('/api/risk-analysis?action=menu')
            .then(res => res.json())
            .then(json => setCategories(json.data || []))
            .catch(err => console.error(err));
    };

    useEffect(() => {
        fetch('/api/platform/track'); 
        fetchMenu();
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

    const toggleCategory = (catName) => {
        setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
    };

    const handleToggleBet = (match, type, odds) => {
        if (!odds) return; 
        const matchId = `${match.home_team}-${match.away_team}`;
        setBetSlip(prev => {
            const existing = prev.find(b => b.matchId === matchId);
            if (existing && existing.type === type) return prev.filter(b => b.matchId !== matchId); 
            const newBet = { matchId, home_team: match.home_team, away_team: match.away_team, type, odds };
            if (existing) return prev.map(b => b.matchId === matchId ? newBet : b); 
            return [...prev, newBet]; 
        });
    };

    const isBetSelected = (match, type) => {
        return betSlip.some(b => b.matchId === `${match.home_team}-${match.away_team}` && b.type === type);
    };

    const totalOdds = betSlip.reduce((acc, bet) => acc * bet.odds, 1).toFixed(2);
    const potentialPayout = stakeAmount * totalOdds;

    const handlePlaceBet = async () => {
        if (!currentUser) {
            setIsAuthOpen(true);
            return;
        }
        setIsBetting(true);

        try {
            const res = await fetch('/api/platform/bet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: currentUser.phone,
                    stake: stakeAmount, 
                    totalOdds: parseFloat(totalOdds),
                    potentialPayout: potentialPayout,
                    slip: betSlip
                })
            });
            const result = await res.json();
            if (result.error) {
                alert(result.error);
            } else {
                setCurrentUser(prev => ({ ...prev, balanceUsd: result.newBalance }));
                setBetSlip([]);
                setIsMobileSlipOpen(false);
                setIsMyBetsOpen(true); 
            }
        } catch (err) {
            console.error(err);
            alert("Connection error. Please try again.");
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
        if (selectedDate !== 'All') list = list.filter(m => m.date_str === selectedDate);
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            list = list.filter(m => (m.home_team?.toLowerCase().includes(q)) || (m.away_team?.toLowerCase().includes(q)) || (m.bookmaker?.toLowerCase().includes(q)));
        }
        return list;
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

    if (currentView === 'admin') return <AdminDashboard onExit={() => setCurrentView('main')} />;

    return (
        <div className="flex h-screen bg-[#F4F6F9] text-slate-900 antialiased font-sans relative overflow-hidden pb-16 md:pb-0">
            
            <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLogin={(userData) => setCurrentUser(userData)} />
            <MyBetsSidebar isOpen={isMyBetsOpen} onClose={() => setIsMyBetsOpen(false)} userId={currentUser?.id} />

            {/* 🟢 MOBILE COMPATIBLE LEFT SIDEBAR */}
            <aside className={`${isMobileMenuOpen ? 'fixed inset-0 z-40 bg-white' : 'hidden'} md:flex md:w-80 bg-white border-r border-slate-200 flex-col z-20 shadow-sm shrink-0`}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                        <span className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">
                            PalBet <span className="text-emerald-500">AI</span>
                        </span>
                    </div>
                    {/* Mobile Close Button */}
                    <button className="md:hidden text-slate-500 p-2" onClick={() => setIsMobileMenuOpen(false)}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">AI Models & Leagues</div>
                    {categories.map((item) => {
                        const isExpanded = !!expandedCategories[item.category];
                        return (
                            <div key={item.category} className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden transition-all duration-150">
                                <button onClick={() => toggleCategory(item.category)} className={`w-full flex items-center justify-between px-3.5 py-3 text-left transition-colors ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                    <div className="flex items-center space-x-3 truncate">
                                        <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-sm shadow-inner shrink-0">{item.icon}</span>
                                        <span className="text-xs font-bold text-slate-800 tracking-tight truncate">{item.category}</span>
                                    </div>
                                    <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {isExpanded && (
                                    <div className="bg-slate-50/50 border-t border-slate-100 py-1 space-y-0.5">
                                        {item.leagues.map((league) => {
                                            const isActive = activeSportKey === league.key;
                                            return (
                                                <button key={league.key} onClick={() => { setActiveSportKey(league.key); setActiveSportName(league.title); setIsMobileMenuOpen(false); }} className={`w-full flex items-center justify-between px-4 py-2 text-xs font-medium transition text-left ${isActive ? 'bg-emerald-50 text-emerald-700 font-bold border-l-4 border-emerald-500 pl-3' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'}`}>
                                                    <span className="truncate pr-2">{league.title}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-slate-200 z-10 shadow-sm">
                    <div className="h-16 flex items-center justify-between px-4 md:px-8">
                        {/* Mobile Hamburger Trigger */}
                        <div className="flex items-center space-x-3">
                            <button className="md:hidden text-slate-600 p-1" onClick={() => setIsMobileMenuOpen(true)}>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                            </button>
                            <div className="hidden md:block">
                                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{activeSportName}</h1>
                                <p className="text-[10px] text-slate-500 font-medium mt-0.5 uppercase tracking-widest">Predictive Model Interface</p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="hidden md:block w-48 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                            
                            {currentUser ? (
                                <div className="flex items-center space-x-2 md:space-x-4">
                                    {currentUser.role === 'admin' ? (
                                        <button onClick={() => setCurrentView('admin')} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 md:px-4 md:py-2 rounded shadow-sm">Admin</button>
                                    ) : (
                                        <>
                                            <button onClick={() => setIsMyBetsOpen(true)} className="hidden md:flex items-center space-x-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded shadow-sm border border-emerald-200">
                                                <span className="text-xs font-black">My Predictions</span>
                                            </button>
                                            <div className="flex items-center space-x-2 bg-white border border-slate-200 px-2 py-1 md:px-3 rounded shadow-sm">
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Tokens</span>
                                                    <span className="text-xs font-extrabold text-emerald-600">{Math.round(currentUser.balanceUsd).toLocaleString()} Pts</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <button onClick={() => setCurrentUser(null)} className="text-slate-400 hover:text-rose-500">
                                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => setIsAuthOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 md:px-5 md:py-2 rounded shadow-sm">
                                    Login / Register
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="h-12 bg-slate-50/50 border-t border-slate-100 flex items-center px-4 md:px-8 overflow-x-auto space-x-2">
                        {calendarDates.map(date => (
                            <button key={date} onClick={() => setSelectedDate(date)} className={`whitespace-nowrap px-3 md:px-4 py-1.5 rounded-full text-[10px] md:text-xs font-bold transition-colors ${selectedDate === date ? 'bg-slate-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                                {formatDateLabel(date)}
                            </button>
                        ))}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-80 space-y-3">
                            <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Running AI Models...</p>
                        </div>
                    ) : (
                        <div className={`grid grid-cols-1 ${betSlip.length > 0 ? 'lg:grid-cols-1 xl:grid-cols-2' : 'lg:grid-cols-2'} gap-4 md:gap-6 max-w-7xl mx-auto`}>
                            {processedData.map((match, idx) => (
                                <div key={idx} className={`bg-white rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition duration-200 border ${match.is_value_bet ? 'border-emerald-300' : 'border-slate-200'}`}>
                                    
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-slate-500 text-[10px] md:text-xs font-semibold">{formatTime(match.commence_time)}</span>
                                        <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[9px] md:text-[10px] uppercase font-bold border border-slate-200">AI Confidence: High</span>
                                    </div>

                                    <div className="flex items-center justify-between mb-4 md:mb-5">
                                        <div className="flex items-center space-x-2 md:space-x-3 w-2/5">
                                            <img src={match.home_logo} alt="Home" className="w-6 h-6 md:w-9 md:h-9 rounded-full border border-slate-200 shrink-0" />
                                            <h3 className="text-xs md:text-sm font-extrabold text-slate-900 truncate">{match.home_team}</h3>
                                        </div>
                                        
                                        <div className="px-2 py-1 md:px-3 bg-slate-50 border border-slate-200 rounded text-center shrink-0">
                                            <span className="text-[8px] md:text-[9px] text-slate-400 block uppercase font-bold tracking-widest">Score</span>
                                            <span className="text-xs md:text-sm font-black text-slate-800">{match.pred_score}</span>
                                        </div>
                                        
                                        <div className="flex items-center justify-end space-x-2 md:space-x-3 w-2/5">
                                            <h3 className="text-xs md:text-sm font-extrabold text-slate-900 truncate text-right">{match.away_team}</h3>
                                            <img src={match.away_logo} alt="Away" className="w-6 h-6 md:w-9 md:h-9 rounded-full border border-slate-200 shrink-0" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mt-2 mb-3">
                                        <button onClick={() => handleToggleBet(match, '1', match.odds_home)} className={`flex flex-col items-center py-1.5 rounded border transition-colors ${isBetSelected(match, '1') ? 'bg-emerald-500 border-emerald-500 text-white shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                            <span className="text-[9px] md:text-[10px] font-bold opacity-80 mb-0.5">1</span>
                                            <span className="text-xs md:text-sm font-black">{match.odds_home?.toFixed(2)}x</span>
                                        </button>
                                        <button onClick={() => handleToggleBet(match, 'X', match.odds_draw)} disabled={!match.is_soccer} className={`flex flex-col items-center py-1.5 rounded border transition-colors ${!match.is_soccer ? 'opacity-30 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400' : isBetSelected(match, 'X') ? 'bg-emerald-500 border-emerald-500 text-white shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                            <span className="text-[9px] md:text-[10px] font-bold opacity-80 mb-0.5">X</span>
                                            <span className="text-xs md:text-sm font-black">{match.odds_draw ? match.odds_draw.toFixed(2) + 'x' : '-'}</span>
                                        </button>
                                        <button onClick={() => handleToggleBet(match, '2', match.odds_away)} className={`flex flex-col items-center py-1.5 rounded border transition-colors ${isBetSelected(match, '2') ? 'bg-emerald-500 border-emerald-500 text-white shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                            <span className="text-[9px] md:text-[10px] font-bold opacity-80 mb-0.5">2</span>
                                            <span className="text-xs md:text-sm font-black">{match.odds_away?.toFixed(2)}x</span>
                                        </button>
                                    </div>

                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex opacity-75 mb-4 md:mb-5 mt-1">
                                        <div style={{ width: `${match.prob_home * 100}%` }} className="bg-emerald-500"></div>
                                        {match.is_soccer && <div style={{ width: `${match.prob_draw * 100}%` }} className="bg-amber-400"></div>}
                                        <div style={{ width: `${match.prob_away * 100}%` }} className="bg-sky-500"></div>
                                    </div>

                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {/* 🟢 MOBILE BOTTOM NAVIGATION TABS */}
            <div className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-16 z-30 px-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                <button onClick={() => { setIsMobileSlipOpen(false); setIsMyBetsOpen(false); }} className="flex flex-col items-center text-slate-500 hover:text-emerald-500">
                    <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    <span className="text-[9px] font-bold">Matches</span>
                </button>
                <button onClick={() => { if(currentUser) { setIsMyBetsOpen(true); setIsMobileSlipOpen(false); } else { setIsAuthOpen(true); } }} className="flex flex-col items-center text-slate-500 hover:text-emerald-500">
                    <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-[9px] font-bold">History</span>
                </button>
                <button onClick={() => setIsMobileSlipOpen(!isMobileSlipOpen)} className="flex flex-col items-center text-emerald-500 relative">
                    <div className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white">{betSlip.length}</div>
                    <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    <span className="text-[9px] font-bold">Slip</span>
                </button>
            </div>

            {/* 🟢 RESPONSIVE SLIP (Mobile Overlay OR Desktop Sidebar) */}
            {(betSlip.length > 0 || isMobileSlipOpen) && (
                <aside className={`${isMobileSlipOpen ? 'fixed inset-0 pt-16 z-40' : 'hidden md:flex'} w-full md:w-80 bg-white md:border-l border-slate-200 flex flex-col md:z-30 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] md:shrink-0 animate-in slide-in-from-right-8 duration-200`}>
                    <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 bg-slate-900 text-white shadow-sm">
                        <span className="font-extrabold uppercase tracking-widest text-sm flex items-center">
                            Prediction Slip
                        </span>
                        <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{betSlip.length}</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3 pb-32 md:pb-4">
                        {betSlip.map(bet => (
                            <div key={bet.matchId} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative group">
                                <button onClick={() => handleToggleBet(bet, bet.type, bet.odds)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 pr-6 truncate">
                                    {bet.home_team} <span className="text-slate-300 mx-1">vs</span> {bet.away_team}
                                </div>
                                <div className="flex justify-between items-end mt-2">
                                    <span className="text-sm font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">AI: {bet.type}</span>
                                    <span className="text-sm font-black text-emerald-600">{bet.odds.toFixed(2)}x</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="p-5 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] fixed bottom-16 md:relative md:bottom-0 w-full md:w-auto">
                        <div className="flex justify-between text-sm mb-3">
                            <span className="text-slate-500 font-bold">Total Multiplier</span>
                            <span className="font-black text-slate-800 text-lg">{totalOdds}x</span>
                        </div>
                        <div className="flex items-center justify-between mb-4 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 focus-within:border-emerald-500 transition-colors">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Risk Units</span>
                            <div className="flex items-center">
                                <input type="number" value={stakeAmount} onChange={e => setStakeAmount(Number(e.target.value))} className="w-20 text-right bg-transparent outline-none font-black text-slate-800" min="1" />
                                <span className="text-xs font-bold text-slate-400 ml-1">Pts</span>
                            </div>
                        </div>
                        <div className="flex justify-between text-sm mb-5 items-end">
                            <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Projected Output</span>
                            <span className="font-black text-emerald-600 text-xl">{new Intl.NumberFormat().format(potentialPayout.toFixed(0))} Pts</span>
                        </div>
                        
                        <button 
                            onClick={handlePlaceBet}
                            disabled={isBetting || betSlip.length === 0}
                            className={`w-full py-3 rounded-lg font-black shadow-sm transition-colors uppercase tracking-widest text-sm ${isBetting || betSlip.length === 0 ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}
                        >
                            {isBetting ? 'Processing...' : (currentUser ? 'Save Prediction' : 'Login to Save')}
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
    container._reactRoot.render(<React.StrictMode><App /></React.StrictMode>);
}