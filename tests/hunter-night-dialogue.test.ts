import { describe, test, expect } from "bun:test";
import type { Role } from "../src/types";
import {
  type HunterServer, type HunterGame, type HunterPlayer,
  spawnServer, teardownServer, setupGame as setupGameH,
  mafiaSoloKill, killHunterAndAwaitGate, forceDawnToDay, lynchByVote,
  waitFor, waitMatch, assertSilence, send, indexOfMsg, closeAll,
} from "./helpers/ws-harness";

/**
 * Hunter NIGHT-death dialogue + revenge gating, driven over real WebSockets
 * through a 7-player fixed deal. One server process per edge case (the
 * MAFIA_FIXED_DEAL seam is process-wide), looped over the requisite cases:
 *
 *   EC1  direct night-kill  → the narrator WAKES the hunter: a
 *                             sound_cue{hunter_open} precedes the revenge
 *                             prompt and a sound_cue{hunter_close} follows the
 *                             shot (before the dawn 'day' cue). Revenge fires.
 *   EC2  heartbreak          → a hunter who dies in a lover cascade gets NO
 *                             revenge gate at all (no pending / targets) and
 *                             NO wake dialogue — the night just resolves.
 *   EC3  day-lynch           → a lynched hunter STILL takes revenge, but with
 *                             NO wake dialogue (eyes are already open by day).
 *   EC4  no timer            → the revenge gate never auto-resolves; it stays
 *                             open indefinitely (only the hunter or the admin
 *                             force-skip closes it). The MAFIA_REVENGE_TIMER_MS
 *                             seam is set deliberately short to prove the
 *                             timer is gone — the gate must survive it.
 *
 * Port band 26600-26999 (taken elsewhere: 22600-22999 hunter-ws-night,
 * 23600-23999 hunter-ws-vote, 24600-24999 hunter-ws-rejoin, 25600-25999).
 *
 * 7-seat join order (= fixed-deal index): P0 citizen (admin), P1 mafia,
 * P2 hunter, P3-P6 citizens.
 */

const PORT_BASE = 26600 + Math.floor(Math.random() * 90); // distinct port per edge case via +index*4
const DEAL: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen", "citizen"];
const SETTINGS_BASE = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: false,
};

// Seat indices into the deal (join order)
const ADMIN = 0, MAFIA = 1, HUNTER = 2, C3 = 3, C4 = 4, C5 = 5, C6 = 6;

const isOpenCue = (m: any) => m.type === "sound_cue" && m.sound === "hunter_open";
const isCloseCue = (m: any) => m.type === "sound_cue" && m.sound === "hunter_close";
const isDayCue = (m: any) => m.type === "sound_cue" && m.sound === "day";

interface EdgeCase {
  name: string;
  lovers?: [number, number];
  extraEnv?: Record<string, string>;
  run: (game: HunterGame, srv: HunterServer) => Promise<void>;
}

const EDGE_CASES: EdgeCase[] = [
  {
    name: "EC1 direct night-kill: wake cue before prompt, close cue after the shot, revenge fires",
    run: async (game) => {
      const admin = game.players[ADMIN];
      const hunter = game.players[HUNTER];
      const victim = game.players[C3];

      await killHunterAndAwaitGate(game); // mafia kills the hunter, gate opens

      // The hunter is WOKEN: a hunter_open cue arrives, before the prompt.
      const openIdx = indexOfMsg(hunter.inbox, isOpenCue);
      const targetsIdx = indexOfMsg(hunter.inbox, (m) => m.type === "hunter_revenge_targets");
      expect(openIdx).toBeGreaterThanOrEqual(0);
      expect(targetsIdx).toBeGreaterThan(openIdx);

      // It is a ROOM cue (narrator audio for the whole table), not hunter-only.
      expect(indexOfMsg(admin.inbox, isOpenCue)).toBeGreaterThanOrEqual(0);

      // ── Revenge: hunter shoots a citizen; game continues to a held dawn ──
      const dayP = waitMatch(admin.ws, (m) => m.type === "phase_change" && m.phase === "day", 6000, "held dawn");
      send(hunter.ws, { type: "hunter_revenge", targetId: victim.userId });
      await dayP;
      await Bun.sleep(200);

      // The hunter is told to CLOSE again — after the shot, before the day cue.
      const closeIdx = indexOfMsg(hunter.inbox, isCloseCue);
      const dayCueIdx = indexOfMsg(hunter.inbox, isDayCue);
      expect(closeIdx).toBeGreaterThan(targetsIdx);
      expect(dayCueIdx).toBeGreaterThan(closeIdx);
      // The revenge landed.
      expect(indexOfMsg(admin.inbox, (m) => m.type === "player_died" && m.playerId === victim.userId)).toBeGreaterThanOrEqual(0);
    },
  },
  {
    name: "EC2 heartbreak: a lover-cascade hunter death opens NO revenge gate and plays NO wake cue",
    lovers: [HUNTER, C3], // the hunter and a citizen are lovers
    run: async (game) => {
      const admin = game.players[ADMIN];
      const hunter = game.players[HUNTER];
      const lover = game.players[C3];

      // Mafia kills the hunter's LOVER; the hunter dies of heartbreak (cascade).
      const hunterDiedP = waitFor(hunter.ws, "you_died", 8000);
      await mafiaSoloKill(game.players[MAFIA], lover);
      const hunterDied = await hunterDiedP;
      expect(hunterDied.isLoverDeath).toBe(true); // died as a lover, not a direct target

      await Bun.sleep(500); // let any (erroneous) revenge gate broadcast settle

      // No revenge gate for a heartbreak death — and no wake dialogue.
      expect(admin.inbox.find((m) => m.type === "hunter_revenge_pending")).toBeUndefined();
      expect(hunter.inbox.find((m) => m.type === "hunter_revenge_targets")).toBeUndefined();
      expect(hunter.inbox.find(isOpenCue)).toBeUndefined();

      // The night resolved straight to dawn — no gate held it.
      expect(admin.inbox.find((m) => m.type === "phase_change" && m.phase === "day")).toBeDefined();
    },
  },
  {
    name: "EC3 day-lynch: a lynched hunter still takes revenge, but with NO wake cue (eyes already open)",
    run: async (game) => {
      const admin = game.players[ADMIN];
      const hunter = game.players[HUNTER];
      const victim = game.players[C3];

      await forceDawnToDay(game); // skip night 1, everyone alive
      const pendingP = waitMatch(admin.ws, (m) => m.type === "hunter_revenge_pending", 8000, "lynch gate");
      await lynchByVote(game, hunter, game.players); // all alive approve the lynch
      await pendingP;
      await Bun.sleep(200);

      // Revenge gate DID open (a lynched hunter shoots)...
      expect(hunter.inbox.find((m) => m.type === "hunter_revenge_targets")).toBeDefined();
      // ...but there is NO wake dialogue — the table's eyes are open by day.
      expect(hunter.inbox.find(isOpenCue)).toBeUndefined();
      expect(hunter.inbox.find(isCloseCue)).toBeUndefined();

      // And the shot still resolves.
      const victimDied = waitMatch(admin.ws, (m) => m.type === "player_died" && m.playerId === victim.userId, 6000, "lynch revenge");
      send(hunter.ws, { type: "hunter_revenge", targetId: victim.userId });
      await victimDied;
    },
  },
  {
    name: "EC4 no timer: the gate never auto-resolves — it survives well past the (removed) timeout seam",
    extraEnv: { MAFIA_REVENGE_TIMER_MS: "250" },
    run: async (game) => {
      const admin = game.players[ADMIN];
      const hunter = game.players[HUNTER];
      const victim = game.players[C3];

      await killHunterAndAwaitGate(game);

      // Wait well past the would-be 250ms timeout: a live timer would fire a
      // decline (a deferred phase_change to day). With the timer removed, the
      // gate just stays open and the dawn stays held.
      await assertSilence(admin.ws, ["phase_change", "game_over"], 1200);

      // The gate is still open: the hunter can still take the shot.
      const victimDied = waitMatch(admin.ws, (m) => m.type === "player_died" && m.playerId === victim.userId, 6000, "post-wait kill");
      const dayP = waitMatch(admin.ws, (m) => m.type === "phase_change" && m.phase === "day", 6000, "post-wait dawn");
      send(hunter.ws, { type: "hunter_revenge", targetId: victim.userId });
      await victimDied;
      await dayP;
    },
  },
];

describe("Hunter night-death dialogue + revenge gating (7-player)", () => {
  EDGE_CASES.forEach((ec, i) => {
    test(ec.name, async () => {
      const port = PORT_BASE + i * 4;
      const srv = await spawnServer(port, `HND${i}`, "hnd", DEAL, {
        ...(ec.lovers ? { lovers: ec.lovers } : {}),
        ...(ec.extraEnv ? { extraEnv: ec.extraEnv } : {}),
      });
      try {
        const settings = { ...SETTINGS_BASE, enableLovers: !!ec.lovers };
        const game = await setupGameH(srv, { prefix: "hnd", dealRoles: DEAL, settings });
        await ec.run(game, srv);
        closeAll(game);
      } finally {
        teardownServer(srv);
      }
    }, 60000);
  });
});
