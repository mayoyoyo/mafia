# Day accusation flow — missing-state design spec (PROPOSAL)

Companion to `day-accusation-mockups.html` (9 frames, 8 states).

**Why this exists.** The Figma file predates the player-initiated accusation flow shipped at
`staging@0098577`. Plan ruling **R6** (`.claude/plans/figma-ui-migration.md`) keeps accusations and
requires the missing states to be *designed in the Figma language* before P5 implementation.
Gap list: `matrix-day-actions.md` §5.1–5.3.

**Status of the content below**
- *Real copy* = a string that exists in the app today, with a file:line citation. Ship as-is.
- *Invented* = proposal-grade, carries `data-invented` in the HTML and is listed per state below.
  Nothing invented may ship without Hanson signing the string.
- Every visual primitive is lifted from an existing Figma frame and cited. No new primitives.

---

## 0. Engine rules these states are derived from

Read from `src/game-engine.ts` (not from the UI):

| # | Rule | Source |
| --- | --- | --- |
| E1 | `accuse` requires `phase === "day"` and a living accuser | `1730-1732` |
| E2 | One accusation per living player per day (`accusationsMade`), **not refunded on withdraw** | `1733`, `1749`, `1793-1805` |
| E3 | Self-accusation rejected (`"self"`); target must be alive | `1737-1739` |
| E4 | `targetId === null` **is** the sleep proposal — same object, same one-per-day budget | `1729`, `1746-1747`, `1749` |
| E5 | Accusations stack; multiple may be pending at once | `1759` |
| E6 | Second requires: day phase, living seconder, not the accuser (`own_accusation`), not the accused (`accused_cannot_second`), second not yet spent (`already_seconded`) | `1770-1779` |
| E7 | A second consumes the accusation and opens the ballot immediately — no admin involvement | `1782-1784`, `1712-1718` |
| E8 | Withdraw is accuser-only, pending-only (a seconded accusation is already gone) | `1798-1805` |
| E9 | **≤2 alive waiver:** an accusation opens the ballot instantly, no second possible | `1754-1757` |
| E10 | Sleep ballot passes at strictly >50% of votes cast → night, **no execution**; fails → day with pending accusations intact | `1843-1871` |
| E11 | Execution ballot resolves at >50% of votes cast, once every living player has voted | `1808-1821`, `1890` |
| E12 | Accusation state is day-scoped; `beginNight` clears it | `238-249`, `256-257` |

Server/transport facts that constrain the UI:

| # | Fact | Source |
| --- | --- | --- |
| S1 | `accusations_update` is broadcast to the **whole room**, dead players included | `server.ts:101-115` |
| S2 | Engine rejections are **silently dropped** — no error ever reaches the client | `server.ts:1559`, `1575`, `1593` |
| S3 | A sleep ballot goes on the wire as `vote_called {sleep:true, targetName:"", targetId:0}` | `server.ts:124-125` |
| S4 | Accusation messages are also refused while a Hunter revenge gate holds the game | `server.ts:997-1001` |
| S5 | `game_sync` carries `accusations` / `accusationsMade` / `secondsMade` for mid-day rejoin | `server.ts:938-941` |

Client facts:

| # | Fact | Source |
| --- | --- | --- |
| C1 | The accusation panel renders for **living players during `day` only**; dead players see nothing | `app.js:3012-3018` |
| C2 | The panel is hidden outright while a ballot is live ("rule 9") | `app.js:3144` |
| C3 | Confirm in the picker starts `disabled` until a row is selected | `app.js:3077`, `3083` |
| C4 | Vote thumbs hide once you have voted; the admin's Cancel vote stays up | `app.js:3154-3169` |

---

## 1. Day idle — accuse CTA (living player)

**Purpose.** Give every living player the primary day action without an admin in the loop.

**Elements.** Nav (`Day ☀️` │ `Round 4`, `Code E92G`, roster + settings icons — 270:1471:14-43) ·
Membership Card 357×222 (77:527) · narrator italic 18px · **one 358×60 `#FF6C02` radius-16 CTA**
(geometry = the `End day` row on 270:1471) · Game Tabs (287:3436).

**Copy.**
- `Accuse someone` — real, `app.js:3027`.
- Spent variant: `You've made your accusation`, disabled — real, `app.js:3024`.
- No empty-list heading: with no pending accusations the app renders nothing (`app.js:3041`).

**Entry.** `phase_change → "day"` + `accusations_update` with an empty `accusations` array.
**Exit.** Tap → state 2. Spent state entered by E2 (`already_accused`, `1733`).

**Invented strings.** None.

---

## 2. Accuse picker

**Purpose.** Choose a living target — or move that the town sleeps — in one list.

**Elements.** 24px headline (the `Choose a victim` pattern, 130:323) · rows 326×70 `#232729`
radius-16 with shadow (130:323) + a 14×14 colour dot (the Players-tab ellipse, 261:2092) ·
sleep row as the final entry · two 173×60 CTAs side by side (`Cancel` `#000000` / `Confirm`
`#FF6C02`) — geometry from the End Day drawer, 271:1932.

**Copy (all real).**
- Title: `Point a finger — or move that the town sleeps:` — `index.html:308`
- Sleep row: `Propose the town sleeps on it` — `app.js:3075`
- `Cancel` / `Confirm` — `index.html:311-312`

**States.** unselected (no outline, Confirm at 30%) · selected (2px `#FF6C02` inset outline,
Confirm live). Self is excluded from the list (`app.js:3072`; engine E3).

**Entry.** Tap the launcher — client-only, no wire traffic (`app.js:3088-3091`).
**Exit.** `Cancel` closes (`app.js:3092`); `Confirm` sends `{type:"accuse", targetId}` with
`null` for the sleep row (`app.js:3095-3099`) → state 3 or 5a (or straight to a ballot under E9).

**Invented strings.** None.

**Open question.** Should the sleep row sit at the top instead of the bottom? The app puts it last
(`app.js:3075`); at 8+ players it falls below the fold.

---

## 3. Pending accusation row — the three viewer treatments

**Purpose.** Show every standing accusation and exactly the one action this viewer may take.

**Elements.** Rows 326×70 `#232729` radius-16, `space-between`: left = label + 12px status line,
right = the action pill (radius 8, pad 8 — Tabs pill geometry, 185:1612). `Second` = `#FF6C02`
pill with the 14×14 `Thumbs` up asset (225:918). `Withdraw` = `#000000` pill (the black-on-card
CTA pattern from the admin panel, 270:1471).

**Treatments** (one frame demonstrates all three legally: the viewer is the accuser on row 1, the
accused on row 2, an eligible seconder on row 3):

| Viewer relation | Action | Engine source |
| --- | --- | --- |
| Accuser of this row | `Withdraw` only | E8 (`1798-1805`), `own_accusation` `1777` |
| Target of this row | none, row at 60% | `accused_cannot_second` `1778` |
| Anyone else, second unspent | `Second` | E6 `1770-1779` |
| Second already spent today | none | `already_seconded` `1779` |

**Copy.**
- Row label: `{accuser} accuses {target}` — real, `app.js:3036`
- `Second` / `Withdraw` — real, `app.js:3051`, `3054`
- Narrator above: `ACCUSATION_MADE_MESSAGES` — real, `narrator.ts:129-134`

**Invented strings** (`data-invented`): section heading `Standing accusations`;
row status lines `Needs a second`, `Yours — waiting for a second`,
`You're accused — you can't second this`, `Second spent for today`.

**Entry.** `accusations_update` after any accuse/second/withdraw (`server.ts:112-115`), or
`game_sync` on rejoin (S5).
**Exit.** Withdraw → `accusations_update` minus that row. Second → state 4. Night → cleared (E12).

**Open questions.**
1. The 12px status lines add a second text row to a 70px card — confirm the rows may grow to
   ~86px, or drop the status line and rely on the button's presence/absence alone.
2. With the launcher disabled after your own accusation, is the `Yours` status line redundant?

---

## 4. Seconded → execution ballot (handoff into Figma's Voting frame)

**Purpose.** Prove the accusation flow lands *inside* the already-designed ballot, so nothing new
is needed downstream.

**Elements.** Exactly `270:1649`: 78×78 portrait, 24px headline, 14px tally, two 173×100 CTAs
(`#66BB6A` / `#E53935`) each holding a 32×32 Thumbs instance, 358×60 `#232729` `Cancel vote`.
The accusation block is gone from the screen.

**Copy.**
- Headline: Figma `Execute natasha?` (270:1649) — the app says `Vote: Execute natasha?`
  (`index.html:325`). Adopting Figma drops the `Vote:` prefix. **Confirm.**
- Tally: Figma `2/4 votes cast`; app `2 / 4 votes cast` (`app.js:3197`). Adopting Figma is a
  whitespace-only change.
- Narrator: `ACCUSATION_SECONDED_MESSAGES` — real, `narrator.ts:143-148`. Figma's
  `A vote has been called.` (270:1649:68) has **no app source** — reject it.
- `Cancel vote` — Figma casing; app is `Cancel Vote` (`index.html:331`). Admin only
  (`app.js:3165-3169`).

**Entry.** `second_accusation` → `accusations_update` (seconded line) → `vote_called`
(`server.ts:1570-1586`; engine E7). Panel hidden client-side by C2.
**Exit.** All living players voted (E11) → `vote_result`; or admin `cancel_vote`.

**Invented strings.** None.

---

## 5a. Sleep proposal pending

**Purpose.** Make a no-lynch motion legible as a first-class accusation, since the engine models
it as one.

**Elements.** Same 326×70 row; a 🌙 glyph replaces the player colour dot (Figma uses emoji in nav
labels, e.g. `Night 🌙`, 130:323).

**Copy.**
- Row: `{accuser} moves that the town sleeps` — real, `app.js:3035`
- Narrator: `SLEEP_PROPOSED_MESSAGES` — real, `narrator.ts:136-141`
- `Second` / `Withdraw` — real, as state 3

**Entry.** `{type:"accuse", targetId:null}` (E4). **Exit.** Second → 5b; withdraw →
`SLEEP_WITHDRAWN_MESSAGES` (`narrator.ts:162-165`); night → cleared (E12).

**Invented strings.** Section heading + `Needs a second` (shared with state 3). The moon glyph is
decoration, not copy.

**Note.** A sleep proposal stacks with execution accusations and spends the same budget (E4) — the
mockup shows both in one list on purpose.

---

## 5b. Sleep ballot

**Purpose.** The Voting frame with no target: the one ballot Figma cannot express.

**Elements.** Voting frame minus the 78×78 portrait (the wire carries `targetName:""`, S3), full
24px headline, tally, the two 100px thumb CTAs, admin `Cancel vote`.

**Copy.**
- Headline: `The town considers sleeping. Turn in for the night?` — real, `app.js:3147`
- Narrator: `SLEEP_SECONDED_MESSAGES` — real, `narrator.ts:150-154`
- Outcome lines: `SLEEP_PASSED_MESSAGES` (`167-171`) / `SLEEP_FAILED_MESSAGES` (`173-177`)

**Invented strings** (`data-invented`): thumb labels `Sleep` / `Stay up`. Rationale: on a
target-less ballot a bare thumb is ambiguous ("yes to what?"). Figma's Voting frame has no label
slot, so this is a genuine extension.

**Entry.** `vote_called {sleep:true,…}` (S3).
**Exit.** Pass (>50% of votes cast) → night, **no execution overlay** (E10, `app.js:3213-3216`);
fail → day with pending accusations intact (E10, `game-engine.ts:1863-1868`).

**Open question.** Labels on the thumbs, or a different affordance (two text CTAs) for the sleep
ballot only?

---

## 6. Admin view of pending accusations

**Purpose.** Show the two panels coexisting — Figma assumed the admin panel owns the day.

**Elements.** Accusation block on top (as any living player), then the admin card = Figma's
`Lobby rules` frame verbatim (270:1471): `#232729`, 2px white stroke, radius 16, pad 16; header row
with a 1px bottom rule; rows 326×60 `#000000`; **`End day` as the orange 5th row inside the list**
(not a detached button as in `index.html:296-298`).

**Copy.**
- `Admin controls` — Figma reads `Admin Controls` (270:1471), app `Admin Controls`
  (`index.html:290`); sentence case per R4.
- `Nominate a player for execution` — Figma has no trailing colon, app does (`index.html:293`).
- `(Vote #1 done)` — real, `app.js:2971`. Figma has no slot → proposed in the header row.
- `Vote failed. Nominate another player or end the day.` — real, `app.js:2972`. Figma has no slot
  → proposed directly beneath the header.
- `End day` — Figma casing; app `End Day` (`index.html:297`).

**Entry.** `phase_change → "day"` for `isAdmin` (`app.js:2963-2978`); the failed-vote sub-state
appears when `dayVoteCount > 0`.
**Exit.** Row tap → `call_vote` → state 4's ballot (`app.js:2991`, `game-engine.ts:1687-1698`).
`End day` → confirm sheet → `end_day` (`app.js:3112-3126`).

**Invented strings.** Section heading only (shared).

**Note.** A **dead admin keeps admin rights** (CLAUDE.md) but loses the accusation panel (C1) —
the top block disappears and the admin card stands alone. No separate frame drawn.

---

## 7. Dead / spectator view of live accusations

**Purpose.** Let eliminated players follow the day without acting.

**Elements.** Rows at 30% opacity (Figma's dead-row treatment, 261:2092), no action pills, one
12px status line. Membership Card in its revealed/dimmed form.

**Copy.** Row labels are real (`app.js:3036`, `3035`).
**Invented strings** (`data-invented`): `You're watching the town. You can't accuse or second.`

**Privacy check — clean.** Accusations are public by construction: accuser, target and seconder
names are broadcast room-wide (`server.ts:112-114`) and narrated to everyone
(`narrator.ts:129-148`). Dead clients **already receive** `accusations_update`; only the client
suppresses the render (C1). Nothing role-derived appears on this surface.

**Entry.** `you_died` → subsequent `accusations_update` frames.
**Exit.** Night (E12).

**⚠ This is a behaviour delta, not a re-skin** — R3 requires a flag + e2e playtest. Change is
client-only (`app.js:3012-3018`); no server or engine work.

---

## 8. Accusations locked while a ballot is live

**Purpose.** Explain why the accusation controls are inert during a vote instead of vanishing.

**Elements.** Ballot block live at full strength; accusation rows at 30% with a status line;
launcher CTA at 30%.

**Copy.** Row labels real. **Invented strings** (`data-invented`):
`On hold until the vote ends`, plus the shared heading.

**Engine basis.** All three accusation messages require `phase === "day"`
(`game-engine.ts:1730`, `1771`, `1799`); during a ballot the phase is `"voting"`, so every attempt
returns `not_day` — and S2 means the client is told nothing at all.

**⚠ Divergence to decide.** Today the app hides the whole block (C2, `app.js:3144`). Keeping it
visible-but-inert means the accusations that survive a failed vote (E10) don't vanish and
reappear. Alternative: keep the current hide, and this frame becomes documentation only.

**Other edge cases — no frame needed.**
- **≤2 alive waiver (E9):** an accusation opens the ballot immediately, so state 3 never renders.
  If the launcher is tapped at 2 alive, the next screen is state 4. Worth a playtest assertion, not
  a frame.
- **Silent rejects (S2):** no error toast can be designed today. Any "you can't do that" messaging
  would need a server change (send the engine's `error` string) — out of scope for a re-skin.
- **Revenge gate (S4):** accusation messages are refused while a Hunter gate holds the game; the
  room is already showing `#revenge-wait`, so no accusation chrome is visible anyway.
- **Rejoin mid-day (S5):** `game_sync` restores `accusations` / `accusationsMade` / `secondsMade`,
  so states 1/3/5a must be reconstructible from a cold render — no client-only state may gate them.

---

## Open questions for Hanson (consolidated)

1. **Spectator read-only accusations (state 7)** — adopt the behaviour delta, or keep the current
   hide-for-dead?
2. **Locked-vs-hidden during a ballot (state 8)** — dim in place, or keep hiding?
3. **Sleep-ballot thumb labels (5b)** — `Sleep` / `Stay up`, or a different affordance?
4. **Section heading `Standing accusations`** — needed at all? The app has no heading today.
5. **Row status lines (state 3)** — keep the 12px second line (rows grow to ~86px) or rely on
   button presence alone?
6. **Copy casing adoptions** — `Execute X?` (drops `Vote:`), `End day`, `Cancel vote`,
   `Admin controls`, `2/4 votes cast`: confirm these Figma-casing changes ship together.
7. **Sleep row position in the picker** — last (as today) or first?
