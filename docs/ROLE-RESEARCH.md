# New Role Recommendations — maf1a (9-Player Focus)

Research date: 2026-06-09. Read-only survey of the repo (`src/types.ts`, `src/game-engine.ts`, `src/server.ts`, `public/pixel-art.js`, `README.md`) plus the Werewolf/Town-of-Salem role canon.

## TL;DR — Ranked

| # | Role | Canon source | Type | Complexity | One-line pitch |
|---|------|-------------|------|------------|----------------|
| 1 | **Vigilante** (one bullet) | Town of Salem | Night sub-phase | **M** | Gives the 4 agency-less citizens' slot a town gun; counters obvious Jokers; official/house guilt split |
| 2 | **Godfather** | Town of Salem / mafiascum | Passive flag | **S** | Cheapest meaningful add; breaks the Detective's never-wrong oracle in 2-mafia games |
| 3 | **Hunter** | Miller's Hollow / Ultimate Werewolf | Death trigger | **M** | The best in-person drama in the canon; reuses the Joker-haunt pick-a-target machinery |
| 4 | **Miller** | Classic mafia (mafiascum) / UW "Lycan" | Passive flag | **S** | Detective false-positive; guaranteed end-of-game laugh; pairs with Godfather as "detective noise" |
| 5 | **Masons** (pair) | Ultimate Werewolf / ONUW | Start-of-game info | **S** | Two citizens know each other; reuses the `mafiaTeam` reveal plumbing; counterweight to #2/#4 |

---

## The 9-player meta today (why these five)

A full-toggle 9p game is currently: **2 Mafia, Doctor, Detective, Joker, 4 Citizens** (+ optional Lovers). Three observations drove the ranking:

1. **Citizens have zero agency.** 4 of 9 players close their eyes at night and tap thumbs during the day. The highest-value additions either give town a night lever (Vigilante) or give vanilla citizens identity (Masons, Miller).
2. **The Detective is a private, never-wrong oracle.** Results are delivered privately and are 100% accurate, and in same-room verbal play a confident "the app told me X is mafia" claim is nearly unbeatable. In 2-mafia 9p games the Detective snowballs. Godfather and Miller are the two canonical noise injectors — one false-negative, one false-positive.
3. **The architecture has a sharp cost cliff.** A night-acting role costs: `Role` union + toggle + `assignRoles` slot + a real sub-phase **and** a fake sub-phase in `advanceNightSubPhase` + sound cues (`${phase}_open/close` — i.e. **2 new mp3s × 8 accent directories = 16 audio assets**) + target-list/spectator/`game_sync`/rejoin message handling + pixel art + tests. A **passive** role costs a flag, a card, art, and one hook. That's why two of the five picks are passives and one is a death trigger that reuses existing haunt machinery — only the #1 pick pays the full sub-phase toll, because it's worth it.

Also load-bearing: `checkWinCondition` is a simple parity check (`aliveMafia >= aliveNonMafia + aliveJoker`), the `winner` union `"town" | "mafia" | "joker"` is threaded through many `ServerMessage` types, and `resolveVote` already auto-transitions to night after an execution (relevant to Hunter, below). The doctor-save precedent in `resolveNight` is **one save blocks one kill source** (established by the Joker-haunt code) — all new kill sources below follow it.

---

## 1. Vigilante — one-shot town gun

**Provenance:** [Town of Salem's Vigilante](https://town-of-salem.fandom.com/wiki/Vigilante_(ToS)) (3 bullets, no night-1 shot, guilt-suicide if they kill town). One-bullet versions are a common in-person house rule; werewolf.online's wiki lists similar town-killer roles ([List of Roles](https://werewolf-the-game.fandom.com/wiki/List_of_Roles)).

**Proposed rules**
- Town-aligned. Holds **one bullet for the entire game**. New night sub-phase (order: mafia → doctor → **vigilante** → detective → resolving). Each night they pick a target **or hold fire**; "hold fire" is a new affordance (Doctor/Detective currently must act).
- **No shot on night 1** (ToS rule; prevents a blind double-kill before anyone has information).
- After the bullet is spent, the sub-phase still wakes them with only "hold fire" available — so bullet status never leaks to the room. Dead vigilante → existing fake-phase machinery covers it unchanged.
- **Doctor interaction** (follows the existing haunt precedent exactly): doctor's target = vig's target and mafia targeted elsewhere → shot blocked, generic "saved" narration. Doctor's target hit by *both* mafia and vig → target dies (one save absorbs one source).
- **Joker interaction (the sleeper feature):** shooting the Joker kills them with **no Joker win** — the Joker only wins via day execution. Town finally has an answer to a blatantly vote-baiting Joker, and the Joker must perform more subtly. No code change needed; falls out of existing win logic.
- **Lovers:** `killPlayer` cascade applies as usual.
- **Win/parity:** counts as town. A bad shot can hand mafia parity at dawn — `checkWinCondition` already runs in `transitionToDay`.
- **Official/house split** (matches the game's existing pattern): **official** = ToS guilt — if the victim was town, the vigilante dies the *following* night, unsavable, with the narration "overcome with guilt…"; **house** = no guilt, the bullet is simply gone.

**Why it's #1 at 9p:** it converts one dead-weight citizen slot into the game's most agonizing decision, gives town a second lever besides the admin-steered single-target lynch, and the one-bullet cap bounds the swing (worst case: town goes 7→5 in one cycle; recoverable). Roster: **2 Mafia, Doctor, Detective, Vigilante, Joker, 3 Citizens**.

**Implementation sketch (M):** `Role` union + `enableVigilante` + `vigilanteMode` settings; `"vigilante"` in the `NightSubPhase` array with real/fake branches (copy the detective block); `Game` fields `vigilanteTarget`, `vigilanteBulletUsed`, `vigilanteGuiltPending`; client messages `vigilante_shoot {targetId | null}` / server `vigilante_targets`; `resolveNight` block modeled on the haunt block; `vigilante_open/close.mp3` × 8 accents; spectator log + `game_sync` + rejoin; 10×10 art; README roster row; tests mirroring `doctor-joker-modes.test.ts`.

**Risks / anti-fun:** vig snipes the Detective off a bad read (brutal but memorable — official guilt mode punishes spraying); one more sub-phase lengthens every night for everyone (it's a single tap; acceptable); collusion with the admin is the same trust model the game already runs on.

---

## 2. Godfather — the Detective's blind spot

**Provenance:** [Town of Salem's Godfather](https://town-of-salem.fandom.com/wiki/Godfather) ("appears innocent to the Sheriff", detection immunity); long-standing classic-mafia role (mafiascum).

**Proposed rules**
- When enabled **and `mafiaCount ≥ 2`** (toggle disabled/ignored at 1 mafia — otherwise the Detective can literally never find anyone), one randomly chosen mafia is secretly the Godfather.
- Identical to mafia in every way — joins kill deliberation, sees/is seen by the team, counts for parity, dies normally — **except the Detective's investigation returns "not mafia."**
- Drop ToS's night-immunity half of the role: the Doctor should stay the only protection mechanic.
- Detective history keeps the false entry (no retro-correction); end-game reveal shows "Godfather."

**Why it's #2:** the highest balance-impact-per-line-of-code in this list. At 9p the Detective finds a mafioso in roughly half of games and that find is unfalsifiable; the Godfather turns "the app cleared him" into a debatable claim instead of a fact, which is exactly what an in-person, verbal-argument game wants. And it's the rare addition with **zero night-flow cost**.

**Implementation sketch (S):** cheapest correct path is **not** a new `Role` union member but a `isGodfather: boolean` on `Player` — every `role === "mafia"` check (vote submission, consensus counting, parity, `mafiaTeam` reveal, target exclusion, shared `mafiaVariant` art) keeps working untouched; the *only* behavior change is the detective-result computation, plus card copy/art and the game-over reveal label reading the flag. Settings toggle + validation; no sub-phase, no audio.

**Risks / anti-fun:** Detective players feel nerfed — keep it **off by default**, label it "for 2+ mafia games," and consider pairing it with Miller (#4) so the noise cuts both ways. With both non-GF mafia dead, town must close out on pure reads; that's the intended endgame, but worth a line in the README.

---

## 3. Hunter — take someone with you

**Provenance:** The Werewolves of Miller's Hollow / [Ultimate Werewolf](https://ultimatewerewolfgames.tumblr.com/roles) ("If the Hunter is killed, they can take someone down with them"); [Stellar Factory's Werewolf](https://playwerewolf.co/pages/character-roles) ("If you die you may point at a player and they will die as well").

**Proposed rules**
- Town-aligned, **no night action**. When the Hunter dies — night kill, execution, Joker haunt, or lover heartbreak — their role is publicly revealed and they immediately pick one alive player to die with them. The revenge shot is public, **unstoppable** (no doctor window — it resolves outside the night action set), and lover-cascades.
- **Timing, day execution:** revenge interrupt fires *before* `resolveVote`'s auto-transition to night — the same gate pattern as `awaitingNarratorReady`.
- **Timing, night death:** revenge fires at dawn as part of the death announcement, before day begins (canon, and far simpler than threading it into the night machine).
- Win checks run *after* the revenge resolves: the Hunter can win the game for town by sniping the last mafia, or hand mafia parity by tilting into a townie.
- Exactly **one revenge per hunter death**, whatever the source — including a Joker haunt (chaotic, but the rule is consistent and explainable in one sentence).
- Single mode; optional house variant later: revenge may be declined.

**Why it's #3:** this is the single best *same-room* moment in the entire canon — a freshly-dead player standing up and pointing at someone while the room screams. It needs no private channel, no chat, no extra night length. Strategically it taxes both careless lynch trains and mafia kills at 9p without adding any information to the pool.

**Implementation sketch (M):** no sub-phase, **no audio assets**. Reuse the Joker-haunt target list + slide-to-confirm client UI (`public/pixel-art.js` even has the slide-to-confirm icon pattern to copy); new `Role` union member + toggle; `Game.hunterRevengePending: number | null`; gates in `resolveVote` and `transitionToDay`; `hunter_revenge {targetId}` client message; spectator/`game_sync`/rejoin states; art + README.

**Risks / anti-fun:** game stalls if the hunter walked off to the kitchen — add an admin force-skip (consistent with `force_dawn`) and/or a 60s auto-skip; tilt-revenge onto a confirmed townie (canon, party-acceptable); death reveals a role publicly (canon — and since the Hunter has no night phase, the fake-phase secrecy system isn't implicated).

---

## 4. Miller — the false positive

**Provenance:** classic mafia Miller — town that "appears guilty" to the cop ([mafiascum wiki](https://wiki.mafiascum.net/index.php?title=Miller), [EpicMafia](https://epicmafia.fandom.com/wiki/Miller)); Ultimate Werewolf's **Lycan** is the unaware variant.

**Proposed rules**
- A citizen in every respect — town parity, no night action, normal death — **but the Detective's investigation returns "MAFIA."**
- **Aware variant** (recommended over the Lycan unaware variant): the role card says *"You are the Miller. You are town — but the Detective sees you as guilty."* Since this app deals explicit role cards, awareness is the natural fit, and it lets the player run the classic pre-emptive "I'm the Miller, ignore the cop" defense verbally.
- Joker still reads "not mafia" (unchanged). End-game reveal shows "Miller."
- If both Godfather and Miller are toggled, detective noise runs both directions — fine, but the settings copy should say so.

**Why it's #4:** for a casual party group this is the cheapest *chaos-per-byte* in the list. The Detective privately "catches" someone, stakes their credibility on it during verbal day talk, the table lynches the Miller, and the end-game reveal detonates. It also softens the Detective oracle from the opposite direction as the Godfather while giving one vanilla-citizen slot a personality.

**Implementation sketch (S):** like Godfather, best as an `isMiller` flag on a citizen (or a `Role` member if you prefer distinct art) — single hook in the detective-result computation, card copy, art, toggle, README. No sub-phase, no audio, no new messages beyond the role card.

**Risks / anti-fun:** getting lynched off a *true* report you couldn't disprove can feel railroady — mitigated because the Miller knows (can pre-claim), detective results here are private (it sparks an argument, not an automatic train), and the failed-vote path returns to day so the table can change its mind.

---

## 5. Masons — two citizens who know each other

**Provenance:** [Ultimate Werewolf / ONUW Masons](https://one-night.fandom.com/wiki/Mason) — always two, village-aligned, identify each other night 1 ([werewolf.chat roles](https://werewolf.chat/Roles)).

**Proposed rules**
- Two random **citizens** (never mafia/joker/special — that's the entire point) learn each other's names at game start. No night action, no wake-up: the app simply shows the partner's name on the role card, exactly like `mafiaTeam` does for mafia.
- Pure town for parity; die normally; a Mason can also independently be a Lover (fine).
- Requires ≥ 2 citizens left after specials are dealt — validate at start (same pattern as the mafia-count clamp message).

**Why it's #5:** it gives two more vanilla slots identity and a private, verbally-deployable fact ("I can vouch for exactly one person"), and it's the natural **counterweight** when Godfather/Miller noise is enabled — a known-clean pair anchors town reads. Night flow is completely untouched.

**Implementation sketch (S):** `isMason` flag + partner name in `game_started` / `game_sync` (mirror the `mafiaTeam` field), toggle, card copy, art badge over citizen art, README. The cheapest item on this list after Godfather.

**Risks / anti-fun:** hard-confirmed pairs shrink the deduction space at 9p — recommend keeping it off unless Godfather or Miller is on; a public dual-mason claim is strong, but mafia counterfeiting the claim is exactly the mind-game the role exists to create.

---

## Suggested 9-player lineups

| Lineup | Composition |
|---|---|
| **Default+** (first ship) | 2 Mafia · Doctor · Detective · Joker · **Vigilante** · 3 Citizens |
| **Noisy detective** | 2 Mafia (one **Godfather**) · Doctor · Detective · **Miller** · Joker · 3 Citizens |
| **Balanced noise** | 2 Mafia (one **Godfather**) · Doctor · Detective · Joker · 4 Citizens (2 = **Masons**) |
| **Full chaos** | 2 Mafia (one **Godfather**) · Doctor · Detective · **Vigilante** · **Hunter** · Joker · 2 Citizens |

Note: `assignRoles` deals specials in fixed order and fills citizens last; with every toggle on at 9p you bottom out at ~2 vanilla citizens. Worth adding a lobby soft-warning when `mafiaCount + enabled specials ≥ players − 2`.

---

## Considered but rejected

| Role | Source | Why rejected |
|---|---|---|
| **Witch** (heal + poison potion) | Miller's Hollow / [UW](https://board-games.fandom.com/wiki/Ultimate_Werewolf/Roles) | Redundant with Doctor + Vigilante combined; needs to *see the mafia victim mid-night*, a heavier sub-phase contract than any existing role |
| **Serial Killer** | ToS / [Werewolf Online](https://werewolf-the-game.fandom.com/wiki/List_of_Roles) | Third kill faction rewrites the `"town"\|"mafia"\|"joker"` winner union and parity logic threaded through dozens of `ServerMessage` types; Joker already owns the solo slot at 9p |
| **Medium / Retributionist** | ToS | Needs a dead↔living private channel; the dead are sitting in the same room and there's no in-app chat — broken in person |
| **Escort / Consort / Old Hag** (roleblockers) | ToS / UW | Sequential sub-phase ordering leaks blocks, every blocked role needs fake-phase cover, and "you got no result" bewilders casual players |
| **Cupid** | Miller's Hollow | The Lovers modifier already delivers the payoff; choosing lovers adds a night-1-only sub-phase (+16 audio assets) for marginal gain |
| **Bodyguard** | UW | ~95% a Doctor duplicate (deltas: dies-in-place, repeatable target) |
| **Veteran** | ToS | Built on a "visiting" concept this engine doesn't model at all |
| **Mayor** | ToS | Reveal + multi-vote breaks the anonymous binary thumbs tally math; marginal at 9p |
| **Executioner** | ToS | "Get my target lynched" crowds the Joker's niche and needs new win plumbing |
| **Survivor / Amnesiac** | ToS | Low-agency neutrals; dull in a verbal room |
| **Robber / Troublemaker / Drunk / Doppelgänger** | ONUW | One-night card-swap format, incompatible with a multi-night engine with persistent roles |
| **Sorcerer / Consigliere** (mafia seer) | UW / ToS | Stacks information on the already-informed minority at 9p, and costs a full sub-phase + 16 audio assets to make town sadder |
| **Prince** (lynch-immune, reveals) | UW | A once-per-game passive gotcha; since a failed vote already returns to day, it just refunds one vote — low value for a new resolution hook |

## Sources

- [Ultimate Werewolf roles (tumblr reference)](https://ultimatewerewolfgames.tumblr.com/roles) · [Ultimate Werewolf/Roles — Board Games Wiki](https://board-games.fandom.com/wiki/Ultimate_Werewolf/Roles)
- [Vigilante — Town of Salem Wiki](https://town-of-salem.fandom.com/wiki/Vigilante_(ToS)) · [Godfather — Town of Salem Wiki](https://town-of-salem.fandom.com/wiki/Godfather)
- [Miller — MafiaWiki (mafiascum)](https://wiki.mafiascum.net/index.php?title=Miller) · [Miller — EpicMafia Wiki](https://epicmafia.fandom.com/wiki/Miller)
- [Mason — One Night Wiki](https://one-night.fandom.com/wiki/Mason) · [Roles — werewolf.chat](https://werewolf.chat/Roles)
- [Character Roles — WEREWOLF by Stellar Factory](https://playwerewolf.co/pages/character-roles) (Hunter)
- [List of Roles — Werewolf (Online) the Game Wiki](https://werewolf-the-game.fandom.com/wiki/List_of_Roles)
- [Mafia (party game) — Wikipedia](https://en.wikipedia.org/wiki/Mafia_(party_game))
