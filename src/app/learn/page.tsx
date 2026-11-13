import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { CallEvExercise, KnowledgeCheck } from "@/components/LearnExercises";
import { Cards } from "@/components/PlayingCard";
import { RiverChallenge } from "@/components/RiverChallenge";
import { PokerGlossary } from "@/components/PokerGlossary";
import { bluffCatchQuestion, valueBetQuestion } from "@/lib/poker/learn";
import { analyzeHand, type AnalysisOptions } from "@/lib/poker/analyze";
import { parseHand } from "@/lib/poker/parser";
import { SAMPLES, type SampleHand } from "@/lib/poker/samples";

export const metadata: Metadata = {
  title: "Learn Poker | PokerLens",
  description: "Study Hold’em decisions through sample hands, practice pot odds and call EV, and look up poker terminology.",
};

const sections = [
  { href: "#fundamentals", label: "Fundamentals" },
  { href: "#strategy", label: "Strategy" },
  { href: "#glossary", label: "Glossary" },
];

const sampleById = new Map(SAMPLES.map((sample) => [sample.id, sample]));

function getSample(id: string) {
  const sample = sampleById.get(id);
  if (!sample) throw new Error(`Unknown lesson sample: ${id}`);
  return sample;
}

const river = getSample("river-lead");
const draw = getSample("flush-draw-price");
const value = getSample("missed-value");
const threeBet = getSample("kjo-3bet-pot");

const riverHand = parseHand(river.text);
const riverBettor = riverHand.actions.find((action) => action.street === "river" && action.type === "bet" && action.player !== riverHand.hero);
if (!riverBettor) throw new Error("The river challenge needs an opponent bet.");

const rangePresets: { label: string; description: string; options?: AnalysisOptions }[] = [
  { label: "Standard estimate", description: "PokerLens estimates a mix of value hands and bluffs from the big blind’s actions." },
  { label: "Value-heavy example", description: "Assume the big blind reaches this spot with KQ, KTs, K8s, K5s, or a set of eights, fives, or threes.", options: { rangeOverrides: { [riverBettor.player]: "KQ,KTs,K8s,K5s,88,55,33" } } },
  { label: "Bluffs more often", description: "The same starting range, with more weight on weaker hands when the big blind bets.", options: { profile: "aggressive" } },
];
const riverSpots = rangePresets.map(({ label, description, options }) => {
  const spot = analyzeHand(riverHand, options).decisions.find((decision) => decision.street === "river" && decision.toCall > 0);
  if (spot?.equity === undefined || spot.evCall === undefined) throw new Error("The river challenge needs an equity estimate.");
  return { label, description, equity: spot.equity, callEv: spot.evCall / riverHand.bb, pot: spot.pot / riverHand.bb, toCall: spot.toCall / riverHand.bb };
});

export default function LearnPage() {
  return (
    <AppShell learning links={sections}>
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <section className="review-hero panel-enter grid items-center gap-6 rounded-2xl border border-line p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Learn poker with PokerLens</h1>
            <p className="mt-3 max-w-lg leading-relaxed text-muted">
              You know how to play a hand. Practice putting an opponent on a range, pricing a call, and deciding when to bet for value.
            </p>
            <Link href="#river-challenge" className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
              Play the river challenge <span className="ml-2" aria-hidden="true">↓</span>
            </Link>
          </div>
          <SampleSpot sample={river} title="A♥ J♥ on the button" />
        </section>

        <RiverChallenge
          hero={riverHand.heroCards}
          board={riverHand.board}
          pot={riverSpots[0].pot}
          toCall={riverSpots[0].toCall}
          ranges={riverSpots}
          sampleHref={`/samples/${river.id}`}
        />

        <section id="fundamentals" tabIndex={-1} aria-labelledby="fundamentals-title" className="jump-target mt-8">
          <h2 id="fundamentals-title" className="text-2xl font-semibold tracking-tight">Fundamentals</h2>
          <div className="mt-3 grid items-start gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              <Lesson title="Pot odds, equity, and EV">
                <p>The river bettor puts 16 bb into 22.5 bb. A call costs 16 bb and makes the final pot 54.5 bb, so you need about 29.4% equity to break even before rake. At 40% equity, calling earns 5.8 bb more than folding on average.</p>
                <SampleLink sample={river}>Review the river decision</SampleLink>
              </Lesson>
              <Lesson title="Draws and future bets">
                <p>With 7♥ 6♥ on K♥ 9♥ 2♣ 3♠, you have nine unseen hearts among 46 unseen cards, or about a 20% chance to hit a heart on the river. Some hearts can make an opponent a better hand. Consider how often you win, how much more you can win, and how a river bet changes your options.</p>
                <SampleLink sample={draw}>Review the turn draw</SampleLink>
              </Lesson>
            </div>
            <CallEvExercise />
          </div>
        </section>

        <section id="strategy" tabIndex={-1} aria-labelledby="strategy-title" className="jump-target mt-8">
          <h2 id="strategy-title" className="text-2xl font-semibold tracking-tight">Strategy</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <Lesson title="Bluff-catching on the river">
              <p>Build the betting range from the line your opponent took. The big blind called twice before leading when the king fell. Which hands improved to value, and which missed draws would actually bet? Your price stays fixed when you change the range.</p>
              <KnowledgeCheck question={bluffCatchQuestion} />
              <SampleLink sample={river}>Test the opponent’s bluff frequency</SampleLink>
              <Link href="/solver/river-lead" className="inline-flex w-fit items-baseline gap-2 rounded-md text-sm font-medium text-accent underline-offset-4 hover:underline">
                Solve this river for its equilibrium <span aria-hidden="true">→</span>
              </Link>
            </Lesson>
            <Lesson title="Betting for value">
              <p>Pocket nines reach the river as a set. When the big blind checks, think about which Kx hands or two-pair combos could pay you, which stronger hands can raise, and how your sizing changes their response.</p>
              <KnowledgeCheck question={valueBetQuestion} />
              <SampleLink sample={value}>Review the river check-back</SampleLink>
            </Lesson>
            <Lesson title="Facing a 3-bet out of position">
              <p>When the button re-raises your cutoff open, you’ll act first postflop. KJo can make top pair and still lose to stronger kings. Weigh the size, effective stacks, and how wide the button re-raises before committing more chips.</p>
              <SampleSpot sample={threeBet} />
              <SampleLink sample={threeBet}>Review the preflop call</SampleLink>
            </Lesson>
          </div>
        </section>

        <section id="glossary" tabIndex={-1} aria-labelledby="glossary-title" className="jump-target mt-8">
          <h2 id="glossary-title" className="text-2xl font-semibold tracking-tight">Glossary</h2>
          <PokerGlossary />
        </section>

        <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Hand reviews estimate equity against an editable range. The river solver computes an equilibrium for the ranges and bet sizes you give it, and only for those.
          {" "}<a href="https://blog.gtowizard.com/what-is-gto-in-poker/" className="text-accent underline underline-offset-2">Read more about GTO</a>
        </p>
      </div>
    </AppShell>
  );
}

function Lesson({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </article>
  );
}

function SampleSpot({ sample, title = sample.title }: { sample: SampleHand; title?: string }) {
  const hand = parseHand(sample.text);
  return (
    <div className="sample-felt rounded-xl border border-accent/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-emerald-100/80">Hero</p>
          <Cards cards={hand.heroCards} size="sm" />
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
    </div>
  );
}

function SampleLink({ sample, children }: { sample: SampleHand; children: ReactNode }) {
  return (
    <Link href={`/samples/${sample.id}`} className="inline-flex w-fit items-baseline gap-2 rounded-md text-sm font-medium text-accent underline-offset-4 hover:underline">
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}
