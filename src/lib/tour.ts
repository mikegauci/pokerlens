/**
 * The guided tour: one step per feature, each on the real page. A step names the page, the element to
 * highlight (an element with `data-tour="<target>"`), what the feature does. The current step lives only in the URL (`?tour=3`), so the tour remembers
 * nothing beyond the visit: no storage, no account.
 *
 * `tests/tour.test.ts` checks every step's page exists, every target is marked in the source, and every
 * page in the app has a step, so a new feature cannot ship without one.
 */
export interface TourStep {
  id: string;
  /** Page the step shows, without a query string. */
  path: string;
  /** Value of the `data-tour` attribute to highlight. */
  target: string;
  /** Short label for the link to the page. */
  page: string;
  title: string;
  /** What the feature does, in one or two plain sentences. */
  what: string;
}

/** Query parameter that holds the 1-based step number. */
export const TOUR_PARAM = "tour";

/** Window event that starts or moves the tour without a page load. Its detail is the 1-based step. */
export const TOUR_EVENT = "pokerlens:tour";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "import",
    path: "/",
    target: "hand-import",
    page: "Hand review",
    title: "Paste a hand from three sites",
    what: "Paste a PokerStars, GGPoker or 888poker hand, cash or tournament. Each format is turned into the same hand, so everything after this step works the same for all of them.",
  },
  {
    id: "decision",
    path: "/samples/river-lead",
    target: "decision",
    page: "Sample hand",
    title: "A verdict for every decision",
    what: "Each decision gets equity against the opponent's estimated range, the price to call, the EV of calling and of betting or raising, and a verdict. River and all-in decisions are exact for the range; earlier ones are labelled as approximate.",
  },
  {
    id: "range",
    path: "/samples/river-lead",
    target: "villain-range",
    page: "Sample hand",
    title: "The opponent's range, editable",
    what: "The range comes from position and preflop action, narrowed after every bet, call and check. You can edit it or switch the opponent profile, and every number updates.",
  },
  {
    id: "coach",
    path: "/samples/river-lead",
    target: "coach",
    page: "Sample hand",
    title: "An AI coach that only explains the numbers",
    what: "A language model explains the hand in plain English from a fact sheet of computed numbers. An automated check makes sure it never states a number the engine did not compute.",
  },
  {
    id: "trainer",
    path: "/train",
    target: "trainer",
    page: "Range trainer",
    title: "Preflop range trainer",
    what: "Drill “seat and hand, what do you do?” against the charts, with spaced repetition on missed hands and accuracy per seat. Mixed hands accept any action the chart takes often enough.",
  },
  {
    id: "solver",
    path: "/solver",
    target: "solver",
    page: "River solver",
    title: "A real equilibrium for river spots",
    what: "A CFR solver takes two ranges, a pot and bet sizes and returns the equilibrium strategy for every hand, with value-to-bluff ratio and defence frequency.",
  },
  {
    id: "pushfold",
    path: "/pushfold",
    target: "pushfold",
    page: "Push/fold",
    title: "Push/fold Nash for short stacks",
    what: "Exact shove and call ranges by stack depth, seat and ante, solved in the browser. Hand review uses the same solver for tournament hands under about 15bb.",
  },
  {
    id: "session",
    path: "/session",
    target: "session-import",
    page: "Session report",
    title: "Session import and leak report",
    what: "Upload a whole session and see EV lost by spot type, the biggest mistakes, and VPIP, PFR and 3-bet with how much each can be trusted. A sample session loads without a file.",
  },
  {
    id: "integrity",
    path: "/integrity",
    target: "integrity-signals",
    page: "Integrity lab",
    title: "Integrity lab",
    what: "A prototype on synthetic players: EV lost per decision and bet-size spread compared with a baseline of simulated humans. The assisted player and the bot are flagged; the regular is not.",
  },
  {
    id: "demo",
    path: "/demo",
    target: "demo-hands",
    page: "Demo hands",
    title: "Three hands to explain aloud",
    what: "Short walkthroughs of three sample hands: a river bluff-catch, jacks against a 4-bet jam, and a short-stack reshove. Every number in them is checked against the engine.",
  },
  {
    id: "learn",
    path: "/learn",
    target: "learn",
    page: "Learn",
    title: "Lessons for the concepts behind the review",
    what: "Short lessons, practice questions, a playable river challenge and an illustrated glossary, each linked to a sample hand.",
  },
  {
    id: "production",
    path: "/metrics",
    target: "metrics",
    page: "Metrics",
    title: "Metrics and monitoring",
    what: "Anonymous usage events feed a private funnel at /metrics (password protected), and errors from browsers and the server are recorded and grouped there.",
  },
];

/** Step index (0-based) from a query string such as "?tour=3", or null when there is no valid step. */
export function stepFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get(TOUR_PARAM);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= TOUR_STEPS.length ? n - 1 : null;
}

/** URL of a step (0-based index). */
export function stepHref(index: number): string {
  return `${TOUR_STEPS[index].path}?${TOUR_PARAM}=${index + 1}`;
}
