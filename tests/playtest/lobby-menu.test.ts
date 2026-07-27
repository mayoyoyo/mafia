// P3 (Game Menu) e2e — the LOBBY half, over real WebSockets.
//
// Two things are pinned here, both about the pre-game "Roles in Play" sheet
// that the Figma lobby nav opens (F6, spec:42-782 line 269 -> 268:640):
//
//  1. DERIVABILITY. The premise of shipping F6 without a server change is that
//     every input the lineup needs is already on the wire: `lobby_update`
//     carries the whole settings object + the players array
//     (src/server.ts:80-92). This test asserts those fields are present and
//     that the client's derivation (mirrored below from
//     src/game-engine.ts assignRoles) predicts the EXACT roster the server
//     later publishes in game_started.roster (rosterSummary, engine:660-678).
//     If the engine's deal ever changes shape, this fails.
//
//  2. SECRECY. Everything a client receives while the game is still in the
//     lobby must be free of any player->role pairing. Asserted over the RAW
//     message logs of every client, not over a projection.
//
// Run ONLY this file:  bun test tests/playtest/lobby-menu.test.ts

import { describe, test, expect } from "bun:test";
import { PlaytestClient, bootServer, findFreePort } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const ROLE_WORDS = ["mafia", "doctor", "detective", "joker", "hunter", "vigilante", "citizen", "godfather"];

/**
 * The SAME derivation public/app.js deriveLobbyRoster() runs, transcribed
 * here so the test is an independent check of the engine contract rather than
 * a re-import of the implementation.
 *   engine:831-832 mafia = min(mafiaCount, floor(total/3)), floored at 1
 *   engine:842-865 doctor, detective, joker, hunter, vigilante — that order
 *   engine:868-871 remainder = citizens
 */
function deriveLobbyRoster(settings: any, total: number) {
  let mafia = Math.min(Number(settings.mafiaCount), Math.floor(total / 3));
  if (!(mafia >= 1)) mafia = 1;
  let idx = Math.min(mafia, total);
  const counts: Record<string, number> = { mafia: idx };
  const take = (role: string, enabled: boolean) => {
    if (enabled && idx < total) { counts[role] = 1; idx++; }
  };
  take("doctor", settings.enableDoctor);
  take("detective", settings.enableDetective);
  take("joker", settings.enableJoker);
  take("hunter", settings.enableHunter);
  take("vigilante", settings.enableVigilante);
  counts.citizen = Math.max(0, total - idx);
  const ORDER = ["mafia", "doctor", "detective", "vigilante", "hunter", "joker", "citizen"];
  return ORDER.filter((r) => (counts[r] || 0) > 0).map((r) => ({ role: r, count: counts[r] }));
}

/** Every string value anywhere inside a message, with its key path. */
function walkStrings(v: any, path: string, out: Array<{ path: string; value: string }>): void {
  if (typeof v === "string") { out.push({ path, value: v }); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walkStrings(x, `${path}[${i}]`, out)); return; }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) walkStrings(v[k], `${path}.${k}`, out);
  }
}

describe("P3 lobby: pre-game Roles in Play (F6)", () => {
  test("lobby payloads carry the derivation inputs, predict the real roster, and leak no identities", async () => {
    // 6 players, 2 mafia, doctor + detective + hunter on: the exact shape the
    // Figma Roles card samples ("Doctor, Detective, Hunter, Joker").
    const roles: Role[] = ["mafia", "mafia", "doctor", "detective", "hunter", "citizen"];
    const port = findFreePort(3400);
    const boot = await bootServer({ port, roles });
    const clients: PlaytestClient[] = [];
    const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

    try {
      for (let i = 0; i < roles.length; i++) {
        const c = new PlaytestClient(`lobby${i}`);
        await c.connect(port);
        await c.register(`lob_${runId}_${i}`, String(1000 + i));
        clients.push(c);
      }
      const admin = clients[0];
      const code = await admin.createGame();
      for (let i = 1; i < clients.length; i++) {
        const expected = i + 1;
        const p = admin.waitMatch(
          (m) => m.type === "lobby_update" && Array.isArray(m.players) && m.players.length === expected,
          5000,
          `lobby_update(${expected})`,
        );
        await clients[i].joinGame(code);
        await p;
      }

      // Admin flips the lobby settings every client must be able to read.
      const settled = clients[clients.length - 1].waitMatch(
        (m) => m.type === "lobby_update" && m.settings?.enableHunter === true,
        5000,
        "lobby_update(hunter on)",
      );
      await admin.updateSettings({
        mafiaCount: 2,
        enableDoctor: true,
        enableDetective: true,
        enableHunter: true,
        enableJoker: false,
        enableVigilante: false,
      });
      await settled;

      // ── 1. Every client (admin AND non-admin) holds the derivation inputs.
      for (const c of clients) {
        const lu = c.lastOf("lobby_update");
        expect(lu, `${c.label} never received lobby_update`).toBeDefined();
        expect(Array.isArray(lu!.players)).toBe(true);
        expect(lu!.players.length).toBe(6);
        for (const key of ["mafiaCount", "enableDoctor", "enableDetective", "enableJoker", "enableHunter", "enableVigilante", "enableLovers", "enableGodfather", "doctorMode", "jokerMode"]) {
          expect(lu!.settings, `lobby_update.settings is missing ${key}`).toHaveProperty(key);
        }
      }

      // ── 2. The derived pre-game lineup is what the modal would render.
      const lu = clients[5].lastOf("lobby_update")!;
      const derived = deriveLobbyRoster(lu.settings, lu.players.length);
      expect(derived).toEqual([
        { role: "mafia", count: 2 },
        { role: "doctor", count: 1 },
        { role: "detective", count: 1 },
        { role: "hunter", count: 1 },
        { role: "citizen", count: 1 },
      ]);

      // ── 3. SECRECY: nothing received while in the lobby pairs a player with
      //      a role. Checked over the RAW logs, before start_game.
      const usernames = lu.players.map((p: any) => String(p.username));
      for (const c of clients) {
        for (const msg of c.log) {
          const found: Array<{ path: string; value: string }> = [];
          walkStrings(msg, msg.type, found);
          for (const { path, value } of found) {
            // A username may legitimately appear (player lists, adminName) and
            // a role word may legitimately appear (setting keys) — what must
            // NEVER happen is both inside one string, i.e. a pairing.
            const low = value.toLowerCase();
            for (const u of usernames) {
              if (!low.includes(u.toLowerCase())) continue;
              for (const w of ROLE_WORDS) {
                expect(low.includes(w), `${c.label}: ${path} pairs a player with a role: ${JSON.stringify(value)}`).toBe(false);
              }
            }
          }
          // No lobby message may carry a role field at all.
          expect(msg).not.toHaveProperty("role");
          expect(msg).not.toHaveProperty("roster");
          for (const p of (msg.players ?? [])) {
            expect(p).not.toHaveProperty("role");
            expect(p).not.toHaveProperty("isGodfather");
            expect(p).not.toHaveProperty("isLover");
          }
        }
      }

      // ── 4. The derivation matched the server's OWN roster once dealt.
      const startedPromises = clients.map((c) => c.waitFor("game_started"));
      admin.send({ type: "start_game" });
      const started = await Promise.all(startedPromises);
      expect(started[0].roster.roles).toEqual(derived);
    } finally {
      for (const c of clients) c.close();
      await boot.teardown();
    }
  }, 30000);
});
