"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/poker/cards";
import { Cards, PlayingCard } from "./PlayingCard";

const streets = [
  { name: "Preflop", cards: 0, action: "You open on the button. The big blind calls." },
  { name: "Flop", cards: 3, action: "You flop top pair. The big blind checks and calls your bet." },
  { name: "Turn", cards: 4, action: "The big blind checks and calls again." },
  { name: "River", cards: 5, action: "The king falls and the big blind leads into you. Would you call or fold?" },
];

type RangeEstimate = {
  label: string;
  description: string;
  equity: number;
  callEv: number;
};

type RiverChallengeProps = {
  hero: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  ranges: RangeEstimate[];
  sampleHref: string;
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function RiverChallenge({ hero, board, pot, toCall, ranges, sampleHref }: RiverChallengeProps) {
  const [streetIndex, setStreetIndex] = useState(0);
  const [choice, setChoice] = useState<"call" | "fold" | null>(null);
  const [rangeIndex, setRangeIndex] = useState(0);
  const callButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);
  const street = streets[streetIndex];
  const next = streets[streetIndex + 1];
  const range = ranges[rangeIndex];
  const price = toCall / (pot + toCall);
  const roundedEv = Math.round(range.callEv * 10) / 10;
  const ev = `${roundedEv > 0 ? "+" : ""}${roundedEv.toFixed(1)} bb`;
  const betterAction = roundedEv > 0 ? "Call" : roundedEv < 0 ? "Fold" : null;

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    (next ? nextButton : callButton).current?.focus({ preventScroll: true });
  }, [streetIndex, next]);

  function restart() {
    focusNext.current = true;
    setStreetIndex(0);
    setRangeIndex(0);
    setChoice(null);
  }

  return (
    <section id="river-challenge" tabIndex={-1} aria-labelledby="river-challenge-title" className="jump-target mt-8">
      <h2 id="river-challenge-title" className="text-2xl font-semibold tracking-tight">Play the river decision</h2>
      <div className="mt-3 grid gap-4 rounded-2xl border border-accent/25 bg-panel p-3 sm:p-5 lg:grid-cols-2">
        <div className="sample-felt relative isolate grid min-h-64 content-center gap-4 overflow-hidden rounded-xl border border-accent/20 px-3 py-5 text-center sm:min-h-72">
          <div className="pointer-events-none absolute inset-[13%_5%] -z-10 rounded-[50%] border border-emerald-200/20 bg-emerald-950/25 shadow-[inset_0_0_35px_#0b292c]" />
          <p className="text-xs font-medium text-emerald-100/90">Big blind</p>
          <div className="flex h-11 justify-center gap-1.5" role="group" aria-label={`${street.name} board`}>
            {board.map((card, i) => i < street.cards ? (
              <span key={card} className="deal-card inline-flex"><PlayingCard card={card} /></span>
            ) : (
              <span key={card} aria-hidden="true" className="w-8 rounded-md border border-dashed border-emerald-100/30 bg-emerald-950/45" />
            ))}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Cards cards={hero} />
            <p className="text-xs font-medium text-emerald-100/90">You · Button</p>
          </div>
        </div>

        <div className="min-w-0 p-1 sm:p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ol className="flex flex-wrap gap-1.5" aria-label="Hand progress">
              {streets.map(({ name }, index) => (
                <li key={name} aria-current={streetIndex === index ? "step" : undefined}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${index === streetIndex ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-muted"}`}>
                  {name}
                </li>
              ))}
            </ol>
            {streetIndex > 0 && (
              <button type="button" onClick={restart} className="rounded px-1.5 py-1 text-xs text-muted hover:text-accent">Restart hand</button>
            )}
          </div>

          <div aria-live="polite" aria-atomic="true">
            <p className="mt-4 text-sm leading-relaxed text-ink">{street.action}</p>
            {!next && (
              <p className="mt-2 text-sm text-muted"><strong className="text-amber-200">{toCall} bb to call</strong> · {pot} bb in the pot after the bet</p>
            )}
          </div>

          {next ? (
            <button ref={nextButton} type="button" onClick={() => {
              focusNext.current = true;
              setStreetIndex(streetIndex + 1);
            }} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
              Deal the {next.name.toLowerCase()}
            </button>
          ) : (
            <div className="mt-4 flex gap-2" role="group" aria-label="Your river decision">
              {(["call", "fold"] as const).map((action) => (
                <button key={action} ref={action === "call" ? callButton : undefined} type="button" aria-pressed={choice === action} onClick={() => setChoice(action)}
                  className={`min-w-20 rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${choice === action ? "border-accent bg-accent text-emerald-950" : "border-line bg-bg text-ink hover:border-accent/50"}`}>
                  {action}
                </button>
              ))}
            </div>
          )}

          <div role="status" className={choice ? "mt-4" : undefined}>
            {choice && (
              <p className="text-sm leading-relaxed text-muted">
                <strong className={betterAction?.toLowerCase() === choice ? "text-accent" : "text-amber-200"}>
                  {betterAction ? `${betterAction} has higher estimated EV against this range.` : "Call and fold have about the same EV against this range."}
                </strong>{" "}
                You chose {choice}. Calling is worth {ev} relative to folding, before rake.
              </p>
            )}
          </div>

          {choice && (
            <div className="mt-4 border-t border-line pt-4">
              <label htmlFor="challenge-range" className="block text-sm font-medium">Try a different opponent range</label>
              <select id="challenge-range" value={rangeIndex} onChange={(e) => setRangeIndex(Number(e.currentTarget.value))}
                className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm">
                {ranges.map(({ label }, index) => <option key={label} value={index}>{label}</option>)}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-muted">{range.description}</p>
              <div className="relative mt-4 h-2 rounded-full bg-bg" aria-hidden="true">
                <div className={`equity-fill absolute inset-y-0 left-0 rounded-full ${range.equity >= price ? "bg-accent" : "bg-rose-400"}`} style={{ width: percent(range.equity) }} />
                <div className="absolute -inset-y-1 w-0.5 bg-amber-200" style={{ left: percent(price) }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-2 text-xs font-medium">
                <span>Estimated equity {percent(range.equity)}</span>
                <span className="text-amber-200">Break-even {percent(price)}</span>
              </div>
              <Link href={sampleHref} className="mt-4 inline-block rounded text-sm font-medium text-accent underline-offset-4 hover:underline">Open full hand review <span aria-hidden="true">→</span></Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
