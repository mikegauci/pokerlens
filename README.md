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
- **Accounts and saved hands** (Supabase auth, row-level security): save a reviewed hand with its assumptions, reopen it later, and see recurring leaks and total EV lost across saved hands.
- **Usage instrumentation**: anonymous product events (`hand_analyzed`, `decision_viewed`, `range_edited`, `profile_changed`, `coach_requested`, `hand_saved`, `trainer_answered`, `solver_run`, `solver_leak`, `pushfold_viewed`) go to a write-only `events` table. No hand text or personal data is recorded in events.

## What it is not

Hand review is not a solver. Preflop charts are binary approximations, postflop range narrowing is a documented heuristic, and equity is raw showdown equity. The UI says which verdicts are exact (river and all-in decisions, for the assumed range) and which are softer. Stack depth, ICM, rake and mixed strategies are not modelled. The range trainer drills those same binary 6-max 100bb charts, so "correct" there means "matches the chart", and it flags hands on the edge of a range as close.

The river solver is exact only for its model: two players, the ranges and bet sizes entered, at most one pot-sized raise, no rake. Ranges are entered by hand class, so suit combinations of a hand start with equal weight. It is not yet wired into hand review, which would need an estimate of hero's own range.

Push/fold ranges are exact only for small blind against big blind (one shover, one caller), and only as a shove-or-fold game: chip EV with no ICM, no limping and no min-raising, which real play prefers for many hands above roughly 10bb. With more players left to act it is an approximation: at most one player calls (no three-way all-ins), callers' cards are treated as independent, and everyone is given the same stack on the `/pushfold` page. A reshove over an open is solved against the opener's chart range with only the opener able to call, so it is an estimate too. Folded players' cards are ignored throughout. In hand review a small raise or limp with a short stack is still judged by the 100bb chart, with a note saying what the push/fold model would do.

## Design decisions

- **The maths is deterministic code; the LLM only explains.** `/api/coach` re-runs the analysis on the server and sends the model a fact sheet. The prompt forbids it from producing its own numbers.
- **Seeded Monte Carlo**, so the same hand always gives the same output. The trainer's deal is seeded the same way: the next spot is a pure function of the stored progress.
- **The solver is checked against a closed-form answer.** `tests/solver.test.ts` solves the textbook nuts-or-air game at three bet sizes and compares bluff share, calling frequency and EV with the known equilibrium, then checks properties any equilibrium must have on a real spot (EVs sum to the pot, the nuts never fold, equilibrium play never loses to a leak, the best response never does worse).
- **Preflop equities are enumerated, not sampled, and checked in.** `scripts/preflop-equity.ts` runs every five-card board through the evaluator for all 14,196 pairs of starting-hand classes and writes `src/lib/poker/preflop-equity-data.ts`. That takes minutes, so it is done once rather than at page load; the push/fold solver then needs only table lookups and solves a spot in well under a second.
- **Push/fold is checked against the published chart and against the definition of an equilibrium.** `tests/pushfold.test.ts` compares shove and call thresholds with the HoldemResources heads-up Nash chart, recomputes every hand's EV independently to confirm that no single hand can gain by switching action, and checks that the calling range is exactly what pot odds allow against the shoving range.
- **Validation scenarios** in `tests/validation.test.ts`: hands where the right answer is not in dispute, plus consistency properties (wider range means more equity, more bluffs means a bluff-catcher gains equity, EV sign matches equity versus price). A change that flips one of these has made the output strategically inconsistent. `tests/trainer.test.ts` does the same for the trainer: every dealt spot agrees with the charts and with the hand review, AA always raises, 72o always folds, opening ranges only widen towards the button, and a missed spot is always scheduled sooner than one answered correctly.

## Layout

- `src/lib/poker/` engine: `cards`, `evaluator`, `ranges`, `charts`, `equity`, `parser`, `analyze`, `trainer`, `solver`, `solver-spots`, `pushfold`, `preflop-equity-data` (generated by `scripts/preflop-equity.ts`)
- `src/lib/coach.ts` fact sheet and prompt
- `src/app/api/coach/route.ts` streaming coach endpoint
- `src/components/` UI
- `src/lib/supabase.ts`, `src/lib/track.ts` accounts, saved hands, usage events
- `src/lib/trainer-store.ts` trainer progress in `localStorage`
- `supabase/migrations/` schema and row-level security policies

## Run

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY and the Supabase URL and publishable key
npm run dev
npm test
```
