// Playtest: official-mode Doctor save must NOT privately reveal to the victim
// that they were targeted by the Mafia.
//
// Official Mafia rules keep the save anonymous: the town hears an anonymous
// "someone was saved" line, but the saved victim is NOT told "you were
// targeted but the Doctor saved you". This test pins both halves:
//   (a) PRIMARY — the victim receives NO `doctor_save_private` message.
//   (b) GUARD   — the public dawn `phase_change` still carries the anonymous
//                 save narration (saved:true + an official save line) and does
//                 NOT name the victim.
//
// Run ONLY this file:  bun test tests/playtest/doctor-reveal.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario } from "./harness.ts";
import type { Role } from "../../src/types.ts";

describe("official doctor save — no private reveal to victim", () => {
  test("victim is not told they were targeted; public narration stays anonymous", async () => {
    const roles: Role[] = ["mafia", "doctor", "citizen"]; // default settings = official mode
    const VICTIM = 2; // citizen, join index 2

    const { clients } = await runScenario({
      roles,
      // The doctor role must be ENABLED for the doctor sub-phase to open
      // (DEFAULT_SETTINGS.enableDoctor === false, src/types.ts) — otherwise the
      // engine skips the doctor entirely and the victim just dies. doctorMode
      // stays "official" (the default), which is the mode under test.
      settings: { enableDoctor: true },
      autoNarratorReady: true, // opens the night; mafia gets mafia_targets
      timeline: [
        // 1) Mafia (clients[0]) kills the citizen (join index 2).
        async ({ clients }) => {
          const mafia = clients[0];
          const targets = mafia.lastOf("mafia_targets")!.players as Array<{ id: number }>;
          const victimId = clients[VICTIM].userId!;
          const t = targets.find((p) => p.id === victimId);
          expect(t).toBeDefined(); // the citizen must be a legal mafia target
          await mafia.killAsMafia(victimId);
        },
        // 2) Doctor (clients[1]) saves the citizen (join index 2). The doctor is
        //    the last night actor (no detective), so resolving the save advances
        //    the night to dawn. Wait for the admin's day phase_change to land.
        async ({ clients }) => {
          const doctor = clients[1];
          // Doctor sub-phase opened after the mafia step (doctor_targets).
          await doctor.waitFor("doctor_targets");
          const dawnP = clients[0].waitMatch(
            (m) => m.type === "phase_change" && m.phase === "day",
            5000,
            "phase_change(day)"
          );
          const victimId = clients[VICTIM].userId!;
          await doctor.doctorSave(victimId);
          await dawnP;
        },
        // Small settle so any (wrongly-sent) private message has time to arrive.
        async ({ sleep }) => { await sleep(150); },
      ],
    });

    // ── (a) PRIMARY: the saved victim received NO private reveal. ───────────
    const victim = clients[VICTIM];
    const privateReveals = victim.allOf("doctor_save_private");
    expect(privateReveals).toEqual([]); // FAILS today: victim wrongly gets one.

    // ── (b) GUARD: public dawn narration is anonymous (not over-removed). ───
    // Assert STRUCTURAL facts, not fragile narrator keywords — the noir
    // rewrite means the anonymous-save line no longer contains words like
    // "saved/survived/cheated death", so a keyword regex would be brittle.
    const dawn = clients[0].lastOf("phase_change");
    expect(dawn).toBeDefined();
    expect(dawn!.phase).toBe("day");
    // The engine flags the save as a FACT on the dawn phase_change…
    expect(dawn!.saved).toBe(true);
    // …a public dawn narration line is still present (not over-removed)…
    const messages = (dawn!.messages as string[]) ?? [];
    expect(messages.length).toBeGreaterThan(0);
    // …and it must NOT name the victim (anonymity is the whole point).
    const blob = messages.join(" ").toLowerCase();
    const victimName = (victim.lastOf("registered")!.username as string).toLowerCase();
    expect(blob.includes(victimName)).toBe(false);
  }, 30000);
});
