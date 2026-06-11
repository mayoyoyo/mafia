# Pixel Noir — Frontend Design Spec (Program D)

**Status:** Approved by user 2026-06-11 (direction mockup: `docs/mockups/pixel-noir/`).
**Scope:** Purely frontend. Zero changes to `src/**`, engine behavior, wire protocol, narrator text, or audio.
**Branch:** `feat/pixel-noir` (worktree `mafia-noir`), cut from `staging@a9229bc`. **Implementation of D1+ waits for Program C (`feat/hunter-role`) to merge to staging, then this branch rebases.** Until then only docs/assets (new files) may be committed.

## §1 Thesis

The app is two products wearing one CSS file. The soul is ownable: a 15-portrait pixel cast, the smoking-fedora mascot, the membership-card peel fiction, role-flavored slide-to-confirm. The shell is generic: SF Pro system stack, Material Design swatches, rounded pills, OS emoji, native `confirm()`, hard screen cuts. **Pixel Noir extends the island to the continent**: the pixel identity carried into typography, palette, chrome, iconography, and the dramatic beats — without touching the mechanics players love.

## §2 Preserved invariants (user mandates)

- **Mafia deliberation mechanics** (nominate / lock-in / object, unanimous lock): UNCHANGED logic and flow; restyle only.
- **Slide-to-confirm**: UNCHANGED mechanic. **Explicitly out of scope: payoff animations, haptics, audio cues of any kind on the slide.** Restyle the track/handle/label/fill only. The existing mafia blood-drip animation stays (existing flavor, not new payoff). Internal fix allowed: measure handle geometry (`offsetWidth`) instead of hardcoded `48/4` so the reskin doesn't break the drag math — thresholds and behavior identical.
- **Mobile-first** stays: 430px max column, safe-area insets, 44px tap targets, both themes.
- Banned aesthetics stay banned: no system/Inter/Roboto/Arial, no purple-gradient-on-white, no cookie-cutter component-library look.

## §3 Design tokens

### §3.1 Type (self-hosted woff2, latin subset, `font-display: swap`; all SIL OFL)

| Voice | Face | Weights | Used for |
|---|---|---|---|
| Display | **Silkscreen** | 400, 700 | Wordmark, role names, phase labels, buttons, overlay headlines (`YOU ARE / DEAD`), section labels, chips |
| Body | **Libre Franklin** | 400, 400i, 500, 600 | Narrator prose, player names, descriptions, settings — everything that must read at 13–16px |
| Data | **IBM Plex Mono** | 400, 500 | Room codes, timers, version strings, lock-progress chips |

Files in `public/fonts/` (committed pre-merge — new files, no conflict). `@font-face` in `app.css`; add font files to the `sw.js` cache list. Never set a pixel face on body text — readability at 20-player list scale wins.

### §3.2 Palette (derived from the app's own art)

Keep existing CSS variable **names**; change **values**. New tokens added alongside.

| Token | Value | Replaces / role |
|---|---|---|
| `--bg` | `#0b0b10` (ink) | `#0a0a0a` |
| `--bg-card` | `#1a1a2e` (midnight — the existing card-back color) | `#151515` |
| `--bg-elevated` / `--bg-input` | `#15152a` | `#1c1c1e` |
| `--border` | `#34345c` (navy) | `#2c2c2e` |
| `--text` | `#ece5d8` (paper) | `#f5f5f5` |
| `--text-secondary` | `#8a8a96` | `#8e8e93` |
| `--primary` | `#e8a33d` (amber) | Material Pink `#e91e63` |
| `--primary-dark` | `#b87d24` | `#c2185b` |
| `--danger` / `--blood` | `#b3202a`, bright `#d4313c` | `#d32f2f` |

Role colors — fix the two collisions, minimal other churn:
- `--role-joker`: **new distinct cyan `#26c6da`** (today it equals doctor blue — two roles share a color, which is gameplay information).
- `--role-lover`: stays `#e91e63`, now unique because primary moved to amber.
- mafia/citizen/doctor/detective keep current hues. Hunter (lands with C7): harmonize its color into this system post-rebase, must collide with nothing.
- Tokenize the ~10 stray hardcoded hexes (`#ff9800` execution events → `--warning`, night/day pill colors, joker spectator purples, etc.).

Light theme: keep the warm-paper concept (`#f0ebe1` family) — it already fits Pixel Noir; sync accents (amber primary, fixed role colors) which today it doesn't remap. The role card **stays dark in light theme** (intentional fiction — preserve).

### §3.3 Component language

- **Pixel-stepped corners** replace rounded pills on buttons, inputs, panels, chips, sheets: a `.pxc` clip-path utility (12px/4px steps; 6px/2px for small chips) + 2px wrapper pattern for stepped borders (outer = border color clipped, inner = surface clipped). Validated in the mockup.
- **Primary button**: amber fill, ink Silkscreen label, `inset 0 -5px 0 rgba(70,40,0,.35)` pressed-edge. Ghost: 2px navy border, paper label.
- **Texture**: faint scanlines (`repeating-linear-gradient`, 1px in 4) on full-screen overlays and screens; radial vignette on screens; dither (4–6px checker `conic-gradient`) for fill edges and dividers. Static only — no animated texture; stick to compositor-friendly properties (existing `unanimousPulse` box-shadow animation is the ceiling, don't multiply that pattern).
- **Tokens for the literals**: radius steps die (clip-path replaces), but spacing/type-scale literals get variables while files are open (quiet foundation work, no visual change by itself).

## §4 Phase ambience

Today the only phase styling is an 18px pill. New: `data-phase="night|day|voting|game_over"` set on `<body>` in `applyPhaseChange()` (app.js ~1436–1501), remapping tokens:

- **Night**: bg → deep navy `#0d1126` with a moonlight radial wash at top (as mockup screen 02); panels `#161d3d`; amber phase accents. Every phone in the room goes midnight together — shared physical effect.
- **Day**: dark theme — ink warmed slightly, amber accent emphasis; light theme — existing paper IS day, lean in.
- **Voting**: blood-tinted borders/accents on the voting panel; bg stays phase-neutral dark (don't make the whole screen red — verdict beats own red).
- **game_over**: neutral.

Phase pill survives, restyled (Silkscreen, pixel moon/sun 10×10 art instead of nothing). Both themes must remap cleanly; `theme-color` meta stays JS-synced.

## §5 Pixel iconography — kill every emoji

OS emoji render differently per phone and dilute the identity. Replace all sites (audit list: index.html:156, 231, 249, 295, 376, 384; app.js:460, 1648–1651, 2571, 2079–2163; app.css:844, 863) with new 10×10 grids through the existing `pixelArtToSvg` pipeline in `public/pixel-art.js`:

New grids needed: **trophy, gear, scroll, lock, pointing-hand (nominate), X (spare), heart, broken-heart, refresh, moon, sun**. Already exist: skull (`CARD_BACK_DEAD_ART`), knife, cross, magnifier, clown, thumbs. Mafia deliberation buttons get pixel icon + Silkscreen label (mechanics untouched).

Mascot consolidation: the 16×16 logo is hand-duplicated 4× (index.html ×2, icons/icon-192.svg, icon-512.svg). Consolidate the two index.html copies to one grid rendered via JS; keep the static SVG icon files (they must exist as files for PWA manifest/favicon) but regenerate them from the same grid via a one-off script if they drift.

## §6 Player avatars (client-only)

The 15-portrait cast never appears next to a player name today. New: pixel avatars in lobby list, in-game player status list, vote contexts, and game-over reveal.

- **Pre-reveal lists**: role-agnostic cosmetic avatar = citizen-profession grid chosen by a **deterministic client-side hash of the player name** (`hash(name) % 8`) — stable across all clients with zero server/wire changes (program stays purely frontend). Dead players' avatars swap to the skull (existing behavior language from the card back).
- **Game-over reveal**: true role portraits via `getRoleImage(role, hash(name))` — roles are in the reveal payload already.
- Hash + registry live in `pixel-art.js` as pure functions → unit-testable with `bun test` without DOM.

## §7 Dramatic beats — restage the theater

Nightfall, dawn verdict, execution, heartbreak, game-over all render through one `#suspense-text` node on flat black. These fire simultaneously on every phone in the room; they're the game's theater and currently look like a loading screen.

**Hard constraint:** the timing/queue plumbing is load-bearing — `HOLD_GATE_PROMPTS` / `SUSPENSE_GATE_TYPES` (app.js:170–212) gate prompt delivery against the exact setTimeout choreography of the five writer functions (app.js:1516–1716, 2803–2847). **Do not change timings, queue semantics, gate membership, or the element's z-index (300, topmost — death overlays reveal beneath it).** Carry-over item 11 (spectator_mafia_update not in HOLD_GATE_PROMPTS) stays do-not-fix-unless-asked.

What changes: what gets *written into* the overlay. Each beat gets a staged composition in the death-screen mockup's language — small amber Silkscreen pre-line, big display word, pixel art centerpiece, scanlines + vignette:
- Nightfall: moon art, navy wash. Dawn-no-death: sun art. Dawn-death verdict: skull. Execution: gavel or skull + blood. Heartbreak: broken-heart art. Game over: trophy (faction-colored).
- Narrator copy strings are **not** edited (C6 owns narrator content; engine/WS tests match prose loosely — don't disturb).

## §8 Death and win screens

- **Own death** (`.dead-overlay`): per mockup screen 03 — the app's own pixel skull (`CARD_BACK_DEAD_ART`, today unused here in favor of a font emoji) with blood glow, amber `YOU ARE` / blood `DEAD` in Silkscreen, cause line in Franklin italic, dither divider, ghost "watch the town" affordance. This is the most-photographed screen in a friends game; treat it as the poster.
- **Joker win**: stop reusing the death overlay. Wire the existing **dead-code** `#joker-win-overlay` (index.html:383–388 + orphaned CSS app.css:851–883) with clown art + celebration staging.
- **Game-over screen**: winner staging with pixel trophy, role-reveal list upgraded with true portraits (§6); keep the existing staggered reveal pacing (it's good).

## §9 Card peel — make it feel like a card

Keep the gesture design verbatim (hold-to-peek poker squeeze, always snaps shut, 60px grab zone, mini-icon quick-peek, card stays dark in light theme). Fix the rendering (app.js:1073–1145, app.css:300–388):
- Diagonal fold line instead of the axis-aligned L-notch clip rectangle.
- Rendered flap **underside** (card-stock gradient) sized to the actual fold, replacing the faked static 40px triangle.
- Soft drop shadow under the lifted region; slight resistance curve on drag distance.
- JS writes the clip-path polygon — the new polygon math lives in the same handler; state machine untouched.

## §10 In-world confirm + transitions

- Replace the five native `confirm()` calls (Force Dawn, End Day, End Game, Leave Game, Close Room — app.js:2461, 2466–2471, 2659, 2666, 2952) with the existing bottom-sheet pattern restyled. **CRITICAL: End Day's `ensureAudioReady()` (app.js:2468) must remain inside the user-gesture call chain of the new in-sheet confirm button, or iOS night narration breaks.** Same for the other gesture-chained sites (2503, 2922).
- Screen swaps get a 180–220ms enter/exit (opacity + small translate) via classes in `showScreen()` (app.js:79–82); 2–3 purpose-built keyframes replace the universal `fadeIn` at the key thresholds (lobby→game, game→gameover). Respect `prefers-reduced-motion`. Server-echo `innerHTML` rebuilds (app.js:1968, 2218–2221) mean state-change animation inside the deliberation list is out of scope — don't fight it this program.
- Opportunistic: `100vh` → `100dvh` in `.screen` / `.gameover-content`.

## §11 Out of scope (this program)

- Slide-to-confirm payoff/haptics/audio (user veto), and any audio changes whatsoever.
- Narrator line content (C6), role rules, README roster changes (no role changes happen here).
- Server/engine/wire changes (`src/**`, `tests/` engine suites).
- FLIP/keyed DOM reuse for deliberation list animations.
- Carry-over item 11 (HOLD_GATE_PROMPTS spectator gap).

## §12 Verification

- `bun test` stays green (engine/WS suites untouched; new pure-function tests for avatar hash/registry). Goldens 11/11 untouched — no narration/text changes.
- Typecheck zero errors (server untouched but run anyway).
- Playwright multi-client smokes per task cluster: both themes × phases (night/day/voting), 320px and 430px widths, role card peel, death/win overlays, confirm sheets (verify audio still fires on End Day on a real iOS device if possible — minimum: verify call chain by code review + slog).
- Visual review screenshots attached to each task's review (no visual test harness exists; screenshots are the evidence).
- `APP_VERSION_STAGING` bump **once**, at final gate (program convention).

## §13 Post-C-merge rebase checklist

1. `git fetch && git rebase origin/staging` (docs/fonts commits rebase trivially).
2. Sweep C's new surfaces into scope: hunter slide-confirm entry (icon/label/CSS), hunter role color (collision-free), hunter pixel portrait usage in avatars/reveal, any new C5 prompts/overlays get the restyle.
3. Re-read C's final BUILD-PROGRAM.md carry-over notes before D1.
4. Fix stale CLAUDE.md line ("pixel art in app.js" → `public/pixel-art.js`) as a ride-along.

## §14 Artifacts

- Direction mockup (approved): `docs/mockups/pixel-noir/mockup.html` (self-contained; open directly in a browser) + `pixel-noir-direction.png` render.
- Audit + critique source: workflow run `wf_4e8fe889-73e` (session-local); key findings folded into this spec.
