/**
 * The guided tour: one step per feature, each on the real page. A step names the page, the element to
 * highlight (an element with `data-tour="<target>"`), what the feature does and why it matters for player
 * study or game integrity. The current step lives only in the URL (`?tour=3`), so the tour remembers
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
  /** Why it matters for game integrity or player study, in one or two plain sentences. */
  why: string;
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
    why: "Players review hands from whichever site they play on, and an integrity team sees hand histories from many sources.",
  },
  {
    id: "decision",
    path: "/samples/river-lead",
    target: "decision",
    page: "Sample hand",
    title: "A verdict for every decision",
    what: "Each decision gets equity against the opponent's estimated range, the price to call, the EV of calling and of betting or raising, and a verdict. River and all-in decisions are exact for the range; earlier ones are labelled as approximate.",
    why: "Here folding second pair to a river lead gave up about 14bb. Leaks like this are what players study, and EV lost per decision is the measure an integrity system compares across players.",
  },
  {
    id: "range",
    path: "/samples/river-lead",
    target: "villain-range",
    page: "Sample hand",
    title: "The opponent's range, editable",
    what: "The range comes from position and preflop action, narrowed after every bet, call and check. You can edit it or switch the opponent profile, and every number updates.",
    why: "Every verdict depends on the read, so the app shows the assumption instead of hiding it, and a player can test how a different read changes the answer.",
  },
  {
    id: "coach",
    path: "/samples/river-lead",
    target: "coach",
    page: "Sample hand",
    title: "An AI coach that only explains the numbers",
    what: "A language model explains the hand in plain English from a fact sheet of computed numbers. An automated check makes sure it never states a number the engine did not compute.",
    why: "AI in a customer-facing workflow has to be trustworthy: the maths stays in deterministic code and the model only explains it.",
  },
  {
    id: "trainer",
    path: "/train",
    target: "trainer",
    page: "Range trainer",
    title: "Preflop range trainer",
    what: "Drill “seat and hand, what do you do?” against the charts, with spaced repetition on missed hands and accuracy per seat. Mixed hands accept any action the chart takes often enough.",
    why: "Learning ranges by repetition is how players study preflop, and knowing the baseline is what makes a deviation stand out.",
  },
  {
    id: "solver",
    path: "/solver",
    target: "solver",
    page: "River solver",
    title: "A real equilibrium for river spots",
    what: "A CFR solver takes two ranges, a pot and bet sizes and returns the equilibrium strategy for every hand, with value-to-bluff ratio and defence frequency.",
    why: "This is the kind of output real-time assistance tools show, so knowing what equilibrium play looks like is the first step to spotting it, and to exploiting players who deviate.",
  },
  {
    id: "pushfold",
    path: "/pushfold",
    target: "pushfold",
    page: "Push/fold",
    title: "Push/fold Nash for short stacks",
    what: "Exact shove and call ranges by stack depth, seat and ante, solved in the browser. Hand review uses the same solver for tournament hands under about 15bb.",
    why: "Short-stack charts are what assistance software shows a player, and play that matches equilibrium at every depth is a signal worth looking at.",
  },
  {
    id: "session",
    path: "/session",
    target: "session-import",
    page: "Session report",
    title: "Session import and leak report",
    what: "Upload a whole session and see EV lost by spot type, the biggest mistakes, and VPIP, PFR and 3-bet with how much each can be trusted. A sample session loads without a file.",
    why: "Players improve by reviewing sessions, not single hands, and the same per-player profile is where integrity work starts.",
  },
  {
    id: "integrity",
    path: "/integrity",
    target: "integrity-signals",
    page: "Integrity lab",
    title: "Integrity lab",
    what: "A prototype on synthetic players: EV lost per decision and bet-size spread compared with a baseline of simulated humans. The assisted player and the bot are flagged; the regular is not.",
    why: "Play too close to a model suggests real-time assistance, and uniform sizing suggests a bot. A flag is a reason to look, never proof.",
  },
  {
    id: "demo",
    path: "/demo",
    target: "demo-hands",
    page: "Demo hands",
    title: "Three hands to explain aloud",
    what: "Short walkthroughs of three sample hands: a river bluff-catch, jacks against a 4-bet jam, and a short-stack reshove. Every number in them is checked against the engine.",
    why: "They show the concepts in a few minutes, and the check means the script can never disagree with what the app shows.",
  },
  {
    id: "learn",
    path: "/learn",
    target: "learn",
    page: "Learn",
    title: "Lessons for the concepts behind the review",
    what: "Short lessons, practice questions, a playable river challenge and an illustrated glossary, each linked to a sample hand.",
    why: "A review is only useful if the player understands pot odds, ranges and EV, so the app teaches them where they are used.",
  },
  {
    id: "production",
    path: "/changelog",
    target: "changelog",
    page: "Changelog",
    title: "Metrics, monitoring and the changelog",
    what: "Anonymous usage events feed a private funnel at /metrics (password protected), errors from browsers and the server are recorded and grouped there, and this changelog shows what shipped and what changed after launch.",
    why: "Shipping is the start: you instrument usage, watch for errors and iterate, and each change here went through a pull request with tests and CI.",
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
