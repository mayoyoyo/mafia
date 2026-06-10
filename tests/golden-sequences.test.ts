import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

/**
 * B0a — Golden per-client WS message-sequence tests (audit Part 4, Phase 0
 * item 1) + the minimal fixed-deal seam they require (audit D6, pulled
 * forward per P9).
 *
 * The golden harness runs a scripted multi-client game over real WebSockets
 * and records, PER CLIENT, the full ordered sequence of received messages,
 * summarized to message type + stable discriminating fields (phase names,
 * sub-phase cues, roles the client is entitled to see, seat-mapped player
 * references). Volatile values — ids, usernames, timestamps, random narrator
 * lines, random colors — are aliased or dropped, so the goldens are
 * deterministic across runs. Role secrecy is part of the golden: each seat's
 * sequence contains exactly what THAT client may see (e.g. only the mafia
 * seats carry mafiaTeam; only the detective sees detective_result), and an
 * explicit leak scan over the raw inboxes backs the goldens up.
 *
 * Golden game #1 of five: "full night with all roles enabled" —
 * lobby → fixed deal → night 1 in which every enabled role acts
 * (mafia consensus kill, doctor save elsewhere, detective investigation)
 * → dawn → day. (Joker and lovers are enabled and dealt, but an alive
 * joker has no night action and the lover pair is untouched — by design
 * for this golden; cascade/haunt nights are later goldens.)
 *
 * Message order is observable behavior: the client's hold-and-replay gate
 * lists (public/app.js:165/172/177/182) depend on it. These goldens gate
 * every subsequent refactor step in Program B.
 *
 * Port band: 18600-18999 (taken: 4567, 5567, 6567, 7600, 8600, 9600,
 * 10600, 11600, 12600; 13600-17600 reserved elsewhere).
 */

import { createGame, addPlayer, startGame, removeGame, setFixedDeal } from "../src/game-engine";
import type { Role } from "../src/types";

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 18600 + Math.floor(Math.random() * 400); // band 18600-18999
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-golden-sequences-${Date.now()}-${PORT}.db`;

// The deal for golden game #1, by JOIN ORDER (P0 = admin):
//   P0 citizen (lover) · P1 mafia · P2 mafia · P3 doctor · P4 detective ·
//   P5 joker (lover) · P6 citizen (night-1 victim) · P7 citizen
const FIXED_DEAL = {
  roles: ["citizen", "mafia", "mafia", "doctor", "detective", "joker", "citizen", "citizen"] as Role[],
  lovers: [0, 5] as [number, number],
};

const GAME_SETTINGS = {
  mafiaCount: 2,
  enableDoctor: true,
  enableDetective: true,
  enableJoker: true,
  enableLovers: true,
  doctorMode: "official",
  jokerMode: "official",
};

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: DB_PATH,
      MAFIA_FIXED_DEAL: JSON.stringify(FIXED_DEAL),
    },
    cwd: import.meta.dir + "/..",
    stdout: "ignore", stderr: "ignore",
  });
  for (let i = 0; i < 30; i++) {
    try {
      const ws = new WebSocket(WS_URL);
      await new Promise<void>((ok, fail) => {
        ws.onopen = () => { ws.close(); ok(); };
        ws.onerror = () => fail();
      });
      return;
    } catch { await Bun.sleep(200); }
  }
  throw new Error("Server failed to start");
});

afterAll(() => {
  try { serverProc?.kill(); } catch {}
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try { unlinkSync(f); } catch {}
  }
});

// ── WS harness (pattern copied from tests/rejoin-matrix-day.test.ts) ───

function waitFor(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for: ${type}`)), timeout);
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === type) { clearTimeout(t); ws.removeEventListener("message", h); resolve(m); }
    };
    ws.addEventListener("message", h);
  });
}

function waitMatch(ws: WebSocket, pred: (m: any) => boolean, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Timeout: match")), timeout);
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (pred(m)) { clearTimeout(t); ws.removeEventListener("message", h); resolve(m); }
    };
    ws.addEventListener("message", h);
  });
}

function openWS(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const t = setTimeout(() => reject(new Error("WS open timeout")), 3000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS open error")); };
  });
}

function send(ws: WebSocket, msg: any) { ws.send(JSON.stringify(msg)); }

// ── Golden recorder ─────────────────────────────────────────────────────

interface GoldenPlayer {
  ws: WebSocket;
  userId: number;
  username: string;
  seat: string;   // stable alias "P0".."P7" in join order
  inbox: any[];   // every raw message this client received, in order
}

/** Register a user with an always-on inbox recorder attached at open. */
async function regRecorded(name: string, pin: string, seat: string): Promise<GoldenPlayer> {
  const ws = await openWS();
  const inbox: any[] = [];
  ws.addEventListener("message", (e: MessageEvent) => inbox.push(JSON.parse(e.data)));
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, seat, inbox };
}

/**
 * Summarize one server message into a stable golden line: message type plus
 * stable discriminating fields only. Player references (ids, usernames —
 * volatile across runs) are seat-aliased; timestamps, narrator prose and
 * colors are dropped. Unknown message types surface verbatim so strays
 * break the golden instead of hiding.
 */
function makeSummarizer(players: GoldenPlayer[]) {
  const byName = new Map(players.map(p => [p.username, p.seat]));
  const byId = new Map(players.map(p => [p.userId, p.seat]));
  const seatName = (n: string) => byName.get(n) ?? `?name:${n}`;
  const seatId = (id: number) => byId.get(id) ?? `?id:${id}`;
  const seats = (arr: Array<{ id: number }>) => `[${arr.map(p => seatId(p.id)).join(",")}]`;

  return function summarize(m: any): string {
    switch (m.type) {
      case "registered": return "registered";
      case "game_created": return "game_created";
      case "game_joined": return `game_joined isAdmin=${m.isAdmin}`;
      case "lobby_update": return `lobby_update players=${seats(m.players)}`;
      case "settings_updated": return "settings_updated";
      case "game_started": {
        const team = m.mafiaTeam ? ` mafiaTeam=[${m.mafiaTeam.map(seatName).join(",")}]` : "";
        return `game_started role=${m.role} lover=${m.isLover} variant=${m.variant}${team}`;
      }
      case "phase_change": {
        const saved = m.saved !== undefined ? ` saved=${m.saved}` : "";
        const ev = m.events
          ? ` events=[${m.events.map((e: any) => `${e.type}:${seatName(e.playerName)}@r${e.round}`).join(",")}]`
          : "";
        return `phase_change phase=${m.phase} round=${m.round}${saved}${ev}`;
      }
      case "awaiting_ready": return "awaiting_ready";
      case "sound_cue": return `sound_cue ${m.sound}`;
      case "mafia_targets": return `mafia_targets ${seats(m.players)}`;
      case "mafia_vote_update": {
        const votes = Object.entries(m.voterTargets)
          .map(([name, vs]) => `${seatName(name)}:[${(vs as any[]).map(v => `${seatId(v.targetId)}/${v.voteType}`).join(",")}]`)
          .join(" ");
        const objected = Object.entries(m.objectedTargets)
          .map(([tid, names]) => `${seatId(Number(tid))}:[${(names as string[]).map(seatName).join(",")}]`)
          .join(" ");
        return `mafia_vote_update votes={${votes}} locked=${m.lockedTarget ? seatName(m.lockedTarget) : "-"} objected={${objected}} mafiaAlive=${m.aliveMafiaCount}`;
      }
      case "mafia_confirm_ready": return `mafia_confirm_ready target=${seatName(m.targetName)}`;
      case "night_action_done": return "night_action_done";
      case "doctor_targets":
        return `doctor_targets ${seats(m.players)} last=${m.lastDoctorTarget == null ? "-" : seatId(m.lastDoctorTarget)}`;
      case "detective_targets": return `detective_targets ${seats(m.players)}`;
      case "detective_result": return `detective_result target=${seatName(m.targetName)} isMafia=${m.isMafia}`;
      case "doctor_save_private": return "doctor_save_private";
      case "spectator_kill_confirmed": {
        const doc = m.doctorMessage == null ? "-" : (m.doctorMessage.startsWith("Doctor saved") ? "saved" : "not_saved");
        const kills = (m.kills ?? []).map((k: any) => `${seatName(k.name)}/${k.source}`).join(",");
        return `spectator_kill_confirmed kills=[${kills}] doctor=${doc}`;
      }
      case "you_died": return `you_died loverDeath=${m.isLoverDeath === true}`;
      case "player_died": return `player_died ${seatId(m.playerId)}`;
      default: return m.type; // strays show up verbatim in the golden diff
    }
  };
}

// ── Role-secrecy leak scan over raw inboxes (backs up the goldens) ──────

function deepHasKey(node: any, key: string): boolean {
  if (Array.isArray(node)) return node.some((v) => deepHasKey(v, key));
  if (node === null || typeof node !== "object") return false;
  if (key in node) return true;
  return Object.values(node).some((v) => deepHasKey(v, key));
}

/** Collect any object carrying another player's role (PlayerInfo-style leak). */
function findRoleLeaks(node: any, p: GoldenPlayer, tag: string, out: string[]): void {
  if (Array.isArray(node)) { for (const v of node) findRoleLeaks(v, p, tag, out); return; }
  if (node === null || typeof node !== "object") return;
  if (typeof node.username === "string" && node.username !== p.username && node.role != null) {
    out.push(`${tag}: role "${node.role}" of "${node.username}" leaked`);
  }
  for (const v of Object.values(node)) findRoleLeaks(v, p, tag, out);
}

const MAFIA_ONLY = new Set(["mafia_targets", "mafia_vote_update", "mafia_confirm_ready"]);

function scanSecrecy(players: GoldenPlayer[], roleOf: (seat: string) => Role): string[] {
  const violations: string[] = [];
  for (const p of players) {
    const role = roleOf(p.seat);
    for (const m of p.inbox) {
      const tag = `[${p.seat} role=${role}] msg=${m.type}`;
      if (role !== "mafia" && deepHasKey(m, "mafiaTeam")) violations.push(`${tag}: mafiaTeam leaked`);
      if (role !== "detective" && deepHasKey(m, "detectiveHistory")) violations.push(`${tag}: detectiveHistory leaked`);
      if (MAFIA_ONLY.has(m.type) && role !== "mafia") violations.push(`${tag}: mafia-only message`);
      if (m.type === "doctor_targets" && role !== "doctor") violations.push(`${tag}: doctor-only message`);
      if ((m.type === "detective_targets" || m.type === "detective_result") && role !== "detective") {
        violations.push(`${tag}: detective-only message`);
      }
      if (m.type !== "game_over") findRoleLeaks(m, p, tag, violations);
    }
  }
  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// Golden game #1: full night with all roles enabled
// ═══════════════════════════════════════════════════════════════════════

// Per-seat golden message sequences. Every line is `type` plus the stable
// discriminating fields defined by makeSummarizer above. Each seat's golden
// is exactly what THAT client is entitled to receive, in order.
const GOLDEN_GAME_1: Record<string, string[]> = {
  // P0 — admin, citizen, lover. Sees the public stream plus admin-only
  // game_created / settings_updated / awaiting_ready. No role secrets.
  P0: [
    "registered",
    "game_created",
    "lobby_update players=[P0]",
    "lobby_update players=[P0,P1]",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "settings_updated",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=citizen lover=true variant=0",
    "phase_change phase=night round=1",
    "awaiting_ready",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P1 — mafia. Only the two mafia seats carry mafiaTeam, the target list,
  // the vote-coordination stream and the confirm prompt.
  P1: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1]",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=mafia lover=false variant=0 mafiaTeam=[P1,P2]",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "mafia_targets [P0,P3,P4,P5,P6,P7]",
    "mafia_vote_update votes={P1:[P6/maybe]} locked=- objected={} mafiaAlive=2",
    "mafia_vote_update votes={P1:[P6/lock]} locked=- objected={} mafiaAlive=2",
    "mafia_vote_update votes={P1:[P6/lock] P2:[P6/maybe]} locked=- objected={} mafiaAlive=2",
    "mafia_vote_update votes={P1:[P6/lock] P2:[P6/lock]} locked=P6 objected={} mafiaAlive=2",
    "mafia_confirm_ready target=P6",
    "night_action_done",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P2 — mafia (second seat; same private stream as P1).
  P2: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=mafia lover=false variant=0 mafiaTeam=[P1,P2]",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "mafia_targets [P0,P3,P4,P5,P6,P7]",
    "mafia_vote_update votes={P1:[P6/maybe]} locked=- objected={} mafiaAlive=2",
    "mafia_vote_update votes={P1:[P6/lock]} locked=- objected={} mafiaAlive=2",
    "mafia_vote_update votes={P1:[P6/lock] P2:[P6/maybe]} locked=- objected={} mafiaAlive=2",
    "mafia_vote_update votes={P1:[P6/lock] P2:[P6/lock]} locked=P6 objected={} mafiaAlive=2",
    "mafia_confirm_ready target=P6",
    "night_action_done",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P3 — doctor. Gets the doctor prompt (all 8 alive, no prior save) and
  // their own night_action_done; nothing about other roles.
  P3: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=doctor lover=false variant=0",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "doctor_targets [P0,P1,P2,P3,P4,P5,P6,P7] last=-",
    "night_action_done",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P4 — detective. Prompt excludes self; the private detective_result
  // (P1 IS mafia) arrives at dawn, before the public death announcement.
  P4: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=detective lover=false variant=0",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "detective_targets [P0,P1,P2,P3,P5,P6,P7]",
    "night_action_done",
    "sound_cue detective_close",
    "detective_result target=P1 isMafia=true",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P5 — joker, lover. Alive joker has NO night action: stream is identical
  // to a citizen's apart from their own role/lover flags.
  P5: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=joker lover=true variant=0",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P6 — citizen, the night-1 victim. The only seat that sees you_died and
  // (being dead by resolution time) the spectator kill confirmation.
  P6: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=citizen lover=false variant=1",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "spectator_kill_confirmed kills=[P6/mafia] doctor=not_saved",
    "you_died loverDeath=false",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
  // P7 — citizen. The plain public stream: cues, the death, the day.
  P7: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6,P7]",
    "game_started role=citizen lover=false variant=2",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "sound_cue doctor_open",
    "sound_cue doctor_close",
    "sound_cue detective_open",
    "sound_cue detective_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
  ],
};

describe("golden game #1: full night with all roles enabled", () => {
  test("every client's full ordered message sequence matches its golden", async () => {
    const ts = Date.now();
    const players: GoldenPlayer[] = [];

    // ── Lobby: register P0..P7, create, join in seat order ──────────────
    for (let i = 0; i < 8; i++) {
      players.push(await regRecorded(`gs_${ts}_${i}`, String(1000 + i), `P${i}`));
    }
    const [p0, p1, p2, p3, p4, p5, p6] = players;

    send(p0.ws, { type: "create_game" });
    const created = await waitFor(p0.ws, "game_created");
    const code = created.code;
    for (let i = 1; i < 8; i++) {
      send(players[i].ws, { type: "join_game", code });
      await waitFor(players[i].ws, "game_joined");
    }

    send(p0.ws, { type: "update_settings", settings: GAME_SETTINGS });
    await waitFor(p0.ws, "settings_updated");
    await Bun.sleep(100);

    // ── Deal (fixed via the seam) + begin night ─────────────────────────
    const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
    const readyPromise = waitFor(p0.ws, "awaiting_ready");
    send(p0.ws, { type: "start_game" });
    const started = await Promise.all(startedPromises);
    await readyPromise;

    // The seam dealt exactly the fixed assignment, over the wire
    expect(started.map(s => s.role)).toEqual(FIXED_DEAL.roles);

    const mafiaTargetsPromise = waitFor(p1.ws, "mafia_targets", 8000);
    send(p0.ws, { type: "narrator_ready" });
    await mafiaTargetsPromise;

    // ── Night 1: every enabled role acts ────────────────────────────────
    // Mafia consensus on P6 (maybe → lock each, sequentially for a
    // deterministic vote_update stream), then P1 confirms the kill.
    for (const [m, voteType] of [
      [p1, "maybe"], [p1, "lock"], [p2, "maybe"],
    ] as const) {
      const updatePromise = waitFor(m.ws, "mafia_vote_update", 6000);
      send(m.ws, { type: "mafia_vote", targetId: p6.userId, voteType });
      await updatePromise;
    }
    // Final lock → consensus: both mafia get the update + the confirm prompt
    const confirmPromises = [p1, p2].map(m => waitFor(m.ws, "mafia_confirm_ready", 6000));
    send(p2.ws, { type: "mafia_vote", targetId: p6.userId, voteType: "lock" });
    await Promise.all(confirmPromises);
    const mafiaDonePromise = waitFor(p1.ws, "night_action_done", 6000);
    send(p1.ws, { type: "confirm_mafia_kill" });
    await mafiaDonePromise;

    // Doctor protects the detective (NOT the mafia target → the kill lands).
    await waitFor(p3.ws, "doctor_targets", 10000);
    const doctorDonePromise = waitFor(p3.ws, "night_action_done", 6000);
    send(p3.ws, { type: "doctor_save", targetId: p4.userId });
    await doctorDonePromise;

    // Detective investigates mafia P1 (private result arrives at dawn).
    await waitFor(p4.ws, "detective_targets", 10000);
    const detectiveDonePromise = waitFor(p4.ws, "night_action_done", 6000);
    send(p4.ws, { type: "detective_investigate", targetId: p1.userId });
    await detectiveDonePromise;

    // ── Dawn → day on every client ──────────────────────────────────────
    await Promise.all(players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 12000)));
    await Bun.sleep(300); // let any stray trailing messages land (golden would catch them)

    // ── Assert: per-client golden sequences ─────────────────────────────
    const summarize = makeSummarizer(players);
    const actual: Record<string, string[]> = {};
    for (const p of players) actual[p.seat] = p.inbox.map(summarize);
    expect(actual).toEqual(GOLDEN_GAME_1);

    // ── Assert: role-secrecy invariants over the raw inboxes ────────────
    const roleOf = (seat: string) => FIXED_DEAL.roles[Number(seat.slice(1))];
    expect(scanSecrecy(players, roleOf)).toEqual([]);

    for (const p of players) { try { p.ws.close(); } catch {} }
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// Fixed-deal seam (engine-level, audit D6/P9)
// ═══════════════════════════════════════════════════════════════════════

describe("fixed-deal seam (engine)", () => {
  test("setFixedDeal deals roles by join order, pins variants, pairs lovers from the spec", () => {
    const adminId = 900001;
    const game = createGame(adminId, "fd_admin");
    for (let i = 1; i < 8; i++) addPlayer(game, adminId + i, `fd_p${i}`);
    game.settings = {
      ...game.settings,
      mafiaCount: 2, enableDoctor: true, enableDetective: true,
      enableJoker: true, enableLovers: true,
    };

    const roles: Role[] = ["citizen", "mafia", "mafia", "doctor", "detective", "joker", "citizen", "citizen"];
    setFixedDeal({ roles, lovers: [0, 5] });
    try {
      const messages = startGame(game);
      expect(messages).not.toBeNull();
      // No "mafia count reduced" balance message: deal matches settings
      expect(messages!.length).toBe(1);

      const ids = Array.from(game.players.keys()); // join order
      expect(ids.map(id => game.players.get(id)!.role)).toEqual(roles);

      // Lovers: exactly the specified pair, linked both ways
      const p0 = game.players.get(ids[0])!;
      const p5 = game.players.get(ids[5])!;
      expect(p0.isLover).toBe(true);
      expect(p0.loverId).toBe(ids[5]);
      expect(p5.isLover).toBe(true);
      expect(p5.loverId).toBe(ids[0]);
      expect(Array.from(game.players.values()).filter(p => p.isLover).length).toBe(2);

      // Pinned art variants: mafia variant 0; citizens 0,1,2 in join order
      expect(game.mafiaVariant).toBe(0);
      const citizenVariants = ids
        .map(id => game.players.get(id)!)
        .filter(p => p.role === "citizen")
        .map(p => p.variant);
      expect(citizenVariants).toEqual([0, 1, 2]);
    } finally {
      setFixedDeal(null);
      removeGame(game.code);
    }
  });

  test("roster/deal length mismatch throws loudly instead of dealing garbage", () => {
    const game = createGame(900100, "fd_admin2");
    addPlayer(game, 900101, "fd_b1");
    addPlayer(game, 900102, "fd_b2");
    setFixedDeal({ roles: ["mafia", "citizen"] }); // 2 roles for 3 players
    try {
      expect(() => startGame(game)).toThrow();
    } finally {
      setFixedDeal(null);
      removeGame(game.code);
    }
  });

  test("seam cleared: assignment goes back to the production path", () => {
    // With the seam off, a 3-player default game deals 1 mafia + 2 citizens
    // (random order) — prove no fixed assignment leaks across games.
    const game = createGame(900200, "fd_admin3");
    addPlayer(game, 900201, "fd_c1");
    addPlayer(game, 900202, "fd_c2");
    try {
      const messages = startGame(game);
      expect(messages).not.toBeNull();
      const roles = Array.from(game.players.values()).map(p => p.role).sort();
      expect(roles).toEqual(["citizen", "citizen", "mafia"]);
    } finally {
      removeGame(game.code);
    }
  });
});
