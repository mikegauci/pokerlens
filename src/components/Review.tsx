"use client";

import { useMemo, useState } from "react";
import { Decision, HandAnalysis, PROFILES, Verdict, VillainProfile, analyzeHand } from "@/lib/poker/analyze";
import { parseHand } from "@/lib/poker/parser";
import { parseRange } from "@/lib/poker/ranges";
import { SAMPLES } from "@/lib/poker/samples";
import { Cards } from "./PlayingCard";
import { RangeGrid } from "./RangeGrid";
import { TableView } from "./TableView";
import { CoachPanel } from "./CoachPanel";
import { AccountButton, AuthDialog, SaveButton, SavedHands, useUser } from "./Account";
import { track } from "@/lib/track";

const VERDICT: Record<Verdict, { label: string; chip: string; dot: string }> = {
  good: { label: "Good", chip: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30", dot: "bg-emerald-400" },
  ok: { label: "Fine", chip: "bg-sky-400/15 text-sky-300 border-sky-400/30", dot: "bg-sky-400" },
  inaccuracy: { label: "Inaccuracy", chip: "bg-amber-400/15 text-amber-300 border-amber-400/30", dot: "bg-amber-400" },
  mistake: { label: "Mistake", chip: "bg-rose-400/15 text-rose-300 border-rose-400/30", dot: "bg-rose-400" },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString();

export default function Review() {
  const [draft, setDraft] = useState("");
  const [handText, setHandText] = useState<string | null>(null);
  const [profile, setProfile] = useState<VillainProfile>("standard");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const user = useUser();

  const result = useMemo((): { analysis?: HandAnalysis; error?: string } => {
    if (!handText) return {};
    try {
      return { analysis: analyzeHand(parseHand(handText), { profile, rangeOverrides: overrides }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not read that hand." };
    }
  }, [handText, profile, overrides]);

  const load = (text: string, source: string, saved?: { profile: VillainProfile; overrides: Record<string, string> }) => {
    setOverrides(saved?.overrides ?? {});
    setProfile(saved?.profile ?? "standard");
    setHandText(text);
    let first = 0;
    try {
      const a = analyzeHand(parseHand(text));
      const flagged = a.decisions.findIndex((d) => d.verdict === "mistake" || d.verdict === "inaccuracy");
      // With nothing flagged, open on the biggest decision of the hand instead of the first.
      const biggest = a.decisions.reduce((best, d) => (d.toCall + d.action.added > a.decisions[best].toCall + a.decisions[best].action.added ? d.index : best), 0);
      first = flagged >= 0 ? flagged : biggest;
      setStep(a.decisions[first]?.actionIndex ?? 0);
      track("hand_analyzed", { source, decisions: a.decisions.length, mistakes: a.summary.counts.mistake, inaccuracies: a.summary.counts.inaccuracy, tournament: a.hand.isTournament });
    } catch {
      /* the error is shown from the memo above */
      track("parse_error", { source });
    }
    setSelected(first);
  };

  const analysis = result.analysis;
  const account = <AccountButton user={user} onSignIn={() => setAuthOpen(true)} />;
  const dialog = authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null;

  if (!analysis) {
    return (
      <Shell account={account}>
        {dialog}
        <section className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find the decision that cost you the pot.</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Paste a hand history. PokerLens replays it, works out your equity, pot odds and EV at every decision, and a coach explains what to do differently.
          </p>
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) load(draft, "paste");
            }}
          >
            <label htmlFor="hh" className="text-sm font-medium">
              Hand history
            </label>
            <textarea
              id="hh"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              placeholder={"PokerStars Hand #123456789:  Hold'em No Limit ($0.50/$1.00 USD) ...\nTable 'Alnitak IV' 6-max Seat #4 is the button\nSeat 1: ..."}
              className="mt-2 h-44 w-full resize-y rounded-xl border border-line bg-panel p-3 font-mono text-xs text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
            {result.error && (
              <p role="alert" className="mt-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                {result.error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-40">
                Review hand
              </button>
              <span className="text-xs text-muted">PokerStars text format, No-Limit Hold&apos;em cash or tournament.</span>
            </div>
          </form>

          <h2 className="mt-12 text-sm font-medium uppercase tracking-wider text-muted">Or try a sample hand</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {SAMPLES.map((s) => (
              <li key={s.id}>
                <button onClick={() => load(s.text, `sample:${s.id}`)} className="h-full w-full rounded-xl border border-line bg-panel p-4 text-left transition hover:border-accent/60 hover:bg-panel-2">
                  <span className="block font-medium">{s.title}</span>
                  <span className="mt-1 block text-sm text-muted">{s.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          <SavedHands
            user={user}
            onOpen={(h) => {
              track("saved_hand_opened");
              load(h.hand_text, "saved", { profile: h.profile, overrides: h.range_overrides ?? {} });
            }}
          />
          <Method />
        </section>
      </Shell>
    );
  }

  const d = analysis.decisions[Math.min(selected, analysis.decisions.length - 1)];
  const snap = analysis.timeline[Math.min(step, analysis.timeline.length - 1)];
  const { summary, hand } = analysis;
  const lastStep = analysis.timeline.length - 1;

  const select = (i: number) => {
    track("decision_viewed", { street: analysis.decisions[i].street, verdict: analysis.decisions[i].verdict });
    setSelected(i);
    setStep(analysis.decisions[i].actionIndex);
  };

  return (
    <Shell onReset={() => setHandText(null)} account={account}>
      {dialog}
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <Cards cards={hand.heroCards} size="lg" />
            <div>
              <div className="font-semibold">
                {summary.heroClass} in {summary.heroPosition}
              </div>
              <div className="tabular text-xs text-muted">
                {hand.game} · {hand.players.length}-handed · {num(summary.heroStackBb)}bb deep
              </div>
            </div>
          </div>
          <Stat label="Result" value={`${summary.netBb >= 0 ? "+" : ""}${num(summary.netBb)}bb`} tone={summary.netBb >= 0 ? "text-emerald-300" : "text-rose-300"} />
          <Stat label="EV lost (quantified spots)" value={summary.evLossBb > 0 ? `${num(summary.evLossBb)}bb` : "none"} tone={summary.evLossBb > 0 ? "text-rose-300" : "text-ink"} />
          <div className="flex items-center gap-2 text-xs">
            {(Object.keys(VERDICT) as Verdict[]).map((v) =>
              summary.counts[v] ? (
                <span key={v} className={`rounded-full border px-2 py-0.5 ${VERDICT[v].chip}`}>
                  {summary.counts[v]} {VERDICT[v].label.toLowerCase()}
                </span>
              ) : null,
            )}
          </div>
          <div className="ml-auto flex items-end gap-4">
            <SaveButton key={`${handText}:${profile}:${JSON.stringify(overrides)}`} user={user} analysis={analysis} handText={handText!} profile={profile} overrides={overrides} onNeedAuth={() => setAuthOpen(true)} />
            <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Opponent bluffs</div>
            <div className="mt-1 inline-flex rounded-lg border border-line bg-bg p-0.5" role="radiogroup" aria-label="Opponent profile">
              {(Object.keys(PROFILES) as VillainProfile[]).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={profile === p}
                  title={PROFILES[p].hint}
                  onClick={() => {
                    if (p !== profile) track("profile_changed", { profile: p });
                    setProfile(p);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${profile === p ? "bg-accent font-semibold text-emerald-950" : "text-muted hover:text-ink"}`}
                >
                  {PROFILES[p].label}
                </button>
              ))}
            </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-panel p-3">
              <TableView hand={hand} snap={snap} showdown={step === lastStep} />
              <div className="mt-1 flex items-center gap-2">
                <button aria-label="Previous action" onClick={() => setStep(Math.max(0, step - 1))} className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-panel-2">
                  ‹
                </button>
                <input aria-label="Hand progress" type="range" min={0} max={lastStep} value={step} onChange={(e) => setStep(Number(e.target.value))} className="flex-1 accent-emerald-400" />
                <button aria-label="Next action" onClick={() => setStep(Math.min(lastStep, step + 1))} className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-panel-2">
                  ›
                </button>
              </div>
            </div>
            <ol className="max-h-[420px] overflow-y-auto rounded-xl border border-line bg-panel p-2 text-sm">
              {analysis.timeline.map((s, i) => {
                if (/posts/.test(s.text)) return null;
                const dec = s.decisionIndex !== null ? analysis.decisions[s.decisionIndex] : null;
                const newStreet = i === 0 || analysis.timeline[i - 1].street !== s.street || /posts/.test(analysis.timeline[i - 1].text);
                return (
                  <li key={i}>
                    {newStreet && (
                      <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[11px] uppercase tracking-wider text-muted">
                        {s.street} {s.board.length > 0 && <Cards cards={s.board} size="sm" />}
                      </div>
                    )}
                    <button
                      onClick={() => (dec ? select(dec.index) : setStep(i))}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${i === step ? "bg-panel-2" : "hover:bg-panel-2/60"} ${dec ? "font-medium" : "text-muted"}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dec ? VERDICT[dec.verdict].dot : "bg-transparent"}`} />
                      <span className="flex-1">{s.text}</span>
                      {dec && <span className={`rounded-full border px-2 py-0.5 text-[11px] ${VERDICT[dec.verdict].chip}`}>{dec.title}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="space-y-4">
            <DecisionPanel
              key={`${d.index}-${profile}`}
              d={d}
              bb={hand.bb}
              heroClass={summary.heroClass}
              total={analysis.decisions.length}
              overrides={overrides}
              onOverride={(name, text) => {
                track("range_edited", { reset: !text });
                setOverrides((o) => {
                  const next = { ...o };
                  if (text) next[name] = text;
                  else delete next[name];
                  return next;
                });
              }}
              onPrev={d.index > 0 ? () => select(d.index - 1) : undefined}
              onNext={d.index < analysis.decisions.length - 1 ? () => select(d.index + 1) : undefined}
            />
            <CoachPanel key={handText} handText={handText!} profile={profile} overrides={overrides} />
          </div>
        </div>
        <Method />
      </div>
    </Shell>
  );
}

function Shell({ children, onReset, account }: { children: React.ReactNode; onReset?: () => void; account?: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-black text-emerald-950">♠</span>
          <span className="font-semibold tracking-tight">PokerLens</span>
          <span className="hidden text-sm text-muted sm:inline">Poker hand review</span>
          <div className="ml-auto flex items-center gap-2">
            {onReset && (
              <button onClick={onReset} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-panel-2">
                <span className="sm:hidden">New hand</span>
                <span className="hidden sm:inline">Review another hand</span>
              </button>
            )}
            {account}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function DecisionPanel({
  d,
  bb,
  heroClass,
  total,
  overrides,
  onOverride,
  onPrev,
  onNext,
}: {
  d: Decision;
  bb: number;
  heroClass: string;
  total: number;
  overrides: Record<string, string>;
  onOverride: (name: string, text: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const inBb = (x: number) => `${num(x / bb)}bb`;
  const v = VERDICT[d.verdict];
  const actionText =
    d.action.type === "raise"
      ? `raise to ${inBb(d.action.to ?? d.action.added)}`
      : d.action.type === "bet"
        ? `bet ${inBb(d.action.added)}`
        : d.action.type === "call"
          ? `call ${inBb(d.action.added)}`
          : d.action.type;
  const facing = d.toCall > 0 && d.potOdds !== undefined && d.equity !== undefined && d.villains.length > 0;

  return (
    <section className="rounded-xl border border-line bg-panel p-4" aria-label="Decision detail">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Decision {d.index + 1} of {total} · {d.street}
            {d.inPosition !== null && ` · ${d.inPosition ? "in position" : "out of position"}`}
          </div>
          <h2 className="mt-1 text-xl font-semibold">
            You {actionText}
            {d.action.allIn ? " (all-in)" : ""}
          </h2>
          {d.street !== "preflop" && <p className="text-sm text-muted">Holding {d.handDesc}</p>}
        </div>
        <div className="flex gap-1">
          <button aria-label="Previous decision" disabled={!onPrev} onClick={onPrev} className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-panel-2 disabled:opacity-30">
            ‹
          </button>
          <button aria-label="Next decision" disabled={!onNext} onClick={onNext} className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-panel-2 disabled:opacity-30">
            ›
          </button>
        </div>
      </div>

      <div className={`mt-3 rounded-lg border px-3 py-2 ${v.chip}`}>
        <span className="text-xs font-semibold uppercase tracking-wider">{v.label}</span>
        <span className="ml-2 font-medium text-ink">{d.title}</span>
        {d.evLossBb ? <span className="tabular ml-2 text-sm">about {num(d.evLossBb)}bb lost</span> : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Pot" value={inBb(d.pot)} />
        {d.equity !== undefined && <Tile label={d.street === "preflop" && !d.exact ? "Raw equity" : "Your equity"} value={pct(d.equity)} hint="Against the assumed range below" />}
        {facing && <Tile label={d.exact ? "Equity needed" : "Needed on price alone"} value={pct(d.potOdds!)} hint={`${inBb(d.toCall)} to win ${inBb(d.pot)}`} />}
        {facing && d.evCall !== undefined && d.exact && <Tile label="EV of calling" value={`${d.evCall >= 0 ? "+" : ""}${inBb(d.evCall)}`} hint="Compared with folding" tone={d.evCall >= 0 ? "text-emerald-300" : "text-rose-300"} />}
        {facing && d.evCall !== undefined && !d.exact && d.street !== "preflop" && <Tile label="EV if checked down" value={`${d.evCall >= 0 ? "+" : ""}${inBb(d.evCall)}`} hint="Ignores betting on later streets" />}
        {d.betPct !== undefined && <Tile label="Your size" value={`${pct(d.betPct)} pot`} />}
        {d.breakevenFold !== undefined && d.street !== "preflop" && <Tile label="Bluff break-even" value={pct(d.breakevenFold)} hint="Folds needed for a pure bluff" />}
        {d.spr !== null && <Tile label="SPR" value={num(d.spr)} hint="Effective stack to pot" />}
      </dl>

      {facing && (d.exact || d.street !== "preflop") && (
        <div className="mt-4" aria-hidden>
          <div className="relative h-3 rounded-full bg-panel-2">
            <div className={`absolute inset-y-0 left-0 rounded-full ${!d.exact ? "bg-sky-400" : d.equity! >= d.potOdds! ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${d.equity! * 100}%` }} />
            <div className="absolute -inset-y-1 w-0.5 bg-amber-200" style={{ left: `${d.potOdds! * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>Bar: your equity</span>
            <span>Marker: equity needed to call</span>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-1.5 text-sm leading-relaxed">
        {d.reasons.map((r, i) => (
          <li key={i} className={i === 0 ? "" : "text-muted"}>
            {r}
          </li>
        ))}
      </ul>

      {d.villains.map((vill) => (
        <VillainRange key={`${vill.name}:${overrides[vill.name] ?? ""}`} vill={vill} heroClass={heroClass} current={overrides[vill.name]} onOverride={(t) => onOverride(vill.name, t)} />
      ))}
    </section>
  );
}

function Tile({ label, value, hint, tone = "text-ink" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-panel-2 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`tabular text-lg font-semibold ${tone}`}>{value}</dd>
      {hint && <div className="text-[11px] leading-tight text-muted">{hint}</div>}
    </div>
  );
}

function VillainRange({ vill, heroClass, current, onOverride }: { vill: Decision["villains"][number]; heroClass: string; current?: string; onOverride: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(current ?? vill.rangeText);
  const [errors, setErrors] = useState<string[]>([]);

  const apply = () => {
    const parsed = parseRange(text);
    if (parsed.errors.length || parsed.range.size === 0) {
      setErrors(parsed.errors.length ? parsed.errors : ["Enter at least one hand."]);
      return;
    }
    setErrors([]);
    onOverride(text);
    setEditing(false);
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-semibold">
          {vill.name} <span className="font-normal text-muted">({vill.position})</span>
        </h3>
        <span className="text-xs text-muted">
          assumed range: {vill.rangeLabel} · {vill.combos} combos left
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <RangeGrid weights={vill.weights} highlight={heroClass} />
        <div className="flex-1 text-xs text-muted">
          <p>Brighter cells are hands this opponent still holds often after their actions so far. Your hand is outlined.</p>
          {!editing ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setEditing(true)} className="rounded-md border border-line px-2.5 py-1 text-ink hover:bg-panel-2">
                Edit preflop range
              </button>
              {vill.custom && (
                <button onClick={() => onOverride("")} className="rounded-md border border-line px-2.5 py-1 text-ink hover:bg-panel-2">
                  Reset to chart
                </button>
              )}
            </div>
          ) : (
            <div className="mt-2">
              <label className="sr-only" htmlFor={`range-${vill.name}`}>
                Preflop range for {vill.name}
              </label>
              <textarea
                id={`range-${vill.name}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                className="h-20 w-full rounded-md border border-line bg-bg p-2 font-mono text-xs text-ink focus:border-accent focus:outline-none"
              />
              {errors.map((e) => (
                <p key={e} role="alert" className="text-rose-300">
                  {e}
                </p>
              ))}
              <div className="mt-1 flex gap-2">
                <button onClick={apply} className="rounded-md bg-accent px-2.5 py-1 font-semibold text-emerald-950">
                  Apply
                </button>
                <button onClick={() => setEditing(false)} className="rounded-md border border-line px-2.5 py-1 text-ink">
                  Cancel
                </button>
              </div>
              <p className="mt-1">Example: 22+, A2s+, K9s+, QTs+, A7o+, KTo+</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Method() {
  return (
    <details className="mt-10 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
      <summary className="cursor-pointer font-medium text-ink">How the numbers are produced, and what they are not</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>
          <strong className="text-ink">Equity</strong> is Monte Carlo showdown equity against each opponent&apos;s assumed range, with card removal. The same hand always gives the same numbers.
        </li>
        <li>
          <strong className="text-ink">Opponent ranges</strong> start from simplified 6-max, 100bb preflop charts chosen by position and action, then get reweighted after each postflop bet, call or check. This is a transparent heuristic, not a solver. You can replace any range and pick how often opponents bluff.
        </li>
        <li>
          <strong className="text-ink">Pot odds and EV of calling</strong> are exact arithmetic. When no more betting can follow (river or all-in), comparing equity with pot odds is the whole decision for the assumed range. Earlier in the hand, implied odds and position also matter, so those verdicts are softer.
        </li>
        <li>
          <strong className="text-ink">The coach</strong> is a language model that only sees the computed numbers. It explains them and is told not to produce its own.
        </li>
        <li>Short stacks, ICM, rake and mixed strategies are not modelled yet.</li>
      </ul>
    </details>
  );
}
