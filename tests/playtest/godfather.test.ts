// Playtest: the Godfather role.
//
// Godfather = a mafia-aligned player whose `role` stays "mafia" but who reads
// INNOCENT to the Detective. It occupies a mafia slot (count stays constant),
// counts for parity, and is known to its own mafia team.
//
// Coverage (per the brief):
//   A — the mechanic: Detective investigating the Godfather sees isMafia:false;
//       investigating a plain mafioso sees isMafia:true (two scenarios).
//   B — parity: a Godfather counts in aliveMafia, so a mafia parity-win fires.
//   C — team visibility: every mafia learns who the Godfather is (godfatherName),
//       both mafia see the godfather in mafiaTeam, and the Godfather's own
//       game_started carries isGodfather:true.
//   D — reveal label: the game_over reveal entry for the Godfather has
//       isGodfather:true while role:"mafia".
//
// Run ONLY this file:  bun test tests/playtest/godfather.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient } from "./harness.ts";
import type { Role } from "../../src/types.ts";

/**
 * Drive a 2-mafia kill to consensus + confirm. Both mafia nominate (maybe) and
 * lock the same target; unanimous lock yields mafia_confirm_ready, then m1
 * confirms. Resolves once m1 sees night_action_done. (The single-mafia
 * killAsMafia handshake doesn't apply with 2 mafia — consensus needs both locks.)
 */
async function killAsTwoMafia(m1: PlaytestClient, m2: PlaytestClient, targetId: number): Promise<void> {
  let p = m1.waitFor("mafia_vote_update");
  m1.mafiaVote(targetId, "maybe");
  await p;
  p = m1.waitFor("mafia_vote_update");
  m1.mafiaVote(targetId, "lock");
  await p;

  p = m2.waitFor("mafia_vote_update");
  m2.mafiaVote(targetId, "maybe");
  await p;
  const ready = m2.waitFor("mafia_confirm_ready");
  m2.mafiaVote(targetId, "lock");
  await ready;

  const done = m1.waitFor("night_action_done");
  m1.confirmMafiaKill();
  await done;
}

describe("godfather — detective reads innocent (the mechanic)", () => {
  // 6 players so the night resolves to DAY (no early parity-win) and the
  // detective_result is cleanly delivered at dawn.
  const roles: Role[] = ["mafia", "mafia", "detective", "citizen", "citizen", "citizen"];

  test("investigating the Godfather returns isMafia:false", async () => {
    const { clients } = await runScenario({
      roles,
      godfather: 0, // seat 0 is the Godfather (also a mafia)
      settings: { enableGodfather: true, enableDetective: true },
      autoNarratorReady: true,
      timeline: [
        async ({ clients }) => {
          const m1 = clients[0], m2 = clients[1], det = clients[2];
          // Set the detective_targets waiter up BEFORE the kill — it only opens
          // after the mafia sub-phase completes (no look-back in waitFor).
          const detTargetsP = det.waitFor("detective_targets", 8000);
          await killAsTwoMafia(m1, m2, clients[3].userId!); // kill a citizen
          await detTargetsP;
          const res = await det.detectiveInvestigate(clients[0].userId!); // the Godfather
          expect(res.isMafia).toBe(false);
        },
      ],
    });
    // Sanity: the detective's recorded result is the false reading.
    const result = clients[2].lastOf("detective_result");
    expect(result).toBeDefined();
    expect(result!.isMafia).toBe(false);
  }, 30000);

  test("control: investigating a plain mafioso returns isMafia:true", async () => {
    const { clients } = await runScenario({
      roles,
      godfather: 0,
      settings: { enableGodfather: true, enableDetective: true },
      autoNarratorReady: true,
      timeline: [
        async ({ clients }) => {
          const m1 = clients[0], m2 = clients[1], det = clients[2];
          const detTargetsP = det.waitFor("detective_targets", 8000);
          await killAsTwoMafia(m1, m2, clients[3].userId!);
          await detTargetsP;
          const res = await det.detectiveInvestigate(clients[1].userId!); // plain mafia
          expect(res.isMafia).toBe(true);
        },
      ],
    });
    const result = clients[2].lastOf("detective_result");
    expect(result).toBeDefined();
    expect(result!.isMafia).toBe(true);
  }, 30000);
});

describe("godfather — counts as mafia for parity", () => {
  test("mafia parity-win fires with the Godfather counted in aliveMafia", async () => {
    // 5 players: 2 mafia (one is the Godfather) + 3 citizens. Killing one
    // citizen yields 2 mafia vs 2 town → parity → mafia win (no doctor). If the
    // Godfather were wrongly excluded from aliveMafia, mafia would be 1 vs 3 and
    // no win would fire here.
    const roles: Role[] = ["mafia", "mafia", "citizen", "citizen", "citizen"];

    const { clients, gameOver } = await runScenario({
      roles,
      godfather: 0,
      settings: { enableGodfather: true },
      autoNarratorReady: true,
      timeline: [
        async ({ clients }) => {
          const m1 = clients[0], m2 = clients[1];
          const overP = clients[0].waitFor("game_over", 8000);
          await killAsTwoMafia(m1, m2, clients[2].userId!); // kill a citizen
          await overP;
        },
      ],
    });

    expect(gameOver).toBeDefined();
    expect(gameOver!.winner).toBe("mafia");

    // D — reveal label: the Godfather entry is role:"mafia" + isGodfather:true.
    const revealPlayers = (gameOver!.players ?? []) as Array<{ id: number; role?: string; isGodfather?: boolean }>;
    const gfId = clients[0].userId!;
    const gfEntry = revealPlayers.find((p) => p.id === gfId);
    expect(gfEntry).toBeDefined();
    expect(gfEntry!.role).toBe("mafia");
    expect(gfEntry!.isGodfather).toBe(true);
  }, 30000);
});

describe("godfather — team visibility", () => {
  test("both mafia see the Godfather in their team + godfatherName; the Godfather's own start carries isGodfather", async () => {
    const roles: Role[] = ["mafia", "mafia", "doctor", "citizen"];

    const { clients } = await runScenario({
      roles,
      godfather: 0,
      settings: { enableGodfather: true, enableDoctor: true },
      // No timeline: game_started is captured during start_game (before the gate).
    });

    const gfName = clients[0].lastOf("registered")!.username as string;

    // The Godfather (clients[0]).
    const gfStart = clients[0].lastOf("game_started")!;
    expect(gfStart.isGodfather).toBe(true);
    expect(gfStart.godfatherName).toBe(gfName);
    expect(Array.isArray(gfStart.mafiaTeam)).toBe(true);
    expect(gfStart.mafiaTeam).toContain(gfName);

    // The plain mafioso (clients[1]) — knows who the Godfather is, but is not it.
    const mStart = clients[1].lastOf("game_started")!;
    expect(mStart.godfatherName).toBe(gfName);
    expect(mStart.mafiaTeam).toContain(gfName);
    expect(!!mStart.isGodfather).toBe(false);

    // Non-mafia (doctor) sees neither field.
    const docStart = clients[2].lastOf("game_started")!;
    expect(docStart.mafiaTeam).toBeUndefined();
    expect(docStart.godfatherName).toBeUndefined();
    expect(!!docStart.isGodfather).toBe(false);
  }, 30000);
});
