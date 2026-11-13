import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { RangeTrainer } from "@/components/RangeTrainer";

export const metadata: Metadata = {
  title: "Preflop Range Trainer | PokerLens",
  description: "Drill preflop decisions by position against simplified 6-max charts, with spaced repetition on the hands you miss.",
};

const sections = [
  { href: "#drill", label: "Drill" },
  { href: "#accuracy", label: "Accuracy" },
  { href: "#about-charts", label: "About the charts" },
  { href: "/", label: "Review hands" },
];

export default function TrainPage() {
  return (
    <AppShell links={sections}>
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Preflop range trainer</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          You get a seat, the action so far and a hand. Pick raise, call or fold, then see the whole range for that spot. Hands you miss come back sooner.
        </p>
        <RangeTrainer />
        <section id="about-charts" tabIndex={-1} aria-labelledby="about-charts-title" className="jump-target mt-8 rounded-xl border border-amber-200/25 bg-panel p-4 sm:p-6">
          <h2 id="about-charts-title" className="text-lg font-semibold">What these charts are, and are not</h2>
          <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            <li>They are <strong className="text-ink">simplified charts for 6-max cash games around 100bb deep</strong>, not solver output. They are the same charts the hand review uses.</li>
            <li>They are <strong className="text-ink">binary</strong>: every hand always raises, always calls or always folds. Real solutions mix some hands between two actions.</li>
            <li><strong className="text-ink">Borderline hands are close.</strong> When a hand sits on the edge of the range, the other answer loses very little, and the page says so.</li>
            <li>They ignore rake, raise sizes and stack depth. Facing an open, the chart only knows whether the opener was early (UTG, HJ) or late (CO, BTN, SB). Facing a 3-bet, one chart covers every seat.</li>
            <li>The deal is weighted towards hands near the edge of each range, because obvious folds and premium hands teach little. So the hands here are harder than a random deal.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
