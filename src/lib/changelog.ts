/**
 * What shipped, newest first. One entry per pull request (or per commit before pull requests were used).
 * `roadmap` names the roadmap item in CLAUDE.md the entry completes; a test checks that every ticked
 * item has an entry. `learned` records something found after shipping that changed the app, so the
 * page shows iteration, not just a list of features.
 */
export interface ChangelogEntry {
  /** UTC date the change reached main, YYYY-MM-DD. */
  date: string;
  title: string;
  pr?: number;
  roadmap?: string;
  /** Where to see it in the app. */
  href?: string;
  summary: string;
  changes: string[];
  learned?: string;
}

export const REPO_URL = "https://github.com/mikegauci/pokerlens";

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-11-14",
    title: "Guided tour",
    roadmap: "Guided tour",
    href: "/?tour=1",
    summary: "A step-by-step walkthrough of every feature on its real page, started from the home page.",
    changes: [
      "Twelve steps, each highlighting one feature with a sentence on what it does and why it matters for player study or game integrity, and a link to the page.",
      "Skip or leave at any step, with Escape or the arrow keys; it works at 375px.",
      "The step lives only in the URL, so the tour remembers nothing after the visit.",
      "A test fails if a page has no step or a step points at something that is not on its page.",
    ],
  },
  {
    date: "2026-11-14",
    title: "Production story: error monitoring, health check, changelog and CI",
    pr: 12,
    roadmap: "Production story",
    href: "/changelog",
    summary: "The app now reports its own errors, says which commit is running, and is checked by CI on every pull request.",
    changes: [
      "Uncaught browser errors, React render errors and server errors (rendering, route handlers, server actions) are recorded in an insert-only table, grouped by fingerprint on the private metrics page.",
      "Reports keep a short message, a trimmed stack, the page path without its query string and the release; query strings, e-mail addresses and long numbers are scrubbed, and a visit sends at most ten.",
      "Friendly error pages with a retry button and a reference number.",
      "/api/health returns the release, the environment and which services are configured, for uptime monitoring.",
      "Every page footer shows the release and links here.",
      "A GitHub Actions workflow runs lint, tests and a production build on every pull request and on main.",
    ],
  },
  {
    date: "2026-11-13",
    title: "Mixed and depth-aware preflop charts, EV of betting and raising, equity realisation",
    pr: 11,
    roadmap: "Engine depth",
    href: "/samples/flush-draw-price",
    summary: "Hand review now knows that some hands are mixed, that 30bb is not 100bb, that position changes what equity is worth, and what a bet or raise would have won.",
    changes: [
      "Borderline hands carry frequencies; an action the chart takes at least 25% of the time is a normal part of a mix. The range trainer accepts mixed answers the same way.",
      "A second chart set for effective stacks of about 15-40bb, picked per player from the starting stacks.",
      "Calls and folds with cards to come are judged on realised equity: raw equity times a rule-of-thumb factor for position.",
      "After the flop, heads-up, every decision gets the EV of betting or raising compared with checking, calling or folding. On the river it decides thin value bets and missed value.",
    ],
    learned: "The weighted charts moved some headline numbers, such as jacks calling a 4-bet jam (from -9.8bb to -14.6bb). The demo scripts and coach fixtures caught every change because their number checker compares them with the engine.",
  },
  {
    date: "2026-11-13",
    title: "GGPoker and 888poker hand histories",
    pr: 10,
    roadmap: "More hand-history formats",
    href: "/",
    summary: "Hand review, the coach and the session report read GGPoker and 888poker as well as PokerStars, and a session file may mix them.",
    changes: [
      "The site is detected from the header; every format becomes the same parsed hand.",
      "888poker writes raises as chips put in, never marks an all-in and never writes uncalled bets, so the parser derives them from the stacks.",
      "GGPoker run-it-twice hands use the first board and count both halves of the pot.",
      "A test writes one hand in all three formats and checks they give the same review.",
    ],
  },
  {
    date: "2026-11-13",
    title: "Integrity lab",
    pr: 9,
    roadmap: "Integrity lab",
    href: "/integrity",
    summary: "A prototype on synthetic players: EV lost per decision and bet-size spread against a baseline of simulated humans.",
    changes: [
      "The assisted player is flagged for playing too close to the engine, the bot for uniform sizing, and the regular for neither.",
      "Flags need the player outside the whole baseline range and enough decisions to judge.",
    ],
  },
  {
    date: "2026-11-13",
    title: "Three demo hands",
    pr: 8,
    roadmap: "Three demo hands",
    href: "/demo",
    summary: "Three sample hands with short walkthroughs to explain aloud, each number checked against the engine.",
    changes: ["A river lead, jacks against a 4-bet jam, and KQ suited against a short-stack reshove."],
    learned: "The first draft quoted a 100bb chart on a hand where the fact sheet never mentions 100bb. The number checker flagged it before it shipped.",
  },
  {
    date: "2026-11-13",
    title: "Coach evaluations",
    pr: 6,
    roadmap: "Coach evaluations",
    summary: "An automated check that coach output never states a number that is missing from the fact sheet, run over the sample hands.",
    changes: ["Runs in npm test on recorded replies; a live run against the model is behind an environment variable."],
    learned: "The check found that the built-in summary quoted how many decisions were flagged, a number the fact sheet did not contain. The fact sheet now states it.",
  },
  {
    date: "2026-11-13",
    title: "Metrics page",
    pr: 5,
    roadmap: "Metrics page",
    summary: "A private page that reads the write-only events table on the server and shows the review funnel.",
    changes: ["Hand analysed, range edited, coach requested and hand saved, in order, per session, over a chosen window."],
  },
  {
    date: "2026-11-13",
    title: "Session import and leak report",
    pr: 4,
    roadmap: "Session import and leak report",
    href: "/session",
    summary: "Import many hands at once and see EV lost by spot type, the biggest mistakes, and VPIP, PFR and 3-bet with their sample sizes.",
    changes: ["Hands that cannot be read are listed with the reason and the rest still import.", "A seeded sample session with built-in leaks shows the report without a file."],
  },
  {
    date: "2026-11-13",
    title: "Push/fold Nash for short stacks",
    pr: 3,
    roadmap: "Push/fold Nash for short stacks",
    href: "/pushfold",
    summary: "Equilibrium shove and call ranges by stack depth and seat, also used by hand review for tournament hands under about 15bb.",
    changes: ["Solved with CFR+ over the 169 starting hands from a checked-in table of exact all-in equities."],
    learned: "Short-stack tournament hands had been judged with 100bb cash charts. They now use the push/fold model and name it.",
  },
  {
    date: "2026-11-13",
    title: "River solver",
    roadmap: "River solver",
    href: "/solver",
    summary: "A CFR solver for heads-up river spots with mixed strategies per hand, bluff-to-value ratio, defence frequency and the EV of exploiting a leak.",
    changes: ["The first output in the app that is a real equilibrium, labelled with the model it was solved for."],
  },
  {
    date: "2026-11-13",
    title: "Preflop range trainer",
    roadmap: "Preflop range trainer",
    href: "/train",
    summary: "Drill position-and-hand spots against the charts with spaced repetition and a per-position accuracy record.",
    changes: ["Missed hands come back sooner; progress stays in the browser."],
  },
  {
    date: "2026-11-13",
    title: "Learn page and river challenge",
    href: "/learn",
    summary: "Lessons, practice and an illustrated glossary for the concepts the review uses.",
    changes: ["A playable river challenge.", "Every glossary term has an illustration."],
  },
  {
    date: "2026-11-13",
    title: "PokerLens launch: hand review and coach",
    href: "/",
    summary: "Paste a hand history and get a street-by-street review with equity, pot odds, EV and a verdict per decision, plus an AI coach that explains the computed numbers.",
    changes: ["Opponent ranges from charts, narrowed after each action and editable.", "The coach only sees a fact sheet of computed numbers."],
  },
];
