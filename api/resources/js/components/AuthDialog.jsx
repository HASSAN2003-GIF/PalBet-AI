import React, { useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { useAccount } from '../lib/account';

const field = 'w-full rounded-lg border border-line-strong bg-chalk px-4 py-2.5 text-ink placeholder:text-muted focus:border-home focus:outline-none';

/** Sign in / create account, in one dialog with two modes. */
export default function AuthDialog() {
    const { authOpen: mode, setAuthOpen, finishAuth } = useAccount();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [adult, setAdult] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const firstField = useRef(null);
    const dialogRef = useRef(null);

    const isRegister = mode === 'register';

    useEffect(() => {
        if (!mode) return undefined;
        setError(null);
        const previous = document.activeElement;
        setTimeout(() => firstField.current?.focus(), 0);
        const onKey = (e) => { if (e.key === 'Escape') setAuthOpen(null); };
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
    }, [mode, setAuthOpen]);

    if (!mode) return null;

    async function submit(e) {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
            const data = isRegister
                ? await api.register(name.trim(), email.trim(), password, adult)
                : await api.login(email.trim(), password);
            setPassword('');
            finishAuth(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setPending(false);
        }
    }

    function trapFocus(e) {
        if (e.key !== 'Tab' || !dialogRef.current) return;
        const nodes = Array.from(dialogRef.current.querySelectorAll('button, input, a[href]')).filter((n) => !n.disabled);
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setAuthOpen(null)}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-title"
                onKeyDown={trapFocus}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-[0_20px_60px_rgba(19,33,27,0.25)]"
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <h2 id="auth-title" className="semi-cond text-2xl font-extrabold">{isRegister ? 'Create an account' : 'Sign in'}</h2>
                        <p className="mt-1 text-sm text-muted">
                            {isRegister ? 'You get 100 free tokens to build prediction slips.' : 'Sign in to place slips and see your record.'}
                        </p>
                    </div>
                    <button type="button" onClick={() => setAuthOpen(null)} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-chalk hover:text-ink">
                        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>

                <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
                    {isRegister && (
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="text-ink-soft">Name</span>
                            <input id="auth-name" aria-label="Name" ref={firstField} className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={60} required />
                        </label>
                    )}
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ink-soft">Email</span>
                        <input id="auth-email" aria-label="Email" ref={isRegister ? undefined : firstField} type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center justify-between text-ink-soft">
                            Password
                            <button type="button" className="text-xs text-muted underline underline-offset-2 hover:text-ink" onClick={() => setShowPassword((s) => !s)}>
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </span>
                        <input
                            id="auth-password"
                            aria-label="Password"
                            type={showPassword ? 'text' : 'password'}
                            className={field}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            required
                        />
                        {isRegister && <span className="text-xs text-muted">At least 8 characters, with letters and numbers.</span>}
                    </label>
                    {isRegister && (
                        <label className="mt-1 flex items-start gap-2.5 text-sm text-ink-soft">
                            <input id="auth-adult" type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4 accent-home" />
                            <span>I'm 18 or older. I understand tokens are play money: they can't be bought or cashed out.</span>
                        </label>
                    )}

                    {error && <p role="alert" className="text-sm text-alert">{error}</p>}

                    <button type="submit" disabled={pending} className="mt-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-chalk hover:bg-home disabled:opacity-50">
                        {pending ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
                    </button>
                </form>

                <p className="mt-4 text-center text-sm text-muted">
                    {isRegister ? 'Already have an account? ' : 'New here? '}
                    <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => setAuthOpen(isRegister ? 'signin' : 'register')}>
                        {isRegister ? 'Sign in' : 'Create an account'}
                    </button>
                </p>
            </div>
        </div>
    );
}
