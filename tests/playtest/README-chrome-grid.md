# Chrome Grid — multi-client real-browser playtest

`tests/playtest/chrome-grid.ts` opens **8–10 concurrent real Chromium tabs** (one
isolated Playwright browser *context* per seat → separate logins) against ONE
local Mafia server booted with a pinned role deal (`MAFIA_FIXED_DEAL`). Each tab
plays its seat by driving the **actual DOM**, and the grid takes **per-seat
screenshots** at key beats. It proves the per-seat *rendered* views under
simultaneous play — the thing the happy-dom WS harness (`harness.ts`, payload
assertions) structurally cannot show.

## Run

```bash
bun run chrome-grid                                   # both scenarios, headless
bun run tests/playtest/chrome-grid.ts --scenario full-night-10
bun run tests/playtest/chrome-grid.ts --scenario dawn-ambiguity-8 --headed
```

Exit code is non-zero if any assertion fails. Per-seat, per-assertion PASS/FAIL
lines print at the end, plus a failure summary.

Flags:
- `--scenario <name>` — run one scenario (default: all).
- `--headed` — show the browser windows (default: headless).

Env (debugging aids):
- `GRID_DEBUG=1` — mirror each tab's `console.warning`/`console.error` (e.g. the
  app's `wsSend dropped frame` warning, or `CONNECTION_REFUSED` when the server
  was killed out from under the run).
- `MAFIA_SERVER_LOG=1` — inherit the server subprocess's stdout/stderr so a
  server-side crash or the `slog` night-timer trace is visible.

## ⚠ RUN STANDALONE — never concurrently with `bun test`

Inherited from `proof-runner.ts`: a grid run spawns a server subprocess **and**
8–10 Chromium tabs. If a second suite (`bun test`, another grid, the proof
runner) runs at the same time, the many server subprocesses + tabs starve the
sockets and drop seats. **Worse**, the test suites `pkill -f src/server.ts`,
which kills *your* grid's server too — every tab then shows
`net::ERR_CONNECTION_REFUSED` mid-run. Symptom: assertions pass up to some
sub-phase, then a wall of connection-refused errors and a `waitFor` timeout.
Run the grid alone.

## Setup (one-time)

```bash
bun add -d playwright        # Bun-native — do NOT use npm
bunx playwright install chromium
```

`tests/playtest/screenshots/` is gitignored.

## Scenario catalogue

Scenarios live in the `SCENARIOS` map in `chrome-grid.ts`. Each defines:

| field | meaning |
|-------|---------|
| `roles` | fixed deal — `roles[i]` is dealt to **seat i** (join order) |
| `godfather` | join-order index of the mafioso to flag as Godfather (reads innocent) |
| `settings.mafiaCount` | mafia counter (grid clicks `#mafia-plus`) |
| `settings.toggles` | optional-role enable toggles to switch ON (`doctor`, `detective`, `vigilante`, `hunter`, `godfather`, `joker`, `lovers`) — **a disabled role's night sub-phase is skipped even if the role was dealt** |
| `seatLabels` | short label per seat for screenshot filenames (`0-mafia`, …) |
| `run(g)` | the scripted night + per-seat DOM assertions |

Two ship today:

- **full-night-10** — 10 seats `[mafia, mafia, doctor, detective, vigilante,
  hunter, citizen×4]`, Godfather on seat 0. One night: mafia **duo** locks a
  kill (real consensus UI), doctor saves someone else, detective investigates
  the Godfather (verdict at dawn = **INNOCENT**), vigilante holds fire → dawn.
- **dawn-ambiguity-8** — 8 seats `[mafia, vigilante, citizen×6]`. Mafia kills A,
  vigilante kills B → two deaths → the dawn verdict is **neutral and combined**
  ("Several didn't survive the night." — no victim named, no cause tag).

### Assertions the `GridRun` helper exposes

- `expectActorPanel(actors, role)` — the acting seats show `#night-actions`
  **and every other seat does not** (only the acting role sees targeting UI).
- `expectHidden(seats, why)` — a seat's panel is torn down (the night-action
  teardown: e.g. the doctor's panel must be hidden once the detective's
  sub-phase begins).
- `expectDawnVerdict(living, mustMatch?)` — every **living** seat reaches a
  cause-blind morning verdict (asserts the text is neutral — contains no
  `mafia`/`vigilante`/`shot`/`gun`/`hanged`/`executed`).
- `expectDetectiveVerdict(seat, targetSeat, re)` — the detective's private card
  (revealed **at dawn**) matches a regex.
- `mafiaKill(mafiaSeats, victimSeat)` — drives single **or** duo mafia consensus
  through the real vote cards.
- `chooseAndConfirm(seat, targetSeat)` / `vigilanteHoldFire(seat)` — generic
  target-pick → `#btn-action-confirm`, and the hold-fire button.
- `shot(seat, beat)` / `shotNonActors(actors, beat)` — screenshots into
  `screenshots/<scenario>/<label>-<beat>.png`.

### Authoring a new scenario

1. Add an entry to `SCENARIOS`. Pick `roles` (seat order = deal order), flip the
   `toggles` for every optional role you deal, set `mafiaCount`.
2. In `run(g)`, walk the night sub-phase order **mafia → doctor → detective →
   vigilante** (disabled roles are skipped entirely). For each active sub-phase:
   `waitPanel(actorSeat)`, `expectActorPanel([...])`, screenshot, drive the
   action, then assert the previous actor's panel is `expectHidden`.
3. At dawn, list the **living** seats (exclude anyone who died) and call
   `expectDawnVerdict`.

## Selector map (discovered from `public/index.html` + `public/app.js`)

| purpose | selector |
|---------|----------|
| register | `#auth-username`, `#auth-passcode`, `#btn-register` → `#screen-menu.active` |
| host game | `#btn-host` → `#screen-lobby-admin.active`; code in `#lobby-code` |
| join game | `#join-code` (always visible), `#btn-join` → `#screen-lobby-player.active` |
| lobby seat count (admin) | `#player-count-admin` (textContent = N) |
| mafia count | `#mafia-plus` / `#mafia-minus`, `#mafia-count` |
| role toggles | `#toggle-doctor`, `#toggle-detective`, `#toggle-vigilante`, `#toggle-hunter`, `#toggle-godfather`, `#toggle-joker`, `#toggle-lovers` |
| start game | `#btn-start` → all tabs `#screen-game.active` |
| open the night | `#btn-begin-night` (admin; the `narrator_ready` gate) |
| night action panel | `#night-actions` (hidden ⇒ not this seat's sub-phase) |
| generic targets (doctor/detective/vigilante) | `#action-targets li` (text = username) |
| confirm / cancel | `#btn-action-confirm` (verb per role), `#btn-action-cancel` |
| vigilante hold fire | `#btn-vigilante-pass` |
| mafia duo vote cards | `li.mafia-target-card` (by username) → `.mtc-btn-suggest` (Nominate), `.mtc-btn-lock:not(.mtc-btn-disabled)` (Lock In) → unanimous → `#btn-action-confirm` (Kill) |
| detective verdict card | `#detective-result` (populated at **dawn**) |
| dawn verdict beat | `#suspense-text` (transient) then `#narrator-messages` |
| phase pill | `#phase-indicator` |
| roles-in-play modal | `#btn-roster` → `#modal-roster` |

## Gotchas hit while building (feed the skill rewrite)

- **Username maxlength 16.** `#auth-username` truncates at 16 chars — long run
  ids made all 8–10 seats truncate to the *same* string and collide on register
  (menu never appears). Keep bot usernames short (`g<4charId>s<seat>`).
- **Register frame dropped before the socket opens.** `app.js` `wsSend` silently
  drops frames while the WebSocket isn't `OPEN` (it logs a `console.warning`).
  Click `#btn-register` in a retry loop until `#screen-menu.active` shows.
- **Custom toggles are off-viewport.** The real `<input type=checkbox>` sits
  under a styled slider and renders outside the viewport, so even a `force`
  click errors ("outside of the viewport"). Set `.checked = true` + dispatch a
  bubbling `change` event via `page.evaluate` — the `change` listener is what
  sends `update_settings`.
- **Wait for the panel before asserting "actor sees it".** After
  `#btn-begin-night`, `mafia_targets` renders a beat later. Assert the actor's
  `#night-actions` *after* `waitFor visible`, or you race the render and record
  a false "panel never appeared".
- **Detective verdict is revealed at DAWN, not on submit.** The server replies
  `night_action_done` ("Results will be revealed at dawn") and only sends
  `detective_result` during dawn resolution. Assert `#detective-result` *after*
  the dawn verdict, not right after the investigate.
- **Serialize joins.** Join seat-by-seat, waiting for `#player-count-admin` to
  reach i+1 before the next join, so the server's join order (= fixed-deal role
  index) is deterministic.
- **Sub-phases are server-timed (~1500 ms gaps), not audio-gated.** Advance is
  driven by server night-timers after each `night_action_done`; audio/narration
  does not gate it. Prefer waiting on DOM conditions with generous timeouts over
  fixed sleeps. Headless Chromium is launched with
  `--autoplay-policy=no-user-gesture-required`, but audio *audibility* itself is
  the one thing this grid cannot assert headless — only that the timing/visual
  gates behave. Fake sub-phases for *dead* enabled roles add a random 5–15 s
  delay; the shipped scenarios keep every enabled role alive to avoid it.
