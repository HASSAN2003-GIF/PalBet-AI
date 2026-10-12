import React from 'react';

/*
 * PAL-PREDICT identity: the "PAL." mark, refined from the original wordmark.
 *
 * Letters are drawn as geometry (not a font) on a 100-unit cap height with a ~24-unit stroke,
 * so the mark is identical everywhere and stays crisp at any size:
 *   P  straight stem + semicircular bowl (r = 30)
 *   A  flat apex, crossbar, true triangular counter; tucked under P's bowl (optical kerning)
 *   L  stem with a short arm
 *   .  a circle exactly one stroke wide, sitting on the baseline: the signature blue dot
 * Letters use currentColor so the mark works on light and dark backgrounds; the dot is always
 * the brand blue (--color-pal).
 */
export const MARK_PATHS = {
    P: 'M0 0H50A30 30 0 0 1 50 60H26V100H0Z M26 22H48A8 8 0 0 1 48 38H26Z',
    A: 'M70 100L100 0H128L158 100H131L125 80H103L97 100Z M108.4 62H119.6L114 43.3Z',
    L: 'M168 0H194V76H230V100H168Z',
};
export const DOT = { cx: 251, cy: 87, r: 13 };

/** The "PAL." mark on its own. Height follows font-size by default (1em ~ cap height). */
export function PalMark({ className = 'h-[1em]', title }) {
    return (
        <svg
            viewBox="0 0 264 100"
            className={`${className} w-auto shrink-0`}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : 'true'}
            focusable="false"
        >
            <path d={`${MARK_PATHS.P} ${MARK_PATHS.A} ${MARK_PATHS.L}`} fill="currentColor" fillRule="evenodd" />
            <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill="var(--color-pal)" />
        </svg>
    );
}

/**
 * Full lockup: "PAL." mark + "PREDICT". The blue full stop does the work of the hyphen in
 * "PAL-PREDICT". PREDICT is set lighter and slightly tracked so the mark stays the hero.
 * size: 'sm' (footer, admin) | 'md' (header)
 */
export function BrandLockup({ size = 'md', className = '' }) {
    const scale = size === 'sm' ? 'text-[15px]' : 'text-[19px]';
    return (
        <span className={`inline-flex items-baseline gap-[0.34em] leading-none text-ink ${scale} ${className}`}>
            <PalMark className="h-[0.86em] translate-y-[0.02em]" />
            <span aria-hidden="true" className="text-[0.74em] font-semibold tracking-[0.12em] text-ink-soft">PREDICT</span>
            <span className="sr-only">PAL-PREDICT</span>
        </span>
    );
}

/** Home link used in the site header. */
export function HomeLink() {
    return (
        <a href="/" aria-label="PAL-PREDICT home" className="inline-flex items-center rounded-md py-1">
            <BrandLockup />
        </a>
    );
}
