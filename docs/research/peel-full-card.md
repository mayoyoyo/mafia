# Card-peel full-reveal research → implementation brief (D7.5)

**User decision 2026-06-13:** "Drag peels the whole card" — the translating-crease model (one
continuous gesture, drag reveals 0→100%, release snaps shut). Keep the press-hold secrecy + the
60px grab zone + quick-peek + card-stays-dark-in-light-theme. This SUPERSEDES the half-card limit
of D7's corner-pivot fold.

## Why the half-card wall exists (confirmed math)
D7's fold is a reflection model: lifted corner P is the mirror of corner C=(100,100) across a crease
pinned to the two adjacent edges. As the drag grows, the crease intercepts sweep only to the
anti-diagonal (0,100)→(100,0); the removed region is the bottom-right triangle = exactly 50% of the
card. A corner-pinned reflection fold CANNOT exceed half. Escape = let the crease TRANSLATE across
the whole card (endpoints walk onto the top & left edges past the anti-diagonal).

## Chosen model (c): translating straight crease, driven by one progress t∈[0,1]
`t→0..0.5` reproduces today's corner peek; `t→1` sweeps the crease to the opposite (top-left)
corner = 100% revealed. Clip-path %-space, origin top-left, card 0..100, dragged corner C=(100,100).

```
const s = t * 2;                 // 0..2 ; s=1 is the old anti-diagonal / 50% line
let Bx, By, Rx, Ry;
if (s <= 1) {                    // Phase A: crease endpoints on bottom & right edges (today's regime)
  Bx = 100 - 100 * s;  By = 100;
  Rx = 100;            Ry = 100 - 100 * s;
} else {                         // Phase B: crease passed the anti-diagonal; climb left & top edges
  const u = s - 1;               // 0..1
  Bx = 0;              By = 100 - 100 * u;
  Rx = 100 - 100 * u;  Ry = 0;
}
// Back (visible face) = card minus the swept corner region:
//   Phase A: polygon(0% 0%, 100% 0%, 100% Ry%, Bx% 100%, 0% 100%)
//   Phase B: polygon(0% 0%, Rx% 0%, 0% By%)        // remaining face is the top-left triangle
// Flap (lifted underside) = folded triangle (crease endpoints + reflected corner P=(Px,Py)):
//   Phase A: polygon(Bx% 100%, 100% Ry%, Px% Py%)
//   Phase B: polygon(0% By%, Rx% 0%, Px% Py%)
// P = reflection of C across the current crease line through the two endpoints (reuse D7's
// bisector reflection — still valid; only the endpoints now move past the anti-diagonal).
```

Gesture→t (diagonal pull as the single clean driver; mixed-axis folds go ragged):
```
const pull = Math.min(1, Math.hypot(px, py) / Math.SQRT2);  // 0..1 along the diagonal
t = Math.pow(pull, 0.85);                                   // D7's resistance curve, now reaching 1
```

## Underside shading + shadow (Q4)
- `.peel-flap` fill = linear-gradient along the crease normal (~135deg for the diagonal): dark stop at
  the crease edge → light at P (paper's back catching light). Constant 135deg if drag is diagonal-only.
- Use `filter: drop-shadow(...)` on `.peel-flap` (NOT box-shadow — box-shadow ignores clip-path and
  draws a rectangle). Offset a few px along the drag vector; reduce alpha as t→1.

## Snap shut
Entire reveal is a pure function of t → on release animate t→0 (rAF or a CSS `--t` custom property
fed to the polygon via JS). Reverse sweep hides the secret the instant t < the peek threshold.

## Fallbacks (in order)
1. If the polygon looks fragile near t=1 (degenerate flap triangle at the far corner): cap the peel
   at t≈0.9 and finish the last 10% with an opacity/scale cross-fade of the face ("card lays open").
   Cheap, zero geometry risk.
2. Squeeze-then-flip (rotateY+backface-visibility) — industry standard (GGPoker "Open"); kept in back
   pocket only (user chose the drag model, not this).

## Code locations (current, post-D7 cefbda9)
`public/app.js` setPeel ~1165–1207, reset at resetCardPeel/resetPeel ~1133–1220, grab-zone/handlers
~1150–1237. The t→0..1 change is contained in setPeel + the `.peel-flap` gradient/drop-shadow in
`public/app.css`. State machine / thresholds / hold / snap-shut / quick-peek stay untouched.

## Key sources
GGPoker Card Squeeze (squeeze=teaser + separate Open) https://ggpoker.com/poker-games/card-squeeze/ ;
Anatomy of a page curl (crease=fold base; translating base; ragged-edge near extreme)
https://blog.flirble.org/2010/10/08/the-anatomy-of-a-page-curl/ ;
Peel.js (clip-path+transforms, no deps, corner-to-opposite-corner, gradient shadows; license unstated)
https://andrewplummer.github.io/peel-js/ ;
box-shadow vs clip-path → use drop-shadow https://css-tricks.com/using-box-shadows-and-clip-path-together/
