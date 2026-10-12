// Where the Laravel API lives. VITE_API_URL wins; otherwise local dev uses the same origin
// (Vite proxies /api to Laravel, see vite.config.js) and production uses the Render service.
export const API_URL = (
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? '' : 'https://palbet-ai.onrender.com')
).replace(/\/+$/, '');

export class ApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method,
            signal,
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new ApiError('Could not reach the PalBet server. Check your connection and try again.', 0);
    }

    let payload = null;
    try { payload = await response.json(); } catch { /* empty body */ }

    if (!response.ok) {
        const message = response.status === 429
            ? 'Too many requests in a short time. Wait a minute and try again.'
            : payload?.message || payload?.error || `The server returned an error (${response.status}).`;
        throw new ApiError(message, response.status, payload);
    }
    return payload;
}

export const userTimezone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export const getSchedule = (date, signal) =>
    request(`/api/schedule?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(userTimezone())}`, { signal });

export const askAnalyst = (fixtureId, message, history) =>
    request('/api/platform/chat', { method: 'POST', body: { fixture_id: fixtureId, message, history } });

export const getAdminStats = (key) =>
    request('/api/platform/admin-stats', { headers: { 'X-Admin-Key': key } });

/** Count this browser once per session. Only a successful call marks it as counted. */
export function trackVisit() {
    try {
        if (sessionStorage.getItem('pb_tracked')) return;
    } catch { /* storage blocked: still count */ }
    request('/api/platform/track', { method: 'POST' })
        .then(() => { try { sessionStorage.setItem('pb_tracked', '1'); } catch { /* ignore */ } })
        .catch(() => { /* tracking must never affect the visitor */ });
}
