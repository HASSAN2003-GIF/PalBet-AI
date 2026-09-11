import React, { useState, useEffect } from 'react';

export default function LiveCompetitions({ data, activeLeagueId, onSelect }) {
    const [expandedSport, setExpandedSport] = useState('');
    const [expandedCategory, setExpandedCategory] = useState('');

    useEffect(() => {
        if (data?.length > 0 && !expandedSport) {
            setExpandedSport(data[0].sport);
            setExpandedCategory(data[0].categories[0]?.name || '');
        }
    }, [data]);

    if (!data || data.length === 0) return <div className="p-4 text-xs text-[#707A8D] font-bold uppercase text-center">Loading Data...</div>;

    return (
        <div className="w-full text-sm text-[#8B95A7] px-2 py-2">
            {data.map(sport => (
                <div key={sport.sport} className="mb-2">
                    {/* TIER 1: SPORT */}
                    <button onClick={() => setExpandedSport(sport.sport === expandedSport ? '' : sport.sport)}
                            className={`w-full flex justify-between items-center px-4 py-2.5 rounded-xl font-bold transition ${expandedSport === sport.sport ? 'bg-[#1E293B] text-white' : 'hover:bg-[#151B24]'}`}>
                        <span className="uppercase tracking-wider text-xs">{sport.sport}</span>
                        <span className={`text-[10px] transition-transform ${expandedSport === sport.sport ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {expandedSport === sport.sport && (
                        <div className="mt-1 space-y-1">
                            {sport.categories.map(cat => (
                                <div key={cat.name} className="bg-[#10151D] rounded-lg overflow-hidden border border-[#202936]">
                                    {/* TIER 2: COUNTRY/REGION */}
                                    <button onClick={() => setExpandedCategory(cat.name === expandedCategory ? '' : cat.name)}
                                            className="w-full flex justify-between items-center px-3 py-2 hover:bg-[#151B24] transition">
                                        <div className="flex gap-2 items-center truncate">
                                            {cat.flag ? <img src={cat.flag} className="w-3.5 h-3.5 rounded-full object-cover border border-[#202936] shrink-0"/> : <span className="text-[10px]">🌍</span>}
                                            <span className="text-xs font-semibold text-white truncate">{cat.name}</span>
                                        </div>
                                        <span className="text-[9px] font-black bg-[#1A222D] text-[#707A8D] px-1.5 py-0.5 rounded">{cat.total_matches}</span>
                                    </button>

                                    {/* TIER 3: LEAGUES */}
                                    {expandedCategory === cat.name && (
                                        <div className="bg-[#0B0F15] px-2 py-1.5 border-t border-[#202936] space-y-0.5">
                                            {cat.leagues.map(league => {
                                                const isActive = activeLeagueId === league.id;
                                                return (
                                                    <button key={league.id} onClick={() => onSelect(sport.sport, cat.name, league)}
                                                            className={`w-full text-left px-2 py-1.5 text-[11px] font-bold rounded transition ${isActive ? 'text-[#2FD3C6] bg-[#2FD3C6]/10' : 'text-[#8B95A7] hover:text-white hover:bg-[#151B24]'}`}>
                                                        <div className="flex justify-between items-center">
                                                            <span className="truncate">{league.name}</span>
                                                            <span className="opacity-50 font-medium">{league.matches?.length}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}