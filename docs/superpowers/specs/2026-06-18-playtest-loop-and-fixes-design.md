# Playtest Loop + Three Fixes — Design / Plan-of-Record

Date: 2026-06-18
Status: Approved (design), in implementation
Branch: work on a feature branch off `staging`; pushes are user-gated (see CLAUDE.md)

## Goal

Build a reusable, self-healing **playtest harness/skill** that spins up a local
multi-player Mafia game deterministically and verifies behavior, then run a
**verify → fix → verify loop** (fixes delegated to subagents) over three tasks:

1. **Doctor reveal (official rules):** the saved victim must NOT be told they were targeted.
2. **Parity + Doctor:** a Mafia parity-win must NOT end the game while a Doctor is alive.
3. **Voice lines:** rewrite the corny on-screen narrator event text to a grounded Pixel-Noir register.

Orchestrator (main session) delegates ALL coding, research, and verification to subagents.
Chrome screenshot "proof" passes run in the main session (claude-in-chrome is session-bound).

## Locked decisions

- **Harness:** scripted WebSocket bots play the deterministic scenario (roles pinned via
  `MAFIA_FIXED_DEAL`); logic verified by assertions (a permanent `bun test`); a single real
  Chrome tab for the player whose screen matters is screenshotted as visual proof.
- **Parity rule:** suppress the Mafia parity-win while any Doctor is alive; let nights/days
  resolve; Mafia win fires once no Doctor remains. Stalemate → admin end-game power.
- **Save secrecy:** drop ONLY the victim's private "you were saved" message in official mode;
  keep the anonymous public "someone was saved" narration.
- **Voice scope:** rewrite `src/narrator.ts` event text only (no audio); the 8 recorded
  accents in `narration.json`/`public/audio/` are untouched for now.

## Harness / skill architecture

- `tests/playtest/harness.ts` — a `PlaytestClient` (WS wrapper over the game protocol:
  register/login/create/join/start, mafia_vote, doctor_save, detective_investigate, call_vote,
  cast_vote, the admin "Begin Night" ready-gate, force_dawn, hunter revenge) with a message log
  and `waitFor(type, timeoutMs)`; plus `runScenario(spec)` that boots the server subprocess with
  `MAFIA_FIXED_DEAL` + ephemeral `PORT`/`DATABASE_PATH`, drives a timeline, and returns each
  client's message log + final state. Modeled on `tests/e2e.test.ts` (canonical protocol reference).
- `tests/playtest/*.test.ts` — one headless integration test per task (bots only). These ARE the
  loop's inner verify and double as permanent regression tests.
- `.claude/skills/playtest-mafia/SKILL.md` — how to author/run a scenario, the Chrome-proof
  procedure, and a `## Learnings` self-healing log. **Self-healing rule:** when a step fails and the
  cause is found, encode the fix in `harness.ts` AND append a dated symptom→cause→fix entry so it
  never recurs.

Scenario has two front-ends sharing one definition: **headless** (all bots, asserted) and
**proof** (observed player is a Chrome tab; bots fill other seats; join order is deterministic so
`MAFIA_FIXED_DEAL` gives the observed player the intended role).

## The loop (per task)

1. Verify status quo — write the headless test asserting EXPECTED behavior → it fails (red).
2. Fix — delegate a TDD subagent to make it pass (engine/server/narrator only).
3. Verify — test green; full `bun test` green (no regressions).
4. Proof — Chrome-proof pass; screenshot to user.

## The three fixes (acceptance criteria)

1. **Doctor reveal** — `src/server.ts:1849`: when `doctorMode === "official"`, do NOT send
   `doctor_save_private` to the victim. Keep the anonymous public line. *Test:* victim bot receives
   no `doctor_save_private` in official mode; house-mode behavior preserved.
2. **Parity + Doctor** — `checkWinCondition` (`src/game-engine.ts:1663`): before returning
   `"mafia"` at parity, if any alive player has role `"doctor"`, return `null`. *Tests:*
   `{doctor,joker,mafia}` → null; `{joker,mafia}` (no doctor) → "mafia"; town-win and joker-win
   paths unchanged. Reconcile existing win-condition tests (`tests/doctor-joker-modes.test.ts`,
   `tests/game-engine.test.ts`) to the new rule deliberately. Update README parity spec.
3. **Voice lines** — rewrite `src/narrator.ts` event templates AND madlib word-banks (kills, saves,
   no-kill nights, executions, lover death, joker/hunter events, win/lose) to grounded Pixel-Noir;
   preserve every placeholder token and the array/structure shape. *Verify:* `bun test` green +
   transcript screenshot.

## Execution order

Harness build + Task 2 (independent of harness) + Task 3 research → run in parallel.
Task 1 follows the harness. Chrome proofs run in main session. Version bump + push are user-gated.

## Risks / notes

- Changing `checkWinCondition` will break tests that encode the old parity rule — update them
  deliberately, not blindly.
- Doctor-save cap: confirm the doctor can save every night (no per-game limit) so "any doctor
  alive" is the correct suppression condition; otherwise gate on "doctor that can still save."
- Narrator rewrite must keep the exact placeholder contract so `narrator.ts` consumers don't break.
