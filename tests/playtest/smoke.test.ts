// Smoke test for the playtest harness: boots a pinned 3-player deal
// (mafia, doctor, citizen), creates/joins/starts, and asserts each client
// received game_started with the role the fixed deal assigned by JOIN ORDER.
//
// Run ONLY this file:  bun test tests/playtest/smoke.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario } from "./harness.ts";
import type { Role } from "../../src/types.ts";

describe("playtest harness smoke", () => {
  test("3-player pinned deal assigns roles by join order", async () => {
    const roles: Role[] = ["mafia", "doctor", "citizen"];

    const { clients } = await runScenario({ roles });

    // Every client got a game_started message.
    for (let i = 0; i < clients.length; i++) {
      const started = clients[i].lastOf("game_started");
      expect(started).toBeDefined();
      expect(started!.role).toBe(roles[i]);
      // Harness also records it on the client.
      expect(clients[i].role).toBe(roles[i]);
    }

    // The admin (clients[0]) saw the night phase_change after start.
    const phase = clients[0].lastOf("phase_change");
    expect(phase).toBeDefined();
    expect(phase!.phase).toBe("night");

    // Admin received the narrator-ready gate prompt.
    expect(clients[0].lastOf("awaiting_ready")).toBeDefined();

    // Mafia (clients[0]) was told its teammates via mafiaTeam on game_started.
    const mafiaStarted = clients[0].lastOf("game_started");
    expect(Array.isArray(mafiaStarted!.mafiaTeam)).toBe(true);
  }, 30000);
});
