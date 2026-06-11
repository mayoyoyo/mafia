import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import type { Role } from "../src/types";

/**
 * C3b — WS half of the Hunter revenge flow, VOTE path (HUNTER-DESIGN §3.6,
 * §4, §6, §9): edge E4 (day-lynch interrupt — direct, heartbreak, and the
 * official-joker resume with preserveHauntVoters) and edge E8 (the M7
 * gate-rejection sweep + the gate-clearing forced transitions). The night
 * path (E1/E6/E9) is C3a in tests/hunter-ws-night.test.ts; rejoin
 * mid-revenge (E10) is C4.
 *
 * Port band 23600-23999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging;
 * 22600-22999 hunter-ws-night). Sub-bands, one fixed deal per server
 * process (the MAFIA_FIXED_DEAL env seam is process-wide):
 *   server A 23600-23689 — base deal, no lovers, default 60s revenge
 *     timeout (gates that must HOLD through silence windows): E4 base ×2,
 *     E8 rejection sweep, E8 force_dawn-rejected-at-voting-gate;
 *   server B 23700-23789 — lovers hunter+P3(citizen), 60s: E4 heartbreak;
 *   server C 23800-23889 — joker at P3, lovers hunter+joker, 60s: E4
 *     official-joker variant (the preserveHauntVoters payoff);
 *   server D 23900-23989 — base deal, revenge timeout shortened to 1500ms
 *     via MAFIA_REVENGE_TIMER_MS: the E8 gate-CLEARING forced transitions,
 *     where "cleared, NOT fired" is proven by waiting past the would-be
 *     expiry (the C3a E9 discipline; no real 60s waits anywhere).
 *
 * Lover pairing over WS: the existing MAFIA_FIXED_DEAL seam already carries
 * `lovers: [i, j]` (join-order indices — assignFixedRoles pairs them
 * directly); no seam extension was needed.
 */

const PORT_A = 23600 + Math.floor(Math.random() * 90); // 23600-23689
const PORT_B = 23700 + Math.floor(Math.random() * 90); // 23700-23789
const PORT_C = 23800 + Math.floor(Math.random() * 90); // 23800-23889
const PORT_D = 23900 + Math.floor(Math.random() * 90); // 23900-23989
const SHORT_REVENGE_MS = 1500;

// Seat indices into every deal (join order). P3 is the variable seat:
// citizen (A/D), the hunter's lover-citizen (B), the hunter's lover-joker (C).
const ADMIN = 0, MAFIA = 1, HUNTER = 2, P3 = 3, CIT_B = 4, CIT_C = 5;

const BASE_ROLES: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen"];
const JOKER_ROLES: Role[] = ["citizen", "mafia", "hunter", "joker", "citizen", "citizen"];

const BASE_SETTINGS = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: false,
};
const LOVERS_SETTINGS = { ...BASE_SETTINGS, enableLovers: true };
const JOKER_SETTINGS = {
  ...BASE_SETTINGS, enableJoker: true, enableLovers: true, jokerMode: "official",
};

// ── Per-band server subprocesses (harness: tests/hunter-ws-night.test.ts) ──

interface HunterServer {
  proc: ReturnType<typeof Bun.spawn>;
  wsUrl: string;
  dbPath: string;
  /** Accumulated server stdout (slog JSON lines) — pattern: structured-logging.test.ts. */
  logs: () => string;
}

async function spawnServer(
  port: number, label: string, dealRoles: Role[],
  lovers?: [number, number], extraEnv: Record<string, string> = {},
): Promise<HunterServer> {
  const wsUrl = `ws://localhost:${port}/ws`;
  const dbPath = `/tmp/mafia-hunter-ws-vote-${label}-${Date.now()}-${port}.db`;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      MAFIA_FIXED_DEAL: JSON.stringify({ roles: dealRoles, ...(lovers ? { lovers } : {}) }),
      ...extraEnv,
    },
    cwd: import.meta.dir + "/..",
    stdout: "pipe", stderr: "ignore",
  });
  // Stdout capture: the revenge-timer + gate-reject lifecycles are slog-only
  // observables (an orphaned timer and a cleared one are wire-identical
  // inside a test window — only the server's own "revenge_timer" events
  // distinguish them, and the M7 sweep's rejections are deliberately silent
  // on the wire, so "revenge_gate_reject" is their only positive trace).
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
let serverD: HunterServer | null = null;

beforeAll(async () => {
  [serverA, serverB, serverC, serverD] = await Promise.all([
    spawnServer(PORT_A, "A", BASE_ROLES),
    spawnServer(PORT_B, "B", BASE_ROLES, [HUNTER, P3]),
    spawnServer(PORT_C, "C", JOKER_ROLES, [HUNTER, P3]),
    spawnServer(PORT_D, "D", BASE_ROLES, undefined,
      { MAFIA_REVENGE_TIMER_MS: String(SHORT_REVENGE_MS) }),
  ]);
});

afterAll(() => {
  for (const srv of [serverA, serverB, serverC, serverD]) {
    if (!srv) continue;
    try { srv.proc.kill(); } catch {}
    for (const f of [srv.dbPath, `${srv.dbPath}-wal`, `${srv.dbPath}-shm`]) {
      try { unlinkSync(f); } catch {}
    }
  }
});

// ── WS harness (copied from tests/hunter-ws-night.test.ts) ────────────────

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

/**
 * Collect EVERY message on ws for `durationMs`, then resolve with the list
 * (the handler-guards.test.ts bounded-collect pattern — used by the E8
 * sweep to assert strict wire silence across all rejected handlers).
 */
function collectFor(ws: WebSocket, durationMs: number): Promise<any[]> {
  return new Promise((resolve) => {
    const msgs: any[] = [];
    const h = (e: MessageEvent) => { msgs.push(JSON.parse(e.data)); };
    ws.addEventListener("message", h);
    setTimeout(() => { ws.removeEventListener("message", h); resolve(msgs); }, durationMs);
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
async function setupGame(srv: HunterServer, dealRoles: Role[], settings: Record<string, unknown>): Promise<HunterGame> {
  const prefix = `hwv_${ts}_${++gameCounter}`;
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

/**
 * Skip night 1 without a death: admin force_dawn → day 1 with everyone
 * alive (deterministic — no mafia dance needed before the lynch).
 */
async function forceDawnToDay(game: HunterGame): Promise<void> {
  const admin = game.players[ADMIN];
  const day = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "forced day");
  send(admin.ws, { type: "force_dawn" });
  await day;
  await Bun.sleep(100);
}

/**
 * Day-phase lynch: admin calls the vote on `target`, every voter approves,
 * vote_result awaited on the admin socket, fan-out settled.
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

function closeAll(game: HunterGame) {
  for (const p of game.players) { try { p.ws.close(); } catch {} }
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
// E4 — vote-path interrupt, base case: the hunter is lynched directly
// ═══════════════════════════════════════════════════════════════════════

describe("E4 base: hunter lynched by day vote", () => {
  test("vote_result + deaths precede the gate; no phase_change/cue while gated; revenge → auto-night resumes", async () => {
    const game = await setupGame(serverA!, BASE_ROLES, BASE_SETTINGS);
    const [admin, mafia, hunter, citA, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3], game.players[CIT_B],
    ];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    const result = await lynchByVote(game, hunter, game.players); // all 6 alive approve
    expect(result.executed).toBe(true);
    expect(result.targetName).toBe(hunter.username);
    const pending = await pendingP;
    expect(pending.hunterName).toBe(hunter.username);
    await Bun.sleep(150);

    // Execution beats precede the gate, on every inbox: vote_result <
    // player_died(hunter) < hunter_revenge_pending.
    for (const p of game.players) {
      const vrIdx = indexOfMsg(p.inbox, m => m.type === "vote_result");
      const diedIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
      const pendingIdx = indexOfMsg(p.inbox, m => m.type === "hunter_revenge_pending");
      expect(vrIdx).toBeGreaterThanOrEqual(0);
      expect(diedIdx).toBeGreaterThan(vrIdx);
      expect(pendingIdx).toBeGreaterThan(diedIdx);
    }
    const youDiedIdx = indexOfMsg(hunter.inbox, m => m.type === "you_died");
    expect(youDiedIdx).toBeGreaterThanOrEqual(0);
    expect(youDiedIdx).toBeLessThan(indexOfMsg(hunter.inbox, m => m.type === "hunter_revenge_pending"));

    // The hunter — and ONLY the hunter — got the target list: the 5 living.
    const targetsMsg = hunter.inbox.find(m => m.type === "hunter_revenge_targets");
    expect(targetsMsg).toBeDefined();
    const targetIds = targetsMsg.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const livingIds = game.players.filter(p => p.userId !== hunter.userId).map(p => p.userId).sort((a, b) => a - b);
    expect(targetIds).toEqual(livingIds);
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue;
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // The auto-night is HELD: phase stays put — no phase_change beyond the
    // two so far (game-start night + forced day), no cue, no game_over.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(2);
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);

    // The revenge timeout is armed while gated.
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed"]);

    // ── Revenge: hunter shoots a citizen → deferred auto-night resumes ──
    const victimDiedP = waitFor(citA.ws, "you_died", 5000);
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "deferred auto-night");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });

    const victimDied = await victimDiedP;
    expect(victimDied.isLoverDeath).toBeUndefined();
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    // Closing messages: the revenge kill line + the night-falls line.
    expect(nightChange.messages.length).toBe(2);
    expect(nightChange.messages[0]).toContain(citA.username);
    expect(Array.isArray(nightChange.events)).toBe(true);
    await Bun.sleep(150);

    // Order on the admin inbox: pending < player_died(victim) <
    // phase_change(night) < night cue; NO day cue after the gate opened
    // (the vote-path resume goes to night, never dawn).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === citA.userId);
    const ncIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "night", pIdx);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "night", pIdx);
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(ncIdx).toBeGreaterThan(vIdx);
    expect(cueIdx).toBeGreaterThan(ncIdx);
    expect(indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day", pIdx)).toBe(-1);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // Gate resolved → timer cleared (slog lifecycle, never orphaned).
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed", "cleared"]);

    // Night 2 genuinely runs: mafia is re-prompted and a plain dawn lands
    // (mafia-inbox-local index — never compared across inboxes).
    expect(indexOfMsg(mafia.inbox, m => m.type === "mafia_targets",
      indexOfMsg(mafia.inbox, m => m.type === "hunter_revenge_pending"))).toBeGreaterThan(-1);
    const day2P = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2");
    await mafiaSoloKill(mafia, citB);
    await day2P;
    // Exactly one gate ever opened.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);

  test("game_over by revenge from the voting phase: revenge kills the last mafia — town wins, no day cue", async () => {
    const game = await setupGame(serverA!, BASE_ROLES, BASE_SETTINGS);
    const [admin, mafia, hunter] = [game.players[ADMIN], game.players[MAFIA], game.players[HUNTER]];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    await lynchByVote(game, hunter, game.players);
    await pendingP;

    // Gated: no premature win evaluation on the pre-revenge board.
    await assertSilence(admin.ws, ["game_over", "phase_change", "sound_cue"], 600);

    const overP = waitFor(admin.ws, "game_over", 5000);
    send(hunter.ws, { type: "hunter_revenge", targetId: mafia.userId });
    const over = await overP;
    expect(over.winner).toBe("town");
    await Bun.sleep(150);

    // Sequence: pending < player_died(mafia) < phase_change(game_over) <
    // game_over — and NO day cue anywhere after the gate (the vote-path
    // game_over shape sends no cue, unlike the night-path golden #7).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === mafia.userId);
    const pcIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "game_over");
    const goIdx = indexOfMsg(admin.inbox, m => m.type === "game_over");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(pcIdx).toBeGreaterThan(vIdx);
    expect(goIdx).toBeGreaterThan(pcIdx);
    expect(indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day", pIdx)).toBe(-1);

    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed", "cleared"]);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E4 heartbreak: the lynch target is the hunter's LOVER (hunter not executed)
// ═══════════════════════════════════════════════════════════════════════

describe("E4 heartbreak: lover lynched, hunter dies of heartbreak mid-vote", () => {
  test("cascade deaths broadcast, then the gate; revenge → night", async () => {
    const game = await setupGame(serverB!, BASE_ROLES, LOVERS_SETTINGS);
    const [admin, mafia, hunter, lover, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3], game.players[CIT_B],
    ];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    const result = await lynchByVote(game, lover, game.players);
    expect(result.executed).toBe(true);
    expect(result.targetName).toBe(lover.username); // the HUNTER was not the executed player
    const pending = await pendingP;
    expect(pending.hunterName).toBe(hunter.username);
    await Bun.sleep(150);

    // Cascade beats precede the gate on the admin inbox: vote_result <
    // player_died(lover, direct) < player_died(hunter, heartbreak) < pending.
    const vrIdx = indexOfMsg(admin.inbox, m => m.type === "vote_result");
    const loverIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === lover.userId);
    const hunterIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
    const pendIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    expect(vrIdx).toBeGreaterThanOrEqual(0);
    expect(loverIdx).toBeGreaterThan(vrIdx);
    expect(hunterIdx).toBeGreaterThan(loverIdx);
    expect(pendIdx).toBeGreaterThan(hunterIdx);

    // Death labels keyed on cause (B3): the lover died direct, the hunter
    // of heartbreak.
    const loverDied = lover.inbox.find(m => m.type === "you_died");
    expect(loverDied.isLoverDeath).toBeUndefined();
    const hunterDied = hunter.inbox.find(m => m.type === "you_died");
    expect(hunterDied.isLoverDeath).toBe(true);

    // Only the hunter got targets: the 4 living players.
    const targetsMsg = hunter.inbox.find(m => m.type === "hunter_revenge_targets");
    expect(targetsMsg.players.map((p: any) => game.seatOfId.get(p.id)).sort())
      .toEqual(["P0", "P1", "P4", "P5"]);
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue;
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // Held while gated.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(2);
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);
    expect(revengeTimerEvents(serverB!, game.code)).toEqual(["armed"]);

    // Revenge → the deferred auto-night resumes.
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "deferred auto-night");
    send(hunter.ws, { type: "hunter_revenge", targetId: citB.userId });
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    // The revenge target was no lover: the closing phase_change carries no
    // loverDeathName (C5 note: the gated vote's own cascade name was
    // already announced via the death loop, never re-attached here).
    expect(nightChange.loverDeathName).toBeUndefined();
    await Bun.sleep(150);
    expect(revengeTimerEvents(serverB!, game.code)).toEqual(["armed", "cleared"]);
    // Night 2 prompts the mafia again (mafia-inbox-local index).
    expect(indexOfMsg(mafia.inbox, m => m.type === "mafia_targets",
      indexOfMsg(mafia.inbox, m => m.type === "hunter_revenge_pending"))).toBeGreaterThan(-1);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E4 official-joker variant: joker lynched, joker's lover is the hunter —
// the gate defers the HAUNT night (preserveHauntVoters payoff)
// ═══════════════════════════════════════════════════════════════════════

describe("E4 official-joker: lynched joker's lover is the hunter", () => {
  test("gate opens after the cascade; post-revenge the haunt night proceeds and the haunt lands on a FOR-voter", async () => {
    const game = await setupGame(serverC!, JOKER_ROLES, JOKER_SETTINGS);
    const [admin, mafia, hunter, joker, citB, citC] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3], game.players[CIT_B], game.players[CIT_C],
    ];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    const overlayP = waitFor(joker.ws, "joker_win_overlay", 8000);
    const result = await lynchByVote(game, joker, game.players); // all 6 are FOR-voters
    expect(result.executed).toBe(true);
    await pendingP;
    await overlayP; // official-mode joker win overlay still reaches the joker
    await Bun.sleep(150);

    // Cascade then gate: player_died(joker) < player_died(hunter) < pending.
    const jIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === joker.userId);
    const hIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
    const pendIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    expect(jIdx).toBeGreaterThanOrEqual(0);
    expect(hIdx).toBeGreaterThan(jIdx);
    expect(pendIdx).toBeGreaterThan(hIdx);
    expect(hunter.inbox.find(m => m.type === "you_died").isLoverDeath).toBe(true);

    // Held while gated — in particular the haunt night has NOT started: no
    // phase_change, no night cue, and no haunt prompt to the joker yet.
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);
    expect(joker.inbox.find(m => m.type === "joker_haunt_targets")).toBeUndefined();
    expect(revengeTimerEvents(serverC!, game.code)).toEqual(["armed"]);

    // ── Revenge resolves → the deferred HAUNT night begins ──────────────
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "deferred haunt night");
    const hauntPromptP = waitFor(joker.ws, "joker_haunt_targets", 5000);
    send(hunter.ws, { type: "hunter_revenge", targetId: citB.userId });
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    const hauntPrompt = await hauntPromptP;
    await Bun.sleep(150);

    // preserveHauntVoters observable on the wire: the haunt prompt arrived
    // AFTER the deferred night began, listing the still-living FOR-voters
    // (indices are joker-inbox-local — never compared across inboxes).
    const jPendIdx = indexOfMsg(joker.inbox, m => m.type === "hunter_revenge_pending");
    const ncIdx = indexOfMsg(joker.inbox, m => m.type === "phase_change" && m.phase === "night", jPendIdx);
    const hpIdx = indexOfMsg(joker.inbox, m => m.type === "joker_haunt_targets");
    expect(jPendIdx).toBeGreaterThanOrEqual(0);
    expect(ncIdx).toBeGreaterThan(jPendIdx);
    expect(hpIdx).toBeGreaterThan(ncIdx);
    expect(hauntPrompt.players.map((p: any) => game.seatOfId.get(p.id)).sort())
      .toEqual(["P0", "P1", "P5"]); // alive FOR-voters (P2-P4 dead)
    expect(revengeTimerEvents(serverC!, game.code)).toEqual(["armed", "cleared"]);

    // The haunt WORKS on a FOR-voter: joker haunts citC, mafia kills admin,
    // dawn announces both — mafia alone remains and wins.
    const hauntDone = waitFor(joker.ws, "night_action_done", 5000);
    send(joker.ws, { type: "joker_haunt", targetId: citC.userId });
    await hauntDone;
    const overP = waitFor(mafia.ws, "game_over", 8000);
    await mafiaSoloKill(mafia, admin);
    const over = await overP;
    expect(over.winner).toBe("mafia");
    expect(over.jokerJointWinner).toBe(true); // §7: rides the payload unchanged
    await Bun.sleep(150);
    // The haunt victim's death is real and announced at dawn (mafia-inbox-
    // local search, from the mafia's own gate-open index).
    const mPendIdx = indexOfMsg(mafia.inbox, m => m.type === "hunter_revenge_pending");
    expect(indexOfMsg(mafia.inbox, m => m.type === "player_died" && m.playerId === citC.userId, mPendIdx)).toBeGreaterThan(-1);
    expect(citC.inbox.find(m => m.type === "you_died")).toBeDefined();

    closeAll(game);
  }, 60000);
});
