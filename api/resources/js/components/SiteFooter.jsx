import React from 'react';
import { BrandLockup } from './Brand';

const LINKS = [
    { href: '#', label: 'Matches' },
    { href: '#record', label: 'Track record' },
    { href: '#slips', label: 'My slips' },
    // The admin page is deliberately not linked anywhere: staff open it by address.
];

/** Shared footer for every page (main app and admin). */
export default function SiteFooter() {
    return (
        <footer className="border-t border-line bg-paper">
            <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
                <div className="max-w-xl">
                    <BrandLockup size="sm" />
                    <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                        Football win chances read from market odds, and checked honestly against real results.
                    </p>
                    <p className="mt-4 text-xs leading-relaxed text-muted">
                        Win chances are estimates, not promises. A value price is priced better than the market thinks
                        it's worth, and it can still lose. Prediction slips use play-money tokens. For adults 18+.
                        Never stake money you can't afford to lose.
                    </p>
                </div>
                <nav aria-label="Footer">
                    <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm md:grid-cols-1">
                        {LINKS.map((l) => (
                            <li key={l.href}>
                                <a href={l.href} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">{l.label}</a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
            <div className="border-t border-line">
                <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p>© 2026 PAL-PREDICT. All rights reserved.</p>
                    <p>Developed by <span className="font-semibold text-ink-soft">PALTECH Inc.</span></p>
                </div>
            </div>
        </footer>
    );
}
