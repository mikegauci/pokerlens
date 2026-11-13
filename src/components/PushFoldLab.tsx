"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { formatRange, solveFirstIn } from "@/lib/poker/pushfold";
import { track } from "@/lib/track";
import { RangeGrid } from "./RangeGrid";

/** Seats that can be first in, in the order they act, for each table size. */
const TABLES = [
  { id: "hu", label: "Heads-up", players: 2, seats: ["SB"] },
  { id: "6max", label: "6-max", players: 6, seats: ["UTG", "HJ", "CO", "BTN", "SB"] },
  { id: "9max", label: "9-max", players: 9, seats: ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB"] },
] as const;

const ANTES = [
  { value: 0, label: "No ante" },
  { value: 0.125, label: "0.125bb each" },
];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const field = "mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-sm text-ink";

export function PushFoldLab() {
  const [tableId, setTableId] = useState<(typeof TABLES)[number]["id"]>("hu");
  const [seat, setSeat] = useState("SB");
  const [stack, setStack] = useState(10);
  const [ante, setAnte] = useState(0);
  const [caller, setCaller] = useState(0);

  const table = TABLES.find((t) => t.id === tableId)!;
  const seatIndex = Math.max(0, (table.seats as readonly string[]).indexOf(seat));
  const playersBehind = table.players - 1 - seatIndex;
  // Callers in the order they act: the seats after the shover, then the big blind.
  const callerSeats = [...table.seats.slice(seatIndex + 1), "BB"];
  const callerIndex = Math.min(caller, callerSeats.length - 1);

  // Solving takes a moment with many players behind, so the slider is allowed to run ahead of the grids.
  const spot = useDeferredValue({ stack, players: table.players, playersBehind, ante });
  const solution = useMemo(
    () => solveFirstIn({ stackBb: spot.stack, players: spot.players, playersBehind: spot.playersBehind, anteBb: spot.ante }),
    [spot.stack, spot.players, spot.playersBehind, spot.ante],
  );
  const stale = spot.stack !== stack || spot.playersBehind !== playersBehind || spot.ante !== ante || spot.players !== table.players;

  useEffect(() => {
    const t = setTimeout(() => track("pushfold_viewed", { players: table.players, players_behind: playersBehind, stack_bb: stack, ante_bb: ante }), 800);
    return () => clearTimeout(t);
  }, [table.players, playersBehind, stack, ante]);

  const calls = solution.calls[Math.min(callerIndex, solution.calls.length - 1)];
  const callPct = solution.callPcts[Math.min(callerIndex, solution.callPcts.length - 1)];

  return (
    <>
      <section id="spot" tabIndex={-1} aria-labelledby="spot-title" className="jump-target mt-6 rounded-xl border border-line bg-panel p-4 sm:p-6">
        <h2 id="spot-title" className="text-lg font-semibold">The spot</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm lg:col-span-1">
            <span className="flex items-baseline justify-between">
              <span className="text-muted">Effective stack</span>
              <span className="tabular text-lg font-semibold">{stack}bb</span>
            </span>
            <input type="range" min={1} max={20} step={0.5} value={stack} onChange={(e) => setStack(Number(e.target.value))} className="mt-2 w-full accent-emerald-400" aria-valuetext={`${stack} big blinds`} />
            <span className="flex justify-between text-[11px] text-muted"><span>1bb</span><span>20bb</span></span>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Table</span>
            <select
              value={tableId}
              onChange={(e) => {
                const next = TABLES.find((t) => t.id === e.target.value)!;
                setTableId(next.id);
                setSeat("SB");
                setCaller(0);
              }}
              className={field}
            >
              {TABLES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Shover&apos;s seat (folded to them)</span>
            <select
              value={table.seats[seatIndex]}
              onChange={(e) => {
                setSeat(e.target.value);
                setCaller(0);
              }}
              className={field}
            >
              {table.seats.map((s, i) => {
                const behind = table.players - 1 - i;
                return <option key={s} value={s}>{s}, {behind} left to act</option>;
              })}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Ante per player</span>
            <select value={ante} onChange={(e) => setAnte(Number(e.target.value))} className={field}>
              {ANTES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {playersBehind === 1 ? (
            <><strong className="text-emerald-300">Exact.</strong> One shover against one caller is a two-player game, solved to within {solution.tolerance}bb per hand of equilibrium.</>
          ) : (
            <><strong className="text-amber-200">Approximation.</strong> With {playersBehind} players left to act, the model lets at most one of them call and treats their cards as independent. Real ranges are a little tighter for the shover because two callers can wake up at once.</>
          )}{" "}
          Everyone has the same {stack}bb stack. Chip EV only, no ICM.
        </p>
      </section>

      <section id="ranges" tabIndex={-1} aria-labelledby="ranges-title" className={`jump-target mt-6 rounded-xl border border-line bg-panel p-4 transition-opacity sm:p-6 ${stale ? "opacity-60" : ""}`} aria-busy={stale}>
        <h2 id="ranges-title" className="text-lg font-semibold">Ranges at {spot.stack}bb</h2>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="font-medium">{table.seats[seatIndex]} shoves <span className="tabular text-accent">{pct(solution.shovePct)}</span> of hands</h3>
            <div className="mt-2"><RangeGrid weights={solution.shove} /></div>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted">{formatRange(solution.shove) || "No hands"}</p>
          </div>
          <div>
            <h3 className="flex flex-wrap items-center gap-2 font-medium">
              {callerSeats.length > 1 ? (
                <select aria-label="Caller's seat" value={callerIndex} onChange={(e) => setCaller(Number(e.target.value))} className="rounded-lg border border-line bg-panel-2 px-2 py-1 text-sm">
                  {callerSeats.map((s, i) => <option key={s} value={i}>{s}</option>)}
                </select>
              ) : (
                <span>BB</span>
              )}
              <span>calls <span className="tabular text-accent">{pct(callPct)}</span> of hands</span>
            </h3>
            <div className="mt-2"><RangeGrid weights={calls} /></div>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted">{formatRange(calls) || "No hands"}</p>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
          A solid cell always takes the action; a faint cell takes it only part of the time, because that hand earns the same either way. A number after a colon is how often, so 63s:0.4 means 40% of the time.
          Distance from equilibrium: a best response to these ranges gains {solution.exploitability < 0.00005 ? "less than 0.0001" : solution.exploitability.toFixed(4)}bb per hand (solved in {solution.iterations} iterations).
        </p>
      </section>
    </>
  );
}
