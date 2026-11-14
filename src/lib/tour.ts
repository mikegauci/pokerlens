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
    title: "What PokerLens is",
    what: "PokerLens is a No-Limit Hold'em study tool: paste a hand from PokerStars, GGPoker or 888poker and it reviews every decision.",
  },
  {
    id: "decision",
    path: "/samples/river-lead",
    target: "decision",
    page: "Sample hand",
    title: "A verdict for every decision",
    what: "Each decision gets equity, the price to call, EV and a verdict. Here, folding on the river gave up about 14bb.",
  },
  {
    id: "range",
    path: "/samples/river-lead",
    target: "villain-range",
    page: "Sample hand",
    title: "The opponent's range",
    what: "Every verdict depends on what the opponent could hold, so the range is shown and can be edited.",
  },
  {
    id: "coach",
    path: "/samples/river-lead",
    target: "coach",
    page: "Sample hand",
    title: "An AI coach that explains the numbers",
    what: "A language model explains the hand in plain English, and a check makes sure it never invents a number.",
  },
  {
    id: "trainer",
    path: "/train",
    target: "trainer",
    page: "Range trainer",
    title: "Preflop range trainer",
    what: "Drills the preflop charts, repeating the hands you get wrong.",
  },
  {
    id: "solver",
    path: "/solver",
    target: "solver",
    page: "River solver",
    title: "River solver",
    what: "Solves river spots for the equilibrium strategy of every hand: when to bet, bluff, call or fold.",
  },
  {
    id: "pushfold",
    path: "/pushfold",
    target: "pushfold",
    page: "Push/fold",
    title: "Push/fold for short stacks",
    what: "Exact shove and call ranges for tournament stacks under about 15bb.",
  },
  {
    id: "session",
    path: "/session",
    target: "session-import",
    page: "Session report",
    title: "Session leak report",
    what: "Upload a whole session to see where the most EV was lost, plus VPIP, PFR and 3-bet.",
  },
  {
    id: "integrity",
    path: "/integrity",
    target: "integrity-signals",
    page: "Integrity lab",
    title: "Integrity lab",
    what: "A prototype that flags assisted players and bots by how close to perfect, and how uniform, their play is.",
  },
  {
    id: "demo",
    path: "/demo",
    target: "demo-hands",
    page: "Demo hands",
    title: "Three demo hands",
    what: "Three sample hands with short walkthroughs, every number checked against the engine.",
  },
  {
    id: "learn",
    path: "/learn",
    target: "learn",
    page: "Learn",
    title: "Learn",
    what: "Short lessons and practice on pot odds, ranges and EV, each linked to a sample hand.",
  },
  {
    id: "production",
    path: "/metrics",
    target: "metrics",
    page: "Metrics",
    title: "Metrics and monitoring",
    what: "Usage and errors are recorded and shown on a private page at /metrics.",
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
