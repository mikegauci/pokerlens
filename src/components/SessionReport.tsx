"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/poker/analyze";
import { SAMPLE_CASH_HANDS, SAMPLE_TOURNAMENT_HANDS, sampleSession } from "@/lib/poker/sample-session";
import {
  LeakReport,
  MIN_OPPORTUNITIES,
  MistakeEntry,
  SESSION_ITERATIONS,
  SMALL_SAMPLE_HANDS,
  SPOTS,
  SessionOutcome,
  Stat,
  sessionSteps,
} from "@/lib/poker/session";
import { track } from "@/lib/track";
import { AppShell } from "./AppShell";
import Review from "./Review";

const VERDICT: Record<Verdict, { label: string; plural: string; chip: string; bar: string }> = {
  good: { label: "Good", plural: "good", chip: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30", bar: "bg-emerald-400" },
  ok: { label: "Fine", plural: "fine", chip: "bg-sky-400/15 text-sky-300 border-sky-400/30", bar: "bg-sky-400" },
  inaccuracy: { label: "Inaccuracy", plural: "inaccuracies", chip: "bg-amber-400/15 text-amber-300 border-amber-400/30", bar: "bg-amber-400" },
  mistake: { label: "Mistake", plural: "mistakes", chip: "bg-rose-400/15 text-rose-300 border-rose-400/30", bar: "bg-rose-400" },
};
const VERDICTS = Object.keys(VERDICT) as Verdict[];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const bb = (x: number) => `${x.toFixed(2)}bb`;
const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}bb`;

type Status = { kind: "idle" } | { kind: "running"; done: number; total: number } | { kind: "error"; message: string };

// The last report survives client-side navigation away and back, so the analysis is not repeated.
let lastRun: { outcome: SessionOutcome; source: string } | null = null;

const STAT_INFO: Record<"vpip" | "pfr" | "threeBet", { label: string; explain: string; base: string; typical: string }> = {
  vpip: {
    label: "VPIP",
    explain: "Voluntarily put money in the pot: the share of hands where you called or raised before the flop. Posting a blind does not count, and neither does checking your big blind.",
    base: "hands with a preflop decision (walks are left out)",
    typical: "Rule of thumb for 6-max cash: roughly 22–28%.",
  },
  pfr: {
    label: "PFR",
    explain: "Preflop raise: the share of hands where you raised before the flop, whether an open, an isolation raise or a re-raise. The gap between VPIP and PFR is how often you call or limp instead.",
    base: "hands with a preflop decision, as for VPIP",
    typical: "Rule of thumb: a few points below VPIP, roughly 18–23%.",
  },
  threeBet: {
    label: "3-bet",
    explain: "How often you re-raised when you faced exactly one raise and had chips left to re-raise. It is measured against opportunities, not hands: when nobody opened before you, or you opened yourself, there was no 3-bet to make.",
    base: "times you faced a single raise",
    typical: "Rule of thumb: roughly 6–10%. It needs far more hands than VPIP to settle.",
  },
};

export function SessionReport() {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [outcome, setOutcome] = useState<SessionOutcome | null>(lastRun?.outcome ?? null);
  const [open, setOpen] = useState<MistakeEntry | null>(null);
  const worker = useRef<Worker | null>(null);
  const runId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const reportTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const finish = (result: SessionOutcome, source: string, ms: number) => {
    lastRun = { outcome: result, source };
    setOutcome(result);
    setStatus({ kind: "idle" });
    const r = result.report;
    track("session_analyzed", {
      source,
      hands: r.imported,
      failed: r.failed.length,
      decisions: r.decisions,
      mistakes: r.counts.mistake,
      inaccuracies: r.counts.inaccuracy,
      tournament: r.tournament,
      seconds: Math.round(ms / 100) / 10,
    });
    requestAnimationFrame(() => reportTitle.current?.focus());
  };

  /** Fallback when a worker cannot start: the same steps on the main thread, yielding every ~30ms. */
  const runInline = (text: string, id: number, source: string, started: number) => {
    const steps = sessionSteps(text);
    const tick = () => {
      if (id !== runId.current) return;
      const until = performance.now() + 30;
      let step = steps.next();
      while (!step.done && performance.now() < until) step = steps.next();
      if (step.done) finish(step.value, source, performance.now() - started);
      else {
        setStatus({ kind: "running", ...step.value });
        setTimeout(tick, 0);
      }
    };
    setTimeout(tick, 0);
  };

  const run = (text: string, source: string) => {
    const id = ++runId.current;
    const started = performance.now();
    worker.current?.terminate();
    worker.current = null;
    setOpen(null);
    setStatus({ kind: "running", done: 0, total: 0 });
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("../workers/session.worker.ts", import.meta.url), { type: "module" });
    } catch {
      w = null;
    }
    if (!w) return runInline(text, id, source, started);
    worker.current = w;
    w.onmessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      if (e.data.type === "progress") setStatus({ kind: "running", done: e.data.done, total: e.data.total });
      else if (e.data.type === "done") {
        finish(e.data.outcome, source, performance.now() - started);
        w!.terminate();
        worker.current = null;
      } else setStatus({ kind: "error", message: e.data.message });
    };
    w.onerror = (e) => {
      e.preventDefault();
      w!.terminate();
      worker.current = null;
      runInline(text, id, source, started);
    };
    w.postMessage({ id, text });
  };

  const importText = (text: string, source: "paste" | "file" | "sample") => {
    track("session_imported", { source, bytes_kb: Math.round(text.length / 1024) });
    run(text, source);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ kind: "error", message: "That file is over 10MB. Split it into smaller sessions." });
      return;
    }
    const text = await file.text();
    setDraft("");
    importText(text, "file");
    if (fileInput.current) fileInput.current.value = "";
  };

  if (open && outcome?.texts[open.position]) {
    return (
      <Review
        key={`${open.position}:${open.decisionIndex}`}
        initialSample={{ id: `session-${open.position}`, title: "", blurb: "", previewStreet: open.street, text: outcome.texts[open.position] }}
        initialDecisionIndex={open.decisionIndex}
        source="session"
        back={{
          label: "Back to report",
          onClick: () => {
            setOpen(null);
            requestAnimationFrame(() => document.getElementById("mistakes")?.scrollIntoView());
          },
        }}
      />
    );
  }

  const running = status.kind === "running";
  const report = outcome?.report;

  return (
    <AppShell
      links={[
        { href: "#import", label: "Import" },
        ...(report ? [{ href: "#stats", label: "Stats" }, { href: "#spots", label: "Spots" }, { href: "#mistakes", label: "Mistakes" }] : []),
        { href: "#about-session", label: "Limits" },
      ]}
    >
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Session leak report</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          Players improve by reviewing sessions, not single hands. Import a whole session from PokerStars, GGPoker or 888poker and see where the EV went, which spots cost the most, and your basic preflop stats with how much they can be trusted.
        </p>

        <section id="import" data-tour="session-import" tabIndex={-1} aria-labelledby="import-title" className="jump-target mt-6 rounded-xl border border-line bg-panel p-4 sm:p-6">
          <h2 id="import-title" className="text-lg font-semibold">Import a session</h2>
          <p className="mt-1 text-sm text-muted">Paste many hands or upload a hand history file from PokerStars, GGPoker or 888poker (one file can mix sites). Hands that cannot be read are listed with the reason; the rest are still analysed.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) importText(draft, "paste");
            }}
          >
            <label htmlFor="session-text" className="sr-only">Session hand histories</label>
            <textarea
              id="session-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"PokerStars Hand #...\n...\n\n\nPokerStars Hand #...\n..."}
              className="mt-3 block h-32 w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed placeholder:text-muted/65"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <button type="submit" disabled={!draft.trim() || running} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-40">
                Analyse session
              </button>
              <label className={`cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2 ${running ? "pointer-events-none opacity-40" : ""}`}>
                Upload file
                <input ref={fileInput} type="file" accept=".txt,text/plain" className="sr-only" disabled={running} onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button type="button" disabled={running} onClick={() => importText(sampleSession(), "sample")} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2 disabled:opacity-40">
                Load the sample session
              </button>
            </div>
          </form>
          <p className="mt-3 text-xs text-muted">
            The sample is {SAMPLE_CASH_HANDS} simulated cash hands and {SAMPLE_TOURNAMENT_HANDS} short-stack tournament hands from a seeded simulator, with leaks built in, plus one deliberately broken hand. Each hand is analysed with {SESSION_ITERATIONS.toLocaleString()} Monte Carlo samples per decision (hand review uses 4,000), in a background thread.
          </p>
          {running && (
            <div className="mt-4" role="status" aria-live="polite">
              <div className="flex justify-between text-xs text-muted">
                <span>{status.total ? `Analysing hand ${status.done} of ${status.total}` : "Splitting and parsing hands"}</span>
                {status.total > 0 && <span className="tabular">{Math.round((status.done / status.total) * 100)}%</span>}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${status.total ? (status.done / status.total) * 100 : 3}%` }} />
              </div>
            </div>
          )}
          {status.kind === "error" && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{status.message}</p>
          )}
        </section>

        {report && <Report report={report} titleRef={reportTitle} onOpen={(m) => {
          track("session_hand_opened", { spot: m.spot, verdict: m.verdict });
          setOpen(m);
          window.scrollTo({ top: 0, behavior: "instant" });
        }} />}

        <About />
      </div>
    </AppShell>
  );
}

function Report({ report, onOpen, titleRef }: { report: LeakReport; onOpen: (m: MistakeEntry) => void; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const counted = report.analysed + report.noDecision;
  return (
    <>
      <section aria-labelledby="report-title" className="mt-6">
        <h2 id="report-title" ref={titleRef} tabIndex={-1} className="text-xl font-semibold">Report</h2>
        <p className="mt-1 text-sm text-muted">
          {report.imported} of {report.blocks} hands imported
          {report.failed.length > 0 && <>, <a href="#failed" className="text-rose-300 underline underline-offset-2">{report.failed.length} could not be read</a></>}.
          {" "}{report.analysed} analysed ({report.cash} cash, {report.tournament} tournament){report.noDecision > 0 && `, ${report.noDecision} with no decision for you (walks)`}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Decisions reviewed" value={String(report.decisions)}>
            <span className="flex flex-wrap gap-1">
              {VERDICTS.map((v) => (
                <span key={v} className={`rounded-full border px-1.5 py-0.5 text-[11px] ${VERDICT[v].chip}`}>{report.counts[v]} {report.counts[v] === 1 ? VERDICT[v].label.toLowerCase() : VERDICT[v].plural}</span>
              ))}
            </span>
          </Tile>
          <Tile label="Estimated EV lost" value={bb(report.evLossBb)} tone={report.evLossBb > 0 ? "text-rose-300" : undefined}>
            Only decisions the engine could put a number on. See the spot table for the rest.
          </Tile>
          <Tile label="EV lost per 100 hands" value={report.evLossPer100 === null ? "–" : bb(report.evLossPer100)}>
            Over {counted} hands. Comparable between sessions of different lengths.
          </Tile>
          <Tile label="Actual result" value={signed(report.netBb)} tone={report.netBb > 0 ? "text-emerald-300" : report.netBb < 0 ? "text-rose-300" : undefined}>
            What you won or lost. It swings with the cards; EV lost measures the decisions.
          </Tile>
        </div>
        {report.smallSample && (
          <p role="note" className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            <strong>Small sample.</strong> {counted} hands is fewer than {SMALL_SAMPLE_HANDS}. Treat every number here as a hint: a few hands of good or bad cards can move the stats by several points. Look at the 95% ranges below.
          </p>
        )}
      </section>

      <section id="stats" tabIndex={-1} aria-labelledby="stats-title" className="jump-target mt-8">
        <h2 id="stats-title" className="text-xl font-semibold">Preflop stats</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          These are exact counts from the hand histories, not estimates. What is uncertain is what they say about your long-run habits: the 95% range is where your true rate plausibly lies given this many opportunities (a Wilson interval).
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {(["vpip", "pfr", "threeBet"] as const).map((k) => <StatCard key={k} stat={report.stats[k]} info={STAT_INFO[k]} />)}
        </div>
      </section>

      <SpotTable report={report} />
      <Mistakes report={report} onOpen={onOpen} />

      {report.failed.length > 0 && (
        <section id="failed" tabIndex={-1} aria-labelledby="failed-title" className="jump-target mt-8">
          <h2 id="failed-title" className="text-xl font-semibold">Hands that could not be read</h2>
          <p className="mt-1 text-sm text-muted">These are left out of every number above.</p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-panel text-sm">
            {report.failed.map((f) => (
              <li key={f.position} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="tabular text-muted">Hand {f.position} in the file{f.handId ? ` (#${f.handId})` : ""}</span>
                <span>{f.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Tile({ label, value, tone, children }: { label: string; value: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`tabular mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
      <div className="mt-2 text-xs leading-relaxed text-muted">{children}</div>
    </div>
  );
}

function StatCard({ stat, info }: { stat: Stat; info: (typeof STAT_INFO)["vpip"] }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{info.label}</h3>
        {stat.unreliable && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-200">Too few to trust</span>}
      </div>
      <p className="tabular mt-1 text-3xl font-semibold">{pct(stat.value)}</p>
      <p className="tabular text-xs text-muted">
        {stat.count} of {stat.opportunities} {info.base}
        {stat.interval && <> · 95% range {pct(stat.interval[0])}–{pct(stat.interval[1])}</>}
      </p>
      {stat.unreliable && <p className="mt-2 text-xs text-amber-200">Fewer than {MIN_OPPORTUNITIES} opportunities, so this mostly reflects the cards you were dealt.</p>}
      <p className="mt-2 text-sm leading-relaxed text-muted">{info.explain}</p>
      <p className="mt-1.5 text-xs text-muted">{info.typical}</p>
    </div>
  );
}

function SpotTable({ report }: { report: LeakReport }) {
  const rows = report.spots.filter((s) => s.decisions > 0);
  const max = Math.max(0.01, ...rows.map((s) => s.evLossBb));
  return (
    <section id="spots" tabIndex={-1} aria-labelledby="spots-title" className="jump-target mt-8">
      <h2 id="spots-title" className="text-xl font-semibold">EV lost by spot type</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Every decision falls into one spot. EV is only counted where the engine computes it: price decisions (call or fold against a bet) and push/fold spots. Chart and heuristic verdicts still flag mistakes, but carry no EV figure, so they are counted separately.
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Spot</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Decisions</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Verdicts</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Flagged, with EV</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Flagged, no EV</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">EV lost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => (
              <tr key={s.spot} className="align-top">
                <th scope="row" className="max-w-xs px-4 py-3 font-normal">
                  <span className="font-medium text-ink">{SPOTS[s.spot].label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{SPOTS[s.spot].explain}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted/80">Judged by: {SPOTS[s.spot].basis}</span>
                </th>
                <td className="tabular px-3 py-3 text-right">{s.decisions}</td>
                <td className="px-3 py-3">
                  <span className="flex h-2 w-28 overflow-hidden rounded-full bg-panel-2" aria-label={VERDICTS.map((v) => `${s.counts[v]} ${VERDICT[v].label.toLowerCase()}`).join(", ")} role="img">
                    {VERDICTS.map((v) => s.counts[v] ? <span key={v} className={VERDICT[v].bar} style={{ width: `${(s.counts[v] / s.decisions) * 100}%` }} /> : null)}
                  </span>
                </td>
                <td className="tabular px-3 py-3 text-right">{s.measured}</td>
                <td className="tabular px-3 py-3 text-right">{s.unmeasured}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`tabular ${s.evLossBb > 0 ? "text-rose-300" : "text-muted"}`}>{bb(s.evLossBb)}</span>
                  <span className="ml-auto mt-1 block h-1 rounded-full bg-rose-400/70" style={{ width: `${(s.evLossBb / max) * 100}%` }} aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line text-sm">
            <tr>
              <th scope="row" className="px-4 py-2.5 font-medium">Total</th>
              <td className="tabular px-3 py-2.5 text-right">{report.decisions}</td>
              <td />
              <td className="tabular px-3 py-2.5 text-right">{rows.reduce((t, s) => t + s.measured, 0)}</td>
              <td className="tabular px-3 py-2.5 text-right">{rows.reduce((t, s) => t + s.unmeasured, 0)}</td>
              <td className="tabular px-4 py-2.5 text-right font-semibold">{bb(report.evLossBb)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Mistakes({ report, onOpen }: { report: LeakReport; onOpen: (m: MistakeEntry) => void }) {
  return (
    <section id="mistakes" tabIndex={-1} aria-labelledby="mistakes-title" className="jump-target mt-8">
      <h2 id="mistakes-title" className="text-xl font-semibold">Biggest mistakes</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">The single decisions with the largest EV figure. Open one to see the full street-by-street review, ranges and coach.</p>
      {report.biggest.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">No decision in this session has a measurable EV loss.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-panel">
          {report.biggest.map((m, i) => (
            <li key={`${m.position}:${m.decisionIndex}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="tabular w-5 text-sm text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.title} <span className={`ml-1 rounded-full border px-1.5 py-0.5 align-middle text-[11px] ${VERDICT[m.verdict].chip}`}>{VERDICT[m.verdict].label}</span>
                </p>
                <p className="text-xs text-muted">
                  {m.heroClass} in {m.heroPosition} · {SPOTS[m.spot].label} · hand {m.position} (#{m.handId}) · {m.model ? (m.model.startsWith("Push/fold") && m.exact ? "exact push/fold model" : "push/fold model, approximate") : m.exact ? "exact for the assumed range" : "approximate"}
                </p>
              </div>
              <span className="tabular text-sm font-semibold text-rose-300">−{bb(m.evLossBb)}</span>
              <button onClick={() => onOpen(m)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-panel-2">Open review</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function About() {
  return (
    <section id="about-session" tabIndex={-1} aria-labelledby="about-session-title" className="jump-target mt-8 rounded-xl border border-amber-200/25 bg-panel p-4 sm:p-6">
      <h2 id="about-session-title" className="text-lg font-semibold">What is exact and what is a heuristic</h2>
      <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-muted">
        <p>
          <strong className="text-ink">Exact:</strong> the counts behind VPIP, PFR and 3-bet, the verdict counts, and the result in big blinds come straight from the hand histories.
        </p>
        <p>
          <strong className="text-ink">Inherited from hand review:</strong> every verdict and EV figure is the single-hand review run on each hand, with the same assumptions. Opponent ranges are estimated from simplified 100bb 6-max charts and narrowed by a heuristic after each bet. A river call or fold, or an all-in, is exact for that assumed range; with cards to come, equity against pot odds ignores implied odds. Push/fold figures are chip EV with no ICM. If the assumed range is wrong, the EV figure is wrong too.
        </p>
        <p>
          <strong className="text-ink">Not measured:</strong> preflop chart deviations and postflop betting choices get a verdict but no EV figure, so the EV total understates what those spots cost. It is not a solver comparison and nothing here is labelled GTO.
        </p>
        <p>
          <strong className="text-ink">Sampling:</strong> {SESSION_ITERATIONS.toLocaleString()} Monte Carlo samples per decision (four times that when the decision closes the action), seeded by hand number, so the same file always gives the same report. Opening a hand runs the full 4,000-sample review, so its numbers can differ slightly.
        </p>
      </div>
    </section>
  );
}
