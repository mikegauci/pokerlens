@AGENTS.md

# PokerLens

A No-Limit Hold'em study tool: paste a hand history, get a street-by-street review (equity, pot odds, EV, verdicts) and an LLM coach that explains the computed numbers.

It has two purposes, and every change should serve at least one:

1. **Teach its author GTO.** He is between beginner and intermediate. Features should make a concept concrete (ranges, EV, Nash, balance, exploits), and explanations in the UI should be plain enough to learn from.
2. **Be demoed live in an interview** for a senior full-stack product engineer role that requires deep poker knowledge. The company (A5 Labs, a5labs.co) builds game-integrity technology for online poker: player risk and value profiling, and detection of bots, real-time assistance and other illegitimate software.

What the role asks for, and so what the app should show: hand ranges, position, pot odds, equity, EV, bet sizing, GTO and exploitative play; spotting strategically inconsistent outputs; understanding how players study and review; shipping end to end; instrumenting usage; iterating with real users; AI in a customer-facing workflow.

## How to work in this repo

One roadmap item per chat, one pull request per item.

1. `git switch main && git pull`. Pick the first unchecked item in the roadmap below unless told otherwise. If it depends on an unmerged pull request, say so and branch from that branch instead.
2. Create a branch with a short descriptive name, for example `river-solver`.
3. Build the item. Keep the pull request to that one item.
4. Before committing, all of these must pass: `npm test`, `npm run lint`, `npm run build`. For anything visible, check it in the browser too.
5. Tick the item's box in this file and update `README.md` if behaviour or limits changed. Both go in the same pull request.
6. Commit, `git push -u origin <branch>`, and open the pull request with `gh pr create`.
7. Stop. Give the pull request link and tell the author to open a new chat for the next item, so each item starts with a fresh context.

### Commits and pull requests

- The author is the only name on a commit. Never add `Co-Authored-By`, "Generated with Claude", or any other attribution line to a commit message or a pull request description.
- Pull request titles are plain descriptions of the change, such as "Add a river solver". No numbers, no step or phase prefixes, no ticket ids.
- Commit messages follow the existing history: one imperative sentence, for example "Add PokerLens Learn page with lessons and practice".
- Never commit `.env` or `.env.local`.

## Engineering rules

- **The maths is deterministic code. The LLM only explains.** The coach never produces its own numbers; it reads a fact sheet built in `src/lib/coach.ts`.
- **Say what is exact and what is approximate.** A river or all-in result is exact for the assumed ranges; chart lookups and range narrowing are heuristics. The UI must label which is which. Only call something "GTO" or "equilibrium" when a solver in this repo computed it, and state the model it was solved for (ranges, bet sizes, rake).
- **Every poker feature ships with validation scenarios**: tests in `tests/` where the right answer is not in dispute, plus consistency properties (for example, a wider calling range never makes a bluff more profitable). A change that flips one has made the output strategically inconsistent.
- **Same input, same output.** Any randomness is seeded.
- **Instrument new features** with `track()` in `src/lib/track.ts`. Events carry counts and labels only, never hand text or personal data.
- Engine code lives in `src/lib/poker/` and has no React or network dependencies, so it can be unit tested and run on the server.
- Database changes go in a new file under `supabase/migrations/` with row-level security.

## Roadmap

### First: make the demo defensible

- [x] **River solver.** A CFR solver for heads-up river spots: two ranges, a pot, a stack and a set of bet sizes in; equilibrium strategies and EVs out. Show mixed frequencies per hand, bluff-to-value ratio and minimum defence frequency, and the EV gained by deviating against an opponent who bluffs too little or too much. This is the first real GTO output in the app.
- [x] **Preflop range trainer.** Drill "position and hand, what do you do?" against the charts in `src/lib/poker/charts.ts`, with spaced repetition on missed hands and a per-position accuracy record. This is how players study ranges.
- [x] **Push/fold Nash for short stacks.** Exact shove and call ranges by stack depth and position. Use it for tournament hands under about 15bb, which are currently judged with 100bb cash charts.
- [x] **Session import and leak report.** Upload many hands at once; report EV lost by spot type and basic stats (VPIP, PFR, 3-bet). Players review sessions, not single hands.
- [x] **Metrics page.** Read the `events` table and show the funnel: hand analysed, range edited, coach requested, hand saved. The table is write-only for clients today, so this needs a server-side read.
- [x] **Coach evaluations.** An automated check that coach output never states a number that is missing from the fact sheet, run over the sample hands.
- [x] **Three demo hands.** Pick three hands the author can explain aloud without notes, and add a short written walkthrough of each.

### Later: aim at game integrity

- [x] **Integrity lab.** For one player's set of hands, plot the distribution of EV lost per decision against a human baseline. Play that is too close to solver output suggests real-time assistance; overly uniform sizing suggests a bot. Label it a prototype on synthetic data.
- [x] **More hand-history formats.** `src/lib/poker/parser.ts` only reads the PokerStars format.
- [x] **Engine depth.** Mixed-frequency and stack-depth-aware preflop charts, EV of raising (today only call versus fold), equity realisation instead of raw equity.
- [x] **Production story.** Deployment, error monitoring, and a changelog that shows iteration after launch.

### Last: present it

- [ ] **Guided tour.** A step-by-step walkthrough the author can click through with a hiring manager: each step highlights one feature on the real page (hand review, coach, range trainer, river solver, push/fold, session report, metrics, and whatever else has shipped by then), says in one or two plain sentences what it does and why it matters for game integrity or player study, and links to the page. It can be started from the home page and skipped or left at any step, works at 375px, and remembers nothing beyond the current visit. Build this last, so it covers every feature that exists.
