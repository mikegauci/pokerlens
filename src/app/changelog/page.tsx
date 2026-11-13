import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CHANGELOG, REPO_URL } from "@/lib/changelog";
import { RELEASE } from "@/lib/release";

export const metadata: Metadata = {
  title: "Changelog | PokerLens",
  description: "What shipped in PokerLens and what changed after launch, newest first, with the pull request behind each change.",
};

const formatDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function ChangelogPage() {
  const days = [...new Set(CHANGELOG.map((e) => e.date))];
  return (
    <AppShell links={days.map((d) => ({ href: `#d-${d}`, label: formatDate(d).replace(/ \d{4}$/, "") }))}>
      <div className="mx-auto max-w-3xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Changelog</h1>
        <p className="mt-2 leading-relaxed text-muted">
          What shipped, newest first. Each change went through a pull request with tests, lint and a production build; “What we learned” notes where something found after shipping changed the app. You are on release <code className="font-mono text-ink">{RELEASE}</code>.
        </p>
        {days.map((day) => (
          <section key={day} id={`d-${day}`} tabIndex={-1} aria-labelledby={`h-${day}`} className="jump-target mt-8">
            <h2 id={`h-${day}`} className="text-sm font-semibold uppercase tracking-wider text-muted">{formatDate(day)}</h2>
            <ol className="mt-3 space-y-4">
              {CHANGELOG.filter((e) => e.date === day).map((e) => (
                <li key={e.title} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-lg font-semibold">{e.href ? <Link href={e.href} className="hover:text-accent">{e.title}</Link> : e.title}</h3>
                    {e.pr && <a href={`${REPO_URL}/pull/${e.pr}`} className="text-sm text-accent hover:underline">PR {e.pr}</a>}
                  </div>
                  <p className="mt-1 leading-relaxed text-muted">{e.summary}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                    {e.changes.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                  {e.learned && (
                    <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm leading-relaxed">
                      <strong className="font-semibold text-amber-200">What we learned: </strong>{e.learned}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
