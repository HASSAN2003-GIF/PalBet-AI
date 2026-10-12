/** YYYY-MM-DD for a Date in the viewer's local timezone. */
export function localISODate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function addDays(isoDate, n) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return localISODate(new Date(y, m - 1, d + n));
}

function dateFromISO(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** "Today", "Tomorrow", "Yesterday" or a short weekday. */
export function relativeDayName(isoDate) {
    const today = localISODate();
    if (isoDate === today) return 'Today';
    if (isoDate === addDays(today, 1)) return 'Tomorrow';
    if (isoDate === addDays(today, -1)) return 'Yesterday';
    return dateFromISO(isoDate).toLocaleDateString(undefined, { weekday: 'short' });
}

export const dayOfMonth = (isoDate) => dateFromISO(isoDate).getDate();

export const longDate = (isoDate) =>
    dateFromISO(isoDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export const kickoffTime = (iso) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

export const percent = (fraction, digits = 1) =>
    `${(fraction * 100).toFixed(digits).replace(/\.0$/, '')}%`;

export const price = (p) => (p == null ? '–' : Number(p).toFixed(2));

/** "3 hours ago", "10 days ago" from an ISO timestamp. */
export function timeAgo(iso) {
    if (!iso) return null;
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute');
    if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour');
    return rtf.format(-Math.round(seconds / 86400), 'day');
}

export const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3.6e6 : Infinity);

/** Name of the outcome as a person would say it. */
export function outcomeName(match, outcome) {
    if (outcome === 'home') return match.home.name;
    if (outcome === 'away') return match.away.name;
    return 'Draw';
}

/** The outcome the model rates most likely. */
export function favourite(match) {
    const p = match.probabilities;
    const entries = [['home', p.home], ['draw', p.draw ?? -1], ['away', p.away]];
    return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}
