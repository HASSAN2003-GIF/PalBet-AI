import React from 'react';
import { useTheme } from '../lib/theme';

/**
 * Light / dark switch. Shows the theme you would switch TO (moon in light mode, sun in dark
 * mode), the common convention; the accessible name and pressed state say which is active.
 */
export default function ThemeToggle({ className = '' }) {
    const { theme, toggle } = useTheme();
    const dark = theme === 'dark';

    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={dark}
            aria-label="Dark theme"
            title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft ring-1 ring-line-strong transition-colors hover:text-ink hover:ring-ink ${className}`}
        >
            {dark ? (
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
                    <circle cx="10" cy="10" r="3.6" fill="currentColor" />
                    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5" />
                    </g>
                </svg>
            ) : (
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
                    <path d="M16.6 12.4A7 7 0 0 1 7.6 3.4a7 7 0 1 0 9 9z" fill="currentColor" />
                </svg>
            )}
        </button>
    );
}
