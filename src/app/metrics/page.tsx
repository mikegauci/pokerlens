import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { formatRate, parseWindow, summarize, windowStart, WINDOWS, type MetricsSummary, type WindowId } from "@/lib/metrics";
import { isAuthorized } from "@/lib/metrics-auth";
import { MAX_ROWS, readEvents } from "@/lib/metrics-data";

export const metadata: Metadata = {
  title: "Usage Metrics | PokerLens",
  description: "Private usage funnel for PokerLens: hand analysed, range edited, coach requested, hand saved.",
  robots: { index: false, follow: false },
};

const sections = [
  { href: "#funnel", label: "Funnel" },
  { href: "#events", label: "All events" },
  { href: "#about-metrics", label: "How it is counted" },
];

export default function MetricsPage({ searchParams }: PageProps<"/metrics">) {
  return (
    <AppShell links={sections}>
      <div className="mx-auto max-w-5xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Usage metrics</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          What anonymous visitors do with the hand review, counted from the events the app records. Private: this page is behind a password and is not linked from the app.
        </p>
        <Suspense fallback={<p className="mt-8 text-muted">Reading events…</p>}>
          <MetricsContent searchParams={searchParams} />
        </Suspense>
        <About />
      </div>
    </AppShell>
  );
}

async function MetricsContent({ searchParams }: { searchParams: PageProps<"/metrics">["searchParams"] }) {
  // Read env vars at request time, not at build time, so the deployed environment decides.
  await connection();
  const password = process.env.METRICS_PASSWORD;
  if (!password) {
    return (
      <Notice title="Metrics are switched off">
        Set <code className="font-mono text-ink">METRICS_PASSWORD</code> on the server to enable this page. Without it no data is read, so the page cannot leak product data by accident.
      </Notice>
    );
  }
  // The proxy already asked for the password; check again here so the data never depends on the proxy alone.
  if (!isAuthorized((await headers()).get("authorization"), password)) {
    return <Notice title="Not signed in">Reload the page and enter the metrics password.</Notice>;
  }

  const windowId = parseWindow((await searchParams).window);
  const to = new Date();
  const from = windowStart(windowId, to);
  const result = await readEvents(from);

  if (!result.ok) {
    return (
      <>
        <WindowPicker current={windowId} />
        {result.reason === "missing-config" ? (
          <Notice title="Server key missing">
            The metrics page reads the <code className="font-mono text-ink">events</code> table on the server, because browsers may only write to it. Set {result.missing.map((m, i) => (
              <span key={m}>{i > 0 && " and "}<code className="font-mono text-ink">{m}</code></span>
            ))} in the server environment (never with a <code className="font-mono text-ink">NEXT_PUBLIC_</code> prefix for the secret key) and reload.
          </Notice>
        ) : (
          <Notice title="Could not read events">The database returned an error: {result.message}</Notice>
        )}
      </>
    );
  }

  const summary = summarize(result.rows, from, to.toISOString());
  return (
    <>
      <WindowPicker current={windowId} />
      <p className="mt-3 text-sm text-muted">
        {summary.totalEvents.toLocaleString("en-GB")} events from {summary.totalSessions.toLocaleString("en-GB")} sessions, {new Date(summary.from).toUTCString()} to {new Date(summary.to).toUTCString()}.
      </p>
      {result.truncated && (
        <Notice title="Partial data">Only the first {MAX_ROWS.toLocaleString("en-GB")} events in this window were read. Pick a shorter window for complete numbers.</Notice>
      )}
      <Funnel summary={summary} />
      <EventTable summary={summary} />
    </>
  );
}

function WindowPicker({ current }: { current: WindowId }) {
  return (
    <nav aria-label="Time window" className="mt-6 flex flex-wrap gap-1.5">
      {WINDOWS.map((w) => (
        <Link
          key={w.id}
          href={`/metrics?window=${w.id}`}
          aria-current={w.id === current ? "page" : undefined}
          className={`rounded-lg border px-3 py-1.5 text-sm ${w.id === current ? "border-accent bg-panel-2 text-ink" : "border-line text-muted hover:bg-panel-2 hover:text-ink"}`}
        >
          {w.label}
        </Link>
      ))}
    </nav>
  );
}

function Funnel({ summary }: { summary: MetricsSummary }) {
  const top = Math.max(summary.funnel[0].sessions, 1);
  return (
    <section id="funnel" tabIndex={-1} aria-labelledby="funnel-title" className="jump-target mt-6 rounded-xl border border-line bg-panel p-4 sm:p-6">
      <h2 id="funnel-title" className="text-lg font-semibold">Review funnel</h2>
      <p className="mt-1 text-sm text-muted">Sessions that reached each step after every step above it, in order.</p>
      <ol className="mt-4 space-y-4">
        {summary.funnel.map((step, i) => (
          <li key={step.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-medium">{i + 1}. {step.label} <code className="ml-1 font-mono text-xs text-muted">{step.name}</code></span>
              <span className="text-sm tabular-nums">
                <strong className="text-ink">{step.sessions.toLocaleString("en-GB")}</strong>
                <span className="text-muted"> sessions</span>
                {i > 0 && <span className="text-muted"> · {formatRate(step.fromPrevious)} of previous · {formatRate(step.fromFirst)} of step 1</span>}
              </span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-panel-2" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${(step.sessions / top) * 100}%` }} />
            </div>
            {step.sessionsAnyOrder !== step.sessions && (
              <p className="mt-1 text-xs text-muted">{step.sessionsAnyOrder.toLocaleString("en-GB")} sessions sent this event at all; the rest skipped an earlier step or did it first.</p>
            )}
          </li>
        ))}
      </ol>
      {summary.funnel[0].sessions === 0 && <p className="mt-4 text-sm text-muted">No hands were analysed in this window.</p>}
    </section>
  );
}

function EventTable({ summary }: { summary: MetricsSummary }) {
  const rows = [...summary.counts, ...summary.unknown];
  return (
    <section id="events" tabIndex={-1} aria-labelledby="events-title" className="jump-target mt-6 rounded-xl border border-line bg-panel p-4 sm:p-6">
      <h2 id="events-title" className="text-lg font-semibold">All events</h2>
      <p className="mt-1 text-sm text-muted">Raw counts for every event the app sends, in the same window. Names the app no longer sends are marked retired.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-4 font-medium">Event</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Events</th>
              <th scope="col" className="py-2 text-right font-medium">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.name} className="border-b border-line/60">
                <th scope="row" className="py-1.5 pr-4 font-mono text-xs font-normal">
                  {c.name}
                  {i >= summary.counts.length && <span className="ml-2 font-sans text-muted">retired</span>}
                </th>
                <td className={`py-1.5 pr-4 text-right tabular-nums ${c.events ? "" : "text-muted"}`}>{c.events.toLocaleString("en-GB")}</td>
                <td className={`py-1.5 text-right tabular-nums ${c.sessions ? "" : "text-muted"}`}>{c.sessions.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="mt-6 rounded-xl border border-amber-200/25 bg-panel p-4 sm:p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function About() {
  return (
    <section id="about-metrics" tabIndex={-1} aria-labelledby="about-metrics-title" className="jump-target mt-8 rounded-xl border border-line bg-panel p-4 sm:p-6">
      <h2 id="about-metrics-title" className="text-lg font-semibold">How it is counted</h2>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        <li>A <strong className="text-ink">session</strong> is one browser tab&apos;s anonymous id, kept in session storage. A new tab or a closed browser starts a new session, so one person can count more than once.</li>
        <li>Funnel steps count <strong className="text-ink">sessions, not events</strong>. A session reaches a step only if it fired that event after reaching the step before. Ties in time are broken by row id.</li>
        <li>Only events inside the window count. A session that analysed a hand just before the window opened and saved it inside the window is not in the funnel.</li>
        <li>Events are sent from the browser and never retried, so ad blockers and failed requests make every number a lower bound. Nothing here is sampled or estimated.</li>
        <li>Events carry counts and labels only. This page reads the event name, session id and time; it does not read event props or user ids.</li>
      </ul>
    </section>
  );
}
