# Program D — Pixel Noir Build Program

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to run this plan task-by-task. Spec: `docs/PIXEL-NOIR-DESIGN.md` (read it FIRST — it carries the constraints). Mockup ground truth: `docs/mockups/pixel-noir/`.

**Goal:** Carry the app's pixel-art identity into the entire frontend shell — type, palette, chrome, icons, phase ambience, dramatic beats — changing zero game mechanics, zero server code, zero narrator text, zero audio.

**Architecture:** Pure presentation program over `public/app.css`, `public/app.js`, `public/index.html`, `public/pixel-art.js`, `public/sw.js`, `public/fonts/` (new). All work flows through existing element-ID/class contracts; new art flows through the existing `pixelArtToSvg` pipeline; phase theming flows through CSS custom-property remaps on a new `data-phase` attribute.

**Tech stack:** Vanilla JS (no build step, window-global IIFEs), single-file CSS, Bun for tests, Playwright for visual smokes.

## Operating protocol (same as Programs B/C)

- **Two-stage review per task:** after the implementer reports, dispatch (1) a spec-compliance reviewer ("do not trust the report — verify by reading the diff and looking at screenshots"), then (2) a code-quality reviewer (`code-reviewer` agent type). Fix-loop until both pass. Only then mark the task DONE in the Status table.
- **Visual evidence required:** every task that changes pixels attaches Playwright screenshots (both themes where relevant) to its review. No screenshot, no DONE.
- **Self-handoff** at ~40–50% context: stop at a clean commit boundary, update the Status table (SHAs + remaining), hand off to a fresh orchestrator with this file.
- **Never push** — the user pushes and merges. Commit Status-table updates to this file as part of task commits. Never commit `.playwright-mcp/`.
- **Verification floor for every task:** `bun test` green (engine suites untouched), `bunx tsc --noEmit` zero errors, goldens 11/11 untouched. New WS test files (unlikely in D) take fresh port bands at 18600+ per BUILD-PROGRAM rule.
- **HARD CONSTRAINTS (from spec §2/§7/§11):** no slide-to-confirm payoff/haptics/audio; no narrator string edits; no `HOLD_GATE_PROMPTS`/`SUSPENSE_GATE_TYPES` membership or timing changes; no `src/**` changes; `ensureAudioReady()` stays inside user-gesture call chains; suspense overlay stays z-index 300 topmost.

## Gate: D1+ requires Program C merged

**GATE SATISFIED 2026-06-12:** C merged via PR #20 → `staging@19f4a14`; `staging.16` verified live; this branch already rebased onto it. Full 3-game staging playtest of the hunter passed (lynch+revenge, dawn-gate+decline, force-skip, rejoin mid-gate, visual smokes). Two playtest notes folded into task scopes: (1) D6 — the dead Hunter never gets the YOU-ARE-DEAD overlay after the gate resolves (normal deaths keep theirs; card-back does swap to skull) — decide deliberately, don't inherit by accident; (2) D1 — hunter `#ef6c00` and execution-event `#ff9800` oranges are near-adjacent, consider when tokenizing.

**Execution model (user mandate):** D1–D9 run in a FRESH Claude Code instance opened in this worktree, kicked off with the blurb at the bottom of this file. The coordinating session validates, pushes, and merges — this worker NEVER pushes.

D0 ran pre-merge (new files only). The original gate checklist (kept for the record):
1. `git -C /Users/hansonkang/Documents/GitHub/mafia-noir fetch origin && git rebase origin/staging` (D0 commits are docs+new files; rebase is trivial).
2. Read C's final carry-over notes in `docs/BUILD-PROGRAM.md` Status section.
3. Add to D-scope: hunter slide-confirm entry (icon/label/CSS), hunter role color (must collide with nothing, spec §3.2), hunter portrait in avatar/reveal coverage (D4/D6), any new C5 overlays/prompts into the restyle sweep (D1/D5).

---

### D0 — Pre-merge assets (spec, mockup, fonts) — RUNS NOW

**Files:** Create `docs/PIXEL-NOIR-DESIGN.md`, `docs/NOIR-PROGRAM.md`, `docs/mockups/pixel-noir/{mockup.html,pixel-art.js,pixel-noir-direction.png}`, `public/fonts/*.woff2` + `public/fonts/OFL.txt`.

- [ ] Commit spec + program doc + mockup artifacts: `docs(D0): Pixel Noir spec, program plan, approved direction mockup`
- [ ] Download latin woff2 for: Silkscreen 400+700, Libre Franklin 400/400italic/500/600, IBM Plex Mono 400/500 (8 files, names like `silkscreen-700.woff2`). Source: Google Fonts css2 API with a woff2-capable UA string; verify each file starts with `wOF2` magic bytes (`xxd -l4`). All three families are SIL OFL — include OFL.txt noting the three copyright lines.
- [ ] Commit: `feat(D0): self-host Silkscreen, Libre Franklin, IBM Plex Mono (latin woff2 + OFL)`
- [ ] Do NOT wire `@font-face` yet (app.css is C's file until merge).

### D1 — Foundation: fonts wired, tokens, component language, texture

**Files:** Modify `public/app.css` (head: @font-face + `:root`; throughout: component classes), `public/index.html` (preload hints), `public/sw.js` (cache list), `public/app.js` (only if a hardcoded color string lives there — audit found PLAYER_COLORS at app.js:55–60, leave PLAYER_COLORS as-is this task).

- [ ] `@font-face` block at top of app.css — exact files shipped by D0 (6): `silkscreen-400.woff2`, `silkscreen-700.woff2` (static), `libre-franklin-var.woff2` + `libre-franklin-var-italic.woff2` (VARIABLE — one declaration each with a weight range), `ibm-plex-mono-400.woff2`, `ibm-plex-mono-500.woff2`:
```css
@font-face {
  font-family: 'Silkscreen';
  src: url('/fonts/silkscreen-700.woff2') format('woff2');
  font-weight: 700; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Libre Franklin';
  src: url('/fonts/libre-franklin-var.woff2') format('woff2');
  font-weight: 100 900; font-style: normal; font-display: swap;
}
/* italic variant: same pattern with libre-franklin-var-italic.woff2 + font-style: italic */
```
- [ ] Font stacks: `html, body { font-family: 'Libre Franklin', 'Helvetica Neue', sans-serif; }`; utility classes `.disp { font-family: 'Silkscreen', monospace; }`, `.mono { font-family: 'IBM Plex Mono', monospace; }`. Apply `.disp` treatment to: logo h1, role-name, dead-text, gameover h1, phase-indicator, btn text, section labels, card-back-label. Apply mono to: room code, timers, version/copyright, lock chips.
- [ ] Token swap in `:root` (names stay, values change — spec §3.2 table is the source of truth):
```css
:root {
  --bg: #0b0b10; --bg-card: #1a1a2e; --bg-elevated: #15152a; --bg-input: #15152a;
  --text: #ece5d8; --text-secondary: #8a8a96; --border: #34345c;
  --primary: #e8a33d; --primary-dark: #b87d24;
  --danger: #b3202a; --danger-bright: #d4313c; --warning: #ff9800;
  --role-mafia: #d32f2f; --role-citizen: #388e3c; --role-doctor: #2196f3;
  --role-detective: #9c27b0; --role-joker: #26c6da; --role-lover: #e91e63;
}
```
  plus light-theme remap sync (`[data-theme="light"]` keeps warm-paper neutrals, gains amber primary + same role fixes). Tokenize the stray hexes (app.css:285-286, 640, 663-668, 947, 1051 → vars).
- [ ] Stepped-corner utility (validated in mockup — copy exactly):
```css
.pxc { clip-path: polygon(
  0 12px, 4px 12px, 4px 4px, 12px 4px, 12px 0,
  calc(100% - 12px) 0, calc(100% - 12px) 4px, calc(100% - 4px) 4px, calc(100% - 4px) 12px, 100% 12px,
  100% calc(100% - 12px), calc(100% - 4px) calc(100% - 12px), calc(100% - 4px) calc(100% - 4px),
  calc(100% - 12px) calc(100% - 4px), calc(100% - 12px) 100%,
  12px 100%, 12px calc(100% - 4px), 4px calc(100% - 4px), 4px calc(100% - 12px), 0 calc(100% - 12px)); }
.pxb { padding: 2px; } .pxb > .in { width: 100%; height: 100%; }
```
  Bordered components become wrapper(border-color bg, .pxc) > inner(surface bg, .pxc). Buttons/inputs/panels/modals/chips lose border-radius. Primary button: amber + `box-shadow: inset 0 -5px 0 rgba(70,40,0,.35)`, ink Silkscreen label. NOTE: `.pxb>.in` wrapper pattern requires touching button/input markup in index.html and the handful of innerHTML template strings in app.js that emit `.btn` — sweep `class="btn` across both files; keep all IDs.
- [ ] Texture utilities: `.scanlines::after` (repeating-linear-gradient 1px-in-4, pointer-events none), `.vignette::before` (radial-gradient), `.dither-h` (6px conic checker) — apply to screens/overlays per mockup; static only.
- [ ] Slide-to-confirm reskin (mockup screen 02): track/handle/label/fill restyled (.pxc track, bordered square handle carrying the existing role icon, Silkscreen label, dithered fill edge); role-tinted fills re-pointed at tokens (mafia/doctor/detective/joker_haunt, + hunter post-rebase); blood-drip animation KEPT. Allowed internal fix: replace hardcoded `iconWidth 48 / padding 4` (app.js:1194–1195) with measured `offsetWidth`/computed padding so the reskin can't break drag math. NO new payoff/haptics/audio (spec §2 veto). Verify drag-to-confirm and snap-back still work via Playwright mouse-drag before commit.
- [ ] sw.js: add `/fonts/*.woff2` entries to the precache list; bump its cache version string so clients refetch.
- [ ] Verify: `bun test` green, typecheck 0, Playwright smoke of auth/menu/lobby in BOTH themes at 390px + 320px; screenshots. Slide-track drag still works (geometry untouched this task).
- [ ] Commit: `feat(D1): Pixel Noir foundation — fonts, tokens, stepped-corner chrome, texture`

### D2 — Phase ambience

**Files:** Modify `public/app.js` (`applyPhaseChange` ~1436–1501, theme-color sync site), `public/app.css` (data-phase remaps, phase pill).

- [ ] JS hook (one line in applyPhaseChange, one in the reset/leave paths + `handleGameSync` so rejoin restores it):
```js
document.body.setAttribute("data-phase", phase); // phase: night|day|voting|game_over
```
  Clear it (`removeAttribute`) on return-to-lobby/menu and `room_closed`.
- [ ] CSS remaps (night per mockup screen 02): `body[data-phase="night"] { --bg: #0d1126; --bg-card: #161d3d; --bg-elevated: #121736; --border: #2b3568; }` + moonlight top radial on `#screen-game`; day = warmed ink + amber emphasis (dark theme) / lean on paper (light); voting = blood-tinted `--border`/accents scoped to the voting panel; game_over neutral. Both themes × all phases verified.
- [ ] Phase pill: Silkscreen, pixel moon/sun 10×10 art (grids land in D3 — pill text-only until D3 then gets art; acceptable two-step).
- [ ] Verify: multi-client Playwright (2 browser contexts minimum) through night→day→voting; screenshots each phase both themes; rejoin mid-night restores ambience (drive via existing game_sync path). `bun test` + typecheck.
- [ ] Commit: `feat(D2): phase-ambient theming via data-phase token remaps`

### D3 — Pixel iconography (emoji extinction)

**Files:** Modify `public/pixel-art.js` (new grids + registry), `public/index.html`, `public/app.js`, `public/app.css`. Test: `tests/pixel-art-registry.test.ts` (new, pure functions — no DOM, no band).

- [ ] New 10×10 grids in pixel-art.js, exported on window like existing ones: `TROPHY_ART, GEAR_ART, SCROLL_ART, LOCK_ART, POINT_ART, X_ART, HEART_ART, HEARTBREAK_ART, REFRESH_ART, MOON_ART, SUN_ART` (amber moon already designed in mockup — copy it). Follow house palette conventions (skin #fdd, eyes #222 where applicable; thematic accents from token palette).
- [ ] Pure test (new file, plain bun test):
```ts
import "../public/pixel-art.js" — // if import shape fights the IIFE, read the file and eval; match how existing client-harness tests load it (see tests/helpers/client-harness.ts per C5 notes)
test("all art grids are ≤10 rows of ≤10 cells, cells null or #hex", () => { /* iterate window exports ending in _ART */ });
```
- [ ] Replace every emoji site (audit-verified list): index.html:156, 231, 249 (gear), 295 (scroll), 376 (skull/broken-heart/joker), 384 (trophy); app.js:460, 1648–1651, 2571 (overlay verdict glyphs), 2079–2163 (deliberation buttons: pixel POINT/X/LOCK + Silkscreen labels — mechanics untouched); app.css:844 (emoji skull), 863 (emoji trophy); refresh arrow ↻ and ✔/heart badges. Grep `&#1`/`&#9`/`&#8` entities + literal emoji in all three files to catch stragglers.
- [ ] Mascot consolidation: move the 16×16 logo grid into pixel-art.js (`MASCOT_ART`, 16×16 needs `pixelArtToSvg` to accept a viewBox size — extend signature `pixelArtToSvg(grid, size=10)`, default preserves all existing callers); render both index.html logo sites from it via JS at boot. Leave `icons/icon-*.svg` files as-is (PWA needs static files).
- [ ] Verify: screenshots of every replaced site; cross-check no emoji renders anywhere in a full game flow; `bun test` + typecheck.
- [ ] Commit: `feat(D3): pixel icon set replaces all emoji; mascot single-sourced`

### D4 — Player avatars (client-only)

**Files:** Modify `public/pixel-art.js` (hash + pickers), `public/app.js` (lobby list ~880–883, status list ~1833–1835, vote contexts, game-over reveal 2849–2888), `public/app.css`. Test: extend `tests/pixel-art-registry.test.ts`.

- [ ] Pure functions in pixel-art.js:
```js
function avatarIndexFor(name) {
  var h = 0;
  for (var i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return h < 0 ? -h : h;
}
function getCosmeticAvatar(name) { // pre-reveal: role-agnostic profession art
  return pixelArtToSvg(PIXEL_ART.citizen[avatarIndexFor(name) % PIXEL_ART.citizen.length]);
}
```
  Tests: deterministic (same name twice), non-negative, distributes across 8 variants for a 20-name sample, empty-string safe.
- [ ] Wire: lobby rows, in-game status list (dead → skull art + existing strikethrough), mafia target cards, vote screens = `getCosmeticAvatar(name)`; game-over reveal = `getRoleImage(role, avatarIndexFor(name))` true portraits (+hunter once merged). 36–40px, `.pxc` framed, `image-rendering: pixelated`.
- [ ] CRITICAL check: cosmetic avatars must appear identical on every client (hash of name only — no local state) and must NOT leak roles pre-reveal (only citizen-profession grids used).
- [ ] Verify: 2-context Playwright — same player shows same avatar on both screens; game-over reveal shows true portraits; 20-player lobby renders under 430px without wrap breakage. `bun test` + typecheck.
- [ ] Commit: `feat(D4): deterministic pixel avatars in lists + true portraits at reveal`

### D5 — Dramatic beats restaging

**Files:** Modify `public/app.js` (the five writer functions 1516–1716, 2803–2847 — composition only), `public/app.css` (suspense overlay styles), `public/index.html` (#suspense-overlay inner structure).

- [ ] Restructure #suspense-overlay contents to a staged composition: `<div id="suspense-art">` + `<div id="suspense-pre">` (amber Silkscreen small) + `<div id="suspense-text">` (existing node KEEPS its id — all five writers target it) + scanlines/vignette classes. Writers additionally set art/pre per beat: nightfall→MOON_ART, dawn-no-death→SUN_ART, death verdict→skull, execution→skull+blood tint, heartbreak→HEARTBREAK_ART, game over→TROPHY_ART tinted by winner.
- [ ] **Untouchable:** every setTimeout duration, the queue/flush gating against HOLD_GATE_PROMPTS/SUSPENSE_GATE_TYPES (app.js:170–212), z-index 300, the inline style.animation restart hack, narrator strings. Pure add: what's painted, not when.
- [ ] Verify: full game with execution + heartbreak + joker haunt on staging-like flow; confirm queued prompts still deliver post-beat (watch for the C3 slog families in server stdout if running local server; minimum: client console clean + prompts arrive). Screenshots of each beat. `bun test` + typecheck + goldens 11/11.
- [ ] Commit: `feat(D5): staged pixel compositions for the five dramatic beats`

### D6 — Death, joker win, game over

**Files:** Modify `public/index.html` (375–388), `public/app.css` (833–883, 915+), `public/app.js` (454–464, 2568–2574, 2873–2887).

- [ ] Dead overlay per mockup screen 03: pixel skull + blood glow (`filter: drop-shadow` static — acceptable, no animation on filter), amber `YOU ARE` / blood `DEAD` Silkscreen, cause line italic Franklin (cause text comes from existing payload fields only — no new strings), dither divider, ghost spectate affordance pointing at existing room view.
- [ ] Joker win: wire the dead-code `#joker-win-overlay` (index.html:383–388 + app.css:851–883) — `showJokerWinOverlay` (app.js:2568–2574) targets IT instead of the dead overlay; CLOWN_ART centerpiece, amber trophy staging.
- [ ] Game over: winner block with TROPHY_ART faction-tinted; role-reveal rows get D4 true portraits; existing stagger timings untouched.
- [ ] Verify: joker-win path (house + official modes), normal death, lover heartbreak death, game-over both factions; screenshots; the dead overlay still reveals beneath suspense (z-ladder intact). `bun test` + typecheck.
- [ ] Commit: `feat(D6): death poster, real joker win overlay, game-over staging`

### D7 — Card peel rendering

**Files:** Modify `public/app.js` (peel IIFE 1073–1145), `public/app.css` (300–388).

- [ ] Replace the rectilinear 6-point clip-path with a diagonal fold: clip polygon follows the drag vector (corner point → fold line perpendicular to drag direction); flap underside = separately positioned element with card-stock gradient sized to the fold triangle; soft shadow under lifted region (`filter: drop-shadow` on the flap only, set during drag — it already does this at app.css:387); resistance curve `lift = Math.pow(drag, 0.85)`.
- [ ] Gesture state machine, thresholds, hold-to-peek, snap-shut transition (app.css:331), 60px grab zone, mini-icon: UNTOUCHED. Mouse fallback kept.
- [ ] Verify: touch + mouse peel on Playwright (drag via mouse events), snap-back, quick-peek, dead-state skull card, light theme (card stays dark). Screenshots mid-peel. `bun test` + typecheck.
- [ ] Commit: `feat(D7): real diagonal card peel with rendered underside`

### D8 — In-world confirms, screen transitions, dvh

**Files:** Modify `public/app.js` (confirm sites 2461, 2466–2471, 2659, 2666, 2952; showScreen 79–82), `public/index.html` (one reusable confirm sheet), `public/app.css`.

- [ ] One reusable bottom-sheet confirm (`#confirm-sheet`, existing modal pattern restyled .pxc): `showConfirmSheet(title, body, confirmLabel, onConfirm)`. Replace the five `confirm()` calls. **`ensureAudioReady()` (2468, and gesture sites 2503, 2922) must be called inside the sheet's confirm-button tap handler — verify by reading the call chain, then by a device/emulator audio smoke.**
- [ ] Screen transitions: `showScreen()` adds `.screen-enter` (200ms opacity+translateY(8px)) and `.screen-exit`; `@media (prefers-reduced-motion: reduce)` disables. Purpose keyframes for lobby→game and game→gameover thresholds.
- [ ] `100vh` → `100dvh` in `.screen` and `.gameover-content` (keep `100vh` fallback line above for old WebKit).
- [ ] Verify: all five admin flows confirm/cancel correctly; End Day still narrates (audio fires) — this is the one MUST-test; transitions respect reduced-motion. `bun test` + typecheck.
- [ ] Commit: `feat(D8): in-world confirm sheets, screen transitions, dvh fix`

### D9 — Final gate

- [ ] Ride-along: fix stale CLAUDE.md pixel-art location line (`public/app.js` → `public/pixel-art.js`).
- [ ] Parallel full-diff reviews vs staging (T17/B8/C9 pattern): spec-compliance, code-quality, visual-design (against mockup + spec §3), regression-hunter. Fix-loop to ALL-APPROVE.
- [ ] Full manual smoke: complete game both themes, 320px + 430px, dead/joker/lover paths, rejoin mid-night.
- [ ] `APP_VERSION_STAGING` bump (the program's ONLY bump): increment PATCH, timestamp via `TZ="America/Los_Angeles" date +"%Y%m%d%H%M"`.
- [ ] Commit: `chore(D9): bump APP_VERSION_STAGING — Program D complete` + final Status update.

---

## Status

| Task | Scope | Commits | Notes |
|---|---|---|---|
| D0 | Spec + mockup + fonts (pre-merge) | b2c3a81 (docs+mockup), fonts commit follows | DONE 2026-06-11. 6 latin woff2 (Silkscreen 400/700 static; Libre Franklin variable wght 100-900 normal+italic; Plex Mono 400/500) + OFL.txt, all wOF2-verified. @font-face NOT wired (app.css is C's until merge). |
| D1 | Fonts wired + tokens + chrome + texture | | gated on C merge + rebase |
| D2 | Phase ambience | | |
| D3 | Pixel iconography | | |
| D4 | Avatars | | |
| D5 | Dramatic beats | | |
| D6 | Death / joker win / game over | | |
| D7 | Card peel | | |
| D8 | Confirms + transitions + dvh | | |
| D9 | Final gate + version bump | | |

**Kickoff blurb for a fresh orchestrator:**
> You are the Program D orchestrator in `/Users/hansonkang/Documents/GitHub/mafia-noir` (branch `feat/pixel-noir`). The gate is already satisfied: Program C (hunter role) merged via PR #20 at `staging@19f4a14`, and this branch is already rebased onto it (D0 commits: `5330803` docs+mockup, `0a31f49` fonts, `cb0d7b1` gate record). First acts: (1) sanity-check — `git log --oneline -5` must show those three commits on top of `19f4a14`; (2) run `bun test` + `bunx tsc --noEmit` and record the baseline (expect 510/0 and clean — you change no engine/server code this entire program); (3) read `docs/PIXEL-NOIR-DESIGN.md` (the spec — its §2 hard constraints are non-negotiable: no slide-to-confirm payoff/haptics/audio, no narrator text edits, no `HOLD_GATE_PROMPTS`/suspense-timing changes, no `src/**` changes), then `docs/NOIR-PROGRAM.md` (the plan); (4) fold the hunter surfaces into D1/D3/D4/D5/D6 scope per the gate section — hunter slide entry, `--role-hunter #ef6c00`, hunter portrait — plus the two playtest notes recorded there (D6 dead-hunter overlay decision, D1 orange adjacency); (5) execute D1→D9 under the operating protocol: two-stage review per task (spec-compliance then code-quality), Playwright screenshots in both themes required for any task that changes pixels, commit per task with Status-table updates, self-handoff at ~40–50% context at a clean commit boundary, and NEVER push — the coordinating instance validates, pushes, and merges. The approved direction mockup is at `docs/mockups/pixel-noir/` — it is ground truth for look and feel.
