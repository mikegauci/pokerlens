"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AnswerResult,
  Deal,
  POSITIONS,
  TRAINER_ACTIONS,
  TrainerAction,
  answerSpot,
  dealSpot,
  describeSpot,
  dueItems,
  explain,
  raiseName,
  spotRange,
  spotTitle,
} from "@/lib/poker/trainer";
import { track } from "@/lib/track";
import { getProgress, getServerProgress, resetProgress, saveProgress, subscribe } from "@/lib/trainer-store";
import { Cards } from "./PlayingCard";
import { RangeGrid } from "./RangeGrid";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const KEYS: Record<string, TrainerAction> = { r: "raise", c: "call", f: "fold" };

/** Seats in table order, with hero and the player who raised marked. */
function Seats({ deal }: { deal: Deal }) {
  const { hero, villain, kind } = deal.spot;
  return (
    <ol aria-label="Seats in order of action" className="flex flex-wrap gap-1.5">
      {POSITIONS.map((p) => {
        const role = p === hero ? "You" : p === villain ? (kind === "vs-open" ? "Opens" : "3-bets") : null;
        return (
          <li key={p} className={`rounded-md border px-2 py-1 text-center text-xs ${p === hero ? "border-accent/60 bg-accent/15 text-ink" : p === villain ? "border-amber-200/50 bg-amber-200/10 text-ink" : "border-line text-muted"}`}>
            <span className="block font-semibold">{p}</span>
            <span className="block text-[10px]">{role ?? " "}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function RangeTrainer() {
  const progress = useSyncExternalStore(subscribe, getProgress, getServerProgress);
  // The answered deal stays on screen with its feedback until the player asks for the next one.
  const [answered, setAnswered] = useState<{ deal: Deal; choice: TrainerAction; result: AnswerResult } | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);

  const deal = answered?.deal ?? (progress ? dealSpot(progress) : null);

  const answer = (choice: TrainerAction) => {
    if (!progress || !deal || answered) return;
    const result = answerSpot(progress, deal, choice);
    moveFocus.current = true;
    setAnswered({ deal, choice, result });
    saveProgress(result.progress);
    track("trainer_answered", { position: deal.spot.hero, situation: deal.spot.kind, correct: result.correct });
  };
  const next = () => {
    moveFocus.current = true;
    setAnswered(null);
  };

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (answered ? nextButton : firstAction).current?.focus({ preventScroll: true });
  }, [answered]);

  // Keyboard: R, C, F to answer. The Next button takes focus after an answer, so Enter or Space moves on.
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = KEYS[e.key.toLowerCase()];
      if (action) answerRef.current(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!progress || !deal) {
    return <div id="drill" className="mt-6 min-h-80 rounded-xl border border-line bg-panel p-6 text-sm text-muted">Dealing…</div>;
  }

  const range = spotRange(deal.spot);
  const result = answered?.result;
  const hasCall = range.callPct > 0;
  const seen = POSITIONS.reduce((n, p) => n + progress.positions[p].seen, 0);
  const correct = POSITIONS.reduce((n, p) => n + progress.positions[p].correct, 0);
  const due = dueItems(progress).length;
  const missed = Object.values(progress.items).filter((i) => i.box === 0).length;
  const reset = () => {
    if (!window.confirm("Clear your trainer record and review queue?")) return;
    setAnswered(null);
    resetProgress();
  };

  return (
    <>
      <section id="drill" tabIndex={-1} aria-labelledby="drill-title" className="jump-target mt-6 grid gap-5 rounded-xl border border-line bg-panel p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="drill-title" className="text-lg font-semibold">{spotTitle(deal.spot)}</h2>
            {deal.review && <span className="rounded-full border border-violet-300/40 bg-violet-300/10 px-2 py-0.5 text-xs text-violet-100">Review: you have seen this spot before</span>}
          </div>
          <div className="mt-3"><Seats deal={deal} /></div>
          <p className="mt-4 leading-relaxed">{describeSpot(deal.spot)}</p>
          <div className="mt-4 flex items-center gap-3">
            <Cards key={`${progress.turn}-${deal.hand}`} cards={deal.cards} size="lg" deal />
            <div>
              <p className="text-2xl font-semibold tracking-tight">{deal.hand}</p>
              <p className="text-xs text-muted">Your hand, {deal.spot.hero}, 100bb deep</p>
            </div>
          </div>

          <div role="group" aria-label="Your action" className="mt-5 flex flex-wrap gap-2">
            {TRAINER_ACTIONS.map((a, i) => {
              const picked = answered?.choice === a;
              const isAnswer = result?.expected === a;
              const tone = !result ? "border-line bg-bg hover:border-accent/60 hover:bg-panel-2" : isAnswer ? "border-accent bg-accent/15 text-ink" : picked ? "border-rose-400/70 bg-rose-400/10 text-ink" : "border-line bg-bg text-muted";
              const hint = a === "raise" ? cap(raiseName(deal.spot)) : a === "call" ? (deal.spot.kind === "first-in" ? "Limp" : "Flat call") : "Give it up";
              return (
                <button key={a} ref={i === 0 ? firstAction : undefined} type="button" disabled={Boolean(result)} aria-pressed={picked} onClick={() => answer(a)}
                  className={`min-w-24 rounded-lg border px-4 py-2.5 text-left text-sm font-semibold disabled:cursor-default ${tone}`}>
                  {cap(a)}
                  <span className="block text-xs font-normal text-muted">{hint} · {a[0].toUpperCase()}</span>
                </button>
              );
            })}
          </div>

          <div role="status" className="mt-4 min-h-28 text-sm leading-relaxed">
            {result && answered && (
              <>
                <p className={`text-base font-semibold ${result.correct ? "text-accent" : "text-rose-300"}`}>
                  {result.correct ? "Correct." : `Not what the chart does: you chose ${answered.choice}.`}{" "}
                  {Math.max(result.freq.raise, result.freq.call, result.freq.fold) < 1
                    ? `The chart mixes ${deal.hand}: ${(["raise", "call", "fold"] as const).filter((a) => result.freq[a] > 0).map((a) => `${a === "raise" ? raiseName(deal.spot) : a} ${Math.round(result.freq[a] * 100)}%`).join(", ")}.`
                    : `The chart ${result.expected === "raise" ? `${raiseName(deal.spot)}s` : `${result.expected}s`} ${deal.hand}.`}
                </p>
                <p className="mt-1.5 text-muted">{explain(deal.spot, deal.hand)}</p>
                {result.borderline && (
                  <p className="mt-1.5 text-amber-200">Close spot: {deal.hand} sits on the edge of this chart, so the other answer loses very little.</p>
                )}
                <p className="mt-1.5 text-xs text-muted">{result.correct ? "It will come back later to check it has stuck." : "It will come back in a few hands."}</p>
                <button ref={nextButton} type="button" onClick={next} className="mt-3 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
                  Next hand <span aria-hidden="true">→</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-bg p-3 sm:p-4">
          {result ? (
            <>
              <h3 className="text-sm font-semibold">Chart for this spot: {spotTitle(deal.spot)}</h3>
              <p className="mt-1 text-xs text-muted">Your hand is outlined. Simplified binary chart, not solver output.</p>
              <div className={`mt-3 grid gap-4 ${hasCall ? "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" : ""}`}>
                <figure>
                  <figcaption className="mb-1.5 text-xs font-medium">{cap(raiseName(deal.spot))} <span className="text-muted">· {pct(range.raisePct)} of hands</span></figcaption>
                  <RangeGrid weights={range.raise} highlight={deal.hand} />
                </figure>
                {hasCall && (
                  <figure>
                    <figcaption className="mb-1.5 text-xs font-medium">Call <span className="text-muted">· {pct(range.callPct)} of hands</span></figcaption>
                    <RangeGrid weights={range.call} highlight={deal.hand} />
                  </figure>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">{hasCall ? "Everything not shaded in either grid folds." : "Everything not shaded folds. First in, this chart never limps."}</p>
            </>
          ) : (
            <div className="flex h-full min-h-48 flex-col justify-center text-sm text-muted">
              <p className="font-medium text-ink">The range for this spot appears after you answer.</p>
              <p className="mt-1.5">Try to picture it first: which hands raise here, which call, and where does yours sit?</p>
              <p className="mt-3 text-xs">Keyboard: R, C or F to answer, then Enter for the next hand.</p>
            </div>
          )}
        </div>
      </section>

      <section id="accuracy" tabIndex={-1} aria-labelledby="accuracy-title" className="jump-target mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="accuracy-title" className="text-2xl font-semibold tracking-tight">Accuracy by position</h2>
            <p className="mt-1 text-sm text-muted">
              {seen === 0 ? "Answer a hand to start your record." : `${correct} of ${seen} match the chart (${pct(correct / seen)}). ${missed} missed spot${missed === 1 ? "" : "s"} still to fix, ${due} due for review now.`}
            </p>
          </div>
          <button type="button" disabled={seen === 0} onClick={reset} className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-panel-2 disabled:opacity-40">
            Reset progress
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {POSITIONS.map((p) => {
            const rec = progress.positions[p];
            const rate = rec.seen ? rec.correct / rec.seen : null;
            return (
              <div key={p} className="rounded-lg border border-line bg-panel px-3 py-2.5">
                <dt className="text-xs font-semibold text-muted">{p}</dt>
                <dd className={`tabular text-xl font-semibold ${rate === null ? "text-muted" : rate >= 0.8 ? "text-accent" : rate >= 0.6 ? "text-amber-200" : "text-rose-300"}`}>{rate === null ? "–" : pct(rate)}</dd>
                <dd className="tabular text-xs text-muted">{rec.correct} of {rec.seen}</dd>
                <dd className="mt-1.5 h-1.5 rounded-full bg-panel-2" aria-hidden="true"><span className="block h-full rounded-full bg-accent" style={{ width: `${(rate ?? 0) * 100}%` }} /></dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-3 text-xs text-muted">Progress is kept in this browser only. Accuracy means agreement with the simplified charts, and the deal favours close hands, so a lower number here is normal.</p>
      </section>
    </>
  );
}
