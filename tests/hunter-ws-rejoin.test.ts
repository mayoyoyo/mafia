import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import type { Role } from "../src/types";

/**
 * C4 — game_sync projection + rejoin support for the revenge gate
 * (HUNTER-DESIGN §3.4 the H4 lesson, §6 H4 row, §9 E10a-d + E13):
 *   E10a — hunter disconnects mid-gate, rejoins: pendingRevenge.isYou,
 *          hunter_revenge_targets re-sent, the revenge timer NOT reset;
 *   E10b — non-hunter rejoiners (alive + dead spectator) see the wait state;
 *   E10c — admin rejoins mid-gate, force_skip_revenge still works;
 *   E10d — hunter rejoins AFTER resolution: no stale projection, no re-send;
 *   E13  — role secrecy: mechanical "hunter" sweep over every non-hunter
 *          inbox pre-death; post-death the reveal rides
 *          hunter_revenge_pending + narrator-bearing payloads only;
 *   plus the gate-closed byte-shape: no pendingRevenge KEY in game_sync when
 *   the gate is closed (hunter enabled) and when hunter is disabled.
 *
 * Port band 24600-24999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging;
 * 22600-22999 hunter-ws-night; 23600-23999 hunter-ws-vote). Sub-bands, one
 * fixed deal per server process (the MAFIA_FIXED_DEAL env seam is
 * process-wide):
 *   server A 24600-24689 — hunter deal, default 60s revenge timeout (gates
 *     that must HOLD across disconnect/rejoin windows): E10a/b/c/d, E13;
 *   server B 24700-24789 — hunter deal, revenge timeout shortened to 2500ms
 *     via MAFIA_REVENGE_TIMER_MS: the E10a timer-not-reset proof (expiry at
 *     the ORIGINAL deadline despite a mid-window rejoin);
 *   server C 24800-24889 — NO hunter in the deal, enableHunter false: the
 *     hunter-disabled game_sync byte-shape (no pendingRevenge key, ever).
 */

const PORT_A = 24600 + Math.floor(Math.random() * 90); // 24600-24689
const PORT_B = 24700 + Math.floor(Math.random() * 90); // 24700-24789
const PORT_C = 24800 + Math.floor(Math.random() * 90); // 24800-24889
const SHORT_REVENGE_MS = 2500;

// Seat indices into the hunter deal (join order).
const ADMIN = 0, MAFIA = 1, HUNTER = 2, CIT_A = 3, CIT_B = 4, CIT_C = 5;

const HUNTER_ROLES: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen"];
const NO_HUNTER_ROLES: Role[] = ["citizen", "mafia", "citizen", "citizen"];

const HUNTER_SETTINGS = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: false,
};
const NO_HUNTER_SETTINGS = { ...HUNTER_SETTINGS, enableHunter: false };

// ── Per-band server subprocesses (harness: tests/hunter-ws-vote.test.ts) ──

interface HunterServer {
  proc: ReturnType<typeof Bun.spawn>;
  wsUrl: string;
  dbPath: string;
  /** Accumulated server stdout (slog JSON lines) — pattern: structured-logging.test.ts. */
  logs: () => string;
}

async function spawnServer(
  port: number, label: string, dealRoles: Role[],
  extraEnv: Record<string, string> = {},
): Promise<HunterServer> {
  const wsUrl = `ws://localhost:${port}/ws`;
  const dbPath = `/tmp/mafia-hunter-ws-rejoin-${label}-${Date.now()}-${port}.db`;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      MAFIA_FIXED_DEAL: JSON.stringify({ roles: dealRoles }),
      ...extraEnv,
    },
    cwd: import.meta.dir + "/..",
    stdout: "pipe", stderr: "ignore",
  });
  // Stdout capture: "rejoin re-armed the revenge timer" and "rejoin re-sent
  // nothing" are slog-only observables — a re-armed timer is wire-identical
  // to the original one inside a test window; only the server's own
  // "revenge_timer" lifecycle events (armed/overwritten/fired/cleared)
  // distinguish them.
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
let serverC: HunterServer | null = null;

beforeAll(async () => {
  [serverA, serverB, serverC] = await Promise.all([
    spawnServer(PORT_A, "A", HUNTER_ROLES),
    spawnServer(PORT_B, "B", HUNTER_ROLES,
      { MAFIA_REVENGE_TIMER_MS: String(SHORT_REVENGE_MS) }),
    spawnServer(PORT_C, "C", NO_HUNTER_ROLES),
  ]);
});

afterAll(() => {
  for (const srv of [serverA, serverB, serverC]) {
    if (!srv) continue;
    try { srv.proc.kill(); } catch {}
    for (const f of [srv.dbPath, `${srv.dbPath}-wal`, `${srv.dbPath}-shm`]) {
      try { unlinkSync(f); } catch {}
    }
  }
});

// ── WS harness (copied from tests/hunter-ws-vote.test.ts) ────────────────

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

interface HunterPlayer {
  ws: WebSocket;
  userId: number;
  username: string;
  pin: string;
  seat: string;   // "P0".."P5" in join order
  inbox: any[];   // every raw message received, in order, across reconnects
}

/** Register a user with an always-on inbox recorder attached at open. */
async function regRecorded(wsUrl: string, name: string, pin: string, seat: string): Promise<HunterPlayer> {
  const ws = await openWS(wsUrl);
  const inbox: any[] = [];
  ws.addEventListener("message", (e: MessageEvent) => inbox.push(JSON.parse(e.data)));
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, pin, seat, inbox };
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
 * Register recorded clients, create/join in seat order, apply settings,
 * start, assert the fixed deal landed, and drop the Begin Night gate.
 * Returns with night 1 running (mafia sub-phase).
 */
async function setupGame(srv: HunterServer, dealRoles: Role[], settings: Record<string, unknown>): Promise<HunterGame> {
  const prefix = `hwr_${ts}_${++gameCounter}`;
  const players: HunterPlayer[] = [];
  for (let i = 0; i < dealRoles.length; i++) {
    players.push(await regRecorded(srv.wsUrl, `${prefix}_${i}`, String(1000 + i), `P${i}`));
  }
  const admin = players[ADMIN];

  send(admin.ws, { type: "create_game" });
  const created = await waitFor(admin.ws, "game_created");
  for (let i = 1; i < players.length; i++) {
    send(players[i].ws, { type: "join_game", code: created.code });
    await waitFor(players[i].ws, "game_joined");
  }

  send(admin.ws, { type: "update_settings", settings });
  await waitFor(admin.ws, "settings_updated");

  const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
  const readyPromise = waitFor(admin.ws, "awaiting_ready");
  send(admin.ws, { type: "start_game" });
  const started = await Promise.all(startedPromises);
  await readyPromise;
  expect(started.map(s => s.role)).toEqual(dealRoles); // the seam dealt the fixed assignment

  send(admin.ws, { type: "narrator_ready" });
  await waitFor(admin.ws, "sound_cue", 5000); // night sequence began
  await Bun.sleep(100);

  const seatOfId = new Map(players.map(p => [p.userId, p.seat]));
  const seatOfName = new Map(players.map(p => [p.username, p.seat]));
  return { code: created.code, players, seatOfId, seatOfName };
}

/** Skip night 1 without a death: admin force_dawn → day 1, everyone alive. */
async function forceDawnToDay(game: HunterGame): Promise<void> {
  const admin = game.players[ADMIN];
  const day = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "forced day");
  send(admin.ws, { type: "force_dawn" });
  await day;
  await Bun.sleep(100);
}

/**
 * Day-phase lynch: admin calls the vote on `target`, every LIVING voter
 * approves, vote_result awaited on the admin socket, fan-out settled.
 */
async function lynchByVote(game: HunterGame, target: HunterPlayer, voters: HunterPlayer[]): Promise<any> {
  const admin = game.players[ADMIN];
  const called = waitFor(admin.ws, "vote_called", 5000);
  send(admin.ws, { type: "call_vote", targetId: target.userId });
  await called;
  const resultP = waitFor(admin.ws, "vote_result", 8000);
  for (const v of voters) send(v.ws, { type: "cast_vote", approve: true });
  const result = await resultP;
  await Bun.sleep(150); // let per-socket fan-out settle on every inbox
  return result;
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
 * Night 1: mafia kills the hunter, then await the gate opening on the
 * admin socket (NIGHT-path gate: phase "night", nightSubPhase null).
 */
async function killHunterAndAwaitGate(game: HunterGame): Promise<any> {
  const pendingPromise = waitFor(game.players[ADMIN].ws, "hunter_revenge_pending", 8000);
  await mafiaSoloKill(game.players[MAFIA], game.players[HUNTER]);
  const pending = await pendingPromise;
  await Bun.sleep(150);
  return pending;
}

function closeAll(game: HunterGame) {
  for (const p of game.players) { try { p.ws.close(); } catch {} }
}

/**
 * Disconnect + reconnect a player, buffering every post-login message for
 * `settleMs` after join_game. The new socket's recorder ALSO appends to the
 * player's running inbox (E13 sweeps span reconnects), and player.ws is
 * swapped so later actions ride the new socket. Returns the rejoin slice.
 */
async function rejoinRecorded(srv: HunterServer, p: HunterPlayer, code: string, settleMs = 700): Promise<any[]> {
  try { p.ws.close(); } catch {}
  await Bun.sleep(100);

  const ws = await openWS(srv.wsUrl);
  const slice: any[] = [];
  ws.addEventListener("message", (e: MessageEvent) => {
    const m = JSON.parse(e.data);
    slice.push(m);
    p.inbox.push(m);
  });
  send(ws, { type: "login", username: p.username, passcode: p.pin });
  await waitFor(ws, "logged_in");
  p.ws = ws;

  send(ws, { type: "join_game", code });
  await Bun.sleep(settleMs);

  expect(slice.find(m => m.type === "game_joined")).toBeDefined();
  expect(slice.filter(m => m.type === "game_sync").length).toBe(1);
  return slice;
}

/**
 * THIS game's revenge-timer lifecycle ("armed"/"cleared"/"fired"/
 * "overwritten"), in server stdout order — parsed from the slog
 * "revenge_timer" lines, filtered by game code.
 */
function revengeTimerEvents(srv: HunterServer, code: string): string[] {
  return slogEvents(srv, "revenge_timer", code).map((e) => e.event as string);
}

/** THIS game's M7 sweep rejections: the message types the dispatch-level gate check bounced. */
function revengeGateRejects(srv: HunterServer, code: string): string[] {
  return slogEvents(srv, "revenge_gate_reject", code).map((e) => e.type as string);
}

function slogEvents(srv: HunterServer, slogName: string, code: string): any[] {
  return srv.logs()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.slog === slogName && e.code === code);
}

function indexOfMsg(inbox: any[], pred: (m: any) => boolean, from = 0): number {
  for (let i = from; i < inbox.length; i++) if (pred(inbox[i])) return i;
  return -1;
}

// ═══════════════════════════════════════════════════════════════════════
// E10a — hunter disconnects mid-gate, rejoins (night-path gate)
// ═══════════════════════════════════════════════════════════════════════

describe("E10a: hunter rejoin mid-gate (night path)", () => {
  test("game_sync.pendingRevenge { isYou: true } + targets re-sent; timer NOT re-armed; revenge completes", async () => {
    const game = await setupGame(serverA!, HUNTER_ROLES, HUNTER_SETTINGS);
    const [admin, hunter, citA] = [game.players[ADMIN], game.players[HUNTER], game.players[CIT_A]];

    await killHunterAndAwaitGate(game);

    // ── Hunter disconnects and rejoins while the gate is open ───────────
    const slice = await rejoinRecorded(serverA!, hunter, game.code);
    const sync = slice.find(m => m.type === "game_sync");

    // §3.4: the projection, hunter's own view.
    expect(sync.pendingRevenge).toEqual({ hunterName: hunter.username, isYou: true });
    // The gated night-path shape the client restores from: phase holds at
    // "night" with the sub-phase already nulled — pendingRevenge is the ONLY
    // signal (the H4 lesson), never a nightAction reconstruction.
    expect(sync.phase).toBe("night");
    expect(sync.nightSubPhase).toBeNull();
    expect(sync.isDead).toBe(true);
    expect(sync.role).toBe("hunter");
    expect(sync.nightAction).toBeNull();

    // The private prompt is re-sent AFTER game_sync: exactly the 5 living.
    const syncIdx = slice.findIndex(m => m.type === "game_sync");
    const targetsIdx = slice.findIndex(m => m.type === "hunter_revenge_targets");
    expect(targetsIdx).toBeGreaterThan(syncIdx);
    const targetIds = slice[targetsIdx].players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const livingIds = game.players.filter(p => p.userId !== hunter.userId).map(p => p.userId).sort((a, b) => a - b);
    expect(targetIds).toEqual(livingIds);

    // Re-send-only: no second public reveal (the room saw exactly one
    // hunter_revenge_pending), and the revenge timer was NOT re-armed —
    // exactly one "armed", no "overwritten", nothing else yet.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);
    expect(slice.filter(m => m.type === "hunter_revenge_pending").length).toBe(0);
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed"]);

    // C4 ride-along (M7 sweep `=== true`): while gated, a junk wire type
    // that collides with an Object.prototype key ("toString" indexes an
    // inherited function — truthy without the strict check) must fall
    // through the switch unmatched, NOT be bounced as a gate rejection;
    // a genuinely §3.6-listed action from the same socket IS bounced.
    send(citA.ws, { type: "toString" });
    send(citA.ws, { type: "call_vote", targetId: citA.userId });
    await Bun.sleep(200);
    const rejects = revengeGateRejects(serverA!, game.code);
    expect(rejects).not.toContain("toString");
    expect(rejects).toContain("call_vote");

    // ── The rejoined hunter completes revenge normally (new socket) ─────
    const victimP = waitFor(citA.ws, "you_died", 5000);
    const dayP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "deferred dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });
    await victimP;
    await dayP;
    await Bun.sleep(150);
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed", "cleared"]);

    closeAll(game);
  }, 60000);
});

describe("E10a timer: a mid-window rejoin never extends the revenge window (short-timer server)", () => {
  test("expiry still fires at the ORIGINAL deadline after the hunter rejoins", async () => {
    const game = await setupGame(serverB!, HUNTER_ROLES, HUNTER_SETTINGS);
    const [admin, hunter] = [game.players[ADMIN], game.players[HUNTER]];

    await killHunterAndAwaitGate(game);
    const t0 = Date.now(); // ≈ the arm instant (client receipt of the reveal)

    // Burn ~half the window offline, then rejoin (join lands ~t0+1300).
    await Bun.sleep(1000);
    const slice = await rejoinRecorded(serverB!, hunter, game.code, 400);
    expect(slice.find(m => m.type === "game_sync").pendingRevenge)
      .toEqual({ hunterName: hunter.username, isYou: true });
    expect(slice.find(m => m.type === "hunter_revenge_targets")).toBeDefined();

    // The hunter never acts: expiry resolves as a decline at the ORIGINAL
    // deadline (~t0+2500). A re-armed timer (re-arm at the join, ~t0+1300)
    // would fire at ~t0+3800 — outside the asserted window.
    const dayChange = await waitMatch(admin.ws,
      m => m.type === "phase_change" && m.phase === "day", 6000, "expiry decline dawn");
    const elapsed = Date.now() - t0;
    // Upper bound only (a re-arm fires ~t0+3800, well past it). No lower
    // bound: t0 lags the real arm by client receipt (~150ms), so a CI stall
    // in that window could false-fail it — the slog ["armed", "fired"]
    // assertion below is the load-bearing no-re-arm proof.
    expect(elapsed).toBeLessThan(3500);
    expect(dayChange.messages.length).toBeGreaterThan(0);

    // Slog lifecycle agrees: one arm, the fire, nothing overwritten —
    // the rejoin left the live timer untouched.
    await Bun.sleep(150);
    expect(revengeTimerEvents(serverB!, game.code)).toEqual(["armed", "fired"]);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E10b — non-hunter rejoiners mid-gate (vote-path gate)
// ═══════════════════════════════════════════════════════════════════════

describe("E10b: non-hunter rejoiners mid-gate (vote path)", () => {
  test("alive player and dead spectator both get pendingRevenge { isYou: false }; no targets leak", async () => {
    const game = await setupGame(serverA!, HUNTER_ROLES, HUNTER_SETTINGS);
    const [admin, mafia, hunter, citA, citB, citC] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[CIT_A], game.players[CIT_B], game.players[CIT_C],
    ];

    // Night 1: mafia kills citC (the dead spectator); dawn lands.
    const dawnP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 8000, "dawn 1");
    await mafiaSoloKill(mafia, citC);
    await dawnP;
    await Bun.sleep(100);

    // Day 1: lynch the hunter — the vote-path gate opens.
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    const alive = [admin, mafia, hunter, citA, citB];
    await lynchByVote(game, hunter, alive);
    await pendingP;
    await Bun.sleep(150);

    // ── Alive non-hunter rejoins ─────────────────────────────────────────
    const aliveSlice = await rejoinRecorded(serverA!, citA, game.code);
    const aliveSync = aliveSlice.find(m => m.type === "game_sync");
    expect(aliveSync.pendingRevenge).toEqual({ hunterName: hunter.username, isYou: false });
    expect(aliveSync.phase).toBe("voting");
    expect(aliveSync.isDead).toBe(false);
    expect(aliveSync.voteState).toBeNull(); // ballot cleared before the gate
    // The target list NEVER rides a non-hunter rejoin.
    expect(aliveSlice.filter(m => m.type === "hunter_revenge_targets").length).toBe(0);

    // ── Dead spectator rejoins ───────────────────────────────────────────
    const deadSlice = await rejoinRecorded(serverA!, citC, game.code);
    const deadSync = deadSlice.find(m => m.type === "game_sync");
    expect(deadSync.pendingRevenge).toEqual({ hunterName: hunter.username, isYou: false });
    expect(deadSync.isDead).toBe(true);
    expect(deadSlice.filter(m => m.type === "hunter_revenge_targets").length).toBe(0);

    // The gate survived all of it; the hunter resolves (decline → night 2).
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "deferred auto-night");
    send(hunter.ws, { type: "hunter_revenge", targetId: null });
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    await Bun.sleep(150);
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed", "cleared"]);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E10c — admin rejoins mid-gate; force_skip_revenge works post-rejoin
// ═══════════════════════════════════════════════════════════════════════

describe("E10c: admin rejoin mid-gate", () => {
  test("projection present; force_skip_revenge from the NEW socket completes the decline path", async () => {
    const game = await setupGame(serverA!, HUNTER_ROLES, HUNTER_SETTINGS);
    const [admin, hunter, citA] = [game.players[ADMIN], game.players[HUNTER], game.players[CIT_A]];

    await forceDawnToDay(game);
    const pendingP = waitFor(citA.ws, "hunter_revenge_pending", 8000);
    await lynchByVote(game, hunter, game.players);
    await pendingP;
    await Bun.sleep(150);

    const slice = await rejoinRecorded(serverA!, admin, game.code);
    const sync = slice.find(m => m.type === "game_sync");
    expect(sync.isAdmin).toBe(true);
    expect(sync.pendingRevenge).toEqual({ hunterName: hunter.username, isYou: false });
    expect(slice.filter(m => m.type === "hunter_revenge_targets").length).toBe(0);

    // Admin force-skip post-rejoin: the decline resolves into the deferred
    // auto-night (join_game is M7-exempt, the admin check is userId-keyed —
    // the fresh socket changes neither).
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "post-skip auto-night");
    send(admin.ws, { type: "force_skip_revenge" });
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    for (const p of game.players) {
      expect(nightChange.messages[0]).not.toContain(p.username); // decline names nobody
    }
    await Bun.sleep(150);
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed", "cleared"]);
    // Nobody but the hunter died.
    expect(admin.inbox.find(m => m.type === "player_died" && m.playerId !== hunter.userId)).toBeUndefined();

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E10d — hunter rejoins AFTER resolution: no stale projection, no re-send
// ═══════════════════════════════════════════════════════════════════════

describe("E10d: hunter rejoin after resolution", () => {
  test("game_sync has NO pendingRevenge key and no hunter_revenge_targets re-send", async () => {
    const game = await setupGame(serverA!, HUNTER_ROLES, HUNTER_SETTINGS);
    const [admin, hunter, citA] = [game.players[ADMIN], game.players[HUNTER], game.players[CIT_A]];

    await killHunterAndAwaitGate(game);

    // Resolve the gate (revenge kill), dawn completes.
    const dayP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "deferred dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });
    await dayP;
    await Bun.sleep(150);

    // ── Hunter rejoins on the settled day: nothing pending remains ──────
    const slice = await rejoinRecorded(serverA!, hunter, game.code);
    const sync = slice.find(m => m.type === "game_sync");
    expect(sync.phase).toBe("day");
    expect("pendingRevenge" in sync).toBe(false); // gate-closed byte-shape: key OMITTED
    expect(slice.filter(m => m.type === "hunter_revenge_targets").length).toBe(0);
    expect(slice.filter(m => m.type === "hunter_revenge_pending").length).toBe(0);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E13 — role secrecy: mechanical "hunter" sweep over every non-hunter inbox
// ═══════════════════════════════════════════════════════════════════════

/**
 * Strip the substrings that legitimately contain "hunter" with the ROLE
 * still secret, then report whether any "hunter" occurrence remains:
 *   - the enableHunter settings KEY (lobby_update / settings_updated carry
 *     GameSettings — a rules toggle, not a role reveal).
 * Test usernames are `hwr_`-prefixed, so no name can smuggle a match in.
 */
function leaksHunter(m: any): boolean {
  return /hunter/i.test(JSON.stringify(m).replaceAll("enableHunter", ""));
}

describe("E13: role secrecy until death", () => {
  test("pre-death: zero 'hunter' occurrences on any non-hunter inbox (incl. a pre-death rejoin game_sync); post-death: the reveal rides hunter_revenge_pending + narrator-bearing payloads only", async () => {
    const game = await setupGame(serverA!, HUNTER_ROLES, HUNTER_SETTINGS);
    const [admin, mafia, hunter, citA, citB, citC] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[CIT_A], game.players[CIT_B], game.players[CIT_C],
    ];
    for (const p of game.players) expect(/hunter/i.test(p.username)).toBe(false); // sweep soundness

    // Night 1: mafia kills citC — spectator traffic exists pre-death.
    const dawnP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 8000, "dawn 1");
    await mafiaSoloKill(mafia, citC);
    await dawnP;
    await Bun.sleep(100);

    // Pre-death rejoins: an alive citizen AND the dead spectator — their
    // game_syncs are part of the sweep, and pin the gate-closed byte-shape
    // for a HUNTER-ENABLED game (no pendingRevenge key while no gate).
    const aliveSlice = await rejoinRecorded(serverA!, citA, game.code);
    expect("pendingRevenge" in aliveSlice.find(m => m.type === "game_sync")).toBe(false);
    const deadSlice = await rejoinRecorded(serverA!, citC, game.code);
    expect("pendingRevenge" in deadSlice.find(m => m.type === "game_sync")).toBe(false);

    // Day 1: lynch the hunter → the public reveal moment.
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    await lynchByVote(game, hunter, [admin, mafia, hunter, citA, citB]);
    await pendingP;
    await Bun.sleep(150);

    // Close out: revenge on citB → deferred auto-night (post-death traffic
    // for the sweep's second half: narrator lines, events, death beats).
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "deferred auto-night");
    send(hunter.ws, { type: "hunter_revenge", targetId: citB.userId });
    await nightP;
    await Bun.sleep(200);

    // ── The mechanical sweep, per non-hunter inbox ───────────────────────
    // The reveal moment is each inbox's own hunter_revenge_pending index
    // (per-socket FIFO makes the boundary inbox-local, never cross-inbox).
    // Deliberately EXCLUDES game_sync: a post-death rejoin would
    // false-positive on narratorHistory legitimately carrying the reveal —
    // extenders adding a post-death rejoin here must allowlist it.
    const REVEAL_BEARING = new Set([
      "hunter_revenge_pending", // the reveal itself (type + hunterName)
      "phase_change",           // narrator messages + eventHistory ride here
      "player_died",            // narrator death line (revenge kill prose)
      "you_died",               // same line, victim's copy
    ]);
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue; // own role-bearing traffic is exempt
      const revealIdx = indexOfMsg(p.inbox, m => m.type === "hunter_revenge_pending");
      expect(revealIdx).toBeGreaterThan(0); // everyone saw the public reveal

      // Before the death: NOTHING names the hunter — game_started, the
      // pre-death rejoin game_syncs, spectator/vote/night traffic, all of it.
      for (const m of p.inbox.slice(0, revealIdx)) {
        if (leaksHunter(m)) {
          throw new Error(`pre-death hunter leak to ${p.seat}: ${JSON.stringify(m)}`);
        }
      }
      // After the death: every occurrence rides the reveal broadcast or a
      // narrator-bearing payload — never a private prompt, never a role
      // field (hunter_revenge_targets stays hunter-only, asserted below).
      for (const m of p.inbox.slice(revealIdx)) {
        if (leaksHunter(m) && !REVEAL_BEARING.has(m.type)) {
          throw new Error(`post-death hunter occurrence outside reveal-bearing types to ${p.seat}: ${JSON.stringify(m)}`);
        }
      }
      expect(p.inbox.filter(m => m.type === "hunter_revenge_targets").length).toBe(0);
    }

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// Gate-closed byte-shape, hunter DISABLED (server C: no hunter anywhere)
// ═══════════════════════════════════════════════════════════════════════

describe("gate-closed byte-shape: hunter-disabled game", () => {
  test("a mid-night rejoin game_sync carries no pendingRevenge key", async () => {
    const game = await setupGame(serverC!, NO_HUNTER_ROLES, NO_HUNTER_SETTINGS);
    const citizen = game.players[2]; // alive citizen, night 1 mafia sub-phase

    const slice = await rejoinRecorded(serverC!, citizen, game.code);
    const sync = slice.find(m => m.type === "game_sync");
    expect(sync.phase).toBe("night");
    expect("pendingRevenge" in sync).toBe(false);
    expect(leaksHunter(sync)).toBe(false); // nothing hunter-ish in a hunterless sync

    closeAll(game);
  }, 60000);
});
