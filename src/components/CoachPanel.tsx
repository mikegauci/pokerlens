"use client";

import { useRef, useState } from "react";
import type { VillainProfile } from "@/lib/poker/analyze";
import { track } from "@/lib/track";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = ["What should I have done instead?", "How would this change against a calling station?", "What hands should I be bluffing with here?"];

const SIGNED_NUMBER = /(?<![\p{L}\d$€£.,+\-−–])([+\-−]\s*\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:bb\b|%))?)(?![\p{L}\d]|[.,]\d)/giu;

function signedNumbers(text: string) {
  return text.split(SIGNED_NUMBER).map((part, i) => {
    if (i % 2 === 0 || Number(part.replace(/[^\d.]/g, "")) === 0) return part;
    return <span key={i} className={part.startsWith("+") ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>{part}</span>;
  });
}

/** Minimal Markdown: bold, italics and bullet lines. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
      if (part.startsWith("**")) return <strong key={i} className="text-ink">{signedNumbers(part.slice(2, -2))}</strong>;
      if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{signedNumbers(part.slice(1, -1))}</em>;
      return <span key={i}>{signedNumbers(part)}</span>;
    });
  return (
    <div className="space-y-2">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const bullet = t.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
        return bullet ? (
          <p key={i} className="flex gap-2">
            <span className="text-accent">•</span>
            <span>{inline(bullet[1])}</span>
          </p>
        ) : (
          <p key={i}>{inline(t.replace(/^#+\s*/, ""))}</p>
        );
      })}
    </div>
  );
}

export function CoachPanel({ handText, profile, overrides }: { handText: string; profile: VillainProfile; overrides: Record<string, string> }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ask = async (question?: string) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    track("coach_requested", { followup: Boolean(question), suggested: Boolean(question && SUGGESTIONS.includes(question)) });
    const history: Msg[] = question ? [...messages, { role: "user", content: question }] : [];
    setMessages([...history, { role: "assistant", content: "" }]);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handText, profile, rangeOverrides: overrides, messages: history }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "The coach could not be reached.");
      setMode(res.headers.get("X-Coach-Mode"));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "The coach could not be reached.");
        setMessages(history);
      }
    } finally {
      setBusy(false);
    }
  };

  const started = messages.length > 0;
  const canChat = started && !busy && mode === "ai";

  return (
    <section id="coach" data-tour="coach" tabIndex={-1} className="jump-target rounded-xl border border-violet-400/25 bg-panel p-4" aria-labelledby="coach-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="coach-title" className="text-lg font-semibold text-violet-200">Coach</h2>
        {mode === "fallback" && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">built-in summary</span>}
        {started && !busy && (
          <button onClick={() => ask()} className="ml-auto text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
            Regenerate with current assumptions
          </button>
        )}
      </div>

      {!started && (
        <div className="mt-2">
          <p className="text-sm text-muted">Get a plain-English review based on the analysis and your opponent assumptions.</p>
          <button onClick={() => ask()} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
            Explain this hand
          </button>
        </div>
      )}

      <div className="mt-3 space-y-3 break-words text-sm leading-relaxed text-ink/90" aria-live="polite" aria-busy={busy}>
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-lg bg-panel-2 px-3 py-2">
              {m.content}
            </p>
          ) : m.content ? (
            <Rich key={i} text={m.content} />
          ) : (
            <p key={i} className="animate-pulse text-muted">
              Reading the hand…
            </p>
          ),
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {canChat && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-ink">
                {s}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = input.trim();
              if (!q) return;
              setInput("");
              ask(q);
            }}
          >
            <label htmlFor="coach-q" className="sr-only">
              Ask the coach a follow-up question
            </label>
            <input
              id="coach-q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="Ask a follow-up about this hand"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted/60 focus:border-accent"
            />
            <button type="submit" disabled={!input.trim()} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-40">
              Ask
            </button>
          </form>
        </>
      )}
    </section>
  );
}
