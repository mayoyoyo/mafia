# Orchestrator Brief — Mafia Audit-Fix Pipeline

You are the **central orchestrator** for fixing the bugs in `AUDIT-REPORT.md` on branch `fix/audit-findings`. Read this file + `AUDIT-REPORT.md` and you have full state; no prior session context is needed.

## Operating model (non-negotiable)
- **You delegate ALL work to subagents.** You do not read/write code, write tests, or run `bun test` yourself. Every action — implementation, spec-compliance review, code-quality review, independent verification, investigation — is a subagent dispatch. Your job is to construct precise subagent prompts, relay results, and sequence tasks.
- **Stay lean.** Keep only what you need to coordinate. Relay subagent results in a sentence or two; don't echo full diffs or logs into your own context.
- **Size every subagent to ~30% of its own context.** Scope each dispatched task so a worker can finish well within ~30% context. If a task is bigger (multi-file, multiple bugs, sprawling tests), split it into smaller subagent dispatches before sending. One bug area per implementer where practical.
- **TDD always; never regress.** Every implementer writes a failing test FIRST, proves it fails for the right reason, implements the minimal fix, proves it green, then runs the FULL `bun test` (must stay green). No fix is "done" without this.
- **Two-stage review per task:** after the implementer reports, dispatch (1) a spec-compliance reviewer ("do not trust the report — verify by reading the diff and running tests"), then (2) a code-quality reviewer (use the `code-reviewer` agent type). Fix-loop until both pass. Only then mark the task done and move on.
- **Self-handoff:** when YOUR OWN context approaches ~40-50%, stop at a clean commit boundary, update the Status section below (commit SHAs + remaining), and hand off to a fresh orchestrator with this file. The pipeline checkpoints into git after every task, so handoff is always safe.

## Standing regression gate: the 10-player full-game test
**Build this FIRST (before resuming bug fixes), then it gates everything.** Dispatch a subagent to add a WS-level integration test (own server spawn, own port band e.g. 8600+, own /tmp DATABASE_PATH, cleanup in afterAll) simulating a realistic **10-player game** end-to-end: 2 mafia + doctor + detective + joker (+ optionally lovers), through multiple night sub-phases (mafia consensus, doctor save, detective investigate), dawn resolution, day discussion, admin-called votes, lynches, to a natural win — asserting phase/alive-list/role-secrecy invariants throughout (no non-mafia learns roles pre-game-over; vote tallies internal; win fires at the correct parity). It must be part of `bun test` so every subsequent task's "full suite green" gate includes a full 10-person game. Roles are random — the test discovers them from `game_started` and adapts. Keep it deterministic and bounded.

## Decisions already made (do not re-litigate)
- **M8** (joker parity): README is the spec — a living joker counts toward NEITHER team. T10 drops `+ aliveJoker.length` from `checkWinCondition`.
- **M9** (votes don't resolve when an alive player is disconnected): KEEP the wait-for-all-alive design. Guarantee rejoin reliability instead (H4 + L2 + L6) and prove it with T16's every-role-every-phase rejoin sim + the 10-player test. M9 = resolved-by-design once T16 passes.

## Subagent prompt templates
`/Users/hansonkang/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/subagent-driven-development/{implementer,spec-reviewer,code-quality-reviewer}-prompt.md`

## Conventions / constraints
- **Branch:** `fix/audit-findings`. **Never push** (user pushes). **Version bump** (`APP_VERSION_STAGING` in `public/app.js`, format `staging.{PATCH}_{YYYYMMDDHHmm}` PST via `TZ="America/Los_Angeles" date +"%Y%m%d%H%M"`) happens ONCE at T17 — implementers must NOT bump it per-task.
- **Do not commit** `AUDIT-REPORT.md`, `ROLE-RESEARCH.md`, `HANDOFF.md`, `.playwright-mcp/` (untracked, intentional).
- Each commit ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **WS test port bands** (each test file spawns its own server): e2e 4567+, rejoin 5567+, save-signal 6567+, handler-guards 7600+, 10-player-regression 8600+, night-guards 9600+, settings-validation 10600+, new files pick a fresh band (11600+).
- Engine-level fixes → tests in `tests/game-engine.test.ts` / `tests/doctor-joker-modes.test.ts`. Server/protocol fixes → WS-level test file (rejoin/e2e harness: spawn server, openWS/waitFor/send/reg helpers). Roles are random — tests adapt via `game_started`.
- Bun doesn't typecheck at runtime; `types.ts` edits are for correctness/IDE.

## Status

### DONE (commits on the branch)
| Task | Bug | Commits |
|---|---|---|
| T1 | H1 joker multi-night haunt | bf50cbb, b6242bc |
| T2 | H2 official-mode doctor save name leak (+ anonymous `saved` flag) | 453340c, 171cc9f |
| T3 | H3 detectiveHistory leak in game_sync | b5ad164 |
| T4 | H4 mafia rejoin pre-confirm soft-lock | 87ed3b3 |
| T5 | M1 end_day guard, M3 abstain_vote guard, M10 end_game guard, L7 cast_vote guard | f25e2cd, afdd9e8 |
| T5b | Standing 10-player full-game WS regression gate (`tests/ten-player-regression.test.ts`, band 8600+) | f863e58, 2f1b245 |
| T6 | M4 confirm_mafia_kill alive-mafia auth, M7 narrator-gate guards on all 6 night handlers, L2 flag clears + narrator_ready phase guard (`tests/night-guards.test.ts`, band 9600+) | 9225035 |
| T7 | M2 clearNightTimer in restart_game (pre-engine) / return_to_lobby (post-success-check — placement is load-bearing, see test NOTE) | 9976419 |
| T8 | M6 settings chain: NaN-proof clamp, `sanitizeSettings` at both untrusted boundaries (wire + DB load), client +/- guard; L8 username cap 32 (`tests/settings-validation.test.ts`, band 10600+) | 103dd31, 94478e7 |
| T9 | M5 `classifyNightDeath` by source (engine + server you_died loop; vote-loop positional logic verified exact, untouched), L9 house-win vote-state clear | 931b9f9 |
| T10 | M8 living joker counts toward NEITHER team in win parity (README spec) | 1e5ecce |
| T11 | M13 single-pass narrator fill (also fixed pre-existing `$`-pattern corruption, pinned) | f826069, bf52ad9 |
| T12 | M12 votesFor/votesAgainst stripped from vote_result wire+type, L1 jokerJointWinner in buildGameSync + end_game broadcast, L3 forceEndGame sets winner="town" | d169909 |
| T13 | M11 single-mafia tap race (atomic maybe+lock + in-flight guard, both sites) + L6 corrupt `mafia_user` localStorage guard; L5 `game_over` queued behind overlay chains (`pendingGameOver` hold/flush) + optional rejoin slide-confirm cosmetic; hardening follow-up (defensive clears on room_closed/game_started, harness opts guard). NEW client test harness `tests/helpers/client-harness.ts` (happy-dom + StubWebSocket + timeScale; dev dep `@happy-dom/global-registrator`) | 38fd6eb, 24d48c9, 9d1b9ae |
| T14 | M14 sw.js caches only `response.ok`; L11 precache synced (+`/pixel-art.js`, real `.svg` icons), CACHE_NAME→`mafia-v3` (existing activate handler deletes v2); test follow-up pins activate cleanup, CACHE_NAME format, index.html→ASSETS drift (`tests/sw.test.ts`, sandboxed — no port band) | 948c9e9, 292fd29 |
| T15 | L10 dead `saved_configs` table dropped (+`DROP TABLE IF EXISTS` for deployed volumes) + REQUIREMENTS settings-persistence claim corrected; L4 README roster + REQUIREMENTS document BOTH joker modes (official default vs house, doctor-can-block-haunt); follow-up aligned README features line + 3 REQUIREMENTS joker lines | 563e9d5, ab7c889 |
| T16 | Every-role/phase rejoin verification. Night matrix (`tests/rejoin-matrix-night.test.ts`, band 11600+): dead spectators per sub-phase, haunting-joker rejoin (pending re-send + resolved), narrator-gate rejoins (admin awaiting_ready re-send), admin force_dawn post-rejoin, alive joker. Day matrix (`tests/rejoin-matrix-day.test.ts`, band 12600+): **M9 stall→rejoin→resolve proof**, voting/day role matrices (incl. dead-mafia mafiaTeam + dead-voter voteState pins), admin call_vote/cancel_vote post-rejoin, dead-player game_over rejoin. **M9 CLOSED — resolved-by-design** (spec-review verdict) | 898e796, 4b0ff98 |
| T17 | Final gate: 4 parallel reviews of `git diff staging...HEAD` (src interactions/guard-sweep/leak-sweep; client+sw+docs hunk-by-hunk; tests/deps/port-bands/forbidden-files; verification) — ALL APPROVE. `targetId: number` declared on `mafia_confirm_ready` (clears both src tsc errors; src/ now ZERO branch-introduced). **APP_VERSION_STAGING → `staging.13_202606100404`** (APP_VERSION untouched) | f652d8d, 645aaf3 |

**PIPELINE COMPLETE** — final state at `645aaf3`: **286 tests passing / 0 fail** (~149s, 17 files; 10-player gate in every pass), `bunx tsc --noEmit` = **15 errors** (staging baseline 12; the 4 branch-added in tests/doctor-joker-modes.test.ts match that file's 9 un-annotated pre-existing patterns — left for a uniform file-wide cleanup; src/ contributes zero). 30 commits on the branch. **User pushes.**

### Process notes from T5b–T12 (for the next orchestrator)
- Every task above went implementer → spec-compliance reviewer → code-quality reviewer (code-reviewer agent type); all approved. Review-requested hardening landed as follow-up commits (T5b: 2f1b245, T8: 94478e7, T11: bf52ad9), each re-verified.
- Deferred OPTIONAL polish (fold into T17 only if convenient, none blocking): producer-side push-order note at resolveNight's killed.push sites + `Extract<GameEvent["type"],...>` return type for classifyNightDeath (T9 review); joint-win rejoin test could also rejoin a citizen; ten-player tally-absence assertions could use `not.toHaveProperty` (T12 review).
- `bunx tsc --noEmit` has PRE-EXISTING errors (reported counts varied 15–41 by invocation; stable at 17 throughout T13–T16); the rule used: zero NEW errors vs parent.
- Admin-leave force-end broadcast (~server.ts:765) still omits jokerJointWinner — assessed acceptable (removeGame immediate, no rejoin possible), deliberately out of T12 scope.

### Process notes from T13–T16 (for the T17 orchestrator)
- Every task went implementer → spec-compliance reviewer → code-quality reviewer; all approved. Review-requested hardening landed as verified follow-up commits (T13b: 9d1b9ae, T14: 292fd29, T15: ab7c889).
- Client tests evaluate `public/app.js` under happy-dom via `tests/helpers/client-harness.ts` — callers MUST `await unloadClientApp()` in afterAll (bun shares one process); `loadClientApp({timeScale})` compresses setTimeout delays; StubWebSocket starts OPEN, never auto-fires onopen.
- The T17 full-diff review vs staging now also includes: new dev dep `@happy-dom/global-registrator` (package.json, bun.lock), 5 new test files, README/REQUIREMENTS doc edits.
- DEFERRED OPTIONAL polish (fold into T17 only if convenient, none blocking — in addition to the T9/T12 items above): rename `pendingMafiaLockTarget`→boolean-ish name (only null-compared); single-mafia tap guard stays stuck for the night if the server silently drops the vote (no `mafia_vote_update` echo — rare, assessed acceptable); document StubWebSocket's no-auto-onopen on the class; client-harness hardcodes ["pixel-art.js","app.js"] script list; db.test.ts subprocess assertion could surface stderr + use try/finally temp cleanup; T16 residual gaps: dead-rejoin during transient `resolving` sub-phase unpinned (~1s window), game_over `revealPlayers` asserts roles defined not per-player-correct, haunting-joker rejoin covered for official mode only.
- RECOMMENDED POST-PIPELINE (do NOT do in T17 — too big): extract shared `tests/helpers/ws-harness.ts` — 8 test files copy `waitFor` etc. verbatim (byte-identical today, drift starting at edges); fold in a `waitMatch` label param, standardized /tmp DATABASE_PATH (rejoin.test.ts + e2e.test.ts still write repo-root mafia.db), central port-band registry. Natural T19 adjunct.
- sw.js pre-existing quirks left alone (correctly out of M14/L11 scope): cache.put not gated on GET, floating put promise, fragile `url.includes('/ws')` bypass — future SW pass.

### REMAINING
None — T1–T17 all complete. Next actions belong to the user: push `fix/audit-findings` → PR/merge to `staging` (auto-deploys to maf1a-staging.fly.dev). Post-pipeline follow-ups live in the process notes above (deferred polish, shared ws-harness extraction, doctor-joker-modes tsc-annotation uniform cleanup) and in T18 (architecture audit, separate instance) / T19 (test hardening gaps).

### POST-FIX (separate)
- **T18** — Architecture/extensibility audit (READ-ONLY, deliver a refactor proposal, no code changes). **Being run in a separate CC instance** — see ROLE-RESEARCH.md cost-cliff analysis. Don't duplicate.
- **T19** — Core-gameplay test hardening (parity boundaries, lover-cascade matrix, vote-majority boundaries, night-resolution ordering invariants). Largely subsumed by the 10-player regression test + per-task tests; do remaining gaps last.

## Parallelization & isolation (worktrees)
- Bug fixes T6–T15 commit sequentially and overlap on server.ts/game-engine.ts/app.js → **ONE orchestrator only**.
- **Inside this orchestrator: do NOT give subagents per-task worktrees.** The pipeline is strictly sequential — one implementer writes and commits to `fix/audit-findings`, then read-only reviewers inspect that commit, then the next task. Only one writer is ever active, so there is nothing to isolate; worktrees would fragment the shared branch and break the commit→review→next-commit flow. (Worktree isolation exists for *parallel* writers, which this pipeline deliberately avoids.) The orchestrator itself operates in THIS checkout on `fix/audit-findings`.
- **Any concurrently-running OTHER instance MUST use its own git worktree** so it never shares this working directory or git index. This applies to the T18 architecture audit (read-only on code, writes only ARCHITECTURE-AUDIT.md) — even read-only work collides on git state and test artifacts if it shares the checkout. Create it with: `git worktree add --detach ../mafia-arch-audit staging` (detached so no branch is locked), run that instance from `../mafia-arch-audit`, and `git worktree remove ../mafia-arch-audit` when done.
- New-role research (R1) DONE → `ROLE-RESEARCH.md`.
