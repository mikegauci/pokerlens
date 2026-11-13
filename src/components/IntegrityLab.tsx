"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/** Plain data for one player, prepared on the server so the engine stays out of the browser bundle. */
export interface LabPlayer {
  id: string;
  label: string;
  description: string;
  hands: number;
  measured: number;
  bets: number;
  agreement: number;
  meanLossBb: number;
  modalSizeShare: number;
  lossShares: number[];
  sizeShares: number[];
  signals: { closeToEngine: "flag" | "normal" | "too-few"; uniformSizing: "flag" | "normal" | "too-few" };
}

export interface LabBaseline {
  players: number;
  hands: number;
  agreement: [number, number];
  meanLossBb: [number, number];
  modalSizeShare: [number, number];
  lossShares: number[];
  sizeShares: number[];
}

// Validated for colour-vision deficiency and contrast against the panel colour.
const PLAYER = "#22a37d";
const BASELINE = "#8075f2";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const bb = (x: number) => `${x.toFixed(2)}bb`;

export function IntegrityLab({ players, baseline, lossLabels, sizeLabels, minMeasured, minBets }: {
  players: LabPlayer[];
  baseline: LabBaseline;
  lossLabels: string[];
  sizeLabels: string[];
  minMeasured: number;
  minBets: number;
}) {
  const [id, setId] = useState(players[0].id);
  const p = players.find((x) => x.id === id)!;
  const choose = (next: string) => {
    setId(next);
    track("integrity_player_viewed", { player: next });
  };

  return (
    <>
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Player</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {players.map((x) => (
            <label key={x.id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${x.id === id ? "border-accent/60 bg-accent/10" : "border-line bg-panel hover:border-accent/35"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <input type="radio" name="player" value={x.id} checked={x.id === id} onChange={() => choose(x.id)} className="accent-[var(--color-accent)]" />
                {x.label}
              </span>
              <span className="text-xs leading-relaxed text-muted">{x.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="signals-title" data-tour="integrity-signals" className="mt-6">
        <h2 id="signals-title" className="text-xl font-semibold">Signals for {p.label.toLowerCase()}</h2>
        <p className="mt-1 text-sm text-muted">
          {p.hands.toLocaleString("en")} hands, {p.measured} measured calls and folds, {p.bets} postflop bets. A signal is raised only when the player falls outside the range of all {baseline.players} baseline humans.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Signal
            title="Close to the engine"
            state={p.signals.closeToEngine}
            min={`${minMeasured} measured decisions`}
            rows={[
              { label: "Took the higher-EV option", value: pct(p.agreement), range: `${pct(baseline.agreement[0])}–${pct(baseline.agreement[1])}` },
              { label: "EV lost per measured decision", value: bb(p.meanLossBb), range: `${bb(baseline.meanLossBb[0])}–${bb(baseline.meanLossBb[1])}` },
            ]}
            flagText="Agrees with the engine more often, and loses less, than every baseline human. Real-time assistance would look like this if the tool agrees with this engine."
            normalText="Within the human range on at least one of the two measures."
          />
          <Signal
            title="Uniform bet sizing"
            state={p.signals.uniformSizing}
            min={`${minBets} postflop bets`}
            rows={[{ label: "Bets in the most used size band", value: pct(p.modalSizeShare), range: `${pct(baseline.modalSizeShare[0])}–${pct(baseline.modalSizeShare[1])}` }]}
            flagText="Uses one size band more than every baseline human. A simple bot often bets the same share of the pot every time."
            normalText="Varies sizes about as much as the baseline humans."
          />
        </div>
      </section>

      <Distribution
        id="ev-lost"
        title="EV lost per decision"
        caption="Calls and folds facing a postflop bet, by big blinds lost against the better of the two options. Share of each player's decisions."
        labels={lossLabels.map((l) => (l === "0" ? "None" : `${l}bb`))}
        player={p.lossShares}
        baseline={baseline.lossShares}
        playerLabel={p.label}
      />
      <Distribution
        id="sizes"
        title="Postflop bet sizes"
        caption="Bets and raises on the flop, turn and river, by size as a share of the pot. Share of each player's bets."
        labels={sizeLabels}
        player={p.sizeShares}
        baseline={baseline.sizeShares}
        playerLabel={p.label}
      />
    </>
  );
}

function Signal({ title, state, rows, flagText, normalText, min }: {
  title: string;
  state: "flag" | "normal" | "too-few";
  rows: { label: string; value: string; range: string }[];
  flagText: string;
  normalText: string;
  min: string;
}) {
  const badge = state === "flag"
    ? { icon: "▲", text: "Flagged", cls: "border-amber-300/40 bg-amber-300/10 text-amber-200" }
    : state === "normal"
      ? { icon: "●", text: "Within range", cls: "border-line bg-panel-2 text-muted" }
      : { icon: "○", text: "Too few hands", cls: "border-line bg-panel-2 text-muted" };
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
          <span aria-hidden="true">{badge.icon}</span>
          {badge.text}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-muted">{r.label}</dt>
            <dd><span className="font-semibold tabular-nums">{r.value}</span> <span className="text-xs text-muted">humans {r.range}</span></dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm leading-relaxed text-muted">{state === "flag" ? flagText : state === "normal" ? normalText : `Needs at least ${min} before it says anything.`}</p>
    </div>
  );
}

function Distribution({ id, title, caption, labels, player, baseline, playerLabel }: {
  id: string;
  title: string;
  caption: string;
  labels: string[];
  player: number[];
  baseline: number[];
  playerLabel: string;
}) {
  const max = Math.max(...player, ...baseline, 0.01);
  return (
    <section aria-labelledby={`${id}-title`} className="mt-6 rounded-xl border border-line bg-panel p-4 sm:p-5">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{caption}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PLAYER }} />{playerLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BASELINE }} />Baseline humans</span>
      </div>
      <div className="mt-3 grid gap-2.5" aria-hidden="true">
        {labels.map((label, i) => (
          <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3">
            <span className="text-xs tabular-nums text-muted">{label}</span>
            <div className="grid gap-0.5">
              <Bar value={player[i]} max={max} color={PLAYER} title={`${playerLabel}, ${label}: ${pct(player[i])}`} />
              <Bar value={baseline[i]} max={max} color={BASELINE} title={`Baseline humans, ${label}: ${pct(baseline[i])}`} />
            </div>
          </div>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full max-w-md text-left text-sm">
          <caption className="sr-only">{title}: share of decisions or bets in each band</caption>
          <thead className="text-xs text-muted">
            <tr><th scope="col" className="py-1 font-medium">Band</th><th scope="col" className="py-1 text-right font-medium">{playerLabel}</th><th scope="col" className="py-1 text-right font-medium">Baseline</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {labels.map((label, i) => (
              <tr key={label} className="border-t border-line">
                <th scope="row" className="py-1 font-normal">{label}</th>
                <td className="py-1 text-right">{pct(player[i])}</td>
                <td className="py-1 text-right">{pct(baseline[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Bar({ value, max, color, title }: { value: number; max: number; color: string; title: string }) {
  return (
    <div className="group flex h-3.5 items-center gap-2" title={title}>
      <div className="h-2 rounded-r" style={{ width: `${Math.max((value / max) * 85, value > 0 ? 1 : 0)}%`, background: color }} />
      <span className="text-[11px] tabular-nums text-muted">{pct(value)}</span>
    </div>
  );
}
