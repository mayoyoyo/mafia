# Figma ↔ App Coverage Matrix — GAME MENU section

**Scope:** 7 Figma frames in the Game Menu section vs the app's auth / menu / lobby / settings / roster domain.
**Date:** 2026-07-25
**App revision analysed:** `staging` @ `0098577` (working tree), `APP_VERSION_STAGING = "staging.35_202607131225"` (`public/app.js:4319`).

## Evidence rules used in this file

Every claim carries one of these sources. Nothing is asserted from memory.

| Tag | Meaning |
|---|---|
| `spec:<frame>` | `docs/figma-raw/specs/game-menu/<file>.md` |
| `wiring` | `docs/figma-raw/rest/wiring.md` |
| `png` | `docs/figma-raw/screenshots/game-menu--overview.png` (read directly) |
| `code:<file>:<line>` | live app source |
| **INFERRED** | reasoning on top of the above, explicitly flagged |

Where the app-screen inventory (`.claude/context/figma-migration/app-screen-inventory.md`) and the code disagree, the code wins; disagreements are called out in §6.

---

## 0. Two designer annotations (from the overview PNG — these are directives, not decoration)

Both are visible in `png` and are **not** in any per-frame spec file, so they would be lost if you only read the specs.

1. Callout anchored to the Auth "Log in" CTA: **"On dark mode, text should always be white in CTAs"** (`png`).
   - App today does the **opposite**: `.btn-primary { background: var(--primary); color: #141008 }` — CTA text is hard-pinned to near-black ink so amber-on-ink reads as a noir plate (`code:public/app.css:467-471`). `.btn-secondary` uses `color: var(--text)` (`code:public/app.css:474-477`), which is `#ece5d8` in dark and `#1a1a1a` in light (`code:public/app.css:46`, `:245`) — i.e. it already flips with theme. Satisfying this annotation means changing **both**: pin every CTA label to `#FFFFFF` regardless of theme. This directly conflicts with the amber `--primary` (white on `#e8a33d` fails contrast; white on `#FF6C02` is the Figma pairing), so annotation #1 and decision #3 below must be resolved together.
2. Callout anchored to the Returning User error line, badged **"Medium priority"**: **"Use this error text style for other error states"** (`png`).
   - Error style = `#E53935`, Helvetica Neue 14px w400 (`spec:42-766` line 45-48).
   - App today: `.error-msg { color: var(--danger); font-size: 14px; text-align: center; min-height: 20px; }` (`code:public/app.css:614`), `--danger: #b3202a` dark (`code:public/app.css:51`). This annotation is a **global** instruction — it covers `#auth-error`, `#menu-error`, `#lobby-error` and every other `.error-msg`.

---

## 1. Per-frame mapping

### 1.1 `42:678` — Auth → **MAPPED** to `#screen-auth`

| | |
|---|---|
| **App anchor** | `#screen-auth` — `code:public/index.html:22-37` |
| **App state** | not logged in; initial load, or after logout (`code:public/app.js:948-956`) |
| **Registered in screens map** | `code:public/app.js:97-104` (`auth: $("screen-auth")`, exact line for `auth` key is in the same object literal at `code:public/app.js:98-103`) |

Element-by-element:

| Figma node (`spec:42-678`) | App element | Match? |
|---|---|---|
| FRAME "Username" (fill `#232729`, stroke `#FFFFFF` 2px, r16), TEXT `"momoney"` | `#auth-username`, `placeholder="Username"`, `maxlength=16` — `code:public/index.html:28` | copy + treatment delta (§2, §3) |
| FRAME "Pin", TEXT `"4 Digit Pin"` @50% opacity | `#auth-passcode` `type=tel` `maxlength=4` `placeholder="4-digit PIN"` — `code:public/index.html:30` | copy delta |
| CTA `#FF6C02`, TEXT `"Log in"` | `#btn-login .btn .btn-primary .btn-large` — `code:public/index.html:32` | palette + copy delta |
| CTA `#232729`, TEXT `"Create an account"` | `#btn-register .btn .btn-secondary .btn-large .pxc` inside `.btn-pxb` — `code:public/index.html:33` | palette + copy + treatment delta |
| TEXT `"MAFIA"` Grandstander 48px | `.logo h1` `MAFIA<span class="wordmark-dot">.</span>` — `code:public/index.html:25`; styled Silkscreen 32px / ls 8px — `code:public/app.css:601` | font + size + copy delta |
| FRAME "Skull" 244x245, radial `#218BE1`→`#000000`, RECTANGLE "image 8" 200x200 `image fill ref=e721e25818db0cf44d23ba66f5720bb5dc2c04a7` | `.logo-icon#logo-icon-auth` 80x80 rendering `MASCOT_ART` pixel-art SVG at scale 16 — `code:public/index.html:24`, `code:public/app.js:4325-4332`, `code:public/app.css:596-600` | **art-system delta (§2)** |
| *(no Figma equivalent)* | `#auth-error .error-msg` — `code:public/index.html:35` | app-only, but covered by annotation #2 |
| *(no Figma equivalent)* | `.copyright` `© DaleWorldwide <span class="app-version">` — `code:public/index.html:36` | app-only (§5) |

---

### 1.2 `42:766` — Returning User → **MAPPED** to `#screen-menu` (invalid/empty-code state)

| | |
|---|---|
| **App anchor** | `#screen-menu` — `code:public/index.html:40-63` |
| **App state** | authenticated, no active game; entered via `registered` / `logged_in` (`code:public/app.js:326-347`), leave-lobby (`code:public/app.js:987-1000`), or `room_closed` (`code:public/app.js:624-637`) |

| Figma node (`spec:42-766`) | App element | Match? |
|---|---|---|
| TEXT `"Welcome, mo"` Grandstander 24px | `<h2>Welcome, <span id="menu-username"></span></h2>` — `code:public/index.html:50`; filled at `code:public/app.js:336` | copy shape matches |
| TEXT `"Log out"` @50% opacity, HelveticaNeue 14px | `#btn-logout .btn .btn-small .btn-ghost` `Log Out` — `code:public/index.html:51` | copy + treatment delta |
| FRAME "Pin", TEXT `"4 Digit Pin"` @50% — **always visible** | `#join-code` `placeholder="Room Code"` `maxlength=4`, inside `#join-section.hidden` — `code:public/index.html:57-58` | **BIG flow delta (§4-F2)** |
| CTA `#A0A0A0` TEXT `"Join"` (muted = disabled) | `#btn-join .btn .btn-primary` — `code:public/index.html:59`; always enabled, validates on click — `code:public/app.js:974-978` | **BIG flow delta (§4-F3)** |
| CTA `#232729` TEXT `"Host game"` (below Join) | `#btn-host .btn .btn-primary .btn-large` (**above** Join Game) — `code:public/index.html:54` | ordering + hierarchy delta (§4-F4) |
| TEXT `"Enter a valid code"` `#E53935` | `#menu-error .error-msg` — `code:public/index.html:61`; app string is `"Enter a 4-character room code"` — `code:public/app.js:976` | copy delta (§3) |
| *(no Figma equivalent)* | `#btn-join-show` `Join Game` — `code:public/index.html:55` | app-only reveal step (§5) |
| *(no Figma equivalent)* | `#pull-refresh-menu` — `code:public/index.html:42-44` | app-only (§5) |
| MAFIA wordmark + Skull illustration | `.logo.logo-small` + `#logo-icon-menu` (48px) — `code:public/index.html:45-48`, `code:public/app.css:606-608` | same art-system delta as Auth |

---

### 1.3 `287:3259` — Active room code → **MAPPED** to `#screen-menu` (valid-code / join-section-open state)

| | |
|---|---|
| **App anchor** | same `#screen-menu`, with `#join-section` un-hidden and `#join-code` holding 4 chars — `code:public/index.html:57-60`, `code:public/app.js:969-972` |

This frame is **not a separate app screen** — it is the *filled-code* variant of 42:766. Only two things change vs 42:766 (`spec:287-3259` vs `spec:42-766`):
- Pin field text `"E92G"` at 100% opacity instead of `"4 Digit Pin"` @50%.
- Join CTA fill flips `#A0A0A0` → `#FF6C02` (disabled → enabled).
- The `"Enter a valid code"` error line is **gone**.

The app has no equivalent enabled/disabled visual state on `#btn-join` at all — see §4-F3.

---

### 1.4 `42:782` — Lobby / Player → **MAPPED** to `#screen-lobby-player`

| | |
|---|---|
| **App anchor** | `#screen-lobby-player` — `code:public/index.html:174-190` |
| **App state** | joined a room as non-admin, pre-game; entered via `game_joined` with `isAdmin === false` — `code:public/app.js:358-370` |

| Figma node (`spec:42-782`) | App element | Match? |
|---|---|---|
| Nav TEXT `"Lobby"` Grandstander 16px | `<h2>Lobby</h2>` — `code:public/index.html:177` | ok |
| Nav `"Code"` @50% + `"E92G"` Grandstander 18px `#FF6C02` | `.room-code` `Code: <span id="lobby-code-player">` — `code:public/index.html:179`; styled `--primary` amber `#e8a33d`, IBM Plex Mono 18px ls3 — `code:public/app.css:628-629`; filled at `code:public/app.js:367` | palette + font delta |
| Nav FRAME "icon" 24x24 (people glyph; `png` shows a two-person icon) → opens Roles in Play (`wiring` `268:566` → `268:640`) | **NO APP EQUIVALENT in the lobby.** `#btn-roster` exists only in the *game* header — `code:public/index.html:199` | **BIG flow delta (§4-F6)** |
| Nav INSTANCE "Settings" 24x24 → `130:370` (`wiring` `42:810`) | `#btn-settings-lobby-player .btn .btn-icon` `&#9881;` — `code:public/index.html:180`; handler `code:public/app.js:3303` | ok |
| TEXT `"Waiting for host to start..."` Grandstander 24px | `<p class="waiting-text">Waiting for <span id="admin-name-display"></span> to start...</p>` — `code:public/index.html:183`; filled `code:public/app.js:1090` | copy delta (§3) |
| FRAME "Roles" card: `"Mafia members" / "2"`, rule line, `"Special Roles" / "Doctor, Detective, Hunter, Joker "` | `#player-lobby-settings` rendering `.lobby-settings-row` × 2 with labels `Mafia Members` and `Special Roles` — `code:public/index.html:184`, `code:public/app.js:1203-1226` | copy + treatment delta |
| FRAME "Players" card: `"Players" / "6/20"`, `"dale (host)"` + Star instance, coloured 14px ellipse per player | `.players-section` `<h3>Players (<span id="player-count-player">0</span>/20)</h3>` + `#players-list-player` — `code:public/index.html:185-188`; row markup = colour dot + name + `<span class="admin-badge">HOST</span>` — `code:public/app.js:1081-1084` | layout + host-marker delta (§2) |
| FRAME "Colors" card: `"Choose your color"` + 3 rows × 6 = **18** swatches, 34px, white 2px stroke, unselected @60% opacity | `#color-picker-player` — `code:public/index.html:189`; rendered with heading `"Your Color"` and **20** `PLAYER_COLORS` — `code:public/app.js:1163`, `code:public/app.js:85-90`, `code:public/app.js:1150-1198` | **palette + count + copy delta (§2, §3)** |
| Child FRAME "Players" 390x285 titled `"Settings"` (Dark mode / Sound effects / Hide mafia tag / Room code) with **no** dim rectangle | The settings sheet parked off-canvas. Same content as `130:370` minus the 30%-black scrim (`spec:130-370` line 192-193 has `RECTANGLE "Rectangle 2" 390x844 opacity=30%`; `spec:42-782` has none), and `png` renders 42:782 with no visible sheet. **INFERRED:** 42:782 is the sheet-closed state and the sheet node is parked outside the 844px viewport. |
| *(no Figma equivalent)* | `#btn-leave-player` `Leave` in the header — `code:public/index.html:176`, handler `code:public/app.js:995-1000` | **app-only, no Figma affordance (§5)** |

---

### 1.5 `45:466` — Lobby / Host → **MAPPED** to `#screen-lobby-admin`

| | |
|---|---|
| **App anchor** | `#screen-lobby-admin` — `code:public/index.html:66-171` |
| **App state** | room created by this user (`game_created` — `code:public/app.js:349-356`) or rejoined as admin (`game_joined` with `isAdmin` — `code:public/app.js:363-365`) |

| Figma node (`spec:45-466`) | App element | Match? |
|---|---|---|
| Nav `"Lobby"` / `"Code" "E92G"` / people icon / gear | `code:public/index.html:67-74`; gear = `#btn-settings-lobby-admin` (`code:public/app.js:3302`) | people icon has **no app equivalent** — §4-F6 |
| TEXT `"Choose how to play"` Grandstander 24px | `<h3>Game Settings</h3>` inside `.settings-panel` — `code:public/index.html:77` | copy delta (§3) |
| "Lobby rules" card row `"Mafia members"` + Minus circle / `2` / Plus circle (32px circular icon instances) | `.setting-row` `<span>Mafia Members</span>` + `#mafia-minus` / `#mafia-count` / `#mafia-plus` `.btn-counter` — `code:public/index.html:79-86`; handlers clamp 1..6 — `code:public/app.js:1015-1029` | treatment delta (circular outline icons vs `.btn-counter`) |
| Role Toggle `"Doctor"` = On + Rules sub-instance (`Official` `#FF6C02` / `House`) + hint `"Save is secret – only victim is notified"` | `#toggle-doctor` + `#doctor-mode-row` `#doctor-mode-tabs` (`Official`/`House`) + `#doctor-mode-hint` — `code:public/index.html:88-98`; live hint text set at `code:public/app.js:1133-1135` | **copy delta — the app's official hint is a different rule (§3)** |
| `"Detective"` toggle = On | `#toggle-detective` — `code:public/index.html:100-103` | ok |
| Role Toggle `"Joker"` = On + Rules + hint `"Game continues – Joker can haunt a voter"` | `#toggle-joker` + `#joker-mode-row` + `#joker-mode-hint` — `code:public/index.html:105-115`; text matches `code:public/app.js:1141-1143` | **copy matches exactly** |
| `"Hunter"` toggle = Off | `#toggle-hunter` — `code:public/index.html:117-120` | ok |
| `"Lovers"` toggle = Off | `#toggle-lovers` — `code:public/index.html:127-130` | ok |
| *(no Figma row)* | `#toggle-vigilante` — `code:public/index.html:122-125` | **app-only role, no Figma row (§5)** |
| *(no Figma row)* | `#toggle-godfather` — `code:public/index.html:132-135` | **app-only role, no Figma row (§5)** |
| FRAME "Narrator": `"Narrator's voice"` + Genders instance (`Male` selected `#039BE5` / `Female`) + Arrow-left-circle / `"Canadian"` / Arrow-right-circle — **always expanded** | `#lobby-accent.accent-picker.collapsed` with `.accent-picker-title` `Narrator Voice`, a `#accent-picker-toggle` disclosure, and `#accent-picker-expanded[hidden]` containing `#accent-arrow-prev` / `#accent-picker-label` / `#accent-arrow-next` / `#narrator-gender-control` (`Male` / `Female`) — `code:public/index.html:137-158` | **copy + flow delta (§3, §4-F7)**. `canadian` is a real accent (`public/audio/canadian-{male,female}/`), so the sample value is legitimate. |
| FRAME "Roles" summary card (`Mafia members / 2`, `Special Roles / Doctor, Detective, Hunter, Joker `) — **also on the host screen** | **NO APP EQUIVALENT on the admin lobby.** `#player-lobby-settings` is rendered into the *player* lobby only — `code:public/index.html:184`; `updatePlayerLobbySettings` targets that single container — `code:public/app.js:1203-1205` | **gap (§4-F8)** |
| FRAME "Players" card | `.players-section` + `#players-list-admin` / `#player-count-admin` — `code:public/index.html:162-165` | same delta as player lobby |
| FRAME "Colors" card | `#color-picker-admin` — `code:public/index.html:167`; same renderer — `code:public/app.js:1095` | same delta as player lobby |
| Bottom-pinned CTA `#FF6C02` `"Start game"` → `74:335` Main game screen (`wiring` `55:40`) | `#btn-start .btn .btn-primary .btn-large` `Start Game` — `code:public/index.html:169`; sends `start_game` — `code:public/app.js:1002-1005` | copy + pinning delta (§2, §3) |
| *(no Figma equivalent)* | `#btn-leave-admin` `Leave` — `code:public/index.html:68` | app-only (§5) |
| *(no Figma equivalent)* | `#lobby-error .error-msg` — `code:public/index.html:170` | app-only (§5) |

Note: the Figma Container is `358x1356` inside an `844`-tall frame (`spec:45-466` line 13) — i.e. the host lobby **scrolls**, with the Start game CTA pinned as a frame-level sibling (line 333). The app's `#btn-start` is an in-flow child at the end of the scrolling screen (`code:public/index.html:169`), not pinned.

---

### 1.6 `130:370` — Lobby / Settings → **MAPPED** to `#modal-settings` (opened from a lobby screen)

| | |
|---|---|
| **App anchor** | `#modal-settings` — `code:public/index.html:427-461`; opened by `#btn-settings-lobby-player` / `#btn-settings-lobby-admin` — `code:public/app.js:3302-3303`, `openSettingsModal` `code:public/app.js:3275-3299` |

| Figma row (`spec:130-370` lines 194-253) | App row | Match? |
|---|---|---|
| Title `"Settings"` Grandstander 24px + circular `X` (r100, 32px) | `.modal-header` `<h3>Settings</h3>` + `#btn-close-settings .btn .btn-icon` `&times;` — `code:public/index.html:429-432` | treatment delta |
| `"Dark mode"` + Toggle State=On (`#34C759`) | `"Theme"` + `#theme-mode-control` segmented `Dark` / `Light` buttons — `code:public/index.html:442-448`; `themeMode` is strictly binary `dark|light` — `code:public/app.js:3434-3455` | **copy + control-type delta (§2, §3) — semantically equivalent** |
| `"Sound effects"` + Toggle State=On | `"Sound Effects"` + `#toggle-sound` checkbox `.toggle` — `code:public/index.html:438-441` | copy-case delta |
| `"Hide mafia tag"` + Toggle State=Off | `"Hide Mafia Tag"` + `#toggle-hide-mafia-tag` — `code:public/index.html:449-452` | copy-case delta |
| `"Room code"` + `"E92G"` Grandstander 24px — **unconditional** | `#settings-room-code.setting-row.hidden` + `#settings-room-code-value` — `code:public/index.html:434-437`; shown only when `isAdmin && gameCode` — `code:public/app.js:3280-3285` | **BIG flow delta (§4-F9)** |
| *(no Figma row)* | `#settings-end-game` → `#btn-end-game` `End Game` (admin, in-game only) — `code:public/index.html:453-455`, gated `code:public/app.js:3287-3291` | app-only (§5) |
| *(no Figma row)* | `#settings-leave-game` → `#btn-settings-leave` `Leave Game` (non-admin, in-game only) — `code:public/index.html:456-458`, gated `code:public/app.js:3293-3297` | app-only (§5) |
| Scrim `RECTANGLE "Rectangle 2" 390x844 opacity=30% #000000` | `.modal` backdrop; light theme overrides to `rgba(0,0,0,0.4)` — `code:public/app.css:258` | opacity delta (30% vs 40% in light) |
| Dismiss: `X` (`135:1121`) → `42:782` (`wiring`) | close button **and** backdrop click — `code:public/app.js:3305-3309` | app is a superset — SMALL |

---

### 1.7 `268:640` — Lobby / Roles in Play → **PARTIALLY MAPPED** to `#modal-roster` (which is unreachable from the lobby)

| | |
|---|---|
| **App anchor** | `#modal-roster` — `code:public/index.html:464-473`; renderer `renderRoster` — `code:public/app.js:3320-3342`; opener `openRosterModal` bound **only** to `#btn-roster` in the game header — `code:public/app.js:3344-3352`, `code:public/index.html:199` |

| Figma row (`spec:268-640` lines 194-240) | App row | Match? |
|---|---|---|
| Title `"Roles in Play"` Grandstander 24px + circular `X` | `<h3>Roles in Play</h3>` + `#btn-close-roster` — `code:public/index.html:466-469` | **copy matches exactly** |
| Row: chip `"Mafia"` fill `#DC998F` / text `#67281E`, r8, then `"x 2"` Grandstander 18px | `.roster-row` → `.roster-name` `Mafia` + `.roster-count` `×2`, chip colour driven by `--rc: var(--role-mafia)` = `#d32f2f` — `code:public/app.js:3327-3336`, `code:public/app.css:57` | **palette + copy delta (§2, §3)** |
| Row: chip `"Doctor"` fill `#B3D1D6` / text `#1E5C67`, `"x 1"` | same renderer; `--role-doctor: #2196f3` — `code:public/app.css:59` | palette delta |
| Row: chip `"Detective"` fill `#F9F9B4` / text `#93791D`, `"x 1"` | same renderer; `--role-detective: #9c27b0` — `code:public/app.css:60` | palette delta |
| *(no Figma equivalent)* | `.roster-mode-badge` `OFFICIAL` / `HOUSE` per role — `code:public/app.js:3328-3329` | app-only (§5) |
| *(no Figma equivalent)* | `.roster-mods` `+ Godfather · Lovers` line — `code:public/app.js:3337-3340` | app-only (§5) |
| *(no Figma equivalent)* | `.roster-hint` `Tap outside to dismiss` — `code:public/index.html:471` | app-only |
| Entry point: lobby nav people icon (`wiring` `268:566` `icon` → `268:640`) | **no lobby entry point exists**; and `currentRoster` is only assigned on `game_started` (`code:public/app.js:392`) and `game_sync` (`code:public/app.js:672`) — it is `null` in the lobby (`code:public/app.js:46`), so `renderRoster` would print `"No roster available."` (`code:public/app.js:3322-3325`) | **BIG flow delta + missing data (§4-F6)** |

---

### Frame coverage summary

| Frame | Verdict |
|---|---|
| `42:678` Auth | MAPPED — `#screen-auth` |
| `42:766` Returning User | MAPPED — `#screen-menu` (invalid-code state) |
| `287:3259` Active room code | MAPPED — `#screen-menu` (valid-code state; not a distinct app screen) |
| `42:782` Lobby / Player | MAPPED — `#screen-lobby-player` |
| `45:466` Lobby / Host | MAPPED — `#screen-lobby-admin` |
| `130:370` Lobby / Settings | MAPPED — `#modal-settings` |
| `268:640` Lobby / Roles in Play | PARTIALLY MAPPED — `#modal-roster` exists but is unreachable from the lobby and has no lobby data source |

**7 mapped (1 partial), 0 with no app equivalent.**

---

## 2. Visual deltas

### 2.1 Palette

| Token | Figma | App today | Source |
|---|---|---|---|
| Screen background | `#000000` (all 7 frames) | `--bg: #0b0b10` dark / `#f0ebe1` light | `spec:42-678` line 12; `code:public/app.css:42`, `:241` |
| Card / input surface | `#232729` | `--bg-card: #1a1a2e`, `--bg-input: #15152a` | `spec:42-678` line 16-17; `code:public/app.css:43-46` |
| Primary CTA | `#FF6C02` (orange) | `--primary: #e8a33d` dark / `#b87d24` light (amber) | `spec:42-678` line 31; `code:public/app.css:48-49`, `:249-250` |
| Secondary CTA | `#232729` (same as surface) | `.btn-secondary` on `--bg-card` inside `.btn-pxb` stepped frame | `spec:42-678` line 38; `code:public/index.html:33` |
| Disabled CTA | `#A0A0A0` | no disabled CTA style in the menu domain | `spec:42-766` line 32 |
| Error text | `#E53935` | `--danger: #b3202a` | `spec:42-766` line 48; `code:public/app.css:51`, `:614` |
| Code accent | `#FF6C02` | `--primary` amber `#e8a33d` | `spec:42-782` line 28; `code:public/app.css:629` |
| Toggle ON | `#34C759` (iOS green) | `--success: #388e3c` (`.toggle input:checked + .slider { background: var(--success) }`) — a *darker* green | `spec:130-370` line 213; `code:public/app.css:877`, `:53` |
| Toggle OFF track | `#787880 @ 16%` | `--border`-derived | `spec:130-370` line 239 |
| Rules "Official" pill | `#FF6C02` | `.rule-tab.active { background: var(--primary); color: #141008 }` — amber on ink, not orange on white | `spec:45-466` line 80; `code:public/app.css:840-842` |
| Gender "Male" pill | `#039BE5` (blue) | `.narrator-gender-btn.active { background: var(--primary); color: #141008 }` — amber, not blue | `spec:45-466` line 161; `code:public/app.css:804-807` |
| Role chips (Roles in Play) | pastel fill + dark text: Mafia `#DC998F`/`#67281E`, Doctor `#B3D1D6`/`#1E5C67`, Detective `#F9F9B4`/`#93791D` | saturated `--role-*`: mafia `#d32f2f`, doctor `#2196f3`, detective `#9c27b0` | `spec:268-640` lines 209-236; `code:public/app.css:57-65` |
| Skull glow | radial `#218BE1 @60%` → `#000000 @60%` | none (flat pixel mascot, no glow) | `spec:42-678` line 49 |
| Player colour swatches | 18 values, incl. `#E876A0 #8E24AA #5E35B1 #3949AB #1E88E5 #039BE5 #00ACC1 #00897B #43A047 #7CB342 #C0CA33 #FDD835 #FFB300 #FB8C00 #F4511E #6D4C41 #757575 #E53935` | 20 values in `PLAYER_COLORS` | `spec:42-782` lines 136-191; `code:public/app.js:85-90` |

Player-colour overlap between the two sets is **2 of 18** (`#E53935`, `#C0CA33`) — this is a full palette replacement, not a tweak. Note also an internal Figma inconsistency: the Players-card dots use `#218BE1` and `#66BB6A` (`spec:42-782` lines 104, 118) which do **not** appear in the Colors swatch grid on the same frame — **INFERRED** the mock's dots were hand-picked rather than drawn from the swatch set; the re-skin should treat the 18-swatch grid as canonical.

### 2.2 Typography

| | Figma | App |
|---|---|---|
| Display / headings / labels | **Grandstander** Regular (w400) — 48px wordmark, 24px screen titles, 18px numerals, 16px nav, 14px body labels | **Silkscreen** for display (`code:public/app.css:71`, `:601`, `:1145`); **Libre Franklin** as the body family (`code:public/app.css:349`) |
| Secondary / hint / placeholder | **Helvetica Neue** 14px (and 10px for rule hints) | Libre Franklin 14px; hints inherit body |
| Numerals / code | Grandstander 18-24px | **IBM Plex Mono** (`code:public/app.css:611`, `:629`, `:615`) |
| Weight | everything is w400 | app leans on 700 for display (`code:public/app.css:601`) |

Grandstander is **not** loaded anywhere in the app: the only `@font-face` families are Silkscreen, Libre Franklin, IBM Plex Mono (`code:public/app.css:4-32`), and the only preloads are silkscreen-700 + libre-franklin-var (`code:public/index.html:13-14`). A re-skin to Grandstander requires adding self-hosted woff2 files under `public/fonts/` and new preload links.

### 2.3 Layout / geometry

| | Figma | App |
|---|---|---|
| Frame width | 390 (content 358, i.e. 16px side gutters) | `#app { max-width: 430px }` (`code:public/app.css:360-361`) |
| Corner radius | `radius=16` on every card, input, and CTA; `radius=100` on toggles and X buttons | **stepped pixel corners** via `clip-path` `.pxc` (12px/4px) and `.pxb` two-layer borders; `border-radius: 0` explicitly on panels (`code:public/app.css:76-83`, `:632-637`) |
| Card border | `stroke: #FFFFFF 2px` | 2px stepped border in `--border`/role colour via the shared `.pxframe` pseudo-element rule (`code:public/app.css:99-119`) |
| Elevation | `DROP_SHADOW r23.8 offset 0,4 #000000 @20%` on every card and CTA | no equivalent card shadow; the noir style uses bevels and dither instead |
| CTA height | 60px, pad 16, gap 10 | `.btn-large` sizing (not 60px-pinned) |
| Lobby structure | one scrolling `Container` (host: 1356px tall) + frame-pinned bottom CTA | in-flow screen scroll, CTA in flow (`code:public/index.html:169`) |
| Lobby cards | 3 discrete bordered cards: Roles / Players / Colors | `.settings-panel` (admin) / `#player-lobby-settings` (player), `.players-section`, `.color-picker-section` — different grouping, only `.settings-panel` is a bordered card |
| Player row | name (+ 14px Star instance for host) … 14px colour ellipse right-aligned | colour dot **left** of name + text badge `HOST` right of name (`code:public/app.js:1082-1083`) |
| Nav | `Lobby` / `Code E92G` / people icon / gear — **no back or leave control** | `Leave` button / `Lobby` / `Code:` / gear (`code:public/index.html:67-74`, `:175-182`) |

### 2.4 Component treatment

| Component | Figma | App |
|---|---|---|
| Hero art | 200x200 raster **image fill** `e721e25818db0cf44d23ba66f5720bb5dc2c04a7` — 3D-rendered chibi characters (mafioso in fedora + citizen), on a radial blue glow (`spec:42-678` lines 48-51; visually confirmed in `png` and in `visual-game-menu.md` §42:678 item 6) | 10x10-grid pixel-art SVG `MASCOT_ART` rendered by `pixelArtToSvg` at 80px/48px (`code:public/app.js:4325-4332`; grids defined in `public/pixel-art.js` per `CLAUDE.md`) |
| Role identity in lobby | pastel **chip** with dark text (Roles in Play sheet) | role-coloured `.roster-row` chip driven by `--role-*` CSS vars (`code:public/app.js:3331`) |
| "Membership Card" component | catalogued in the Figma component set (per `visual-game-menu.md` §268:640) but **does not appear on any of the 7 Game Menu frames** — no `INSTANCE "Membership Card"` in any `spec:` file for this section | app's `.card-back` carries the literal label `MEMBERSHIP CARD` (`code:public/index.html:237`) — a *game-screen* element, out of scope here |
| Toggle | 51x31 pill, 27px white knob, 3 stacked drop shadows | `.toggle` + `.slider` checkbox skin |
| Counter | circular outline `Minus circle` / `Plus circle` instances, 32px, 3px stroke | `.btn-counter` `-` / `+` text buttons (`code:public/index.html:82-84`) |
| Segmented rules | `Official` / `House` pills, r8, pad 8 | `.rule-tabs` `.rule-tab` (`code:public/index.html:93-96`) |
| Close button | 32px `radius=100` circle wrapping a 20px `X` icon instance | `.btn-icon` with `&times;` glyph (`code:public/index.html:431`, `:468`) |
| Host marker | `Star` icon instance, 14px, 1.6px stroke | text badge `HOST` (`code:public/app.js:1083`) |

**Art-direction conflict (decision needed):** Figma's chibi image fills are photographic-style 3D renders; the entire live app is a coherent 10x10 pixel-art system (`CLAUDE.md` "Pixel Art" section; `code:public/app.js:4322-4367` injects pixel SVGs at ~10 sites in the menu/game chrome). These two systems cannot both be the house style.

---

## 3. Copy deltas (exact strings)

| Location | Figma string | App string | Source |
|---|---|---|---|
| Auth — username field | `"momoney"` (sample content, no placeholder shown) | placeholder `"Username"` | `spec:42-678` line 19; `code:public/index.html:28` |
| Auth — PIN field | `"4 Digit Pin"` | `"4-digit PIN"` | `spec:42-678` line 26; `code:public/index.html:30` |
| Auth — primary CTA | `"Log in"` | `"Log In"` | `spec:42-678` line 34; `code:public/index.html:32` |
| Auth — secondary CTA | `"Create an account"` | `"Create Account"` | `spec:42-678` line 41; `code:public/index.html:33` |
| Wordmark | `"MAFIA"` | `"MAFIA."` (trailing blood-red period via `.wordmark-dot`) | `spec:42-678` line 45; `code:public/index.html:25`, `code:public/app.css:604` |
| Menu — greeting | `"Welcome, mo"` | `"Welcome, "` + `#menu-username` | `spec:42-766` line 16; `code:public/index.html:50` |
| Menu — logout | `"Log out"` | `"Log Out"` | `spec:42-766` line 20; `code:public/index.html:51` |
| Menu — code field | `"4 Digit Pin"` (placeholder) / `"E92G"` (filled) | `"Room Code"` (placeholder) | `spec:42-766` line 27, `spec:287-3259` line 27; `code:public/index.html:58` |
| Menu — join CTA | `"Join"` | `"Join"` (submit) and `"Join Game"` (reveal button) | `spec:42-766` line 35; `code:public/index.html:59`, `:55` |
| Menu — host CTA | `"Host game"` | `"Host Game"` | `spec:42-766` line 43; `code:public/index.html:54` |
| Menu — code error | `"Enter a valid code"` | `"Enter a 4-character room code"` | `spec:42-766` line 47; `code:public/app.js:976` |
| Lobby — nav title | `"Lobby"` | `"Lobby"` | `spec:42-782` line 17; `code:public/index.html:177` |
| Lobby — code label | `"Code"` | `"Code:"` (colon in markup) | `spec:42-782` line 23; `code:public/index.html:179` |
| Lobby player — status | `"Waiting for host to start..."` | `"Waiting for "` + `#admin-name-display` + `" to start..."` | `spec:42-782` line 38; `code:public/index.html:183` |
| Lobby — roles card labels | `"Mafia members"`, `"Special Roles"` | `"Mafia Members"`, `"Special Roles"` | `spec:42-782` lines 47, 58; `code:public/app.js:1218`, `:1222` |
| Lobby — special-roles value | `"Doctor, Detective, Hunter, Joker "` (note trailing space in the mock) | `"Doctor (Official), Detective, Joker (Official), Hunter, Vigilante, Lovers, Godfather"` shape — modes are inlined in parentheses | `spec:42-782` line 63; `code:public/app.js:1207-1214` |
| Lobby — players header | `"Players"` + `"6/20"` (separate nodes) | `"Players (6/20)"` (single interpolated heading) | `spec:42-782` lines 71, 75; `code:public/index.html:186` |
| Lobby — colours header | `"Choose your color"` | `"Your Color"` | `spec:42-782` line 132; `code:public/app.js:1163` |
| Lobby host — screen title | `"Choose how to play"` | `"Game Settings"` | `spec:45-466` line 38; `code:public/index.html:77` |
| Lobby host — doctor official hint | `"Save is secret – only victim is notified"` | `"Save is secret from the living — no living player is told who was saved, not even the victim (the dead see everything)"` | `spec:45-466` line 85; `code:public/index.html:97`, `code:public/app.js:1134` |
| Lobby host — joker official hint | `"Game continues – Joker can haunt a voter"` | `"Game continues — Joker can haunt a voter"` | `spec:45-466` line 124; `code:public/app.js:1142` |
| Lobby host — narrator label | `"Narrator's voice"` (curly apostrophe `’`) | `"Narrator Voice"` | `spec:45-466` line 156; `code:public/index.html:138` |
| Lobby host — start CTA | `"Start game"` | `"Start Game"` | `spec:45-466` line 337; `code:public/index.html:169` |
| Settings — theme row | `"Dark mode"` | `"Theme"` + `"Dark"` / `"Light"` | `spec:130-370` line 209; `code:public/index.html:443-446` |
| Settings — sound row | `"Sound effects"` | `"Sound Effects"` | `spec:130-370` line 222; `code:public/index.html:439` |
| Settings — mafia tag row | `"Hide mafia tag"` | `"Hide Mafia Tag"` | `spec:130-370` line 235; `code:public/index.html:450` |
| Settings — room code row | `"Room code"` | `"Room Code"` | `spec:130-370` line 247; `code:public/index.html:435` |
| Roles in Play — title | `"Roles in Play"` | `"Roles in Play"` | `spec:268-640` line 200; `code:public/index.html:467` |
| Roles in Play — count | `"x 2"` / `"x 1"` (ASCII `x`, space) | `"×2"` / `"×1"` (U+00D7, no space) | `spec:268-640` lines 215, 227; `code:public/app.js:3334` |

**Doctor-hint conflict is a rules conflict, not a wording nit.** The Figma "Official" hint (`"Save is secret – only victim is notified"`) describes a rule the app deliberately does **not** implement — the app's Official mode tells *nobody* living, "not even the victim" (`code:public/index.html:97`, `code:public/app.js:1134`). Shipping the Figma copy would mis-describe the engine.

---

## 4. Flow deltas

Baseline app transitions, all routed through `showScreen()` (`code:public/app.js:112-144`) — it is the single chokepoint and also clears `data-phase` off non-game screens (`code:public/app.js:139-143`).

| ID | Figma flow (`wiring`) | App flow (code) | Size | Playtest assertion needed |
|---|---|---|---|---|
| **F1** | `42:686` CTA `"Log in"` ON_CLICK → `42:766` Returning User (`spec:42-678` line 61; `wiring` line 199) | `#btn-login` → `wsSend({type:"login"})` (`code:public/app.js:940-946`); server replies `logged_in` → `showScreen("menu")` (`code:public/app.js:326-338`). Async, can fail. | **SMALL** | — (behaviour already matches on the happy path) |
| **F2** | Room-code field is **always visible** on Returning User (`spec:42-766` lines 23-29) | Code field lives in `#join-section.hidden`; a separate `#btn-join-show` `"Join Game"` toggles it (`code:public/index.html:55-58`, `code:public/app.js:969-972`) | **BIG** | e2e: from `#screen-menu` on first paint, `#join-code` is visible and focusable **without** any prior click; typing 4 chars + Enter joins (`code:public/app.js:980-982`). Assert the reveal step is gone and no regression in the Enter-to-join keybinding. |
| **F3** | Join CTA is **disabled/grey `#A0A0A0`** until a valid code is present, then flips to `#FF6C02` (`spec:42-766` line 32 → `spec:287-3259` line 32); the Pin field's ON_CLICK models the transition (`wiring` `287:3251` → `287:3259`) | `#btn-join` is always enabled; validation happens **on click** and writes `"Enter a 4-character room code"` into `#menu-error` (`code:public/app.js:974-978`) | **BIG** | e2e: with `#join-code` empty, `#btn-join` is `disabled` and carries the muted style; after typing 4 chars it becomes enabled and orange; after deleting a char it reverts. Also assert the error line no longer fires on empty submit (it becomes unreachable), and that server-side errors (`"Cannot join: game full or already started"` — `code:src/server.ts:1205`; `"Game not found"` — `code:src/server.ts:1142`) still render into `#menu-error`. |
| **F4** | Order + hierarchy on Returning User: **Join first (primary), Host game second (secondary `#232729`)** (`spec:42-766` lines 31-44) | `#btn-host` `"Host Game"` is `.btn-primary` and appears **first**; `#btn-join-show` `"Join Game"` is `.btn-secondary` second (`code:public/index.html:53-56`) | **SMALL** | — (pure reorder + class swap; no behaviour change) |
| **F5** | `287:3269` CTA `"Host game"` → `45:466` Lobby / Host; also connector `287:3254` (`spec:287-3259` line 64; `wiring` lines 44, 169) | `#btn-host` → `create_game` (`code:public/app.js:965-967`); server `game_created` → `showScreen("lobbyAdmin")` (`code:public/app.js:349-356`) | **SMALL** | — |
| **F6** | Lobby nav **people icon** `268:566` ON_CLICK → `268:640` Lobby / Roles in Play (`spec:42-782` line 269; `wiring` lines 33, 129-130), and `268:651` re-opens it from within (`spec:268-640` line 250) | **No such control exists in either lobby screen.** `#btn-roster` is game-header-only (`code:public/index.html:199`, handler `code:public/app.js:3351`). Worse, `currentRoster` is only populated by `game_started` (`code:public/app.js:392`) and `game_sync` (`code:public/app.js:672`) — it is `null` throughout the lobby (`code:public/app.js:46`), so even if the modal were opened it renders `"No roster available."` (`code:public/app.js:3322-3325`). | **BIG** | e2e (WS harness): host + 2 players in the lobby, host toggles Doctor/Detective on and sets mafiaCount=2; every client opens the new lobby roster control and `#roster-list` shows `Mafia ×2`, `Doctor ×1`, `Detective ×1` **before** `start_game`. Must also assert the lobby roster leaks **no identities** (no usernames in `#roster-list`) — the existing ten-player-secrecy tests are the guard rail here. This needs a **server-side lobby roster payload** (new message or an extra field on `lobby_update`), not just a client button. |
| **F7** | Narrator voice block is **always expanded** on Lobby / Host: label + Male/Female pills + prev/label/next arrows (`spec:45-466` lines 153-181) | `#lobby-accent` starts `.collapsed` with `#accent-picker-expanded[hidden]` behind a `#accent-picker-toggle` disclosure (`code:public/index.html:137-158`) | **SMALL** | — (cosmetic default-open; no state change). Flag: always-open adds ~110px to an already 1356px-tall host lobby. |
| **F8** | Lobby / Host shows the read-only **Roles summary card** (`Mafia members / 2`, `Special Roles / …`) *in addition to* the editable rules card (`spec:45-466` lines 182-205) | The summary is rendered into `#player-lobby-settings`, which exists only on `#screen-lobby-player` (`code:public/index.html:184`); `updatePlayerLobbySettings` writes to that one container (`code:public/app.js:1203-1205`). The host sees only the editable controls. | **SMALL** | — (additive read-only duplication of state the host already controls; no new server data). Worth confirming with Hanson that the duplication is intentional and not a mock artefact. |
| **F9** | Settings sheet shows **`Room code` + value unconditionally**, on both the player and host paths (`spec:130-370` lines 245-253, reached from `42:782` via `42:810` and from `45:466`) | `#settings-room-code` is un-hidden only when `isAdmin && gameCode` (`code:public/app.js:3280-3285`) — a **non-admin never sees the room code in Settings** | **BIG** | e2e: a non-admin player in a lobby opens Settings and `#settings-room-code` is visible with the correct 4-char code. Assert this holds in the lobby **and** in-game, and that it does not regress the admin path. (Low risk: the code is already visible in the lobby nav for players — `code:public/index.html:179` — so this is not a new information leak.) |
| **F10** | Settings `X` (`135:1121`) → back to `42:782` (`wiring` lines 54-55) | close button **and** backdrop click both close (`code:public/app.js:3305-3309`) | **SMALL** | — (app is a superset) |
| **F11** | Roles in Play `X` (`268:714`) → back to `42:782` (`spec:268-640` line 252) | close button + backdrop click (`code:public/app.js:3352-3355`) | **SMALL** | — |
| **F12** | `42:770` `"Log out"` ON_CLICK → `42:678` Auth (`spec:42-766` line 68) | `#btn-logout` clears `mafia_user` + `mafia_game_code`, nulls session state, `showScreen("auth")` (`code:public/app.js:948-956`) | **SMALL** | — |
| **F13** | Lobby / Host `"Start game"` (`55:40`) → `74:335` Main game screen (`wiring` lines 209-210) | `#btn-start` → `ensureAudioReady()` + `start_game` (`code:public/app.js:1002-1005`); `game_started` → `showScreen("game")` (`code:public/app.js:384-444`) | **SMALL** | — (note the app gates on `"Need at least 3 players to start"` — `code:src/server.ts:1320` — which the mock does not depict) |

**BIG flow deltas: 4 — F2, F3, F6, F9.** F6 is the only one that needs server work.

---

## 5. App states in the menu/lobby domain with NO Figma frame

The re-skin must decide fallback styling for each of these. Grouped by kind.

### 5.1 Error / failure states (11 distinct server strings + 3 client-side)

There is **no Figma frame** for any error state; the only guidance is annotation #2 ("use this error text style for other error states", `png`). Rendering path: `showError()` writes into the *active screen's* `.error-msg` (`code:public/app.js:4299-4303`).

Auth screen (`#auth-error`, `code:public/index.html:35`):
- client `"Enter a username"` (`code:public/app.js:935`), `"PIN must be exactly 4 digits"` (`code:public/app.js:936`), `"Enter username and PIN"` (`code:public/app.js:943`)
- server `"Username is required"` (`code:src/server.ts:1068`), `"Username must be 32 characters or fewer"` (`:1072`), `"Passcode must be exactly 4 digits"` (`:1076`), `"Username already taken"` (`:1081`), `"Invalid username or passcode"` (`:1095`)

Menu screen (`#menu-error`, `code:public/index.html:61`):
- client `"Enter a 4-character room code"` (`code:public/app.js:976`)
- server `"Not logged in"` (`code:src/server.ts:1111`, `:1132`), `"Already in a game"` (`:1115`, `:1136`), `"Game not found"` (`:1142` — also clears the stored code, `code:public/app.js:320-323`), `"Cannot join: game full or already started"` (`:1205`)

Admin lobby (`#lobby-error`, `code:public/index.html:170`):
- server `"Only the admin can start the game"` (`code:src/server.ts:1310`), `"Need at least 3 players to start"` (`:1320`), `"Invalid color"` (`:1976`)

**`#screen-lobby-player` has NO `.error-msg` element at all** (`code:public/index.html:174-190`) — so any error delivered while a non-admin sits in the lobby (e.g. `"Invalid color"` from a colour tap, `code:src/server.ts:1976`) is **silently swallowed** by `showError()`. This is a pre-existing app bug the re-skin should fix while it is in there. *(Out of scope to fix here — flagged, not touched.)*

### 5.2 Mid-flight / transitional states with no frame

- **Registration success path.** `"Create an account"` (`42:686`… actually the register CTA) has **no outgoing wiring in any spec or in `wiring`** — Figma never shows what happens after registering. App: `#btn-register` → `register` → `registered` → credentials persisted to `localStorage` → `showScreen("menu")` (`code:public/app.js:932-938`, `:326-347`).
- **Silent auto-login on socket open.** If `localStorage.mafia_user` exists, the client logs in without any UI (`code:public/app.js:153-165`); corrupt JSON is dropped silently (`code:public/app.js:161-162`). No frame, no spinner, no failure state.
- **Auto-rejoin after login.** If `localStorage.mafia_game_code` exists, the client immediately fires `join_game` after landing on the menu (`code:public/app.js:341-346`) — so the menu can flash for one frame before jumping to a lobby or to the game. No frame.
- **WebSocket disconnect / reconnect.** `ws.onclose` silently retries every 2s with **no UI at all** (`code:public/app.js:173-175`). No frame, no offline indicator.
- **Mid-game rejoin into a lobby.** `game_sync` can land a player in either lobby (`code:public/app.js:380-382`, and `updateLobby` force-navigates back to a lobby from `#screen-game`/`#screen-gameover` — `code:public/app.js:1098-1104`). No frame.
- **`room_closed`.** Host closes the room → every client wipes state and is thrown to `#screen-menu` with no notice (`code:public/app.js:624-637`). No frame, no toast.
- **Return-to-lobby from game over.** `updateLobby` re-enters the lobby from the gameover screen (`code:public/app.js:1098-1104`); admin buttons `#btn-play-again-new` / `#btn-return-to-lobby-player` (`code:public/index.html:368`, `:372`) route back into the lobby domain. No Game Menu frame covers the "second lap" lobby.

### 5.3 Controls / affordances present in the app but absent from every frame

- `#btn-leave-admin` / `#btn-leave-player` `"Leave"` in the lobby header (`code:public/index.html:68`, `:176`) — **the Figma lobby nav has no leave/back control at all.** Users would be trapped in the lobby.
- `#btn-join-show` `"Join Game"` reveal button (`code:public/index.html:55`).
- `#toggle-vigilante` and `#toggle-godfather` rows (`code:public/index.html:122-135`) — two shipped roles with no row in `spec:45-466`.
- `.roster-mode-badge` `OFFICIAL`/`HOUSE` chips and the `.roster-mods` `+ Godfather · Lovers` line in the roster modal (`code:public/app.js:3328-3340`).
- `#settings-end-game` / `#settings-leave-game` blocks in the Settings modal (`code:public/index.html:453-458`).
- `#pull-refresh-menu` pull-to-refresh (`code:public/index.html:42-44`).
- `.copyright` `© DaleWorldwide` + `.app-version` on auth and menu (`code:public/index.html:36`, `:62`; populated `code:public/app.js:4318-4321`).
- `.roster-hint` `"Tap outside to dismiss"` (`code:public/index.html:471`).
- Light theme entirely. Every Game Menu frame is black-background dark only (`spec:*` line 12 in all 7). The app ships a full warm-paper light palette (`code:public/app.css:240-256`) reachable from the Settings modal, and annotation #1 explicitly says "on dark mode…", implying a light mode exists but is undrawn.
- **Kick flow: does not exist.** No kick/remove-player path was found in `public/app.js` or `src/server.ts` (grep for `kick` returns nothing). The inventory's implied kick flow is **not** a real app state — nothing to cover.

### 5.4 Inventory claims that did not survive verification

- The inventory lists the Roles in Play modal under "Shown during game (from header button)" and does **not** flag that Figma wants it in the lobby — correct as a description of today's app, but it understates the gap. Verified: `code:public/index.html:199` is the only `#btn-roster`.
- The inventory says the Settings modal is shown "from any screen (auth, menu, lobby, game)". **Verified false for auth and menu**: the only three `openSettingsModal` bindings are `#btn-settings` (game header), `#btn-settings-lobby-admin`, `#btn-settings-lobby-player` (`code:public/app.js:3301-3303`), and no settings button exists in `#screen-auth` or `#screen-menu` (`code:public/index.html:22-63`). Figma agrees — no gear on Auth / Returning User / Active room code.

---

## 6. Decisions needed from Hanson

1. **Art system — chibi 3D renders vs pixel art.** Figma's hero is a 200x200 raster image fill (`e721e25818db0cf44d23ba66f5720bb5dc2c04a7`, `spec:42-678` line 51) of 3D chibi characters. The app is a coherent 10x10 pixel-art system (`CLAUDE.md`; `code:public/app.js:4325-4367`). Options: (a) adopt chibi rasters everywhere and retire `pixel-art.js`, (b) keep pixel art and re-draw the hero in-style, (c) chibi for menu/marketing surfaces + pixel art in-game. **(c) is a hybrid with a visible seam at lobby→game.**
2. **Typeface — Grandstander vs Silkscreen.** Grandstander is not in the repo; adopting it means self-hosting woff2s and rewriting every `font-family: 'Silkscreen'` site (~30 in `app.css`). Does the noir Silkscreen identity survive, or is this a full type-system swap?
3. **Palette — orange `#FF6C02` vs amber `--primary: #e8a33d`, and `#000000` vs `--bg: #0b0b10`.** Straight token swap, or keep the noir amber and treat the mock's orange as illustrative?
4. **Light theme.** No Figma frame draws it. Does light mode survive the re-skin? If yes, someone must spec `#FF6C02`/`#232729`/`#000000` equivalents on paper. If no, `#theme-mode-control` and ~20 `[data-theme="light"]` CSS blocks get deleted.
5. **Player colour palette.** Adopt Figma's 18 swatches (only 2 overlap with today's 20) or keep `PLAYER_COLORS`? Adopting means a migration path for players whose stored `player_color` is no longer in the set (`code:public/app.js:1173-1174` matches by exact hex, so stale colours would render as unselected).
6. **Lobby "Roles in Play" (F6).** Confirm this is wanted pre-game. It needs a server-side lobby roster payload plus a secrecy review — the whole point of hidden roles is that the lineup is public but identities are not. Also confirm whether Hunter/Vigilante should appear there pre-game (today's roster modal deliberately reveals all roles including Hunter/Vigilante, per the roster relaxation already in the suite).
7. **Room code visibility for non-admins in Settings (F9).** Figma shows it unconditionally; the app hides it from players. Confirm the change (it is not a leak — players already see the code in the lobby nav, `code:public/index.html:179`).
8. **Doctor Official hint copy.** Figma says `"Save is secret – only victim is notified"`; the engine implements "no living player is told, not even the victim". The Figma string is **wrong for this engine** — confirm the app copy stays and the mock is corrected.
9. **Vigilante and Godfather.** No Figma rows exist for either toggle. Are they being cut, or is the mock simply incomplete? If kept, the host lobby rules card grows by two rows.
10. **Leave / back affordance in the lobby.** Figma's nav has none. Confirm `Leave` stays (recommended — without it a player cannot exit a lobby) and decide where it goes in the new nav.
11. **Join-CTA disabled state (F3).** Confirm the app should adopt a real disabled state, and what counts as "valid": 4 chars (client-side) or server-confirmed? Figma's copy `"Enter a valid code"` implies server-confirmed, which is a different interaction than a length check.
12. **Host lobby: duplicate Roles summary card (F8).** Figma shows a read-only roles card on the host screen even though the host is editing those same values 200px above. Intentional?
13. **Card treatment.** Figma is `radius=16` + white 2px stroke + 20% drop shadow; the app is stepped `clip-path` corners with two-layer pixel borders and no shadow (`code:public/app.css:76-120`). Rounded corners would remove the pixel-noir chrome from every panel in the app, not just the menu.
14. **Copy casing convention.** Figma is sentence case throughout (`"Log in"`, `"Host game"`, `"Start game"`, `"Sound effects"`); the app is Title Case. Pick one and apply globally, not just to these 7 frames.
