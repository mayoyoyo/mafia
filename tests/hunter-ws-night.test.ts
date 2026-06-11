import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import type { Role } from "../src/types";

/**
 * C3a — WS half of the Hunter revenge flow, NIGHT path (HUNTER-DESIGN §3.6,
 * §4, §6): edges E1 (two-stage dawn), E6 (decline ×3 identical), E9 (timer
 * isolation + force_dawn clears the gate), plus handler guard rejections
 * for the two new message types. The vote-path interrupt (E4/E8 sweep) is
 * C3b; rejoin mid-revenge (E10) is C4.
 *
 * Port band 22600-22999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging).
 * Sub-bands: server A 22600-22789 (default 60s revenge timeout — games
 * that resolve the gate explicitly), server B 22800-22989 (revenge timeout
 * shortened to 1500ms via MAFIA_REVENGE_TIMER_MS — the C3a test seam,
 * pattern: DATABASE_PATH / MAFIA_FIXED_DEAL — for the expiry/silence
 * cases; no real 60s waits anywhere).
 *
 * Deterministic deal via MAFIA_FIXED_DEAL (one deal per server process, the
 * golden-file mechanism): join order P0 citizen (admin), P1 mafia,
 * P2 hunter, P3-P5 citizens. Both servers use the same deal.
 */

const PORT_A = 22600 + Math.floor(Math.random() * 190); // 22600-22789
const PORT_B = 22800 + Math.floor(Math.random() * 190); // 22800-22989
const SHORT_REVENGE_MS = 1500;

const DEAL_ROLES: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen"];
const SETTINGS = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: false,
};

// Seat indices into the deal (join order)
const ADMIN = 0, MAFIA = 1, HUNTER = 2, CIT_A = 3, CIT_B = 4, CIT_C = 5;

// ── Per-band server subprocesses ─────────────────────────────────────────

interface HunterServer {
  proc: ReturnType<typeof Bun.spawn>;
  wsUrl: string;
  dbPath: string;
  /** Accumulated server stdout (slog JSON lines) — pattern: structured-logging.test.ts. */
  logs: () => string;
}

async function spawnServer(port: number, label: string, extraEnv: Record<string, string> = {}): Promise<HunterServer> {
  const wsUrl = `ws://localhost:${port}/ws`;
  const dbPath = `/tmp/mafia-hunter-ws-night-${label}-${Date.now()}-${port}.db`;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      MAFIA_FIXED_DEAL: JSON.stringify({ roles: DEAL_ROLES }),
      ...extraEnv,
    },
    cwd: import.meta.dir + "/..",
    stdout: "pipe", stderr: "ignore",
  });
  // Stdout capture (structured-logging.test.ts pattern): the WS wire cannot
  // distinguish a CLEARED revenge timer from an ORPHANED one (an orphan
  // fires into the gate-null guard and no-ops) — only the server's own
  // "revenge_timer" slog lifecycle can, so the E9 pin reads it from here.
  let stdoutBuf = "";
  const dec = new TextDecoder();
  (async () => {
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      stdoutBuf += dec.decode(chunk, { stream: true });
    }
  })().catch(() => {});
  for (let i = 0; i < 30; i++) {
    try {
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((ok, fail) => {
        ws.onopen = () => { ws.close(); ok(); };
        ws.onerror = () => fail();
      });
      return { proc, wsUrl, dbPath, logs: () => stdoutBuf };
    } catch { await Bun.sleep(200); }
  }
  try { proc.kill(); } catch {}
  throw new Error(`Hunter WS server failed to start on port ${port}`);
}

let serverA: HunterServer | null = null;
let serverB: HunterServer | null = null;

beforeAll(async () => {
  [serverA, serverB] = await Promise.all([
    spawnServer(PORT_A, "A"),
    spawnServer(PORT_B, "B", { MAFIA_REVENGE_TIMER_MS: String(SHORT_REVENGE_MS) }),
  ]);
});

afterAll(() => {
  for (const srv of [serverA, serverB]) {
    if (!srv) continue;
    try { srv.proc.kill(); } catch {}
    for (const f of [srv.dbPath, `${srv.dbPath}-wal`, `${srv.dbPath}-shm`]) {
      try { unlinkSync(f); } catch {}
    }
  }
});

// ── WS harness (pattern copied from tests/rejoin-matrix-day.test.ts /
//    tests/golden-sequences.test.ts) ─────────────────────────────────────

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

/** Assert NONE of the given message types arrive on this ws for windowMs. */
function assertSilence(ws: WebSocket, types: string[], windowMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (types.includes(m.type)) {
        clearTimeout(t);
        ws.removeEventListener("message", h);
        reject(new Error(`Unexpected ${m.type} during silence window`));
      }
    };
    const t = setTimeout(() => { ws.removeEventListener("message", h); resolve(); }, windowMs);
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

interface HunterPlayer {
  ws: WebSocket;
  userId: number;
  username: string;
  seat: string;   // "P0".."P5" in join order
  inbox: any[];   // every raw message received, in order
}

/** Register a user with an always-on inbox recorder attached at open. */
async function regRecorded(wsUrl: string, name: string, pin: string, seat: string): Promise<HunterPlayer> {
  const ws = await openWS(wsUrl);
  const inbox: any[] = [];
  ws.addEventListener("message", (e: MessageEvent) => inbox.push(JSON.parse(e.data)));
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, seat, inbox };
}

interface HunterGame {
  code: string;
  players: HunterPlayer[];
  seatOfId: Map<number, string>;
  seatOfName: Map<string, string>;
}

const ts = Date.now();
let gameCounter = 0;

/**
 * Register 6 recorded clients, create/join in seat order, apply settings,
 * start, assert the fixed deal landed, and drop the Begin Night gate.
 * Returns with night 1 running (mafia sub-phase).
 */
async function setupGame(srv: HunterServer): Promise<HunterGame> {
  const prefix = `hwn_${ts}_${++gameCounter}`;
  const players: HunterPlayer[] = [];
  for (let i = 0; i < DEAL_ROLES.length; i++) {
    players.push(await regRecorded(srv.wsUrl, `${prefix}_${i}`, String(1000 + i), `P${i}`));
  }
  const admin = players[ADMIN];

  send(admin.ws, { type: "create_game" });
  const created = await waitFor(admin.ws, "game_created");
  for (let i = 1; i < players.length; i++) {
    send(players[i].ws, { type: "join_game", code: created.code });
    await waitFor(players[i].ws, "game_joined");
  }

  send(admin.ws, { type: "update_settings", settings: SETTINGS });
  await waitFor(admin.ws, "settings_updated");

  const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
  const readyPromise = waitFor(admin.ws, "awaiting_ready");
  send(admin.ws, { type: "start_game" });
  const started = await Promise.all(startedPromises);
  await readyPromise;
  expect(started.map(s => s.role)).toEqual(DEAL_ROLES); // the seam dealt the fixed assignment

  send(admin.ws, { type: "narrator_ready" });
  await waitFor(admin.ws, "sound_cue", 5000); // night sequence began
  await Bun.sleep(100);

  const seatOfId = new Map(players.map(p => [p.userId, p.seat]));
  const seatOfName = new Map(players.map(p => [p.username, p.seat]));
  return { code: created.code, players, seatOfId, seatOfName };
}

/** Single-mafia night kill: maybe → lock (consensus of one) → confirm. */
async function mafiaSoloKill(mafia: HunterPlayer, target: HunterPlayer): Promise<void> {
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

/**
 * Night 1: mafia kills the hunter, then await the gate opening (the
 * hunter_revenge_pending broadcast lands ~1s after confirm — the engine's
 * resolve timer). Returns the pending message seen by the admin.
 */
async function killHunterAndAwaitGate(game: HunterGame): Promise<any> {
  const pendingPromise = waitFor(game.players[ADMIN].ws, "hunter_revenge_pending", 8000);
  await mafiaSoloKill(game.players[MAFIA], game.players[HUNTER]);
  const pending = await pendingPromise;
  await Bun.sleep(150); // let per-socket fan-out settle on every inbox
  return pending;
}

function closeAll(game: HunterGame) {
  for (const p of game.players) { try { p.ws.close(); } catch {} }
}

/**
 * THIS game's revenge-timer lifecycle ("armed"/"cleared"/"fired"/
 * "overwritten"), in server stdout order — parsed from the slog
 * "revenge_timer" lines, filtered by game code (other games on the same
 * server keep their own lifecycles out of the assertion).
 */
function revengeTimerEvents(srv: HunterServer, code: string): string[] {
  return srv.logs()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.slog === "revenge_timer" && e.code === code)
    .map((e) => e.event as string);
}

function indexOfMsg(inbox: any[], pred: (m: any) => boolean, from = 0): number {
  for (let i = from; i < inbox.length; i++) if (pred(inbox[i])) return i;
  return -1;
}

// ── E6 sequence summarizer ───────────────────────────────────────────────
// Summarize the observable resolution slice — from hunter_revenge_pending
// through the closing phase_change — to type + stable discriminating fields
// (seats, phases, counts). Narrator prose and ids are dropped, so the three
// decline paths can be compared for IDENTITY modulo prose variance.

const SLICE_TYPES = new Set([
  "hunter_revenge_pending", "hunter_revenge_targets", "you_died",
  "player_died", "sound_cue", "phase_change", "game_over",
]);

function summarizeSlice(game: HunterGame, inbox: any[]): any[] {
  const start = indexOfMsg(inbox, m => m.type === "hunter_revenge_pending");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = indexOfMsg(inbox, m => m.type === "phase_change", start);
  expect(end).toBeGreaterThan(start);
  const out: any[] = [];
  for (let i = start; i <= end; i++) {
    const m = inbox[i];
    if (!SLICE_TYPES.has(m.type)) continue;
    switch (m.type) {
      case "hunter_revenge_pending":
        out.push({ type: m.type, hunter: game.seatOfName.get(m.hunterName) ?? m.hunterName });
        break;
      case "hunter_revenge_targets":
        out.push({ type: m.type, targets: m.players.map((p: any) => game.seatOfId.get(p.id) ?? p.id).sort() });
        break;
      case "you_died":
        out.push({ type: m.type, isLoverDeath: !!m.isLoverDeath });
        break;
      case "player_died":
        out.push({ type: m.type, who: game.seatOfId.get(m.playerId) ?? m.playerId });
        break;
      case "sound_cue":
        out.push({ type: m.type, sound: m.sound });
        break;
      case "phase_change":
        out.push({
          type: m.type, phase: m.phase, round: m.round,
          msgCount: m.messages.length, hasEvents: Array.isArray(m.events),
        });
        break;
      case "game_over":
        out.push({ type: m.type, winner: m.winner });
        break;
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// E1 — two-stage dawn (WS half)
// ═══════════════════════════════════════════════════════════════════════

describe("E1: two-stage dawn — mafia night-kills the hunter", () => {
  test("deaths announced before the reveal; only the hunter is prompted; phase_change deferred until revenge resolves; night timers fine afterwards", async () => {
    const game = await setupGame(serverA!);
    const [admin, , hunter, citA, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[CIT_A], game.players[CIT_B],
    ];

    const pending = await killHunterAndAwaitGate(game);
    expect(pending.hunterName).toBe(hunter.username);

    // Stage 1 before stage 2, on every inbox: you_died/player_died(hunter)
    // BEFORE hunter_revenge_pending.
    for (const p of game.players) {
      const diedIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
      const pendingIdx = indexOfMsg(p.inbox, m => m.type === "hunter_revenge_pending");
      expect(diedIdx).toBeGreaterThanOrEqual(0);
      expect(pendingIdx).toBeGreaterThan(diedIdx);
    }
    const youDiedIdx = indexOfMsg(hunter.inbox, m => m.type === "you_died");
    expect(youDiedIdx).toBeGreaterThanOrEqual(0);
    expect(youDiedIdx).toBeLessThan(indexOfMsg(hunter.inbox, m => m.type === "hunter_revenge_pending"));

    // The hunter — and ONLY the hunter — got the target list: exactly the
    // five living players.
    const targetsMsg = hunter.inbox.find(m => m.type === "hunter_revenge_targets");
    expect(targetsMsg).toBeDefined();
    const targetIds = targetsMsg.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const livingIds = game.players.filter(p => p.userId !== hunter.userId).map(p => p.userId).sort((a, b) => a - b);
    expect(targetIds).toEqual(livingIds);
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue;
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // Spectator isolation (§3.9 server side): the prompted hunter received
    // NO dead-spectator panel at the gated dawn.
    expect(hunter.inbox.find(m => m.type === "spectator_kill_confirmed")).toBeUndefined();

    // The dawn is HELD: no phase_change / day cue / game_over while gated.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(1); // game-start night only
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);

    // ── Revenge: hunter shoots a citizen ──────────────────────────────────
    const victimDiedPromise = waitFor(citA.ws, "you_died", 5000);
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "deferred dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });

    const victimDied = await victimDiedPromise;
    expect(victimDied.isLoverDeath).toBeUndefined();
    const dayChange = await dayPromise;
    expect(dayChange.round).toBe(1);
    // The closing phase_change carries the revenge narrator line (loose
    // prose match: the victim's name, never exact text).
    expect(dayChange.messages.length).toBe(1);
    expect(dayChange.messages[0]).toContain(citA.username);
    expect(Array.isArray(dayChange.events)).toBe(true);
    await Bun.sleep(150);

    // Order on the admin inbox: pending < player_died(victim) < day cue <
    // phase_change(day). And no game_over anywhere (1 mafia vs 3 town).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === citA.userId);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day");
    const dIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "day");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(cueIdx).toBeGreaterThan(vIdx);
    expect(dIdx).toBeGreaterThan(cueIdx);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // ── Robustness: a second hunter_revenge after resolution is rejected
    // by the gate-open guard — no death, no broadcast.
    send(hunter.ws, { type: "hunter_revenge", targetId: citB.userId });
    await assertSilence(admin.ws, ["player_died", "phase_change", "you_died", "game_over", "hunter_revenge_pending"], 500);

    // ── Night-timer machinery intact after the revenge lifecycle (E9's
    // sequential direction): night 2 arms/fires its sub-phase timers and
    // resolves a plain dawn.
    const night2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "night 2");
    send(admin.ws, { type: "end_day" });
    const night2 = await night2Promise;
    expect(night2.round).toBe(2);
    const day2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2");
    await mafiaSoloKill(game.players[MAFIA], citB);
    await day2Promise;
    // No second gate: the hunter is long dead, nobody re-prompts.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);

  test("win-check timing: revenge kills the last mafia — game_over arrives only AFTER resolution", async () => {
    const game = await setupGame(serverA!);
    const [admin, mafia, hunter] = [game.players[ADMIN], game.players[MAFIA], game.players[HUNTER]];

    await killHunterAndAwaitGate(game);

    // Gated: no premature win evaluation on the pre-revenge board.
    await assertSilence(admin.ws, ["game_over", "phase_change", "sound_cue"], 600);

    const overPromise = waitFor(admin.ws, "game_over", 5000);
    send(hunter.ws, { type: "hunter_revenge", targetId: mafia.userId });
    const over = await overPromise;
    expect(over.winner).toBe("town");
    await Bun.sleep(150);

    // Sequence: pending < player_died(mafia) < day cue < phase_change
    // (phase=game_over — the night-path game_over shape, golden #7) <
    // game_over.
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === mafia.userId);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day");
    const pcIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "game_over");
    const goIdx = indexOfMsg(admin.inbox, m => m.type === "game_over");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(cueIdx).toBeGreaterThan(vIdx);
    expect(pcIdx).toBeGreaterThan(cueIdx);
    expect(goIdx).toBeGreaterThan(pcIdx);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E6 — decline ×3: identical observable sequences
// ═══════════════════════════════════════════════════════════════════════

describe("E6: decline ×3 — explicit decline, admin force-skip, timer expiry are one path", () => {
  test("all three resolutions produce the identical per-seat message sequence", async () => {
    // (a) hunter_revenge { targetId: null }
    const gameA = await setupGame(serverA!);
    await killHunterAndAwaitGate(gameA);
    const dayA = waitMatch(gameA.players[ADMIN].ws, m => m.type === "phase_change" && m.phase === "day", 5000, "decline dawn");
    send(gameA.players[HUNTER].ws, { type: "hunter_revenge", targetId: null });
    const dayChangeA = await dayA;
    await Bun.sleep(200);

    // The decline narrator line is present in the closing phase_change
    // (loose prose: exactly one line, naming no player).
    expect(dayChangeA.messages.length).toBe(1);
    for (const p of gameA.players) {
      expect(dayChangeA.messages[0]).not.toContain(p.username);
    }

    // (b) admin force_skip_revenge
    const gameB = await setupGame(serverA!);
    await killHunterAndAwaitGate(gameB);
    const dayB = waitMatch(gameB.players[ADMIN].ws, m => m.type === "phase_change" && m.phase === "day", 5000, "skip dawn");
    send(gameB.players[ADMIN].ws, { type: "force_skip_revenge" });
    await dayB;
    await Bun.sleep(200);

    // (c) revenge timer expiry (server B: 1500ms seam) — nobody acts.
    const gameC = await setupGame(serverB!);
    await killHunterAndAwaitGate(gameC);
    const dayC = waitMatch(gameC.players[ADMIN].ws, m => m.type === "phase_change" && m.phase === "day",
      SHORT_REVENGE_MS + 4000, "expiry dawn");
    await dayC;
    await Bun.sleep(200);

    // Identical observable sequence, per seat, across all three games
    // (modulo narrator prose and timing — the summarizer drops both). No
    // deaths in the slice; the decline line rides the closing phase_change.
    for (let i = 0; i < DEAL_ROLES.length; i++) {
      const seqA = summarizeSlice(gameA, gameA.players[i].inbox);
      const seqB = summarizeSlice(gameB, gameB.players[i].inbox);
      const seqC = summarizeSlice(gameC, gameC.players[i].inbox);
      expect(seqA.length).toBeGreaterThanOrEqual(2); // at least pending + phase_change
      expect(seqA.find(s => s.type === "player_died")).toBeUndefined();
      expect(seqA.find(s => s.type === "you_died")).toBeUndefined();
      expect(seqB).toEqual(seqA);
      expect(seqC).toEqual(seqA);
    }

    // Expiry game continues: night-timer machinery is intact after the
    // timer-fired decline (end_day → night 2 → kill → dawn 2).
    const adminC = gameC.players[ADMIN];
    const night2 = waitMatch(adminC.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "night 2 after expiry");
    send(adminC.ws, { type: "end_day" });
    await night2;
    const day2 = waitMatch(adminC.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2 after expiry");
    await mafiaSoloKill(gameC.players[MAFIA], gameC.players[CIT_A]);
    await day2;

    closeAll(gameA); closeAll(gameB); closeAll(gameC);
  }, 90000);
});

// ═══════════════════════════════════════════════════════════════════════
// E9 — timer isolation + force_dawn clears the gate
// ═══════════════════════════════════════════════════════════════════════

describe("E9: revenge timer isolation; force_dawn while gated", () => {
  test("force_dawn clears gate + revenge timer (no revenge, no late fire); night timers unaffected", async () => {
    const game = await setupGame(serverB!); // 1500ms revenge timeout
    const admin = game.players[ADMIN];

    await killHunterAndAwaitGate(game);

    // force_dawn while the gate is open: a sanctioned gate-CLEARING forced
    // transition (§6) — straight to day, no revenge.
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "forced dawn");
    send(admin.ws, { type: "force_dawn" });
    const day = await dayPromise;
    expect(day.round).toBe(1);
    expect(day.messages).toContain("The host has forced dawn. No one was killed tonight.");
    await Bun.sleep(100);

    // No revenge happened: the only player_died is the hunter's own death.
    expect(admin.inbox.filter(m => m.type === "player_died").length).toBe(1);

    // The armed revenge timer was CLEARED, not orphaned: advance well past
    // the would-be expiry (1500ms) and assert total silence — a live timer
    // would fire a decline resolution (second phase_change / day cue).
    await assertSilence(admin.ws,
      ["phase_change", "player_died", "you_died", "game_over", "hunter_revenge_pending", "sound_cue"],
      SHORT_REVENGE_MS + 700);

    // CLEARED vs ORPHANED, proven at the slog layer (C3a spec-review
    // follow-up): the silence window above is BLIND to an orphaned timer —
    // force_dawn already wiped pendingRevenge, so an uncleared timer fires
    // into the gate-null guard and no-ops with zero wire traffic. The
    // server's own "revenge_timer" lifecycle log is the observable that
    // distinguishes the two: exactly armed -> cleared for this game, and
    // NEVER "fired" (we are already past the would-be expiry). Dropping
    // force_dawn's clearRevengeTimer turns this into ["armed", "fired"].
    expect(revengeTimerEvents(serverB!, game.code)).toEqual(["armed", "cleared"]);

    // Night timers never collided with the revenge slot: night 2 arms its
    // own sub-phase timers (resolve timer included) and a plain dawn lands.
    const night2 = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "night 2");
    send(admin.ws, { type: "end_day" });
    await night2;
    const day2 = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2");
    await mafiaSoloKill(game.players[MAFIA], game.players[CIT_A]);
    const day2Msg = await day2;
    expect(day2Msg.phase).toBe("day");
    // Still exactly one gate ever opened (round 1's), no stale re-prompt.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// Guard rejections for the two new handlers
// ═══════════════════════════════════════════════════════════════════════

describe("guards: hunter_revenge / force_skip_revenge rejections", () => {
  test("non-hunter, non-admin, dead/invalid targets all rejected; gate stays open; hunter retries successfully", async () => {
    const game = await setupGame(serverA!); // 60s timeout: gate stays open through the silence windows
    const [admin, , hunter, citA] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER], game.players[CIT_A],
    ];
    const resolutionTypes = ["player_died", "you_died", "phase_change", "game_over", "sound_cue"];

    await killHunterAndAwaitGate(game);

    // (1) non-hunter sends hunter_revenge → rejected
    send(citA.ws, { type: "hunter_revenge", targetId: admin.userId });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (2) non-admin sends force_skip_revenge → rejected
    send(citA.ws, { type: "force_skip_revenge" });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (3) hunter targets a nonexistent player → rejected, gate stays open
    send(hunter.ws, { type: "hunter_revenge", targetId: 999999 });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (4) hunter targets a DEAD player (themselves) → rejected
    send(hunter.ws, { type: "hunter_revenge", targetId: hunter.userId });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (5) the gate is still open: a valid retry resolves normally
    const victimDied = waitMatch(admin.ws, m => m.type === "player_died" && m.playerId === citA.userId, 5000, "retry kill");
    const dayChange = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "retry dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });
    await victimDied;
    await dayChange;

    closeAll(game);
  }, 60000);
});
