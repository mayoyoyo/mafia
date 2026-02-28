# Win Condition Edge Cases — Lovers & Joker

## Your Reported Bug

**Scenario:** 3 remaining: Mafia, Citizen, Detective. Mafia + Citizen are lovers. Citizen voted out.

**Engine result:** `town wins` (correct). The citizen is executed, mafia dies from heartbreak, only detective survives. `checkWinCondition` sees 0 alive mafia → town wins.

**Most likely explanation:** The lovers were actually **Citizen + Detective** (not Mafia + Citizen). Players can't see who the lovers are. If two non-mafia players are lovers and one is executed, the other dies from heartbreak, leaving only the mafia alive → mafia wins. This looks identical from the outside but has a very different outcome.

---

## FIXED: Joker Execution Now Calls killPlayer

Previously, `resolveVote()` returned early on joker execution without calling `killPlayer()`. The joker stayed alive and their lover didn't die from heartbreak.

**Fix:** Joker execution now calls `killPlayer()`, marking the joker as dead and triggering the heartbreak chain. Joker still wins.

---

## Surprising but Correct Behaviors

### A. Two citizens are lovers — executing one kills both → mafia wins
- 3 remaining: Mafia, Citizen1 (lover), Citizen2 (lover)
- Vote out Citizen1 → Citizen2 dies from heartbreak → only Mafia alive → **mafia wins**
- This is likely what the user experienced

### B. Executing a mafia whose lover is a citizen — town loses collateral
- 5 remaining: Mafia1 (lover of Citizen1), Mafia2, Citizen1 (lover of Mafia1), Citizen2, Citizen3
- Town executes Mafia1 → Citizen1 also dies from heartbreak
- Remaining: Mafia2 vs Citizen2 + Citizen3 → game continues (1 < 2)
- But with fewer players, could set up: Mafia2, Citizen2 → 1 >= 1 → **mafia wins next night**
- Town correctly identified mafia but the lover death cost them the game

### C. Mafia self-destructs by targeting their own lover at night
- Mafia (lover of Citizen1), Citizen1 (lover of Mafia), Citizen2, Citizen3
- Mafia targets Citizen1 → Citizen1 dies → Mafia dies from heartbreak → **town wins**
- Mafia can accidentally kill themselves if they don't know who their own lover is

### D. Doctor's lover killed at night → doctor dies from heartbreak
- Mafia targets Citizen who is Doctor's lover. Doctor saved someone else.
- Citizen dies → Doctor dies from heartbreak → double kill at night
- Doctor's save action was wasted on wrong person, AND they lost their life

### E. Mafia kills joker's lover at night → joker dies before ever getting a chance
- Joker is lover of Citizen. Mafia kills Citizen at night.
- Citizen dies → Joker dies from heartbreak → Joker never had a chance to get executed
- Joker loses through no fault of their own

### F. Mafia vs Joker endgame — joker can never win
- 2 remaining: Mafia, Joker
- `checkWinCondition`: 1 mafia >= 0 non-mafia + 1 joker → **mafia wins**
- Day phase never starts, joker can't get executed

---

## Design Decisions (Resolved)

- **Joker execution:** Fixed. Joker is marked dead, lover dies from heartbreak. Joker still wins.
- **Mafia self-target:** Allowed. Adds strategic risk since mafia doesn't know who their lover is.
- **Joker vs Mafia endgame:** Mafia wins. Joker failed to get executed in time.
- **Joker heartbreak:** Joker dies normally from heartbreak. Consistent lover rules.
- **Lover collateral:** Kept as-is. Heartbreak applies uniformly on execution.
