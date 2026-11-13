"use client";

import { useState } from "react";
import type { KnowledgeQuestion } from "@/lib/poker/learn";

const pot = 38.5;
const call = 16;
const required = call / (pot + call);

export function CallEvExercise() {
  const [equity, setEquity] = useState(25);
  const ev = equity / 100 * (pot + call) - call;
  const roundedEv = Math.round(ev * 10) / 10;
  const evLabel = `${roundedEv > 0 ? "+" : ""}${roundedEv.toFixed(1)} bb`;

  return (
    <div className="rounded-xl border border-accent/25 bg-panel p-4 sm:p-6">
      <h3 className="text-lg font-semibold">Try it · Find the break-even call</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">The pot is {pot} bb after the river bet. It costs {call} bb to call. Move the slider to see how equity changes the EV of calling before rake.</p>
      <div className="mt-5 flex items-baseline justify-between gap-2">
        <label htmlFor="learn-equity" className="text-sm font-medium">Your estimated equity</label>
        <span aria-hidden="true" className="tabular text-lg font-semibold text-accent">{equity}%</span>
      </div>
      <input id="learn-equity" type="range" min={0} max={100} value={equity} aria-valuetext={`${equity}% equity`} onChange={(e) => setEquity(e.currentTarget.valueAsNumber)} className="my-2 block w-full accent-accent" />
      <div className="relative mt-1 h-2 rounded-full bg-panel-2" aria-hidden="true">
        <div className={`equity-fill absolute inset-y-0 left-0 rounded-full ${ev >= 0 ? "bg-accent" : "bg-rose-400"}`} style={{ width: `${equity}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-amber-200" style={{ left: `${required * 100}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-bg px-3 py-2">
          <dt className="text-xs text-muted">Break-even equity</dt>
          <dd className="tabular text-lg font-semibold text-amber-200">{(required * 100).toFixed(1)}%</dd>
        </div>
        <div className="rounded-lg bg-bg px-3 py-2">
          <dt className="text-xs text-muted">Call EV vs. folding</dt>
          <dd className={`tabular text-lg font-semibold ${roundedEv > 0 ? "text-accent" : roundedEv < 0 ? "text-rose-300" : "text-ink"}`}>
            <output htmlFor="learn-equity" aria-live="off">{evLabel}</output>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">Call EV = equity × (pot + call) − call</p>
    </div>
  );
}

export function KnowledgeCheck({ question }: { question: KnowledgeQuestion }) {
  const [selected, setSelected] = useState<number | null>(null);
  const isCorrect = selected === question.correct;

  return (
    <fieldset className="mt-5 min-w-0 border-t border-line pt-3">
      <legend className="pr-2 text-xs font-semibold text-violet-200">Quick check</legend>
      <p className="text-sm font-medium">{question.prompt}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {question.answers.map((answer, index) => (
          <button key={answer.label} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}
            className={`rounded-md border px-2.5 py-1.5 text-left text-sm ${selected === index ? "border-violet-300/60 bg-violet-300/15 text-violet-100" : "border-line bg-bg text-muted hover:text-ink"}`}>
            {answer.label}
          </button>
        ))}
      </div>
      <div role="status" className="mt-2 text-sm leading-relaxed">
        {selected !== null && (
          <p className="text-muted"><strong className={isCorrect ? "text-accent" : "text-amber-200"}>{isCorrect ? "Correct. " : "Try again. "}</strong>{question.answers[selected].explanation}</p>
        )}
      </div>
    </fieldset>
  );
}
