# Design — Roster modal · Confirm/Cancel buttons · Mafia spare-reset fix

Date: 2026-06-30 · Branch: `staging` (production `main` untouched)

Three independent changes to the Mafia game, each driven by the verify→fix→verify
loop (TDD) against the existing test harnesses. No new role added (README role
tables unchanged).

---

## Task 3 (do first) — Bug: mafia "Spare"/objection persists across nights

### Root cause (confirmed in code, client-side only)
`public/app.js` keeps mafia night-vote state in module-level globals:
`mafiaObjectedTargets`, `myMafiaVotes`, `lastVoterTargets`, `aliveMafiaCount`
(decls at app.js:65–67, 2469). When a new mafia night begins, the server sends
`mafia_targets` → `showNightAction(…, "mafia_vote")` (app.js:447–448, 2349–2360),
which re-renders the vote cards via `renderMafiaTargetCards(list, players, {})`
**without resetting those globals.** `renderMafiaTargetCards` reads
`mafiaObjectedTargets` (app.js:2479) to mark a card "objected" → **Blocked**, and
a Blocked card only shows action buttons to the *original objector* (the
"Remove Objection" branch, app.js:2566–2577). So:
- (a) Last night's Spare still renders as Blocked the next night.
- (b) If the objector was lynched that day, the remaining mafia see a Blocked
  card with **no buttons** and cannot act on that target.

The **engine state is correct** — `NIGHT_RESETS` clears `mafiaVotes`/`mafiaTarget`
on every `beginNight` (game-engine.ts:113–114), verified by the bug-map agent and
the engine's compile-time reset-coverage guards. This is purely stale client UI
state.

### Fix
In `showNightAction`, in the `actionType === "mafia_vote"` branch (the start of a
fresh mafia night), reset the stale globals before rendering:
```js
mafiaObjectedTargets = {};
myMafiaVotes = [];
lastVoterTargets = {};
aliveMafiaCount = 0; // refreshed by the first mafia_vote_update of the night
```
Minimal, root-cause, no wire/engine change.

### Tests (verify→fix→verify)
- **Primary repro — client-harness** (`tests/helpers/client-harness.ts`), new file
  `tests/mafia-spare-reset.test.ts`: multi-mafia client (`mafiaTeam` len ≥ 2).
  Night 1: `mafia_vote_update` with `objectedTargets:{4:["Vito"]}` (Carol spared).
  Then `phase_change` day → `phase_change` night → `mafia_targets` (night 2).
  Assert: card `data-id="4"` is NOT `.objected`, has no "Blocked" label, and shows
  the Nominate + Spare buttons. **Fails before the fix, passes after.**
- **Regression — WS playtest** (`tests/playtest/`, the multiplayer harness): 2 mafia
  + filler. Night 1 mafia A Spares T (letsnot); day 1 lynch A; night 2 remaining
  mafia B locks + confirms a kill on T → T dies. Proves engine freshness
  end-to-end (guards the server side; expected green already).

---

## Task 2 — Replace slide-to-confirm with Confirm / Cancel buttons

One shared singleton `#slide-confirm` (index.html:280–288) drives every night
action via two call sites; payloads are unchanged. Replace with a two-button group.

### HTML (`public/index.html`)
Replace the `#slide-confirm` block with:
```html
<div id="action-confirm" class="action-confirm hidden">
  <button id="btn-action-cancel" class="ac-btn ac-cancel">Cancel</button>
  <button id="btn-action-confirm" class="ac-btn ac-confirm">Confirm</button>
</div>
```

### JS (`public/app.js`)
- Keep the function names/signatures so call sites stay agnostic:
  - `setupSlideConfirm(role, onConfirm, onCancel?)` → shows `#action-confirm`,
    sets `role-${role}` for theming, sets the confirm label per role
    (KILL / SAVE / INVESTIGATE / SHOOT / HAUNT / AVENGE), wires
    confirm→`onConfirm()`+hide, cancel→`onCancel?.()`+hide.
  - `hideSlideConfirm()` → hides `#action-confirm`, clears callbacks.
- Delete the drag IIFE (app.js:1504–1595) and `__testFireSlideConfirm`
  (1496–1501). Update existing tests that reference `#slide-confirm`/the slider.
- Call-site behavior:
  - **Solo actions** (`showNightAction`, app.js:2381 — doctor/detective/vigilante/
    joker/hunter): Confirm sends `{type:actionType, targetId}` (unchanged);
    `onCancel` clears the selection highlight + hides the buttons so the player
    can re-pick.
  - **Mafia kill** (`handleMafiaConfirmReady`, app.js:2948): Confirm sends
    `confirm_mafia_kill` (unchanged); `onCancel` withdraws the lock —
    `wsSend({type:"mafia_vote", targetId: msg.targetId, voteType:"lock"})` (toggle
    off) — which breaks consensus and reopens the vote cards via the server echo.
- The existing companion buttons `#btn-decline-revenge` (hunter pass) and
  `#btn-vigilante-pass` (hold fire) stay as-is; they appear before a target is
  chosen, Confirm/Cancel appear after — no conflict.

### CSS (`public/app.css`)
Replace the SLIDE-TO-CONFIRM block (app.css:1567–1713, plus the joker/hunter fills
1924–1933) with `.action-confirm` flex layout + `.ac-btn` styles; reuse the
per-role `--role-*` tint for the confirm button so each action keeps its color.

### Tests (client-harness)
- For each action type: render the prompt, select a target, click Confirm → assert
  the exact wire frame; click Cancel → assert no action frame + selection cleared.
- Mafia: reach consensus (`mafia_confirm_ready`), click Confirm → `confirm_mafia_kill`;
  click Cancel → an unlock `mafia_vote` frame is sent.
- Port/replace the existing slider assertions in `tests/client-app.test.ts`
  (rejoin-confirm test) and any `client-gates`/overlay references.

---

## Task 1 — "Roles in Play" dismissible modal (text names + counts, no icons)

A popup modal, openable any time during the game from a header button, dismissed
by ✕ or backdrop tap. Compact rows: role name (role-colored) + count badge `×N`.
No sprites.

### Server (`src/server.ts`, `src/game-engine.ts`, `src/types.ts`)
Settings/roster currently reach clients only via the lobby `lobby_update`; neither
`game_started` nor `game_sync` carries it. Add an authoritative public roster:
- New engine helper `rosterSummary(game)` → counts the actual assigned players by
  role (`mafia` incl. godfather, `citizen`, and each enabled special = 1), plus
  boolean modifier flags `godfather`/`lovers` when present. Counts are public
  knowledge (the lobby already lists the lineup), so no information leak.
- Include `roster` in the `game_started` payload (server.ts ~1252) and the
  `game_sync` payload (server.ts ~828) so fresh-start AND rejoining clients render
  it. Add the field to the matching message types in `src/types.ts`.

### Client (`public/app.js`, `public/index.html`, `public/app.css`)
- Cache `roster` from `game_started`/`game_sync` into a module var.
- Add a roster button to `.game-header` (index.html:194–201), next to the gear.
- Add `#modal-roster` (sibling of the other `.modal`s) with a `.modal-content`,
  header "Roles in Play" + ✕, and a list container. Dismiss on ✕ and backdrop.
- Render rows from the cached roster: uppercased role name colored with
  `var(--role-<role>)`, a `×N` count badge; append a small "+ Godfather / + Lovers"
  modifier line when those flags are set.

### Tests (client-harness)
- `game_started` with a `roster` → click the header button → modal visible with the
  expected name/count rows; click ✕ → hidden; backdrop click → hidden.
- `game_sync` (rejoin) with a `roster` → modal renders the same.
- Engine unit test for `rosterSummary` count derivation across a couple of lineups.

---

## Sequencing & process
1. Task 3 bug (smallest, most important) — client-harness repro + WS regression.
2. Task 2 confirm/cancel — replace slider, migrate slider tests, add behavior tests.
3. Task 1 roster — server roster field + client modal + tests.

Each task: write the failing test first, delegate/implement the fix, get green,
keep looping until the full relevant suite passes. Bump `APP_VERSION_STAGING`
(PATCH + fresh PST timestamp) before pushing. Production `main` untouched.

### Risks / watch-items
- Removing the slider breaks tests asserting `#slide-confirm`/`__testFireSlideConfirm`
  — migrate them as part of Task 2.
- Adding `roster` to `game_started`/`game_sync` may trip strict-equality assertions
  in rejoin/sync tests — additive, update as needed.
- Run playtest/client files individually; avoid back-to-back full suites (WS socket
  exhaustion flakes per the harness notes).
