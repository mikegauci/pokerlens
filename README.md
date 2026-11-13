# PokerLens

Paste a No-Limit Hold'em hand history and get a street-by-street review: equity against an estimated range, pot odds, EV of calling, a verdict per decision, and an AI coach that explains the hand in plain English.

## What it does

- **Parses** PokerStars-format hand histories (cash and tournament, antes, all-ins, uncalled bets).
- **Replays** the hand on a table with a step-through timeline.
- **Analyses every hero decision**: Monte Carlo equity against each opponent's range with card removal, pot odds, EV of calling, SPR, bet size and bluff break-even frequency.
- **Estimates opponent ranges** from position and preflop action using simplified 6-max charts, then reweights them after each postflop bet, call or check. Ranges are editable, and an opponent profile (rarely bluffs / standard / bluffs a lot) shifts the estimate for exploitative review.
- **Explains** the hand with an LLM coach that only sees the computed numbers, with follow-up questions.
- **Trains preflop ranges** at `/train`: a seat, the action so far (first in, facing an open, opened and facing a 3-bet) and a hand; pick raise, call or fold and see the full 13x13 range for the spot with one sentence on why. The deal favours hands near the edge of each range, missed spots come back after a few hands (Leitner boxes counted in answers), and accuracy is recorded per position in `localStorage`.
- **Solves river spots** at `/solver`: a CFR+ solver for heads-up rivers takes two ranges, a pot, a stack and up to three bet sizes, and returns a Nash equilibrium. It shows the mixed strategy and EV of every combo, the value-to-bluff split of each bet, defence frequency against the minimum defence frequency, and how far the answer still is from equilibrium. Pick an opponent leak (bluffs too little or too much, calls or folds too much) to see the best response and what it gains.
- **Solves push/fold for short stacks** at `/pushfold`: pick a stack depth (1 to 20bb), a table size, the shover's seat and an ante, and see the equilibrium shoving range and each caller's calling range on the 13x13 grid. The ranges are solved in the browser with CFR+ over the 169 starting hands, from a checked-in table of exact hand-versus-hand all-in equities. Hand review uses the same solver for preflop decisions with about 15bb or less: hero's own shove (or fold when first in) is judged by its chip EV against equilibrium callers, and an opponent's shove or reshove gets an equilibrium range instead of a 100bb chart range. Each such verdict names the model it came from.
- **Reviews whole sessions** at `/session`: paste or upload a PokerStars file with many hands. It is split on hand headers and each hand is parsed on its own, so a hand that cannot be read (or a duplicate) is listed with its reason and the rest still import. Every hand goes through the same hand review, and the report shows EV lost by spot type (preflop unopened, facing an open, facing a 3-bet, facing a 4-bet or more, short-stack push/fold, flop or turn first to act or facing a bet, river first to act or facing a bet), verdict counts, EV lost per 100 hands next to the actual result, the ten biggest single mistakes (each opens its full review), and VPIP, PFR and 3-bet with their opportunity counts and a 95% Wilson interval. A sample session of 211 hands can be loaded without a file. The engine is `src/lib/poker/session.ts`; the page runs it in a Web Worker with a progress bar.
- **Accounts and saved hands** (Supabase auth, row-level security): save a reviewed hand with its assumptions, reopen it later, and see recurring leaks and total EV lost across saved hands.
- **Usage instrumentation**: anonymous product events (`hand_analyzed`, `decision_viewed`, `range_edited`, `profile_changed`, `coach_requested`, `hand_saved`, `trainer_answered`, `solver_run`, `solver_leak`, `pushfold_viewed`, `session_imported`, `session_analyzed`, `session_hand_opened`) go to a write-only `events` table. No hand text or personal data is recorded in events.
- **Shows the usage funnel** at `/metrics`, a private page: per anonymous session, how many reached hand analysed, then range edited, then coach requested, then hand saved, with conversion from the previous step and from the first, over the last 24 hours, 7, 30 or 90 days. Below it are raw event and session counts for every event name the app sends, plus any retired names still in the table. The aggregation is a pure function in `src/lib/metrics.ts`.

## What it is not

Hand review is not a solver. Preflop charts are binary approximations, postflop range narrowing is a documented heuristic, and equity is raw showdown equity. The UI says which verdicts are exact (river and all-in decisions, for the assumed range) and which are softer. Stack depth, ICM, rake and mixed strategies are not modelled. The range trainer drills those same binary 6-max 100bb charts, so "correct" there means "matches the chart", and it flags hands on the edge of a range as close.

The river solver is exact only for its model: two players, the ranges and bet sizes entered, at most one pot-sized raise, no rake. Ranges are entered by hand class, so suit combinations of a hand start with equal weight. It is not yet wired into hand review, which would need an estimate of hero's own range.

Push/fold ranges are exact only for small blind against big blind (one shover, one caller), and only as a shove-or-fold game: chip EV with no ICM, no limping and no min-raising, which real play prefers for many hands above roughly 10bb. With more players left to act it is an approximation: at most one player calls (no three-way all-ins), callers' cards are treated as independent, and everyone is given the same stack on the `/pushfold` page. A reshove over an open is solved against the opener's chart range with only the opener able to call, so it is an estimate too. Folded players' cards are ignored throughout. In hand review a small raise or limp with a short stack is still judged by the 100bb chart, with a note saying what the push/fold model would do.

The session leak report inherits every assumption of hand review: its EV figures are only as good as the estimated opponent ranges. EV is counted only where hand review computes it (calls and folds against a bet, and push/fold spots), so chart deviations and postflop betting choices are flagged as mistakes without an EV figure and the total understates what they cost. A river call or fold, or an all-in, is exact for the assumed range; everything with cards to come ignores implied odds. Sessions use 1,000 Monte Carlo samples per decision instead of 4,000 to stay fast, so opening a hand from the report can show a slightly different figure. VPIP, PFR and 3-bet follow the usual tracker definitions: walks are left out, checking the big blind is not VPIP, and a 3-bet opportunity is facing exactly one raise with chips left to re-raise, counted once per hand. The counts are exact; the page warns under 100 hands and flags any stat with fewer than 30 opportunities. Cash hands take a few milliseconds each; short-stack tournament hands take about 0.3 seconds each because hand review solves a multiway push/fold game for them. Only the PokerStars format is read.

The sample session is generated by `src/lib/poker/sample-session.ts`, a small seeded simulator: 200 6-max cash hands and 10 short-stack tournament hands, with villains playing the app's charts and a strength-based postflop policy, and a hero with leaks built in (calls opens too wide, folds too much to 3-bets, folds medium hands to river bets, calls river bets with busted hands, shoves too tight when short). Pots are kept heads-up after the flop and rake is zero. One hand is deliberately broken to show how import errors are reported. `tests/session.test.ts` checks that the report finds those leaks.

The metrics page counts sessions, not people: a session is one browser tab's random id in session storage, so a new tab or a new visit counts again, and signed-in users are not joined across devices. A funnel step counts a session only when it fired that event after reaching the step before (time order, row id breaking ties); a session that skips a step stops there, and a second figure shows how many sessions sent the event at all. Only events inside the window are read, so a session that started before the window opened can be missing its early steps. Events are sent from the browser without retries, so ad blockers and failed requests make every figure a lower bound. A page view reads at most 50,000 events and says so when it hits that limit; aggregation runs in the app rather than in SQL, which is fine at this traffic but would move into a database view at scale. The page itself records no events.

## Design decisions

- **The maths is deterministic code; the LLM only explains.** `/api/coach` re-runs the analysis on the server and sends the model a fact sheet. The prompt forbids it from producing its own numbers.
- **Seeded Monte Carlo**, so the same hand always gives the same output. The trainer's deal is seeded the same way: the next spot is a pure function of the stored progress.
- **The solver is checked against a closed-form answer.** `tests/solver.test.ts` solves the textbook nuts-or-air game at three bet sizes and compares bluff share, calling frequency and EV with the known equilibrium, then checks properties any equilibrium must have on a real spot (EVs sum to the pot, the nuts never fold, equilibrium play never loses to a leak, the best response never does worse).
- **Preflop equities are enumerated, not sampled, and checked in.** `scripts/preflop-equity.ts` runs every five-card board through the evaluator for all 14,196 pairs of starting-hand classes and writes `src/lib/poker/preflop-equity-data.ts`. That takes minutes, so it is done once rather than at page load; the push/fold solver then needs only table lookups and solves a spot in well under a second.
- **Push/fold is checked against the published chart and against the definition of an equilibrium.** `tests/pushfold.test.ts` compares shove and call thresholds with the HoldemResources heads-up Nash chart, recomputes every hand's EV independently to confirm that no single hand can gain by switching action, and checks that the calling range is exactly what pot odds allow against the shoving range.
- **Session stats are checked on hands built by hand.** `tests/session.test.ts` builds nine hands whose VPIP, PFR and 3-bet are known by construction (an open, a fold, a walk, a limp, a 3-bet, a flat, a fold to an open, an open that folds to a 3-bet, a checked big blind), and checks that EV lost by spot type sums to the total, that a broken hand is reported while the rest import, and that the same file always gives the same report.
- **Validation scenarios** in `tests/validation.test.ts`: hands where the right answer is not in dispute, plus consistency properties (wider range means more equity, more bluffs means a bluff-catcher gains equity, EV sign matches equity versus price). A change that flips one of these has made the output strategically inconsistent. `tests/trainer.test.ts` does the same for the trainer: every dealt spot agrees with the charts and with the hand review, AA always raises, 72o always folds, opening ranges only widen towards the button, and a missed spot is always scheduled sooner than one answered correctly.

- **The events table stays write-only for browsers.** No row-level security policy was loosened and no migration was needed. `/metrics` reads the table on the server with the Supabase secret key (`SUPABASE_SECRET_KEY`, no `NEXT_PUBLIC_` prefix, in a `server-only` module), selecting only the event name, session id and time, never props or user ids. The page is behind HTTP Basic auth with `METRICS_PASSWORD`: `src/proxy.ts` asks for it and the page checks it again before reading anything. With no password set the page reads nothing and says metrics are switched off; with no secret key it names the missing variable. Both are read at request time, so the build passes without them. The page is not linked from the app's header and is marked `noindex`.
- **The funnel is tested on hand-built event lists.** `tests/metrics.test.ts` covers step order, a session that skips a step, ties in time, sessions kept apart, empty windows, window edges, every event name being listed, and that the same rows in any order give the same output.

## Layout

- `src/lib/poker/` engine: `cards`, `evaluator`, `ranges`, `charts`, `equity`, `parser`, `analyze`, `trainer`, `solver`, `solver-spots`, `pushfold`, `preflop-equity-data` (generated by `scripts/preflop-equity.ts`), `session` (import and leak report), `sample-session` (simulated demo session)
- `src/lib/coach.ts` fact sheet and prompt
- `src/app/api/coach/route.ts` streaming coach endpoint
- `src/components/` UI
- `src/workers/session.worker.ts` runs a session analysis off the main thread
- `src/lib/supabase.ts`, `src/lib/track.ts` accounts, saved hands, usage events
- `src/lib/metrics.ts` funnel aggregation, `src/lib/metrics-data.ts` server-only events read, `src/lib/metrics-auth.ts` password check, `src/proxy.ts` password prompt for `/metrics`
- `src/lib/event-names.ts` the list of event names
- `src/lib/trainer-store.ts` trainer progress in `localStorage`
- `supabase/migrations/` schema and row-level security policies

## Run

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY and the Supabase URL and publishable key
npm run dev
npm test
```

To see `/metrics`, also set `SUPABASE_SECRET_KEY` (Supabase dashboard, API keys, a secret key) and `METRICS_PASSWORD` in `.env.local` or the host's server environment, then open `/metrics` and enter the password with any user name.
