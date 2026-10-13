import { useSyncExternalStore } from 'react';

/*
 * Light / dark theme.
 *
 * - An explicit choice is stored under STORAGE_KEY and always wins.
 * - Without one, the operating system's setting is followed, live.
 * - index.html applies the same rule in an inline script before the first paint, so the
 *   page never flashes the wrong theme; this module keeps it in sync afterwards.
 * - Storage can be blocked (private mode, strict settings): the theme still works for the
 *   visit, it just isn't remembered.
 */
export const STORAGE_KEY = 'pp_theme';
const THEMES = ['light', 'dark'];
const META_COLOR = { light: '#F1F3EE', dark: '#0D1411' };
const listeners = new Set();

export function storedTheme() {
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        return THEMES.includes(v) ? v : null;
    } catch {
        return null;
    }
}

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export const systemTheme = () => (media()?.matches ? 'dark' : 'light');

export const resolvedTheme = () => storedTheme() ?? systemTheme();

export function applyTheme(theme) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', META_COLOR[theme]));
}

let current = typeof document !== 'undefined' ? (document.documentElement.dataset.theme || resolvedTheme()) : 'light';

function emit(theme) {
    current = theme;
    applyTheme(theme);
    listeners.forEach((fn) => fn());
}

/** Explicit choice from the toggle: remembered, and no longer follows the system. */
export function setTheme(theme) {
    if (!THEMES.includes(theme)) return;
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* not remembered, still applied */ }
    emit(theme);
}

if (typeof window !== 'undefined') {
    // Follow the system only while the visitor has not chosen.
    media()?.addEventListener?.('change', () => { if (!storedTheme()) emit(systemTheme()); });
    // Another tab changed the choice.
    window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) emit(resolvedTheme()); });
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function useTheme() {
    const theme = useSyncExternalStore(subscribe, () => current, () => 'light');
    return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
