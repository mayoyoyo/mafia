# Mafia Game — Full Codebase Bug Audit

**Date:** 2026-06-09 · **Branch:** `staging` @ `977d78c` · **Baseline:** all 197 existing tests pass

**Method:** 55-agent multi-stage audit — 8 parallel code auditors (state machine, night roles, joker/lovers, day-vote/win-conditions, server auth, sync/leaks, client state, rejoin lifecycle) + 8 game simulators that drove **real 10-player games over live WebSocket servers** (standard town win, mafia win, joker × 3 modes, lovers cascades, adversarial/malicious clients, disconnect chaos, vote-edge matrix, plus a ~300-game randomized engine fuzzer). 78 raw findings were deduplicated to 27, every finding was then **adversarially verified by an independent agent that executed a reproduction** (or refuted it), and a completeness critic ran a targeted second round on uncovered subsystems (narrator engine, settings persistence, service worker), adding 7 more verified findings.

**Result: 29 confirmed bugs** (4 high, 14 medium, 11 low — after merging 4 raw findings that share the invalid-`mafiaCount` root cause). 2 claims were investigated and **rejected as intended design** (documented at the end). Every reproduction below was actually executed during verification. **No code changes have been made.**

---

## HIGH SEVERITY

### H1. `forceDawn`/`endDay` never clear `jokerHauntVoters` — a dead Joker can haunt-kill on later nights

- **Files:** `src/game-engine.ts:849-866` (`forceDawn`), `868-883` (`endDay`); the only clear is in `transitionToDay` (line 633)
- The official-mode haunt is designed as a one-time revenge on the single night after the Joker's lynch (`transitionToDay` clears the voter list, comment: *"clear haunt voters after this night"*; pinned by `tests/doctor-joker-modes.test.ts:765-777`). But `forceDawn` resets every other night field **except** `jokerHauntVoters`, and `endDay` never clears it either. If the admin force-dawns the haunt night (which is exactly when an AFK dead Joker stalls the night), the voter list survives: every subsequent night `startNightSequence` (`src/server.ts:269-274`) re-prompts the dead Joker with `joker_haunt_targets`, `submitJokerHaunt` has no per-night gating so it succeeds, and the Joker lands a kill **rounds after the lynch** — which can flip win conditions. Side effect: `getHauntingJokerId` (`server.ts:63-67`) keeps treating the Joker as "haunting," excluding them from all dead-spectator broadcasts for the rest of the game.
- **Repro (engine-direct, executed):** 7 players, `{enableJoker:true, jokerMode:"official"}`, `startGame`. Day 1: `callVote` on the Joker, all alive `castVote(…, true)`, `resolveVote` → Joker dead, `jokerHauntVoters=[…]`, auto-night round 2. `forceDawn(game)` → voters **still populated** (should be `[]`). `endDay(game)` → night round 3; `submitJokerHaunt(game, jokerId, aliveVoterId)` returns `true` (should be `false`); advance to resolving, `transitionToDay` → victim killed with `source:"joker_haunt"` at round 3.
- **Verifier corrections:** at most **one** extra haunt kill can land (any naturally resolved night clears the list); `endDay` alone can't trigger it — a `force_dawn` during the haunt night is the necessary trigger.
- **Fix direction:** clear `game.jokerHauntVoters` in `forceDawn` (and defensively in `endDay`).

### H2. Official-mode doctor save leaks the saved player's identity to everyone via the public `eventHistory`

- **Files:** `src/game-engine.ts:614-616` (event push); broadcast at `src/server.ts:1425-1432` (`phase_change.events`) and `:561` (`game_sync.eventHistory`); rendered for all roles at `public/app.js:1671, 1708, 2631`
- In `doctorMode:"official"` (the default) the narrator line is deliberately anonymous and only the saved victim gets a private `doctor_save_private` message. But `transitionToDay` unconditionally pushes `{round, type:'save', playerName}` into `eventHistory`, which is broadcast to **every player** live and on rejoin, and the client renders "*\<name\> — Saved by Doctor*" for everyone. Since a save only fires when the doctor protected the mafia's exact target, this reveals **both** who the doctor protected **and** who the mafia targeted — defeating official mode's hidden information and often outing the doctor.
- **Repro (executed):** 5 players, `{mafiaCount:1, enableDoctor:true, doctorMode:"official"}`; mafia locks victim V; doctor saves V; `transitionToDay`. Narrator message is the generic no-name line, but `game.eventHistory === [{round:1, type:'save', playerName:'<V>'}]` — and over WS every client receives it in `phase_change.events`.
- **Fix direction:** omit or anonymize the `save` event in official mode (mirror the narrator's behavior).

### H3. `game_sync` leaks the detective's entire private investigation history to every rejoining player

- **File:** `src/server.ts:560` (`buildGameSync`); contrast the correctly-gated `mafiaTeam` at `:562-566`
- `buildGameSync` unconditionally includes `detectiveHistory: game.detectiveHistory` — entries `{round, targetName, isMafia}` — in the sync payload sent to **any** player who reconnects mid-game. The client only filters at display time (`app.js:1682, 1729` check `myRole==='detective'`), so the secret data crosses the wire to citizens/mafia/joker and is readable in devtools or by a modified client. A mafia player only needs to disconnect/reconnect to learn exactly who the detective investigated and who was flagged MAFIA.
- **Repro (executed):** 6 players with detective enabled; detective investigates the mafia night 1; any **citizen** closes its socket, logs back in, `join_game` → its `game_sync.detectiveHistory === [{round:1, targetName:<mafia>, isMafia:true}]` while `mafiaTeam` is correctly absent.
- **Fix direction:** include `detectiveHistory` only when `rejoined.role === "detective"`, exactly like the `mafiaTeam` gating.

### H4. Mafia who disconnects after consensus but before confirming gets "Action confirmed." on rejoin — night soft-locks

- **Files:** `src/server.ts:428-461` (`buildGameSync` nightAction), `657-674` (rejoin handler); client branch `public/app.js:605-617`
- Consensus (unanimous lock) only sets `game.mafiaTarget`; the night advances only when the server receives `confirm_mafia_kill`. The slide-to-kill confirm UI is driven exclusively by the real-time `mafia_confirm_ready` message, which the rejoin path never re-sends. `buildGameSync` reports `nightAction.locked = (mafiaTarget !== null)`, indistinguishable from an already-confirmed kill. So a sole mafia who locks, then refreshes the page (pull-to-refresh deliberately closes the WS, `app.js:1261`), rejoins to a screen saying "Action confirmed." with no confirm control — and the engine waits forever for a `confirm_mafia_kill` that can never be sent. Only admin `force_dawn` (which throws the kill away) recovers.
- **Repro (executed):** 4 players, default settings. Mafia: `mafia_vote{maybe}` then `{lock}` → receives `mafia_confirm_ready`; close the mafia's WS **without** confirming; login + `join_game` on a fresh socket → `game_sync.nightAction = {locked:true, targetName:T, targets:[]}`, no `mafia_confirm_ready` re-sent, night never advances.
- **Fix direction:** on rejoin during the mafia sub-phase with consensus-but-unconfirmed state, re-send `mafia_confirm_ready` (or distinguish "pending confirm" in `game_sync`).

---

## MEDIUM SEVERITY

### M1. `end_day` handler ignores the engine's no-op result — broadcasts `phase_change(night)` + full night sequence in any phase

- **File:** `src/server.ts:1132-1149` (engine guard exists at `game-engine.ts:868-871`; the sibling `force_dawn` handler guards correctly at `server.ts:1104`)
- `endDay()` correctly returns `[]` and mutates nothing outside the `day` phase, but the handler never checks the result: it unconditionally resets `dayStartedAt`/`dayVoteCount`, broadcasts `phase_change{night}` and runs `startNightSequence` (cues + `mafia_targets` prompts). Sent during **voting**: all clients flip to night UI while the engine's open vote silently lives on and can later resolve (clients on a night screen receive `vote_result`). Sent after **game_over**: every client is yanked off the results screen into a phantom night that can never resolve. Sent in **lobby**: night broadcast with no roles assigned.
- **Repro (executed):** 3 players → `start_game` → `narrator_ready` → `force_dawn` → `call_vote` (phase = voting) → admin sends `{type:"end_day"}` → all clients receive `phase_change{night}` + sound cues + mafia gets `mafia_targets`, yet casting 3 votes still produces a `vote_result` broadcast.
- **Fix direction:** mirror `force_dawn`'s `if (messages.length === 0) return;` guard.

### M2. `restart_game` / `return_to_lobby` never `clearNightTimer` — stale night timers fire into the restarted game

- **File:** `src/server.ts:1210-1251`, `1177-1190`; engine `restartGame` has no phase guard (`game-engine.ts:943-982`)
- Every other handler that can end an active night clears the pending timer (`force_dawn:1102`, `end_game:1156`, `close_room:1197`, admin-leave:738) — these two don't. The night flow schedules timers (1000 ms resolving, 1500 ms inter-sub-phase, 5–15 s fake sub-phase). Restarting inside such a window leaves an orphaned callback that fires into the **new** game (same code, so `getGame` still resolves): `resolveNightAndTransition` force-transitions the fresh night to day round 1 with no actions resolved, or `handleSubPhaseAdvance` skips the new game's mafia turn.
- **Repro (executed):** 3 players; mafia locks + `confirm_mafia_kill` (arms the 1000 ms resolving timer); within ~1 s admin sends `restart_game` → all clients get new roles + night round 1, then ~800 ms later an unsolicited `phase_change{day, round:1}` arrives with nothing resolved.
- **Fix direction:** `clearNightTimer(game.code)` in both handlers; optionally guard `restart_game` to sensible phases.

### M3. `abstain_vote` has no phase guard — spurious `phase_change(day)` broadcast during night/voting/game_over

- **File:** `src/server.ts:965-978`
- The handler checks only admin identity, then records a narrator line and broadcasts `phase_change{day}` **without touching engine state**. During night: every client flips to day UI while the engine still runs the night sub-phase machinery (proven: `mafia_vote` still accepted after the broadcast) — and since the admin now sees a day screen, the recovery action (`force_dawn`) is unintuitive. During voting: pending voters lose the vote panel while the engine still requires their votes — wedged until `cancel_vote`. During game_over: clients pulled off the results screen.
- **Repro (executed):** start game → `narrator_ready` (engine: night/mafia) → admin sends `{type:"abstain_vote"}` → all clients receive `phase_change{day, messages:["The admin has chosen to abstain…"]}`; engine unchanged.
- **Fix direction:** accept only when `game.phase === "day"`.

### M4. `confirm_mafia_kill` has no role/alive check — any player, including dead spectators, can confirm the mafia's kill

- **File:** `src/server.ts:850-872`
- The handler guards on phase/sub-phase/`mafiaTarget !== null` but never verifies the sender is an alive mafia member (every other night action validates role+aliveness inside the engine). Once consensus is reached, **any** connected client — alive citizen, doctor, dead spectator — can send `{type:"confirm_mafia_kill"}`, ending mafia deliberation and stripping the mafia of their window to unlock and reconsider (the engine supports toggling the lock off, which resets `mafiaTarget`). Dead spectators see the locked target in real time via `spectator_mafia_update`, so they know exactly when the message will land.
- **Repro (executed):** 4 players; mafia reaches consensus; a plain alive **citizen** sends `confirm_mafia_kill` → mafia receives `night_action_done`, sub-phase advances.
- **Fix direction:** require `role === "mafia" && isAlive` on the sender.

### M5. Joker-haunt victim who is a lover is misclassified as a heartbreak death

- **Files:** `src/game-engine.ts:617-624` (event classification); same positional heuristic at `src/server.ts:1408-1412`
- `transitionToDay` classifies kills with `isLoverDeath = k.player.isLover && killed.length > 1 && k !== killed[0]` — keyed off **array position**, ignoring the `k.source` field that's right there. `resolveNight` pushes mafia kills first, then haunt kills. So when the mafia kills A and the Joker independently haunts a *different* player B who happens to be a lover, B (index ≥ 1) is recorded as `lover_death` instead of `joker_haunt`, gets `you_died{isLoverDeath:true}`, and is shown the broken-heart "died of heartbreak" screen — while `spectator_kill_confirmed` simultaneously tells dead players it was a haunt. No `joker_haunt` event is recorded at all.
- **Repro (executed, engine-direct):** 8 players, joker official + lovers; arrange lovers B+L; lynch the Joker day 1; night 2: `submitJokerHaunt(joker, B)` + mafia locks A; resolve → `eventHistory` shows B as `lover_death`, no `joker_haunt` entry.
- **Fix direction:** classify by `k.source` (and pair-cascade adjacency), not array index.

### M6. Invalid `mafiaCount` chain: NaN bypasses the clamp → zero-mafia game → poisoned persistence → bricked lobby UI

*(merges 4 raw findings with one root cause)*

- **Files:** `src/game-engine.ts:127-129` (`updateSettings` raw `Object.assign`), `154-162` (`assignRoles` clamp), `src/server.ts:771-779` (pass-through), `:794` + `:623-628` (persistence), `src/db.ts:78-87`, `public/app.js:747-761, 835`
- **(a) Engine:** `assignRoles` computes `mafiaCount = Math.min(settings.mafiaCount, floor(n/3))` then `if (mafiaCount < 1) mafiaCount = 1`. A non-numeric value (`"abc"`, `null` → `Math.min` → `NaN`) skips the clamp (`NaN < 1` is false) and the assignment loop (`0 < NaN` is false): the game starts with **zero mafia**. The night then soft-locks (`checkNightReady` requires a `mafiaTarget` that can never be set; `checkWinCondition` would return `"town"` but is never evaluated during night). Any WS client that is admin can send `update_settings{settings:{mafiaCount:"abc"}}` — the server echoes it back accepted.
- **(b) Persistence amplification:** `start_game` runs `saveLastSettings(JSON.stringify(game.settings))` with no validation, and every future `create_game` reloads it and spreads it **over** `DEFAULT_SETTINGS` (`game-engine.ts:49`). One bad value poisons every subsequent game that admin creates, **surviving server restarts** (it lives in SQLite). Note `JSON.stringify(NaN) === "null"`, so an in-memory NaN persists as `null` and reloads as `null`.
- **(c) Client lockout:** with `mafiaCount: null` in `lobby_update`, the lobby renders an empty count and the +/− buttons read `parseInt(textContent)` → `NaN`, making **both** guards (`current > 1` / `current < 6`) false — the buttons are permanently dead, so the admin cannot repair the value from the stock UI.
- **Repro (executed, server-level):** register admin + 3 players → `update_settings{mafiaCount:"lol"}` → `settings_updated` echoes `"lol"` → `start_game` → all four `game_started.role === "citizen"` (0 mafia), night soft-locked. Then `leave_game` + `create_game` → new lobby's `settings.mafiaCount === "lol"`; restart the server process, login, `create_game` → still `"lol"`.
- **Fix direction:** validate/coerce settings server-side (whitelist keys + clamp `mafiaCount` to a positive integer), make the engine clamp NaN-proof (`if (!(mafiaCount >= 1)) mafiaCount = 1`), and validate on load from `last_settings_json`.

### M7. All night actions are accepted while the "Begin Night" gate (`awaitingNarratorReady`) is up

- **Files:** `src/server.ts:826-925` (night-action handlers); engine submits `game-engine.ts:240-311`
- `startGame` sets `phase="night"`, `nightSubPhase="mafia"`, **and** `awaitingNarratorReady=true` — the night is supposed to wait for the admin's `narrator_ready`. But no night-action handler (nor the engine) checks the flag; phase checks already pass during the gate. A scripted mafia client can vote, lock, and `confirm_mafia_kill` (also ungated, see M4) to drive the entire night to resolution **before the admin ever begins it** — the victim dies while everyone else stares at the "check your role card" overlay; the admin's later `narrator_ready` fires a duplicate `startNightSequence`.
- **Repro (executed):** 4 players; `start_game`; **no** `narrator_ready`; mafia sends maybe→lock→`confirm_mafia_kill` → ~2.5 s later all clients receive `phase_change{day, round:1}` with the victim dead.
- **Fix direction:** reject night actions while `game.awaitingNarratorReady` is true.

### M8. `checkWinCondition` counts a living Joker toward town's parity, contradicting the README

- **File:** `src/game-engine.ts:885-895` (line 892)
- README.md:22 says the Joker "*does not count toward either team's numbers*" and defines the mafia win as "equal or outnumber non-Mafia alive." The engine computes `aliveNonMafia` **excluding** the joker but then adds the joker back: `if (aliveMafia.length >= aliveNonMafia.length + aliveJoker.length) return "mafia"`. A living Joker therefore blocks/delays mafia parity: with 1 mafia + 1 citizen + 1 joker alive, README rules say mafia wins (1 ≥ 1) but the engine continues the game. No test pins joker-inclusive parity, so the README is the spec.
- **Repro (executed):** 4 players `{mafiaCount:1, enableJoker:true}`; mafia night-kills the citizen → 1 mafia, 1 citizen, 1 joker alive → `transitionToDay` leaves `phase="day"`, `winner=null` (README expects mafia win).
- **Fix direction:** decide the intended rule; if README is right, drop `+ aliveJoker.length`. Update README/tests to pin it either way.

### M9. A disconnected-but-alive player permanently blocks day-vote resolution

- **Files:** `src/game-engine.ts:675-678` (`castVote` allVoted); resolve trigger `src/server.ts:1013-1014`
- `allVoted = getAlivePlayers().every(p => votes.has(p.id))` ignores `Player.connected`, and `resolveVote` is **only** called when `allVoted` flips true. Disconnects/leaves merely set `connected=false`. There is no vote timer and no admin force-resolve, so one alive player who leaves for good makes every future vote stick at N−1/N forever; the only exit is `cancel_vote`, which **discards** the cast votes — i.e., the lynch mechanic is permanently disabled for the rest of the game.
- **Repro (executed):** 5 players; night 1 kill → 4 alive; `call_vote`; one alive citizen closes its socket; remaining 3 vote → `vote_update{totalVotes:3, total:4}` and no `vote_result`, indefinitely.
- **Fix direction:** an admin force-resolve that tallies cast votes, a per-vote timeout, or a connected-aware quorum (design decision required).

### M10. `end_game` after a natural win overwrites the real result with "Host has ended the game" on every client

- **File:** `src/server.ts:1151-1175`
- The handler has no `phase === "game_over"` guard and hardcodes `winner:"town", forceEnded:true`. Sent after a legitimate mafia (or any) win, it re-broadcasts `game_over` and the client's `forceEnded` branch (`app.js:2588-2616`) replaces "Mafia Wins!" with the neutral "Game Over / Host has ended the game." screen on every client — erasing the real outcome display (server-side `game.winner` stays correct).
- **Repro (executed):** drive a 4-player game to a mafia win; admin sends `{type:"end_game"}` → all clients re-render the force-ended screen.
- **Fix direction:** no-op when the game is already over; never relabel a decided winner.

### M11. Single-mafia target-selection race: double-tap silently cancels the vote; switching targets within 50 ms locks the wrong kill

- **File:** `public/app.js:1843-1853` (tap → `maybe` + `lock` 50 ms later); same pattern at `2030-2041`
- The client sends `maybe` immediately and `lock` 50 ms later per tap with no debounce. Engine semantics: duplicate `maybe` **toggles off**; `lock` without a `maybe` is rejected; once consensus sets `mafiaTarget`, all further changes are rejected. So (a) double-tapping the same target leaves the server with **zero** votes while the UI still shows it selected (single-mafia mode also skips the status re-render, `app.js:2107`) — the player waits forever for a confirm prompt that never comes; (b) tapping A then B inside 50 ms produces maybeA→maybeB→lockA (consensus on **A**)→lockB(rejected) — the kill is locked on A while the UI highlights B.
- **Repro (executed, engine-level mirror of the exact WS sequences):** `maybe A, maybe A, lock A, lock A` → `mafiaVotes=[]`, no consensus; `maybe A, maybe B, lock A, lock B` → `mafiaTarget = A`.
- **Fix direction:** client-side selection guard/debounce, or make the lock message carry the intended target and let the server treat re-selection atomically.

### M12. `vote_result` still broadcasts exact vote tallies to all players (the data-layer half of c59b5cf)

- **File:** `src/server.ts:1018-1024`
- Commit `c59b5cf` removed "(X for, Y against)" from narrator/UI, but the broadcast still carries `votesFor`/`votesAgainst` to every client (including dead ones). Anyone with devtools sees the tally; in small games tallies de-anonymize voters.
- **Repro (executed):** any resolved vote — observe the `vote_result` frame on any client: `{type:"vote_result", …, votesFor:N, votesAgainst:M}`.
- **Fix direction:** strip counts from the payload (or send only to the admin).

### M13. Narrator template injection: a username that is a literal placeholder gets re-expanded into mad-libs filler

- **File:** `src/narrator.ts:163-169` (`fill()`); register has no charset/length validation (`src/server.ts:575-594`)
- `fill()` substitutes `{name}` **first**, then later keys (`{tool}`, `{food}`, `{location}`, `{lastWords}`, `{executionStyle}`, `{lover}`, `{saveMethod}`) via sequential `replaceAll`. A player who registers as a literal placeholder — e.g. `{tool}` or `{food}` — has their already-substituted name re-expanded: `Narrator.nightKill("{food}")` → "…a gluten-free muffin is dead"; `Narrator.loverDeath("{lover}","Bob")` → "Bob was Bob's lover! As Bob falls, so does Bob…" (name spoofed to the partner). The corrupted line is the authoritative public death narrative, broadcast to all and persisted in `narratorHistory`.
- **Repro (executed):** `Narrator.nightKill("{tool}")` → 0/200 trials preserved the name; full engine path with a player named `{tool}` produces a death announcement that never names the victim.
- **Fix direction:** single-pass template substitution (or restrict username charset at registration — also fixes the length issue, L8).

### M14. Service worker caches non-OK responses — a 503 during a Fly deploy poisons the offline app shell

- **File:** `public/sw.js:32-40`
- The fetch handler `cache.put()`s every resolved response with no `response.ok` check. HTTP 4xx/5xx **resolve** (fetch only rejects on network errors), so Fly's "App is not available" 503 page — served on every auto-deploy window (CLAUDE.md: every push deploys) — overwrites the cached `/`, `/app.js`, `/app.css`, etc. The offline fallback then serves the cached 503 instead of the app until each URL is re-fetched successfully online.
- **Repro (executed, Chromium + toggling a 503-mode static server):** prime the cache → flip server to 503 → reload + fetch assets → cache entries for the app shell now hold the 503 HTML; offline reload serves the error page.
- **Fix direction:** only `cache.put()` when `response.ok`.

---

## LOW SEVERITY

### L1. `buildGameSync.gameOver` omits `jokerJointWinner` — joint-win trophy lost on rejoin
`src/server.ts:530-539` (live broadcasts include it at `1061-1067`, `1434-1442`; type declares it at `src/types.ts:223-224`). Rejoining/refreshing clients render the final reveal without the Joker's joint-win trophy. **Repro (executed):** drive an official-mode joint win, town finishes the game, reconnect any player → `game_sync.gameOver.jokerJointWinner === undefined`. *Fix:* set the flag in `buildGameSync` (and in the `end_game` broadcast).

### L2. `awaitingNarratorReady` survives `forceDawn`/`endDay`/`forceEndGame`/`returnToLobby`; `narrator_ready` has no phase guard
`src/server.ts:1253-1261`; flag never reset in `game-engine.ts:849-941`. Two verified legs: a rejoiner during day gets `game_sync.awaitingNarratorReady:true` and is stuck on the "Check your role card!" overlay; and the admin can send `narrator_ready` during day/game_over → `startNightSequence` fires night cues + `mafia_targets` prompts in the wrong phase. *Fix:* clear the flag in the forced transitions; guard `narrator_ready` to `phase === "night"`.

### L3. `forceEndGame` leaves `winner = null`, but `buildGameSync` dereferences it with `!`
`src/game-engine.ts:897-900`; consumer `src/server.ts:530-538`. Rejoining a force-ended game yields `gameOver.winner: null` (type promises non-null) — inconsistent with the live broadcast's hardcoded `"town"`. **Repro (executed):** `end_game`, then reconnect → `game_sync.gameOver = {winner:null, …}`. *Fix:* set a winner in `forceEndGame` or special-case `forceEnded` in the builder.

### L4. README Role Roster documents only house-mode Joker; the shipped default is official mode
`README.md:22` ("execution ends the game") vs default `jokerMode:"official"` (`src/types.ts:37`) where the game continues with a joint win + haunt. CLAUDE.md mandates the roster stay current. Also makes README unreliable as the spec arbiter for M8. *Fix:* document both modes.

### L5. `game_over` isn't queued behind active death/heartbreak transitions — overlay timer chains fight
`public/app.js:157-170, 1434-1483, 2694-2738`. When an execution + lover-cascade ends the game, the execution/heartbreak chains (~5.2 s) and `showGameOverSuspense` (~4.8 s) mutate `#suspense-overlay` concurrently: reveal beats get stomped and a stale `applyPhaseChange` fires after the game-over screen is up. **Repro (executed against a scripted WS feed):** push the server's exact message sequence; observe the text stomps via MutationObserver. *Fix:* queue `game_over`/`phase_change` like other gated messages, or cancel prior chains.

### L6. Corrupt `localStorage["mafia_user"]` throws uncaught in `ws.onopen` — auto-login/auto-rejoin permanently dead
`public/app.js:90-94`. `JSON.parse` with no try/catch; a corrupt value throws on **every** (re)connect, silently landing the player on the auth screen mid-game. *Fix:* try/catch, remove the bad key.

### L7. `cast_vote` broadcasts `vote_update` to the whole room with no phase/result guard
`src/server.ts:999-1011`. Engine state is safe (castVote no-ops), but any client can spam room-wide `vote_update{totalVotes:0,…}` broadcasts in any phase. *Fix:* broadcast only when the vote was recorded during `voting`.

### L8. No username length limit — 10 KB+ names accepted, stored, and rebroadcast to everyone
`src/server.ts:575-595`, `src/db.ts:43-49`. Client rendering escapes HTML (no XSS found), so impact is payload bloat/UI breakage/DB growth. **Repro (executed):** `register` with a 10,240-char name succeeds; DB row confirms. *Fix:* cap at ~16–32 chars server-side (client `maxlength` already implies it).

### L9. House-mode Joker win leaves `voteTarget`/`votes` populated at game_over
`src/game-engine.ts:770-788` (official branch clears at 747-748; normal path at 810-812). Stale-state invariant violation found by the fuzzer; limited client impact (sync only emits voteState during `voting`). *Fix:* clear both before returning.

### L10. `saved_configs` is a dead table; REQUIREMENTS.md still advertises removed "named profiles"
`src/db.ts:27-34`; `REQUIREMENTS.md:17`. No CRUD, no message types, no UI reference the table — only the single-slot `last_settings_json` is live. *Fix:* drop the table or implement the feature; correct the doc.

### L11. Stale `sw.js` precache list: `/pixel-art.js` missing (offline boot crashes), nonexistent `.png` icons cached as HTML
`public/sw.js:2-10`. The list predates commit `10ccf27` (pixel-art extraction) and still references `icon-192.png`/`icon-512.png` which don't exist — the SPA fallback (200 + index.html) masks the failure so `cache.addAll` "succeeds" storing HTML under image URLs; `CACHE_NAME` is still `mafia-v2` so existing clients never reinstall. **Repro (executed, Chromium):** prime cache online → go offline → reload → `ReferenceError` from `app.js:3160` (`pixelArtToSvg` undefined); app shell dead. *Fix:* sync ASSETS with index.html (add `/pixel-art.js`, fix icon extensions), bump CACHE_NAME, and consider making the static handler 404 unknown paths for sub-resources.

---

## Claims investigated and REJECTED (intended design)

1. **"Night soft-locks when the sole mafia disconnects mid-sub-phase"** — facts confirmed by live repro (no timer exists for real sub-phases), but judged intended: the night flow is universally input-driven (a connected-but-AFK mafia produces the identical pause), disconnects are explicitly non-destructive (`server.ts:1532` comment), and the admin's `force_dawn` is the designed escape hatch.
2. **"`checkNightReady` can never be satisfied with zero living mafia"** — unreachable through real play: role assignment clamps mafia ≥ 1 (absent bug M6), and every path that kills the last mafia (vote, haunt, night resolution) runs `checkWinCondition` and ends the game first. Only direct state mutation can produce the state.

## Coverage notes

- All 16 finders completed; the completeness critic identified three under-covered subsystems (narrator message generation, settings persistence round-trip, service worker) and a targeted second round produced M6(b/c), M13, M14, L11, L10 — all verified.
- Areas exercised and found **clean**: core night-resolution ordering (simultaneous-action semantics incl. doctor/haunt interplay), doctor `lastDoctorTarget` rules, standard win conditions without a joker, vote majority math at boundary counts (ties, all-down, odd/even rosters), engine-level role/aliveness authorization on all `submit*` actions, duplicate-vote rejection, rejoin role restoration (incl. the recent joker-haunt rejoin fixes from `01cadf7`/`37dd487`), no XSS via usernames (escapeHtml used), no directory traversal in static serving, single-socket-per-user double-agent abuse (state is keyed by userId), and the ~300-game randomized fuzzer found no dead-rise/phase-corruption invariant violations beyond L9.

## Suggested fix order

1. **H1–H4** (game-outcome corruption + information leaks): four small, surgical patches.
2. **M1–M4, M7** (server handler guards): one theme — handlers trusting admin identity but not phase/role/result; a shared guard pass fixes all five.
3. **M6** (settings validation chain): one validation layer at `update_settings` + NaN-proof clamp + load-time sanitization.
4. **M8** needs a *rules decision* (README vs engine) before code changes.
5. **M9** needs a *design decision* (force-resolve / timeout / quorum).
6. The rest are independent small fixes.

---
*Generated by a 55-agent audit workflow (8 auditors, 8 simulators, adversarial verification with executed reproductions, completeness critic + gap round). Simulation/verification scripts referenced in repros live under `/tmp/mafia-sim-*` and `/tmp/mafia-verify/` (ephemeral).*
