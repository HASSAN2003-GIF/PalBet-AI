import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSport, setActiveSport] = useState('Football');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const sports = ['Football', 'Basketball', 'Tennis', 'Cricket', 'Field Hockey'];

    // Fetch initial data (Currently our Python script)
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = () => {
        setLoading(true);
        fetch('/api/risk-analysis')
            .then(response => response.json())
            .then(json => {
                setData(json.data);
                setLoading(false);
            })
            .catch(error => console.error("Error fetching data:", error));
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery) return;
        
        setIsSearching(true);
        // Simulate an AI API call delay
        setTimeout(() => {
            setIsSearching(false);
            // In the future, this will update 'data' with the search results
        }, 1500);
    };

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-slate-800">
                    <span className="text-xl font-bold tracking-tight text-white">PalBet <span className="text-emerald-400">AI</span></span>
                </div>
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Markets</div>
                    {sports.map(sport => (
                        <button
                            key={sport}
                            onClick={() => setActiveSport(sport)}
                            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSport === sport 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : 'hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            {sport}
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header & Search */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
                    <h1 className="text-xl font-semibold text-slate-800">{activeSport} Analysis</h1>
                    
                    <form onSubmit={handleSearch} className="flex w-full max-w-lg items-center relative">
                        <input
                            type="text"
                            placeholder="Ask AI to analyze a match, team, or league..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-100 border-transparent rounded-full py-2 pl-4 pr-24 text-sm focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200 transition-all outline-none"
                        />
                        <button 
                            type="submit"
                            disabled={isSearching}
                            className="absolute right-1 top-1 bottom-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 rounded-full transition-colors disabled:opacity-50"
                        >
                            {isSearching ? 'Analyzing...' : 'Search'}
                        </button>
                    </form>
                </header>

                {/* Dashboard Area */}
                <main className="flex-1 overflow-y-auto p-8">
                    {loading || isSearching ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-4">
                            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-slate-500 font-medium">
                                {isSearching ? 'AI is gathering live odds and stats...' : 'Loading market data...'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
                            {data.map((match, index) => (
                                <div
                                    key={index}
                                    className={`relative bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-all ${
                                        match.is_value_bet ? 'border-emerald-200' : 'border-slate-200'
                                    }`}
                                >
                                    {match.is_value_bet && (
                                        <div className="absolute -top-3 -right-3">
                                            <span className="flex items-center justify-center px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full shadow-sm">
                                                Value Found
                                            </span>
                                        </div>
                                    )}

                                    <div className="mb-5">
                                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                            {activeSport} • Upcoming
                                        </div>
                                        <h2 className="text-lg font-bold text-slate-900">{match.match}</h2>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Implied Odds</div>
                                            <div className="font-mono font-semibold text-slate-900">{match.odds}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">True Probability</div>
                                            <div className="font-mono font-semibold text-slate-900">{(match.model_prob * 100).toFixed(1)}%</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Calculated Edge</div>
                                            <div className={`font-mono font-bold ${match.edge > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {match.edge > 0 ? '+' : ''}{(match.edge * 100).toFixed(2)}%
                                            </div>
                                        </div>
                                    </div>

                                    {match.is_value_bet ? (
                                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                            <span className="text-sm font-medium text-slate-600">Recommended Action</span>
                                            <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                                                Risk ${match.stake.toFixed(2)} (Quarter-Kelly)
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                            <span className="text-sm font-medium text-slate-600">Recommended Action</span>
                                            <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                                                Pass (Negative EV)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

const rootElement = document.getElementById('app');

if (rootElement) {
    createRoot(rootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}