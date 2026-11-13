import type { AnalysisOptions } from "./poker/analyze";

/**
 * Three sample hands to explain aloud in a demo, each as a short script.
 *
 * Every number in a script comes from the engine's fact sheet for that hand (with the step's
 * `options` when it has them), and `tests/demo-hands.test.ts` checks that with the same number
 * checker as the coach evaluations, so the scripts cannot drift from what the app shows.
 */
export interface DemoStep {
  text: string;
  /** Change to make in the app before saying this step, and the analysis options it corresponds to. */
  change?: { label: string; options: AnalysisOptions };
}

export interface DemoHand {
  sampleId: string;
  title: string;
  /** A label of a word or two for the page's section links. */
  short: string;
  /** The concept the hand teaches, in a few words. */
  concept: string;
  /** One sentence to open with. */
  setup: string;
  steps: DemoStep[];
  /** Why it matters for player study or game integrity. */
  why: string;
  links: { href: string; label: string }[];
}

export const DEMO_HANDS: DemoHand[] = [
  {
    sampleId: "river-lead",
    short: "River lead",
    title: "Second pair facing a river lead",
    concept: "Pot odds and bluff-catching, exact on the river",
    setup: "A♥ J♥ on the button makes top pair on the flop, then the K♦ river comes and the big blind leads for 16bb.",
    steps: [
      { text: "Up to the river it is routine: open to 2.5bb, bet 2bb on the flop (36% of pot) and 6.5bb on the turn with top pair. The big blind calls both." },
      { text: "On the river the pot is 38.5bb with the bet in and hero has to call 16bb, so the call needs 29% equity. That part is arithmetic and needs no read." },
      { text: "The engine narrows the big blind's range after each call, to about 43 weighted combos by the river. Against it A♥ J♥ has 55%, so folding gave up about 14.2bb." },
      {
        text: "Even against a player who rarely bluffs, equity only drops to 51% and the call is still worth +11.6bb. The fold is wrong under every profile, so it is a leak, not a read.",
        change: { label: "Set the opponent profile to “Rarely bluffs”", options: { profile: "passive" } },
      },
      { text: "No more betting can follow, so this verdict is exact for the assumed range. The only thing left to argue about is the range itself." },
    ],
    why: "Folding bluff-catchers too often is one of the most common leaks, and it shows up as a pattern across many hands, not in one. The river solver page solves this same spot and shows the big blind almost never leads at equilibrium, so a lead here is itself information about the player.",
    links: [
      { href: "/samples/river-lead", label: "Open the hand" },
      { href: "/solver/river-lead", label: "Solve the river" },
    ],
  },
  {
    sampleId: "jj-vs-jam",
    short: "Jacks",
    title: "Jacks against a 4-bet jam",
    concept: "Range narrowing and an exact all-in price",
    setup: "J♠ J♣ in the small blind 3-bets a cutoff open, and the cutoff moves all in for 100bb.",
    steps: [
      { text: "The 3-bet to 11bb is standard: the chart says raise, and jacks have 67% against the cutoff's opening range." },
      { text: "The jam changes the range. A cutoff that 4-bets all in here holds QQ+, AKs, AKo and A5s, about 38 weighted combos, and jacks are behind most of it." },
      { text: "Hero calls 89bb into a 112bb pot and needs 44% equity, but has 39%. Calling lost about 9.8bb. It is an all-in, so that comparison is exact for the range." },
      {
        text: "The answer depends on the range, so show it. Add TT, AQs and A4s to the jam and jacks reach 48% equity, a call worth +6.6bb. A small change in the read flips the verdict.",
        change: { label: "Set the cutoff's range to “QQ+, AKs, AKo, AQs, A5s-A4s, TT”", options: { rangeOverrides: { TightIsRight: "QQ+, AKs, AKo, AQs, A5s-A4s, TT" } } },
      },
    ],
    why: "Players study ranges, not single hands. This hand shows the engine's numbers are only as good as the estimated range, and that the app says so and lets the player change it instead of hiding the assumption.",
    links: [{ href: "/samples/jj-vs-jam", label: "Open the hand" }],
  },
  {
    sampleId: "mtt-short-stack",
    short: "Short stack",
    title: "KQ suited against a short-stack reshove",
    concept: "A push/fold equilibrium instead of a 100bb chart",
    setup: "In a tournament, K♦ Q♦ opens to 2bb on the button 31bb deep, and the big blind reshoves all in for 11.6bb.",
    steps: [
      { text: "A deep-stacked cash chart is the wrong tool for the shove. The engine gives the big blind a reshove equilibrium range at 11.8bb effective, solved by the push/fold solver in this repo." },
      { text: "Calling costs 9.6bb into a 14.9bb pot, so KQs needs 39%. It has 53% against the equilibrium range, so the call is worth about +3.2bb." },
      { text: "Say the limits out loud: the range is an approximation. It counts chip EV only, with no ICM, the shover can only shove or fold, and only the opener can call." },
    ],
    why: "Push/fold charts are exactly what real-time assistance software shows a player. Short-stack play that matches equilibrium on every hand at every stack depth is one of the signals a game-integrity system can look for.",
    links: [
      { href: "/samples/mtt-short-stack", label: "Open the hand" },
      { href: "/pushfold", label: "Push/fold ranges" },
    ],
  },
];
