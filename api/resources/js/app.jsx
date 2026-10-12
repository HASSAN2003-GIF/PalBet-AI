import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import LiveCompetitions from './LiveCompetitions';
import Admin from './Admin';
import MatchRow from './components/MatchRow';
import ValueBoard from './components/ValueBoard';
import AnalystPanel from './components/AnalystPanel';
import TrackRecord from './components/TrackRecord';
import { getSchedule, trackVisit } from './lib/api';
import { addDays, dayOfMonth, hoursSince, localISODate, longDate, relativeDayName, timeAgo } from './lib/format';

// ---------------------------------------------------------------- URL state
// date, view and competition live in the query string so a view can be shared or refreshed.
function readUrlState() {
    const q = new URLSearchParams(window.location.search);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : localISODate();
    return { date, view: q.get('view') === 'value' ? 'value' : 'all', competition: q.get('c') || null };
}

function writeUrlState({ date, view, competition }) {
    const q = new URLSearchParams();
    if (date !== localISODate()) q.set('date', date);
    if (view === 'value') q.set('view', 'value');
    if (competition) q.set('c', competition);
    const qs = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
}

// ---------------------------------------------------------------- pieces
function Wordmark() {
    return (
        <a href="/" className="flex items-center gap-2 text-ink" aria-label="PalBet AI home">
            <i className="yellow-card text-xl" aria-hidden="true" />
            <span className="wide text-lg font-extrabold tracking-tight">PalBet AI</span>
        </a>
    );
}

function DateStrip({ selected, onSelect }) {
    const today = localISODate();
    const days = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(today, i - 1)), [today]);

    return (
        <nav aria-label="Choose a day" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ol className="flex gap-1">
                {days.map((d) => {
                    const active = d === selected;
                    return (
                        <li key={d}>
                            <button
                                type="button"
                                onClick={() => onSelect(d)}
                                aria-current={active ? 'date' : undefined}
                                aria-label={longDate(d)}
                                className={`flex w-14 flex-col items-center rounded-lg py-1.5 transition-colors ${
                                    active ? 'bg-ink text-chalk' : 'text-ink-soft hover:bg-paper hover:text-ink'
                                }`}
                            >
                                <span className="text-[11px] leading-tight">{relativeDayName(d)}</span>
                                <span className="cond nums text-xl font-bold leading-tight">{dayOfMonth(d)}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

function ViewToggle({ view, onChange, valueCount }) {
    const options = [
        { key: 'all', label: 'All matches' },
        { key: 'value', label: 'Value prices', count: valueCount },
    ];
    return (
        <div role="tablist" aria-label="What to show" className="inline-flex rounded-full border border-line-strong bg-paper p-1">
            {options.map((o) => (
                <button
                    key={o.key}
                    type="button"
                    role="tab"
                    aria-selected={view === o.key}
                    onClick={() => onChange(o.key)}
                    className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        view === o.key ? 'bg-ink text-chalk' : 'text-ink-soft hover:text-ink'
                    }`}
                >
                    {o.key === 'value' && <i className="yellow-card text-[12px]" aria-hidden="true" />}
                    {o.label}
                    {o.count != null && <span className="cond nums font-bold">{o.count}</span>}
                </button>
            ))}
        </div>
    );
}

function DaySummary({ data }) {
    const { matches, competitions, value } = data.summary;
    if (!matches) return null;
    const parts = [
        `${matches} ${matches === 1 ? 'match' : 'matches'} in ${competitions} ${competitions === 1 ? 'competition' : 'competitions'}`,
        value ? `${value} with a value price` : 'no value prices',
    ];
    return <p className="mt-1 text-sm text-muted">{parts.join(', ')}.</p>;
}

function StaleNotice({ lastRun }) {
    if (!lastRun || hoursSince(lastRun) < 12) return null;
    return (
        <p className="mt-4 rounded-lg border border-line-strong bg-paper px-4 py-3 text-sm text-ink-soft">
            Prices were last updated {timeAgo(lastRun)}. Bookmaker odds move, so treat these numbers as a snapshot from then.
        </p>
    );
}

function LoadingState() {
    return (
        <div aria-busy="true" aria-label="Loading matches" className="flex flex-col gap-8">
            {[4, 3, 2].map((rows, s) => (
                <div key={s}>
                    <div className="mb-3 h-5 w-48 animate-pulse rounded bg-line" />
                    <div className="overflow-hidden rounded-xl border border-line">
                        {Array.from({ length: rows }).map((_, r) => (
                            <div key={r} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
                                <div className="h-4 w-10 animate-pulse rounded bg-line" />
                                <div className="flex flex-1 flex-col gap-2">
                                    <div className="h-3.5 w-40 animate-pulse rounded bg-line" />
                                    <div className="h-3.5 w-32 animate-pulse rounded bg-line" />
                                </div>
                                <div className="hidden h-2 w-52 animate-pulse rounded-full bg-line sm:block" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ErrorState({ message, onRetry }) {
    return (
        <div role="alert" className="rounded-xl border border-alert/40 bg-paper px-6 py-10 text-center">
            <p className="font-semibold">The matches didn't load.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
            <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-chalk hover:bg-home">
                Try again
            </button>
        </div>
    );
}

function EmptyDay({ date, onNextDay }) {
    return (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="font-semibold">No matches on {longDate(date)}.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                The engine hasn't priced any fixtures for this day yet.
            </p>
            <button type="button" onClick={onNextDay} className="mt-4 rounded-full border border-line-strong px-5 py-2 text-sm font-semibold hover:border-ink">
                Show the next day
            </button>
        </div>
    );
}

function CompetitionSection({ competition, expandedId, onToggle, onAsk, animate }) {
    return (
        <section aria-labelledby={`comp-${competition.key}`}>
            <header className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h2 id={`comp-${competition.key}`} className="flex min-w-0 items-baseline gap-2">
                    <span className="semi-cond truncate text-lg font-bold">{competition.name}</span>
                    <span className="shrink-0 text-sm text-muted">{competition.region}</span>
                </h2>
                {competition.value_count > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-card-ink">
                        <i className="yellow-card text-[12px]" aria-hidden="true" />
                        {competition.value_count} value
                    </span>
                )}
            </header>
            <ul className="overflow-hidden rounded-xl border border-line bg-chalk">
                {competition.matches.map((m) => (
                    <MatchRow
                        key={m.id}
                        match={m}
                        expanded={expandedId === m.id}
                        onToggle={() => onToggle(m.id)}
                        onAsk={onAsk}
                        animate={animate}
                    />
                ))}
            </ul>
        </section>
    );
}

// ---------------------------------------------------------------- app
function Matchday() {
    const initial = useMemo(readUrlState, []);
    const [date, setDate] = useState(initial.date);
    const [view, setView] = useState(initial.view);
    const [competitionKey, setCompetitionKey] = useState(initial.competition);
    const [data, setData] = useState(null);
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState(null);
    const [reload, setReload] = useState(0);
    const [expandedId, setExpandedId] = useState(null);
    const [chatMatch, setChatMatch] = useState(null);

    useEffect(() => { writeUrlState({ date, view, competition: competitionKey }); }, [date, view, competitionKey]);

    useEffect(() => {
        const controller = new AbortController();
        setStatus('loading');
        setExpandedId(null);
        getSchedule(date, controller.signal)
            .then((payload) => { setData(payload); setStatus('ready'); })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setError(err.message);
                setStatus('error');
            });
        return () => controller.abort();
    }, [date, reload]);

    const competitions = data?.competitions ?? [];
    // A competition filter from the URL may not play on the newly chosen day.
    const activeKey = competitions.some((c) => c.key === competitionKey) ? competitionKey : null;
    const visible = activeKey ? competitions.filter((c) => c.key === activeKey) : competitions;
    const visibleValue = visible.reduce((n, c) => n + c.value_count, 0);

    const toggle = useCallback((id) => setExpandedId((cur) => (cur === id ? null : id)), []);
    const chatCompetition = chatMatch ? competitions.find((c) => c.key === chatMatch.competition_key) : null;

    return (
        <>
            <div className="border-b border-line">
                <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
                    <DateStrip selected={date} onSelect={(d) => setDate(d)} />
                </div>
            </div>

            <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
                <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
                    {status === 'ready' && (
                        <LiveCompetitions
                            competitions={competitions}
                            summary={data.summary}
                            activeKey={activeKey}
                            onSelect={setCompetitionKey}
                        />
                    )}
                </aside>

                <main id="main" className="min-w-0">
                    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h1 className="semi-cond text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{longDate(date)}</h1>
                            {status === 'ready' && <DaySummary data={data} />}
                        </div>
                        {status === 'ready' && data.summary.matches > 0 && (
                            <ViewToggle view={view} onChange={setView} valueCount={visibleValue} />
                        )}
                    </div>

                    {status === 'ready' && <StaleNotice lastRun={data.last_engine_run} />}

                    <div className="mt-6">
                        {status === 'loading' && <LoadingState />}
                        {status === 'error' && <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />}
                        {status === 'ready' && data.summary.matches === 0 && <EmptyDay date={date} onNextDay={() => setDate(addDays(date, 1))} />}
                        {status === 'ready' && data.summary.matches > 0 && (
                            view === 'value' ? (
                                <ValueBoard competitions={visible} expandedId={expandedId} onToggle={toggle} onAsk={setChatMatch} animate />
                            ) : (
                                <div className="flex flex-col gap-8">
                                    {visible.map((c) => (
                                        <CompetitionSection key={c.key} competition={c} expandedId={expandedId} onToggle={toggle} onAsk={setChatMatch} animate />
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </main>
            </div>

            {chatMatch && <AnalystPanel match={chatMatch} competition={chatCompetition} onClose={() => setChatMatch(null)} />}
        </>
    );
}

// ---------------------------------------------------------------- shell
const ROUTES = { '': 'matches', '#record': 'record', '#admin': 'admin' };
const routeFromHash = () => ROUTES[window.location.hash] ?? 'matches';

function SiteHeader({ route }) {
    const links = [
        { href: '#', route: 'matches', label: 'Matches' },
        { href: '#record', route: 'record', label: 'Track record' },
    ];
    return (
        <header className="sticky top-0 z-30 border-b border-line bg-chalk/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                <Wordmark />
                <nav aria-label="Main" className="flex items-center gap-1 text-sm">
                    {links.map((l) => (
                        <a
                            key={l.route}
                            href={l.href}
                            aria-current={route === l.route ? 'page' : undefined}
                            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                                route === l.route ? 'bg-ink text-chalk' : 'text-ink-soft hover:text-ink'
                            }`}
                        >
                            {l.label}
                        </a>
                    ))}
                </nav>
            </div>
        </header>
    );
}

function SiteFooter() {
    return (
        <footer className="border-t border-line">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <p className="max-w-2xl leading-relaxed">
                    Win chances come from many bookmakers' prices with their margin removed. They are estimates, not promises.
                    A value price is one priced better than the market thinks it's worth; it can still lose.
                    For adults 18+. Never stake money you can't afford to lose.
                </p>
                <a href="#admin" className="shrink-0 underline decoration-line-strong underline-offset-4 hover:text-ink">Admin</a>
            </div>
        </footer>
    );
}

function App() {
    const [route, setRoute] = useState(routeFromHash);

    useEffect(() => {
        trackVisit();
        const onHash = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    if (route === 'admin') {
        return <Admin onClose={() => { window.location.hash = ''; }} />;
    }

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader route={route} />
            <div className="flex-1">
                {route === 'record' ? <TrackRecord /> : <Matchday />}
            </div>
            <SiteFooter />
            <Analytics />
        </div>
    );
}

const container = document.getElementById('app');
if (container && !container._reactRoot) {
    container._reactRoot = createRoot(container);
    container._reactRoot.render(<React.StrictMode><App /></React.StrictMode>);
}
