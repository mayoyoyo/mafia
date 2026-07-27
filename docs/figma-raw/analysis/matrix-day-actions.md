# Figma ↔ App Coverage Matrix — DAY ACTIONS (19 frames)

**Scope:** every frame in `docs/figma-raw/specs/day-actions/` (19 files), compared against the app
at `staging@0098577` (player-initiated accusations + required second + sleep proposal — the newest
day code in the repo).

**Sources (every claim below cites one):**
- Figma frame specs — `docs/figma-raw/specs/day-actions/*.md` (all 19)
- Figma wiring — `docs/figma-raw/rest/wiring.md`
- Overview PNG — `docs/figma-raw/screenshots/day-actions--overview.png` (0.92×)
- App code — `public/index.html`, `public/app.js`, `public/app.css`, `src/server.ts`,
  `src/game-engine.ts`, `src/narrator.ts` (engine/narrator/server read-only reference)

**Labels:** *verified* = read from a cited source. **INFERRED** = my reading, not stated by a source.

---

## 0. Frame index + verdict summary

| # | Figma frame | id | App equivalent | Flow delta |
| --- | --- | --- | --- | --- |
| 1 | Main screen | `270:1471` | `#screen-game` day phase (`index.html:193-346`) | **BIG** |
| 2 | Voting | `270:1649` | `#voting-panel` (`index.html:323-332`) | **BIG** |
| 3 | Execute | `270:1741` | post-vote `#voting-panel` state (`app.js:3154-3162`) | SMALL |
| 4 | Spare | `270:1801` | same as #3 | SMALL |
| 5 | End Day | `271:1932` | `showConfirmSheet` (`app.js:3112-3126`) | SMALL |
| 6 | Revealed as Mafia | `140:1315` | `#detective-result` (`app.js:2095-2116`) | SMALL |
| 7 | Revealed as clear | `143:1463` | `#detective-result` (`app.js:2095-2116`) | SMALL |
| 8 | Detective player tab | `261:2092` | `#eh-panel-players` (`app.js:2210-2247`) | SMALL |
| 9 | Detective events tab | `261:2135` | `#eh-panel-events` (`app.js:2137-2208`) | SMALL |
| 10 | Death by mafia | `270:1212` | `#dead-overlay` (`index.html:386-397`) | **BIG** (copy leaks cause) |
| 11 | Death notification (SURVIVE) | `270:1237` | dawn verdict beat (`app.js:2015`, `2048-2057`) | SMALL |
| 12 | Narrator prompt (night death) | `270:1294` | `#narrator-messages` (`app.js:2124-2132`) | SMALL |
| 13 | Doctor saved a life | `268:955` | dawn verdict beat (`app.js:2014`) | SMALL |
| 14 | Narrator prompt (doctor save) | `270:1067` | `#narrator-messages` | SMALL (copy = exact match) |
| 15 | Player's death / Town | `264:2425` | `#dead-overlay` | SMALL |
| 16 | Death notification (EXECUTED) | `264:2485` | `showExecutionTransition` (`app.js:1844-1883`) | SMALL |
| 17 | Death by heartbreak | `265:2524` | `#dead-overlay` + `HEARTBREAK_ART` (`app.js:614`) | SMALL |
| 18 | Death notification (HEARTBREAK) | `270:1197` | `showHeartbreakTransition` (`app.js:1888-1915`) | SMALL |
| 19 | Player's death / Hunter | `264:2513` | `#dead-overlay` | SMALL |

**Counts:** 19 frames. 19 have an app equivalent; **0 are NO APP EQUIVALENT**. 3 flow deltas are
**BIG** (#1, #2, #10). 5 app day states have **no Figma frame** (§5).

---

## 0b. Shared chrome deltas (apply to frames #1–#9, the 9 "in-game" frames)

Every in-game frame repeats the same four shells. Recorded once here; per-frame sections below
only note *deviations* from this baseline.

### Nav bar
- **Figma** (`270:1471:14-43`): `Day ☀️` │ `Round 4` on the left; on the right
  `Code` (Helvetica Neue 14px, 50% opacity) + `E92G` (Grandstander 18px, `#FF6C02`), a 24×24
  book/roster icon, and a `Settings` instance (`42:808`).
- **App** (`index.html:194-202`): `#phase-indicator` renders `pixelArtToSvg(SUN_ART) + " DAY"`
  (`app.js:746-747`), `#round-indicator` renders `Round <span id="round-number">`, then
  `.game-header-right` = `#day-timer`, `#btn-roster` (`&#9776;`), `#btn-settings` (`&#9881;`).
- **Deltas:**
  - App has **no room code** anywhere on the in-game header. Figma shows `Code E92G` on every
    day frame. → new element required.
  - App has a **day timer** (`#day-timer`, `app.js:1622-1641`, `startDayTimer`). Figma has **no
    timer slot** in the nav. → design gap.
  - Copy: Figma `Day ☀️` / `Voting 🗳️` / `Night 🌙` (emoji). App: `DAY` / uppercase phase name +
    pixel SVG sun/moon. App never renders a `VOTING` header on the wire — `handleVoteCalled` only
    sets `document.body[data-phase="voting"]` (`app.js:3136`); the visible phase text stays `DAY`
    because the server broadcasts `vote_called` over a day phase (`app.js:3131-3135` comment).
    Figma's `Voting 🗳️` nav on `270:1649`/`270:1741`/`270:1801` therefore has **no app source**.
  - Figma separates `Day` and `Round 4` with a 1px white `LINE "Line 5"`; app uses two flex blocks.

### Membership Card
- **Figma** (`270:1471:44-67`): 357×222, `radius=16`, `GRADIENT_LINEAR #000000 → #B5C9E3`,
  2px white stroke, drop shadow r23.8 / 0,4 / #000 @20%. Contents: `Your role is` (16px) /
  `?` (Grandstander-Black 48px) / `Peel to reveal` (24px) + a 28×28 peel corner
  (`Rectangle 1` + `Rectangle 2` vector, `#B5C9E3`, 2px white stroke).
  Detective variant (`88:1051`, frames #6–#9): gradient `#000000 → #F9F9B4`, `Detective`
  (48px Black), `Investigate players to find the hiding mafia` (12px), 78×78 role art.
- **App** (`index.html:210-241`): `#role-card > .card-inner > .card-front | .card-back |
  .peel-flap`. Front holds `#role-image`, `#role-name`, `#role-description`, `#lover-badge`,
  `#bullet-indicator`, `#role-icon-mini`, `#role-mini-balloon`. Back holds `#card-back-art` +
  `.card-back-label` = `MEMBERSHIP CARD`.
- **Deltas:** app front has **four extra affordances Figma never draws** — lover badge, vigilante
  bullet indicator, role-icon-mini, and the lover mini-balloon. Figma's un-peeled face copy is
  `Your role is` / `?` / `Peel to reveal`; app's back label is `MEMBERSHIP CARD` with no
  "Peel to reveal" string anywhere (`grep` finds none). Colour system differs entirely: Figma uses
  per-role linear gradients, app uses pixel-art + CSS role classes.

### Narrator line
- **Figma:** a bare `TEXT` node in Grandstander-Italic 18px, `#FFFFFF`, directly under the card
  (e.g. `270:1471:68-71`). No label, no chrome, no history control.
- **App** (`index.html:244-250`): `#narrator-area` = `.narrator-header` (`Narrator` label +
  `#btn-transcript`) + `#narrator-messages`. Only the **latest** line renders
  (`showNarratorMessage` clears the container first, `app.js:2126-2131`).
- **Delta:** Figma drops the `Narrator` label and the transcript button. The transcript modal
  (`app.js:3229-3246`) has no Figma frame in this section.

### Game Tabs (Events / Players)
- **Figma** (`270:1471:124-179`): `Game Tabs` instance (`287:3436` "Position=Events"), 358×254,
  `#232729` fill, 2px white stroke, `pad=16`, `radius=16`. Inner `Tabs` instance (`185:1612`
  "Toggle=Left") — active tab pill is `#FF6C02`, labels `Events` / `Players` (14px). Rows are
  `Round N` + one or more event strings, separated by 1px white `Divider` lines. A transparent
  `tab-hotspot-players` rect (163×30) is the click target.
- **App** (`index.html:334-346`): `#event-history` = `.eh-tabs` (two `.eh-tab` buttons,
  `data-tab="events"` / `"players"`) + `#eh-panel-events > #event-history-list` +
  `#eh-panel-players > #player-status-list`. Rendered by `renderEventHistory` (`app.js:2137-2208`)
  and `updatePlayerStatus` (`app.js:2210-2247`); shown unconditionally during a game
  (`app.js:920`).
- **Copy deltas (verified):**

  | Figma string | App string | Source |
  | --- | --- | --- |
  | `jenny - died in the night` | `jenny — Died in the night` | `app.js:2152-2153`, `2202` |
  | `mo - saved by doctor` | `mo — Saved by Doctor` | `app.js:2154` |
  | `dale - shot by vigilante` | `dale — Died in the night` | `app.js:2160` |
  | `mo - investigated as CLEAR` | `mo — Investigated — Clear` | `app.js:2162` |
  | `jenny - investigated as MAFIA` | `jenny — Investigated — MAFIA` | `app.js:2161` |

  Separator differs (` - ` vs ` — `), and app labels are Title Case.
- **PRIVACY — BIG:** Figma's `dale - shot by vigilante` row (present on **10 of the 19 frames**:
  `270:1471`, `270:1649`, `270:1741`, `270:1801`, `271:1932`, `270:1067`, `270:1294`, `140:1315`,
  `143:1463`) directly contradicts the app's deliberate cause-neutralisation. `app.js:2144-2163`
  states the reason in a comment and maps `vigilante_shot`, `joker_haunt`, `kill` and `death` all
  to the single label `"Died in the night"`; `NIGHT_DEATH_CLASS` (`app.js:2171`) additionally
  collapses the CSS class so the class attribute can't out the cause. Rendering the Figma copy
  would re-open the exact leak that was closed. `lover_death` is the one deliberate exception
  ("Died of heartbreak", public by owner ruling — `app.js:2156`, `2168-2170`).

---

## 1. `270:1471` — Main screen (day, admin) — **BIG**

**App state:** `phase === "day"`, viewer is admin.
**DOM anchor:** `#admin-day-controls` (`index.html:288-299`), shown by `showAdminDayControls`
(`app.js:2963-2978`), populated by `populateAdminTargets` (`app.js:2980-2994`), wired at
`app.js:790-793` (game_sync) and `app.js:1762-1767` (phase_change).

**Visual deltas**
- Figma names the admin block `Lobby rules` (`270:1471:72`) — 358×452, `#232729`, 2px white
  stroke, `radius=16`, `pad=16`, drop shadow. App uses `.admin-controls` styling.
- Figma header row `Frame 8` (326×30, `pad=8/0/8/0`, 1px white bottom stroke) holds `Admin
  Controls`. App: `<h3>Admin Controls <span id="vote-count-label">…</span></h3>`
  (`index.html:290`).
- Figma player rows: `FRAME "CTA"` 326×60, `#000000` fill, `radius=16`, `pad=16`, 14px label,
  drop shadow. App: plain `<li data-id>` in `#admin-target-list` (`app.js:2984`).
- Figma places the **`End day` CTA as the 5th row inside the `Players` stack**, `#FF6C02` fill.
  App puts `#btn-end-day` in a separate `.admin-buttons` div *after* the list
  (`index.html:296-298`).
- Figma renders a hidden `Drawer` (390×178, `opacity=0%`, `270:1471:180-205`) — the End-Day
  confirm sheet in its closed state. App's equivalent (`#confirm-sheet`) is a shared component,
  not a per-screen child.
- Figma has **no** `#vote-count-label` and **no** `#admin-status-msg` (`index.html:290-291`).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `Admin Controls` | `Admin Controls` ✓ | `index.html:290` |
| `Nominate a player for execution` | `Nominate a player for execution:` (trailing colon) | `index.html:293` |
| `End day` | `End Day` | `index.html:297` |
| `Dawn breaks. The town wakes to find mo dead in the square.` | **no such string in the app** | `narrator.ts:179-183` (`DAY_BREAKS_MESSAGES`) and `221-226` (`NIGHT_DEATH_SINGLE`) are the real dawn lines |
| — | `Vote #N done` / `Vote failed. Nominate another player or end the day.` | `app.js:2971-2972` |

The Figma dawn line is a **fabricated** narrator sentence. The app's three dawn openers are
`"Grey light comes up over the rooftops…"`, `"Morning. The fog thins…"`, `"The sun comes up cold…"`
(`narrator.ts:180-182`), and the death line is a separate `nightDeaths()` sentence
(`narrator.ts:242-247`). Also note the Figma line names the victim *and* implies a body in the
square, which is fine (names are public) but the phrasing is not app copy.

**Flow deltas — BIG**
- Figma wiring: `270:1634 CTA → 270:1649 Voting` (`wiring.md:36`, `137-138`) and
  `270:1646 CTA → 271:1932 End Day` (`wiring.md:40`, `139-140`). So the **only** way to open a
  ballot in Figma is the admin tapping a player row. That is `call_vote`
  (`app.js:2991`, `server.ts:1602-1617`, `game-engine.ts:1687-1698`).
- The app's *primary* day flow since `0098577` is **player-initiated**:
  `accuse` → `second_accusation` → auto-`vote_called` (`game-engine.ts:1729-1786`,
  `server.ts:1554-1586`). `call_vote` still exists but is now the admin's secondary path.
  Figma models **none** of: the accuse launcher, the accuse picker, the pending-accusation list,
  the Second button, the Withdraw button, the sleep proposal, or the per-day
  "already accused / already seconded" lockouts.
- Figma also shows the admin block on a frame where the accusation panel would be
  simultaneously visible (`#day-accuse-controls`, `index.html:301-315`, shown for **all** living
  players including the admin via `renderAccusePanel`, `app.js:3012-3031`). Figma has no room
  for it.

**e2e playtest recommendation (BIG):** `tests/playtest/` — `day-accusation-flow.test.ts`.
Assert, over the real WS harness with a pinned deal:
1. On `phase:"day"`, every living client receives an `accusations_update` shape with
   `accusations: []`, `accusationsMade: []`, `secondsMade: []` (`server.ts:112-115`).
2. Client A sends `{type:"accuse", targetId: B}` → all clients get `accusations_update` with one
   pending accusation whose `accuserName`/`targetName` are populated, plus a narrator line drawn
   from `ACCUSATION_MADE_MESSAGES` (`narrator.ts:129-134`), and **no** `vote_called`.
3. Client B (the accused) sending `second_accusation` is rejected (`error:"accused_cannot_second"`,
   `game-engine.ts:1778`) — no `vote_called` on the wire.
4. Client C seconds → exactly one `vote_called` with `targetName === B`, and `accusations` is now
   empty (`game-engine.ts:1782`).
5. Admin `call_vote` on a *different* player during `day` also produces `vote_called`
   (both paths coexist).

---

## 2. `270:1649` — Voting — **BIG**

**App state:** engine `phase === "voting"`; on the wire it arrives as `vote_called` over a day
phase (`app.js:3131-3135`).
**DOM anchor:** `#voting-panel` (`index.html:323-332`); driven by `handleVoteCalled`
(`app.js:3128-3170`) and `updateVoteProgress` (`app.js:3196-3198`).

**Visual deltas**
- Figma: 78×78 target portrait (`image 1`, `270:1649:74-75`) above a 24px `Execute natasha?`
  headline. App: `<h3 id="voting-title">Vote: Execute <span id="vote-target-name"></span>?</h3>`
  (`index.html:325`) with **no portrait**.
- Figma vote CTAs: two 173×100 buttons, `#66BB6A` (up) and `#E53935` (down), each holding a 32×32
  `Thumbs` instance from an image fill. App: `#btn-vote-yes` / `#btn-vote-no` filled with
  `pixelArtToSvg(THUMB_UP_ART)` / `THUMB_DOWN_ART` (`app.js:4322-4323`) — pixel art, not the
  Figma emoji PNGs (`b7bdd4e3…`, `6d85ad43…`).
- Figma `Cancel vote` CTA: 358×60, `#232729`. App `#btn-cancel-vote` uses `.btn-danger.btn-small`
  (`index.html:331`).
- Figma renders `2/4 votes cast`; app renders `2 / 4 votes cast` (spaces around the slash,
  `app.js:3197`).
- Figma keeps the Membership Card + Game Tabs on screen during the ballot — app does too
  (only `#admin-day-controls` and `#day-accuse-controls` are hidden, `app.js:3142-3144`).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `A vote has been called.` | no such string; the narrator line at this moment is an accusation-seconded line (`ACCUSATION_SECONDED_MESSAGES`, `narrator.ts:143-148`) or nothing at all for admin `call_vote` | `server.ts:1583`, `1602-1617` |
| `Execute natasha?` | `Vote: Execute natasha?` | `index.html:325` |
| `2/4 votes cast` | `2 / 4 votes cast` | `app.js:3197` |
| `Cancel vote` | `Cancel Vote` | `index.html:331` |

**Flow deltas — BIG**
- Figma wiring: `270:1736 CTA → 270:1741 Execute` and `270:1738 CTA → 270:1801 Spare`
  (`wiring.md:38-39`, `141-144`); `271:1862 CTA → 270:1471 Main screen` (`wiring.md:37`,
  `145-146`) is the Cancel-vote return.
  The overview PNG annotates "Cancel button only visible for admin", which the app honours
  (`app.js:3165-3169`).
- **Sleep ballot has no Figma frame.** When the ballot is a "town considers sleeping" vote
  (`sleepVote`), the app replaces the headline entirely:
  `"The town considers sleeping. Turn in for the night?"` (`app.js:3147`), the wire carries
  `targetName: ""`, `targetId: 0`, `sleep: true` (`server.ts:124-125`), and resolution runs
  `resolveSleepVote` (`game-engine.ts:1843-1871`) — pass ⇒ night with **no execution**,
  fail ⇒ back to day with pending accusations intact. Figma models neither the sleep ballot nor
  either outcome.
- **Vote reveal:** Figma shows `2/4 votes cast` *while the buttons are still live* — i.e. a
  running tally is public. App matches: `vote_progress` is broadcast to everyone. But note the
  app hides the **buttons** (not the tally) once you have voted (`app.js:3154-3156`), and the
  ballot itself is secret (only counts, never who voted). Figma is consistent with that.
- **Resolution trigger:** the app resolves when every living player has voted
  (`castVote` → `allVoted`, `game-engine.ts:1818-1821`) or on admin cancel
  (`game-engine.ts:1987-1996`). Figma has no waiting/idle state between "you voted" and the
  result; `Execute` / `Spare` are reached instantly from the thumb tap.

**e2e playtest recommendation (BIG):** `tests/playtest/day-sleep-ballot.test.ts`.
Assert: (a) `accuse` with `targetId: null` produces a `SLEEP_PROPOSED_MESSAGES` narrator line
(`narrator.ts:136-141`) and a pending accusation with `targetId === null`; (b) a second opens
`vote_called {sleep:true, targetName:"", targetId:0}`; (c) majority-yes drives `phase:"night"`
with **zero** `you_died` messages and a `SLEEP_PASSED_MESSAGES` line (`narrator.ts:167-171`);
(d) majority-no returns `phase:"day"` with `accusations` **still populated** — proving
`clearAccusations` did not run (`game-engine.ts:238-249`, `1863-1868`).

---

## 3. `270:1741` — Execute (post-vote, "you decide to execute") — SMALL

**App state:** `phase === "voting"`, `hasVoted === true` for this client.
**DOM anchor:** `#voting-panel` with `#vote-buttons-wrapper` hidden (`app.js:3154-3156`);
the click handler sets `hasVoted`, `.selected` and disables both buttons (`app.js:3172-3180`).

**Visual deltas**
- Figma dims the whole target block: portrait `opacity=30%`, headline `opacity=60%`, tally
  `opacity=60%` (`270:1741:74-83`) and **removes the two vote CTAs and the Cancel-vote CTA**
  from the layout entirely.
- App instead adds `.selected` to the pressed button and `disabled` to both, then hides the whole
  wrapper (`app.js:3155`, `3176-3178`). The admin's `#btn-cancel-vote` **stays visible** after
  voting (`app.js:3165-3166` runs before any vote is cast and is never re-hidden) — Figma removes
  it. → app-vs-Figma divergence for the admin's post-vote view.
- No app equivalent for the "greyed-out ghost of your choice" treatment. Nothing renders *which
  way you voted* after the fact.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `You decide to execute.` | **no such string** | grep: absent from `app.js` / `narrator.ts` |
| `3/4 votes cast` | `3 / 4 votes cast` | `app.js:3197` |

**Flow deltas — SMALL.** Figma dead-ends here (frame `270:1741` has no outbound wiring other than
the tab hotspots, `270-1741--execute.md:145-153`). The app continues to the resolution beat
(`handleVoteResult`, `app.js:3200-3224` → `showExecutionTransition`, `app.js:1844-1883`), which
is Figma frame #16. The missing link is a design gap, not a behaviour conflict.

---

## 4. `270:1801` — Spare — SMALL

Identical structure to #3 (`270-1801--spare.md` differs only in the italic line).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `You decide to spare.` | **no such string** | absent |
| `Execute natasha?` (still shown, 60% opacity) | same headline persists | `index.html:325` |

**Flow deltas — SMALL, but one real bug surfaced.** The app's own post-resolution "spared" beat
reads `"The vote was abstained."` (`app.js:1853`) for **every** non-executed vote — including a
genuine spare. The engine's spared narration is `EXECUTION_SPARED_MESSAGES`
(`narrator.ts:58-63`, e.g. `"The vote falls short. {name} walks free…"`) and
`handleVoteResult` separately narrates `"{name} has been spared."` (`app.js:3222`). So the app
shows two contradictory strings for one outcome; Figma's `You decide to spare.` matches neither.
**Flagged, not fixed** (scope fence).

---

## 5. `271:1932` — End Day (confirm drawer open) — SMALL

**App state:** admin taps `#btn-end-day`.
**DOM anchor:** `#confirm-sheet` via `showConfirmSheet` (`app.js:3112-3126`); Cancel button is
`#confirm-sheet-cancel` (`index.html:493`).

**Visual deltas**
- Figma: a 390×178 bottom `Drawer` (`#232729`, `radius=16`, `pad=16`, `gap=24`) over a full-frame
  `Rectangle 2` scrim (390×844, `#000000` @ 30%) (`271:1932:180-207`). App uses the shared
  confirm sheet component.
- Figma's two CTAs are 173×60 side by side — confirm `#FF6C02`, cancel `#000000`. App's confirm
  sheet uses `.btn` / `.btn-secondary` inside `.btn-pxb.pxc` wrappers.

**Copy deltas — near-exact match**

| Figma | App | Source |
| --- | --- | --- |
| `End Day` (title) | `End Day` ✓ | `app.js:3113` |
| `End the day and transition to night?` | `End the day and transition to night?` ✓ | `app.js:3115` |
| `End the day` (confirm CTA) | `End Day` | `app.js:3116` |
| `Cancel` | `Cancel` ✓ | `index.html:493` |

**Flow deltas — SMALL.** Figma wiring `271:2220 CTA → 270:1471 Main screen` (`wiring.md:41`,
`147-148`) — i.e. Cancel returns to the day screen. Confirm has **no** wiring (dead end); in the
app confirm sends `{type:"end_day"}` → `endDay` → `beginNight` (`game-engine.ts:2012-2018`),
which also runs `clearAccusations` (`game-engine.ts:256-257` comment, `238-249`) and drives the
night transition. Note the app also runs `ensureAudioReady()` inside this click handler as a
deliberate gesture-chain requirement (`app.js:3118-3119`) — any re-skin must keep confirm a
**direct** click handler, not a deferred/animated callback.

---

## 6. `140:1315` — Revealed as Mafia — SMALL (privacy: OK, with caveats)

**App state:** viewer is the detective; `detective_result` arrived.
**DOM anchor:** `#detective-result` (`index.html:271`), written by `showDetectiveResult`
(`app.js:2095-2116`), cleared by `clearDetectiveResult` at night entry (`app.js:1787`, `2118-2122`).

**Visual deltas**
- Figma: a `Players` frame containing one 326×70 `CTA` (`#232729`, `radius=16`, `pad=16`,
  `gap=8`) with a 34×34 role thumbnail on the left and the reveal text on the right
  (`140:1315:66-76`).
- App: a single inline element `#detective-result` whose innerHTML is
  `pixelArtToSvg(MAGNIFIER_ART) + " " + htmlText` (`app.js:2098`, `2108`) — a **magnifier** glyph,
  not the detective role art (Figma reuses `469ed27d…`, the same asset as the Membership Card).
- Figma places the reveal card **between** the narrator line and the Game Tabs. App places
  `#detective-result` above `#night-actions` (`index.html:271-274`) — ordering delta.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `Your investigation reveals jenny IS a member of the mafia` | `Your investigation reveals: jenny IS a member of the Mafia!` | `app.js:2100`, `2106` |

Differences: missing colon, lowercase `mafia`, no exclamation mark in Figma.

**Flow deltas — SMALL.** Figma has no outbound wiring for this frame beyond tab hotspots.
The app's lifecycle: sent privately at **dawn** (not during the night) —
`server.ts:2065-2076` (normal resolution) and `server.ts:1805-1816` (force-dawn path), both via
`sendToUser` to `role === "detective"` players only. Persists through the whole day, cleared on
the next `phase:"night"` (`app.js:1787`).

**PRIVACY IMPLICATIONS**
1. *Wire-level: clean.* `detective_result` is `sendToUser`-scoped, never broadcast
   (`server.ts:2066-2074`). Investigations are **never** written to `game.eventHistory` — the
   detective's history is a client-side array (`detectiveHistory`, `app.js:697`, `2111-2115`)
   merged into the events list only when `myRole === "detective"` (`app.js:2175`, `2223`).
2. *Screen-level: the risk Figma amplifies.* Figma renders the reveal as a **large persistent
   card in the main scroll flow**, at a fixed position on a shared-device phone screen, for the
   entire day. The app has the same exposure but in a lower-visual-weight strip. If the re-skin
   adopts the Figma card, it increases shoulder-surf leakage in a pass-the-phone game.
   → **Decision needed** (§6.4).
3. *Dead detectives still receive the result* — `allDetectives` is not filtered by `isAlive`
   ("even if detective died this night", `server.ts:2065`). That is intentional and unchanged by
   the re-skin, but the Figma frames only depict a living detective.
4. Figma frame header reads `Day ☀️` here (correct — the reveal lands at dawn) but the two
   detective *tab* frames (#8, #9) read `Night 🌙` while sitting in the Day Actions section.
   INFERRED: a Figma authoring slip, not a spec statement.

---

## 7. `143:1463` — Revealed as clear — SMALL

Identical to #6 except the sentence.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `Your investigation reveals jenny NOT a member of the mafia` | `Your investigation reveals: jenny is NOT a member of the Mafia.` | `app.js:2101`, `2107` |

The Figma string is **ungrammatical** (missing the verb `is`). Must not be shipped verbatim.

**Visual delta:** Figma uses the *same* `#232729` card and the *same* detective thumbnail for both
clear and mafia — no colour differentiation (contrast `#66BB6A`/`#E53935` used elsewhere in the
system). App likewise has no colour distinction on `#detective-result`. Consistent, but note the
Players tab **does** differentiate (thumbs up/down, #8 below).

**Flow deltas — SMALL.** Same as #6.

---

## 8. `261:2092` — Detective player tab — SMALL

**App state:** any phase, `#event-history` Players tab selected; detective-specific decorations.
**DOM anchor:** `#eh-panel-players > #player-status-list` (`index.html:343-345`), rendered by
`updatePlayerStatus` (`app.js:2210-2247`).

**Visual deltas — this is the closest 1:1 in the whole section.**
- Figma row = name text + optional 14×14 `Thumbs` instance + a 14×14 `ELLIPSE` colour dot on the
  right (`261:2092:82-135`). Dead rows carry `opacity=30%` (`dale`, `natasha`).
- App row = `.player-status-dot` (inline `background:${p.color}` **only when alive**,
  `app.js:2232`) + `.player-status-name` + optional mafia/godfather tag + optional
  `.detective-tag` holding `pixelArtToSvg(THUMB_DOWN_ART)` or `THUMB_UP_ART`
  (`app.js:2243`).
- **Order delta:** Figma's dot is on the **right**, name on the left. App puts the dot **first**
  (`app.js:2240-2241`).
- **Sort delta:** app sorts dead-first by `deathOrder` (`app.js:2213-2219`). Figma's sample order
  is `dale`(dead) `mo` `jenny` `kevin` `natasha`(dead) `christopher` — dead players interleaved.
- Figma has **no** `MAFIA` / `👑 GODFATHER` tag (`app.js:2242`), which the app shows to mafia
  members. Design gap.
- Figma tab pill: active = `#FF6C02` on the `House`/Players side (`261:2092:70-81`).

**Copy deltas:** tab labels `Events` / `Players` match `index.html:337-338` exactly.

**Flow deltas — SMALL.** Figma wiring `I332:5581;185:1615 Official → 332:5464` (`wiring.md:398-399`)
= tap "Events" to switch. App uses `.eh-tab` click handlers (`app.js:2249`+). Equivalent.

**PRIVACY:** the thumbs are drawn from client-local `detectiveHistory` and gated on
`myRole === "detective"` (`app.js:2223`). Non-detectives get no tags. Correct. **INFERRED risk:**
the Figma frame is titled "Detective player tab" and the overview PNG annotates "Detective have
different game details than other players" — so a shared *screenshot* of this tab outs the
detective. Same in the app today; no regression, but worth a design note.

---

## 9. `261:2135` — Detective events tab — SMALL

**DOM anchor:** `#eh-panel-events > #event-history-list` (`index.html:340-342`), `renderEventHistory`
(`app.js:2137-2208`).

**Visual deltas**
- Figma: `Round N` label in a left column, event strings stacked in a right column
  (`Frame 22`, `gap=8`), 1px white `Line 2` divider between rounds (`261:2135:82-111`).
- App: a flat vertical list — a `.event-history-round` header div followed by `.event-item` divs
  (`app.js:2192-2204`). **No two-column layout, no dividers.** This is the single biggest layout
  rewrite in the detective group.

**Copy deltas:** see the shared table in §0b. Notably `investigated as CLEAR` / `investigated as
MAFIA` vs the app's `Investigated — Clear` / `Investigated — MAFIA` (`app.js:2161-2162`).

**Flow deltas — SMALL.** Figma wiring `I332:5622;185:1610 House → 332:5469` (`wiring.md:400-401`)
= tap "Players". Equivalent to the app tabs.

---

## 10. `270:1212` — Death by mafia (victim's own screen) — **BIG (copy leaks the cause)**

**App state:** `you_died` received (`app.js:606-618`).
**DOM anchor:** `#dead-overlay` (`index.html:386-397`), at app root (not inside `#screen-game`) for
transform reasons documented at `index.html:380-385`.

**Visual deltas**
- Figma: `Frame 37` (358×144, `gap=24`) with `You are` (24px) / `DEAD` (Grandstander-Black 48px,
  `#E53935`), then a 330×38 sub-block, then a 244×245 `Skull` frame with a
  `GRADIENT_RADIAL #AA2222 @60% → #000000 @60%` glow around a 200×200 image, then a 358×60
  `#FF6C02` CTA.
- App: `.dead-poster` = `#dead-emoji` (pixel art via `pixelArtToSvg`, `app.js:614`) → `.dead-pre`
  `YOU ARE` → `.dead-text` `DEAD` → `#death-message` → `.dither-h` divider → `.dead-note` →
  `#btn-watch-town` → `#dead-dismiss-hint`.
- **Order delta:** Figma puts the art **below** the headline; app puts `#dead-emoji` **above**
  `.dead-pre` (`index.html:388-390`).
- App has a `.dither-h` divider and a `Tap to dismiss` hint (`index.html:392`, `395`) that Figma
  omits; Figma has the radial-gradient art glow that the app does not.
- Figma uses four **distinct** art assets across the death frames
  (`f454dffb…` mafia, `b16599d8…` execution/skull, `142227b5…` heartbreak, `44e37d54…` hunter/bow).
  App swaps only **two**: `HEARTBREAK_ART` when `msg.isLoverDeath`, else `CARD_BACK_DEAD_ART`
  (`app.js:614`). No mafia-specific and no hunter-specific art on the victim's own overlay.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `You are` / `DEAD` | `YOU ARE` / `DEAD` (uppercase) | `index.html:389-390` |
| `You were stabbed in the night – Round 4` | `#death-message` = server `msg.message` = `Narrator.diedInNight(name)`, one of `"{name} did not see the morning."` / `"{name} did not live to see the dawn."` / `"{name} did not survive the night."` / `"The night took {name}."` | `narrator.ts:230-235`, `250-252`; `server.ts:514`, `2149` |
| `Stay quiet, you can still watch the town squirm.` | `stay quiet. you can still watch the town squirm.` (lowercase, period instead of comma) | `index.html:393` |
| `Watch the town` | `WATCH THE TOWN` | `index.html:394` |

**Flow deltas — BIG, and it is a rules violation, not a layout one.**
`You were stabbed in the night – Round 4` states the **method** (stabbed ⇒ mafia). The app's
`you_died` message is deliberately cause-neutral and third-person: `DIED_IN_NIGHT_MESSAGES` is
annotated *"Reveals nothing"* (`narrator.ts:228-235`), and the same neutrality is enforced across
the dawn announcement (`narrator.ts:219-226`), the event log (`app.js:2144-2163`), and the
death-batch ordering (`server.ts:2078-2084`). Adopting the Figma copy would tell a dead player
whether they were killed by the mafia vs the vigilante vs a joker haunt — information they can
leak by expression/behaviour and which the current design spends real complexity hiding.

Also: Figma's copy is **second person** ("You were…"), while the app relays a **third-person**
sentence naming the victim ("{name} did not see the morning."). Any re-skin that keeps the app's
message must not wrap it in a second-person frame or the grammar breaks.

Figma frame has **no wiring** (`270-1212--death-by-mafia.md:"Wiring: _none_"`), so the
"Watch the town" CTA is unwired. App: both the CTA and a tap anywhere dismiss the overlay
(`app.js:3251-3254`).

**e2e playtest recommendation (BIG):** `tests/playtest/death-cause-neutrality.test.ts`.
With a pinned deal seating a mafia, a vigilante and a doctor, run one night where the mafia kills
X and the vigilante shoots Y. Assert:
1. X's and Y's `you_died.message` both match the `DIED_IN_NIGHT_MESSAGES` regex set and contain
   **none** of `/stab|shot|gun|bullet|knife|wire|mafia|vigilante|joker/i`.
2. No client's `phase_change.messages` names a cause.
3. Every living client's `events` payload types for X and Y are the neutral projection
   (`projectEventsForClients`, `game-engine.ts:1176`) — i.e. `vigilante_shot` never reaches a
   living client.
4. The dead player's own `events` payload is likewise cause-free.
This test is the regression fence for exactly the string Figma proposes.

---

## 11. `270:1237` — Death notification ("jenny didn't SURVIVE") — SMALL

**App state:** room-wide dawn beat.
**DOM anchor:** `#suspense-overlay` (`#suspense-pre` / `#suspense-art` / `#suspense-text`), staged
by `setSuspenseStage` (`app.js:1824-1835`), sequenced by `showSuspenseTransition`
(`app.js:2019-2093`); the kill verdict is `app.js:2015`.

**Visual deltas**
- Figma: `jenny didn’t` (24px) / `SURVIVE` (48px Black `#E53935`), then `The verdict` (24px),
  then the 244×245 radial-glow skull. Note the **verdict label sits below the headline**.
- App: `#suspense-pre` renders `THE VERDICT` **above** the art and text (`app.js:2051`), art is
  `CARD_BACK_DEAD_ART` pixel grid, text is one line, tint via the `beat-death` class.
- App splits the name/verb across a single sentence, Figma splits across two type sizes.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `jenny didn’t` + `SURVIVE` | `jenny didn’t survive the night.` (single line) | `app.js:2015` |
| `The verdict` | `THE VERDICT` (uppercase pre-line) | `app.js:2051` |

App also has two states Figma omits on this beat: the multi-death case
`"Several didn’t survive the night."` (name suppressed on purpose — `app.js:2005-2008`,
`2015`) and the mixed case `"A life was saved... but {name} didn’t make it."` (`app.js:2013`).

**Flow deltas — SMALL and well matched.** Figma wiring `270:1342 | after delay |
270:1237 → 270:1294 Narrator prompt` (`wiring.md:35`). App: the overlay auto-fades at
`5500ms` and tears down at `6300ms`, then `callback()` applies the phase change and the day
screen (with its narrator line) appears (`app.js:2072-2085`). Same shape, real timings.

---

## 12. `270:1294` — Narrator prompt (after a night death) — SMALL

**DOM anchor:** `#narrator-messages` (`index.html:249`), `showNarratorMessage` (`app.js:2124-2132`).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `jenny did not see the morning 💀` | `jenny did not see the morning.` | `narrator.ts:222` (`NIGHT_DEATH_SINGLE[0]`) via `Narrator.nightDeaths` (`narrator.ts:242-247`) |

**Match quality: near-exact** — Figma took the app's real string and appended ` 💀`. The app uses no
emoji in narrator copy (grep of `narrator.ts` shows none).

**Deltas Figma does not model:** the multi-death forms
`Two were gone by dawn — A and B.` and `Dawn counted three empty beds: A, B, and C.`
(`narrator.ts:245-246`), whose `joinNames` sorts alphabetically *specifically* so kill order can't
be inferred (`narrator.ts:200-209`). A re-skin that renders one victim per line would defeat that.

**Flow deltas — SMALL.** Figma reaches this frame `after delay` from the death notification
(`wiring.md:35`), matching the app's overlay teardown → phase change.

---

## 13. `268:955` — Doctor saved a life — SMALL

**DOM anchor:** `#suspense-overlay`; verdict branch `app.js:2014`.

**Visual deltas**
- Figma: `The doctor` (24px) / `SAVED` (48px Black, **`#218BE1` blue**) / `a life!` (24px), then
  `The verdict` (24px), then a 244×245 frame with a `GRADIENT_RADIAL #218BE1 @60% → #000000 @60%`
  glow around a 200×200 heart image (`6f07e85e…`) — the overview PNG shows a red heart in a blue
  glow.
- App: `setSuspenseStage(CROSS_ART, "THE VERDICT", "beat-dawn")` with `color: "#2196f3"`
  (`app.js:2014`) — a **medical cross**, not a heart; blue is `#2196f3` not `#218BE1`.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `The doctor` / `SAVED` / `a life!` (3 lines) | `The Doctor saved a life!` (1 line) | `app.js:2014` |
| `The verdict` | `THE VERDICT` | `app.js:2051` |

**Flow deltas — SMALL.** Figma wiring `270:1185 | after delay | 268:955 → 270:1067 Narrator
prompt` (`wiring.md:34`) — matches the app's overlay → phase-change chain exactly.

**Rules note (verified, not a delta):** this beat only fires when the save is *visible*. In
**official** mode the saved player is never privately told they were targeted
(`server.ts:2060-2063`), and the narrator line is the anonymous `doctorSaveOfficial()` — which is
exactly frame #14. Figma's `SAVED a life!` headline is anonymous, so it is compatible with both
rule modes.

---

## 14. `270:1067` — Narrator prompt (doctor save, official mode) — SMALL

**Copy delta: NONE — exact match.**

| Figma | App | Source |
| --- | --- | --- |
| `Someone was meant to die last night. A hand intervened in the dark, and they didn't. No name was left.` | identical | `narrator.ts:36` (`DOCTOR_SAVE_OFFICIAL_MESSAGES[0]`), served via `Narrator.doctorSaveOfficial()` (`narrator.ts:260-262`) |

Only difference: the Figma text node uses a straight apostrophe in `didn't`; verify the app's
source string (`narrator.ts:36`) also uses `'` — it does. ✓

**Visual deltas:** Figma sets `lh 19.8px` on a 3-line italic block (`270:1067:68-71`); app has no
per-message line-height override (`.narrator-line`, `app.css`). Figma renders the full paragraph
inline under the card; app truncates to the latest line only (`app.js:2127`).

**Flow deltas — SMALL.** Arrived at `after delay` from #13 (`wiring.md:34`). The app reaches the
same state via the suspense teardown.

**Not modelled by Figma:** the four *house-mode* named save lines
(`DOCTOR_SAVE_MESSAGES`, `narrator.ts:26-32`, e.g. `"{name} was found barely breathing {location},
kept alive by {saveMethod}."`), which are 2–3× longer and DO name the saved player. The re-skin's
narrator block must handle a ~200-character sentence, not the ~100-character Figma sample.

---

## 15. `264:2425` — Player's death / Town (executed) — SMALL

**App state:** `you_died` after an execution (`app.js:606-618`, `server.ts:1722`).
**DOM anchor:** `#dead-overlay`.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `You are` / `DEAD` | `YOU ARE` / `DEAD` | `index.html:389-390` |
| `The town has spoken - you have been executed. Whether it was justice, no one will ever be sure.` | `#death-message` = `Narrator.execution(name)` = e.g. `"The town has spoken. {name} is taken to the gallows at first light. Whether it was justice, no one will ever be sure."` | `narrator.ts:51` (`EXECUTION_MESSAGES[0]`), `266-271`; `game-engine.ts:1966` |
| `Stay quiet, you can still watch the town squirm.` | `stay quiet. you can still watch the town squirm.` | `index.html:393` |
| `Watch the town` | `WATCH THE TOWN` | `index.html:394` |

Figma rewrote the app's third-person template into **second person** and dropped the
`{executionStyle}` mad-lib. The app has **8** execution styles × **5** templates
(`narrator.ts:19-24`, `50-56`) → the death-message slot must tolerate a much longer, variable
sentence than the Figma sample.

**Visual deltas:** same skull/glow/order deltas as #10. Figma's art here is `b16599d8…` (the same
asset it uses for the vote-target portrait on `270:1649`); app uses `CARD_BACK_DEAD_ART`
(`app.js:614`).

**Flow deltas — SMALL.** No Figma wiring. App: tap-anywhere or the CTA dismisses
(`app.js:3251-3254`). Note the app *also* suppresses the whole overlay when the joker-win overlay
is already up (`app.js:610`) — an interaction Figma does not model.

---

## 16. `264:2485` — Death notification (`mo was EXECUTED`) — SMALL

**DOM anchor:** `#suspense-overlay` via `showExecutionTransition` (`app.js:1844-1883`).

**Visual deltas**
- Figma: `mo was` (24px) / `EXECUTED` (48px Black `#E53935`) / `The verdict` (24px) / 244×245
  radial-glow skull. The overview PNG shows a gallows illustration for this group, not a bare
  skull.
- App: `setSuspenseStage(CARD_BACK_DEAD_ART, "THE VERDICT", "beat-execution")` (`app.js:1860`) —
  `THE VERDICT` pre-line **above**, skull pixel art, then the sentence, tinted `#d32f2f`
  (`app.js:1854`).
- App has a **2000 ms** hold then a **600 ms** fade (`app.js:1871-1882`); Figma specifies no
  timing on this frame (no wiring).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `mo was` + `EXECUTED` | `mo was executed.` | `app.js:1852` |
| `The verdict` | `THE VERDICT` | `app.js:1860` |

**Flow deltas — SMALL.** Figma dead-ends. App chains: execution beat → (optional heartbreak beat,
#18) → night transition (`app.js:1879-1880` comment). Adopting the Figma frame must preserve the
chain's terminal `flushPendingGameOver` semantics (`app.js:1912`).

---

## 17. `265:2524` — Death by heartbreak (victim's own screen) — SMALL

**DOM anchor:** `#dead-overlay` with `#dead-emoji` = `pixelArtToSvg(HEARTBREAK_ART)` when
`msg.isLoverDeath` (`app.js:614`; flag set at `server.ts:514`, `1722`, `2149`).

**Visual deltas**
- Figma changes the **headline**: `You died of` / `HEARTBREAK` (48px Black `#E53935`).
  App keeps the fixed `.dead-pre` `YOU ARE` + `.dead-text` `DEAD` (`index.html:389-390`) and
  varies **only the art**. → new per-cause headline variant required.
- Figma art `142227b5…` (broken heart, red radial glow). App `HEARTBREAK_ART` pixel grid.

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `You died of` / `HEARTBREAK` | `YOU ARE` / `DEAD` | `index.html:389-390` |
| `Your lover falls and your heart splits into two` | `#death-message` = `Narrator.loverDeath(name)` = e.g. `"{name} died of heartbreak."` / `"A heart only breaks the once: {name} died of heartbreak."` | `narrator.ts:71-76`, `278-280`; `game-engine.ts:1478` |
| `Stay quiet, you can still watch the town squirm.` | `stay quiet. you can still watch the town squirm.` | `index.html:393` |

The Figma sentence is **new copy**, second-person, and does not exist in the app. It is also
*safer* than the app's in one respect (it never names anyone) and *less* safe in another (it
confirms the partner died, which the app's line also does). No rules conflict —
`LOVER_DEATH_MESSAGES` is explicitly public by owner ruling (`narrator.ts:65-70`), but the app
line must **never name the original lover** (`narrator.ts:66-69`); the Figma copy honours that.

**Flow deltas — SMALL.** No wiring. App dismiss = tap or CTA.

---

## 18. `270:1197` — Death notification (`jenny died of HEARTBREAK`) — SMALL

**DOM anchor:** `#suspense-overlay` via `showHeartbreakTransition` (`app.js:1888-1915`) for the
day/execution path, and the inline heartbreak beat inside `showSuspenseTransition`
(`app.js:2059-2069`) for the night path.

**Visual deltas**
- Figma: `jenny died of` (24px) / `HEARTBREAK` (48px Black `#E53935`) / `The verdict` / broken
  heart with red radial glow.
- App: `setSuspenseStage(HEARTBREAK_ART, "HEARTBREAK", "beat-heartbreak")` — the pre-line is
  `HEARTBREAK`, **not** `The verdict` (`app.js:1896`, `2063`); text tinted `#9c27b0` (purple),
  where Figma uses `#E53935` (red).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `jenny died of` + `HEARTBREAK` | `jenny died of heartbreak.` | `app.js:1897`, `2064` |
| `The verdict` | `HEARTBREAK` (pre-line) | `app.js:1896` |

**Flow deltas — SMALL.** No wiring. App timing: night path fires this beat at **5700 ms** into the
dawn sequence and extends the overlay by **2800 ms** (`app.js:2027-2028`, `2059-2069`); the day
path is a separate 2000 ms + 600 ms overlay chained after the execution beat
(`app.js:1885-1887` comment, `1903-1914`). A re-skin must preserve both call sites.

---

## 19. `264:2513` — Player's death / Hunter — SMALL

**DOM anchor:** `#dead-overlay` (victim of the Hunter's revenge shot).

**Copy deltas**

| Figma | App | Source |
| --- | --- | --- |
| `You are` / `DEAD` | `YOU ARE` / `DEAD` | `index.html:389-390` |
| `A single shot, and you go down with the Hunter. The dying take who they please.` | `#death-message` = `Narrator.hunterRevengeKill(name)` = `"A single shot, and {name} goes down beside the Hunter. The dying take who they please."` (+ 4 alternates) | `narrator.ts:104-110`, `287-289` |
| `Stay quiet, you can still watch the town squirm.` | `stay quiet. you can still watch the town squirm.` | `index.html:393` |

Again a **second-person rewrite** of an existing third-person app string (`goes down beside` →
`go down with`).

**Visual deltas:** art `44e37d54…` (the overview PNG shows a crossbow/bow). App shows the generic
`CARD_BACK_DEAD_ART` skull for this death — the app **does** have a bow asset but only on
`#revenge-wait-art` (`index.html:263`, `.revenge-wait-art`), not on the dead overlay. → art
variant gap.

**Flow deltas — SMALL.** No wiring. Note the app's Hunter gate has a room-wide wait view
(`#revenge-wait`, `index.html:262-268`, with `THE HUNTER FALLS` headline and an admin
`Skip revenge` button) — **no Figma frame in this section covers it** (see §5.6).

---

## 5. App day states with NO Figma frame

These are live, shipped app states. None appear anywhere in the 19 day-actions specs.

### 5.1 Accusation launcher + picker (all living players) — **highest-priority gap**
- **DOM:** `#day-accuse-controls` → `.accuse-launch > #btn-accuse`, and `#accuse-picker` containing
  `.accuse-picker-title`, `#accuse-target-list`, `#btn-accuse-cancel`, `#btn-accuse-confirm`
  (`index.html:301-315`).
- **Logic:** `renderAccusePanel` (`app.js:3012-3031`), `populateAccuseTargets`
  (`app.js:3069-3086`), handlers (`app.js:3088-3100`).
- **Copy to place:** `Accuse someone` → `You've made your accusation` when spent
  (`app.js:3024`, `3027`); picker title
  `Point a finger — or move that the town sleeps:` (`index.html:308`);
  sleep row `Propose the town sleeps on it` (`app.js:3075`); `Cancel` / `Confirm`
  (`index.html:311-312`, Confirm starts `disabled`).
- **States to design:** enabled / spent-disabled / picker-open with nothing selected
  (Confirm disabled) / picker-open with a selection.

### 5.2 Pending accusation list — Second / Withdraw
- **DOM:** `#accusations-panel` → `.accusation-row` (`.accusation-text` + `.accusation-actions`
  holding `.acc-second` and/or `.acc-withdraw`) (`index.html:303`, `app.js:3039-3067`).
- **Copy:** row text is `{accuser} accuses {target}` or
  `{accuser} moves that the town sleeps` (`app.js:3033-3037`); buttons `Second` and `Withdraw`
  (`app.js:3051`, `3054`).
- **Conditional states to design (4 permutations):** row with Second only (eligible seconder);
  row with Withdraw only (you are the accuser); row with neither (you are the accused, or you
  already spent your second — `app.js:3046-3049`); **stacked** rows (multiple pending accusations
  are legal, `game-engine.ts:1759`).
- The accusation panel is **hidden while a ballot is live** (`app.js:3144`, rule 9) and cleared at
  night (`app.js:1781-1784`).

### 5.3 Sleep proposal + sleep ballot
- Proposal row: `{accuser} moves that the town sleeps` (`app.js:3035`).
- Ballot headline: `The town considers sleeping. Turn in for the night?` (`app.js:3147`) —
  replaces the whole `Vote: Execute X?` title, so it needs its own layout treatment (no portrait,
  no target name).
- Narrator lines with no Figma home: `SLEEP_PROPOSED_MESSAGES` (`narrator.ts:136-141`),
  `SLEEP_SECONDED_MESSAGES` (`150-154`), `SLEEP_WITHDRAWN_MESSAGES` (`162-165`),
  `SLEEP_PASSED_MESSAGES` (`167-171`), `SLEEP_FAILED_MESSAGES` (`173-177`).
- Outcome states: passed ⇒ straight to night, **no** execution/heartbreak overlay
  (`app.js:3213-3216`); failed ⇒ back to day with accusations intact
  (`game-engine.ts:1863-1868`).

### 5.4 Admin day-control sub-states
- `#vote-count-label` = `(Vote #N done)` and `#admin-status-msg` =
  `Vote failed. Nominate another player or end the day.` after a failed ballot
  (`app.js:2969-2976`, `index.html:290-291`).
- `#day-timer` — a running MM:SS clock in the header, `startDayTimer` / `stopDayTimer`
  (`app.js:1622-1641`, `index.html:198`).
- `#btn-roster` — the "Roles in Play" modal trigger, present in the header on every day frame
  (`index.html:199`). Figma's day nav has a 24×24 icon in that slot but the section carries no
  roster frame.
- `abstain_vote` — accepted by the server (`server.ts:994`, `1619-1630`, narrating
  `"The admin has chosen to abstain from calling a vote today."`) but **no client control sends
  it** (grep: `abstain` appears in `app.js` only inside `showExecutionTransition`'s label at
  `app.js:1853`). **INFERRED: dead wire.** Flagged, not touched.

### 5.5 Vote-progress and post-vote states
- `#vote-progress` = `N / M votes cast` (`app.js:3197`) — Figma renders the tally but never as a
  live-updating element with its own anchor.
- Dead players during a ballot: `#vote-buttons-wrapper` hidden, tally still visible
  (`app.js:3154-3156`). No Figma frame.
- Admin's `Cancel Vote` remains visible after the admin has voted — see #3.

### 5.6 Hunter revenge gate (room-wide)
`#revenge-wait` (`index.html:262-268`): `#revenge-wait-art`, headline `THE HUNTER FALLS`,
`#revenge-wait-reveal`, `Waiting for the Hunter…`, and an admin-only `Skip revenge` button.
Frame `264:2513` shows the *victim's* death but nothing covers the gate itself. (Listed for
completeness — arguably belongs to the night-actions matrix.)

---

## 6. Decisions needed from Hanson

1. **Day-flow model: does the Figma admin-nomination flow replace, or sit alongside, the shipped
   accusation flow?** Figma's only ballot trigger is the admin tapping a player row
   (`wiring.md:36`). The app now leads with accuse → second → vote and keeps admin `call_vote` as
   a secondary path (`game-engine.ts:1687-1698` and `1729-1786` both live). If the re-skin is a
   pure visual pass, we need **new frames** for §5.1–§5.3 (roughly 6–8 states). If the design
   intends to retire player accusations, that is a rules change, not a re-skin.

2. **Death-cause copy — hard stop.** Figma's `You were stabbed in the night – Round 4`
   (`270:1212`) and `dale - shot by vigilante` (on 10 frames) both name the kill source. The app
   deliberately neutralises this in four places (`narrator.ts:219-235`, `app.js:2144-2171`,
   `server.ts:2078-2084`, `game-engine.ts:1176`). Confirm we **reject** that copy and keep
   `Narrator.diedInNight()` / `"Died in the night"`. If you want cause-revealing death screens,
   that is a deliberate rules reversal that needs its own decision and a test-suite update.

3. **Narrator copy: adopt Figma's short lines or keep the noir mad-libs?** Figma writes ~60–100
   char single sentences (`Dawn breaks. The town wakes to find mo dead in the square.`). The app
   generates 100–250 char randomised prose from `narrator.ts` templates (e.g. 5 execution
   templates × 8 execution styles). The narrator block's layout budget depends on the answer.
   Three Figma strings are already verbatim app copy (`270:1067` exact, `270:1294` +emoji), so a
   hybrid is plausible.

4. **Detective reveal placement — shoulder-surf risk.** Figma promotes the reveal to a 326×70
   card in the main scroll flow, persisting all day (`140:1315`, `143:1463`). App uses a lower-
   weight strip cleared at night entry (`app.js:1787`). On a pass-the-phone device the Figma
   treatment is more exposed. Options: (a) ship as designed, (b) add a tap-to-reveal/collapse,
   (c) auto-collapse after N seconds. Also decide whether the reveal should be
   dismissible before handing the phone on.

5. **Per-cause death overlay variants: how many?** Figma specifies **four** distinct
   headline+art pairs (`You are DEAD` mafia / execution / hunter, plus `You died of HEARTBREAK`).
   The app varies art on **one** axis only (`isLoverDeath`, `app.js:614`) and the headline never
   changes. Adding the other three requires a new field on `you_died` (the wire currently carries
   only `message` + optional `isLoverDeath`, `types.ts:304`) — which reopens decision #2, because
   a cause field on the wire *is* a cause leak. Recommended: adopt Figma's **heartbreak** variant
   only (already public) and keep the rest generic.

6. **Room code in the in-game header?** Every Figma day frame shows `Code E92G`
   (`270:1471:27-35`); the app's in-game header has no room code (`index.html:194-202`). Add it,
   or drop it from the design?

7. **Day timer.** The app runs a visible MM:SS day clock (`#day-timer`, `app.js:1622-1641`).
   Figma's nav has no slot for it. Keep it (needs a nav slot) or remove it?

8. **`Cancel Vote` after the admin has voted.** Figma removes all vote chrome on the
   Execute/Spare frames; the app leaves the admin's cancel button up. Which is correct?

9. **Two contradictory spare strings (pre-existing bug, flagged not fixed).** A spared vote shows
   `"The vote was abstained."` on the suspense overlay (`app.js:1853`) *and*
   `"{name} has been spared."` in the narrator (`app.js:3222`), while the engine narrates a third
   variant from `EXECUTION_SPARED_MESSAGES` (`narrator.ts:58-63`). Figma proposes a fourth
   (`You decide to spare.`). Pick one before the re-skin bakes it in.

10. **Events tab layout.** Figma uses a two-column `Round N | events` grid with dividers
    (`261:2135:82-111`); the app renders a flat list (`app.js:2192-2204`). Confirm the two-column
    rewrite is in scope — it touches the single most-used panel in the game.
