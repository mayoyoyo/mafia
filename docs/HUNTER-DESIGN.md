# Hunter Role — Implementation Spec

**Status:** approved, implementation-ready. **Date:** 2026-06-10.
**Source of truth for WHAT:** this file (distilled from `ARCHITECTURE-AUDIT.md` §1.4 + owner decisions). **Source of truth for HOW/WHEN:** `BUILD-PROGRAM.md` (Program C builds this on Program B's seams).
**Code references** verified against branch `fix/audit-findings` @ `645aaf3` (the audit cites `staging` @ `977d78c`; some line numbers drifted — the ones below are current). Program B will move them again; treat them as anchors, not gospel — re-grep before editing.

---

## 0. Settled decisions (do NOT re-litigate)

1. **Hunter** is the only new role. Vigilante and Godfather were rejected for 9-player balance (too swingy / guts the lone detective); Miller/Masons fell away with them.
2. **Revenge is ALWAYS OPTIONAL.** The client sends `{ targetId: number | null }`; `null` = decline. There is **NO `hunterMode` official/house toggle** — if a "must shoot" variant is ever wanted it's one validation line later. Admin force-skip and the revenge timeout resolve through the **same decline path**.
3. The revenge trigger **rides Program B's P2 death pipeline** (`notifyDeathTriggers`) — it is NOT bolted onto `killPlayer` before P2 exists. Known trap: today the lover cascade kills by direct mutation inside `killPlayer` (`src/game-engine.ts:469-476` — `lover.isAlive = false`), so the lover never gets a death record of their own; a hook keyed to `killPlayer` invocations would silently never fire for a heartbreak-dead Hunter. **P2 must fix this** (cascades route through `applyDeath`).
4. `Game.pendingRevenge` is **plain data** — `{ hunterId, resume: { autoNight, preserveHauntVoters } }` — never a server-held closure (closure-held gate state is un-rejoinable and M2-shaped). The revenge timeout gets its **own timer slot**: `nightTimers` is a single overwriting slot per game (`src/server.ts:88-96`; `set` silently overwrites) — a known bug class (M2).
5. The gate inherits the `awaitingNarratorReady` bug-history as a checklist (§6).
6. Dawn becomes **two-stage** when a Hunter dies at night; a day-lynch death interrupts **before** `resolveVote`'s auto-transition to night (§4).
7. **Win condition is evaluated AFTER revenge resolves** (§7).
8. **M8 is settled and already implemented** (commit `1e5ecce`): a living joker counts toward NEITHER team — `checkWinCondition` excludes jokers from both sides (`src/game-engine.ts:959-970`).
9. Hunter is **town-aligned, counts as town for parity, has no night action, no new night sub-phase, and NO new audio assets**. Client reuses the joker-haunt target-list + slide-to-confirm UI.
10. **Role reveal on Hunter death is PUBLIC** (canon): the death announcement names them as the Hunter when the revenge prompt fires. Rationale: their revenge is observable anyway — a freshly dead player visibly killing someone — so secrecy buys nothing.
11. Default 9p roster guidance: **2 Mafia · Doctor · Detective · Joker · Hunter · 3 Citizens** (joker optional; `enableHunter` is an independent settings toggle like the others).
12. Estimated size: **~150–250 LOC + content** on top of Program B's seams (vs ~400–500 LOC of ad-hoc restructuring without them).

---

## 1. Rules spec (player-facing)

The Hunter is a town player with no night action. They sleep through the night like a citizen. Their entire role fires at the moment of death:

> **When the Hunter dies — by ANY means — they are publicly revealed as the Hunter and may immediately take one living player down with them. The shot cannot be stopped. Taking the shot is optional.**

Per death source:

| Death source | When revenge happens | What the room sees/hears |
|---|---|---|
| **Mafia night kill** | At dawn, after the night's deaths are announced but **before** day begins (the dawn pause) | Narrator announces the death AND names them as the Hunter; the room waits ("the Hunter is choosing…"); then either the revenge death is announced or "the Hunter declines"; then day begins |
| **Day-vote lynch** | Immediately after the execution result, **before** the auto-transition to night | `vote_result` plays as usual; then the Hunter reveal + wait; then revenge/decline; then night falls (or game over) |
| **Joker haunt** (official joker mode) | Same as mafia night kill — it's a night death resolving at dawn | Same dawn flow; if both a mafia kill and the haunt landed, all night deaths are announced first, then one revenge |
| **Lover heartbreak** | Whenever the cascade fires — at dawn for night deaths, mid-vote-resolution for lynch cascades (the Hunter need not be the executed player) | Same as the enclosing flow; the heartbreak death message plays, then the Hunter reveal + revenge |

Universal rules:
- Exactly **one revenge per Hunter death** (there is one Hunter per game; they die once).
- The target may be **any living player** — including mafia, the doctor, a lover (whose partner then dies of heartbreak too).
- The revenge shot is **unstoppable**: the Doctor cannot block it (§8).
- **Declining**: the Hunter may decline (explicit button). The admin can **force-skip** a stalled Hunter (kitchen problem), and a **60-second timeout** auto-declines. All three are the same code path.
- If **no living targets exist** (degenerate endgame), the gate never opens — resolution proceeds as a decline.
- The room **hears no new audio** — all Hunter beats are text narrator lines only (existing day/night cues still play at their usual, now-deferred, positions).
- Win checks run **after** the revenge resolves: the Hunter can win the game for town by sniping the last mafia, or hand mafia parity by shooting a townie. Both are intended.
- The Hunter's death during a **house-mode joker execution win** does NOT grant revenge — that win is instant by rule (`game.phase` is already `game_over` when the cascade death applies; the gate never opens). Official-mode joker execution is NOT a game end, so a Hunter heartbreak-killed by the joker-lynch cascade DOES get revenge (§9, edge E4).

---

## 2. Settings & role assignment

### `enableHunter` toggle
- `GameSettings.enableHunter: boolean`, default `false` (`src/types.ts:16-26`, `DEFAULT_SETTINGS` at `28-38`).
- Add `"enableHunter"` to the `boolKeys` array in `sanitizeSettings` (`src/game-engine.ts:132`) — the compile-time exhaustiveness guard at `game-engine.ts:138-141` will force this; nothing else is needed for M6-safe wire+DB validation.
- Lobby UI: one more toggle in `public/index.html` settings + the client `SETTING_*` wiring, exactly like `enableJoker`. No mode selector (decision #2).

### Assignment order (`assignRoles`, `src/game-engine.ts:199-264`)
Deal order today: mafia (clamped) → doctor → detective → joker → citizens fill. **Hunter slots in after joker, before the citizen fill:**

```ts
if (settings.enableHunter && idx < totalPlayers) {
  game.players.get(playerIds[idx])!.role = "hunter";
  idx++;
}
```

- **Mafia-count clamp interaction:** the clamp (`mafiaCount ≤ floor(totalPlayers/3)`, NaN-proofed, `game-engine.ts:204-205`) runs FIRST and is unchanged. Hunter consumes one post-mafia slot like every other special.
- **Citizens-remaining floor:** there is **no hard floor in the engine today** — each special is guarded only by `idx < totalPlayers`, so at tiny player counts a late-order special silently isn't dealt. Hunter inherits exactly this behavior (being last in the special order, it is the first special to be dropped when slots run out). Do NOT add a new floor mechanism — that would change existing-roster behavior. (A lobby soft-warning when `mafiaCount + enabled specials ≥ players − 2` was floated in ROLE-RESEARCH.md; it is OUT OF SCOPE for Program C.)
- **Pixel-art variant:** hunter is a single-variant role — falls into the existing `else { player.variant = 0; }` branch (`game-engine.ts:246`) with doctor/detective/joker. No change needed beyond the union.
- Roster fit at 9 (both owner rosters work): with Joker on — 2 Mafia · Doctor · Detective · Joker · Hunter · 3 Citizens; without — 2 Mafia · Doctor · Detective · Hunter · 4 Citizens.

---

## 3. State & protocol spec

### 3.1 `src/types.ts` changes

```ts
// Role union (types.ts:1)
export type Role = "citizen" | "mafia" | "doctor" | "detective" | "joker" | "hunter";

// GameSettings (types.ts:16) + DEFAULT_SETTINGS (types.ts:28)
enableHunter: boolean;          // default false

// Game (types.ts:51) — PLAIN DATA, never a closure (decision #4)
pendingRevenge: {
  hunterId: number;
  resume: {
    autoNight: boolean;            // true when the interrupted flow was an execution → night auto-transition
    preserveHauntVoters?: boolean; // true only for the official-joker-lynch resume (the haunt night must still happen)
  };
} | null;

// GameEvent.type union (types.ts:240) — new member
"hunter_revenge"
// (P2 additionally puts cause/source on GameEvent additively — see BUILD-PROGRAM B3)
```

### 3.2 `ClientMessage` additions (types.ts:95-122)

```ts
| { type: "hunter_revenge"; targetId: number | null }   // hunter only; null = decline
| { type: "force_skip_revenge" }                        // admin only; resolves as decline
```

### 3.3 `ServerMessage` additions (types.ts:124-225)

```ts
// To the Hunter when the gate opens (and re-sent on rejoin — §6):
| { type: "hunter_revenge_targets"; players: PlayerInfo[] }

// Broadcast to the whole room when the gate opens (this IS the public reveal):
| { type: "hunter_revenge_pending"; hunterName: string }
```

Resolution needs **no new message types**: the revenge death rides the existing `you_died` / `player_died` pair, and the deferred `phase_change` (with narrator `messages`) closes the sequence. Decline emits the decline narrator line inside that `phase_change`. **No new `sound_cue` values** (decision #9) — the existing `"day"` cue simply fires later, after revenge resolves.

### 3.4 `game_sync` representation (the H4 lesson — hard requirement)

Add a top-level optional field to the `game_sync` payload (`types.ts:161-225`):

```ts
pendingRevenge?: {
  hunterName: string;
  isYou: boolean;        // true when the rejoiner IS the hunter
} | null;
```

Built in `buildGameSync` (`src/server.ts:314-572`) — this is the P6-lite "explicit pendingRevenge projection" the audit mandates (§P6-lite). Rules:
- Present (non-null) whenever `game.pendingRevenge !== null`, for **every** rejoiner (the reveal is public).
- The target list itself is NOT in `game_sync`; it is re-sent to the hunter via a separate `hunter_revenge_targets` message right after `game_sync`, mirroring the dead-joker haunt rejoin treatment at `src/server.ts:683-693` (commit `01cadf7` precedent).
- Rejoin tests are part of the edge matrix (§10, tests E10a–c) and are **shipping requirements**, not nice-to-haves.

### 3.5 Engine API

```ts
// game-engine.ts — the only new public engine entry point
export function submitHunterRevenge(
  game: Game, hunterId: number, targetId: number | null
): { ok: boolean; death?: Death /* P2 type */ };
```

Validation: gate must be open; `hunterId === game.pendingRevenge.hunterId`; if `targetId !== null` the target must exist and be alive. On success: `targetId === null` → clear gate, call `concludeRound(game, messages, game.pendingRevenge.resume)` with no new deaths; otherwise → `applyDeath(target, "hunter_revenge")` (which cascades the target's lover via P2), push `eventHistory` entries, clear gate, `concludeRound(resumeOpts)`. Same path, one branch (audit §P5).

The trigger itself lives in P2's `notifyDeathTriggers(game, death)` (~6 lines): if `death.player.role === "hunter"` and `game.phase !== "game_over"` and at least one other player is alive → set `game.pendingRevenge` with resume options derived from the call site. It fires for **every** death source — night kill, execution, haunt, heartbreak — from one hook, including cascade deaths (the whole point of P2 fixing the bypass).

### 3.6 Server flow & timer

- **Revenge timer:** new `revengeTimers: Map<string, Timer>` + `clearRevengeTimer(code)` beside `nightTimers` (`server.ts:88-96`) — its own slot per decision #4. Armed (60_000 ms) when the gate opens; cleared on resolution AND in every forced-transition handler (§6). Timer fire → resolve as decline through the identical path.
- **`hunter_revenge` handler:** guards — in a game, gate open, sender is the hunter (`client.userId === game.pendingRevenge.hunterId`). On engine success: broadcast revenge death (`player_died` + `you_died` to the victim and any cascaded lover, keyed on P2 `Death.cause` — never positional), clear timer, then run the deferred epilogue broadcast (§4).
- **`force_skip_revenge` handler:** guards — admin only (`client.userId === game.adminId`; admin retains rights dead or alive per CLAUDE.md), gate open. Calls `submitHunterRevenge(game, game.pendingRevenge.hunterId, null)`.
- **Gate rejections (the M7 lesson):** while `game.pendingRevenge !== null`, every other game-mutating handler is rejected: `call_vote`, `cast_vote`, `abstain_vote`, `cancel_vote`, `end_day`, `mafia_vote`, `mafia_remove_vote`, `confirm_mafia_kill`, `doctor_save`, `detective_investigate`, `joker_haunt`, `narrator_ready`, `start_game`. Exceptions: `hunter_revenge`, `force_skip_revenge`, the forced transitions that CLEAR the gate (§6), and connection-level messages (`join_game` rejoin, `leave_game`, prefs).

### 3.7 Narrator lines (text only — NO new audio)

New tables + functions in `src/narrator.ts` following the existing pattern (`Narrator` object at `narrator.ts:174+`; respect the T11/M13 single-pass `fill`):
- `Narrator.hunterReveal(name)` — e.g. "{name} was the Hunter! With their dying breath, they raise their weapon…" (this line accompanies `hunter_revenge_pending` and IS the public reveal).
- `Narrator.hunterRevengeKill(name)` — e.g. "{name} falls to the Hunter's final shot."
- `Narrator.hunterDecline()` — e.g. "The Hunter lowers their weapon. There will be no revenge."
3–5 variants each, matching the house style. All recorded via `recordNarrator` into `narratorHistory` (rejoin transcript). **Zero entries in the `sound_cue` union, `narration.json`, `NARRATION_CUES`, or mp3 dirs** — the four-registry audio surface is untouched (audit §1.1).

### 3.8 Client (`public/app.js`) — reuse the joker-haunt machinery

The dead-joker haunt is the exact precedent (`37dd487`): a dead player gets a target-pick list + slide-to-confirm. Hunter work:
- **Dispatch case** for `hunter_revenge_targets` → `showNightAction("Take your revenge", msg.players, "hunter_revenge")` (dispatch table at `app.js:318-333`); sets the shared dead-action flag.
- **`deadActionActive`** (P7-micro, built in Program B): the six spectator guards (`app.js:370-390`, currently `isDead && !jokerHauntActive`) and the `showNightAction` dead-guard (`app.js:1839`, currently `if (isDead && actionType !== "joker_haunt") return;`) key off one flag any dead-player action sets. Hunter sets it instead of OR-ing a second flag into seven sites.
- **Gate lists** (P7-micro): `hunter_revenge_targets` and `hunter_revenge_pending` MUST be in the derived hold-and-replay gate constant (today three hand lists at `app.js:177`, `182`, plus the suspense list at `165`) — otherwise the suspense/execution overlay chains swallow the prompt. **This is the L5 trap and the single most likely Hunter bug** (audit §1.4). The admin force-skip is the runtime safety net; the gate-list entry is the fix.
- **Slide-to-confirm:** `setupSlideConfirm` icon/label tables (`app.js:1122-1127`) get a `hunter_revenge` entry — new 10×10 icon (e.g. `BOW_ART`), label `"slide to avenge"`. New CSS `.slide-confirm.role-hunter_revenge .slide-fill` color block (pattern at `app.css:892`).
- **Decline affordance:** a visible "Decline revenge" button under the target list, sending `{ type: "hunter_revenge", targetId: null }`. Plain button (slide-confirm is reserved for the kill).
- **Dead-overlay suppression** (~6 LOC, genuinely new): the Hunter just received `you_died` — the dead overlay (`#dead-overlay`) must not sit on top of the revenge prompt. Suppress/dismiss it when the prompt arrives (same idea as the `jokerWonOverlayShown` skip at `app.js:417-419`).
- **Room/spectator wait view:** on `hunter_revenge_pending`, show the reveal narrator line + a "waiting for the Hunter…" status for everyone (alive players' panels are otherwise idle because the phase transition is deferred). Admin additionally sees a "Skip revenge" control.
- **`game_sync` restore:** if `msg.pendingRevenge` — non-hunter: render the wait view (+ admin skip control); hunter (`isYou`): wait for the re-sent `hunter_revenge_targets` (mirrors `jokerHauntPending` handling at `app.js:595-608`). Also: the unknown-role ternaries in the game_sync night-action restore default to detective (`app.js:647-655`) — hunter has no night action so it never enters that branch alive, but DO add `hunter` awareness wherever `myRole` is switched for prompts/titles.
- **Reset lists:** clear hunter/dead-action state in the same four reset sites that clear `jokerHauntActive` today (`game_started` reset `app.js:259-279`, `game_sync` reset `489-499`, day-phase reset `~1442`, and the global reset) — one hand line per list (P7-micro shelved the list consolidation).

### 3.9 Spectator / dead-player view

- The Hunter (dead, prompted) is **isolated from the spectator feed** while the gate is open — exactly the dead-joker treatment: server-side, every `sendToDeadPlayers` exclusion that uses `getHauntingJokerId` (`server.ts:62-67`) gets a sibling "pending-revenge hunter" exclusion (or a combined `getDeadActorId` helper); client-side `deadActionActive` covers the rest.
- Other dead players see the `hunter_revenge_pending` reveal + resolution like everyone else (it's public).
- After resolution the Hunter drops into the normal dead-spectator experience.

---

## 4. Flow restructuring (where the gate sits)

Program B's P5 `concludeRound(game, messages, { autoNight, preserveHauntVoters? })` collapses the triplicated win-check/auto-transition epilogue — currently the three `checkWinCondition` call sites at `game-engine.ts:705` (transitionToDay), `817` (resolveVote official-joker branch), `885` (resolveVote tail), plus the two byte-similar auto-night blocks at `game-engine.ts:824-833` and `891-901`. **Its first line is the gate:** `if (game.pendingRevenge) return;` — deferring both the win check and the transition at every former call site in one place.

### Night death of the Hunter — two-stage dawn
Restructure `resolveNightAndTransition`'s tail (`src/server.ts:1388-1481`):

**Stage 1 (always):** engine resolves night deaths (`applyDeath` per death → `notifyDeathTriggers` → gate may open → `concludeRound` defers). Server sends: official-doctor private save (`1401-1406`), detective result (`1409-1419`), spectator kill result (`1422-1441`), the `you_died`/`player_died` loop (`1444-1456`, keyed on P2 `Death.cause`). If the gate did NOT open: day `sound_cue` + `phase_change` + possible `game_over` as today (`1459-1480`).

**Stage 2 (gate open):** instead of the day cue/phase_change — broadcast `hunter_revenge_pending`, send `hunter_revenge_targets` to the hunter, arm the revenge timer. Phase remains `"night"` / `nightSubPhase === "resolving"` while the gate is open. On resolution: revenge death broadcasts (if any), then `concludeRound(resume)` runs the win check + transition, then the server emits the day `sound_cue` + `phase_change` (+ `game_over` if the win check fired). Net effect: **announce deaths → hunter prompt → revenge resolves → THEN phase_change + win check** (decision #6).

### Day-lynch death of the Hunter (direct or heartbreak-cascade)
In `resolveVote` (under P5): execution applies deaths → trigger → `concludeRound`'s gate defers — phase stays `"voting"` with `votes`/`voteTarget` already cleared (the existing reset at `game-engine.ts:812-814`/`880-882` runs before the epilogue). Server (`cast_vote` handler, `src/server.ts:1043-1122`): `vote_result` (`1049-1053`) and the execution `you_died`/`player_died` loop (`1067-1078`) still go out; then, gate open → `hunter_revenge_pending` + targets + timer instead of the `phase_change`/`startNightSequence` branch (`1097-1109`). On resolution: revenge broadcasts → `concludeRound({ autoNight: true })` → night `phase_change` + `startNightSequence` (or `game_over`). NOTE: the `you_died` loop at `server.ts:1067-1078` is **positional today** (`isLoverDeath = i > 0 && k.player.isLover`, line `1069`) — correct only until Hunter adds revenge deaths to vote-path kill lists; P2/B3 converts it to `Death.cause` (BUILD-PROGRAM B3).

**B4a implementation note (sequencing):** `pendingRevenge` is per-night-scoped in the reset tables (`NIGHT_RESETS`); the caller's `resetNightActions` runs between `applyDeath` (where the trigger fires) and `concludeRound` (where the gate is checked) — in `transitionToDay` and both `resolveVote` execution branches alike. The trigger handler must queue (the OBSERVE-AND-QUEUE re-entrancy contract on `notifyDeathTriggers`) and set `game.pendingRevenge` only after the reset boundary — setting it inside `notifyDeathTriggers` gets wiped before the gate check runs.

### Official-joker lynch + Hunter heartbreak (the resume payload's reason to exist)
Joker lynched (official mode) captures `jokerHauntVoters` (`game-engine.ts:792-797`); if the joker's lover is the Hunter, the cascade opens the gate. Resume must carry `{ autoNight: true, preserveHauntVoters: true }` so the post-revenge `beginNight` (P1) preserves the haunt voters — the one legitimate divergence among the seven reset lists (audit §P1 carve-out).

### Phase invariants while the gate is open (D4 asserts, pinned by tests)
- `pendingRevenge !== null` ⇒ `phase ∈ {"night","voting"}`; `votes` empty and `voteTarget === null`; `winner === null`.
- `pendingRevenge === null` at `lobby`, `day`, `game_over` — guaranteed by the reset-table entries (§6).

---

## 5. Doctor interaction — revenge is UNSTOPPABLE

**Explicit rule: the revenge shot resolves OUTSIDE the night-action set; the Doctor cannot block it.** The doctor-save semantics live in `resolveNight`'s pairwise source booleans (`game-engine.ts:612-613`, becoming P2's `KillIntent[]` fold) and only apply to mafia-kill and joker-haunt intents. `applyDeath(target, "hunter_revenge")` is called after night resolution (or during vote resolution) and never consults `doctorTarget`. Even if the doctor protected the revenge target that very night, the target dies (test E7). `lastDoctorTarget` is unaffected by revenge.

---

## 6. The gate checklist (awaitingNarratorReady lessons — every box mandatory)

The `pendingRevenge` gate inherits the full bug history of `awaitingNarratorReady`/H4/M2/M7/L2 as requirements:

| Lesson | Requirement |
|---|---|
| **L2** (stale flags) | `pendingRevenge` cleared in **EVERY forced transition**: `force_dawn` (`forceDawn`, `game-engine.ts:919-938`), `end_day` (`endDay`, `940-957`), `end_game` (`forceEndGame`, `972-980`), `restart_game` (`restartGame`, `1024-1063`), `return_to_lobby` (`returnToLobby`, `982-1022`). Under P1 this is ONE line in the reset field table (per-night scope + full-reset scope), not five hand edits. The server side of each of those handlers also calls `clearRevengeTimer` next to its existing `clearNightTimer` (`server.ts:1131`, `1187`, `1222`, `1232`, `1252`). |
| **M7** (missing guards) | ALL other game actions rejected while the gate is open (§3.6 list). One test sweeps every handler. |
| **H4** (invisible pending state) | Gate represented in `game_sync` (§3.4); prompt (`hunter_revenge_targets`) re-sent on hunter rejoin; wait-state restored for everyone else. |
| **M2** (orphaned timers) | Own timer slot (`revengeTimers`), cleared on resolution + every forced transition; never stored in `nightTimers`. |
| **L5** (overlay stomps) | Prompt message types in the derived client gate lists (§3.8); admin force-skip ships as the safety net since the overlay chains themselves are not restructured. |
| **D3** (gates as data) | Plain serializable data on `Game`; no closures. |

`forceDawn`'s semantics with an open gate: it is a forced transition — gate cleared, **no revenge**, straight to day ("forced dawn discards the pending revenge" — document in the admin UI copy). Same for `end_day` (only reachable if gate opened during `day`-adjacent states — in practice the guard list makes `end_day` unreachable while gated at `voting`/`night`; the reset-table clear is belt-and-braces).

---

## 7. Win-condition interactions (M8 settled: living joker counts for NEITHER team)

`checkWinCondition` (`game-engine.ts:959-970`): `aliveMafia === 0` → town; `aliveMafia >= aliveNonMafia` where `aliveNonMafia` excludes mafia AND jokers → mafia. The Hunter counts as town (`aliveNonMafia` includes hunters). Win evaluation happens ONLY in `concludeRound`, ONLY after the gate clears:

| Scenario (post-revenge alive set) | Outcome |
|---|---|
| Revenge kills the **last mafia** | Town wins — even though the Hunter is already dead |
| Revenge kills a **townie**, leaving mafia ≥ non-mafia | Mafia wins ("revenge-into-parity") |
| Revenge kills a **lover whose partner's cascade** removes the last townie | Cascade applies first, then ONE win check — mafia wins |
| **Joker alive**, revenge kills last non-mafia townie (e.g. alive: 1 mafia, 1 joker) | `aliveNonMafia` (excl. joker) = 0 → **mafia wins**; joker's presence does not save town (M8) |
| **Joker alive**, revenge kills the last mafia (alive: joker + townies) | `aliveMafia` = 0 → **town wins**; living joker is not a winner (joker only wins via lynch) |
| **Official-mode joint-winner joker** (already lynched) + revenge ends the game | `jokerJointWinner` stays true and rides the existing `game_over` payloads unchanged |
| Hunter **declines** and the pre-revenge board was already at parity | The deferred win check still runs on resolution → mafia wins (the gate defers, never skips, the check) |

---

## 8. Lovers interactions (both directions, via P2)

1. **Revenge target is a lover:** `applyDeath(target, "hunter_revenge")` performs the cascade itself (P2) — the partner dies of heartbreak (`cause: "lover_cascade"`), correct narrator line, correct `you_died { isLoverDeath: true }`, both before the single win check.
2. **Hunter is a lover, partner dies (any source):** the cascade routes through `applyDeath` (P2 fixed the `game-engine.ts:469-476` bypass) → `notifyDeathTriggers` fires for the Hunter's heartbreak death → gate opens. This must work when the enclosing flow is a **night resolution** (dawn two-stage) AND a **vote resolution** (the nasty sub-case: heartbreak fires the gate during a vote in which the Hunter wasn't even the executed player — audit §1.4 edge 3).
3. **Hunter is a lover and is the direct victim:** Hunter's own death cascades their partner (partner dies too), AND the gate opens for the Hunter. Death announcements for both, then one revenge.
4. **Double-death ordering:** at most one gate ever opens (one Hunter), and `applyDeath` no-ops on already-dead players, so mafia-kill + haunt + cascades cannot double-fire the trigger.

---

## 9. The complete edge-test matrix (from ARCHITECTURE-AUDIT §1.4, expanded)

Engine tests live beside `tests/game-engine.test.ts` patterns (direct engine calls, no ports). WS tests spawn a server on a **fresh port band starting at 18600+** (bands through 12600+ are taken; 13600–17600 are transiently in use by a verification workflow — see BUILD-PROGRAM conventions) with their own `/tmp` `DATABASE_PATH`. Deterministic deals: pull P9/D6's fixed-deal seam forward if random `assignRoles` makes a case untestable (audit P9: "the edge matrix requires deterministic deals to be testable at all"); otherwise use the discover-roles-from-`game_started`-and-adapt pattern with forced settings.

**E1 — Haunt-killed Hunter (engine + WS).** Official joker; joker lynched; Hunter among `jokerHauntVoters`; haunt night kills the Hunter. Assert: gate opens at dawn AFTER death announcements; `hunter_revenge_pending` broadcast; revenge kill resolves; `concludeRound` then transitions to day; win check ran post-revenge.

**E2 — Hunter-as-lover, heartbreak direction (engine + WS).** Lovers paired Hunter+X (fixed deal). Mafia night-kills X → cascade kills Hunter. Assert: trigger fired for the CASCADE death (the P2 bypass fix — this test fails on pre-P2 code by design); two death announcements then the prompt; revenge works.

**E3 — Hunter revenge into a lover (engine).** Revenge target is a lover. Assert: target + partner both die via cascade, correct event types (`hunter_revenge` + lover cascade), narrator order pinned, ONE win check after both.

**E4 — Heartbreak-during-vote (engine + WS).** Lynch target is the Hunter's lover (Hunter NOT executed). Assert: `vote_result` + execution deaths broadcast; gate opens BEFORE the auto-transition to night; phase held at `voting` with vote state cleared; after revenge → night falls (`resume.autoNight === true`). Variant: lynch target is the official-mode **joker** whose lover is the Hunter — assert `resume.preserveHauntVoters === true` and the haunt night still happens post-revenge.

**E5 — Revenge-into-parity + revenge-wins-for-town (engine).** (a) Revenge kills a townie creating `aliveMafia >= aliveNonMafia` → mafia wins. (b) Revenge kills the last mafia → town wins. (c) Both joker-alive variants per the §7 table (M8 pinned). (d) Decline at pre-existing parity → mafia wins on the deferred check.

**E6 — Decline path ×3 (engine + WS).** (a) `hunter_revenge { targetId: null }` → no death, gate cleared, decline narrator line, transition completes. (b) Admin `force_skip_revenge` → identical observable sequence. (c) Revenge timer expiry → identical. All three asserted equal (same messages modulo narrator variance).

**E7 — Doctor cannot block (engine).** Doctor protects X the same night mafia kills the Hunter; revenge targets X. Assert X dies; no save message for the revenge; `lastDoctorTarget` unaffected.

**E8 — Gate guard sweep (WS).** While gate open: every §3.6-listed handler is rejected (no state change, no broadcast); `force_dawn`/`end_game`/`restart_game`/`return_to_lobby` each CLEAR the gate + revenge timer and proceed (force_dawn discards revenge); D4 invariants hold before/after each.

**E9 — Timer isolation (WS).** Gate opens while no night timer is pending (dawn case) and during the vote case; assert arming/clearing the revenge timer never touches `nightTimers` and vice versa (the M2 lesson — assert via behavior: force a night sub-phase timer and a revenge timer in the same game lifecycle without collision).

**E10 — Rejoin mid-revenge (WS, the H4 lesson).** (a) Hunter disconnects after the gate opens, rejoins → `game_sync.pendingRevenge.isYou === true` AND `hunter_revenge_targets` re-sent; completes revenge normally. (b) Non-hunter rejoins → `pendingRevenge.hunterName` present, wait view restorable. (c) Admin rejoins → can force-skip. (d) Hunter rejoin AFTER resolution → no stale prompt (`pendingRevenge` absent).

**E11 — No-valid-target degenerate (engine).** Hunter dies when no other player is alive (e.g. mutual final deaths) → gate never opens; resolution proceeds directly to the win check.

**E12 — House-joker instant win suppresses the gate (engine).** House mode; joker lynched; joker's lover is the Hunter → cascade kills Hunter but `phase === "game_over"` / `winner === "joker"` already set → no gate, no revenge, joker win stands.

**E13 — Role secrecy until death (WS).** Before the Hunter dies, no message to any client reveals the hunter role (sweep `game_started`/`game_sync`/spectator payloads); after death, the reveal is in `hunter_revenge_pending` + narrator only.

### 10-player regression gate extension
Extend the standing gate (`tests/ten-player-regression.test.ts`, band 8600+, spawn-own-server pattern) with a **hunter game variant**: settings `2 mafia + doctor + detective + joker + hunter + lovers off` (10p ⇒ 4 citizens), adapt roles from `game_started`. Drive: night-1 mafia kill on the Hunter if dealt reachable (else lynch the Hunter on day 1 — the test adapts), assert the two-stage flow (deaths → `hunter_revenge_pending` → revenge → `phase_change`), assert role-secrecy invariants extended with E13, run to a natural win with the win check landing post-revenge. It must run inside `bun test` so every later task's full-suite gate includes a full hunter game. Keep it deterministic and bounded (same discipline as the existing 10-player test). New WS test files for the edge matrix use band **18600+** (one fresh band per file: 18600, 19600, …).

---

## 10. Content checklist

- **Pixel art** (`public/pixel-art.js`): one 10×10 grid `hunter` entry in `PIXEL_ART` (line 9; single variant — array-of-one or plain grid matching the doctor/detective/joker shape); use `const _ = null` transparency convention per CLAUDE.md. Plus a `BOW_ART` (or similar) 10×10 slide icon, exported on `window` (exports block at `pixel-art.js:360-374`). `ROLE_DESCRIPTIONS.hunter` (`344-350`): "You are the Hunter. If you die, you may take one player down with you." `ROLE_COLORS.hunter` (`352-358`) + matching CSS color classes in `public/app.css` (role-card pattern + `.slide-confirm.role-hunter_revenge .slide-fill` per the `role-joker_haunt` block at `app.css:892`).
- **README Role Roster row** (CLAUDE.md mandate — update on any role change). Add to the Special Roles table (`README.md:17-23`):

  ```
  | **Hunter** | Town | None — acts only on death | When the Hunter dies — by Mafia kill, day-vote execution, Joker haunt, or lover heartbreak — they are revealed and may immediately take one living player down with them. The shot cannot be blocked by the Doctor and resolves before the win check. Revenge is optional in both modes — the Hunter may decline (and the host may skip a stalled Hunter). |
  ```

- **index.html:** `enableHunter` settings toggle row (copy the joker toggle markup, minus the mode selector).
- **No audio assets. No narration.json keys. No mp3s.** (decision #9).
- **`APP_VERSION_STAGING` bump** (`public/app.js:3215`) happens ONCE at the end of Program C, per CLAUDE.md format `staging.{PATCH}_{YYYYMMDDHHmm}` PST.

## 11. Size estimate

~150–250 LOC + content on top of Program B's seams: engine ~50–70 (trigger lines in `notifyDeathTriggers`, `submitHunterRevenge`, reset-table lines, assignRoles block), server ~60–80 (two handlers, gate rejections, two-stage dawn restructure, timer slot, rejoin re-send, `buildGameSync` projection), client ~50–70 (dispatch case, gate-list entries, decline button, dead-overlay suppression, wait view, reset lines), types/narrator ~30, plus art grids and tests. The hardest pre-seam work (~100 LOC of `resolveVote`/win-check surgery) is already absorbed by P2/P5.
