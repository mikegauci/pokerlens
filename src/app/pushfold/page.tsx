import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PushFoldLab } from "@/components/PushFoldLab";

export const metadata: Metadata = {
  title: "Push/Fold Nash Ranges | PokerLens",
  description: "Equilibrium shove and call ranges for short stacks by stack depth and seat, solved in the browser, with what is exact and what is an approximation.",
};

const sections = [
  { href: "#spot", label: "The spot" },
  { href: "#ranges", label: "Ranges" },
  { href: "#about-pushfold", label: "What it is" },
  { href: "/", label: "Review hands" },
];

export default function PushFoldPage() {
  return (
    <AppShell links={sections}>
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Push/fold Nash ranges</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          With a short stack there is no room to raise and fold, so the decision shrinks to all-in or fold. Pick a stack depth and a seat to see which hands shove and which hands call.
        </p>
        <div data-tour="pushfold">
          <PushFoldLab />
        </div>
        <section id="about-pushfold" tabIndex={-1} aria-labelledby="about-pushfold-title" className="jump-target mt-8 rounded-xl border border-amber-200/25 bg-panel p-4 sm:p-6">
          <h2 id="about-pushfold-title" className="text-lg font-semibold">What push/fold Nash is, and its limits</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            A Nash equilibrium is a pair of strategies where neither player can win more chips by changing what they do with any hand. In the push/fold game the first player may only move all-in or fold, and the players behind may only call or fold. This page solves that game from exact hand-versus-hand equities, so against these ranges no shove, fold or call can be improved. <strong className="text-ink">Small blind against big blind is solved exactly.</strong> With more players left to act the result is <strong className="text-ink">an approximation</strong>: at most one player calls, so there are no three-way all-ins, and each caller&apos;s cards are treated as independent of the others. The limits apply everywhere: it counts <strong className="text-ink">chip EV only, with no ICM</strong>, so it ignores that chips are worth less near a pay jump; there is <strong className="text-ink">no limping and no min-raising</strong>, which become better than shoving for many hands above roughly 10 big blinds; and it is the right play against opponents who also play this way, not the most profitable play against someone who calls too tight or too loose.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
