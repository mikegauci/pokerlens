import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { IntegrityLab, type LabPlayer } from "@/components/IntegrityLab";
import { LOSS_BUCKETS, MIN_BETS, MIN_MEASURED, PLAYERS, SIZE_BUCKETS } from "@/lib/poker/integrity";
import { LAB_DATA } from "@/lib/poker/integrity-data";

export const metadata: Metadata = {
  title: "Integrity Lab | PokerLens",
  description: "A prototype on synthetic players: EV lost per decision and bet-size spread compared with a baseline of simulated humans, to show how assisted play and simple bots stand out.",
};

const sections = [
  { href: "#signals-title", label: "Signals" },
  { href: "#ev-lost-title", label: "EV lost" },
  { href: "#sizes-title", label: "Bet sizes" },
  { href: "#about-integrity", label: "How it works" },
];

export default function IntegrityPage() {
  const players: LabPlayer[] = LAB_DATA.players.map(({ id, profile, signals }) => {
    const meta = PLAYERS.find((p) => p.id === id)!;
    return {
      id,
      label: meta.label,
      description: meta.description,
      hands: profile.hands,
      measured: profile.losses.length,
      bets: profile.sizes.length,
      agreement: profile.agreement,
      meanLossBb: profile.meanLossBb,
      modalSizeShare: profile.modalSizeShare,
      lossShares: profile.lossShares,
      sizeShares: profile.sizeShares,
      signals,
    };
  });
  const b = LAB_DATA.baseline;

  return (
    <AppShell links={sections}>
      <div className="mx-auto max-w-5xl px-4 pb-14 pt-6 sm:px-6 sm:pt-9">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Integrity lab</h1>
          <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-xs font-medium text-amber-200">Prototype · synthetic players</span>
        </div>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted">
          Two things a game-integrity team looks at in one player&apos;s hands: how much EV each decision loses compared with a reference model, and how varied the bet sizes are. Here every player is simulated, and each is compared with a baseline of {b.players} simulated humans who play {LAB_DATA.hands.toLocaleString("en")} hands each.
        </p>

        <IntegrityLab
          players={players}
          baseline={{
            players: b.players,
            hands: LAB_DATA.hands,
            agreement: [b.agreement.min, b.agreement.max],
            meanLossBb: [b.meanLossBb.min, b.meanLossBb.max],
            modalSizeShare: [b.modalSizeShare.min, b.modalSizeShare.max],
            lossShares: b.lossShares,
            sizeShares: b.sizeShares,
          }}
          lossLabels={LOSS_BUCKETS.map((x) => x.label)}
          sizeLabels={SIZE_BUCKETS.map((x) => x.label)}
          minMeasured={MIN_MEASURED}
          minBets={MIN_BETS}
        />

        <section id="about-integrity" tabIndex={-1} aria-labelledby="about-integrity-title" className="jump-target mt-8 rounded-xl border border-amber-200/25 bg-panel p-4 sm:p-6">
          <h2 id="about-integrity-title" className="text-lg font-semibold">How it works, and what it is not</h2>
          <div className="mt-2 grid max-w-3xl gap-3 text-sm leading-relaxed text-muted">
            <p>
              <strong className="text-ink">Every player here is synthetic.</strong> Hands come from the same seeded simulator as the sample session: a 6-max cash table where the opponents play this app&apos;s charts. The baseline humans play the charts with leaks of random size (calling too wide, folding too much to 3-bets, folding medium hands on the river, calling with nothing) and pick bet sizes by feel. The regular is built the same way but is not part of the baseline. The assisted player asks this app&apos;s engine before every call or fold facing a bet. The bot follows fixed rules and always bets half the pot.
            </p>
            <p>
              <strong className="text-ink">EV lost is measured against this app&apos;s engine, not a solver.</strong> Only calls and folds facing a postflop bet are measured, because there the engine knows the EV of both options: equity against its assumed range compared with the price. Bets, checks, raises and preflop play are not scored. Agreeing with the engine therefore means agreeing with its range estimates, which are heuristics. A real system would compare play with the solver an assistance tool is likely to use.
            </p>
            <p>
              <strong className="text-ink">A flag is a reason to look, not proof.</strong> A signal is raised only when a player is outside the whole baseline range, and only with enough decisions or bets to say anything. Strong players also agree with good models and some people always bet the same size, so a real review would add more signals (timing, session length, behaviour across many sessions) and a person would make the call. The assisted player is also flagged for sizing here, because a tool offers a small set of solver-style sizes; that is a property of this simulation.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
