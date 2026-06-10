# Mafia Game — Architecture Audit & Refactor Proposal

**Date:** 2026-06-09 · **Branch:** `staging` @ `977d78c` (read-only worktree) · **Status:** proposal only — no source files modified

**Method:** full firsthand read of `src/` and `public/` plus a 16-agent workflow: 5 parallel subsystem mappers (engine, server, client, types/narrator/db/tests, engine↔server boundary), a 3-architect design panel (role registry vs. minimal targeted seams vs. event pipeline) scored by 2 independent judges, adversarial verification of every structural claim — **105 claims checked against source, 103 confirmed, 2 rejected** — and a final 3-agent adversarial review of this document itself (every citation opened; five factual corrections applied). Companion documents: `AUDIT-REPORT.md` (29 confirmed bugs, H1–L11) and `ROLE-RESEARCH.md` (Vigilante / Godfather / Hunter / Miller / Masons). Bugs already counted there are referenced by ID, never re-counted.

**Scope:** new-role scope is **Hunter only** (owner decision, approved in the main-checkout orchestration). Vigilante and Godfather were rejected on 9-player balance grounds — Godfather guts the lone detective's information engine solo at 9; Vigilante adds a proactive second nightly kill with high variance — and Miller/Masons fall away with them. This document is cut to that scope: the seam analysis below is what the 29 bugs justify on their own plus what Hunter genuinely requires. P-numbers are kept stable (P1–P9) so cross-references survive; dropped components are marked, not renumbered.

---

## Executive summary

1. **The codebase does not need a role registry — it needs targeted seam consolidations.** The verified bug history is not "role logic lives in the wrong place"; it is specific copy-paste seams that drift: seven hand-rolled night-reset lists (the H1/L2/L9 class), five near-verbatim kill blocks plus three positional kill-classifiers (the M5 class), a triplicated win-check epilogue, three hand-maintained projections of every fact (the L1/L3/H4 class), night choreography duplicated across engine and server, and triplicated client tables. All three independently designed architectures converged on cutting these same seams; both judges picked the **minimal targeted-seams design** over a declarative role registry and an event-pipeline rewrite. The Hunter-only scope makes that verdict conclusive: with one new role, a registry has nothing left to generalize over (mafia consensus and joker haunt stay bespoke under every design anyway).

2. **The payoff is concrete for the role actually being built.** Hunter today: ~400–500 LOC across ~25 sites, where the hardest ~100 LOC are ad-hoc restructuring — gates hand-inserted before all **three** win-check sites and both synchronous auto-night copies inside `resolveVote` — and the death trigger would *silently miss heartbreak deaths*, because the lover cascade bypasses `killPlayer` (`game-engine.ts:420-426`). After the two seams Hunter rides (P2 death pipeline, P5 `concludeRound`): ~150–250 LOC + content, with the trigger firing for every death source (night kill, execution, haunt, heartbreak) from one hook.

3. **Debuggability is the bigger emergency than structure.** The server has exactly **one** `console` statement (the startup banner), no phase-transition function (16 `game.phase` writes across 10 engine functions, 12 independently hand-assembled `phase_change` broadcasts that already disagree), an opaque single-slot timer map, **no typecheck gate at all** (`tsc` runs clean out of the box and surfaces 12 real existing errors — verified — but no script or CI step ever invokes it), no RNG/clock seams (so tests bail probabilistically and sleep on wall clocks), and a test suite that writes into the developer's real SQLite database.

4. **Sequencing matters: fix first, then consolidate.** The seven reset lists *disagree with each other* — that disagreement **is** bugs H1/L2/L9. Land those one-line fixes (plus M5, H2/H3, H4, M6/M7, and the M8 rules decision) **before** the corresponding refactor steps, so each consolidation is a verifiable dedup rather than a silent behavior arbitration. The full interleaving is in Part 4.

5. **Recommended program (Hunter-only):** a core of 2M + 1S — P1 reset seam, P2 death pipeline, P5 `concludeRound` — plus four small S items (P6-lite projections, P7-micro client hardening, the Phase-0 types pass, P9 test consolidation deferred). Comfortably under a week part-time before the Hunter PR, each step independently shippable to staging. After P1/P2/P5 the H1 and M5 bug classes are structurally unregressable and every Hunter prerequisite exists. Dropped relative to the original five-role program: P3, P4, P8's audio machinery, and the full versions of P6/P7 — roughly 2L + 1M of work that no longer buys anything.

---

# Part 1 — Extensibility for new character types

## 1.1 What adding a role costs today: the touchpoint inventory

The mappers enumerated 74 distinct role touchpoints. Collapsed by archetype — **only the death-trigger row is scheduled**; the other rows are retained as the recorded cost basis for the scope decision (they are *why* Vigilante was the expensive pick and why the cuts in §1.3 are safe):

| Archetype | Example | Touchpoints today | The expensive part |
|---|---|---|---|
| **Death trigger** — **SCHEDULED** | **Hunter** | ~25 sites, ~400–500 LOC | The hardest 100 LOC are ad-hoc restructuring: gates before all **three** win-check sites and both synchronous auto-night copies inside `resolveVote`; plus the lover-cascade bypass (below) means heartbreak deaths would not fire the trigger |
| Night-acting (new sub-phase) — rejected | Vigilante | ~40 sites, 8+ files, ~450–600 LOC + 16 mp3s | A third verbatim copy of the `advanceNightSubPhase` branch, a fourth copy of the submit-validation skeleton, **all seven** reset lists, rewrite of `resolveNight`'s two-source save booleans, 2 `buildGameSync` branches, both fake-phase conditions, 3 client gate lists, 3 client reset lists, 4 cue-name registries |
| Passive flag — rejected | Godfather, Miller | ~12 sites, 5 files, ~55–70 LOC | Cheap in LOC but four latent hazards: both engine reset loops, both `game_started` loops, the unvalidated settings path (M6), the H3 `detectiveHistory` leak |
| Info-only — rejected | Masons | ~10 sites, ~40 LOC | Both `game_started` loops (`src/server.ts:797-811` vs `1224-1238`) and the `game_sync` twin — the L1-class "live vs rejoin drift" trap |

Five structural facts dominate every column:

- **Seven divergent night-reset lists** — `transitionToDay` (`src/game-engine.ts:626-636`, the canonical one: among the five per-night lists, only it carries `doctorTarget` forward into `lastDoctorTarget` and clears `jokerHauntVoters` — the two full resets also touch both, but null them), the two `resolveVote` auto-night copies (`759-766`, `822-830`, five fields each), `forceDawn` (`852-861`), `endDay` (`871-878`), and the byte-duplicated full resets in `returnToLobby` (`914-938`) vs `restartGame` (`953-978`). Their three-way disagreement is literally bugs H1, L2, and L9. Every new night field must be hand-added to up to seven lists.
- **Five near-verbatim kill blocks** (`killPlayer` → push message → push killed → if lover push lover message/event): `src/game-engine.ts:539-550`, `584-597`, `733-744`, `775-786`, `791-804` — plus the positional lover-death classifier in **three** places (`game-engine.ts:617-624` and `server.ts:1407-1412`, both already owned by M5; the vote-path twin at `server.ts:1037-1042` is the additional site). And the lover cascade itself (`game-engine.ts:420-426`) kills by direct mutation, **bypassing `killPlayer`** — any future death-trigger hook placed in `killPlayer` would silently miss heartbreak deaths.
- **`resolveNight`'s save logic cannot take a third kill source.** The doctor-save semantics are encoded as two pairwise booleans (`doctorSavedFromMafia` / `doctorSavedFromHaunt`, `game-engine.ts:562-563`) hard-wired to exactly two sources; Vigilante forces a rewrite, not an extension. (It also contains tautological guard conditions — §3.2.)
- **Three projections per fact, maintained by hand.** Every game fact is serialized independently for (a) live broadcast, (b) `buildGameSync` rejoin (`server.ts:314-571` — 200 lines, 9 hand-written `nightAction` branches), and (c) spectator messages. They have already drifted: that is L1, L3, and H4. Hunter's pending-revenge state would add branches to each projection with nothing forcing a sync twin to exist — which is why its `game_sync` representation + rejoin test is a hard rule in §1.4, not a nice-to-have.
- **The client's role knowledge lives in triplicate-plus lists**: the prompt-message dispatch (`public/app.js:302-317`) re-encoded as ternary chains in the `game_sync` restore (`609`, `620-627` — where a rejoining unknown role falls into the *detective* branch by default), three hold-and-replay gate lists (`157-160`, `162`, `167`), four overlapping state-reset lists (`244-263`, `467-480`, `1411-1422`, `2576-2586`), six `isDead && !jokerHauntActive` spectator guards (`352-372`), and the slide-confirm icon/label tables (`1095-1101`).

**Correcting ROLE-RESEARCH's cost cliff (now moot, recorded for accuracy):** the audio toll was real but smaller than stated. The 8 accent dirs each hold exactly 7 mp3s, and the assets are **TTS-generated** (`scripts/generate-voices.ts`, `scripts/generate-accent-cues.ts`), not hand-recorded — so 16 new files were a script run, not a recording session. The *actual* cliff was that the cue name exists in **four hand-synced registries** (the `sound_cue` union `src/types.ts:150`, `narration.json` keys × 8 accents, the client's `NARRATION_CUES` array `app.js:2937-2942`, and the mp3 filenames) while the server producers bypass the type with `as any` (`server.ts:186, 208, 250`) and the client silently skips unknown/missing cues (`app.js:3003-3004`, `3088`). Hunter needs **zero audio** (no sub-phase), so this whole surface is unscheduled; the `as any` removal survives as type hygiene in the Phase-0 types pass (P8).

## 1.2 Why not a role registry

This was tested adversarially before the scope narrowed: one of the three commissioned designs ("Roledex") pushed a full declarative `RoleDefinition` registry as far as it honestly goes — and even with five roles planned it lost. Its own boundary analysis concedes that **mafia consensus voting** (`game-engine.ts:240-356`, `984-1019`, plus the multi-mafia client UI) and the **joker's execution-triggered haunt** (`resolveVote` branches + the parallel dead-player action at `server.ts:927-946`) stay bespoke modules outside the registry — i.e., 2 of the night actors don't fit the abstraction it exists to provide. For a ~7k-line codebase with one maintainer, grep-ability of a named `submitHunterRevenge` beats dispatch through a hook table, and the judges scored it that way (§1.5). **With Hunter as the only new role, the question answers itself: there is nothing left for a registry to generalize over.**

What survives from the registry idea, re-scoped: the derived client gate lists (P7-micro — the one table where duplication will actually bite Hunter) and the settings-schema validation as the M6 fix vehicle. The CI parity tests for role/cue/art keys become optional hygiene — with a fixed roster, key-drift pressure is gone.

## 1.3 The proposal: three core seams + four small hardening steps (re-scoped for Hunter)

P-numbers are stable from the original nine-component program; each entry carries its scope status. **Kept full: P1, P2, P5** (the Hunter prerequisites, all bug-class-justified independently). **Slimmed: P6, P7, P8, P9.** **Dropped: P3, P4.** Each entry: problem with evidence → change → effort (S/M/L) → risk → sequencing vs the 29 in-flight fixes.

### P1. One night-reset seam: `resetNightActions()` / `beginNight()` / `resetGameState()` — **M**

- **Problem:** the seven drifted reset lists above; root cause of H1/L2/L9 and the per-role "add your field to seven lists" tax.
- **Change:** one field table, three scoped entry points. `resetNightActions(game, {preserveHauntVoters?})` clears all night+vote actions (encoding the H1, L2, L9 fixes exactly once); `beginNight()` = phase/round/sub-phase + reset + `Narrator.nightFalls()`, used by `endDay` and both `resolveVote` auto-night paths; `resetGameState()` replaces the byte-duplicated `returnToLobby`/`restartGame` blocks. Two deliberate carve-outs are the entire subtlety: `transitionToDay` keeps its `lastDoctorTarget = doctorTarget` line *before* the reset, and the official-joker auto-night passes `preserveHauntVoters: true` (the voters captured at `game-engine.ts:728-731` must survive into the haunt night — the one *legitimate* divergence among the seven lists today). New rule: a Game field gets one line in one of two reset scopes; no other list exists. Hunter's `pendingRevenge` is the first beneficiary — it must clear on `force_dawn`/`end_game`/`restart_game` (exactly the H1 failure shape), and under this seam that is one table line instead of seven hand edits. Add the **reset-parity test** (every per-night field returns to its `createGame` value after each transition) plus a field-scope coverage test (every mutable `Game` key classified in exactly one scope).
- **Risk:** low once H1/L2/L9 are fixed first; the carve-outs are where a naive consolidation breaks official-joker mode (one of the three designs got this wrong — it's the trap).
- **Sequencing:** **after** H1 + L2 + L9 land (so the collapse is a true dedup); independent of everything else.

### P2. Death pipeline: `applyDeath()` with source-carrying `Death` records and a single `notifyDeathTriggers()` hook — **M**

- **Problem:** five kill blocks; three positional lover-classifiers (M5 + its two server siblings); the lover cascade bypassing `killPlayer`; `resolveNight`'s unscalable pairwise save booleans.
- **Change:** `Death { player, source, cause: "direct"|"lover_cascade", message, eventType }`; `applyDeath()` is the single funnel — it performs the cascade itself (so cascades can't bypass it), derives `eventType` from `(source, cause)` in one place (M5 dies structurally), pushes `eventHistory`, and calls `notifyDeathTriggers()` — a no-op today, the **single Hunter hook point** later. `resolveNight`'s two hand-coded source blocks become a generic `KillIntent[]` list folded against the doctor save with today's "one save blocks one source" semantics preserved (pinned by golden tests on exact narration order, including the official/house conditions at `game-engine.ts:565-580`, *before* the rewrite). `NightResult.killed`/`VoteResult.killed` become `Death[]`; the server's two `you_died` loops key on `d.cause` instead of array index. Graft: put `cause`/`source` **on the wire** additively in `GameEvent`, so the client's three label maps (`app.js:1669-1678`, `2629-2635`, `2192-2199`) collapse to one and the night/day re-derivation heuristic (`2640-2653`) dies.
- **Risk:** the riskiest engine step — exact message *order* is observable behavior (the client's gate lists depend on it). Golden tests first, non-negotiable.
- **Sequencing:** **after/atomically with** M5 (positional classification is the one behavior this step cannot preserve, because it is the bug).

### P3. Investigation verdict seam — **DROPPED** (Godfather/Miller only)

The verdict computation stays inline at `game-engine.ts:378`; no false-verdict role is coming, so there is nothing for the seam to host. The companion fix is unaffected: H3 (gate `game_sync.detectiveHistory` to `rejoined.role === "detective"`, `server.ts:560`) is a live leak and lands in Phase 0 regardless of roles.

### P4. `NIGHT_SUB_PHASES` spec table — **DROPPED** (Vigilante only)

Hunter adds no night sub-phase and no audio, so the doctor/detective choreography duplication becomes *accepted* duplication — it only grows if a sub-phase role ever returns. The duplication itself stays on record (R3, R4, R16 in §3.1): `advanceNightSubPhase`'s twin branches (`game-engine.ts:474-485` vs `487-498`), the submit-skeleton copies (`358-368` vs `370-382`), the server's parallel knowledge (`server.ts:124-166`, `210-256`, and `buildSpectatorLog`'s second copy of the sub-phase order at `279` vs engine `462`). Three pieces survive on their own merits, outside this component: delete the production-dead `checkNightReady` (§3.2 item 3, Phase-0 types pass); the missing `phase === "night"` guards at `server.ts:877/903` and the M7 `awaitingNarratorReady` gate land as plain Phase-0 bug fixes (no generic handler downstream of them anymore); and the M6 settings whitelist lands now as a standalone fix.

### P5. `concludeRound()` — single win-check/auto-transition epilogue with the Hunter gate point — **S**

- **Problem:** the win-check + game-over/auto-night tail is triplicated because `resolveVote`'s official-joker branch early-returns and re-implements it (`game-engine.ts:638-647`, `747-769`, `810-835`); all three `checkWinCondition` call sites assume deaths are final at call time — which is exactly what Hunter breaks.
- **Change:** one `concludeRound(game, messages, {autoNight, preserveHauntVoters?})` collapsing all three tails; its first line is the Hunter gate (`if (game.pendingRevenge) return;` — deferring both the win check and the transition in one place instead of five). Server callers already branch on resulting `game.phase`; no wire change. With the owner's **"revenge may be declined"** rule, `submitHunterRevenge(game, hunterId, targetId | null)` treats `null` as decline: clear the gate, run `concludeRound` with no new deaths — same path, one branch; the admin force-skip and the timeout call the identical decline path.
- **Risk:** low. **Sequencing:** after P1 (uses `beginNight`); before M8's rules decision gets baked into Hunter — `checkWinCondition` collapses to one call site here, which is also where the M8 fix (joker parity) should land once decided.

### P6. Projections — **SLIMMED to P6-lite** — **S** (was L)

- **Problem (unchanged):** the drift factory. `buildGameSync.gameOver` (`server.ts:530-539`) vs three live `game_over` payloads (`1061-1067`, `1166-1172`, `1434-1442`) = L1/L3, including a *message-content* divergence ("Citizens win!" at `532` vs the narrator line at `1064/1438`); the `PlayerInfo` target-list literal rebuilt inline **8×** in server.ts (`101-106`, `127-132`, `148-155`, `372-375`, `433-435`, `465-466`, `490-492`, `1326-1331`) plus an engine copy (`game-engine.ts:404-409`); and `buildGameSync`'s 200-line `nightAction` reconstruction (`318-514`) — H4's blind spot. **What changed:** the full per-fact projection layer earned its L from the 2–4 sync branches *every* future role would add. With one role, that pressure is gone.
- **Change (the lite cut):** three small pure functions only. (1) `projectGameOver`, shared by all four emitters — kills the L1/L3 drift class for good. (2) `toTargetInfo` for the 8× `PlayerInfo` literal. (3) An explicit `pendingRevenge` projection in `game_sync` **plus rejoin re-send of the revenge prompt** — the H4 lesson applied to the one pending state Hunter introduces (mirror the dead-joker haunt rejoin treatment from `01cadf7`/`server.ts:665-674`). The full `projectNightAction` rewrite is shelved; H4 itself gets its ad-hoc re-send fix in Phase 0. The inline-type naming pass (`KillSource` at `game-engine.ts:509`+`types.ts:154`, `MafiaVoteStatus` at `types.ts:134/153/196-199`, `DetectiveLogEntry` at `87/139/186`) moves to the Phase-0 types pass.
- **Risk:** minimal — small pure functions; frame-diff `projectGameOver` before/after.
- **Sequencing:** after the H2/H3/L1/L3 fixes settle payload content; the `pendingRevenge` projection ships inside the Hunter PR.

### P7. Client tables — **SLIMMED to P7-micro** — **S** (was M)

- **Problem (unchanged):** §1.1's triplicate-plus client lists. **What changed:** with one role, a full table extraction from a 3,167-line untested IIFE no longer pays for its manual risk. Hunter's client work is instead hand-added on the dead-joker haunt model (the `37dd487` precedent: `allowDead` prompt, target-pick list, slide-to-confirm with a new icon).
- **Change (the micro cut):** exactly the two pieces Hunter would otherwise re-fight. (1) Generalize `jokerHauntActive` → `deadActionActive`, so the six spectator guards (`app.js:352-372`) and the dead-player guard in `showNightAction` (`1781`) key off one flag that *any* dead-player action sets — Hunter inherits the joker's spectator-isolation fix for free instead of OR-ing a second flag into six sites. (2) Derive the three hold-and-replay gate lists (`157-160`, `162`, `167`) from one shared constant, so the revenge prompt cannot be added to dispatch but forgotten in gating — that omission is the L5 trap and the single most likely Hunter bug. Everything else (`NIGHT_PROMPTS`/`SLIDE_META`/`SETTING_TOGGLES` tables, the four-list reset consolidation) is shelved; Hunter adds one hand line to each existing list, same as every role before it.
- **Risk:** small but it is still app.js with zero tests — own commits, staging smoke, `APP_VERSION_STAGING` bump per CLAUDE.md.
- **Sequencing:** immediately before or inside the Hunter PR; after M11's fix as before (the duplicated tap handlers `1843-1853`/`2030-2041` stay duplicated — fix the race in both, dedupe is optional).

### P8. Sound-cue typing — **SLIMMED to the types half** — **S**

- **Problem (unchanged):** §1.1's four-registry cue sync with `as any` producers and silent client skips. **What changed:** Hunter needs zero audio, so the manifest-derived client cue list, the `speechSynthesis` fallback chain, and the cue-coverage CI test are all shelved — with no new cues planned, the silent-skip failure mode has no new trigger.
- **Change (what survives, riding the Phase-0 types pass):** `SoundCue` becomes a template-literal type over `NightSubPhase` and the three `as any` casts (`server.ts:186/208/250`) are replaced with a typed `subPhaseCue()` helper, so the compiler (D5) covers the existing cue surface. Pure types, zero runtime change.
- **Risk:** none. **Sequencing:** Phase 0, inside the types pass.

### P9. Test-suite consolidation and determinism — **M**

- **Problem:** the suite that must act as the refactor's safety net is itself duplicated and porous: the entire WS harness is copy-pasted between `e2e.test.ts:10-77` and `rejoin.test.ts:15-100` (and `setupGame`/`lockTarget` ×3/×2 across the engine suites — R30); the `while (nightSubPhase !== "resolving") advance` loops (`doctor-joker-modes.test.ts:101` etc.) silently absorb a skipped or reordered sub-phase; coverage is probabilistic because role deals are random (D6's early-return bailouts); engine tests reach into `Game` internals (`game.phase = "day"`, manual `jokerHauntVoters` injection) for lack of scenario builders, pinning states the real machine may never produce.
- **Change:** extract `tests/harness.ts` (one WS harness, one engine scenario-builder that reaches states through the public API); replace the silent advance loops with explicit expected-order assertions (cheap insurance even with a fixed roster); wire D6's seeded-RNG/fixed-deal seams through the builders — Hunter's edge matrix (haunt-killed hunter, hunter-as-lover in both directions, revenge-into-parity) **requires deterministic deals to be testable at all**, which today's random `assignRoles` makes impossible without internal-state surgery.
- **Risk:** low — test-only changes; the golden sequence tests (Part 4, step 0) guard against the harness rewrite itself changing what is asserted.
- **Sequencing:** follows the bug fixes (it consumes their pinned behaviors); the fixed-deal seam is the one piece worth pulling forward into the Hunter PR's test work.

## 1.4 The scheduled role: Hunter — today vs. after, and the build spec

(The Godfather and Vigilante walkthroughs that motivated the original nine-step program are retired with the scope decision; their cost contrasts are summarized in §1.1's archetype table and drove the §1.3 cuts. ROLE-RESEARCH.md retains the full role designs.)

### Hunter: today vs. after

| | Today | After P2+P5 (+P6-lite/P7-micro) |
|---|---|---|
| Total | **~400–500 LOC**, hardest ~100 = ad-hoc restructuring | **~100–150 LOC + content** |
| The trigger | hook in `killPlayer` **misses heartbreak deaths** (cascade bypasses it, `game-engine.ts:420-426`) → cascade rewrite required | ~6 lines in `notifyDeathTriggers` — fires for every death incl. cascades, covering night kill / execution / haunt / heartbreak in one place |
| The interrupt | gates hand-inserted before all 3 win checks (`639`, `751`, `815`) AND both auto-night copies inside `resolveVote` (`758-768`, `821-831`) — `resolveVote` surgery unavoidable; `transitionToDay` must stop short of `phase="day"` | `concludeRound` already checks `pendingRevenge` and defers win check + transition at all former call sites; `submitHunterRevenge` = validate → `applyDeath(target,"hunter_revenge")` → clear → `concludeRound(resumeOpts)` (~20) |
| Client | suspense-gate list + both transition lists + a second dead-exemption + a flag OR'd into all six spectator guards + dead-overlay suppression + `game_sync` branch | hand-added prompt case on the joker-haunt model, but setting the shared `deadActionActive` flag and adding one entry to the derived gate-list constant (both P7-micro) instead of touching six guards and three lists; + dead-overlay suppression (~6, genuinely new) |
| Caveat | — | the L5 overlay-race class is only partially mitigated (prompt is gated, but the 5–9s overlay chains aren't restructured); ship the admin force-skip with Hunter regardless |

### Hunter design decisions (owner-approved) and where each edge case lands

- **Revenge is optional ("may decline") — the 9-player default.** Implement as *always-optional* with an explicit decline affordance: `submitHunterRevenge(game, hunterId, targetId | null)`, `null` = decline. Do **not** add a `hunterMode` official/house toggle — a second mode doesn't exist yet, and the mode-hint pattern is a three-copy duplication (R25) that shouldn't be extended speculatively. If a "must shoot" variant is ever wanted, it's one validation line later.
- **Admin force-skip + timeout ship with the role.** Both resolve through the same decline path in `concludeRound`. The timeout is a new timer, and `nightTimers` is a **single overwriting slot per game** (`server.ts:88-96`; `set` silently overwrites at `198/238/240/258`) — give the revenge timer its own slot or route it through D1's transition-helper clear, or it will collide with night timers (the M2 lesson).
- **Win-check ordering (edge 1):** P5's `pendingRevenge` gate defers both the win check and the transition at every former call site (`game-engine.ts:639/751/815` plus the auto-night copies at `758-768/821-831`). `submitHunterRevenge` → `applyDeath` → clear gate → `concludeRound(resumeOpts)`: a Hunter sniping the last mafia wins for town, tilting into a townie can hand parity — both fall out of the single epilogue with no special cases. **M8 is now a hard Hunter prerequisite** when the Joker is in the roster: revenge-into-parity evaluates `checkWinCondition`'s joker term (`885-895`), so the README-vs-engine rules decision must land before this code is written.
- **Haunt-killed Hunter: revenge fires — yes (edge 2).** Free under P2: `notifyDeathTriggers` fires per-death regardless of source, including the haunt kill block (`game-engine.ts:584-597`). Without P2 the haunt block is a second hand-patched kill site — one of the five.
- **Hunter who is a Lover (edge 3):** today the lover cascade bypasses `killPlayer` (`420-426`), so a heartbreak-dead Hunter would *never fire the trigger* — the single strongest reason P2 precedes Hunter. Under P2 cascades route through `applyDeath`: lover dies → Hunter dies of heartbreak → trigger fires; and a revenge target who is a lover cascades correctly in the other direction. Note the nasty sub-case: heartbreak can fire the gate during a **vote** resolution in which the Hunter wasn't even the executed player.
- **Interrupting `resolveVote`'s auto-transition (edge 4):** P5's whole purpose. The "same gate pattern as `awaitingNarratorReady`" framing is right — and that gate's own bug history is the checklist for the new one: clear `pendingRevenge` in every forced transition (the **L2** lesson — one line in P1's reset table); reject unrelated actions while the gate is open (the **M7** lesson); represent the gate in `game_sync` and re-send the revenge prompt on rejoin (the **H4** lesson — P6-lite, mirroring the dead-joker haunt rejoin treatment from `01cadf7`); and store it as **plain data** — `pendingRevenge: { hunterId, resume: { autoNight, preserveHauntVoters } }` on `Game`, never a server-held closure (closure-held gate state is un-rejoinable and M2-shaped; the design panel rejected exactly that construction in the registry design).
- **Dawn flow becomes two-stage:** when a night death sets the gate, the server announces the deaths and prompts the Hunter, and only after resolve/decline/skip finishes the `phase_change` + win check — a restructuring of `resolveNightAndTransition`'s tail (`server.ts:1351-1443`). Client-side, the revenge prompt's message type must be in the derived gate lists (P7-micro) or the suspense overlay will swallow it (the L5 trap); the force-skip is the safety net since the overlay chains themselves aren't being restructured.
- **Roster fit at 9 — both owner rosters work:** `assignRoles` deals specials in fixed order (`game-engine.ts:149-214`); Hunter is one more block. With Joker on: 2 Mafia · Doctor · Detective · Joker · Hunter · 3 Citizens; without: 2 Mafia · Doctor · Detective · Hunter · 4 Citizens. Content checklist: narrator revenge table (`narrator.ts` pattern), 10×10 grid + `ROLE_DESCRIPTIONS`/`ROLE_COLORS` keys in `pixel-art.js`, README roster row (CLAUDE.md mandate), slide-to-confirm reuses the joker-haunt pick UI (`CLOWN_ART` precedent) with a new icon. Zero audio.

## 1.5 Alternatives considered (design panel)

Two judges (a maintainer persona focused on total cost of ownership; a social-deduction-engine architect persona) independently scored three complete designs after spot-checking ~70 citations each against source. Scores are out of 60: six criteria × 10 points each (per-role cost after refactor, refactor risk/size, debuggability, testability, vanilla-JS client fit, coexistence with the 29 in-flight fixes):

| Design | Judge 1 | Judge 2 | One-line verdict |
|---|---|---|---|
| **Six Seams** (minimal targeted seams — adopted, = §1.3) | **47** | **49** | Only design that caught both behavior-preservation landmines (the `preserveHauntVoters` carve-out; the `lastDoctorTarget` carry); zero wire changes ever; sequencing maps 1:1 onto the bug-fix order; value front-loads |
| **Roledex** (declarative role registry + projection spine) | 45 | 43 | Best end-state per-role cost (Godfather ~22 LOC) and the best CI-parity ideas (grafted), but 15–19 days, a both-ends wire migration against stale-SW clients as its riskiest step, over-claims ("Vigilante with zero app.js edits" while no hold-fire UI exists), and the registry abstraction generalizes over exactly 2 current roles |
| **Night Ledger** (intent ledger + death pipeline + transition gate) | 42 | 43 | Best debuggability deliverable (transition log + legality asserts — grafted) and best test oracle (golden per-client message sequences — grafted), but 16–22 days, freeze windows colliding with the 29 in-flight fixes, and its reset sketch would have **broken official-joker haunt** (missed the carve-out) |

Grafts adopted into the program (already folded into §1.3 and Part 2): golden per-client WS message-**sequence** characterization tests as the first Phase-0 item; `clearNightTimer` registered on a single transition helper (the winning design had left timer teardown as per-handler discipline — the M2 class needed a structural home); structured transition logging + legality asserts (~30 LOC); additive `cause`/`source` on `GameEvent`; the settings schema as the M6 fix vehicle; and the rule that **every pending/gate state must have an explicit `game_sync` representation plus a rejoin test before the feature ships** (the H4 lesson, applied to `pendingRevenge` in §1.4). One graft was shelved with the scope cut: the client-data parity CI tests, whose value was catching key drift across roles that are no longer coming.

The scope decision retroactively strengthens the panel's verdict: the registry lost on cost-benefit with five roles planned; with one role, there is nothing to register.

---

# Part 2 — Debuggability

The 29-bug audit is itself the evidence: most of the high/medium bugs are *invisible-state* bugs (stale `jokerHauntVoters`, unconfirmable consensus, phantom phase broadcasts, orphaned timers) that no log line, assertion, or type check could have surfaced — because there are none. Findings in priority order; each is independent.

### D1. There is no state machine — there are 16 `game.phase` writes and 12 hand-assembled broadcasts — **fix: one `transition()` helper; M**

`game.phase` is written at 16 sites across 10 engine functions, each followed by its own ad-hoc reset list; nothing validates edges (`forceEndGame` happily runs from lobby; `restartGame` from mid-night — M2's enabler). On the server, `phase_change` messages are hand-assembled at 12 sites (`server.ts:741, 814, 971, 988, 1053, 1072, 1084, 1122, 1141, 1160, 1241, 1425`), each independently deciding whether to include `events`, fire the `day` sound cue, call `recordNarrator`, and reset day state — **and they already disagree** (`abstain_vote` and the night transitions at `814`/`1141` omit events; only `force_dawn`/`resolveNightAndTransition` emit the day cue, at `1121`/`1422`). Nothing checks the broadcast phase matches `game.phase` — which is precisely how M1/M3 ship a `phase_change` the engine never made.
**Proposal:** route every transition through `P1`/`P5`'s entry points (`beginNight`/`concludeRound`/`resetGameState`) plus a server-side helper that (a) emits one structured log line `{code, from, to, reason, round}`, (b) asserts the edge is legal in dev, (c) calls `clearNightTimer` — giving the M2 class a structural home — and (d) is the single place a `phase_change` broadcast is built.
**Risk:** low if asserts log rather than throw in production (a thrown assert would change failure modes for the M1/M3/M10-class admin messages). **Sequencing:** the helper rides P1/P5 (Phase 1); the logging half can land in Phase 0 with D2.

### D2. Zero observability — **fix: structured logging at three choke points; S, do immediately**

The entire 1564-line server contains exactly **one** console statement — the startup banner (`server.ts:1564`). No logging of message receipt, timer arm/fire/clear, transitions, or errors; the message-parse `catch` swallows the exception detail (`1517-1519`). The night timer map is a single anonymous slot per game (`88-96`) — `nightTimers.set` silently **overwrites** any pending un-cleared timer (`198, 238, 240, 258`) with no record of kind or duration, so M2-class stale-timer bugs are invisible at runtime. When a live game wedges (M9 stuck vote, H4 soft-lock, M6 zero-mafia night) there is no record of how it got there — and `Game` contains `Map`s, so it doesn't even `JSON.stringify` cleanly for ad-hoc inspection.
**Proposal:** one log line per (a) inbound message `{code, userId, type, phase, subPhase}` at the `handleMessage` entry, (b) timer event `{code, kind, delay, armed|fired|cleared|overwritten}`, (c) transition (D1). Add a `dumpGame(game)` serializer (Maps → arrays) for support. This is hours of work and would have made roughly half the audit's repros one-glance diagnoses.
**Risk:** negligible (additive; keep log lines out of message payloads). **Sequencing:** Phase 0, immediately — it makes every subsequent fix and refactor step easier to verify.

### D3. Pending states exist only as transient messages — **fix: represent gates in `Game`; folded into P5/P6**

"Consensus reached but kill unconfirmed" exists only as the `mafia_confirm_ready` message (`server.ts:1341-1348`) — root cause of H4; "night sequence already started" isn't represented anywhere — enabler of M7's duplicate `startNightSequence`. Debugging these means reconstructing message timelines instead of inspecting state. **Proposal:** every gate becomes a `Game` field with a `game_sync` projection and a rejoin test (the grafted rule), applied to Hunter's `pendingRevenge` (§1.4); H4's `pendingConfirm` gets its ad-hoc re-send fix in Phase 0, with the full state representation optional now. **Risk/Sequencing:** carried by P5/P6-lite (S on top of them).

### D4. No invariant assertions — **fix: a dev-mode `assertInvariants(game)`; S**

Every known bug class violates a stateable invariant nothing checks: night fields empty outside night (H1), `jokerHauntVoters` empty unless haunt night (H1), `votes`/`voteTarget` empty at `game_over` (L9 — found only by a fuzzer), `awaitingNarratorReady` false outside night (L2), `winner` non-null at `game_over` (L3), no timer in `nightTimers` when entering day/lobby (M2). **Proposal:** one assertion function called at the two choke points (message entry, timer fire) in dev/test; log-don't-throw in production, since a thrown assert would change failure modes for the M1/M3/M10-class admin messages.
**Risk:** an over-strict invariant produces log noise, not breakage (log-don't-throw). **Sequencing:** Phase 1, right after P1 — the reset seam is what makes the invariants true, and the assertions are what keep them true.

### D5. **No typecheck gate exists at all** — **fix: add `tsc --noEmit` to scripts + CI; S, do immediately**

Verified by actually running it: with dependencies installed, `tsc --noEmit` works against the repo's tsconfig as-is and reports **12 real existing errors** — the first being TS2353 on `server.ts:1346`'s undeclared `targetId` field. But **nothing ever runs tsc**: `package.json` has no typecheck script, `.github/workflows/` contains only the two Fly deploy files, and Bun strips types without checking. Meanwhile the three `as any` cue casts (`server.ts:186/208/250`) defeat the `sound_cue` union at the only dynamic production sites, and `WSClient.ws`/`update_player_pref.value` are `any`. **Proposal:** add `"typecheck": "tsc --noEmit"`, run it in CI next to `bun test`, burn down the 12 surfaced errors (P8's typed cues remove the casts); optionally modernize `types: ["bun-types"]` to `["bun"]`. Until this lands, every union in `types.ts` is documentation, not enforcement.
**Risk:** none beyond the one-time burn-down. **Sequencing:** Phase 0, immediately — it is the cheapest guard the 29 fix PRs can have.

### D6. No RNG/clock seam → probabilistic tests and wall-clock sleeps — **fix: injectable `random`/`now`; M**

`assignRoles`, lover pairing, `generateCode`, narrator `pick()`, and the fake-phase gaussian all use bare `Math.random`; day timing and timers use bare `Date.now`/`setTimeout`. Consequences, verified in the suite: rejoin tests **bail silently when the dealt roles don't fit** (`if (!doctor) { …return; }` early-exits at `rejoin.test.ts:222, 253, 290, 438, 526, 744`; `game-engine.test.ts:226-238` wraps assertions in `if (lovers.length >= 1)`) — several behaviors have only probabilistic coverage per run; `e2e.test.ts` alone has ~42 wall-clock `Bun.sleep`s riding out the real 1000/1500ms delays; the 5–15s fake-phase path is effectively untestable over WS; narrator tests can only assert substring containment, which is how M13 stayed invisible. **Proposal:** module-level injectable `rng`/`clock` (default = real), a `dealRoles(game, fixedAssignment)` test seam, and timer scheduling behind a shim that tests can flush synchronously.
**Risk:** low — defaults preserve production behavior; the timer shim is the only piece touching live code paths. **Sequencing:** Phase 3, with P9 (the seams are what P9's scenario builders consume); the `dealRoles` seam is worth pulling earlier if a fix PR needs a deterministic repro.

### D7. Tests write to the developer's real database — **fix: `DATABASE_PATH=:memory:` or tmpdir in tests; S, do immediately**

`db.ts:4` falls back to repo-root `mafia.db`; nothing under `tests/` sets `DATABASE_PATH` (only `fly.toml` references it). `db.test.ts` and both spawned E2E servers write permanent rows into the working DB — the `Date.now()` username suffixes (`db.test.ts:10`, `e2e.test.ts:81`, `rejoin.test.ts:78-79`) exist purely to dodge UNIQUE collisions with residue from previous runs.
**Risk:** none. **Sequencing:** Phase 0, immediately.

### D8. `server.ts` is untestable in-process — **fix: export the handlers, move side effects behind `import.meta.main`; M**

Zero exports; `Bun.serve` and the 2-hour reaper `setInterval` execute at import time (`1466`, `1543`). `handleMessage`, `buildGameSync`, `handleSubPhaseAdvance`, and `resolveNightAndTransition` can only be exercised by spawning a subprocess and driving live WebSockets — which is why the WS suites sleep on wall clocks (D6) and why unit-testing a single `buildGameSync` branch is impossible today.
**Risk:** low — exporting the handlers and gating `Bun.serve`/the reaper behind `import.meta.main` is mechanical; the only trap is module-level state (the `clients` map) leaking between in-process tests, solved by a `resetServerState()` test export. **Sequencing:** Phase 3, with P9 (its harness consolidation assumes this); Hunter's two-stage dawn flow (§1.4) is much easier to test if this lands first.

### D9. Client: four replay queues, five uncancelable overlay chains, silent failures everywhere — **fix: P7-micro + cancellation handles + a `default:` log; M**

Four parallel hold-and-replay mechanisms (suspense, night/execution transition, night narration, `flushSoundQueue`'s copy — `app.js:157-170`, `1540-1543`, `1620-1624`, `2954-2963`, `3099-3107`), each with its own hardcoded message list and replay site; `game_over`/`phase_change` are gated by **none** of them — that is L5. Five overlay chains schedule absolute `setTimeout`s against the shared `#suspense-overlay` with no cancellation handles, so a later chain cannot cancel an earlier one (the L5 stomp). Failures are silent end-to-end: `handleServerMessage` has no `default:` case, `wsSend` drops frames during the 2s reconnect window without trace (`108-112` — a night action tapped mid-reconnect just vanishes), unknown cues are skipped, and bare `catch {}` litters the audio path. ~45 free-floating mutable globals are reset by four diverging hand lists. **Proposal:** P7-micro's derived gate lists + `deadActionActive` (the table and reset consolidations are shelved with the scope cut); store a cancellation handle per overlay chain (cancel-prior-on-start kills the L5 class — and L5 matters *more* with Hunter, whose revenge prompt is exactly the message the chains will stomp); log unknown message types and dropped sends.
**Risk:** no client tests; manual smoke required — the cancellation-handle change is the one piece that alters timing behavior and should be its own commit. **Sequencing:** P7-micro with the Hunter PR; the `default:`-case logging and dropped-send logging are S items that can land in Phase 0.

### D10. The trust boundary sits in the client — **fix: server-side audience gating as a rule; folded into P6**

Secrets arrive on the wire and are filtered at display time: `detectiveHistory` reaches every rejoiner (H3) and is gated by `myRole === "detective"` at render (`app.js:1682, 1729`); spectator messages are filtered by `isDead && !jokerHauntActive` client-side (`352-372`) rather than by server-side audience targeting. **Rule going forward:** the server decides per-recipient content; the client never receives what its player shouldn't know. Hunter introduces no new secret (revenge is public), so for this scope the rule costs nothing — but the H2/H3 instances are live leaks and remain Phase-0 fixes. **Risk/Sequencing:** Phase 0 (the fixes); the rule is a convention, not a step.

---

# Part 3 — Redundancy and dead code from organic growth

## 3.1 Duplicated logic (all claims adversarially verified against source)

Engine (`src/game-engine.ts`):

| # | Duplication | Sites | Overlaps bug | Dissolved by |
|---|---|---|---|---|
| R1 | Seven night/vote reset lists, three-way drifted | `626-636`, `759-766`, `822-830`, `852-861`, `871-878`, `914-938`, `953-978` | **H1, L2, L9** | P1 |
| R2 | `returnToLobby` vs `restartGame` ~35-line byte-duplicate | `902-941` vs `943-982` | — | P1 |
| R3 | doctor/detective branches of `advanceNightSubPhase` identical modulo 2 strings; same pattern in `checkNightReady` | `474-485` vs `487-498`; `438-441` vs `444-447` | — | accepted (P4 dropped — no new sub-phase planned) |
| R4 | `submit*` validation skeleton ×3 | `358-368`, `370-382`, `384-398` | — | accepted (P4 dropped) |
| R5 | Kill/lover block ×5 | `539-550`, `584-597`, `733-744`, `775-786`, `791-804` | — | P2 |
| R6 | Win-check epilogue ×3 (official-joker branch re-implements the function tail) | `638-647`, `747-769`, `810-835` | — | P5 |
| R7 | Doctor-save narration (official/house) duplicated between mafia-save and haunt-save | `528-537` vs `565-580` | — | P2 |
| R8 | Positional lover-death classifier ×3 across both layers | `617-624`; `server.ts:1037-1042`, `1407-1412` | **M5** (owns the engine site *and* the server night-path site at 1407-1412; only the vote-path site at 1037-1042 is additional) | P2 |

Server (`src/server.ts`):

| # | Duplication | Sites | Overlaps bug | Dissolved by |
|---|---|---|---|---|
| R9 | `PlayerInfo` literal `{id, username, isAlive:true, isAdmin}` ×8 (+1 engine copy) | `101-106`, `127-132`, `148-155`, `372-375`, `433-435`, `465-466`, `490-492`, `1326-1331`; `game-engine.ts:404-409` | — | P6-lite (`toTargetInfo`) |
| R10 | `game_started` distribution block verbatim ×2 (`mafiaNames`/`mafiaNames2`) | `797-823` vs `1224-1250` | — | optional S helper (full P6 shelved) |
| R11 | Live payloads vs `buildGameSync` reconstructions, already drifted | `530-539` vs `1061-1067`/`1434-1442`; `314-571` overall | **L1, L3, H4** | P6-lite (`projectGameOver`) + the L1/L3/H4 fixes; full projection layer shelved |
| R12 | Detective-result delivery ×2 | `1109-1119` vs `1372-1382` | — | optional S helper |
| R13 | Admin-handler preamble ×~12; guard inventory inconsistent (some handlers double-guarded, some engine-only, some neither) | `948-951`, `965-968`, `1097-1100`, `1132-1135`, `1151-1154`, `1210-1215`, … | **M1, M3, M4, M7, M10, L2, L7** (the inconsistency *is* the bug family) | a small `requireAdmin(game, phase?)` helper (S; land with the Phase-0 guard pass — P4's generic handler is dropped) |
| R14 | Room-teardown clients sweep ×5 | `710-714`, `725-729`, `756-760`, `1202-1206`, `1555-1559` | (the two `leave_game` copies at 710-714/725-729 skip `clearNightTimer`; the reaper and `close_room` call it — M2-adjacent) | small helper |
| R15 | Haunt-active predicate ×5 + dead-joker scan ×2 | `63-67`, `269-273`, `321-323`, `361`, `665-669`; `170` | (stale-derivation enabler of H1's spectator side-effect) | use `getHauntingJokerId` everywhere |
| R16 | Sub-phase order array duplicated across layers | `game-engine.ts:462` vs `server.ts:279` (`buildSpectatorLog`) | — | accepted (P4 dropped) |
| R17 | Night-aftermath broadcast sequence (you_died/player_died loops + phase_change + game_over) exists twice — vote path vs night path | `1013-1093` vs `1351-1443` | — | partially P2/P6; full unification optional |

Client (`public/app.js`) and shared:

| # | Duplication | Sites | Overlaps bug | Dissolved by |
|---|---|---|---|---|
| R18 | Prompt config triplicated: dispatch cases vs `game_sync` ternary chains (unknown roles default to *detective*) | `302-317` vs `609` vs `620-627` | (H4-adjacent restore path) | accepted (full P7 shelved); Hunter adds its case by hand |
| R19 | Gate lists ×3 maintained independently | `157-160`, `162`, `167` | **L5**-adjacent | **P7-micro** (derived from one constant — Hunter prerequisite) |
| R20 | Client state-reset lists ×4, overlapping-not-identical | `244-263`, `467-480`, `1411-1422`, `2576-2586` | — | accepted (shelved); Hunter adds one line per list |
| R21 | `handleGameSync` mirrors `applyPhaseChange` block-for-block (hide-panels 7-liner, indicator, narrator line, day-timer) | `509-549` vs `1364-1429` | — | accepted (shelved) |
| R22 | Mafia tap handler (maybe→50ms→lock) ×2 | `1843-1853` vs `2030-2041` | **M11** | fix M11 in both copies; dedupe optional |
| R23 | Event-history renderers ×3 with 3 label maps + a night/day re-derivation heuristic | `1662-1714`, `2622-2682`, `2192-2199`; heuristic `2640-2653` | (heuristic is the M5 family, client edition) | P2's wire `cause`/`source` |
| R24 | Mafia activity-feed builder ×2 (live vs spectator), winner→title/color map ×2, player-list render loops ×5, overlay-beat boilerplate ×10, `flushSoundQueue` tail = `finishNarrationQueue` verbatim | `2117-2133`/`2164-2180`; `2601-2615`/`2705-2712`; `808-818`/`871-919`/`1735-1750`/`2335-2349`/`2740-2779`; ×10 sites; `3099-3107`/`2954-2963` | — | opportunistic helpers (unscheduled) |
| R25 | Official/house mode hint strings ×3 (JS args, re-sync strings, index.html defaults); 16-line logo SVG pasted ×2 in index.html | `791-799`, `850-865`, `index.html:181,198`; `index.html:23-64`/`88-129` | — | trivial helpers (unscheduled); do **not** extend the hint pattern with a `hunterMode` (§1.4) |
| R26 | Type twins: `KillSource` inline ×2, `MafiaVoteStatus` shape ×3, `DetectiveLogEntry` ×3, `MafiaVoteType` re-inlined in `mafia_vote` | `game-engine.ts:509`/`types.ts:154`; `types.ts:134/153/196-199`; `87/139/186`; `44` vs `103` | — | Phase-0 types pass |
| R27 | Narrator: `JOKER_HAUNT_KILL_MESSAGES`+`jokerHauntKill()` are structural clones of the night-kill pair | `narrator.ts:46-55`/`64-73`; `172-180`/`212-220` | — | optional table-driven `killMessage(source)` |
| R28 | Cue registry ×4 (union / narration.json ×8 / `NARRATION_CUES` / mp3 filenames) with `as any` producers | `types.ts:150`; `app.js:2937-2942`; `server.ts:186,208,250` | — | P8-types (the `as any` removal); manifest half shelved |
| R29 | Role keys hand-synced ×5 (Role union / `PIXEL_ART` / `ROLE_DESCRIPTIONS` / `ROLE_COLORS` / README roster) — nothing checks agreement; unknown role renders a blank card | `types.ts:1`; `pixel-art.js:9-206`, `344-358`; `README.md:9-23` | — | hand-sync once for Hunter (5 keys); CI parity test optional |
| R30 | Test-helper copy-paste: `setupGame` ×3, `lockTarget` ×2, the entire WS harness ×2 | `game-engine.test.ts:11-24`, `mafia-votes.test.ts:10-17`, `doctor-joker-modes.test.ts:14-26`; `e2e.test.ts:10-77` vs `rejoin.test.ts:15-100` | — | P9 (`tests/harness.ts`) |

Rows whose "Dissolved by" column names a standalone helper rather than a P-step (R13's `requireAdmin`, R14, R15, R17's optional full unification, R24's opportunistic helpers, R27): each is effort **S**, safe any time after the corresponding Phase-0 bug fixes, and none blocks anything else.

## 3.2 Dead code and cruft (each item: effort S; safe any time; none counted as new "bugs")

**Engine/types:**
1. `Game.pendingMessages` — written at 6 sites (`game-engine.ts:236, 649, 864, 881, 933, 973`), **read by zero lines** in the entire repo; messages actually flow via return values. Delete field + writes.
2. `Game.nightKill` / `Game.doctorSaved` — declared (`types.ts:74-75`), initialized, reset (`928-929`, `968-969`), never given real data, never read. Pre-`NightResult` vestige whose names actively mislead.
3. `checkNightReady` (`game-engine.ts:431-453`) is **production-dead**: imported by `server.ts:5`, never called there; only `tests/mafia-votes.test.ts:573,588` exercise it. Dangerous cruft — it *looks like* the gate a new role must extend, but the live night advances per-action via the handlers. Delete or move to a test helper.
4. Unused imports `GameEvent`, `MafiaVoteEntry` at `game-engine.ts:1`.
5. Tautological guards in the haunt-save branch: inside `doctorSavedFromHaunt` (which by definition requires `doctorTarget === hauntTargetId && mafiaTarget !== hauntTargetId`), the inner conditions at `571-579` (`572`, `576`) are always true — dead logic from an earlier resolution order.
6. `forceDawn` pushes a hardcoded English string (`game-engine.ts:863`) bypassing `Narrator` — ignores `narrationAccent`, invisible to narrator tooling (contrast `endDay` using `Narrator.nightFalls()`).
7. `advanceNightSubPhase`'s "shouldn't happen" fallback (`502-504`) is reachable only when already `"resolving"`; the for-loop's closing brace at line `500` is dedented to column 0 — a formatting anomaly that makes the function misread on first sight.
8. `GameEvent.detail` (`types.ts:242`) — never written, never read.
9. `Player.connected` is **write-only**: set on add/rejoin/leave/close (`game-engine.ts:97,119`; `server.ts:764,1530`), read by zero logic. Its non-use in `castVote` is the root cause of **M9** — whichever way M9 is decided, this field should either become load-bearing or go.

**Protocol/server:**
10. `player_list` ServerMessage is **never sent** (zero emission sites); the client carries a full unreachable handler for it (`app.js:123-137`) and `rejoin.test.ts:174,586` actively pins its absence. Delete variant + handler.
11. `toggle_sound` ClientMessage (`types.ts:116`) — explicit no-op handler (`server.ts:1263-1266`), and the client never sends it (sound is client-local, `app.js:18`).
12. `abstain_vote` has **no client sender** (the only "abstain" string in app.js is display text at `1443`) — reachable only by hand-rolled clients. Its missing phase guard is M3; the cruft point is that it could be deleted (or guarded) with zero UI impact.
13. `broadcastToGame`'s `excludeUserId` parameter — all 30+ call sites pass two args (`server.ts:38-44`).
14. `mafia_confirm_ready` is sent with a `targetId` the type doesn't declare and the client never reads (`server.ts:1346`; `types.ts:135`; handler uses only `targetName`, `app.js:2293-2313`). Either declare-and-use (it would fix M11's lock-the-wrong-target half more cleanly) or stop sending it.
15. `GameSettings.soundEnabled` (`types.ts:22,34`) — never read by server or client (client tracks its own local flag); serialized, persisted, and broadcast in every `lobby_update` for nothing.
16. `Narrator.dayBreaks()` + `DAY_BREAKS_MESSAGES` (`narrator.ts:153-157`, `230-232`) — never called from `src/`; kept green by its own unit test (`narrator.test.ts:52-54`). Self-tested dead code.
17. Two divergent unions for the same concept: `spectator_night_phase.subPhase` omits `"mafia"` (`types.ts:155`) while `game_sync.spectatorSubPhase` uses full `NightSubPhase` (`types.ts:202`).

**Client/assets/docs:**
18. The entire `#joker-win-overlay` DOM subtree (`index.html:382-388`) and its CSS block (`app.css:851-880`) are referenced by no JS — `showJokerWinOverlay` repurposes `#dead-overlay` instead, and **ignores its `jokerName` parameter** (`app.js:2459-2465`; caller passes it at `321` for nothing).
19. `deadDismissTimer` (`app.js:40`) — declared, never used. Leftover from a removed auto-dismiss.
20. `connectPatched` (`app.js:85`) — the only connect function carries a leftover "-Patched" hotfix suffix; misleads readers into hunting for an unpatched original.
21. `let myVariant = 0` declared at `app.js:949`, 900 lines from its sibling state block, and assigned at `242`/`448` before its declaration in source order — works only because handlers run post-load; a TDZ landmine under refactoring.
22. README advertises two features that don't exist: "Anonymous voting toggle" (`README.md:39` — no such setting anywhere; likely residue of the `c59b5cf` tally-removal work whose data-layer half is M12) and "Save/load game setting presets" (`README.md:42` — the removed feature whose dead table is **L10**; this is an additional stale doc site, not a new finding).
23. `saved_configs` table — already **L10**; listed only to note the live persistence surface is just `users` + `last_settings_json`.

## 3.3 Double-count ledger

Items above explicitly **not** counted as new findings because AUDIT-REPORT.md owns them: H1/L2/L9 (the reset-drift *instances*; Part 1 addresses the *generator*), H2/H3 (leak instances, fixed in Phase 0; D10 records the audience-gating *rule*), M5 (engine classifier site **and** the server night-path site at 1407-1412; only the vote-path twin is additional), M11 (tap-handler race), L1/L3/H4 (projection-drift instances), M1/M3/M4/M7/M10/L7 (guard instances; R13 addresses the *pattern*), M2 (timer instances; D1/D2 address the *visibility* — and §1.4's revenge-timer slot inherits the lesson), M6 (settings validation), M8 (rules decision; P5 collapses `checkWinCondition` to the single call site where the fix lands — now a Hunter prerequisite), M9 (quorum decision; item 9 notes the dead field), L5 (overlay race; D9 addresses the *mechanism* — elevated in priority because Hunter's revenge prompt is its likeliest victim), L10 (dead table), M14/L11 (service-worker caching). Two workflow claims were rejected by adversarial verification and are *excluded* above: a mis-mechanized version of the type-drift claim (corrected into D5, then re-corrected against a live `tsc` run) and a claimed sw.js gap that turned out to be L11's own fix restated.

---

# Part 4 — Recommended sequencing against the 29 in-flight fixes (Hunter-only program)

**Phase 0 — now, interleaved with the bug-fix program (mostly S):**
1. **Golden per-client WS message-sequence tests** for five canonical games (full night all roles; joker-execute→haunt-night; spared vote; force_dawn; restart). Message order is observable behavior (the client gate lists depend on it); these protect the 29 fix PRs *and* every refactor step. Do this before anything else.
2. **D5**: add `tsc --noEmit` to scripts + CI and burn down its 12 errors; **D7**: `DATABASE_PATH` in tests; **D2**: the three structured-log choke points (plus D9's S-sized `default:`-case and dropped-send logging).
3. **Types pass** (P8 + R26's naming): named `KillSource`/`MafiaVoteStatus`/`DetectiveLogEntry`, template-literal `SoundCue` + typed producer (kills the `as any`s), delete dead `checkNightReady` + the §3.2 quick deletes. Zero runtime change.
4. Bug fixes that **must precede their seam or the role**: H1+L2+L9 (before P1 — the reset collapse must be a true dedup); M5 (before/with P2 — positional classification is the one behavior the death pipeline cannot preserve); H2+H3 (live leaks; settle payload content before P6-lite touches `projectGameOver`); H4 ad-hoc re-send (live soft-lock); M6 settings whitelist, the M1/M3/M4/M7 guard pass, and the missing `phase === "night"` guards at `server.ts:877/903` (all plain fixes now — nothing downstream absorbs them); M11 (fix the race in both tap-handler copies); **M8 rules decision — now a hard Hunter prerequisite**: with the Joker in the roster, revenge-into-parity evaluates `checkWinCondition`'s joker term (`885-895`), and P5 collapses that formula to the single call site where the decided rule lands.

**Phase 1 — the engine seams Hunter rides (after the Phase-0 fixes merge):** P1 reset seam (M) → D4 invariant assertions (S, riding P1) → P2 death pipeline (M, golden-tested) → P5 `concludeRound` with the `pendingRevenge` gate and decline path (S). After this phase the H1 and M5 classes are structurally unregressable, D1's transition logging and D4's assertions exist, and **every Hunter prerequisite is in place**.

**Phase 2 — Hunter:** P6-lite + P7-micro (both S, in or immediately before the Hunter PR) → **the Hunter feature itself** (M: ~150–250 LOC + content per §1.4 — `pendingRevenge` plain-data gate, decline/force-skip/timeout, two-stage dawn flow, narrator table, art, README roster row, and tests for the edge matrix: haunt-killed hunter, hunter-as-lover in both directions, heartbreak-during-vote, revenge-into-parity under the decided M8 rule, decline path, rejoin mid-revenge).

**Phase 3 — whenever, independent of Hunter:** P9 test consolidation (M), carrying D6's RNG/clock seams and D8's server-testability exports with it (pull the fixed-deal seam forward into the Hunter PR's tests — the edge matrix needs deterministic deals); the §3.2 dead-code deletions and §3.1's optional S helpers.

**Decision items needing the owner:** M8 (joker parity: README vs engine) — **now gates Hunter directly**; M9 (disconnected-voter quorum) — unchanged, independent of Hunter.

**Total effort:** core = 2M + 1S (P1, P2, P5) + four small S items (P6-lite, P7-micro, P8-types inside the Phase-0 types pass, the Phase-0 logging) — comfortably under a week of part-time evenings before the Hunter PR, with the 197-test suite plus the new goldens as the net; every step independently shippable to `maf1a-staging.fly.dev` per the existing deploy flow. Hunter itself: ~150–250 LOC + content, versus ~400–500 LOC of high-risk ad-hoc restructuring without the seams. Dropped relative to the original five-role program: P3, P4, P8's audio machinery, and the full P6/P7 — roughly 2L + 1M of work that the Hunter-only scope no longer justifies. P9 (M) remains worthwhile but is not on Hunter's critical path.

---

*Method note: produced by a full manual read of all source plus a 16-agent orchestration (5 subsystem mappers → 3 independent architecture designs → 2 judges → 3 adversarial verifiers over 105 claims, 103 confirmed → a final 3-agent review of this document: citation accuracy, brief compliance, double-count audit; five corrections applied, including re-testing the typecheck claim with a live `tsc` run). Every file:line citation in this document was verified against `staging` @ `977d78c` either firsthand or by an adversarial verifier instructed to refute it.*
