import React, { useState, useEffect } from 'react';

// Smart API Router
const API_URL = import.meta.env.DEV ? 'http://127.0.0.1:8000' : 'https://palbet-ai.onrender.com';

export default function Admin({ onClose }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const adminKey = sessionStorage.getItem('admin_key');
        fetch(`${API_URL}/api/platform/admin-stats`, {
            headers: { 'X-Admin-Key': adminKey }
        })
            .catch(err => {
                console.error("Failed to fetch admin stats", err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="min-h-screen bg-[#0B0F15] text-white p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 border-b border-[#202936] pb-6">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-[#2FD3C6] flex items-center justify-center font-black text-[#071013] text-lg">
                            ⚙️
                        </div>
                        <h1 className="text-3xl font-black text-white">System Admin</h1>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="bg-[#202936] hover:bg-[#2a3647] text-sm px-5 py-2.5 rounded-lg font-bold transition-colors"
                    >
                        Return to Platform
                    </button>
                </div>

                {/* Stat Grid */}
                {loading ? (
                    <div className="text-[#2FD3C6] animate-pulse font-bold">Fetching Database Metrics...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <StatCard title="Total Unique Visitors" value={stats?.total_visitors || 0} highlight={true} />
                        <StatCard title="Total Matches Scouted" value={stats?.total_matches || 0} />
                        <StatCard title="Total Matches Scouted" value={stats?.total_matches || 0} />
                        <StatCard title="Active Leagues" value={stats?.active_leagues || 0} />
                        <StatCard title="Value Bets Detected" value={stats?.value_bets || 0} highlight={true} />
                        <StatCard 
                            title="Last Database Sync" 
                            value={stats?.last_updated !== 'Never' ? new Date(stats?.last_updated).toLocaleTimeString() : 'Never'} 
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

const StatCard = ({ title, value, highlight }) => (
    <div className="bg-[#10151D] border border-[#202936] p-6 rounded-xl shadow-lg relative overflow-hidden">
        {highlight && <div className="absolute top-0 left-0 w-full h-1 bg-[#2FD3C6]"></div>}
        <h3 className="text-[#707A8D] text-xs font-black uppercase tracking-wider mb-2">{title}</h3>
        <div className={`text-4xl font-black ${highlight ? 'text-[#2FD3C6]' : 'text-white'}`}>
            {value}
        </div>
    </div>
);