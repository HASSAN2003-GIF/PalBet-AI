import React from 'react';
import MatchRow from './MatchRow';
import { kickoffTime, localISODate, longDate, relativeDayName } from '../lib/format';
import { MIN_QUERY } from '../lib/useMatchSearch';

const STATE_LABEL = { in_play: 'Live now', upcoming: 'Upcoming', finished: 'Results' };

/** Local calendar day of a kickoff, e.g. "Tomorrow, 14 Oct" or "Sat, 17 Oct". */
function dayLabel(iso) {
    const day = localISODate(new Date(iso));
    const short = new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `${relativeDayName(day)}, ${short}`;
}

/** What the server understood from the query, shown as quiet chips: "Tomorrow", "Live now". */
function Interpreted({ interpreted }) {
    if (!interpreted) return null;
    const chips = [];
    if (interpreted.date) chips.push(longDate(interpreted.date));
    if (interpreted.status) chips.push(STATE_LABEL[interpreted.status]);
    if (!chips.length) return null;
    return (
        <span className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
                <span key={c} className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-ink-soft">{c}</span>
            ))}
        </span>
    );
}

function Skeleton() {
    return (
        <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line">
            {[0, 1, 2, 3].map((r) => (
                <div key={r} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
                    <div className="h-4 w-10 animate-pulse rounded bg-line" />
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="h-3 w-28 animate-pulse rounded bg-line" />
                        <div className="h-3.5 w-44 animate-pulse rounded bg-line" />
                        <div className="h-3.5 w-36 animate-pulse rounded bg-line" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function Notice({ title, children, action }) {
    return (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="font-semibold">{title}</p>
            {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
            {action}
        </div>
    );
}

const quietButton = 'mt-4 rounded-full border border-line-strong px-5 py-2 text-sm font-semibold hover:border-ink';

/**
 * Search results in place of the matchday list. Each result is the normal match row (tap to
 * open its detail and the analyst) with a line naming the competition and day, and a link to
 * that day's full list.
 */
export default function SearchResults({ search, expandedId, onToggle, onAsk, onClear, onOpenDay }) {
    const { query, status, results, total, hasMore, truncated, interpreted, error, loadingMore } = search;
    const refreshing = status === 'loading' && results.length > 0;

    let summary = '';
    if (search.tooShort) summary = `Type at least ${MIN_QUERY} characters to search.`;
    else if (status === 'loading' && !results.length) summary = 'Searching…';
    else if (status === 'ready') summary = total === 1 ? '1 match found.' : `${total} matches found.`;

    return (
        <section aria-labelledby="search-title">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 id="search-title" className="semi-cond truncate text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                        {query ? <>Results for “{query}”</> : 'Search'}
                    </h1>
                    <p className="mt-1 text-sm text-muted" aria-live="polite">{summary}</p>
                </div>
                <Interpreted interpreted={interpreted} />
            </div>

            {search.tooShort && (
                <Notice title="Keep typing">Search needs at least {MIN_QUERY} characters, for example a team, a league or a country.</Notice>
            )}

            {status === 'loading' && !results.length && <Skeleton />}

            {status === 'error' && (
                <div role="alert" className="rounded-xl border border-alert/40 bg-paper px-6 py-10 text-center">
                    <p className="font-semibold">The search could not be completed.</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted">{error}</p>
                    <div className="mt-4 flex justify-center gap-2">
                        <button type="button" onClick={search.retry} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-chalk hover:bg-home">
                            Try again
                        </button>
                        <button type="button" onClick={onClear} className="rounded-full border border-line-strong px-5 py-2 text-sm font-semibold hover:border-ink">
                            Clear search
                        </button>
                    </div>
                </div>
            )}

            {status === 'ready' && !results.length && (
                <Notice
                    title={`No matches for “${query}”.`}
                    action={<button type="button" onClick={onClear} className={quietButton}>Clear search</button>}
                >
                    Search covers the past week and the next two weeks. Try part of a team name, a league such as
                    “Premier League”, a country, or add a day like “tomorrow” or “sat”.
                </Notice>
            )}

            {results.length > 0 && (
                <div className={refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={refreshing || undefined}>
                    <ul className="overflow-hidden rounded-xl border border-line bg-chalk">
                        {results.map(({ match, competition }) => (
                            <MatchRow
                                key={match.id}
                                match={match}
                                expanded={expandedId === match.id}
                                onToggle={() => onToggle(match.id)}
                                onAsk={(m) => onAsk(m, competition)}
                                headline={
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pt-3 text-xs sm:px-5">
                                        <span className="min-w-0 truncate text-muted">
                                            <span className="font-semibold text-ink-soft">{competition.name}</span>
                                            {', '}{competition.region} · {dayLabel(match.kickoff)} at {kickoffTime(match.kickoff)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onOpenDay(localISODate(new Date(match.kickoff)), match.id)}
                                            className="shrink-0 font-semibold text-ink-soft underline decoration-line-strong underline-offset-2 hover:text-home"
                                        >
                                            Open day
                                        </button>
                                    </div>
                                }
                            />
                        ))}
                    </ul>

                    {(hasMore || truncated || error) && (
                        <div className="mt-4 flex flex-col items-center gap-2 text-center">
                            {hasMore && (
                                <button type="button" onClick={search.loadMore} disabled={loadingMore} className={`${quietButton} mt-0 disabled:opacity-50`}>
                                    {loadingMore ? 'Loading…' : `Show more (${total - results.length} left)`}
                                </button>
                            )}
                            {error && status === 'ready' && <p role="alert" className="text-sm text-alert">{error}</p>}
                            {truncated && !hasMore && (
                                <p className="text-xs text-muted">Showing the first {results.length} matches. Add a day or a team to narrow the search.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
