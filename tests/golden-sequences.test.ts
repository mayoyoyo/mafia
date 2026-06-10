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
 * Golden games (of five planned):
 *   #1 "full night with all roles enabled" — lobby → fixed deal → night 1 in
 *      which every enabled role acts (mafia consensus kill, doctor save
 *      elsewhere, detective investigation) → dawn → day. (Joker and lovers
 *      are enabled and dealt, but an alive joker has no night action and the
 *      lover pair is untouched — by design for this golden.)
 *   #2 "joker-execute → haunt night (OFFICIAL joker mode)" — night-1 kill →
 *      day vote executes the joker (joint winner, official mode) → the haunt
 *      night: joker silently picks a yes-voter in parallel with the mafia
 *      kill → both deaths resolve at dawn → day 2.
 *   #3 "spared vote" — day vote ties (strictly->50% rule) → target SPARED →
 *      the game STAYS IN DAY (current behavior: a fresh phase_change
 *      phase=day with a `spared` event; no auto-night).
 *
 * Each golden game runs against its OWN server subprocess (own port, own
 * /tmp database, own MAFIA_FIXED_DEAL env) — the fixed-deal seam is
 * one-deal-per-process, so per-game servers need no engine changes.
 *
 * Message order is observable behavior: the client's hold-and-replay gate
 * lists (public/app.js:165/172/177/182) depend on it. These goldens gate
 * every subsequent refactor step in Program B.
 *
 * Port band: 18600-18999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved).
 * Sub-bands: game #1 18600-18729, game #2 18730-18859, game #3 18860-18999.
 */

import { createGame, addPlayer, startGame, removeGame, setFixedDeal } from "../src/game-engine";
import type { FixedDeal } from "../src/game-engine";
import type { Role } from "../src/types";

const PORT_GAME_1 = 18600 + Math.floor(Math.random() * 130); // 18600-18729
const PORT_GAME_2 = 18730 + Math.floor(Math.random() * 130); // 18730-18859
const PORT_GAME_3 = 18860 + Math.floor(Math.random() * 140); // 18860-18999

// ── Per-game server subprocess ──────────────────────────────────────────

interface GoldenServer {
  proc: ReturnType<typeof Bun.spawn>;
  wsUrl: string;
  dbPath: string;
}

async function spawnGoldenServer(port: number, fixedDeal: FixedDeal): Promise<GoldenServer> {
  const wsUrl = `ws://localhost:${port}/ws`;
  const dbPath = `/tmp/mafia-golden-sequences-${Date.now()}-${port}.db`;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      MAFIA_FIXED_DEAL: JSON.stringify(fixedDeal),
    },
    cwd: import.meta.dir + "/..",
    stdout: "ignore", stderr: "ignore",
  });
  for (let i = 0; i < 30; i++) {
    try {
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((ok, fail) => {
        ws.onopen = () => { ws.close(); ok(); };
        ws.onerror = () => fail();
      });
      return { proc, wsUrl, dbPath };
    } catch { await Bun.sleep(200); }
  }
  try { proc.kill(); } catch {}
  throw new Error(`Golden server failed to start on port ${port}`);
}

function stopGoldenServer(srv: GoldenServer | null): void {
  if (!srv) return;
  try { srv.proc.kill(); } catch {}
  for (const f of [srv.dbPath, `${srv.dbPath}-wal`, `${srv.dbPath}-shm`]) {
    try { unlinkSync(f); } catch {}
  }
}

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

function waitMatch(ws: WebSocket, pred: (m: any) => boolean, timeout = 5000, label = "match"): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeout);
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (pred(m)) { clearTimeout(t); ws.removeEventListener("message", h); resolve(m); }
    };
    ws.addEventListener("message", h);
  });
}

function openWS(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
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
  seat: string;   // stable alias "P0".."Pn" in join order
  inbox: any[];   // every raw message this client received, in order
}

/** Register a user with an always-on inbox recorder attached at open. */
async function regRecorded(wsUrl: string, name: string, pin: string, seat: string): Promise<GoldenPlayer> {
  const ws = await openWS(wsUrl);
  const inbox: any[] = [];
  ws.addEventListener("message", (e: MessageEvent) => inbox.push(JSON.parse(e.data)));
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, seat, inbox };
}

/**
 * Shared lobby script: register one recorded client per deal seat, create
 * the game on P0, join P1..Pn-1 in seat order, apply settings, start, and
 * assert the seam dealt exactly the fixed assignment over the wire. Returns
 * with the game in night 1, admin holding the "Begin Night" gate
 * (awaiting_ready received, narrator_ready NOT yet sent).
 */
async function setupGoldenGame(
  wsUrl: string, prefix: string, deal: FixedDeal, settings: Record<string, unknown>,
): Promise<GoldenPlayer[]> {
  const n = deal.roles.length;
  const ts = Date.now();
  const players: GoldenPlayer[] = [];
  for (let i = 0; i < n; i++) {
    players.push(await regRecorded(wsUrl, `${prefix}_${ts}_${i}`, String(1000 + i), `P${i}`));
  }
  const p0 = players[0];

  send(p0.ws, { type: "create_game" });
  const created = await waitFor(p0.ws, "game_created");
  for (let i = 1; i < n; i++) {
    send(players[i].ws, { type: "join_game", code: created.code });
    await waitFor(players[i].ws, "game_joined");
  }

  send(p0.ws, { type: "update_settings", settings });
  await waitFor(p0.ws, "settings_updated");
  // No sleep needed here: the server handles messages sequentially, so the
  // settings lobby_update is queued on every socket before start_game is
  // even read — per-socket FIFO delivery keeps the golden order.

  const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
  const readyPromise = waitFor(p0.ws, "awaiting_ready");
  send(p0.ws, { type: "start_game" });
  const started = await Promise.all(startedPromises);
  await readyPromise;

  // The seam dealt exactly the fixed assignment, over the wire
  expect(started.map(s => s.role)).toEqual(deal.roles);
  return players;
}

/** Single-mafia night kill: maybe → lock (consensus of one) → confirm. */
async function mafiaSoloKill(mafia: GoldenPlayer, target: GoldenPlayer): Promise<void> {
  const maybeUpdate = waitFor(mafia.ws, "mafia_vote_update", 6000);
  send(mafia.ws, { type: "mafia_vote", targetId: target.userId, voteType: "maybe" });
  await maybeUpdate;
  const confirmReady = waitFor(mafia.ws, "mafia_confirm_ready", 6000);
  send(mafia.ws, { type: "mafia_vote", targetId: target.userId, voteType: "lock" });
  await confirmReady;
  const done = waitFor(mafia.ws, "night_action_done", 6000);
  send(mafia.ws, { type: "confirm_mafia_kill" });
  await done;
}

/** Cast one day vote and wait for its vote_update broadcast on `observer`. */
async function castAndSee(voter: GoldenPlayer, approve: boolean, observer: GoldenPlayer): Promise<void> {
  const update = waitFor(observer.ws, "vote_update", 6000);
  send(voter.ws, { type: "cast_vote", approve });
  await update;
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

  // Shared by mafia_vote_update (mafia-only) and spectator_mafia_update
  // (dead players' live view of the same vote state).
  const mafiaStatus = (m: any) => {
    const votes = Object.entries(m.voterTargets)
      .map(([name, vs]) => `${seatName(name)}:[${(vs as any[]).map(v => `${seatId(v.targetId)}/${v.voteType}`).join(",")}]`)
      .join(" ");
    const objected = Object.entries(m.objectedTargets)
      .map(([tid, names]) => `${seatId(Number(tid))}:[${(names as string[]).map(seatName).join(",")}]`)
      .join(" ");
    return `votes={${votes}} locked=${m.lockedTarget ? seatName(m.lockedTarget) : "-"} objected={${objected}} mafiaAlive=${m.aliveMafiaCount}`;
  };

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
      case "mafia_vote_update": return `mafia_vote_update ${mafiaStatus(m)}`;
      case "spectator_mafia_update": return `spectator_mafia_update ${mafiaStatus(m)} targets=${seats(m.targets)}`;
      case "mafia_confirm_ready": return `mafia_confirm_ready target=${seatName(m.targetName)}`;
      case "night_action_done": return "night_action_done";
      case "doctor_targets":
        return `doctor_targets ${seats(m.players)} last=${m.lastDoctorTarget == null ? "-" : seatId(m.lastDoctorTarget)}`;
      case "detective_targets": return `detective_targets ${seats(m.players)}`;
      case "detective_result": return `detective_result target=${seatName(m.targetName)} isMafia=${m.isMafia}`;
      case "doctor_save_private": return "doctor_save_private";
      case "spectator_kill_confirmed": {
        // NB: couples to server prose — resolveNightAndTransition (src/server.ts)
        // builds doctorMessage as "Doctor saved <name>" / "Doctor was not able
        // to save <name>". If that string changes, this branch (and the
        // goldens) must change with it.
        const doc = m.doctorMessage == null ? "-" : (m.doctorMessage.startsWith("Doctor saved") ? "saved" : "not_saved");
        const kills = (m.kills ?? []).map((k: any) => `${seatName(k.name)}/${k.source}`).join(",");
        return `spectator_kill_confirmed kills=[${kills}] doctor=${doc}`;
      }
      case "spectator_night_complete":
        return `spectator_night_complete phase=${m.phase} target=${m.targetName == null ? "-" : seatName(m.targetName)} alive=${m.alive}`;
      case "spectator_joker_deliberating": return "spectator_joker_deliberating";
      case "spectator_joker_resolved": return `spectator_joker_resolved target=${seatName(m.targetName)}`;
      case "joker_haunt_targets": return `joker_haunt_targets ${seats(m.players)}`;
      case "joker_win_overlay": return `joker_win_overlay ${seatName(m.jokerName)}`;
      case "vote_called": return `vote_called target=${seatName(m.targetName)}`;
      case "vote_update": return `vote_update ${m.totalVotes}/${m.total}`;
      // M12: vote_result intentionally carries no tallies (see scanSecrecy)
      case "vote_result": return `vote_result target=${seatName(m.targetName)} executed=${m.executed}`;
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
const JOKER_ONLY = new Set(["joker_haunt_targets", "joker_win_overlay"]);

function scanSecrecy(players: GoldenPlayer[], roleOf: (seat: string) => Role): string[] {
  const violations: string[] = [];
  for (const p of players) {
    const role = roleOf(p.seat);
    for (const m of p.inbox) {
      const tag = `[${p.seat} role=${role}] msg=${m.type}`;
      if (role !== "mafia" && deepHasKey(m, "mafiaTeam")) violations.push(`${tag}: mafiaTeam leaked`);
      if (role !== "detective" && deepHasKey(m, "detectiveHistory")) violations.push(`${tag}: detectiveHistory leaked`);
      if (MAFIA_ONLY.has(m.type) && role !== "mafia") violations.push(`${tag}: mafia-only message`);
      if (JOKER_ONLY.has(m.type) && role !== "joker") violations.push(`${tag}: joker-only message`);
      if (m.type === "doctor_targets" && role !== "doctor") violations.push(`${tag}: doctor-only message`);
      if ((m.type === "detective_targets" || m.type === "detective_result") && role !== "detective") {
        violations.push(`${tag}: detective-only message`);
      }
      // M12: exact day-vote tallies are never broadcast (they de-anonymize
      // voters in small games)
      if (m.type === "vote_result" && (deepHasKey(m, "votesFor") || deepHasKey(m, "votesAgainst"))) {
        violations.push(`${tag}: vote tallies leaked (M12)`);
      }
      if (m.type !== "game_over") findRoleLeaks(m, p, tag, violations);
    }
  }
  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// Golden game #1: full night with all roles enabled
// ═══════════════════════════════════════════════════════════════════════

// The deal for golden game #1, by JOIN ORDER (P0 = admin):
//   P0 citizen (lover) · P1 mafia · P2 mafia · P3 doctor · P4 detective ·
//   P5 joker (lover) · P6 citizen (night-1 victim) · P7 citizen
const FIXED_DEAL_1: FixedDeal = {
  roles: ["citizen", "mafia", "mafia", "doctor", "detective", "joker", "citizen", "citizen"],
  lovers: [0, 5],
};

const GAME_SETTINGS_1 = {
  mafiaCount: 2,
  enableDoctor: true,
  enableDetective: true,
  enableJoker: true,
  enableLovers: true,
  doctorMode: "official",
  jokerMode: "official",
};

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
  let srv: GoldenServer | null = null;
  beforeAll(async () => { srv = await spawnGoldenServer(PORT_GAME_1, FIXED_DEAL_1); });
  afterAll(() => stopGoldenServer(srv));

  test("every client's full ordered message sequence matches its golden", async () => {
    const players = await setupGoldenGame(srv!.wsUrl, "g1", FIXED_DEAL_1, GAME_SETTINGS_1);
    // p5 (joker — alive jokers have no night action) and p7 (citizen) need
    // no handles: they only receive the public stream.
    const [p0, p1, p2, p3, p4, , p6] = players;

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
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 12000,
        `${p.seat} day phase_change`)));
    await Bun.sleep(300); // let any stray trailing messages land (golden would catch them)

    // ── Assert: per-client golden sequences ─────────────────────────────
    const summarize = makeSummarizer(players);
    const actual: Record<string, string[]> = {};
    for (const p of players) actual[p.seat] = p.inbox.map(summarize);
    if (process.env.GOLDEN_DUMP) console.log(JSON.stringify(actual, null, 2));
    expect(actual).toEqual(GOLDEN_GAME_1);

    // ── Assert: role-secrecy invariants over the raw inboxes ────────────
    const roleOf = (seat: string) => FIXED_DEAL_1.roles[Number(seat.slice(1))];
    expect(scanSecrecy(players, roleOf)).toEqual([]);

    for (const p of players) { try { p.ws.close(); } catch {} }
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// Golden game #2: joker executed by day vote → haunt night (OFFICIAL mode)
// ═══════════════════════════════════════════════════════════════════════

// The deal for golden game #2, by JOIN ORDER (P0 = admin):
//   P0 citizen · P1 mafia · P2 joker · P3 citizen · P4 citizen (haunt
//   victim) · P5 citizen (night-2 mafia victim) · P6 citizen (night-1 victim)
const FIXED_DEAL_2: FixedDeal = {
  roles: ["citizen", "mafia", "joker", "citizen", "citizen", "citizen", "citizen"],
};

const GAME_SETTINGS_2 = {
  mafiaCount: 1,
  enableDoctor: false,
  enableDetective: false,
  enableJoker: true,
  enableLovers: false,
  doctorMode: "official",
  jokerMode: "official", // OFFICIAL: execution → joint winner + haunt night
};

// Script: night 1 mafia kills P6 → day 1 vote on the joker P2 (yes: P0, P1,
// P3, P4 / no: P2, P5 → executed; the four yes-voters become the haunt
// list) → auto-night 2 where the dead joker silently haunts P4 while the
// mafia kills P5 → dawn resolves BOTH deaths (mafia kill first, then the
// haunt) → day 2.
const GOLDEN_GAME_2: Record<string, string[]> = {
  // P0 — admin, citizen, yes-voter. Public stream + admin-only messages.
  // Note the haunt night is silent for the living: night 2 looks exactly
  // like night 1 until the dawn announcements.
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
    "settings_updated",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=citizen lover=false variant=0",
    "phase_change phase=night round=1",
    "awaiting_ready",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P5",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
  // P1 — mafia (solo), yes-voter. Carries the mafia stream in BOTH nights;
  // a single mafia's lock is instant consensus.
  P1: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1]",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=mafia lover=false variant=0 mafiaTeam=[P1]",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "mafia_targets [P0,P2,P3,P4,P5,P6]",
    "mafia_vote_update votes={P1:[P6/maybe]} locked=- objected={} mafiaAlive=1",
    "mafia_vote_update votes={P1:[P6/lock]} locked=P6 objected={} mafiaAlive=1",
    "mafia_confirm_ready target=P6",
    "night_action_done",
    "sound_cue mafia_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "mafia_targets [P0,P3,P4,P5]",
    "mafia_vote_update votes={P1:[P5/maybe]} locked=- objected={} mafiaAlive=1",
    "mafia_vote_update votes={P1:[P5/lock]} locked=P5 objected={} mafiaAlive=1",
    "mafia_confirm_ready target=P5",
    "night_action_done",
    "sound_cue mafia_close",
    "player_died P5",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
  // P2 — joker. After execution: private joker_win_overlay (official mode —
  // the game continues), then in night 2 the private haunt prompt listing
  // exactly the four yes-voters, and night_action_done once the haunt is
  // submitted. The haunting joker is EXCLUDED from the dead-spectator
  // stream (no spectator_* messages here).
  P2: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=joker lover=false variant=0",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "joker_win_overlay P2",
    "you_died loverDeath=false",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "joker_haunt_targets [P0,P1,P3,P4]",
    "night_action_done",
    "sound_cue mafia_close",
    "player_died P5",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
  // P3 — citizen, yes-voter, survives. Plain public stream throughout.
  P3: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=citizen lover=false variant=1",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P5",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
  // P4 — citizen, yes-voter, the HAUNT victim. Dies at night-2 dawn: the
  // spectator kill panel arrives first (they are dead by send time), then
  // the mafia victim's public death, then their own you_died.
  P4: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=citizen lover=false variant=2",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "spectator_kill_confirmed kills=[P5/mafia,P4/joker_haunt] doctor=-",
    "player_died P5",
    "you_died loverDeath=false",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
  // P5 — citizen, no-voter, the night-2 MAFIA victim. Their you_died comes
  // before P4's haunt death announcement (mafia kill resolves first).
  P5: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4,P5]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=citizen lover=false variant=3",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "spectator_kill_confirmed kills=[P5/mafia,P4/joker_haunt] doctor=-",
    "you_died loverDeath=false",
    "player_died P5",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
  // P6 — citizen, the night-1 victim → the only plain spectator during the
  // haunt night. Sees the dead-player stream: the live mafia vote state,
  // "joker is deliberating", the joker's pick, the mafia sub-phase result,
  // and the combined kill confirmation. The living see none of this.
  P6: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "lobby_update players=[P0,P1,P2,P3,P4,P5,P6]",
    "game_started role=citizen lover=false variant=4",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "spectator_kill_confirmed kills=[P6/mafia] doctor=-",
    "you_died loverDeath=false",
    "player_died P6",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P6@r1]",
    "vote_called target=P2",
    "vote_update 1/6",
    "vote_update 2/6",
    "vote_update 3/6",
    "vote_update 4/6",
    "vote_update 5/6",
    "vote_update 6/6",
    "vote_result target=P2 executed=true",
    "player_died P2",
    "phase_change phase=night round=2 events=[kill:P6@r1,execution:P2@r1]",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "spectator_mafia_update votes={} locked=- objected={} mafiaAlive=1 targets=[P0,P3,P4,P5]",
    "spectator_joker_deliberating",
    "spectator_joker_resolved target=P4",
    "spectator_mafia_update votes={P1:[P5/maybe]} locked=- objected={} mafiaAlive=1 targets=[P0,P3,P4,P5]",
    "spectator_mafia_update votes={P1:[P5/lock]} locked=P5 objected={} mafiaAlive=1 targets=[P0,P3,P4,P5]",
    "spectator_night_complete phase=mafia target=P5 alive=true",
    "sound_cue mafia_close",
    "spectator_kill_confirmed kills=[P5/mafia,P4/joker_haunt] doctor=-",
    "player_died P5",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=2 saved=false events=[kill:P6@r1,execution:P2@r1,kill:P5@r2,joker_haunt:P4@r2]",
  ],
};

describe("golden game #2: joker-execute → haunt night (official joker mode)", () => {
  let srv: GoldenServer | null = null;
  beforeAll(async () => { srv = await spawnGoldenServer(PORT_GAME_2, FIXED_DEAL_2); });
  afterAll(() => stopGoldenServer(srv));

  test("every client's full ordered message sequence matches its golden", async () => {
    const players = await setupGoldenGame(srv!.wsUrl, "g2", FIXED_DEAL_2, GAME_SETTINGS_2);
    const [p0, p1, p2, p3, p4, p5, p6] = players;

    // ── Night 1: solo mafia kills P6 (doctor/detective disabled) ────────
    const mafiaTargetsPromise = waitFor(p1.ws, "mafia_targets", 8000);
    send(p0.ws, { type: "narrator_ready" });
    await mafiaTargetsPromise;
    await mafiaSoloKill(p1, p6);

    await Promise.all(players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 12000,
        `${p.seat} day-1 phase_change`)));

    // ── Day 1: admin calls the vote on the JOKER ────────────────────────
    const voteCalledPromise = waitFor(p0.ws, "vote_called", 6000);
    send(p0.ws, { type: "call_vote", targetId: p2.userId });
    await voteCalledPromise;

    // Cast in seat order: yes from P0,P1,P3,P4; no from P2,P5 → 4/2
    // executed. The yes-voters (in cast order) become the haunt list.
    await castAndSee(p0, true, p0);
    await castAndSee(p1, true, p0);
    await castAndSee(p2, false, p0);
    await castAndSee(p3, true, p0);
    await castAndSee(p4, true, p0);
    // Final vote resolves: joker executed → official mode auto-night with
    // the haunt active. Catch the transition + both private night prompts.
    const night2Promises = players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "night" && m.round === 2, 8000,
        `${p.seat} night-2 phase_change`));
    const hauntTargetsPromise = waitFor(p2.ws, "joker_haunt_targets", 8000);
    const mafiaTargets2Promise = waitFor(p1.ws, "mafia_targets", 8000);
    await castAndSee(p5, false, p0);
    await Promise.all([...night2Promises, hauntTargetsPromise, mafiaTargets2Promise]);

    // ── Night 2 (haunt night): joker haunts P4, then mafia kills P5 ─────
    // The haunt is a parallel action with no sub-phase of its own; submit
    // it BEFORE the mafia confirm so it is locked in when night resolves.
    const hauntDonePromise = waitFor(p2.ws, "night_action_done", 6000);
    send(p2.ws, { type: "joker_haunt", targetId: p4.userId });
    await hauntDonePromise;
    await mafiaSoloKill(p1, p5);

    // ── Dawn 2: both deaths resolve (mafia kill first, then the haunt) ──
    await Promise.all(players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 12000,
        `${p.seat} day-2 phase_change`)));
    await Bun.sleep(300); // let any stray trailing messages land (golden would catch them)

    // ── Assert: per-client golden sequences ─────────────────────────────
    const summarize = makeSummarizer(players);
    const actual: Record<string, string[]> = {};
    for (const p of players) actual[p.seat] = p.inbox.map(summarize);
    if (process.env.GOLDEN_DUMP) console.log(JSON.stringify(actual, null, 2));
    expect(actual).toEqual(GOLDEN_GAME_2);

    // ── Assert: role-secrecy invariants over the raw inboxes ────────────
    const roleOf = (seat: string) => FIXED_DEAL_2.roles[Number(seat.slice(1))];
    expect(scanSecrecy(players, roleOf)).toEqual([]);

    for (const p of players) { try { p.ws.close(); } catch {} }
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// Golden game #3: day vote resolves to SPARED → day continues
// ═══════════════════════════════════════════════════════════════════════

// The deal for golden game #3, by JOIN ORDER (P0 = admin):
//   P0 citizen · P1 mafia (the accused — spared) · P2 citizen · P3 citizen ·
//   P4 citizen (night-1 victim)
const FIXED_DEAL_3: FixedDeal = {
  roles: ["citizen", "mafia", "citizen", "citizen", "citizen"],
};

const GAME_SETTINGS_3 = {
  mafiaCount: 1,
  enableDoctor: false,
  enableDetective: false,
  enableJoker: false,
  enableLovers: false,
  doctorMode: "official",
  jokerMode: "official",
};

// Script: night 1 mafia kills P4 → day 1 vote on the mafia P1 ties 2-2
// (yes: P0, P2 / no: P1, P3; execution needs strictly >50%) → P1 is SPARED.
// CURRENT BEHAVIOR (pinned, not judged): the game STAYS IN DAY — the server
// rebroadcasts phase_change phase=day round=1 with empty messages, no
// `saved` field, no day sound cue, and a `spared` event appended. No
// auto-night, no further messages.
const GOLDEN_GAME_3: Record<string, string[]> = {
  // P0 — admin, citizen. Public stream + admin-only messages.
  P0: [
    "registered",
    "game_created",
    "lobby_update players=[P0]",
    "lobby_update players=[P0,P1]",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "settings_updated",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "game_started role=citizen lover=false variant=0",
    "phase_change phase=night round=1",
    "awaiting_ready",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P4@r1]",
    "vote_called target=P1",
    "vote_update 1/4",
    "vote_update 2/4",
    "vote_update 3/4",
    "vote_update 4/4",
    "vote_result target=P1 executed=false",
    "phase_change phase=day round=1 events=[kill:P4@r1,spared:P1@r1]",
  ],
  // P1 — mafia, the accused. Survives the vote; no you_died, no death
  // broadcast — just the same public spared sequence as everyone else.
  P1: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1]",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "game_started role=mafia lover=false variant=0 mafiaTeam=[P1]",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "mafia_targets [P0,P2,P3,P4]",
    "mafia_vote_update votes={P1:[P4/maybe]} locked=- objected={} mafiaAlive=1",
    "mafia_vote_update votes={P1:[P4/lock]} locked=P4 objected={} mafiaAlive=1",
    "mafia_confirm_ready target=P4",
    "night_action_done",
    "sound_cue mafia_close",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P4@r1]",
    "vote_called target=P1",
    "vote_update 1/4",
    "vote_update 2/4",
    "vote_update 3/4",
    "vote_update 4/4",
    "vote_result target=P1 executed=false",
    "phase_change phase=day round=1 events=[kill:P4@r1,spared:P1@r1]",
  ],
  // P2 — citizen, yes-voter. Plain public stream.
  P2: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2]",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "game_started role=citizen lover=false variant=1",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P4@r1]",
    "vote_called target=P1",
    "vote_update 1/4",
    "vote_update 2/4",
    "vote_update 3/4",
    "vote_update 4/4",
    "vote_result target=P1 executed=false",
    "phase_change phase=day round=1 events=[kill:P4@r1,spared:P1@r1]",
  ],
  // P3 — citizen, no-voter. Plain public stream.
  P3: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "game_started role=citizen lover=false variant=2",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P4@r1]",
    "vote_called target=P1",
    "vote_update 1/4",
    "vote_update 2/4",
    "vote_update 3/4",
    "vote_update 4/4",
    "vote_result target=P1 executed=false",
    "phase_change phase=day round=1 events=[kill:P4@r1,spared:P1@r1]",
  ],
  // P4 — citizen, the night-1 victim. Dead spectators still receive the
  // whole public vote stream (call, progress, result, the spared day).
  P4: [
    "registered",
    "game_joined isAdmin=false",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "lobby_update players=[P0,P1,P2,P3,P4]",
    "game_started role=citizen lover=false variant=3",
    "phase_change phase=night round=1",
    "sound_cue night",
    "sound_cue everyone_close",
    "sound_cue mafia_open",
    "sound_cue mafia_close",
    "spectator_kill_confirmed kills=[P4/mafia] doctor=-",
    "you_died loverDeath=false",
    "player_died P4",
    "sound_cue day",
    "phase_change phase=day round=1 saved=false events=[kill:P4@r1]",
    "vote_called target=P1",
    "vote_update 1/4",
    "vote_update 2/4",
    "vote_update 3/4",
    "vote_update 4/4",
    "vote_result target=P1 executed=false",
    "phase_change phase=day round=1 events=[kill:P4@r1,spared:P1@r1]",
  ],
};

describe("golden game #3: spared day vote → day continues", () => {
  let srv: GoldenServer | null = null;
  beforeAll(async () => { srv = await spawnGoldenServer(PORT_GAME_3, FIXED_DEAL_3); });
  afterAll(() => stopGoldenServer(srv));

  test("every client's full ordered message sequence matches its golden", async () => {
    const players = await setupGoldenGame(srv!.wsUrl, "g3", FIXED_DEAL_3, GAME_SETTINGS_3);
    const [p0, p1, p2, p3, p4] = players;

    // ── Night 1: solo mafia kills P4 (doctor/detective disabled) ────────
    const mafiaTargetsPromise = waitFor(p1.ws, "mafia_targets", 8000);
    send(p0.ws, { type: "narrator_ready" });
    await mafiaTargetsPromise;
    await mafiaSoloKill(p1, p4);

    await Promise.all(players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 12000,
        `${p.seat} day phase_change`)));

    // ── Day 1: admin calls the vote on mafia P1; it ties 2-2 → SPARED ───
    const voteCalledPromise = waitFor(p0.ws, "vote_called", 6000);
    send(p0.ws, { type: "call_vote", targetId: p1.userId });
    await voteCalledPromise;

    await castAndSee(p0, true, p0);
    await castAndSee(p1, false, p0);
    await castAndSee(p2, true, p0);
    // Final vote resolves: 2 yes / 2 no is NOT strictly >50% → spared.
    // Current behavior: the game stays in day (fresh day phase_change).
    const sparedPromises = players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 8000,
        `${p.seat} spared phase_change`));
    await castAndSee(p3, false, p0);
    await Promise.all(sparedPromises);
    await Bun.sleep(300); // let any stray trailing messages land (golden would catch them)

    // ── Assert: per-client golden sequences ─────────────────────────────
    const summarize = makeSummarizer(players);
    const actual: Record<string, string[]> = {};
    for (const p of players) actual[p.seat] = p.inbox.map(summarize);
    if (process.env.GOLDEN_DUMP) console.log(JSON.stringify(actual, null, 2));
    expect(actual).toEqual(GOLDEN_GAME_3);

    // ── Assert: role-secrecy invariants over the raw inboxes ────────────
    const roleOf = (seat: string) => FIXED_DEAL_3.roles[Number(seat.slice(1))];
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
