import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const isTypingTarget = (el) =>
    el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * The match search field. Enter searches straight away, Escape clears (a second Escape leaves
 * the field), and "/" anywhere on the page jumps into it, as on most sites with search.
 */
const SearchBox = forwardRef(function SearchBox({ value, onChange, onSubmit, busy = false, className = '' }, ref) {
    const inputRef = useRef(null);
    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(document.activeElement)) return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    return (
        <form
            role="search"
            aria-label="Search matches"
            className={`relative ${className}`}
            onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
        >
            <label htmlFor="match-search" className="sr-only">Search teams, leagues or matches</label>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted">
                <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M13 13l4.25 4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
                ref={inputRef}
                id="match-search"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={80}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key !== 'Escape') return;
                    if (value) { e.preventDefault(); onChange(''); } else { e.currentTarget.blur(); }
                }}
                placeholder="Search teams, leagues or matches…"
                aria-describedby="match-search-hint"
                className={`search-input h-11 w-full rounded-full border border-line-strong bg-paper pl-11 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none ${value || busy ? 'pr-20' : 'pr-11'}`}
            />
            <span id="match-search-hint" className="sr-only">
                Try a team, a league or a country. Add today, tomorrow, a weekday, a date, live or results to narrow it.
            </span>
            <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {busy && (
                    <span className="search-spinner h-4 w-4 rounded-full border-2 border-line-strong border-t-ink" aria-hidden="true" />
                )}
                {value ? (
                    <button
                        type="button"
                        onClick={() => { onChange(''); inputRef.current?.focus(); }}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-chalk hover:text-ink"
                        aria-label="Clear search"
                    >
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                ) : (
                    <kbd className="mr-2 hidden rounded border border-line-strong px-1.5 text-[11px] font-medium text-muted sm:inline">/</kbd>
                )}
            </span>
        </form>
    );
});

export default SearchBox;
