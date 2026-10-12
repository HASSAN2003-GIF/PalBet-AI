// Where the Laravel API lives. VITE_API_URL wins; otherwise local dev uses the same origin
// (Vite proxies /api to Laravel, see vite.config.js) and production uses the Render service.
const DEFAULT_API = import.meta.env.DEV ? '' : 'https://palbet-ai.onrender.com';

/** Pull a clean origin out of VITE_API_URL, which may have been pasted as a markdown link,
 *  in quotes, or with a trailing /api. Anything unusable falls back to the default. */
export function resolveApiUrl(raw, fallback = DEFAULT_API) {
    const match = String(raw || '').match(/https?:\/\/[^\s\])"'<>]+/i);
    if (!match) return fallback;
    try {
        const url = new URL(match[0]);
        return `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\/api$/i, '')}`;
    } catch {
        return fallback;
    }
}

export const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL);

export class ApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}

// ---------------------------------------------------------------- sign-in token
const TOKEN_KEY = 'pb_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
    let response;
    const token = getToken();
    try {
        response = await fetch(`${API_URL}${path}`, {
            method,
            signal,
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new ApiError('Could not reach PAL-PREDICT. Check your connection and try again.', 0);
    }

    let payload = null;
    try { payload = await response.json(); } catch { /* empty body */ }

    if (!response.ok) {
        // Validation errors: show the first field message rather than Laravel's summary line.
        const firstFieldError = payload?.errors && Object.values(payload.errors)[0]?.[0];
        const message = response.status === 429
            ? 'Too many requests in a short time. Wait a minute and try again.'
            : firstFieldError || payload?.message || payload?.error || `The server returned an error (${response.status}).`;
        throw new ApiError(message, response.status, payload);
    }
    return payload;
}

export const userTimezone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export const getSchedule = (date, signal) =>
    request(`/api/schedule?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(userTimezone())}`, { signal });

export const getTrackRecord = (days, signal) => request(`/api/track-record?days=${days}`, { signal });

export const askAnalyst = (fixtureId, message, history) =>
    request('/api/platform/chat', { method: 'POST', body: { fixture_id: fixtureId, message, history } });

// ---------------------------------------------------------------- accounts + slips
export const register = (name, email, password, adult) =>
    request('/api/auth/register', { method: 'POST', body: { name, email, password, adult } });
export const login = (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } });
export const logout = () => request('/api/auth/logout', { method: 'POST' });
export const getMe = () => request('/api/me');
export const getSlips = () => request('/api/slips');
export const placeSlip = (stake, selections) => request('/api/slips', { method: 'POST', body: { stake, selections } });

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
