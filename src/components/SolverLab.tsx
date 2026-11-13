"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { handClass, parseCards } from "@/lib/poker/cards";
import { GRID } from "@/lib/poker/ranges";
import { LEAKS, type Leak, type NodeReport, type RiverSolution, type RiverSolver, type Seat, type TreeNode, createRiverSolver } from "@/lib/poker/solver";
import { SPOT_PRESETS, type SpotInput, toRiverSpot } from "@/lib/poker/solver-spots";
import { track } from "@/lib/track";
import { Cards } from "./PlayingCard";

const SEAT = ["Out of position", "In position"] as const;
const TARGET = 0.002;
const MAX_ITERATIONS = 1500;
const STEP = 50;

const FOLD = "#5b83c4";
const PASSIVE = "#34c08b";
const AGGRESSIVE = ["#f2b94a", "#f08a3c", "#e4526e"];

const bb = (x: number) => `${Number(x.toFixed(1))}bb`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0.05 ? "+" : ""}${Number(x.toFixed(1))}bb`;

function actionLabel(node: TreeNode, index: number) {
  const action = node.actions[index];
  if (action.kind === "fold") return "Fold";
  if (action.kind === "check") return "Check";
  if (action.kind === "call") return `Call ${bb(action.added)}`;
  if (action.allIn) return `All-in ${bb(action.added)}`;
  if (action.kind === "raise") return `Raise to ${bb(node.committed[node.player!] + action.added)}`;
  return `Bet ${bb(action.added)} (${pct(action.sizeFrac ?? 0)} pot)`;
}

function actionColor(node: TreeNode, index: number) {
  const action = node.actions[index];
  if (action.kind === "fold") return FOLD;
  if (action.kind === "check" || action.kind === "call") return PASSIVE;
  if (action.kind === "raise" || action.allIn) return AGGRESSIVE[2];
  return AGGRESSIVE[Math.min(index - 1, 1)];
}

type Solved = { solver: RiverSolver; solution: RiverSolution; done: boolean };

export function SolverLab({ initialPreset }: { initialPreset?: string }) {
  const first = SPOT_PRESETS.find((p) => p.id === initialPreset) ?? SPOT_PRESETS[0];
  const [presetId, setPresetId] = useState(first.id);
  const [input, setInput] = useState<SpotInput>(first);
  const [errors, setErrors] = useState<string[]>([]);
  const [solved, setSolved] = useState<Solved | null>(null);
  const [nodeId, setNodeId] = useState(0);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [hero, setHero] = useState<Seat>(1);
  const [leak, setLeak] = useState<Leak | "">("");
  const runId = useRef(0);

  const run = (spotInput: SpotInput, preset: string) => {
    const id = ++runId.current;
    const { spot, errors: problems } = toRiverSpot(spotInput);
    setErrors(problems);
    if (!spot) return;
    let solver: RiverSolver;
    try {
      solver = createRiverSolver(spot);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Could not set up that spot."]);
      return;
    }
    setNodeId(0);
    setSelectedClass(null);
    const tick = () => {
      if (runId.current !== id) return;
      solver.iterate(STEP);
      const solution = solver.solution();
      const done = solution.nashDistance <= TARGET || solver.iterations >= MAX_ITERATIONS;
      setSolved({ solver, solution, done });
      if (!done) return void setTimeout(tick, 0);
      track("solver_run", {
        preset,
        combos: solution.combos[0].length + solution.combos[1].length,
        iterations: solution.iterations,
        converged: solution.nashDistance <= TARGET,
      });
    };
    setTimeout(tick, 0);
  };

  useEffect(() => {
    const timer = setTimeout(() => run(first, first.id), 0);
    return () => clearTimeout(timer);
    // Solve the opening spot once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preset = SPOT_PRESETS.find((p) => p.id === presetId);
  const edit = (patch: Partial<SpotInput>) => {
    setInput({ ...input, ...patch });
    setPresetId("custom");
  };

  const solution = solved?.solution;
  const exploit = useMemo(() => (solved?.done && leak ? solved.solver.exploit(solved.solution, hero, leak) : null), [solved, hero, leak]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
      <section className="review-hero panel-enter rounded-2xl border border-line p-5 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">River solver</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-muted">
          Give both players a range, a pot and a menu of bet sizes. The solver finds the strategy pair where neither player can gain by changing their own play: a Nash equilibrium, which is what players mean by GTO. Then pick a leak and see how much more the best counter-strategy wins.
        </p>
      </section>

      <section id="setup" tabIndex={-1} aria-labelledby="setup-title" className="jump-target mt-8">
        <h2 id="setup-title" className="text-2xl font-semibold tracking-tight">The spot</h2>
        <form
          className="mt-3 grid gap-4 rounded-2xl border border-line bg-panel p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          onSubmit={(e) => {
            e.preventDefault();
            run(input, presetId);
          }}
        >
          <div className="space-y-3">
            <Field label="Example spot" htmlFor="solver-preset">
              <select
                id="solver-preset"
                value={presetId}
                onChange={(e) => {
                  const next = SPOT_PRESETS.find((p) => p.id === e.currentTarget.value);
                  if (!next) return;
                  setPresetId(next.id);
                  setInput(next);
                  run(next, next.id);
                }}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              >
                {SPOT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                {presetId === "custom" && <option value="custom">Your own spot</option>}
              </select>
            </Field>
            {preset && (
              <div className="space-y-2 text-sm leading-relaxed text-muted">
                <p>{preset.story}</p>
                <p><strong className="font-medium text-ink">What to look for.</strong> {preset.lesson}</p>
              </div>
            )}
            <div className="sample-felt flex min-h-20 items-center justify-center rounded-xl border border-accent/20 p-3">
              <Cards cards={parseCards(input.board).slice(0, 5)} />
            </div>
          </div>

          <div className="grid content-start gap-3 sm:grid-cols-2">
            <Field label="Board" htmlFor="solver-board">
              <input id="solver-board" value={input.board} onChange={(e) => edit({ board: e.currentTarget.value })} spellCheck={false} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm" />
            </Field>
            <Field label="Bet sizes (% of pot)" htmlFor="solver-sizes">
              <input id="solver-sizes" value={input.sizes} onChange={(e) => edit({ sizes: e.currentTarget.value })} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm" />
            </Field>
            <Field label="Pot (bb)" htmlFor="solver-pot">
              <input id="solver-pot" type="number" min={0.5} step={0.5} value={input.pot} onChange={(e) => edit({ pot: e.currentTarget.valueAsNumber })} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
            </Field>
            <Field label="Stack behind (bb)" htmlFor="solver-stack">
              <input id="solver-stack" type="number" min={0.5} step={0.5} value={input.stack} onChange={(e) => edit({ stack: e.currentTarget.valueAsNumber })} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
            </Field>
            <Field label={`${SEAT[0]} range (acts first)`} htmlFor="solver-oop">
              <textarea id="solver-oop" rows={4} value={input.oop} onChange={(e) => edit({ oop: e.currentTarget.value })} spellCheck={false} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs leading-relaxed" />
            </Field>
            <Field label={`${SEAT[1]} range (acts last)`} htmlFor="solver-ip">
              <textarea id="solver-ip" rows={4} value={input.ip} onChange={(e) => edit({ ip: e.currentTarget.value })} spellCheck={false} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs leading-relaxed" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={input.allowRaise} onChange={(e) => edit({ allowRaise: e.currentTarget.checked })} className="size-4 accent-accent" />
              Allow one pot-sized raise over a bet
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">Solve</button>
              <p role="status" className="text-sm text-muted">
                {solved && !solved.done && `Solving… ${solved.solution.iterations} iterations`}
              </p>
            </div>
            {errors.length > 0 && (
              <ul role="alert" className="space-y-1 text-sm text-rose-300 sm:col-span-2">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
        </form>
      </section>

      {solution && (
        <>
          <section id="strategy" tabIndex={-1} aria-labelledby="strategy-title" className="jump-target mt-8">
            <h2 id="strategy-title" className="text-2xl font-semibold tracking-tight">Equilibrium strategy</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={`${SEAT[0]} EV`} value={bb(solution.ev[0])} note={`${pct(solution.ev[0] / solution.spot.pot)} of the pot`} />
              <Stat label={`${SEAT[1]} EV`} value={bb(solution.ev[1])} note={`${pct(solution.ev[1] / solution.spot.pot)} of the pot`} />
              <Stat label="Distance from equilibrium" value={`${(solution.nashDistance * 100).toFixed(2)}%`} note="of the pot: the most either player could still gain by deviating" />
              <Stat label="Solved" value={`${solution.iterations} iterations`} note={`${solution.combos[0].length} and ${solution.combos[1].length} combos`} />
            </dl>
            <NodeExplorer
              solution={solution}
              nodeId={nodeId}
              onNode={(id) => {
                setNodeId(id);
                setSelectedClass(null);
              }}
              selectedClass={selectedClass}
              onClass={setSelectedClass}
            />
          </section>

          <section id="exploit" tabIndex={-1} aria-labelledby="exploit-title" className="jump-target mt-8">
            <h2 id="exploit-title" className="text-2xl font-semibold tracking-tight">Exploit a leak</h2>
            <div className="mt-3 rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <p className="max-w-3xl text-sm leading-relaxed text-muted">
                The equilibrium cannot be beaten, but it does not punish mistakes as hard as it could. Give your opponent a leak and compare three numbers: your EV at equilibrium, your EV if you keep playing the equilibrium against the leak, and your EV with the best response to it.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="You are" htmlFor="solver-hero">
                  <select id="solver-hero" value={hero} onChange={(e) => setHero(Number(e.currentTarget.value) as Seat)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm">
                    <option value={0}>{SEAT[0]}</option>
                    <option value={1}>{SEAT[1]}</option>
                  </select>
                </Field>
                <Field label="Your opponent" htmlFor="solver-leak">
                  <select
                    id="solver-leak"
                    value={leak}
                    onChange={(e) => {
                      const next = e.currentTarget.value as Leak | "";
                      setLeak(next);
                      if (next) track("solver_leak", { leak: next, hero });
                    }}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
                  >
                    <option value="">Plays the equilibrium</option>
                    {(Object.keys(LEAKS) as Leak[]).map((k) => <option key={k} value={k}>{LEAKS[k].label}</option>)}
                  </select>
                </Field>
              </div>
              {leak && <p className="mt-2 text-xs leading-relaxed text-muted">{LEAKS[leak].detail}</p>}
              {exploit ? (
                <ExploitView solution={solution} exploit={exploit} nodeId={nodeId} />
              ) : (
                <p className="mt-4 text-sm text-muted">{leak ? "Waiting for the solve to finish." : "Pick a leak to see what it is worth."}</p>
              )}
            </div>
          </section>
        </>
      )}

      <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        The answer is an equilibrium of the model above and nothing wider: two players, these exact ranges, these bet sizes, at most one raise, no rake. Ranges are entered by hand class, so every suit combination of a hand starts with the same weight. Change an input and the strategy changes with it.
      </p>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, note, tone = "text-ink" }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular mt-0.5 text-xl font-semibold ${tone}`}>{value}</dd>
      {note && <dd className="mt-0.5 text-xs leading-snug text-muted">{note}</dd>}
    </div>
  );
}

/** Reach-weighted action mix for each hand class at a node. */
function classMix(solution: RiverSolution, report: NodeReport) {
  const actions = solution.nodes[report.id].actions.length;
  const out = new Map<string, { reach: number; weight: number; mix: number[]; combos: number[] }>();
  solution.combos[report.player].forEach((c, i) => {
    const cls = handClass(c.a, c.b);
    let entry = out.get(cls);
    if (!entry) out.set(cls, (entry = { reach: 0, weight: 0, mix: Array<number>(actions).fill(0), combos: [] }));
    entry.reach += report.reach[i];
    entry.weight += c.w;
    entry.combos.push(i);
    for (let a = 0; a < actions; a++) entry.mix[a] += report.reach[i] * report.strategy[i * actions + a];
  });
  return out;
}

function NodeExplorer({ solution, nodeId, onNode, selectedClass, onClass }: {
  solution: RiverSolution;
  nodeId: number;
  onNode: (id: number) => void;
  selectedClass: string | null;
  onClass: (cls: string | null) => void;
}) {
  const node = solution.nodes[nodeId];
  const report = solution.reports[nodeId]!;
  const mix = useMemo(() => classMix(solution, report), [solution, report]);

  const crumbs: { id: number; label: string }[] = [];
  for (let n = node; n.parent >= 0; n = solution.nodes[n.parent]) {
    const parent = solution.nodes[n.parent];
    crumbs.unshift({ id: n.id, label: `${SEAT[parent.player!]}: ${actionLabel(parent, n.path[n.path.length - 1]).toLowerCase()}` });
  }

  // How often the equilibrium reaches this point at all.
  let arrival = 1;
  for (let n = node; n.parent >= 0; n = solution.nodes[n.parent]) arrival *= solution.reports[n.parent]!.frequency[n.path[n.path.length - 1]];

  const selected = selectedClass ? mix.get(selectedClass) : undefined;

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-line bg-panel p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <nav aria-label="Line so far" className="flex flex-wrap items-center gap-1 text-xs">
          <button type="button" onClick={() => onNode(0)} className="rounded px-1.5 py-1 font-medium text-accent hover:bg-panel-2">River starts</button>
          {crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span aria-hidden="true" className="text-muted">›</span>
              <button type="button" onClick={() => onNode(c.id)} aria-current={c.id === nodeId ? "step" : undefined} className="rounded px-1.5 py-1 text-muted hover:bg-panel-2 hover:text-ink aria-[current]:text-ink">{c.label}</button>
            </span>
          ))}
        </nav>
        <h3 className="mt-3 text-lg font-semibold">{SEAT[report.player]} to act</h3>
        <p className="text-sm text-muted">Pot {bb(node.pot)}{node.toCall > 0 ? ` · ${bb(node.toCall)} to call` : ""}. Pick an action to follow that line.</p>

        {arrival < 0.03 && (
          <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
            The equilibrium reaches this point less than 3% of the time. A solver has little to learn from lines it almost never takes, so treat the strategy here as rough. If an opponent takes this line often, that is itself a deviation.
          </p>
        )}
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-bg" aria-hidden="true">
          {node.actions.map((_, a) => <div key={a} style={{ width: `${report.frequency[a] * 100}%`, background: actionColor(node, a) }} />)}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {node.actions.map((action, a) => {
            const child = solution.nodes[action.child];
            const body = (
              <>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: actionColor(node, a) }} />
                  <span className="font-medium">{actionLabel(node, a)}</span>
                </span>
                <span className="tabular font-semibold">{pct(report.frequency[a])}</span>
              </>
            );
            return (
              <li key={a}>
                {child.player === null ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted" title={child.terminal === "fold" ? "The hand ends" : "Goes to showdown"}>{body}</div>
                ) : (
                  <button type="button" onClick={() => onNode(child.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-left text-sm hover:border-accent/50">{body}</button>
                )}
              </li>
            );
          })}
        </ul>

        <NodeNotes solution={solution} node={node} report={report} />
      </div>

      <div className="min-w-0">
        <div role="group" aria-label={`${SEAT[report.player]} strategy by hand`} className="grid w-full max-w-[460px] gap-px overflow-hidden rounded-md bg-line text-[9px] leading-none sm:text-[10px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
          {GRID.flat().map((cls) => {
            const entry = mix.get(cls);
            const share = entry && entry.weight > 0 ? Math.min(1, entry.reach / entry.weight) : 0;
            const active = share > 0.001;
            const summary = active ? node.actions.map((_, a) => `${actionLabel(node, a)} ${pct(entry!.mix[a] / entry!.reach)}`).join(", ") : "not in range here";
            return (
              <button
                key={cls}
                type="button"
                disabled={!entry}
                aria-pressed={selectedClass === cls}
                aria-label={`${cls}: ${summary}`}
                title={`${cls}: ${summary}`}
                onClick={() => onClass(selectedClass === cls ? null : cls)}
                className={`relative flex aspect-square items-center justify-center bg-panel-2 ${selectedClass === cls ? "z-10 outline outline-2 -outline-offset-1 outline-ink" : ""}`}
              >
                {active && (
                  <span className="absolute inset-x-0 bottom-0 flex" style={{ height: `${Math.max(18, share * 100)}%` }}>
                    {node.actions.map((_, a) => <span key={a} style={{ width: `${(entry!.mix[a] / entry!.reach) * 100}%`, background: actionColor(node, a) }} />)}
                  </span>
                )}
                <span className={`relative font-medium ${active ? "text-slate-950" : entry ? "text-muted" : "text-muted/40"}`}>{cls}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">Each cell is one hand. The colours show how often it takes each action; the height of the coloured part shows how much of that hand is still in the range at this point. Select a hand to see every combo.</p>

        {selectedClass && selected && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-xs">
              <caption className="mb-1 text-left text-sm font-semibold text-ink">{selectedClass}: frequency and EV of each action</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-2 font-medium">Combo</th>
                  {node.actions.map((_, a) => <th key={a} scope="col" className="px-2 py-1 font-medium">{actionLabel(node, a)}</th>)}
                </tr>
              </thead>
              <tbody>
                {selected.combos.map((i) => {
                  const combo = solution.combos[report.player][i];
                  const evs = node.actions.map((_, a) => report.actionEv[a][i]);
                  const top = Math.max(...evs);
                  return (
                    <tr key={i} className="border-t border-line">
                      <th scope="row" className="py-1.5 pr-2 font-normal"><Cards cards={[combo.a, combo.b]} size="sm" /></th>
                      {node.actions.map((_, a) => (
                        <td key={a} className="tabular px-2 py-1.5">
                          <span className="font-semibold text-ink">{pct(report.strategy[i * node.actions.length + a])}</span>{" "}
                          <span className={Number.isNaN(evs[a]) ? "text-muted" : evs[a] >= top - 0.05 ? "text-accent" : "text-muted"}>{Number.isNaN(evs[a]) ? "n/a" : signed(evs[a])}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-relaxed text-muted">EV is chips won from the start of the river. A hand that mixes two actions has the same EV for both: that is what makes the mix an equilibrium.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeNotes({ solution, node, report }: { solution: RiverSolution; node: TreeNode; report: NodeReport }) {
  const defence = report.defence;
  const bets = node.actions.flatMap((action, a) => {
    const split = report.bets[a];
    if (!split || report.frequency[a] < 0.05) return [];
    const child = solution.nodes[action.child];
    return [{ a, ...split, share: split.bluff / (split.value + split.bluff), price: child.toCall / (child.pot + child.toCall) }];
  });
  if (!defence && !bets.length) return null;
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm leading-relaxed text-muted">
      {defence && (
        <div>
          <p>
            <strong className="font-medium text-ink">Defence.</strong> This range continues <span className="tabular font-semibold text-ink">{pct(defence.frequency)}</span> of the time. The minimum defence frequency for this bet is <span className="tabular font-semibold text-amber-200">{pct(defence.mdf)}</span>, and a call needs <span className="tabular font-semibold text-ink">{pct(defence.potOdds)}</span> equity to break even.
          </p>
          <p className="mt-1 text-xs">
            {defence.frequency < defence.mdf - 0.03
              ? "Folding more than the minimum is right here. The rule assumes a bluff is worth nothing if checked instead; when the bettor's weak hands still win some showdowns, or the bettor runs out of bluffs, the caller can fold more."
              : defence.frequency > defence.mdf + 0.03
                ? "Continuing more than the minimum is right here because many hands in this range beat part of the betting range outright, so they call for value and not only to stop bluffs."
                : "That is the minimum defence frequency at work: continue just often enough that a bluff with no showdown value makes nothing."}
          </p>
        </div>
      )}
      {bets.map((b) => (
        <p key={b.a}>
          <strong className="font-medium text-ink">{actionLabel(node, b.a)}.</strong> <span className="tabular font-semibold text-ink">{b.value.toFixed(1)}</span> value combos and <span className="tabular font-semibold text-ink">{b.bluff.toFixed(1)}</span> bluff combos, so bluffs are <span className="tabular font-semibold text-amber-200">{pct(b.share)}</span> of the bets. The caller is offered {pct(b.price)} pot odds, which is the bluff share that would leave a pure bluff-catcher indifferent.
        </p>
      ))}
      {bets.length > 0 && <p className="text-xs">A bet counts as value when it has at least 50% equity against the hands that continue, and as a bluff otherwise.</p>}
    </div>
  );
}

function ExploitView({ solution, exploit, nodeId }: { solution: RiverSolution; exploit: NonNullable<ReturnType<RiverSolver["exploit"]>>; nodeId: number }) {
  const node = solution.nodes[nodeId];
  const before = solution.reports[nodeId]!;
  const after = exploit.reports[nodeId]!;
  const yours = before.player === exploit.hero;
  const gain = exploit.evExploit - exploit.evEquilibrium;
  return (
    <div className="mt-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Both play the equilibrium" value={bb(exploit.evEquilibrium)} note="Your share of the pot when nobody errs" />
        <Stat label="You keep playing the equilibrium" value={bb(exploit.evUnchanged)} note={`${signed(exploit.evUnchanged - exploit.evEquilibrium)} from their leak alone, before you adjust`} />
        <Stat label="You play the best response" value={bb(exploit.evExploit)} tone="text-accent" note={`${signed(gain)} against equilibrium, ${pct(gain / solution.spot.pot)} of the pot`} />
      </dl>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-sm">
          <caption className="mb-1 text-left text-sm text-muted">
            <span className="font-semibold text-ink">{SEAT[before.player]} to act</span> at the point selected above: {yours ? "how your best response changes" : "what the leak does to their play"}.
          </caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">Action</th>
              <th scope="col" className="px-2 py-1 font-medium">Equilibrium</th>
              <th scope="col" className="px-2 py-1 font-medium">{yours ? "Best response" : "With the leak"}</th>
            </tr>
          </thead>
          <tbody>
            {node.actions.map((_, a) => (
              <tr key={a} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 font-normal">{actionLabel(node, a)}</th>
                <td className="tabular px-2 py-1.5">{pct(before.frequency[a])}</td>
                <td className="tabular px-2 py-1.5 font-semibold text-ink">{pct(after.frequency[a])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        The best response assumes you know the leak exactly. It is itself easy to exploit: an opponent who notices can adjust and take the gain back, which is the trade between exploitative and equilibrium play.
      </p>
    </div>
  );
}
