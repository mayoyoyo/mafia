# Pixel-art retirement list — after P2 (shared components)

**Scope of this file:** every art constant exported by `public/pixel-art.js`, with
its status after the P2 shared-component pass on `feature/figma-ui`.
**Nothing has been deleted from `pixel-art.js`.** This is a review list only
(plan `.claude/plans/figma-ui-migration.md`, "Open for Hanson at phase reviews:
pixel-art retirement list (P2)").

Method: `grep -n '\b<NAME>\b' public/app.js public/index.html` against the
post-P2 tree, cross-checked against `git show HEAD:public/app.js` to separate
"orphaned BY P2" from "already orphaned before P2".

Status vocabulary:
- **REPLACED** — P2 swapped this art for a Figma asset; the constant now has no
  consumer.
- **STILL USED** — live call sites listed.
- **ORPHANED (pre-existing)** — no consumer before P2 either; P2 did not cause it.

---

## Replaced by P2

| Constant | Replaced by | Old call site (pre-P2) |
|---|---|---|
| `PIXEL_ART` (map: `doctor`, `detective`, `joker`, `hunter`, `vigilante`, `citizen` ×N variants, `mafia` ×N variants, `godfather` — `pixel-art.js:9-251`) | Chibi rasters `public/img/roles/<role>.png`, copied from the Membership Card image fills (`docs/figma-raw/specs/components/77-528--membership-card.md:200-210`) | reached only through `getRoleImage()` |
| `getRoleImage(role, variant)` (`pixel-art.js:585-595`) | `<img src="/img/roles/${displayRole}.png">` in `updateRoleCard()` (`public/app.js:1315`) | `app.js:1246` role card art, `app.js:1258` mini quick-peek icon (both at HEAD) |

Notes:
- The **per-player art variant** concept (`myVariant`, the multi-grid
  `citizen`/`mafia` entries) has **no Figma equivalent** — the spec ships one
  78×78 raster per role. P2 renders the single spec raster; `myVariant` is still
  computed in `app.js` but no longer selects art. Flagging for the review: either
  accept the loss of variants, or re-introduce variants as extra PNGs later.
- `ROLE_DESCRIPTIONS` and `ROLE_COLORS` (same file) are **untouched and still
  used** — the app's own copy stays per R5, and `ROLE_COLORS` still feeds the
  `role-card ${ROLE_COLORS[role]}` class that selects the card gradient.

## Still used — pixel art survives here on purpose

| Constant | Site(s) |
|---|---|
| `CARD_BACK_ART` | `app.js:1282` (`setCardBack`, the "Peel to reveal" face) |
| `CARD_BACK_DEAD_ART` | `app.js:642`, `1282`, `1914`, `2069`, `4422` |
| `THUMB_UP_ART` / `THUMB_DOWN_ART` | `app.js:2308` (detective result tag, 16px). **Deliberately kept**: the Figma emoji raster (`225-918--thumbs.md`) loses its finger separations below ~32px and stops reading as up-vs-down — see the note on `.detective-tag` in `app.css`. The ≥32px site (40px vote buttons, `app.js:4390-4391`) took the raster. |
| `CROSS_ART` | `app.js:2067`, `2068` (dawn save beat) |
| `MAGNIFIER_ART` | `app.js:2152` (detective result line) |
| `CLOWN_ART` | `app.js:3330`, `4427` (joker win overlay) |
| `BOW_ART` | `app.js:4436` (hunter revenge-wait panel) |
| `TROPHY_ART` | `app.js:3640`, `3768`, `3841` (game-over centrepiece, verdict beat, joker joint-win tag) |
| `SCROLL_ART` | `app.js:4409` (transcript button) |
| `LOCK_ART` | `app.js:2668`, `2675`, `2690`, `2697` (mafia lock-in buttons) |
| `POINT_ART` | `app.js:2631`, `2709` (nominate buttons) |
| `X_ART` | `app.js:2642`, `2722` (spare / object buttons) |
| `HEART_ART` | `app.js:3839` (game-over lover row), `4431` (Lovers chip icon — spec 257-686 draws a 16px stroked heart; the pixel heart holds that slot) |
| `HEARTBREAK_ART` | `app.js:642`, `1950`, `2117` |
| `REFRESH_ART` | `app.js:4414` (pull-to-refresh spinner) |
| `MOON_ART` / `SUN_ART` | `app.js:773/775`, `1777/1779`, `2003`, `2070`, `2087` (phase pill + suspense beats) |
| `MASCOT_ART` | `app.js:4396` (both logo containers) |
| `pixelArtToSvg` | the renderer for every row above |

## Orphaned before P2 (P2 did not cause these)

| Constant | Evidence |
|---|---|
| `KNIFE_ART` | `git show HEAD:public/app.js \| grep -c KNIFE_ART` → `0` |
| `BULLET_ART` | `git show HEAD:public/app.js \| grep -c BULLET_ART` → `0` |
| `GEAR_ART` | only reference at HEAD is the comment at `app.js:4406` explaining that the gear buttons were reverted to the stock `&#9881;` glyph and `GEAR_ART` is intentionally not injected |

## Recommendation for the review gate

1. `PIXEL_ART` + `getRoleImage` are the only P2-caused orphans, and they are the
   biggest block in the file (~240 lines). Safe to delete **once the review
   accepts losing per-player art variants**; hold otherwise.
2. `KNIFE_ART` / `BULLET_ART` / `GEAR_ART` were already dead — they can go
   independently of this migration.
3. Everything else stays. The pixel idiom is still load-bearing for the card
   back, the overlays/beats, the small icon buttons, the phase pill, the logo,
   and the sub-32px thumbs.
4. `tests/pixel-art-registry.test.ts` and `tests/hunter-content.test.ts` assert
   on the file's shape (including `PIXEL_ART.hunter` and `getRoleImage`), so any
   deletion must land with the matching test edits.
