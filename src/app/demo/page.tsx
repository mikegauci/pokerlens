import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DemoLink } from "@/components/DemoLink";
import { DEMO_HANDS } from "@/lib/demo-hands";

export const metadata: Metadata = {
  title: "Demo Hands | PokerLens",
  description: "Three sample hands with a short walkthrough of each: what to show, which numbers the engine computed, and why it matters.",
};

const sections = [
  ...DEMO_HANDS.map((d) => ({ href: `#${d.sampleId}`, label: d.short })),
  { href: "/", label: "Review hands" },
];

export default function DemoPage() {
  return (
    <AppShell links={sections}>
      <div className="mx-auto max-w-4xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three demo hands</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          Each hand teaches one idea. Open it, follow the steps, and say each number as the review shows it. Every number here is computed by the engine for that hand, and a test checks they still match.
        </p>
        <ol className="mt-7 grid gap-5" data-tour="demo-hands">
          {DEMO_HANDS.map((demo, i) => (
            <li key={demo.sampleId} id={demo.sampleId} tabIndex={-1} className="jump-target rounded-xl border border-line bg-panel p-4 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">Hand {i + 1} · {demo.concept}</p>
              <h2 className="mt-1 text-xl font-semibold">{demo.title}</h2>
              <p className="mt-2 leading-relaxed">{demo.setup}</p>
              <ol className="mt-4 grid list-decimal gap-2.5 pl-5 text-sm leading-relaxed text-muted marker:text-accent">
                {demo.steps.map((step) => (
                  <li key={step.text} className="pl-1">
                    {step.change && <span className="mb-1 block font-medium text-amber-200">{step.change.label}, then:</span>}
                    {step.text}
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-l-2 border-accent/40 pl-3 text-sm leading-relaxed"><strong className="font-semibold">Why it matters.</strong> {demo.why}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {demo.links.map((link, j) => (
                  <DemoLink
                    key={link.href}
                    href={link.href}
                    hand={demo.sampleId}
                    className={j === 0
                      ? "rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300"
                      : "rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:bg-panel-2"}
                  >
                    {link.label} <span aria-hidden="true">→</span>
                  </DemoLink>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </AppShell>
  );
}
