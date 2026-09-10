import React, { useState, useEffect } from 'react';

export default function LiveCompetitions({ schedule, activeLeagueId, onLeagueSelect }) {
    const [expandedCountries, setExpandedCountries] = useState({});

    // Auto-expand the first category on initial load
    useEffect(() => {
        if (schedule?.length > 0 && Object.keys(expandedCountries).length === 0) {
            setExpandedCountries({ [schedule[0].country]: true });
        }
    }, [schedule]);

    const toggleCountry = (countryName) => {
        setExpandedCountries(prev => ({
            ...prev,
            [countryName]: !prev[countryName]
        }));
    };

    if (!schedule || schedule.length === 0) {
        return (
            <div className="p-5 text-[11px] text-[#707A8D] font-bold uppercase tracking-wider text-center">
                Loading competitions…
            </div>
        );
    }

    return (
        <div className="w-full text-[#F5F7FA] overflow-y-auto px-2 py-3 space-y-1">
            {schedule.map((group) => {
                const isExpanded = !!expandedCountries[group.country];
                const leaguesList = Object.values(group.leagues || {});

                return (
                    <div key={group.country} className="rounded-xl overflow-hidden bg-[#10151D] border border-[#202936] mb-1.5 transition-all">
                        <button
                            type="button"
                            onClick={() => toggleCountry(group.country)}
                            className="w-full flex items-center justify-between p-3 hover:bg-[#151B24] transition text-left"
                        >
                            <div className="flex items-center gap-3 truncate">
                                {group.flag ? (
                                    <img src={group.flag} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 border border-white/10" />
                                ) : (
                                    <span className="w-4 h-4 rounded-full bg-[#1A222D] flex items-center justify-center text-[10px] shrink-0 text-[#2FD3C6]">
                                        🌐
                                    </span>
                                )}
                                <span className="font-extrabold text-[#F5F7FA] text-xs uppercase tracking-wider truncate">
                                    {group.country}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="bg-[#1A222D] text-[#8B95A7] font-black px-2 py-0.5 rounded-md text-[10px]">
                                    {group.total_matches}
                                </span>
                                <span className={`text-[#535D70] text-[10px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                    ▼
                                </span>
                            </div>
                        </button>

                        {isExpanded && (
                            <div className="bg-[#0B0F15] px-2 py-1.5 space-y-1 border-t border-[#202936]">
                                {leaguesList.map((league) => {
                                    const isActive = activeLeagueId === league.id;
                                    return (
                                        <button
                                            key={league.id}
                                            type="button"
                                            onClick={() => onLeagueSelect(league, group.country)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition text-left ${
                                                isActive
                                                    ? 'bg-[#2FD3C6]/15 text-[#2FD3C6] border border-[#2FD3C6]/30'
                                                    : 'text-[#8B95A7] hover:bg-[#151B24] hover:text-white'
                                            }`}
                                        >
                                            <span className="truncate">{league.name}</span>
                                            <span className="text-[10px] font-medium opacity-60">
                                                {league.matches?.length || 0}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}