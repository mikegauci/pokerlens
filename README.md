# PokerLens

Paste a No-Limit Hold'em hand history and get a street-by-street review: equity against an estimated range, pot odds, EV of calling, a verdict per decision, and an AI coach that explains the hand in plain English.

## What it does

- **Parses** PokerStars-format hand histories (cash and tournament, antes, all-ins, uncalled bets).
- **Replays** the hand on a table with a step-through timeline.
- **Analyses every hero decision**: Monte Carlo equity against each opponent's range with card removal, pot odds, EV of calling, SPR, bet size and bluff break-even frequency.
- **Estimates opponent ranges** from position and preflop action using simplified 6-max charts, then reweights them after each postflop bet, call or check. Ranges are editable, and an opponent profile (rarely bluffs / standard / bluffs a lot) shifts the estimate for exploitative review.
- **Explains** the hand with an LLM coach that only sees the computed numbers, with follow-up questions.

- **Accounts and saved hands** (Supabase auth, row-level security): save a reviewed hand with its assumptions, reopen it later, and see recurring leaks and total EV lost across saved hands.
- **Usage instrumentation**: anonymous product events (`hand_analyzed`, `decision_viewed`, `range_edited`, `profile_changed`, `coach_requested`, `hand_saved`) go to a write-only `events` table. No hand text or personal data is recorded in events.

## What it is not

It is not a solver. Preflop charts are binary approximations, postflop range narrowing is a documented heuristic, and equity is raw showdown equity. The UI says which verdicts are exact (river and all-in decisions, for the assumed range) and which are softer. Stack depth, ICM, rake and mixed strategies are not modelled.

## Design decisions

- **The maths is deterministic code; the LLM only explains.** `/api/coach` re-runs the analysis on the server and sends the model a fact sheet. The prompt forbids it from producing its own numbers.
- **Seeded Monte Carlo**, so the same hand always gives the same output.
- **Validation scenarios** in `tests/validation.test.ts`: hands where the right answer is not in dispute, plus consistency properties (wider range means more equity, more bluffs means a bluff-catcher gains equity, EV sign matches equity versus price). A change that flips one of these has made the output strategically inconsistent.

## Layout

- `src/lib/poker/` engine: `cards`, `evaluator`, `ranges`, `charts`, `equity`, `parser`, `analyze`
- `src/lib/coach.ts` fact sheet and prompt
- `src/app/api/coach/route.ts` streaming coach endpoint
- `src/components/` UI
- `src/lib/supabase.ts`, `src/lib/track.ts` accounts, saved hands, usage events
- `supabase/migrations/` schema and row-level security policies

## Run

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY and the Supabase URL and publishable key
npm run dev
npm test
```
