import React, { useState, useEffect } from 'react';

export default function LiveCompetitions({ schedule, activeLeagueId, onLeagueSelect }) {
    const [expandedCountries, setExpandedCountries] = useState({});

    // Auto-expand the first country when data loads
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
        return <div className="p-4 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Loading global leagues...</div>;
    }

    return (
        <div className="w-full text-slate-900">
            <div className="overflow-y-auto max-h-[75vh] px-1">
                {schedule.map((group) => {
                    const isExpanded = !!expandedCountries[group.country];

                    return (
                        <div key={group.country} className="mb-1">
                            <button
                                type="button"
                                onClick={() => toggleCountry(group.country)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 transition text-left"
                            >
                                <div className="flex items-center space-x-3 truncate">
                                    {group.flag ? (
                                        <img src={group.flag} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-200" />
                                    ) : (
                                        <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[9px] shrink-0 text-slate-500">🌐</span>
                                    )}
                                    <span className="font-extrabold text-slate-700 text-[11px] uppercase tracking-wider truncate">{group.country}</span>
                                </div>
                                <div className="flex items-center space-x-1.5 shrink-0">
                                    <span className="bg-slate-200 text-slate-500 font-black px-1.5 py-0.5 rounded text-[9px]">
                                        {group.total_matches}
                                    </span>
                                    <span className={`text-slate-400 text-[9px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="pl-9 pr-2 py-1 space-y-0.5">
                                    {Object.values(group.leagues).map((league) => (
                                        <button
                                            key={league.id}
                                            onClick={() => onLeagueSelect(league, group.country)}
                                            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-[11px] font-bold transition text-left ${activeLeagueId === league.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                                        >
                                            {league.logo && <img src={league.logo} alt="" className="w-3.5 h-3.5 mr-2.5 object-contain shrink-0 mix-blend-multiply" />}
                                            <span className="truncate">{league.name}</span>
                                            {activeLeagueId === league.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}