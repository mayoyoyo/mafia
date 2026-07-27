# Figma ↔ App Coverage Matrix — GAME OVER section + COMPONENTS page

**Scope:** 10 frames in Figma section "Game Over" (`docs/figma-raw/specs/game-over/*.md`) + 9 entries on the Figma "Components" page (`docs/figma-raw/specs/components/*.md`).

**Ground-truth sources used (every claim below cites one):**
- Figma frame specs: `docs/figma-raw/specs/game-over/*.md`, `docs/figma-raw/specs/components/*.md`
- Prototype wiring: `docs/figma-raw/rest/wiring.md`, `docs/figma-raw/rest/node-index.md`
- Overview render: `docs/figma-raw/screenshots/game-over--overview.png` (2466×3970, read at 1.19x — 4 bands legible)
- App code: `public/index.html`, `public/app.js`, `public/app.css`, `public/pixel-art.js`, `src/game-engine.ts`, `src/narrator.ts`
- App orientation (cross-checked against code, not trusted alone): `.claude/context/figma-migration/app-screen-inventory.md`

Anything not traceable to those is marked **INFERRED**.

---

## 0. Frame census (verifies the "10 frames" premise)

`ls docs/figma-raw/specs/game-over/` returns exactly 10 files. Grouped by the 4 bands visible in `game-over--overview.png`:

| # | Figma frame | node id | Band (overview PNG) | Position (x,y) | Prototype out-edges (`wiring.md:155-196`) |
|---|---|---|---|---|---|
| 1 | Victory screen | `278:2772` | Citizens win | 11960, 3641 | AFTER_TIMEOUT → `278:2780` |
| 2 | Game options | `278:2780` | Citizens win | 12610, 3641 | CTA→`42:782` Lobby/**Player**; CTA→`278:2810` |
| 3 | View game details | `278:2810` | Citizens win | 13260, 3641 | CTA→`42:782` Lobby/Player |
| 4 | Victory screen | `332:5939` | Mafia win | 11960, 4694 | AFTER_TIMEOUT → `332:5960`; CTA→`42:782` |
| 5 | Game options | `332:5960` | Mafia win | 12610, 4694 | CTA→`42:782`; CTA→`281:2972` |
| 6 | View game details | `281:2972` | Mafia win | 13260, 4694 | CTA→`42:782` |
| 7 | Victory screen | `332:6071` | Joker win | 11960, 5747 | AFTER_TIMEOUT → `332:6092`; CTA→`42:782` |
| 8 | Game options | `332:6092` | Joker win | 12610, 5747 | CTA→`42:782`; CTA→`281:3022` |
| 9 | View game details | `281:3022` | Joker win | 13260, 5747 | CTA→`42:782` |
| 10 | Game options | `332:6290` | **Admin controls** | 11960, 6800 | CTA→`45:466` Lobby/**Host**; CTA→`278:2810` |

Counts check out: Victory screen ×3, Game options ×4, View game details ×3.

`42:782` = "Lobby / Player", `45:466` = "Lobby / Host" (`node-index.md:28-29`). The **only** structural difference between frame 10 and frame 2 is the Return-to-lobby destination (Host vs Player) — frame 10 reuses the Citizens-win copy verbatim. The overview PNG carries a designer annotation wired to frame 10's orange CTA: *"Returning lobby to admin brings up the host lobby controls where settings can be changed."*

---

## A. Per-frame mapping, deltas, and e2e recommendations

### A.0 The app's game-over architecture (the thing all 10 frames map onto)

The app has **one** game-over screen, `#screen-gameover` (`public/index.html:356-375`), driven by a timed sequence — not three screens. Figma's 3-frame-per-band flow is the app's timeline, flattened:

| Figma frame role | App construct | file:line |
|---|---|---|
| Victory screen (pre-narrative) | `#suspense-overlay` staged by `showGameOverSuspense()` — `setSuspenseStage(TROPHY_ART, "FINAL VERDICT", winBeat)` then winner reveal at t=2200ms | `public/app.js:3691-3726` |
| Game options (narrative + CTAs) | `showGameOverScreen()` at t=4000ms + `showGameOverButtons()` after the staggered reveal completes | `public/app.js:3569-3601`, `3681-3689`, `3729-3743`, `3815-3819` |
| View game details (roster reveal) | `renderRoleReveal()` / `revealRolesStaggered()` — rendered into `#role-reveal` **on the same screen**, not a separate route | `public/app.js:3746-3820`; markup `public/index.html:365` |

Entry point: the `game_over` message handler `public/app.js:3556-3567` branches on `msg.forceEnded` (immediate) vs natural end (suspense).

---

### A.1 — Victory screen · Citizens (`278:2772`)

**Mapped app state:** `showGameOverSuspense(msg, admin)` with `winBeat = "beat-win-town"` (`public/app.js:3691-3726`), followed by `showGameOverScreen()` title path `titles.town = "Citizens Win!"` (`public/app.js:3583`) coloured `var(--role-citizen)` (`public/app.js:3593`).

**Copy — exact match on the headline pair.** Figma: "The final verdict" / "Citizens Win!". App: suspense stage label `"FINAL VERDICT"` (`app.js:3703`) + `winText = "Citizens Win!"` (`app.js:3715`), and the persistent `#gameover-title` = `"Citizens Win!"` (`app.js:3583`). **SMALL.**

**Visual deltas:**
- **Centrepiece — BIG.** Figma: a 200×200 raster art asset `c902a3b3d46083910bbe4456df8c6578df605dac` (campfire + two townsfolk, per the overview PNG) on a radial gradient `#E3DAB5 @60% → #000000 @60%` (spec lines "Before" frame). App: `TROPHY_ART` pixel-art SVG recoloured by a CSS filter class `win-town` (`app.js:3574-3581`, `3703`). Different asset *class* (raster illustration vs 10×10 pixel grid), different subject (campfire vs trophy), and the app has no radial-glow backplate.
- **Title colour.** Figma `#E3DAB5`. App `var(--role-citizen)` = `#388e3c` (`public/app.css:58`). **BIG** (cream vs green — see §B.5 palette).
- **Background.** Figma frame fill `#000000`, flat. App inherits theme; dark-default but light theme exists. **SMALL** (theme-aware port).
- **Type.** Figma Grandstander Regular 24px / Grandstander-Black 48px w900. App uses the pixel/Silkscreen + IBM Plex Mono stack. **BIG** — a font-family swap for the whole re-skin, out of scope for this frame alone but load-bearing here (the 48px Black headline is the frame's whole identity).

**Flow deltas:**
- Figma AFTER_TIMEOUT `278:2772 → 278:2780` (`wiring.md`, spec Wiring block). App equivalent: the two `setTimeout`s at 4000ms and 4800ms in `showGameOverSuspense` (`app.js:3729-3743`). Same shape. **SMALL.**
- Figma builds the transition as opacity 0%→100% on "After Text" / "CTAs" / "After" layers within one frame pair. App cross-fades `#suspense-overlay` (`fade-out` class) onto the already-prepared game-over screen. **SMALL** (equivalent technique).
- Figma frame 1 has **no** CTA reachable (both CTA frames are `opacity=0%`). App likewise hides both button groups during suspense (`app.js:3598-3599`). **Match.**

---

### A.2 — Game options · Citizens (`278:2780`)

**Mapped app state:** `#screen-gameover` fully settled, buttons revealed by `showGameOverButtons(admin)` (`public/app.js:3681-3689`). Non-admin branch shows `#gameover-buttons-player` (`public/index.html:371-373`).

**Copy — narrative body.** Figma: *"The last of the mafia falls. The street lamps come on early, and for the first time in a long time, no one is afraid to walk under them. The town wins."* App: `#gameover-message` = `msg.message` (`app.js:3597`), which for a natural town win is `Narrator.townWin()` — a **random pick from a `TOWN_WIN_MESSAGES` pool** (`src/narrator.ts:293-295`), not a fixed string. **BIG:** Figma specifies one canonical line; the app randomises. Either the Figma line joins the pool or the pool is collapsed. **Decision needed (D3).**

**CTA deltas — the largest flow gap in the section.**

| Figma CTA | fill | App equivalent | file:line |
|---|---|---|---|
| "Return to lobby" (primary) | `#FF6C02` | *Player:* `#btn-return-to-lobby-player` → `{type:"player_return_to_lobby"}` | `index.html:372`, `app.js:3852` |
| "View game details" (secondary) | `#232729` | **NO APP EQUIVALENT as a button** — the reveal is already on-screen | — |

- **BIG — no "View game details" affordance exists.** The app renders `#role-reveal` inline and auto-plays it (`app.js:3732`, `3742`); there is no gate, no second route, no button. Adopting Figma means moving the reveal behind a tap.
- **BIG — the admin's three buttons vanish.** App admin branch shows `#btn-play-again-same` ("Play Again" → `restart_game`), `#btn-play-again-new` ("New Settings" → `return_to_lobby`), `#btn-close-room` ("Close Room" → confirm sheet → `close_room`) (`index.html:366-370`, `app.js:3822-3830`, `3855-3860`). Figma's admin frame (`332:6290`) offers **one** button. Per the overview annotation the intent is that Return-to-lobby *is* "New Settings" and Play-Again/Close-Room are dropped or relocated to the host lobby. **Decision needed (D1).**
- **SMALL** — Figma CTA geometry: 358×60, radius 16, pad 16, drop shadow r23.8 @20%. App buttons are `.btn-large` with stepped `clip-path` pixel corners (`app.css` `.btn-vote` family precedent at `app.css:547-556`). Cosmetic under the re-skin.

**Visual deltas:**
- Figma "After" glow uses `#E3CBB5` while the identical "Before" glow on `278:2772` uses `#E3DAB5`. Spec-internal inconsistency (one digit). **SMALL — flag to design (D5).**

**e2e recommendation (BIG items):** extend the existing playtest harness with a game-over assertion set: assert that after a town win, exactly one primary CTA is focusable for a player and that the admin control set matches the agreed final list. Suggested new file `tests/playtest/gameover-ctas.test.ts` using the `MAFIA_FIXED_DEAL` seam (see `CLAUDE.md` → Local Playtesting). Must cover admin **and** non-admin sockets in the same run, since `showGameOverButtons` branches on the saved admin flag (`app.js:3562`, `3681`).

---

### A.3 — View game details · Citizens (`278:2810`)

**Mapped app state:** `#role-reveal` populated by `renderRoleReveal(msg.players, hidden)` (`public/app.js:3746-3788`), revealed by `revealRolesStaggered` (`app.js:3790-3820`).

**What Figma reveals, row by row (spec `278:2810` "Players" frame):** name (white, 14px) + optional heart icon + a role **tag chip** (rounded 8px, role-tinted fill, role-tinted text). Seven rows: dale/Citizen+heart, jenny/Mafia, kevin/Detective+heart, natasha/Doctor, andrew/Citizen, mo/Mafia, hanson/Hunter. Below: one orange "Return to lobby" CTA.

**Reveal-parity table — what each side discloses:**

| Datum | Figma `278:2810` | App `renderRoleReveal` | Verdict |
|---|---|---|---|
| Player name | yes | yes (`app.js:3780`) | match |
| Role | yes, as tinted chip | yes, as `.role-reveal-role` text, uppercased (`app.js:3781`) | SMALL (chip vs text) |
| Lover marking | heart icon only | heart **+ partner username** (`app.js:3774`, `loverPairs`) | **App reveals MORE** |
| Dead / alive | **not shown** — all 7 rows identical | `DEAD` tag + `.dead` class (`app.js:3772`, `3775`) | **App reveals MORE — BIG** |
| Godfather | **not shown** (no Godfather chip anywhere in the frame) | reveals as `GODFATHER`, distinct from `MAFIA` (`app.js:3777-3778`, `3781`) | **App reveals MORE — BIG** |
| Joker joint-win trophy | **not shown** | trophy SVG on the joker row when `jokerJointWinner` (`app.js:3776`) | **App reveals MORE — BIG** |
| Ordering | design order (mixed) | non-mafia first, mafia last, to stage the reveal (`app.js:3762-3767`, `3797-3807`) | BIG (see below) |
| Per-round event history | **not present** | `#game-history` on the same screen (`index.html:364`, `app.js:3617-3679`) | **App reveals MORE — BIG** |
| Vigilante / Joker role chips | absent from all 3 detail frames | present (any dealt role renders) | INFERRED gap — the Membership Card set has the swatches, the detail frames just never exercise them |

**Flags — reveals the app does NOT currently make (Figma-only):** *none.* Every datum in Figma's detail frame is already disclosed by the app. The gap runs the other direction: **the app discloses six things Figma's detail frame drops** (alive/dead, Godfather, joint-win trophy, lover partner name, reveal ordering/stagger, and the entire round-by-round history).

**BIG — the history disappears.** `renderGameHistory()` groups all deaths into `Night N` / `Day N` blocks with cause labels from `GAME_HISTORY_LABELS` (`app.js:3604-3613`: "Killed by the Mafia", "Saved by the Doctor", "Executed by vote", "Died of heartbreak", "Haunted by the Joker", "Shot by the Hunter", "Shot by the Vigilante"). No Game Over frame instantiates the "Game Tabs" component (verified: `grep -rn 'of set "Game Tabs"' docs/figma-raw/specs/` returns hits **only** under `specs/night-actions/` and `specs/day-actions/`, never `specs/game-over/`). So the re-skin as drawn deletes the post-game history. **Decision needed (D2).**

**BIG — the staggered reveal has no Figma representation.** The app's dramatic beat (300ms/card, +800ms pause before the mafia block, buttons gated behind it — `app.js:3800-3819`) is the reason `#role-reveal` sorts mafia-last. Figma's detail frame is a static list reached by a tap. Porting Figma literally removes the app's signature end-of-game moment.

**Visual deltas:**
- Row container: Figma 326×70, fill `#232729`, radius 16, drop shadow. App `.role-reveal-item` rows. **SMALL.**
- Header on the detail frame shrinks: 18px / 36px Black (vs 24/48 on the victory frames) with a 183×183.75 skull/art frame. App keeps one size. **SMALL.**
- **BIG (spec bug):** the "Citizen" chip on all three detail frames uses fill `#CDB198` + text `#67401E` — that is the **Vigilante** palette from the Membership Card set (`77-528--membership-card.md`, `Role=Vigilante`). The Citizen card's own palette is `#D1CFC7` / `#5C4B0D`. Mafia/Detective/Doctor/Hunter chips all match their cards correctly; only Citizen is crossed. **Decision needed (D4).**

**Flow:** Figma's only exit is "Return to lobby" → `42:782` Lobby/Player (`wiring.md:159-160`). There is **no back-link to Game options** — the details screen is terminal. App has no equivalent navigation at all (single screen). **SMALL** once D1/D2 settle.

**e2e recommendation:** a reveal-parity regression is warranted regardless of which way D2 goes. Assert against a fixed deal containing a Godfather, a lover pair, and a dead player that the post-game DOM contains: partner name, `GODFATHER` (not `MAFIA`), the `DEAD` marker, and (if retained) the `Night 1` history block. This pins the six app-only disclosures so a re-skin can't silently drop them.

---

### A.4 — Victory screen · Mafia (`332:5939`)

**Mapped app state:** same code path, `winBeat = "beat-win-mafia"` (`app.js:3701`), `titles.mafia = "Mafia Wins!"` (`app.js:3584`), colour `var(--role-mafia)` (`app.js:3594`).

**Copy:** headline "Mafia Wins!" — **exact match** with `app.js:3584` / `3716`. Narrative: *"It's over. There aren't enough honest hands left to hold the line. The lamp stays dark on whichever streets they choose. The Mafia wins."* vs app's randomised `Narrator.mafiaWin()` pool (`src/narrator.ts:296-298`). Same **BIG** issue as A.2 (D3).

**Visual deltas:** title `#D18D83` and radial `#D18D83 @60% → #000000` vs app `--role-mafia: #d32f2f` (`app.css:57`) — **BIG**, dusty rose vs fire red. Centrepiece asset `6252da56...` (a revolver, per the overview PNG) vs `TROPHY_ART` filtered `win-mafia` — **BIG**.

**Flow delta — inconsistency in the Figma file itself:** this frame carries **both** `AFTER_TIMEOUT → 332:5960` *and* an ON_CLICK on `332:5953` (a CTA inside the `opacity=0%` "CTAs" group) → `42:782`. The Citizens victory screen (`278:2772`) has only the timeout. So the Mafia and Joker victory screens have a live click target on an invisible button; the Citizens one does not. **SMALL** (prototype artefact, not a product requirement) — **INFERRED** that this is unintentional.

---

### A.5 — Game options · Mafia (`332:5960`)

**Mapped app state:** identical to A.2; only `msg.winner` differs.

**Deltas:** all of A.2's CTA and narrative findings apply unchanged. Frame-specific: "View game details" wires to `281:2972` (the Mafia detail frame), confirming one detail frame per band rather than a shared parametric screen. App has no per-winner branching in `renderRoleReveal` at all — the roster render is winner-agnostic (`app.js:3746`). **SMALL** (Figma is just enumerating variants).

---

### A.6 — View game details · Mafia (`281:2972`)

**Mapped app state:** identical to A.3. **The player rows are byte-identical to `278:2810`** — same 7 names, same roles, same two hearts, same Citizen/Vigilante colour crossing. Only the header (`"Mafia Wins!"`, `#D18D83`), the skull glow (`#D18D83`) and the art asset (`6252da56...`) change.

**Delta:** none beyond A.3. Confirms the detail screen is a single component with a themed header — a clean port target once D2/D4 resolve. **SMALL.**

---

### A.7 — Victory screen · Joker (`332:6071`)

**Mapped app state:** `winBeat = "beat-win-joker"` (`app.js:3702`), `titles.joker = "Joker Wins!"` (`app.js:3585`), colour `var(--role-joker)` (`app.js:3595`).

**Copy:** headline "Joker Wins!" matches `app.js:3585`/`3717`. Narrative *"andrew is smiling as the rope goes taut. They wanted this. You gave it to them, and the joke was never yours to get."* is **name-parameterised** — matching the app's `Narrator.jokerWin(name)` shape (`src/narrator.ts:281-283`), which also fills a `{name}` template from a pool. Closest copy alignment of the three bands. **SMALL** (still subject to D3's pool-vs-canonical question).

**BIG — Figma has no equivalent of `#joker-win-overlay`.** The app fires a *separate*, click-to-dismiss celebration poster (`showJokerWinOverlay`, `app.js:3263-3270`; markup `public/index.html:402-410`) with `CLOWN_ART`, "THE LAST LAUGH" / "JOKER WINS" / `"<name> had the last laugh"`. It is triggered mid-game on the joker's execution (`app.js:524-525`), guarded by `jokerWonOverlayShown`, and independently at `app.js:610`. Figma folds all joker celebration into the victory screen. The overlay is also the **joint-win** carrier: when no `jokerName` is present it reads `"You achieved a joint victory!"` (`app.js:3269`) — a state Figma does not model at all. **Decision needed (D6).**

**Visual deltas:** title `#D5B5E3`, radial `#D5B5E3 @60%`, asset `f0e46bd3...` (jester mask). App `--role-joker: #26c6da` light / `#0097a7` dark (`app.css:61`, `254`) — **cyan vs lilac, BIG**. App joker art is `CLOWN_ART` pixel grid.

**Flow:** AFTER_TIMEOUT → `332:6092`, plus the same invisible-CTA click target as A.4.

---

### A.8 — Game options · Joker (`332:6092`)

Identical structure to A.2/A.5; "View game details" → `281:3022`. No new deltas.

**Note:** in the app, a joker win can be a **joint** win (`jokerJointWinner`, `app.js:3556`, `3776`) — the town or mafia also wins. Figma's three mutually-exclusive bands cannot express that. Rolls into **D6**.

---

### A.9 — View game details · Joker (`281:3022`)

Identical player-row content to A.3/A.6; header `"Joker Wins!"` `#D5B5E3`, skull glow `#D5B5E3`, asset `f0e46bd3...`. No new deltas. Notably the joker's own row is **not** highlighted in the roster — the app puts a trophy on it (`app.js:3776`). Same **BIG** finding as A.3.

---

### A.10 — Game options · Admin controls (`332:6290`)

**Mapped app state:** `showGameOverButtons(true)` → `#gameover-buttons` (`public/app.js:3682-3684`, `public/index.html:366-370`).

**This is the highest-delta frame in the section.**

| | Figma `332:6290` | App admin game-over |
|---|---|---|
| Buttons | 2: "Return to lobby" (`#FF6C02`), "View game details" (`#232729`) | 3: "Play Again", "New Settings", "Close Room" — plus a persistent "Leave Room" in `.gameover-header` (`index.html:358`) |
| Return destination | `45:466` Lobby / **Host** (`wiring.md:195-196`) | `#btn-play-again-new` → `{type:"return_to_lobby"}` (`app.js:3827-3830`); server case at `src/server.ts:1865` |
| Restart-with-same-settings | **absent** | `#btn-play-again-same` → `{type:"restart_game"}` (`app.js:3822-3825`); server case `src/server.ts:1901` |
| Destroy room | **absent** | `#btn-close-room` → confirm sheet → `{type:"close_room"}` (`app.js:3855-3860`); server case `src/server.ts:1883` |
| Leave room | **absent** | `#btn-leave-room` → `{type:"leave_game"}` + full client-state teardown (`app.js:3832-3849`) |
| Copy | Citizens-win narrative reused verbatim | winner-dependent |

**BIG ×3.** Three wired admin capabilities (`restart_game`, `close_room`, `leave_game`) have **NO Figma equivalent** on the game-over screen. The annotation *"Returning lobby to admin brings up the host lobby controls where settings can be changed"* only accounts for `return_to_lobby`. `restart_game` in particular is a one-tap "run it back" that has no lobby equivalent — routing through the lobby costs the host an extra Start-Game tap and re-opens the settings surface.

Also note Figma models only a Citizens-win admin frame; there is no Mafia-win or Joker-win admin frame. **INFERRED:** the admin variant is meant to be orthogonal to the winner band (one admin button-set × three headers), not a fourth win condition.

**e2e recommendation:** whatever D1 decides, pin it. A `bun test` assertion that the admin game-over DOM exposes exactly the agreed action set — and that `restart_game` still round-trips if retained — belongs alongside the reveal-parity test in A.3. The `player_return_to_lobby` vs `return_to_lobby` split (`app.js:3829` vs `3852`; server cases `src/server.ts:1865`, `1995`) is a real wire distinction the single Figma CTA hides, and is worth its own assertion.

---

## B. Components page — mapping table

`ls docs/figma-raw/specs/components/` returns 9 files. All 9 are covered below.

### B.0 Summary table

| # | Figma component | id | Type / variants | App equivalent | file:line | Verdict |
|---|---|---|---|---|---|---|
| 1 | Genders | `55:61` | SET, 2 (Male/Female) | Narrator-voice gender toggle | `index.html:150-155`, `app.js:4228-4258` | present, colour delta |
| 2 | Rules | `55:138` | SET, 2 (Official/House) | `.rule-tabs` + `.rule-hint` | `index.html:92-98`, `109-115`; `app.js:1129-1144` | present, **copy contradiction** |
| 3 | Role Toggle | `55:215` | SET, 2 (Off/On) | `.setting-row` + `.setting-sub-row` | `index.html:88-135` | present, structural match |
| 4 | Toggle | `69:265` | SET, 2 (On/Off) | `label.toggle > input + .slider` | `index.html:90` etc.; `app.css:860-878` | present, colour delta |
| 5 | Membership Card | `77:528` | SET, **10** | `#role-card` front/back + peel | `index.html:210-241`; `app.js:1235-1274` | present, **full palette divergence** |
| 6 | Lovers | `257:686` | COMPONENT | `#lover-badge` | `index.html:216`; `app.js:1250-1254`; `app.css:1175-1189` | present, colour + copy delta |
| 7 | Tabs | `185:1613` | SET, 2 (Left/Right) | `.eh-tabs` / `.eh-tab` | `index.html:336-338`; `app.js:2250-2266` | present, styling delta |
| 8 | Thumbs | `225:918` | SET, 4 (up/down × sm/md) | `THUMB_UP_ART` / `THUMB_DOWN_ART` | `app.js:4322-4323`, `2243`; `index.html:327-328` | present, **asset-class delta** |
| 9 | Game Tabs | `287:3437` | SET, 2 (Events/Players) | `#event-history` panels | `index.html:336-345`; `app.js:2151-2266` | present in-game, **absent from game-over** |

Not on the Components page but referenced by it: `Heart` (`256:472`, size-16 variant) — instanced inside Lovers and inside every View-game-details lover row. App equivalent: `HEART_ART` pixel grid (`app.js:3774`, `4360-4361`).

---

### B.1 Genders (`55:61`)

- **App equivalent:** the narrator **voice** gender selector, not a player attribute. Confirmed by the only instance site in the whole file: `docs/figma-raw/specs/game-menu/45-466--lobby-host.md:153-165`, sitting under a "Narrator's voice" label. App: `#narrator-gender-control` with `data-gender="male|female"` buttons (`public/index.html:150-155`), wired at `public/app.js:4228-4245` sending `{type:"update_settings", settings:{narratorGender}}`, state writer `setGender()` at `app.js:4127-4131`.
- **Colour delta — SMALL.** Figma Male `#039BE5`, Female `#E876A0`, inactive = transparent + `#000000` text. App uses `aria-pressed` styling on `.narrator-gender-btn`; no per-gender hue.
- **App-only:** the control is greyed/inert while the accent is `"random"` (gender randomised per game — `app.js:4247-4258`, `4112-4113`). Figma has no disabled state for this component. **NO FIGMA EQUIVALENT.**

### B.2 Rules (`55:138`)

- **App equivalent:** `.rule-tabs` with `.rule-tab[data-mode="official|house"]` plus a `.rule-hint` line — two instances, `#doctor-mode-tabs`/`#doctor-mode-hint` (`index.html:93-97`) and `#joker-mode-tabs`/`#joker-mode-hint` (`index.html:110-114`). Sync logic `app.js:1129-1144`.
- **Structural match.** Figma: two 155×30 pills (active `#FF6C02` + white text; inactive transparent + black text) over a 10px 50%-opacity hint. App: same two-pill + hint shape.
- **BIG — copy contradicts shipped behaviour.** Figma `Rules=Official` hint: *"Save is secret – only victim is notified"*. App (`app.js:1133-1134`, and the same string in `index.html:97`): *"Save is secret from the living — no living player is told who was saved, not even the victim (the dead see everything)"*. These are opposite claims about whether the victim learns they were saved. The app's wording is the deliberate outcome of commit `50ea1fc` ("Doctor official mode: dead spectators once again see the doctor's chosen target … per owner ruling") and the earlier "official doctor secrecy" work. **The Figma text is stale relative to a ruled game rule.** **Decision needed (D7).**
- **SMALL — House hint copy drift.** Figma: *"Narrator reveals who is saved"*; app: *"Narrator announces who was saved"* (`app.js:1135`). Same meaning.
- **NO FIGMA EQUIVALENT:** the Joker rule pair. Figma's Rules component only ships the Doctor's two hint strings. The app also runs Official/House on the Joker — *"Game continues — Joker can haunt a voter"* / *"Game ends when Joker is executed"* (`app.js:1141-1143`).

### B.3 Role Toggle (`55:215`)

- **App equivalent:** a `.setting-row` (label + `label.toggle`) optionally followed by a `.setting-sub-row` holding the Rules block. Doctor: `index.html:88-98`. Joker: `index.html:105-115`. Sub-row visibility driven by `app.js:1126-1127` (`classList.toggle("hidden", !settings.enableDoctor)`).
- **Structural match — SMALL.** Figma `Toggle=Off` is 326×47 (label + switch); `Toggle=On` grows to 326×111 by revealing a "Rules Container". That is exactly the app's show/hide of `#doctor-mode-row`.
- **Coverage delta — SMALL.** Figma models this only for "Doctor". The app has 7 role toggles: doctor, detective, joker, hunter, vigilante, lovers, godfather (`index.html:88-135`), of which only doctor and joker carry a rules sub-row. Figma's single variant generalises cleanly. **INFERRED.**
- **NO FIGMA EQUIVALENT:** the Mafia Members `+`/`-` counter that sits above the toggles (`index.html:79-86`).

### B.4 Toggle (`69:265`)

- **App equivalent:** `<label class="toggle"><input type="checkbox"><span class="slider"></span></label>` (`index.html:90`, `102`, `107`, `119`, `124`, `129`, `134`, `440`, `451`). Styling `app.css:860-878`.
- **Colour delta — SMALL.** Figma On `#34C759`, Off `#787880 @16%`, knob `#FFFFFF` 27×27 with three stacked drop shadows, track 51×31 radius 100. App On = `var(--success)` = `#388e3c` (`app.css:54`, `877`), Off = `var(--bg-elevated)`, knob white, `translateX(20px)` (`app.css:878`). Different green, no layered shadow, different geometry.

### B.5 Membership Card (`77:528`) — 10 variants

- **App equivalent:** `#role-card` with `.card-front` (art / name / description / lover badge / bullet indicator / mini icon) and `.card-back` (`CARD_BACK_ART` + literal label "MEMBERSHIP CARD") plus a `.peel-flap` (`public/index.html:210-241`). Render: `updateRoleCard()` (`app.js:1235-1274`); text auto-fit `fitRoleCardText()` (`app.js:1281-1305`); back art swapped for the dead state at `app.js:428`, `608`, `737`, `925`.

**Per-variant accent colours — Figma vs app (verified hex, not approximated):**

| Figma variant | gradient end | text/accent | App CSS var | App hex (light / dark) | file:line | Relationship |
|---|---|---|---|---|---|---|
| `Role=Default` | `#AEB4BC` | `#000000` | *(card back)* | — | `index.html:235-238` | n/a |
| `Role=Citizen` | `#D1CFC7` | `#5C4B0D` | `--role-citizen` | `#388e3c` | `app.css:58` | cream/olive vs **green** |
| `Role=Mafia` | `#DC998F` | `#67281E` | `--role-mafia` | `#d32f2f` | `app.css:57` | dusty rose vs **fire red** |
| `Role=Doctor` | `#B3D1D6` | `#1E5C67` | `--role-doctor` | `#2196f3` | `app.css:59` | teal vs **blue** |
| `Role=Detective` | `#F9F9B4` | `#93791D` | `--role-detective` | `#9c27b0` | `app.css:60` | **yellow vs purple** |
| `Role=Joker` | `#C9B9D0` | `#511E67` | `--role-joker` | `#26c6da` / `#0097a7` | `app.css:61`, `254` | **purple vs cyan** |
| `Role=Hunter` | `#A9B8A4` | `#204B12` | `--role-hunter` | `#ef6c00` | `app.css:62` | **green vs orange** |
| `Role=Vigilante` | `#CDB198` | `#67401E` | `--role-vigilante` | `#7f8c8d` / `#5f6b6c` | `app.css:63`, `256` | tan vs **grey** |
| `Role=Godfather` | `#DC998F` | `#67281E` | `--role-godfather` | `#c9a227` | `app.css:65` | **same as Mafia vs distinct gold** |
| `Role=Dead` | `#AEB4BC` | `#000000` | *(no var)* | — | `app.js:608` `CARD_BACK_DEAD_ART` | n/a |
| *(none)* | — | — | `--role-lover` | `#e91e63` | `app.css:64` | see B.6 |

**BIG — this is a reassignment, not a re-tint.** Eight of eight roles change hue family. Two changes are *semantically hazardous*: Detective moves purple→yellow while Joker moves cyan→**purple**, so the app's existing Detective purple would, after a partial migration, read as Figma's Joker. Godfather collapses onto Mafia's exact swatch, erasing a distinction the app deliberately draws (`app.js:3777-3778` reveals GODFATHER separately; `app.css:65` gives it its own gold).

**Blast radius of `--role-*` — this is not a card-only change.** The same tokens drive: role-card borders and name colour (`app.css:1135-1153`), the roster modal's per-row accent `style="--rc:var(--role-${e.role})"` (`app.js:3331`), the slide-to-confirm tint set (`app.css:1622-1626`), the vigilante bullet indicator (`app.css:1159`), the lover badge (`app.css:1178`), the hunter panel chrome (`app.css:1290-1312`), the detective pixel-border colour (`app.css:1320`), the joker text accent (`app.css:1505`), and the game-over title colour (`app.js:3592-3595`). Any adoption must be all-or-nothing per token. **Decision needed (D8).**

**Other card deltas:**
- **BIG — role descriptions differ.** Figma card copy is short and second-person-imperative; the app's is longer and starts "You are the …":

  | Role | Figma (`77-528`) | App (`public/pixel-art.js:597-606`) |
  |---|---|---|
  | Citizen | "Work together to execute the mafia members" | "You are a Citizen. Find and eliminate the Mafia to win." |
  | Mafia | "Eliminate citizens until you outnumber them" | "You are the Mafia. Eliminate citizens until you outnumber them." |
  | Doctor | "Save a citizen from the wrath of the mafia" | "You are the Doctor. Each night, choose one player to protect from the Mafia." |
  | Detective | "Investigate players to find the hiding mafia" | "You are the Detective. Each night, investigate one player to discover if they are Mafia." |
  | Joker | "Win by getting executed during the day vote" | "You are the Joker. Win by getting yourself executed during the day vote." |
  | Hunter | "When killed, take a player down with you" | "You are the Hunter. If you die, you may take one player down with you." |
  | Vigilante | "You have one bullet you can use the entire game" | "You are the Vigilante. You have ONE bullet for the entire game. Each night you may shoot one player — or hold your fire and keep the bullet. Friendly fire is allowed." |
  | Godfather | "Appear as innocent to the detective - eliminate the citizens til you outnumber them" | "You are the Godfather. You run the Mafia and appear INNOCENT to the Detective. Win with the Mafia." |
  | Dead | "Stay quiet and continue to watch the town" | *(dead poster)* "stay quiet. you can still watch the town squirm." (`index.html:393`) |

  The Vigilante gap is the widest: Figma's line omits hold-fire and friendly-fire, both of which are real mechanics the app surfaces. **Decision needed (D9).**
- **SMALL — card-front chrome.** Figma `Role=Default` reads "Your role is / ? / Peel to reveal" with a 28×28 corner peel affordance. App's back reads "MEMBERSHIP CARD" over `CARD_BACK_ART` with a `.peel-flap` (`index.html:236-239`) and a real sweep animation (`app.js:1416-1439`). Same idea, different copy: **the app never says "Peel to reveal"**.
- **SMALL — art class.** Figma uses 78×78 raster fills per role; app uses `getRoleImage(role, variant)` pixel-art SVGs with per-player art variants (`app.js:1246`, `myVariant` at `app.js:1231`). Figma has no variant concept.
- **NO FIGMA EQUIVALENT:** the vigilante bullet indicator (`index.html:217`, `app.js:1268`), the mini quick-peek role icon (`index.html:218`), and the lover heart-balloon (`index.html:219-233`, `app.js:1263-1267`).

### B.6 Lovers (`257:686`)

- **App equivalent:** `#lover-badge` — `<div id="lover-badge" class="lover-badge hidden"><span class="lover-badge-icon"></span> Lover</div>` (`public/index.html:216`), shown/hidden by `app.js:1250-1254`, heart injected at `app.js:4360-4361`, styled `app.css:1175-1189`.
- **BIG — colour.** Figma chip fill `#AD1F1C` (brick red) with `#F5F5F5` text and a `#F5F5F5` 1.6px heart stroke. App uses `--role-lover: #e91e63` (`app.css:64`, `1178`) — hot pink. Not adjacent hues.
- **SMALL — copy.** Figma label "Lovers" (plural). App label "Lover" (singular). The app's is arguably correct on a personal role card; Figma's plural fits the pair-level chip. Also inconsistent *within* Figma: the game-over detail rows use a bare heart icon with **no** "Lovers" label at all (`278:2810` rows for dale/kevin).
- **Geometry:** Figma 83×32, pad 8, radius 8, gap 8, 16px heart. App badge is inline within the card front.

### B.7 Tabs (`185:1613`)

- **App equivalent:** `.eh-tabs` containing `.eh-tab[data-tab="events"|"players"]` (`public/index.html:336-338`); click handler `app.js:2250-2258`; programmatic reset `resetEventHistoryTabs(defaultTab)` `app.js:2260-2266`.
- **Content match — exact.** Figma labels are literally "Events" and "Players".
- **SMALL — styling.** Figma active pill = `#FF6C02` fill + `#FFFFFF` text, inactive = transparent + `#000000`; two 155×30 pills, gap 16, radius 8. App active = `var(--bg-elevated)` + `var(--text)` with a stepped pixel `clip-path`; inactive = transparent + `var(--text-secondary)` (`app.css:2086-2106`). No orange.
- **App-only behaviour:** the tab set is force-reset to `"players"` on one code path (`app.js:437`) and to `"events"` elsewhere (`app.js:634`, `3844`). Figma models only manual toggling. **SMALL.**

### B.8 Thumbs (`225:918`)

- **App equivalent — two distinct uses:**
  1. **Day vote buttons.** `#btn-vote-yes` / `#btn-vote-no` (`public/index.html:327-328`), filled at boot with `pixelArtToSvg(THUMB_UP_ART)` / `THUMB_DOWN_ART` (`app.js:4322-4323`), handlers `app.js:3172-3190`, styling `app.css:547-556` (80×80, `--success` `#388e3c` / `--danger` `#b3202a`, stepped clip-path, `.selected` white outline).
  2. **Detective result tags** in the Players panel — thumbs-down for MAFIA, thumbs-up for clear (`app.js:2243`).
- **BIG — asset class.** Figma uses raster emoji image fills (`b7bdd4e3…` up, `6d85ad43…` down — the yellow Apple-style 👍/👎) at 14px and 32px. App uses monochrome-able 10×10 pixel-art SVGs with `image-rendering: pixelated` (`app.css:553`). A raster emoji cannot be recoloured, cannot be pixel-crisp at 40px, and breaks the app's entire pixel-art idiom. Migrating means either shipping the PNGs or redrawing them as grids in `public/pixel-art.js`. **Decision needed (D10).**
- **SMALL — button chrome.** In the day-vote frame (`specs/day-actions/270-1649--voting.md:84-96`) the thumbs sit inside 173×100 CTAs filled `#66BB6A` (yes) / `#E53935` (no) vs the app's `#388e3c` / `#b3202a`. Also Figma's vote buttons are wide rectangles; the app's are 80×80 squares.
- **Size variants:** Figma ships Small (14) and Medium (32). App uses 40px in the vote button (`app.css:553`) and an unsized inline SVG in the detective tag. **SMALL.**

### B.9 Game Tabs (`287:3437`)

- **App equivalent:** the `#event-history` block — `.eh-tabs` header + `#eh-panel-events`/`#event-history-list` + `#eh-panel-players`/`#player-status-list` (`public/index.html:336-345`). Events rendered `app.js:2151-2205`; players rendered `updatePlayerStatus()` `app.js:2210-2247`.
- **Events tab — near-exact content match.** Figma's sample rows are `Round N` headers with `<name> - <cause>`: "jenny - died in the night", "kevin - saved by doctor", "mo - executed by vote", "dale - shot by vigilante", "kevin - haunted by the joker", "natasha - shot by the hunter", "chirstopher - died of heartbreak" *(sic — typo in the Figma text)*. App `EVENT_LABELS` (`app.js:2151-2163`): `death`/`kill`/`joker_haunt`/`vigilante_shot` → "Died in the night", `save` → "Saved by Doctor", `execution` → "Executed", `lover_death` → "Died of heartbreak", `hunter_revenge` → "Shot by the Hunter", `spared` → "Spared by vote", plus `investigation_mafia`/`investigation_clear`.
  - **BIG — Figma leaks night causes the app deliberately hides.** Figma's live in-game Events tab shows "shot by vigilante", "haunted by the joker" and a *named* doctor save. The app's in-game feed collapses **all** direct night kills to the neutral "Died in the night" (`app.js:2153`, `2158`, `2160`, and the comment at `app.js:2164-2165`: *"Living clients only ever receive the neutral 'death' type for DIRECT night kills (projectEventsForClients)"*). Only the **post-game** `GAME_HISTORY_LABELS` (`app.js:3604-3613`) uses the specific causes. Figma's Events tab is drawn with post-game detail on an in-game surface. **Decision needed (D11).** *(Component is Components-page scope; the leak is a rules/privacy issue, flagged here because the strings live in this component.)*
  - **SMALL — label wording.** "saved by doctor" vs "Saved by Doctor"; "executed by vote" vs "Executed"; Figma has no `spared` row.
- **Players tab.** Figma: name + a 14px colour dot, dead rows at `opacity=30%`. App: `.player-status-dot` coloured from `p.color` for **alive** players only (`app.js:2232` — `p.isAlive && p.color`), `.player-status-name` classed `alive`/`dead`, sorted dead-first by `deathOrder` (`app.js:2213-2219`). **SMALL** (dim-vs-decolour, and Figma's list is not death-ordered).
  - **NO FIGMA EQUIVALENT:** the mafia teammate tag / Godfather crown tag (`app.js:2242`) and the detective investigation thumbs (`app.js:2243`) that overlay this same list.
- **BIG (section-level) — Game Tabs is never instanced in the Game Over section.** `grep -rn 'of set "Game Tabs"' docs/figma-raw/specs/` hits only `specs/night-actions/*` and `specs/day-actions/*`. The app *does* render round-grouped history on the game-over screen (`#game-history`, `app.js:3617-3679`). See **D2**.

---

## C. App game-over / global states with NO Figma frame

Each verified in code; none appears in any of the 10 Game Over specs.

| # | App state | file:line | Note |
|---|---|---|---|
| C1 | **Force-ended game** — title "Game Over", `win-neutral` trophy, no winner colour, no suspense | `app.js:3558-3562`, `3576-3580`, `3587-3589` | Figma has only 3 win outcomes. Reachable via admin `end_game` (`src/server.ts` `end_game` allowed at every phase incl. lobby), active-admin-leave, and the 2-hour room sweep (`src/game-engine.ts:704-726` docstring, class (a)) |
| C2 | **Admin "Play Again" (same settings)** | `index.html:367`, `app.js:3822-3825`, `src/server.ts:1901` | one-tap restart; no Figma CTA |
| C3 | **Admin "Close Room"** + its confirm sheet | `index.html:369`, `app.js:3855-3860`, `src/server.ts:1883` | destructive; confirm-sheet pattern also unmodelled here |
| C4 | **"Leave Room"** header button, always present on `#screen-gameover` | `index.html:357-359`, `app.js:3832-3849` | Figma game-over frames have no header/chrome row at all |
| C5 | **`#game-history`** round-grouped post-game event list | `index.html:364`, `app.js:3604-3679` | see D2 |
| C6 | **`#joker-win-overlay`** — click-to-dismiss "THE LAST LAUGH" poster | `index.html:402-410`, `app.js:3256-3270`, fired at `app.js:524-525` and `610` | fires mid-game on joker execution, *before* game-over in official mode |
| C7 | **Joint joker victory** (`jokerJointWinner`) — trophy on the joker's reveal row + "You achieved a joint victory!" | `app.js:3556`, `3776`, `3269`; wire field `src/game-engine.ts:742` | Figma's 3 bands are mutually exclusive |
| C8 | **Godfather reveal** as `GODFATHER` rather than `MAFIA` | `app.js:3777-3778`, `3781` | Figma detail frames show only `Mafia`; Membership Card gives Godfather Mafia's exact swatch |
| C9 | **Alive/dead marking in the reveal** (`DEAD` tag + `.dead` row class) | `app.js:3772`, `3775` | Figma detail rows are uniform |
| C10 | **Lover partner *name*** in the reveal (heart + username) | `app.js:3753-3760`, `3774` | Figma shows a bare heart |
| C11 | **Mafia-last sort + staggered reveal** (300ms/card, +800ms pre-mafia pause, CTAs gated behind it) | `app.js:3762-3767`, `3790-3819` | Figma's detail screen is static |
| C12 | **`player_return_to_lobby` vs `return_to_lobby`** — two different wire messages behind one Figma CTA | `app.js:3829` / `3852`; `src/server.ts:1865` / `1995` | |
| C13 | **Light theme** | `app.css:52-65` (light block) vs `app.css:254-256` (dark overrides) | all 10 Figma frames are `fill: #000000` only |
| C14 | **`window.__gameOverHistoryLabels`** test seam | `app.js:3614-3615` | existing regression hook; keep if D2 retains history |
| C15 | **Room-code / reconnect chrome** on game over | `app.js:1098-1101` (`leave_game` navigation guard covers `#screen-gameover`) | |

---

## D. Decisions needed from Hanson

**D1 — Admin game-over controls: keep three, or collapse to one?**
Figma `332:6290` offers only "Return to lobby" (→ Lobby/Host). The app ships Play Again / New Settings / Close Room + Leave Room (`index.html:366-370`, `358`). The annotation covers only `return_to_lobby`. Dropping `restart_game` costs the host a lap through the lobby on every rematch. *Options:* (a) adopt Figma literally and retire `restart_game`'s UI (message stays wired); (b) keep the triad and treat the Figma frame as the player variant only; (c) Figma layout + a "Play again" primary alongside "Return to lobby". **Blocks:** the e2e in A.2/A.10.

**D2 — Does the post-game round history survive?**
No Game Over frame instances the Game Tabs component; the app renders `#game-history` there today (`app.js:3617-3679`). Adopting Figma deletes it. *Options:* (a) drop it (Figma as drawn); (b) add a Game Tabs instance to View-game-details, giving the details screen its own Events/Players tabs; (c) keep it inline below the roster. Note (b) is nearly free — the component already exists and its Events copy already matches the app's post-game labels.

**D3 — Canonical win narration vs the randomised pools.**
Figma specifies one exact line per winner. The app picks at random from `TOWN_WIN_MESSAGES` / `MAFIA_WIN_MESSAGES` / `JOKER_WIN_MESSAGES` (`src/narrator.ts:293-298`, `281-283`). *Options:* (a) add the three Figma lines to the pools; (b) make the Figma line canonical for the game-over screen while the pool keeps feeding the narrator transcript; (c) collapse the pools. Note the Joker line is name-parameterised and already matches the app's template shape.

**D4 — Figma spec bug: the Citizen chip wears the Vigilante swatch.**
All three View-game-details frames render "Citizen" as fill `#CDB198` / text `#67401E`, which is `Role=Vigilante` from the Membership Card set; the Citizen card is `#D1CFC7` / `#5C4B0D`. Mafia, Detective, Doctor and Hunter chips all match their cards. Confirm which is intended before any token is written.

**D5 — Figma spec nit: Citizens glow is `#E3DAB5` "Before" but `#E3CBB5` "After"** (`278:2772` vs `278:2780`, and the same split inside `278:2810`'s skull). Mafia and Joker use one value throughout. One-digit typo or intentional warming?

**D6 — What happens to the Joker win overlay and joint victories?**
Figma folds joker celebration into the victory screen; the app has a separate `#joker-win-overlay` that fires *mid-game* on the joker's execution (official mode: the game continues afterwards) and also carries the joint-win message (`app.js:524-525`, `3263-3270`). *Options:* (a) keep the overlay as an unmodelled app extra; (b) draw a Figma frame for it; (c) retire it and move everything to game-over — which breaks official-mode Joker, where the win is announced before the game ends.

**D7 — Doctor Official rule copy: which text is true?**
Figma Rules `Rules=Official`: *"Save is secret – only victim is notified."* App: *"Save is secret from the living — no living player is told who was saved, not even the victim (the dead see everything)"* (`app.js:1133-1134`, `index.html:97`), which is the ruled behaviour per commit `50ea1fc`. These contradict. Assumed the app is correct and the Figma string is stale — **confirm**, because if Figma is right the engine's doctor-secrecy path changes, not just the copy.

**D8 — Adopt the Figma role palette wholesale, partially, or not at all?**
All 8 roles change hue family (§B.5). Detective purple→yellow while Joker cyan→**purple** means a partial migration makes the app's Detective read as the new Joker. Godfather collapses onto Mafia's exact swatch, erasing a distinction the app draws in the reveal (`app.js:3777-3778`). The `--role-*` tokens feed 10+ surfaces (`app.css:1135-1153`, `1159`, `1178`, `1290-1320`, `1505`, `1622-1626`; `app.js:3331`, `3592-3595`). Recommend all-or-nothing per token, and an explicit ruling on Godfather.

**D9 — Role card description copy: Figma's short imperatives or the app's current lines?**
Full diff in §B.5. The Vigilante is the material one — Figma's *"You have one bullet you can use the entire game"* drops hold-fire and friendly-fire, both real mechanics the app currently states.

**D10 — Thumbs: ship the raster emoji or redraw as pixel art?**
Figma's Thumbs component is two emoji PNG fills; the app renders `THUMB_UP_ART` / `THUMB_DOWN_ART` pixel grids (`app.js:4322-4323`, `2243`). Rasters can't be recoloured or kept crisp at 40px and clash with the pixel-art system in `public/pixel-art.js`.

**D11 — Game Tabs Events copy leaks night causes.**
Figma's in-game Events tab shows "shot by vigilante", "haunted by the joker" and a named doctor save. The app deliberately collapses all direct night kills to "Died in the night" for living clients (`app.js:2151-2165`, projection in the engine). Assumed the Figma sample is illustrative post-game content pasted onto an in-game surface — **confirm**, because implementing it as drawn would be a privacy regression against the shipped projection.

**D12 — Does the game-over reveal keep the app's disclosures?**
Six data points the app shows and Figma's detail frame does not: alive/dead, Godfather-vs-Mafia, joint-win trophy, lover partner name, mafia-last ordering, and the staggered reveal (C8–C11). Each is a deliberate app behaviour with test coverage implications. Confirm keep/drop per item before the reveal is redrawn.

**D13 — Force-ended games need a frame.**
C1 has no Figma representation (neutral "Game Over", no winner, no narrative, reachable from admin `end_game`, admin-leave, and the 2-hour sweep). Either draw a fourth outcome or specify a fallback (e.g. reuse the Citizens frame with a neutral header and no narrative body).

---

## Appendix — verification notes

- **Verified** by direct file read: every Figma hex, node id, wiring edge, and frame count above; every app `file:line` citation.
- **INFERRED** and labelled inline: (a) the invisible-CTA click targets on the Mafia/Joker victory screens are a prototype artefact (A.4); (b) the admin band is orthogonal to the winner bands rather than a fourth outcome (A.10); (c) Role Toggle generalises from Doctor to all 7 app toggles (B.3); (d) the absence of Vigilante/Joker/Godfather chips from the detail frames is sample-data thinness, not a rule (A.3).
- **Not verified:** the visual content of the raster fill assets (`c902a3b3…` campfire, `6252da56…` revolver, `f0e46bd3…` jester) is read from `game-over--overview.png` at 1.19x, not from the PNGs themselves.
- **Method note:** the "10 game-over frames / 9 component entries" premise in the brief was checked against the directory listings before mapping and holds exactly.
