import React, { useEffect, useRef, useState } from 'react';
import { askAnalyst } from '../lib/api';
import { kickoffTime } from '../lib/format';
import ProbabilityStrip from './ProbabilityStrip';

function starterQuestions(match) {
    const qs = ['How is this game likely to play out?', 'What could change the result?'];
    if (match.value?.is_value && match.value.selection) {
        const sel = match.value.selection;
        qs.splice(1, 0, `Why is ${sel.outcome === 'draw' ? 'the draw' : sel.label} a value price?`);
    } else {
        qs.push(`Why does the model favour this result?`);
    }
    return qs;
}

/** Side panel (full screen on phones) for a conversation about one match. */
export default function AnalystPanel({ match, competition, onClose }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        const previous = document.activeElement;
        inputRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
            previous?.focus?.();
        };
    }, [onClose]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, pending]);

    async function send(text) {
        const question = text.trim();
        if (!question || pending) return;
        const history = messages.map(({ role, text: t }) => ({ role, text: t }));
        setMessages((m) => [...m, { role: 'user', text: question }]);
        setInput('');
        setError(null);
        setPending(true);
        try {
            const data = await askAnalyst(match.id, question, history);
            setMessages((m) => [...m, { role: 'ai', text: data.response }]);
        } catch (err) {
            setError(err.message);
            // Put the question back so it can be retried without retyping.
            setMessages((m) => m.slice(0, -1));
            setInput(question);
        } finally {
            setPending(false);
        }
    }

    // Keep keyboard focus inside the panel while it is open.
    function trapFocus(e) {
        if (e.key !== 'Tab' || !panelRef.current) return;
        const nodes = panelRef.current.querySelectorAll('button, textarea, [href], input');
        const list = Array.from(nodes).filter((n) => !n.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" onClick={onClose}>
            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="analyst-title"
                onKeyDown={trapFocus}
                onClick={(e) => e.stopPropagation()}
                className="panel-in flex h-full w-full flex-col bg-paper shadow-[-12px_0_40px_rgba(19,33,27,0.18)] sm:max-w-[30rem]"
            >
                <header className="border-b border-line px-5 pb-4 pt-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-xs text-muted">
                                {competition ? `${competition.name}, ${competition.region}` : 'Match'} at {kickoffTime(match.kickoff)}
                            </p>
                            <h2 id="analyst-title" className="semi-cond mt-1 text-xl font-bold leading-tight">
                                {match.home.name} v {match.away.name}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-chalk hover:text-ink"
                            aria-label="Close the analyst"
                        >
                            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                    <ProbabilityStrip match={match} labels className="mt-4" />
                </header>

                <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5" aria-live="polite">
                    {messages.length === 0 && (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm leading-relaxed text-ink-soft">
                                Ask about this match. The analyst works from the model's numbers and says so when it doesn't know something, like injuries or line-ups.
                            </p>
                            <div className="flex flex-col items-start gap-2">
                                {starterQuestions(match).map((q) => (
                                    <button
                                        key={q}
                                        type="button"
                                        onClick={() => send(q)}
                                        disabled={pending}
                                        className="rounded-full border border-line-strong bg-chalk px-4 py-2 text-left text-sm text-ink transition hover:border-home hover:text-home"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <ol className="flex flex-col gap-5">
                        {messages.map((m, i) => (
                            <li key={i} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'max-w-full'}>
                                {m.role === 'user' ? (
                                    <p className="rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-chalk">{m.text}</p>
                                ) : (
                                    <div className="border-l-2 border-home pl-4 text-[15px] leading-relaxed text-ink">
                                        {m.text.split(/\n{2,}/).map((para, j) => (
                                            <p key={j} className="mb-3 last:mb-0 whitespace-pre-line">{para.replace(/\*\*(.+?)\*\*/g, '$1')}</p>
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>

                    {pending && (
                        <p className="typing mt-5 border-l-2 border-line-strong pl-4 text-sm text-muted">
                            Reading the numbers<span>.</span><span>.</span><span>.</span>
                        </p>
                    )}
                </div>

                <form
                    className="border-t border-line bg-paper px-4 py-3"
                    onSubmit={(e) => { e.preventDefault(); send(input); }}
                >
                    {error && <p role="alert" className="mb-2 text-sm text-alert">{error}</p>}
                    <div className="flex items-end gap-2">
                        <label htmlFor="analyst-input" className="sr-only">Your question</label>
                        <textarea
                            id="analyst-input"
                            ref={inputRef}
                            rows={1}
                            maxLength={600}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                            placeholder="Ask about tactics, the model, or the price"
                            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line-strong bg-chalk px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-home focus:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={pending || !input.trim()}
                            className="h-11 rounded-full bg-home px-5 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Ask
                        </button>
                    </div>
                </form>
            </aside>
        </div>
    );
}
