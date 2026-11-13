"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Decision, HandAnalysis, PROFILES, Verdict, VillainProfile, analyzeHand } from "@/lib/poker/analyze";
import { ActionType, parseHand } from "@/lib/poker/parser";
import { parseRange } from "@/lib/poker/ranges";
import { SAMPLES, type SampleHand } from "@/lib/poker/samples";
import { Cards } from "./PlayingCard";
import { AppShell } from "./AppShell";
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

const STREETS = ["preflop", "flop", "turn", "river"] as const;
const SAMPLE_PREVIEWS = SAMPLES.map((sample) => {
  const hand = parseHand(sample.text);
  const street = STREETS.indexOf(sample.previewStreet);
  return { ...sample, heroCards: hand.heroCards, board: hand.board.slice(0, street === 0 ? 0 : street + 2) };
});
const DEMO = SAMPLE_PREVIEWS[0];
const ACTION: Record<ActionType, { label: string; color: string }> = {
  post: { label: "Post", color: "bg-panel-2 text-muted" },
  fold: { label: "Fold", color: "bg-slate-400/15 text-slate-300" },
  check: { label: "Check", color: "bg-sky-400/15 text-sky-300" },
  call: { label: "Call", color: "bg-emerald-400/15 text-emerald-300" },
  bet: { label: "Bet", color: "bg-amber-400/15 text-amber-200" },
  raise: { label: "Raise", color: "bg-violet-400/15 text-violet-200" },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString();
const rounded = (x: number) => Number(num(x));
const signedBb = (value: number) => `${value > 0 ? "+" : ""}${value}bb`;
const signedTone = (value: number) => value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-ink";

function trackAnalysis(analysis: HandAnalysis, source: string) {
  const { counts } = analysis.summary;
  track("hand_analyzed", {
    source,
    decisions: analysis.decisions.length,
    mistakes: counts.mistake,
    inaccuracies: counts.inaccuracy,
    tournament: analysis.hand.isTournament,
  });
}

function initialDecision(analysis: HandAnalysis, street?: SampleHand["previewStreet"]) {
  const decisions = analysis.decisions;
  const biggest = (candidates: Decision[]) => candidates.reduce((best, decision) =>
    decision.toCall + decision.action.added > best.toCall + best.action.added ? decision : best,
  );
  const onStreet = street ? decisions.filter((decision) => decision.street === street) : [];
  if (onStreet.length) return biggest(onStreet);
  return decisions.find((decision) => decision.verdict === "mistake" || decision.verdict === "inaccuracy") ?? biggest(decisions);
}

export default function Review({ initialSample }: { initialSample?: SampleHand }) {
  const [draft, setDraft] = useState("");
  const [handText, setHandText] = useState<string | null>(initialSample?.text ?? null);
  const [profile, setProfile] = useState<VillainProfile>("standard");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showdown, setShowdown] = useState(false);
  const [selection, setSelection] = useState<{ index: number; step: number } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const user = useUser();
  const workspaceTitle = useRef<HTMLHeadingElement>(null);
  const actionHistory = useRef<HTMLOListElement>(null);
  const trackedInitialSample = useRef(false);

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
    setShowdown(false);
    setSelection(null);
    try {
      const a = analyzeHand(parseHand(text), { profile: saved?.profile, rangeOverrides: saved?.overrides });
      const decision = initialDecision(a, source === `sample:${DEMO.id}` ? DEMO.previewStreet : undefined);
      setSelection({ index: decision.index, step: decision.actionIndex });
      trackAnalysis(a, source);
    } catch {
      track("parse_error", { source });
    }
  };

  const goHome = () => {
    setHandText(null);
    setSelection(null);
    setAuthOpen(false);
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const analysis = result.analysis;
  const hasAnalysis = Boolean(analysis);
  const defaultDecision = analysis && !selection ? initialDecision(analysis, initialSample?.previewStreet) : undefined;
  const selected = selection?.index ?? defaultDecision?.index ?? 0;
  const step = selection?.step ?? defaultDecision?.actionIndex ?? 0;
  useEffect(() => {
    if (!initialSample || !analysis || trackedInitialSample.current) return;
    trackedInitialSample.current = true;
    trackAnalysis(analysis, `sample:${initialSample.id}`);
  }, [initialSample, analysis]);
  useEffect(() => {
    if (hasAnalysis) workspaceTitle.current?.focus();
  }, [hasAnalysis]);
  useEffect(() => {
    const history = actionHistory.current;
    const current = history?.querySelector<HTMLButtonElement>('[aria-current="step"]');
    if (!history || !current) return;
    const top = current.offsetTop;
    const bottom = top + current.offsetHeight;
    if (top < history.scrollTop) history.scrollTop = top;
    if (bottom > history.scrollTop + history.clientHeight) history.scrollTop = bottom - history.clientHeight;
  }, [hasAnalysis, step]);
  const account = <AccountButton user={user} onSignIn={() => setAuthOpen(true)} />;
  const dialog = authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null;

  if (!analysis) {
    return (
      <AppShell onHome={initialSample ? undefined : goHome} account={account} links={[
        { href: "#import", label: "Import" },
        { href: "#samples", label: "Sample hands" },
        ...(user ? [{ href: "#saved-hands", label: "Saved hands" }] : []),
      ]}>
        {dialog}
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 sm:pt-9">
          <section className="review-hero panel-enter grid items-center gap-7 rounded-2xl border border-line p-6 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
            <div>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Review your toughest poker decisions</h1>
              <p className="mt-3 max-w-lg leading-relaxed text-muted">
                Replay a No-Limit Hold&apos;em hand, compare your equity with the price to call, and see how the opponent&apos;s range changes the answer.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => load(DEMO.text, `sample:${DEMO.id}`)} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300">
                  Review a sample hand <span aria-hidden="true">→</span>
                </button>
                <a href="#import" className="rounded-lg border border-line bg-bg/35 px-4 py-2.5 text-sm font-semibold hover:bg-panel-2">Import your hand</a>
              </div>
            </div>
            <div className="featured-preview min-w-0 rounded-xl border border-line bg-bg/70 p-4 sm:p-5">
              <h2 className="font-semibold">{DEMO.title}</h2>
              <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">Hero · BTN</p>
                  <Cards cards={DEMO.heroCards} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">River board</p>
                  <Cards cards={DEMO.board} />
                </div>
              </div>
              <p className="mt-4 text-sm text-muted">A♥ J♥ flops top pair. When the king lands and the big blind leads for 16bb, is second pair enough to call?</p>
            </div>
          </section>
          <section id="samples" tabIndex={-1} className="jump-target mt-7" aria-labelledby="samples-title">
            <h2 id="samples-title" className="text-xl font-semibold">Sample hands</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAMPLE_PREVIEWS.map((sample) => (
                <li key={sample.id} className="min-w-0">
                  <button
                    onClick={() => load(sample.text, `sample:${sample.id}`)}
                    className="sample-card group flex h-full w-full flex-col gap-3 rounded-xl border border-line bg-panel p-3 text-left hover:border-accent/45 focus-visible:border-accent/45"
                  >
                    <span className="sample-felt flex min-h-24 w-full flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-accent/15 p-2.5">
                      <span className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium text-emerald-100/80">Hero</span>
                        <span className="sample-holding inline-flex"><Cards cards={sample.heroCards} size="sm" /></span>
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium capitalize text-emerald-100/80">{sample.previewStreet}</span>
                        {sample.board.length ? <Cards cards={sample.board} size="sm" /> : (
                          <span className="flex h-8 items-center gap-1.5 text-xs text-emerald-100/80">
                            <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-dashed border-amber-200" />
                            Facing a raise
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex w-full items-baseline justify-between gap-2 px-0.5">
                      <span className="text-sm font-semibold group-hover:text-accent group-focus-visible:text-accent">{sample.title}</span>
                      <span aria-hidden="true" className="sample-arrow shrink-0 text-accent">→</span>
                    </span>
                    <span className="-mt-2 px-0.5 pb-1 text-xs leading-relaxed text-muted">{sample.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section id="import" tabIndex={-1} className="jump-target mt-6 rounded-xl border border-line bg-panel p-5">
            <h2 className="text-xl font-semibold">Import a hand</h2>
            <p id="hand-format" className="mt-1 text-sm text-muted">PokerStars text format · No-Limit Hold&apos;em cash or tournament</p>
            <form className="mt-4" onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) load(draft, "paste");
            }}>
              <label htmlFor="hh" className="text-sm font-medium">Hand history</label>
              <textarea
                id="hh"
                aria-describedby="hand-format"
                aria-invalid={Boolean(result.error)}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                placeholder={"PokerStars Hand #123456789: Hold'em No Limit ($0.50/$1.00 USD) ...\nTable 'Alnitak IV' 6-max Seat #4 is the button\nSeat 1: ..."}
                className="mt-2 block h-36 w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed placeholder:text-muted/65"
              />
              {result.error && (
                <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                  {result.error}
                </p>
              )}
              <button type="submit" disabled={!draft.trim()} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-40">
                Review hand
              </button>
            </form>
          </section>
          <SavedHands
            user={user}
            onOpen={(h) => {
              track("saved_hand_opened");
              load(h.hand_text, "saved", { profile: h.profile, overrides: h.range_overrides ?? {} });
            }}
          />
          <Method />
        </div>
      </AppShell>
    );
  }

  const d = analysis.decisions[Math.min(selected, analysis.decisions.length - 1)];
  const snap = analysis.timeline[Math.min(step, analysis.timeline.length - 1)];
  const { summary, hand } = analysis;
  const lastStep = analysis.timeline.length - 1;
  const hasRunout = hand.board.length > analysis.timeline[lastStep].board.length || Object.keys(hand.shown).some((player) => player !== hand.hero);

  const select = (i: number) => {
    track("decision_viewed", { street: analysis.decisions[i].street, verdict: analysis.decisions[i].verdict });
    setSelection({ index: i, step: analysis.decisions[i].actionIndex });
    setShowdown(false);
  };

  const replayAt = (index: number) => {
    const next = analysis.timeline[index];
    if (!next) return;
    setShowdown(false);
    if (next.decisionIndex !== null && next.decisionIndex !== selected) select(next.decisionIndex);
    else setSelection({ index: selected, step: index });
  };

  return (
    <AppShell
      onHome={initialSample ? undefined : goHome}
      reviewing
      account={account}
      links={[
        { href: "#replay", label: "Replay" },
        { href: "#analysis", label: "Decision analysis" },
        { href: "#coach", label: "Coach" },
      ]}
    >
      {dialog}
      <div className="panel-enter mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <section aria-labelledby="workspace-title" className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-xl border border-line bg-panel px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Cards cards={hand.heroCards} size="lg" />
            <div>
              <h1 id="workspace-title" ref={workspaceTitle} tabIndex={-1} className="text-xl font-semibold tracking-tight">
                {summary.heroClass} in {summary.heroPosition}
              </h1>
              <p className="tabular text-xs text-muted">
                {hand.game} · {hand.players.length}-handed · {num(summary.heroStackBb)}bb deep
              </p>
            </div>
          </div>
          <Stat label="Hand result" value={signedBb(rounded(summary.netBb))} tone={signedTone(rounded(summary.netBb))} />
          <Stat label="Estimated EV lost" value={`${num(summary.evLossBb)}bb`} tone={summary.evLossBb > 0 ? "text-rose-300" : "text-ink"} />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(Object.keys(VERDICT) as Verdict[]).map((v) =>
              summary.counts[v] ? (
                <span key={v} className={`rounded-full border px-2 py-0.5 ${VERDICT[v].chip}`}>
                  {summary.counts[v]} {v === "inaccuracy" && summary.counts[v] > 1 ? "inaccuracies" : VERDICT[v].label.toLowerCase()}{summary.counts[v] > 1 && v === "mistake" ? "s" : ""}
                </span>
              ) : null,
            )}
          </div>
          <div className="sm:ml-auto">
            <SaveButton key={`${handText}:${profile}:${JSON.stringify(overrides)}`} user={user} analysis={analysis} handText={handText!} profile={profile} overrides={overrides} onNeedAuth={() => setAuthOpen(true)} />
          </div>
        </section>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section id="replay" tabIndex={-1} aria-labelledby="replay-title" className="jump-target min-w-0 rounded-xl border border-line bg-panel">
            <div className="border-b border-line p-4">
              <h2 id="replay-title" className="text-lg font-semibold">Hand replay</h2>
              <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Jump to street" role="group">
                {STREETS.map((street) => {
                  const index = analysis.timeline.findIndex((item, i) => item.street === street && hand.actions[i].type !== "post");
                  return (
                    <button key={street} onClick={() => replayAt(index)} disabled={index < 0} aria-pressed={snap.street === street} className={`rounded-md border px-1 py-1.5 text-xs font-medium capitalize disabled:opacity-40 ${snap.street === street ? "border-sky-400/40 bg-sky-400/15 text-sky-200" : "border-line bg-bg text-muted enabled:hover:text-ink"}`}>
                      {street}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-3 pb-3">
              <TableView hand={hand} snap={snap} showdown={showdown} />
              <div className="flex items-center gap-2">
                <button aria-label="Previous action" disabled={step === 0} onClick={() => replayAt(step - 1)} className="rounded-md border border-line px-3 py-1 text-sm hover:bg-panel-2 disabled:opacity-35">‹</button>
                <input aria-label="Hand progress" aria-valuetext={snap.text} type="range" min={0} max={lastStep} value={step} onChange={(e) => replayAt(Number(e.target.value))} className="min-w-0 flex-1 accent-accent" />
                <button aria-label="Next action" disabled={step === lastStep} onClick={() => replayAt(step + 1)} className="rounded-md border border-line px-3 py-1 text-sm hover:bg-panel-2 disabled:opacity-35">›</button>
              </div>
              <p className="mt-2 min-h-5 text-center text-xs text-muted">{snap.text}</p>
              {step === lastStep && hasRunout && (
                <button type="button" onClick={() => setShowdown(!showdown)} aria-pressed={showdown} className="mx-auto mt-2 block rounded-md border border-line px-2 py-1 text-xs text-accent hover:bg-panel-2">
                  Show runout and revealed cards
                </button>
              )}
            </div>
            <div className="border-t border-line px-3 py-3">
              <h3 className="px-1 pb-1 text-sm font-semibold">Action history</h3>
              <ol ref={actionHistory} className="relative max-h-72 overflow-y-auto text-sm">
                {analysis.timeline.map((snapshot, i) => {
                  const action = hand.actions[i];
                  if (action.type === "post") return null;
                  const dec = snapshot.decisionIndex !== null ? analysis.decisions[snapshot.decisionIndex] : null;
                  const newStreet = i === 0 || analysis.timeline[i - 1].street !== snapshot.street || hand.actions[i - 1].type === "post";
                  return (
                    <li key={i}>
                      {newStreet && (
                        <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-xs font-medium capitalize text-muted">
                          {snapshot.street} {snapshot.board.length > 0 && <Cards cards={snapshot.board} size="sm" />}
                        </div>
                      )}
                      <button
                        onClick={() => replayAt(i)}
                        aria-current={i === step ? "step" : undefined}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${i === step ? "bg-panel-2 text-ink" : "text-muted hover:bg-panel-2/60"}`}
                      >
                        <span className={`w-12 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-medium ${ACTION[action.type].color}`}>{ACTION[action.type].label}</span>
                        <span className={`min-w-0 flex-1 break-words ${dec ? "font-medium text-ink" : ""}`}>{snapshot.text}</span>
                        {dec && <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${VERDICT[dec.verdict].chip}`}>{VERDICT[dec.verdict].label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <div className="min-w-0 space-y-4">
            <section id="analysis" tabIndex={-1} aria-labelledby="analysis-title" className="jump-target rounded-xl border border-line bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 id="analysis-title" className="text-lg font-semibold">Decision analysis</h2>
                <label className="flex items-center gap-2 text-xs font-medium text-muted">
                  Opponent bluffs
                  <select value={profile} onChange={(e) => {
                    const next = e.target.value as VillainProfile;
                    track("profile_changed", { profile: next });
                    setProfile(next);
                  }} className="rounded-md border border-line bg-bg px-2 py-1.5 text-ink" title={PROFILES[profile].hint}>
                    {(Object.keys(PROFILES) as VillainProfile[]).map((p) => <option key={p} value={p}>{PROFILES[p].label}</option>)}
                  </select>
                </label>
              </div>
              <DecisionPanel
                key={d.index}
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
            </section>
            <CoachPanel key={handText} handText={handText!} profile={profile} overrides={overrides} />
          </div>
        </div>
        <Method />
      </div>
    </AppShell>
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
  const callEvBb = d.evCall === undefined ? undefined : rounded(d.evCall / bb);

  return (
    <section className="p-4" aria-label="Selected decision">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Decision {d.index + 1} of {total} · {d.street}
            {d.inPosition !== null && ` · ${d.inPosition ? "in position" : "out of position"}`}
          </div>
          <h3 className="mt-1 text-xl font-semibold">
            You {actionText}
            {d.action.allIn ? " (all-in)" : ""}
          </h3>
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
        {facing && callEvBb !== undefined && d.exact && <Tile label="EV of calling" value={signedBb(callEvBb)} hint="Compared with folding" tone={signedTone(callEvBb)} />}
        {facing && callEvBb !== undefined && !d.exact && d.street !== "preflop" && <Tile label="EV if checked down" value={signedBb(callEvBb)} hint="Ignores betting on later streets" tone={signedTone(callEvBb)} />}
        {d.betPct !== undefined && <Tile label="Your size" value={`${pct(d.betPct)} pot`} />}
        {d.breakevenFold !== undefined && d.street !== "preflop" && <Tile label="Bluff break-even" value={pct(d.breakevenFold)} hint="Folds needed for a pure bluff" />}
        {d.spr !== null && <Tile label="SPR" value={num(d.spr)} hint="Effective stack to pot" />}
      </dl>

      {facing && (d.exact || d.street !== "preflop") && (
        <div className="mt-4" aria-hidden>
          <div className="relative h-3 rounded-full bg-panel-2">
            <div className={`equity-fill absolute inset-y-0 left-0 rounded-full ${!d.exact ? "bg-sky-400" : d.equity! >= d.potOdds! ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${d.equity! * 100}%` }} />
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
          <p>Brighter cells show more remaining combinations. The outline marks your hand.</p>
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
      <summary className="cursor-pointer font-medium text-ink">How PokerLens calculates the numbers</summary>
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
