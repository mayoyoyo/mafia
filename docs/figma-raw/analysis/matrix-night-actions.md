# Figma ↔ App Coverage Matrix — NIGHT ACTIONS (37 frames)

**Scope:** the `Night Actions` Figma section (37 frames in `docs/figma-raw/specs/night-actions/`) vs the live client
(`public/index.html`, `public/app.js`, `public/app.css`). Engine (`src/game-engine.ts`, `src/narrator.ts`,
`src/server.ts`) is read-only reference — cited only to establish what the app *does* say / *does* reveal.

**Ground-truth rule:** every claim below cites a Figma spec file, `docs/figma-raw/rest/wiring.md`, the overview PNG
(`docs/figma-raw/screenshots/night-actions--overview.png`), or `file:line`. Anything not directly readable from those
is tagged **INFERRED**.

**Delta sizing**
- `SMALL` — pure paint / copy swap. No message flow change, no new server field, no new privacy surface.
- `BIG` — user-visible behavior change: new/removed interaction step, new server field, or a change to *what
  information is on screen for whom*. Every BIG names the e2e playtest assertion it needs.
- `PRIVACY` — the Figma screen displays information the app deliberately withholds from that viewer, or removes a
  concealment the app deliberately maintains. Always also BIG.

---

## 0. Method & frame roster

37 spec files, verified by `ls | wc -l` = 37. Grouped by the overview PNG's own swimlane labels
(`night-actions--overview.png`, left-hand row labels): Admin controls, Death flow, Citizen flow, Mafia/Godfather flow,
Doctor flow, Detective flow, Hunter flow, Vigilante flow, Joker flow.

| # | Frame file | Figma id | Flow lane |
|---|---|---|---|
| 1 | `74-335--main-game-screen.md` | `74:335` | Citizen |
| 2 | `130-243--main-game-screen-players.md` | `130:243` | Citizen |
| 3 | `130-323--mafia-nominate.md` | `130:323` | Mafia |
| 4 | `135-489--various-states.md` | `135:489` | Mafia |
| 5 | `135-763--confirmed-kill.md` | `135:763` | Mafia |
| 6 | `278-2401--force-dawn-button.md` | `278:2401` | Admin |
| 7 | `278-2596--force-dawn-confirm.md` | `278:2596` | Admin |
| 8 | `135-961--doctor.md` | `135:961` | Doctor |
| 9 | `130-529--save-a-player.md` | `130:529` | Doctor |
| 10 | `135-894--save-confirmed.md` | `135:894` | Doctor |
| 11 | `130-625--detective.md` | `130:625` | Detective |
| 12 | `140-1186--investigate.md` | `140:1186` | Detective |
| 13 | `140-1261--investigation-confirmed.md` | `140:1261` | Detective |
| 14 | `130-573--hunter.md` | `130:573` | Hunter |
| 15 | `225-364--kill.md` | `225:364` | Hunter |
| 16 | `257-1726--kill.md` | `257:1726` | Hunter |
| 17 | `225-427--kill-confirmed.md` | `225:427` | Hunter |
| 18 | `225-490--spared.md` | `225:490` | Hunter |
| 19 | `225-657--hunter-killed.md` | `225:657` | Hunter (non-hunter POV) |
| 20 | `225-542--vigilante.md` | `225:542` | Vigilante |
| 21 | `234-1332--shoot.md` | `234:1332` | Vigilante |
| 22 | `257-1655--shoot.md` | `257:1655` | Vigilante |
| 23 | `234-1444--confirmed-kill.md` | `234:1444` | Vigilante |
| 24 | `234-1397--hold-fire.md` | `234:1397` | Vigilante |
| 25 | `257-875--joker.md` | `257:875` | Joker |
| 26 | `257-1530--joker.md` | `257:1530` | Joker |
| 27 | `257-1595--joker.md` | `257:1595` | Joker |
| 28 | `245-344--death-by-mafia.md` | `245:344` | Death |
| 29 | `254-848--death-by-vote.md` | `254:848` | Death |
| 30 | `254-865--death-by-heartbreak.md` | `254:865` | Death |
| 31 | `245-422--spectating-mafia.md` | `245:422` | Death/spectate |
| 32 | `245-716--spectating-doctor.md` | `245:716` | Death/spectate |
| 33 | `253-430--fallen-doctor.md` | `253:430` | Death/spectate |
| 34 | `245-615--spectating-detective.md` | `245:615` | Death/spectate |
| 35 | `254-686--fallen-detective.md` | `254:686` | Death/spectate |
| 36 | `254-522--spectating-vigilante.md` | `254:522` | Death/spectate |
| 37 | `254-627--spectating-vigilante.md` (Joker lynched) | `254:627` | Death/spectate |

---

## 1. GLOBAL deltas (apply to every frame that carries the shared chrome)

These repeat across 34 of 37 frames (all but the three full-bleed death overlays `245:344`, `254:848`, `254:865`).
Listed once here; per-frame sections below reference them as **G1–G7** rather than repeating.

### G1 — Nav bar: room code chip has NO APP EQUIVALENT in the game header — SMALL
- **Figma:** every night frame's `FRAME "Nav"` carries `TEXT "Code"` (50% opacity) + `TEXT "E92G"` in `#FF6C02`,
  plus a 24x24 `"icon"` vector and an `INSTANCE "Settings"` (`130-323--mafia-nominate.md:26-43`).
- **App:** `.game-header` (`public/index.html:194-202`) contains only `#phase-indicator`, `#round-indicator`,
  `#day-timer`, `#btn-roster`, `#btn-settings`. The room code lives inside the settings modal
  (`#settings-room-code-value`, per `app-screen-inventory.md` §Modals/1). No code chip in the header.
- **Delta:** add a header code chip + move/duplicate the roster icon. Pure chrome. SMALL.

### G2 — Nav phase/round formatting — SMALL
- **Figma:** `TEXT "Night 🌙"` and `TEXT "Round 4"` separated by `LINE "Line 5"`, Grandstander 16px
  (`130-323--mafia-nominate.md:16-25`).
- **App:** `#phase-indicator` is set to `pixelArtToSvg(MOON_ART) + " " + msg.phase.toUpperCase()` →
  renders "🌙 NIGHT" as pixel-art SVG + uppercase text (`public/app.js:744-750`); `#round-indicator` is literal
  `Round <span id="round-number">1</span>` (`public/index.html:196`).
- **Delta:** case (`NIGHT` vs `Night`), moon as pixel-SVG vs emoji glyph, divider line. SMALL.

### G3 — Role card ("Membership Card") copy is rewritten — SMALL (but 8 strings)
- **Figma** uses `TEXT "Your role is"` + Title-case role name + a short one-liner. **App** uses
  `#role-name` = `displayRole.toUpperCase()` and `#role-description` = `ROLE_DESCRIPTIONS[displayRole]`
  (`public/app.js:1241-1242`), which are second-person sentences.

| Role | Figma string | App string (`public/pixel-art.js`) |
|---|---|---|
| Citizen | `"Work together to execute the mafia members"` (`74-335:38`) | `"You are a Citizen. Find and eliminate the Mafia to win."` (`:598`) |
| Mafia | `"Eliminate citizens until you outnumber them"` (`130-323:57`) | `"You are the Mafia. Eliminate citizens until you outnumber them."` (`:599`) |
| Doctor | `"Save a citizen from the wrath of the mafia"` (`130-529`) | `"You are the Doctor. Each night, choose one player to protect from the Mafia."` (`:600`) |
| Detective | `"Investigate players to find the hiding mafia"` (`130-625`) | `"You are the Detective. Each night, investigate one player to discover if they are Mafia."` (`:601`) |
| Joker | `"Win by getting executed during the day vote"` (`257-875`) | `"You are the Joker. Win by getting yourself executed during the day vote."` (`:602`) |
| Hunter | `"When killed, take a player down with you"` (`130-573:37`) | `"You are the Hunter. If you die, you may take one player down with you."` (`:603`) |
| Vigilante | `"You have one bullet you can use the entire game"` (`225-542`) | `"You are the Vigilante. You have ONE bullet for the entire game. Each night you may shoot one player — or hold your fire and keep the bullet. Friendly fire is allowed."` (`:604`) |
| Dead | `"Stay quiet and continue to watch the town"` (`245-422`) | *(no equivalent — the app's dead card shows `CARD_BACK_DEAD_ART`, `public/app.js:608`)* |

- **Note:** Figma's Vigilante line drops "friendly fire is allowed" — a rules-relevant fact. See Decision D7.
- **Godfather has no Figma card variant** despite the overview lane being labelled "Mafia / Godfather flow" — see §5.1.

### G4 — "Game Tabs" component ↔ `#event-history` — SMALL structurally
- **Figma:** `INSTANCE "Game Tabs"` = `Tabs(Events|Players)` + `Round 01..04` rows with a `LINE "Divider"` between
  each (`130-323--mafia-nominate.md:96-151`). Tab switch is a real prototype hotspot
  (`RECTANGLE "tab-hotspot-players"`, wiring.md:173-176).
- **App:** `#event-history` with `.eh-tabs` → `#eh-panel-events` / `#eh-panel-players`
  (`public/index.html:335-341`); rounds grouped by `event-history-round` header (`public/app.js:2192-2196`).
- **Delta:** dividers, card treatment, 2px white stroke. SMALL.

### G5 — 🚩 **PRIVACY / BIG** — the Events-tab sample copy leaks night causes to LIVING players
- **Figma:** the shared Game Tabs instance renders `TEXT "dale - shot by vigilante"` under `Round 3`
  (`130-323--mafia-nominate.md:137-140`) and `TEXT "jenny - died in the night"` under Round 1. The
  "shot by vigilante" line appears on **30 of the 37 frames** — including every LIVING-player frame
  (`74:335` Citizen, `130:323` Mafia, `130:529` Doctor, `130:625` Detective, `130:573` Hunter, `225:542` Vigilante,
  `257:875` Joker, both Force Dawn frames…).
- **App:** the in-game events tab deliberately neutralises every night-death cause. `EVENT_LABELS`
  (`public/app.js:2150-2161`) maps `kill`, `death`, `joker_haunt`, **and `vigilante_shot`** all to the single
  string `"Died in the night"`, and `NIGHT_DEATH_CLASS` (`public/app.js:2169`) forces them to a shared CSS class
  so even the class attribute can't out the cause. The comment at `public/app.js:2143-2149` states the intent
  explicitly: *"naming the mafia / vigilante / joker / heartbreak here would re-leak exactly what the dawn fix hides."*
  Server-side, living clients only ever receive the neutral `death` type (`projectEventsForClients`, referenced
  `public/app.js:2162-2165`).
- **Delta: BIG + PRIVACY.** If the reskin copies the Figma sample text into the events renderer it re-opens a
  closed leak on 30 screens at once.
- **e2e assertion:** with vigilante enabled, run a night where the vigilante shoots and the mafia kills; assert a
  LIVING non-vigilante client's `#event-history-list` contains **zero** occurrences of `/vigilante|shot|stabbed|haunt/i`
  and that both deaths render the identical label `"Died in the night"` with the identical CSS class.
  (Existing coverage to extend rather than duplicate: search `tests/` for the projectEventsForClients / neutral-label suite.)

### G6 — Narrator area is absent from every Figma night frame — BIG
- **App:** `#narrator-area` (label `"Narrator"` + `#btn-transcript` + `#narrator-messages`) is *persistent chrome* on
  `#screen-game` (`public/index.html:245-252`), and the night narration is the game's primary audio/text channel
  (`narrator_message`, `sound_cue`, `HOLD_GATE_PROMPTS`).
- **Figma:** no night frame contains a narrator block — the vertical `Container` goes Nav → Membership Card →
  prompt → Players → Game Tabs (e.g. `130-323--mafia-nominate.md:13-96`).
- **Delta: BIG.** Either the narrator moves into the Game Tabs area, becomes an overlay, or the Figma frames are
  incomplete. See Decision D1. Not privacy-affecting (narrator copy is already public), but it silently deletes the
  transcript entry point.
- **e2e assertion:** after `narrator_ready`, a living client can still reach the full transcript (`#modal-transcript`
  non-empty) from the night screen.

### G7 — No suspense/NIGHTFALL overlay frames — SMALL (out of section, note only)
`#suspense-overlay` (`app-screen-inventory.md` §Overlays/3) fires between day→night and at dawn. No Night Actions
frame covers it; it may live in another Figma section. Flagged so it isn't read as "delete the overlay."

---

## 2. CITIZEN FLOW

### Frame 1 — `74:335` "Main game screen" (Citizen, Events tab)
1. **App state / anchor:** `#screen-game`, `data-phase="night"`, role `citizen`. Citizens receive **no**
   `*_targets` message, so `#night-actions` stays hidden (`public/app.js:753`, panel only un-hidden by
   `showNightAction`, `public/app.js:2299-2300`). Visible: `#role-card`, `#narrator-area`, `#event-history`.
   Anchors: `public/index.html:210-244` (card), `:335-347` (events).
2. **Visual deltas:** G1–G4. Figma card is `Role=Citizen` gradient + 78x78 image fill
   (`74-335--main-game-screen.md:31-41`); app uses `getRoleImage()` pixel-art SVG + `ROLE_COLORS.citizen`
   (`public/app.js:1239-1246`). Figma shows a `Lovers` chip *inside* the card (`74-335:38-42`) — see below.
3. **Copy deltas:**
   - Figma `TEXT "The town goes to sleep...🌙"` (`74-335:44-45`) — **NO APP EQUIVALENT.** grep for
     `"goes to sleep"` across `public/app.js` + `src/narrator.ts` returns nothing; the app leaves the citizen with
     no night status line at all. New string.
   - Figma `TEXT "Lovers"` chip (`74-335:42`) vs app `#lover-badge` literal text `" Lover"` (singular,
     `public/index.html:216`), shown when `isLover` (`public/app.js:1250-1254`). Copy delta SMALL.
   - G3 citizen description.
4. **Flow deltas:** none — this is a terminal idle state. Adding the sleep line is **SMALL** (a static string shown
   when `phase==="night"` and no night panel is active). One caveat: the line must be gated on *no night panel
   active*, not on `myRole==="citizen"` — otherwise a doctor whose sub-phase already closed
   (`public/app.js:466-473` hides `#night-actions` on its own `<role>_close` cue) would show nothing at all.
5. **Privacy:** none. The line is role-agnostic and reveals nothing. ✅ Actually *improves* shoulder-surf safety by
   giving every role the same neutral idle screen after its sub-phase closes.

### Frame 2 — `130:243` "Main game screen (Players)" (Citizen, Players tab)
Identical to Frame 1 with `Game Tabs` on `Position=Players`. Maps to `#eh-panel-players`
(`app-screen-inventory.md` §5). Deltas: G1–G5 + the sleep line. No new privacy surface — but see Decision D9
(what the Players tab may show at night; the app's `updatePlayerStatus()` alive/dead roster is already public).

---

## 3. MAFIA / GODFATHER FLOW

### Frame 3 — `130:323` "Mafia / Nominate" (idle target list)
1. **App state / anchor:** `mafia_targets` → `showNightAction("Choose a victim", msg.players, "mafia_vote")`
   (`public/app.js:477-479`). Panel `#night-actions` (`public/index.html:274-286`); list `#action-targets`
   rendered by `renderMafiaTargetCards` (multi-mafia) or `renderSingleMafiaTargets` (solo)
   (`public/app.js:2330-2337`, `:2433-2449`, `:2453-2673`).
2. **Visual deltas:** G1–G5. Figma rows are flat `FRAME "CTA" 326x70 fill #232729` with just a name
   (`130-323:68-95`). App rows are `li.mafia-target-card` with a header (name + voter chips + state badge),
   an optional objection message, and an inline `.mtc-actions` button row
   (`public/app.js:2476-2541`, `:2544-2669`). **BIG structural difference** — the Figma row has no room for the
   Nominate / Spare / Lock In / Unlock / Remove Objection buttons that carry the whole mafia protocol.
3. **Copy deltas:** Figma `"Choose a victim"` (`130-323:63`) vs app `"Choose a victim"` (`public/app.js:478`) —
   **exact match.** ✅
4. **Flow deltas: BIG.** Figma's prototype wires the whole mafia flow as
   `130:323 → 135:489 (various states) → 135:763 (confirmed kill)` via a single CTA tap
   (`wiring.md:12-13`, `:9`). The app's real flow is a **server round-trip per vote**:
   tap Nominate → `{type:"mafia_vote", voteType:"maybe"}` → server `mafia_vote_update` → re-render
   (`public/app.js:2570`, `:2690-2736`); tap Lock In → `voteType:"lock"`; on unanimity the server sends
   `mafia_confirm_ready` → `handleMafiaConfirmReady` collapses the list and arms Confirm/Cancel
   (`public/app.js:532-534`, `:2925-2957`). Solo-mafia takes a different path entirely: an atomic maybe+lock pair
   (`sendMafiaMaybeLock`, `public/app.js:2286-2292`) with `#mafia-vote-status` force-hidden
   (`public/app.js:2332`).
   **e2e assertion:** 2-mafia game — client A Nominate(X) then Lock In(X); assert B's card for X shows the
   `1/2 locked` badge and A's initial chip *before* B locks; after B locks, assert both get
   `#action-confirm` visible with `#btn-action-confirm` text `"Kill"`; assert Cancel on A re-opens the picker for
   both (lock withdrawn, `public/app.js:2944-2956`).
5. **Privacy:** consistent. Voter chips (`voterName.charAt(0).toUpperCase()`, `public/app.js:2497`) are already
   mafia-visible in the app; Figma's `M`/`K` chips on `135:489`/`135:763` map to the same model (`M`=mo, `K`=kevin
   — both mafia in the sample roster). No delta.

### Frame 4 — `135:489` "Various states" (mafia, mid-vote)
1. **App state / anchor:** `renderMafiaTargetCards` mid-deliberation (`public/app.js:2453-2673`), plus
   `#action-confirm` armed for a target (`setupSlideConfirm("mafia", …)`, `public/app.js:1503-1510`).
2. **Visual deltas:**
   - Figma `"jenny - nominated"` row carries a single `INSTANCE "X" (Size=20)` (`135-489:44-48`) — i.e. a
     *withdraw* affordance. App equivalent: the `.mtc-btn-object` X-icon button, which sends
     `voteType:"letsnot"` (an **objection/Spare**, not a withdrawal) (`public/app.js:2653-2664`). **Semantics
     differ** — see Decision D3.
   - Figma `"natasha - kill?"` row shows a `Frame 25` circular chip `TEXT "K"` plus a Check/X pair
     (`Frame 23`, 38x38 each, `135-489:53-67`). App: chips render in the header
     (`.mtc-chips`, `public/app.js:2491-2514`) and the Check/X equivalent is the **panel-level**
     `#action-confirm` bar (`#btn-action-cancel` "Cancel" / `#btn-action-confirm` "Kill"),
     not a per-row control (`public/index.html:281-284`, `public/app.js:1499`).
   - **NO APP EQUIVALENT** in Figma for: the `Unanimous` badge, the `Blocked` badge, the
     `"Objected by X"` line, and the `Nominate` / `Spare` / `Lock In` / `Unlock` / `Locked elsewhere` /
     `Remove Objection` labelled buttons (`public/app.js:2517-2540`, `:2548-2651`).
3. **Copy deltas:**
   - Figma `"jenny - nominated"` vs app: no row-suffix at all; nomination is conveyed by card state class
     `suggested` + the chip (`public/app.js:2472-2473`, `:2496-2501`).
   - Figma `"natasha - kill?"` vs app: no `- kill?` suffix; selection is `.selected` class + the armed
     `#action-confirm`.
   - Figma badge `"1/2 locked"` (on `245:422`) vs app `counts.lock + "/" + aliveMafiaCount + " locked"`
     (`public/app.js:2530`) — **exact format match.** ✅
4. **Flow deltas: BIG** (per Frame 3). Additionally, the Figma per-row Check/X implies confirm happens *on the
   row*; the app confirms via a single bottom bar. Moving confirm into the row is a real interaction change and
   must preserve the M11 in-flight guard (`pendingMafiaLockTarget`, `public/app.js:2284-2292`) — a per-row confirm
   makes double-tap divergence easier to hit.
   **e2e assertion:** rapid double-tap Lock In on two different targets in the same tick sends exactly one
   `maybe`+`lock` pair and the highlighted row equals the locked target.
5. **Privacy:** consistent.

### Frame 5 — `135:763` "Confirmed kill" (mafia)
1. **App state / anchor:** post-`confirm_mafia_kill` collapsed view — `#action-targets` becomes
   `<li class="selected">{name} ✔</li>` (`public/app.js:2943`), or via `night_action_done`
   (`public/app.js:536-551`).
2. **Visual deltas:** Figma keeps the target row *and its `M` + `K` voter chips* visible after confirmation
   (`135-763:41-52`). See privacy below.
3. **Copy deltas:**
   - Figma prompt line becomes `TEXT "Natasha has been chosen"` (`135-763:39-40`).
   - App: `#action-title` **keeps** the original `"Choose a victim"`; the confirmation is carried by
     `#action-status` = `"The Mafia has chosen their victim."` (server, `src/server.ts:1394`) and the `✔` glyph on
     the collapsed row. Different slot **and** different string (Figma names the victim in the headline; app uses a
     name-free status line).
   - On rejoin the app uses yet another headline: `#action-title = "Target"` + `#action-status = "Action confirmed."`
     (`public/app.js:855-859`). No Figma frame for that variant.
4. **Flow deltas: SMALL** (copy/slot re-assignment) — *unless* the headline is made to name the victim, which is
   fine here (mafia already know) but must not be reused for the doctor/detective headlines (see Frames 10, 13).
5. **Privacy: BIG + PRIVACY (medium confidence).** The app *hides* the deliberation surface once the kill is
   confirmed: `handleMafiaConfirmReady` hides `#mafia-vote-status` (`public/app.js:2934`), and the mafia's own
   `mafia_close` sound cue hides the whole `#night-actions` panel **and** clears `#mafia-vote-details`
   (`public/app.js:466-473`) — the stated reason is *"so the finished action doesn't sit on screen (shoulder-surf
   risk) for the rest of the night."* Figma's confirmed state leaves the row and both voter chips on screen.
   Keeping them defeats the shoulder-surf teardown (a phone left face-up now shows *which* mafia locked in).
   **e2e assertion:** after `sound_cue {sound:"mafia_close"}` a mafia client has `#night-actions` hidden,
   `#mafia-vote-status` hidden, and `#mafia-vote-details` empty.

---

## 4. ADMIN CONTROLS

### Frame 6 — `278:2401` "Force Dawn button"
1. **App state / anchor:** `#admin-night-controls` → `#btn-force-dawn` (`public/index.html:348-351`), un-hidden
   for admin during night (`public/app.js:803`, `:1795`).
2. **Visual deltas:** Figma renders the button as an always-present `FRAME "CTA"` inside the page flow with a
   0%-opacity `Drawer` stub above it (`278-2401 vs 278-2596` diff, lines 86-100); the app's button lives in a
   dedicated bordered `.admin-controls` panel below the day-accuse area. G1–G5 also apply. SMALL.
3. **Copy deltas:** Figma `"Force dawn"` (lowercase d, `278-2401`) vs app `"Force Dawn"`
   (`public/index.html:350`). SMALL.
4. **Flow deltas:** none — `wiring.md:42` (`278:2458 → 278:2596`) matches the app: click opens the confirm sheet
   (`public/app.js:3102-3111`). SMALL.
5. **Privacy:** the admin's Force Dawn frame is drawn on a **Mafia** role card (`278-2401` uses
   `instance of 77:630 "Role=Mafia"`). That's just the sample; the app's admin keeps their own role card and
   retains admin rights alive or dead (`CLAUDE.md` §Game Rules). No delta — but there is **no Figma frame for a
   *dead* admin's night controls**, which the app does support. See §5.8.

### Frame 7 — `278:2596` "Force Dawn confirm"
1. **App state / anchor:** `#confirm-sheet` (`public/index.html:488-495`) driven by
   `showConfirmSheet("Force Dawn", …)` (`public/app.js:3102-3111`, `:3377-3388`).
2. **Visual deltas:** Figma = bottom `Drawer` 390x194 over a 30%-opacity scrim (diff line 86-87). App = centered
   `.modal.confirm-sheet`. Sheet vs modal is SMALL.
3. **Copy deltas — near-exact match ✅:**
   | Slot | Figma | App |
   |---|---|---|
   | Title | `"Force Dawn"` | `"Force Dawn"` (`public/app.js:3104`) |
   | Body | `"Night actions will be skipped and no one will be killed."` | **identical** (`public/app.js:3105`) |
   | Confirm | `"Force dawn"` | `"Force Dawn"` (`public/app.js:3106`) |
   | Cancel | `"Cancel"` | `"Cancel"` (`public/index.html:493`) |
   Only the confirm-button casing differs. SMALL.
4. **Flow deltas:** `wiring.md:43` (`278:2673 Cancel → 278:2401`) matches `hideConfirmSheet` (`public/app.js:3399`).
   Figma has no wire for the *confirm* path (no target frame) — the app sends `{type:"force_dawn"}`
   (`public/app.js:3107`). SMALL; nothing to change.
5. **Privacy:** none.

---

## 5. DOCTOR FLOW

### Frame 8 — `135:961` "Doctor" (idle list)
1. **App state / anchor:** `doctor_targets` → `showNightAction("Choose someone to protect", msg.players,
   "doctor_save", msg.lastDoctorTarget)` (`public/app.js:481-483`); generic branch of `showNightAction`
   (`public/app.js:2338-2381`).
2. **Visual deltas:** G1–G5. Figma disables the repeat-target row via `opacity=60%` on the `CTA`
   (`130-529--save-a-player.md`, kevin row); app adds `class="disabled"` and removes the click handler
   (`public/app.js:2341-2343`, `:2351`).
3. **Copy deltas:**
   - Prompt: Figma `"Choose someone to protect"` vs app `"Choose someone to protect"` — **exact match** ✅
     (`public/app.js:482`).
   - Row suffix: Figma `"kevin - saved last night"` vs app `" (protected last night)"` (`public/app.js:2342`).
     SMALL.
4. **Flow deltas:** none material. SMALL.
5. **Privacy:** consistent — the doctor's own last target is legitimately known to the doctor; the engine enforces
   the no-repeat rule server-side too (`src/server.ts:1428-1430`, error *"You cannot protect the same player two
   nights in a row."*).

### Frame 9 — `130:529` "Save a player" (target selected)
1. **App state / anchor:** same panel with `.selected` on a row and `#action-confirm` armed via
   `setupSlideConfirm("doctor", …)` (`public/app.js:2354-2358`).
2. **Visual deltas:** Figma puts a per-row `Check`/`X` pair (38x38 circles) inside the selected row
   (`130-529` jenny row). App shows a panel-level bar: `#btn-action-cancel` "Cancel" + `#btn-action-confirm`
   whose label is `ACTION_VERBS.doctor = "Save"` (`public/app.js:1499`, `:1507`). **Structural delta, SMALL**
   (same two actions, different placement) — but see Decision D3 (Figma's `X` is overloaded: on the doctor row it
   cancels, on the mafia row it objects).
3. **Copy deltas:** Figma `"jenny - save?"` row suffix; app has no suffix — selection is the `.selected` class
   plus the "Save" verb on the confirm button. SMALL.
4. **Flow deltas:** `wiring.md:10-11` — `135:887 Check → 135:894 Save Confirmed`, `135:889 X → 135:961 Doctor`.
   App matches exactly: confirm sends `{type:"doctor_save", targetId}` and collapses the list
   (`public/app.js:2362`, `:2369`); Cancel deselects and returns to the idle list
   (`public/app.js:2374-2378`). SMALL. ✅
5. **Privacy:** none.

### Frame 10 — `135:894` "Save confirmed"
1. **App state / anchor:** collapsed `<li class="selected">{name} ✔</li>` + `#action-status`
   (`public/app.js:2369`, `:537`).
2. **Visual deltas:** G1–G5.
3. **Copy deltas — 🚩 see privacy:**
   - Figma headline `TEXT "Jenny has been protected tonight"` (`135-894`) — **names the saved player in the
     headline.**
   - App: `#action-title` stays `"Choose someone to protect"`; `#action-status` = server string
     `"You have chosen to protect someone tonight."` (`src/server.ts:1418`) — **deliberately name-free**, with the
     name carried only by the collapsed row's `✔`.
4. **Flow deltas:** SMALL.
5. **Privacy: BIG + PRIVACY (low-medium confidence, needs Hanson's ruling).** This screen is the **doctor's own**,
   so naming their own target is not a leak *to another player*. But the app's whole doctor-secrecy design
   (`doctorMode: official`) is built on the save being unnameable in public surfaces:
   `Narrator.doctorSaveOfficial()` returns strings like `"…No name was left."` (`src/narrator.ts:35-42`), and the
   server sends an anonymous `saved` flag with no named save event under official mode
   (`public/app.js:1993-1995`). A named headline that persists on the doctor's screen until dawn re-creates the
   exact shoulder-surf exposure the `<role>_close` teardown closes (`public/app.js:466-473`). Verdict depends on
   whether the headline is torn down on `doctor_close`.
   **e2e assertion:** after `sound_cue {sound:"doctor_close"}` the doctor client's `#night-actions` is hidden and
   no DOM node anywhere on `#screen-game` contains the saved player's name.
   **Separately verified NOT a leak:** dead spectators legitimately see the doctor's target in **both** modes —
   `src/server.ts:1408-1424` states *"dead spectators are OMNISCIENT — they see who the doctor protected in BOTH
   modes"* and unconditionally sends `targetName`. So Figma `245:615`/`254:522`'s `"Saved by doctor"` annotation is
   **correct**. Note the client still carries a legacy fallback branch that renders `"Doctor made a choice"` when
   `targetName` is null (`public/app.js:2862-2865`) — dead code against the current server, do not treat it as the
   spec.

---

## 6. DETECTIVE FLOW

### Frame 11 — `130:625` "Detective" (idle list)
1. **App state / anchor:** `detective_targets` → `showNightAction("Choose someone to investigate", msg.players,
   "detective_investigate")` (`public/app.js:485-487`).
2. **Visual deltas:** G1–G5.
3. **Copy deltas:**
   - Prompt: Figma `"Choose someone to investigate"` = app `"Choose someone to investigate"` — **exact match** ✅.
   - 🚩 Figma row suffixes `"kevin - investigated as MAFIA"` and `"natasha - investigated as NOT MAFIA"`
     (`130-625`) — **NO APP EQUIVALENT.** The app's night target list has no history annotation; past results live
     in the separate `#detective-result` panel (`public/index.html:272`) and, merged into the events tab, as
     `investigation_mafia: "Investigated — MAFIA"` / `investigation_clear: "Investigated — Clear"`
     (`public/app.js:2159-2160`, merged from `detectiveHistory` at `:2172-2181`).
4. **Flow deltas: BIG.** Rendering prior results inside the *night target list* requires either a new server field on
   `detective_targets` or client-side reuse of `detectiveHistory` (which exists — `public/app.js:2174`). Client-side
   reuse is feasible without a wire change.
   **e2e assertion:** detective investigates X (mafia) on night 1; on night 2 the detective's `#action-targets` row
   for X carries the MAFIA annotation and is still clickable (or disabled — see Decision D4).
5. **Privacy: BIG + PRIVACY.** Two concerns:
   (a) the annotation is private-to-detective by construction (`myRole === "detective"` gate,
   `public/app.js:2174`) — that part is safe, **provided** the reskin keeps the same gate;
   (b) it puts the detective's full accumulated intel on a screen that stays up for the whole sub-phase, whereas
   the app currently tears the panel down on `detective_close` (`public/app.js:466-473`). Same shoulder-surf
   argument as Frame 10.
   **e2e assertion:** a NON-detective client that receives `detective_targets`-shaped state never renders any
   `investigated as` string; and after `detective_close` the detective's night panel is hidden.

### Frame 12 — `140:1186` "Investigate" (target selected)
Same as Frame 9's doctor analogue. Row suffix `"jenny - investigate?"`; per-row Check/X vs app's panel bar with
`ACTION_VERBS.detective = "Investigate"` (`public/app.js:1499`). Wiring `140:1240 Check → 140:1261`,
`140:1242 X → 130:625` (`wiring.md:16-17`) matches app confirm/cancel exactly ✅. Also carries the
Frame-11 annotation deltas. **BIG** (inherits the annotation delta), otherwise SMALL.

### Frame 13 — `140:1261` "Investigation confirmed"
1. **App state / anchor:** collapsed row + `#action-status` (`public/app.js:2369`, `:537`).
2. **Visual deltas:** this frame flips Game Tabs to `Position=Players` and lists `dale / mo / kevin / natasha /
   christopher` — maps to `#eh-panel-players`. G1–G5.
3. **Copy deltas:**
   - Figma headline `"A player has been chosen –\nResults will appear in the morning"` (`140-1261`) —
     **name-free** ✅ (contrast with the doctor's Frame 10, which *does* name).
   - App: `#action-status` = `"You have chosen to investigate someone tonight. Results will be revealed at dawn."`
     (`src/server.ts:1452`). Same meaning, different wording; different slot (headline vs status). SMALL.
4. **Flow deltas:** SMALL.
5. **Privacy:** consistent ✅ — and notably *better* than Frame 10: Figma itself chose a name-free confirmation for
   the detective. Recommend the same treatment for the doctor (Decision D5).

---

## 7. HUNTER FLOW

> App context: the Hunter's revenge is a **gate**, not a night sub-phase. `hunter_revenge_pending` opens a
> room-wide wait view for *everyone* (`showRevengeWait`, `public/app.js:2397-2401`); the hunter alone additionally
> receives `hunter_revenge_targets` (`public/app.js:509-521`). The reveal is PUBLIC by design
> (`public/app.js:2385-2387`, "HUNTER-DESIGN decision #10").

### Frame 14 — `130:573` "Hunter" (the revenge gate prompt)
1. **App state / anchor:** `hunter_revenge_targets` → `showNightAction("Take your revenge", msg.players,
   "hunter_revenge")`, with `#btn-decline-revenge` un-hidden (`public/app.js:520`, `:2309`).
2. **Visual deltas:** 🚩 Figma presents a **two-button gate with no target list**:
   `FRAME "Frame 3"` → `CTA "Take revenge"` + `CTA "Spare the others"` (`130-573:41-46`), and only *then*
   (`wiring.md:18`, `225:417 → 225:364`) shows the target list. **NO APP EQUIVALENT** — the app shows the target
   list and the Decline button *simultaneously* (`public/index.html:278-279`).
3. **Copy deltas:**
   - Figma headline `"The Hunter falls!\nWhat will you do?"` vs app `#action-title = "Take your revenge"`
     (`public/app.js:520`). The app's *room-wide* wait view separately hardcodes
     `"THE HUNTER FALLS"` (`public/index.html:264`) — same phrase, different screen.
   - Figma `"Spare the others"` vs app `#btn-decline-revenge` label `"Decline revenge"`
     (`public/index.html:279`). SMALL.
   - Figma `"Take revenge"` vs app confirm verb `ACTION_VERBS.hunter_revenge = "Avenge"` (`public/app.js:1499`).
4. **Flow deltas: BIG.** Inserting a gate screen adds a click and a state the app has never had. It also changes
   the risk profile: the app's design intentionally puts Decline next to the targets so a stalled hunter has one
   tap to resolve (the "kitchen problem" — see the admin `#btn-skip-revenge` safety net,
   `public/app.js:2403-2408`).
   **e2e assertion:** a hunter killed at night can decline in ≤1 interaction from the first revenge screen, and
   `{type:"hunter_revenge", targetId:null}` reaches the server (`public/app.js:2413-2420`); the deferred
   `phase_change` then fires for all clients.
5. **Privacy:** consistent — the Hunter reveal is public by design.

### Frame 15 — `225:364` "Kill" (hunter target list) & Frame 16 — `257:1726` "Kill" (target selected)
1. **App state / anchor:** the generic `showNightAction` list (`public/app.js:2338-2381`) with
   `slideRole = "hunter_revenge"` (`public/app.js:2350`).
2. **Copy deltas:** Figma prompt `"Mark someone for death"` (`225-364`, `257-1726`) vs app `"Take your revenge"`.
   Figma decline button on these frames reads `"Don't shoot"` (curly apostrophe, `225-364`) — a **third** label for
   the same action (`"Spare the others"` on `130:573`, `"Don't shoot"` here, `"Decline revenge"` in the app).
   See Decision D6.
   Figma row suffix `"dale - kill?"` (`257-1726`); app has no suffix.
3. **Flow deltas:** `wiring.md:26-27` (`225:379 → 257:1726`, `257:1744 Check → 225:427`) matches select→confirm.
   SMALL beyond the Frame-14 gate.
4. **Privacy:** none.

### Frame 17 — `225:427` "Kill confirmed" (hunter)
1. **App state / anchor:** collapsed `<li class="selected">{name} ✔</li>` (`public/app.js:2369`).
2. **Copy deltas: 🚩 NO APP EQUIVALENT.** Figma headline `"You have chosen your victim. Revenge is sweet."`
   (`225-427`). Verified against the server: the `hunter_revenge` handler sends **no `night_action_done` at all**
   (`src/server.ts:1522-1538` — it calls `resolveRevenge` and returns). The app leaves `#action-status` empty and
   relies on the collapsed row + the deferred `phase_change` teardown. The exact string Figma uses here belongs to
   the **joker** in the app (`src/server.ts:1509`, and `public/app.js:832` on rejoin). New copy for the hunter path.
3. **Flow deltas:** SMALL (add a confirmation string), but note it must not linger — `applyPhaseChange`'s hide-all
   is the teardown (`public/app.js:2391-2396`).
4. **Privacy:** none.

### Frame 18 — `225:490` "Spared" (hunter declined)
1. **App state / anchor:** `#btn-decline-revenge` click handler (`public/app.js:2413-2420`).
2. **Copy deltas:** Figma `"You go out alone.\nNo one falls with you tonight."` vs app `#action-status =
   "You lower your bow."` (`public/app.js:2419`). SMALL. (Public narration is separate:
   `HUNTER_DECLINE_MESSAGES`, `src/narrator.ts:112-117`.)
3. **Flow deltas:** `wiring.md:19` + `:31` (`262:2379 → 225:490`) matches — decline is terminal. SMALL.
4. **Privacy:** none. Note the app *also* clears the target list on the parallel vigilante path
   (`public/app.js:2429`) but **not** on the hunter decline path — the target list stays rendered under
   "You lower your bow." Minor inconsistency; Figma's Spared frame shows no list, which is the better behavior.
   SMALL fix opportunity (flagged, not fixed — out of scope).

### Frame 19 — `225:657` "Hunter killed" (everyone else's view during the gate)
1. **App state / anchor:** `#revenge-wait` (`public/index.html:262-268`), shown by `showRevengeWait`
   (`public/app.js:2397-2401`) on `hunter_revenge_pending` (`public/app.js:500-507`) and restored on rejoin
   (`public/app.js:915-917`).
2. **Visual deltas: 🚩 the role card is `Role=Default` showing `TEXT "?"` + `TEXT "Peel to reveal"`**
   (`225-657:32-42`) — **NO APP EQUIVALENT during play.** In the app the viewer's own role card stays face-up on
   its front face throughout the night (`updateRoleCard`, `public/app.js:1235-1246`); the card back
   (`#card-back` / `.peel-flap`, `public/index.html:236-241`) is a separate face, and `card-back-art` is swapped
   to `CARD_BACK_DEAD_ART` only on death (`public/app.js:608`). Showing `?` here would *hide the viewer's own
   role from themselves* mid-game.
   App's `#revenge-wait` also has a `#revenge-wait-art` bow centerpiece (`public/app.js:4364-4366`) — Figma uses a
   generic 78x78 image fill.
3. **Copy deltas:**
   | Slot | Figma (`225-657`) | App |
   |---|---|---|
   | Headline | `"The Hunter falls!\nWaiting for the Hunter…"` | `"THE HUNTER FALLS"` (`public/index.html:264`) + `"Waiting for the Hunter…"` (`:266`) |
   | Reveal | `"jenny was the hunter"` (lowercase, no punctuation) | `` `${hunterName} was the Hunter!` `` (`public/app.js:2398`) |
   | Admin skip | *(absent)* | `#btn-skip-revenge` `"Skip revenge"` (`public/index.html:267`) — **NO FIGMA FRAME** |
4. **Flow deltas: BIG** (the `?` card). Also **no Figma frame for the admin variant** of this screen — the app
   toggles `#btn-skip-revenge` on `isAdmin` inside `showRevengeWait` (`public/app.js:2399`), and this is the only
   un-hide path (deliberately, per the comment at `:2388-2390`).
   **e2e assertion:** during an open revenge gate, the admin client (alive **and** dead variants) sees
   `#btn-skip-revenge` visible; a non-admin does not; clicking it resolves the gate as a decline
   (`src/server.ts:1540-1551`).
5. **Privacy:** the Hunter's identity reveal is public by design ✅ — Figma matches. But the `?` role card is the
   inverse problem: it withholds information from the person entitled to it.

---

## 8. VIGILANTE FLOW

### Frame 20 — `225:542` "Vigilante" (Shoot / Hold fire gate)
1. **App state / anchor:** `vigilante_targets` → `showNightAction("Choose someone to shoot — or hold your fire",
   msg.players, "vigilante_shoot")` with `#btn-vigilante-pass` un-hidden (`public/app.js:489-493`, `:2311`).
2. **Visual deltas: 🚩 NO APP EQUIVALENT** — same shape as Frame 14: Figma inserts a two-CTA gate
   (`"Shoot"` / `"Hold fire"`, `225-542`) *before* the target list (`wiring.md:20-21`,
   `225:557 → 234:1332`, `225:559 → 234:1397`). The app renders list + Hold-fire button together.
   Also missing from Figma: `#bullet-indicator` (the ammo count on the role card,
   `public/index.html:217`, updated by `updateBulletIndicator()`, `public/app.js:490-491`, `:2365-2366`).
3. **Copy deltas:**
   - Prompt: Figma `"Choose someone to shoot – or hold your fire."` (en-dash + trailing period) vs app
     `"Choose someone to shoot — or hold your fire"` (em-dash, no period) (`public/app.js:492`). SMALL.
   - Figma `"Hold fire"` = app `#btn-vigilante-pass` label `"Hold fire"` — **exact match** ✅
     (`public/index.html:280`).
   - Figma `"Shoot"` = app confirm verb `ACTION_VERBS.vigilante = "Shoot"` — **exact match** ✅
     (`public/app.js:1499`).
4. **Flow deltas: BIG** (the gate step). Same argument as Frame 14.
   **e2e assertion:** a vigilante with an unspent bullet can hold fire in ≤1 interaction and
   `{type:"vigilante_shoot", targetId:null}` reaches the server; the bullet indicator still reads unspent.
5. **Privacy:** none for the actor — but see §5.11 for the *spectator* phantom-safety state Figma omits.

### Frames 21–22 — `234:1332` "Shoot" (list) / `257:1655` "Shoot" (selected)
Generic `showNightAction` list. Figma row suffix `"dale - kill?"` (`257-1655`) — app has none. Wiring
`257:1673 Check → 234:1444` (`wiring.md:28`) matches confirm; `257:1675 X → 234:1332` matches cancel-deselect
(`public/app.js:2374-2378`) ✅. SMALL.

### Frame 23 — `234:1444` "Confirmed kill" (vigilante)
- **Copy: exact match ✅.** Figma `"You have taken your shot. Your bullet is spent."` == app's server string
  (`src/server.ts:1483-1485`, the `targetId !== null` branch), delivered via `night_action_done` →
  `#action-status` (`public/app.js:537`).
- **Delta:** slot only (Figma headline vs app status line). SMALL.
- **Note:** the app spends the bullet optimistically on the client at confirm time
  (`vigilanteBulletUsed = true`, `public/app.js:2364-2366`) — Figma has no bullet indicator to reflect this.

### Frame 24 — `234:1397` "Hold fire"
- **Copy:** Figma `"You hold your fire."` == app's client-side `#action-status` string exactly ✅
  (`public/app.js:2430`). The *server* sends a longer variant, `"You hold your fire and keep your bullet."`
  (`src/server.ts:1483-1484`), which arrives via `night_action_done` and **overwrites** the client string
  (`public/app.js:537`). So the final on-screen text is the server's. Figma matches the *transient* client string,
  not the settled one. SMALL — pick one (Decision D8).
- **App also clears the target list here** (`public/app.js:2429`) — matches Figma's list-free Hold-fire frame ✅.
- **Flow:** `wiring.md:21`, `:32` both land on `234:1397` — terminal. SMALL.

---

## 9. JOKER FLOW

> App context: the joker haunts **from beyond the grave**. `joker_haunt_targets` sets `deadActionActive = true`
> (`public/app.js:495-498`), which is what lets the dead-guard in `showNightAction` pass
> (`public/app.js:2297`) and what suppresses the spectator stream for this one client
> (`public/app.js:553-575`, every spectator case is gated on `isDead && !deadActionActive`).

### Frame 25 — `257:875` "Joker" (idle list)
- **App:** `showNightAction("Choose someone to haunt", …, "joker_haunt")` (`public/app.js:497`).
- **Copy:** Figma `"Choose someone to haunt"` == app — **exact match** ✅.
- **Visual: 🚩 the Figma card is `Role=Joker` with a normal live card.** The app's joker is **dead** at this point,
  so their `#card-back-art` has already been swapped to `CARD_BACK_DEAD_ART` (`public/app.js:608`) and
  `#role-mini-balloon` (the haunt indicator, `public/index.html:219-234`) is showing. Neither appears in Figma.
  SMALL-to-BIG depending on whether the reskin keeps the dead-card treatment (Decision D10).
- **Privacy:** the joker sees the haunt UI *instead of* the spectator stream — Figma has no frame showing that the
  haunting joker is excluded from spectator info. Consistent by omission; no delta.

### Frame 26 — `257:1530` "Joker" (target selected)
Row suffix `"dale - haunt?"`; app has none. Confirm verb `ACTION_VERBS.joker_haunt = "Haunt"`
(`public/app.js:1499`). Wiring `257:1548 Check → 257:1595`, `257:1550 X → 257:875` (`wiring.md:29`, `:113-114`)
matches confirm/cancel ✅. SMALL.

### Frame 27 — `257:1595` "Joker" (confirmed)
- **Copy: exact match ✅.** Figma `"You have chosen your victim. Revenge is sweet."` == `src/server.ts:1509`
  (`night_action_done`) and == `public/app.js:832` (the rejoin restore). Slot differs (headline vs
  `#action-status`). SMALL.
- **NO FIGMA FRAME** for the app's rejoin variant, which sets `#action-title = "Haunt Target"`
  (`public/app.js:829`). See §5.14.

---

## 10. DEATH FLOW (full-bleed overlays)

All three map to `#dead-overlay` (`public/index.html:386-396`), rendered at APP ROOT, shown on `you_died`
(`public/app.js:606-618`).

### Frame 28 — `245:344` "Death by mafia"
1. **App state / anchor:** `#dead-overlay` with `#dead-emoji` = `CARD_BACK_DEAD_ART`, `#death-message` =
   `msg.message` (`public/app.js:611-616`).
2. **Visual deltas:** Figma skull art vs app pixel-art skull — SMALL.
3. **Copy deltas:**
   | Slot | Figma | App |
   |---|---|---|
   | Pre | `"You are"` | `"YOU ARE"` (`public/index.html:389`) |
   | Title | `"DEAD"` | `"DEAD"` (`:390`) ✅ |
   | Message | 🚩 `"You were stabbed in the night – Round 4"` | one of `DIED_IN_NIGHT_MESSAGES` (`src/narrator.ts:230-236`): `"{name} did not see the morning."` / `"…did not live to see the dawn."` / `"…did not survive the night."` / `"The night took {name}."` |
   | Sub | `"Stay quiet, you can still watch the town squirm."` | *(no equivalent — app has no sub-line)* |
   | CTA | `"Watch the town"` | `"WATCH THE TOWN"` (`#btn-watch-town`, `public/index.html:394`) |
4. **Flow deltas:** `wiring.md:22` (`245:417 CTA → 245:422 Spectating mafia`) matches the app: dismissing the
   overlay drops the player into the spectator view. SMALL.
5. **Privacy: 🚩 BIG + PRIVACY.** `"You were stabbed in the night"` **names the cause**. The app's per-victim
   message pool is deliberately cause-neutral — `src/narrator.ts:228-236` states it *"Reveals nothing"*, and the
   dawn batch line is likewise neutral by construction (`nightDeaths`, `src/narrator.ts:238-244`: *"Names only WHO
   died, never HOW"*, with `joinNames()` sorting so kill order can't out the target). "Stabbed" distinguishes a
   mafia kill from a vigilante shot, a joker haunt, and a heartbreak cascade — and dead players talk. This is the
   same leak class as G5.
   **e2e assertion:** in a game with mafia + vigilante both killing on the same night, both victims' `you_died`
   messages are drawn from the identical neutral pool and neither contains
   `/stab|shot|bullet|shoot|knife|wire|haunt|mafia|vigilante|joker/i`.
   Also: `"– Round 4"` is an app-side addition (no round suffix today) — harmless, SMALL.

### Frame 29 — `254:848` "Death by vote"
- **Copy: exact match ✅ (and a strong signal the Figma author worked from real app strings).** Figma's message is
  `"The town has spoken. mo is given to the rope as the town watched. Whether it was justice, no one will ever be
  sure."` — that is `EXECUTION_MESSAGES[0]` (`src/narrator.ts:50-51`) with `{executionStyle}` filled by
  `EXECUTION_STYLES[3]` `"given to the rope as the town watched"` (`src/narrator.ts:21`). Verbatim.
- Same Pre/Title/Sub/CTA deltas as Frame 28.
- **Flow:** `wiring.md:23` (`254:858 → 245:422`) matches. SMALL.
- **Privacy:** none — executions are public.

### Frame 30 — `254:865` "Death by heartbreak"
1. **App state / anchor:** `you_died` with `msg.isLoverDeath` → `#dead-emoji` = `HEARTBREAK_ART`
   (`public/app.js:613-614`).
2. **Visual deltas:** Figma broken-heart art ✅ matches the app's `HEARTBREAK_ART` swap.
3. **Copy deltas — 🚩 NO APP EQUIVALENT for the headline:**
   | Slot | Figma | App |
   |---|---|---|
   | Pre | `"You died of"` | `"YOU ARE"` — **hardcoded static text** (`public/index.html:389`) |
   | Title | `"HEARTBREAK"` | `"DEAD"` — **hardcoded static text** (`public/index.html:390`) |
   | Message | `"Your lover falls and your heart splits into two"` | one of `LOVER_DEATH_MESSAGES` (`src/narrator.ts:71-76`), e.g. `"{name} died of heartbreak."` |
   The app's `.dead-pre` / `.dead-text` are literal markup with **no id and no JS writer** (verified: grep for
   `dead-pre` / `dead-text` in `public/app.js` returns no assignment). Making them variant-aware is a real DOM
   change.
4. **Flow deltas: BIG (small blast radius).** Requires ids on `.dead-pre` / `.dead-text` and a branch on
   `msg.isLoverDeath` alongside the existing art swap.
   **e2e assertion:** a lover cascade victim's overlay reads `"You died of" / "HEARTBREAK"` with heartbreak art,
   while a mafia victim in the same night reads `"YOU ARE" / "DEAD"` with skull art.
5. **Privacy:** consistent ✅. Heartbreak is public by owner ruling (`src/game-engine.ts:1271-1273`;
   `public/app.js:612-613`), and the message names only the heartbroken partner, never the original lover
   (`src/narrator.ts:65-70`). Figma's `"Your lover falls…"` is second-person and names nobody — safe. ✅

---

## 11. SPECTATING FLOW (dead players) — the privacy-critical set

**Shared app anchors for all 7:** `#night-actions` un-hidden with a read-only body
(`showSpectatorNightPhase` / `showSpectatorMafiaPanel` / `showSpectatorKillResult`,
`public/app.js:2742-2852`), plus the append-only `#spectator-night-log` (`public/index.html:276`,
`renderSpectatorLog` `public/app.js:2894-2905`). Every spectator message is gated on
`isDead && !deadActionActive` (`public/app.js:553-575`) so a haunting joker is excluded.

**Shared structural delta (all 7) — BIG:** Figma renders spectator intel as **per-player row annotations** inside a
`FRAME "Players"` (e.g. `jenny | "Mafia's victim"`, `kevin | "Saved by doctor"`). The app renders it as a
**chronological log of sentences** in `#spectator-night-log` (`formatSpectatorLogEntry`,
`public/app.js:2854-2885`). Same information, completely different data shape — the reskin needs a
player-keyed projection of the log.
**e2e assertion:** after a full night (mafia kill + doctor save + detective investigate + vigilante hold),
a dead spectator's rendered annotations name exactly the same set of players as the app's four log lines, and no more.

### Frame 31 — `245:422` "Spectating mafia"
1. **App:** `showSpectatorMafiaPanel(msg)` deliberation branch (`public/app.js:2755-2784`) —
   `renderMafiaTargetCards(list, msg.targets, voteCounts, /*readOnly*/ true)` (`:2765`).
2. **Copy deltas:** Figma `"Mafia is deliberating..."` (three ASCII dots) vs app
   `"Mafia is deliberating…"` (ellipsis char) (`public/app.js:2757`). SMALL.
   Figma badge `"1/2 locked"` == app format exactly ✅ (`public/app.js:2530`).
3. **Flow deltas:** SMALL.
4. **Privacy: CONSISTENT ✅ — verified, do not "fix".** Figma shows the dead spectator the mafia's voter-initial
   chips (`M`, `K`) and the lock progress. The app shows the *same* — `readOnly` only strips the action buttons
   (`public/app.js:2544`), not the chips or badges — **and** additionally renders the named activity feed
   (`"{voter} nominates {target}"` / `"locks in"` / `"objects to killing"`, `public/app.js:2772-2774`) into
   `#mafia-vote-status`. Dead spectators are omniscient by design. Figma is if anything *less* revealing here.
5. **NO FIGMA FRAME** for the app's collapsed spectator variant: `"Mafia has chosen…"` +
   `<li class="spectator-locked">{name} — chosen</li>` (`public/app.js:2750-2754`). See §5.9.

### Frame 32 — `245:716` "Spectating doctor"
- **App:** `showSpectatorNightPhase({subPhase:"doctor", isRoleAlive:true})` (`public/app.js:2822-2825`).
- **Copy:** Figma `"Doctor is saving a life..."` vs app `"Doctor is deliberating…"` (`public/app.js:2824`);
  Figma sub `"Choosing who to save"` vs app `"Choosing who to protect…"` (`public/app.js:2825`). SMALL ×2.
- **Privacy: CONSISTENT ✅.** Figma's `jenny | "Mafia's victim"` annotation matches the app's log line
  `"Mafia chose to kill {name}"` (`public/app.js:2858`). Dead spectators see the mafia's target in the app today.

### Frame 33 — `253:430` "Fallen doctor"
- **App:** same handler, `isRoleAlive === false` branch (`public/app.js:2826-2829`).
- **Copy:** Figma `"Doctor has fallen"` vs app `"The Doctor has fallen…"` (`public/app.js:2827`);
  Figma `"No one will be saved tonight"` == app `"No one will be saved tonight"` — **exact match** ✅
  (`public/app.js:2828`).
- **Privacy: CONSISTENT ✅** — the app already tells dead spectators the doctor is dead.

### Frame 34 — `245:615` "Spectating detective"
- **App:** `public/app.js:2830-2833`.
- **Copy:** Figma `"Detective is investigating..."` vs app `"Detective is investigating…"` — **match** ✅.
  Figma `"Choosing who to investigate"` vs app `"Choosing who to investigate…"` — **match** ✅.
- **Privacy: CONSISTENT ✅.** Figma's `kevin | "Saved by doctor"` is legitimate — see the Frame-10 finding:
  `src/server.ts:1408-1424` sends the doctor's `targetName` to dead spectators in **both** doctor modes, by
  explicit owner ruling. **Do not suppress this in the reskin** on the mistaken theory that official mode hides it;
  the only surfaces that hide it are living-player narration and the saved victim's own client.

### Frame 35 — `254:686` "Fallen detective"
- **App:** `public/app.js:2834-2837`.
- **Copy:** Figma `"Detective has fallen"` vs app `"The Detective has fallen…"`;
  🚩 Figma `"No one will be investigated tonight"` vs app `"No investigation tonight"` (`public/app.js:2836`).
  SMALL ×2.
- Figma also stacks a second annotation row `"Doctor has fallen"` at 60% opacity — matches the app's persistent
  log entry `"Doctor has fallen — no protection tonight"` (`public/app.js:2867`). ✅
- **Privacy: CONSISTENT ✅.**

### Frame 36 — `254:522` "Spectating vigilante"
- **App:** `public/app.js:2838-2843` (`isRoleAlive` true branch).
- **Copy:** Figma `"Vigilante is taking aim..."` vs app `"Vigilante is taking aim…"` — **match** ✅.
  Figma `"Deciding whether to shoot"` vs app `"Deciding whether to shoot…"` — **match** ✅.
- **Privacy: CONSISTENT ✅** for the alive branch — Figma's `"Investigated by detective"` annotation matches the
  app log line `"Detective chose to investigate {name}"` (`public/app.js:2871`).
- **🚩 BUT: the negative branch has NO FIGMA FRAME, and it is phantom-safety-critical — BIG + PRIVACY.**
  The app sends `isRoleAlive:false` for **both** "vigilante is dead" **and** "vigilante already spent the bullet",
  and renders an identical, deliberately vague `"The night stays quiet…"` / `"No shot is fired tonight"`
  (`public/app.js:2838-2847`, comment: *"Phantom-safe: identical when the vigilante is dead vs out of ammo …
  so state can't be inferred"*). Figma provides only the taking-aim frame. If the reskin renders
  "Vigilante is taking aim…" unconditionally (or invents a distinct "Vigilante has fallen" frame by analogy with
  `253:430`/`254:686`), it outs whether the vigilante is alive **and** whether the bullet is spent.
  **e2e assertion:** dead-spectator clients see byte-identical vigilante sub-phase text in three scenarios —
  vigilante alive with bullet held from a previous night (spent), vigilante dead, vigilante disabled-by-phantom —
  and that text never contains `"fallen"` or `"taking aim"`.

### Frame 37 — `254:627` "Spectating vigilante" (Joker lynched)
- **App:** `#joker-spectator-status` via `showJokerDeliberating()` (`public/app.js:2907-2914`), shown alongside
  the current sub-phase panel.
- **Copy:** Figma headline `"The Joker has been lynched..."` — **NO APP EQUIVALENT** (the app has no such
  headline; the lynch is announced through the narrator). Figma sub `"Joker is choosing their victim"` vs app
  `"Joker is choosing their victim…"` — **match** ✅ (`public/app.js:2910`).
- Figma's fourth annotation row `"Vigilante held their fire"` at 60% opacity == app log line
  `"Vigilante held their fire"` — **exact match** ✅ (`public/app.js:2879`).
- **Flow deltas:** `wiring.md:24`, `:30` route back to `245:422`. SMALL.
- **Privacy: CONSISTENT ✅**, with one gap: **NO FIGMA FRAME** for the resolved state
  `"Joker has chosen {name}"` (`public/app.js:2916-2923`). See §5.13.

---

## 12. App night states with NO Figma frame

Ordered by risk.

| # | App state | Anchor / file:line | Risk |
|---|---|---|---|
| 5.11 | Spectator **"The night stays quiet…" / "No shot is fired tonight"** (vigilante dead OR bullet spent — phantom-safe) | `public/app.js:2844-2847` | 🚩 **PRIVACY-CRITICAL.** Absence invites an inconsistent reskin that outs vigilante state. |
| 5.1 | **Godfather role card** — distinct card, gold, `"You are the Godfather. You run the Mafia and appear INNOCENT to the Detective."` | `public/app.js:1236-1242`, `public/pixel-art.js:605` | HIGH — overview lane says "Mafia / Godfather flow" but every frame is `Role=Mafia`. Also the mafia roster's `👑 GODFATHER` tag (`public/app.js:2235-2242`) has no frame. |
| 5.2 | **Single-mafia night** — plain tap-to-lock rows (`.single-mafia-target`), `#mafia-vote-status` force-hidden | `public/app.js:2330-2332`, `:2433-2449` | HIGH — a whole alternate mafia UI. |
| 5.3 | Mafia **objected/"Blocked"** card state + `"Objected by {names}"` + `"Remove Objection"` | `public/app.js:2517-2521`, `:2536-2540`, `:2548-2558` | HIGH — core mafia protocol, unrepresented. |
| 5.4 | Mafia **"Unanimous"** badge; **"Lock In" / "Unlock" / "Locked elsewhere"** buttons | `public/app.js:2522-2526`, `:2586-2639` | HIGH |
| 5.5 | Mafia **confirm-ready** state where **Cancel withdraws your lock** and reopens the team vote | `public/app.js:2925-2957` | HIGH — Figma's Check/X implies a local cancel; the app's Cancel is a server round-trip. |
| 5.6 | `#mafia-vote-status` **activity feed** (`"{voter} nominates {target}"`, `"locks in"`, `"objects to killing"`) | `public/app.js:2718-2735`, `:2768-2783` | MED |
| 5.7 | **Awaiting-ready gate**: `#awaiting-ready` `"Check your role card!"` + admin-only `#btn-begin-night` `"Begin Night"` | `public/index.html:253-256`, `public/app.js:440-450` | MED — every night starts here. |
| 5.8 | **Admin `#btn-skip-revenge`** `"Skip revenge"` during the hunter gate (admin-only, alive or dead) | `public/index.html:267`, `public/app.js:2399`, `:2406-2408` | MED |
| 5.9 | Spectator **"Mafia has chosen…"** collapsed (`"{name} — chosen"`) | `public/app.js:2750-2754` | MED |
| 5.10 | Spectator **"Dawn approaches…"** + per-victim `"{name} — died in the night"` (or `"No one died in the night"`) + `doctorMessage` | `public/app.js:2787-2811`, `:2848-2851` | MED |
| 5.12 | Spectator **`"Doctor made a choice"`** anonymous fallback (legacy branch; server no longer triggers it) | `public/app.js:2862-2865` | LOW — flagged so it isn't resurrected as spec. |
| 5.13 | Spectator **`"Joker has chosen {name}"`** resolved state | `public/app.js:2916-2923` | MED |
| 5.14 | **Rejoin (`game_sync`) night restores**: `"Haunt Target"` (joker) and `"Target"`/`"Protecting"`/`"Shooting"`/`"Investigating"` + `"Action confirmed."` | `public/app.js:826-834`, `:851-871` | MED — 5 headline strings with no design. |
| 5.15 | **`#bullet-indicator`** vigilante ammo readout on the role card | `public/index.html:217`, `public/app.js:2365-2366` | MED |
| 5.16 | **`#role-mini-balloon`** joker haunt indicator on the role card | `public/index.html:219-234`, `public/app.js:1261-1266` | LOW |
| 5.17 | **`#lover-badge` on non-citizen cards** — Figma shows the Lovers chip only on the Citizen card (`74:335`) | `public/index.html:216`, `public/app.js:1250-1254` | LOW — but a mafia lover is a real state. |
| 5.18 | **`#narrator-area`** (persistent) + `#btn-transcript` + `#modal-transcript` | `public/index.html:245-252` | HIGH — see G6. |
| 5.19 | **`#detective-result`** panel (persists into the day) | `public/index.html:272`, `public/app.js:577-579` | MED — Figma's night annotations (Frame 11) may be intended to replace it. |
| 5.20 | **Hunter revenge gate opened from a DAY execution** — all Figma hunter frames are `"Night 🌙"` | `src/server.ts:1718-1744` (day path) | MED |
| 5.21 | **Dead-but-not-yet-dismissed** state: `#dead-dismiss-hint` `"Tap to dismiss"`, and the hunter case that force-hides the overlay so the revenge prompt isn't buried | `public/index.html:395`, `public/app.js:513-519` | LOW |
| 5.22 | **`#pull-refresh`** on the game screen | `public/index.html:204-207` | LOW |

---

## 13. Decisions needed from Hanson

1. **D1 — Where does the narrator go at night?** No Figma night frame has a narrator area (G6), yet it's the
   game's primary channel and the only route to the transcript. Options: (a) narrator block above Game Tabs on
   every night frame; (b) narrator as a collapsible sheet; (c) Figma frames are incomplete and the existing
   narrator stays as-is. **Blocks the whole night layout.**

2. **D2 — Do we accept the pre-choice gate for Hunter and Vigilante?** (`130:573`, `225:542`) Figma inserts a
   two-CTA gate before the target list; the app shows list + decline together. Adding it is +1 tap on the two most
   time-pressured decisions in the game (the hunter gate blocks the whole room). BIG either way.

3. **D3 — What does the row-level `X` mean?** Figma reuses one `X` glyph for *cancel selection* (doctor `130:529`,
   detective `140:1186`) and for *withdraw/object* (mafia `135:489` "jenny - nominated"). In the app these are
   different messages: cancel is local (`public/app.js:2374-2378`); object sends
   `{voteType:"letsnot"}` (`public/app.js:2653-2664`). Needs disambiguation before build.

4. **D4 — Detective investigation history in the night list** (`130:625`, `140:1186`): show past results inline?
   If yes, are already-investigated players still selectable? (`detectiveHistory` already exists client-side, so no
   wire change is needed.) And does it replace `#detective-result`?

5. **D5 — Does the doctor's confirmation name the saved player?** Figma says yes for the doctor
   (`"Jenny has been protected tonight"`, `135:894`) but no for the detective
   (`"A player has been chosen"`, `140:1261`). The app names neither. Given official-mode doctor secrecy,
   recommend matching the detective's name-free treatment. **PRIVACY-adjacent.**

6. **D6 — One label for "decline the shot".** Three exist: `"Spare the others"` (`130:573`),
   `"Don't shoot"` (`225:364`), `"Decline revenge"` (`public/index.html:279`). Pick one.

7. **D7 — Vigilante card copy drops "friendly fire is allowed."** Figma's one-liner is
   `"You have one bullet you can use the entire game"`; the app spells out that the vigilante can shoot townsfolk
   (`public/pixel-art.js:604`). Losing it is a rules-comprehension regression. Keep as a second line, or move to
   the roster modal?

8. **D8 — Hold-fire string.** Client shows `"You hold your fire."` (`public/app.js:2430`), server then overwrites
   with `"You hold your fire and keep your bullet."` (`src/server.ts:1483-1484`). Figma matches the transient one.
   Pick one and make both sides agree.

9. **D9 — What may the Players tab show at night?** `130:243` and `140:1261` show it, but the specs truncate its
   internals (`...instance internals truncated`). The app's `updatePlayerStatus()` roster is alive/dead only.
   Confirm no role/alignment data enters it.

10. **D10 — Does the haunting joker keep a "dead" role card?** Figma `257:875` draws a live `Role=Joker` card; the
    app has already flipped `card-back-art` to `CARD_BACK_DEAD_ART` and is showing the haunt balloon.

11. **D11 — Heartbreak overlay variant** (`254:865`): confirm the `"You died of" / "HEARTBREAK"` headline swap is
    wanted, since `.dead-pre` / `.dead-text` are currently static markup with no ids (`public/index.html:389-390`).

12. **D12 — Post-confirm teardown** (`135:763`, `135:894`, `140:1261`, `225:427`, `234:1444`, `257:1595`): do the
    confirmed-state screens persist for the rest of the night, or are they torn down on the role's `<role>_close`
    cue as today (`public/app.js:466-473`)? The app's answer is "torn down, for shoulder-surf safety." Figma's
    confirmed frames imply persistence. **PRIVACY.**

13. **D13 — Godfather.** Does the Godfather get their own membership card + roster crown, or does the reskin
    collapse them into `Role=Mafia`? (Overview lane implies the former; no frame delivers it.)

---

## 14. Counts

| Metric | Count |
|---|---|
| Figma night frames | **37** |
| Frames mapped to a concrete app state/panel | **37 / 37** |
| Frames containing at least one element with **NO APP EQUIVALENT** | **9** — `74:335`, `130:243` (sleep line); `130:625`, `140:1186` (investigation annotations); `130:573`, `225:542` (pre-choice gates); `225:657` (`?` role card); `225:427` (hunter confirm copy); `254:865` (heartbreak headline) |
| Global no-equivalent items | **2** — G1 header code chip, G6 narrator area |
| **BIG deltas** | **12** — G5, G6, F3/F4 (mafia protocol), F5 (post-confirm chips), F10 (doctor named confirm), F11/F12 (detective annotations), F14 (hunter gate), F19 (`?` card + admin skip), F20 (vigilante gate), F28 (death cause), F30 (heartbreak headline), §11 shared (row-annotation data shape), §5.11 (vigilante phantom state) |
| **PRIVACY flags** | **6** — G5 (events-tab cause leak, 30 frames), F5 (voter chips persist post-confirm), F10 (named doctor confirm persistence), F11 (detective intel persistence), F28 (`"stabbed in the night"`), §5.11 (missing phantom-safe vigilante spectator state) |
| Privacy questions **checked and cleared** (do not "fix") | **4** — doctor target visible to dead spectators in both modes (`src/server.ts:1408-1424`); mafia voter chips visible to dead spectators (`public/app.js:2544`, `:2765`); hunter identity public during the gate (`public/app.js:2385-2387`); heartbreak public, names only the partner (`src/narrator.ts:65-76`) |
| App night states with **no Figma frame** | **22** (§12) |
| Exact copy matches found (Figma == app string) | **14** — `"Choose a victim"`, `"Choose someone to protect"`, `"Choose someone to investigate"`, `"Choose someone to haunt"`, `"Hold fire"`, `"Shoot"`, `"You hold your fire."`, `"You have taken your shot. Your bullet is spent."`, `"You have chosen your victim. Revenge is sweet."`, `"No one will be saved tonight"`, `"Vigilante held their fire"`, `"1/2 locked"` format, the Force Dawn confirm body, and the full `254:848` execution sentence |
| Wiring links verified against app message flow | **19 of 19** night-section connectors in `wiring.md:8-32`, `:42-43` |

**Confidence labels:** every `file:line` claim above was read directly this session. Items marked
**INFERRED** — none load-bearing; the two soft judgements are (a) that Figma's `M`/`K` chips are voter initials
(inferred from the sample roster `mo`/`kevin` matching `voterName.charAt(0)`, `public/app.js:2497`), and (b) that
`245:344`'s `"stabbed"` is meant literally rather than as lorem copy. Both should be confirmed with the designer.
