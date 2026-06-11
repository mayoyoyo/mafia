// Shared WS test harness for the Hunter revenge-flow suites
// (tests/hunter-ws-night.test.ts, tests/hunter-ws-vote.test.ts,
// tests/hunter-ws-rejoin.test.ts).
//
// Each of those three files used to carry its own drifted copy of this
// plumbing — spawnServer (with stdout slog capture), the
// waitFor/waitMatch/assertSilence/collectFor message helpers, openWS/send,
// regRecorded, setupGame, the night/vote flow drivers, rejoinRecorded, and
// the slog parsers. C8a extracts the UNION here so the upcoming C8 test
// files don't fork a 4th copy.
//
// Per-file specifics stay parameterized:
//   - each file keeps its OWN port band and its OWN /tmp DATABASE_PATH
//     (spawnServer takes the port + a dbLabel and writes
//     /tmp/mafia-hunter-ws-${dbLabel}-…);
//   - the fixed deal, lover pair, extra env (e.g. MAFIA_REVENGE_TIMER_MS),
//     and the join-order role assertion are spawnServer/setupGame args;
//   - setupGame's username prefix is a parameter (hwn_/hwv_/hwr_), so the
//     E13 role-secrecy sweep's "no username contains 'hunter'" guarantee is
//     preserved per file and games stay uniquely named.
//
// NOT extracted (test-specific assertion summarizers, deliberately left
// file-local): hunter-ws-night's summarizeSlice/SLICE_TYPES (the E6
// decline-path identity comparison) and hunter-ws-rejoin's leaksHunter (the
// E13 mechanical "hunter" sweep). Those interpret a file's own edge logic,
// not the wire transport.
//
// The other WS suites (golden-sequences, ten-player-regression, e2e,
// rejoin*, …) keep their own copies by design (C8a risk containment) and do
// NOT import this file.

import { unlinkSync } from "node:fs";
import { expect } from "bun:test";
import type { Role } from "../../src/types";

// ── Server subprocess ─────────────────────────────────────────────────────

export interface HunterServer {
  proc: ReturnType<typeof Bun.spawn>;
  wsUrl: string;
  dbPath: string;
  /** Accumulated server stdout (slog JSON lines) — pattern: structured-logging.test.ts. */
  logs: () => string;
}

export interface SpawnServerOptions {
  /** Lover pair as JOIN-ORDER indices, threaded into MAFIA_FIXED_DEAL (assignFixedRoles pairs them directly). */
  lovers?: [number, number];
  /** Extra env for the spawned server (e.g. MAFIA_REVENGE_TIMER_MS). */
  extraEnv?: Record<string, string>;
}

/**
 * Spawn a server subprocess on `port` with the fixed deal `dealRoles` (one
 * deal per process — the MAFIA_FIXED_DEAL env seam is process-wide), an
 * isolated /tmp DATABASE_PATH keyed on `dbLabel`+`label`+port, stdout piped
 * for slog assertions. Resolves once the WS endpoint accepts a connection.
 *
 * Stdout capture (structured-logging.test.ts pattern): the revenge-timer and
 * gate-reject lifecycles are slog-only observables — a cleared/orphaned/
 * re-armed timer is wire-identical inside a test window, and the M7 sweep's
 * rejections are deliberately silent on the wire, so the server's own
 * "revenge_timer" / "revenge_gate_reject" lines are the only positive trace.
 */
export async function spawnServer(
  port: number,
  label: string,
  dbLabel: string,
  dealRoles: Role[],
  opts: SpawnServerOptions = {},
): Promise<HunterServer> {
  const { lovers, extraEnv = {} } = opts;
  const wsUrl = `ws://localhost:${port}/ws`;
  const dbPath = `/tmp/mafia-hunter-ws-${dbLabel}-${label}-${Date.now()}-${port}.db`;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      MAFIA_FIXED_DEAL: JSON.stringify({ roles: dealRoles, ...(lovers ? { lovers } : {}) }),
      ...extraEnv,
    },
    cwd: import.meta.dir + "/../..",
    stdout: "pipe", stderr: "ignore",
  });
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

/** Kill a server subprocess and unlink its db + wal/shm sidecars (afterAll). */
export function teardownServer(srv: HunterServer | null): void {
  if (!srv) return;
  try { srv.proc.kill(); } catch {}
  for (const f of [srv.dbPath, `${srv.dbPath}-wal`, `${srv.dbPath}-shm`]) {
    try { unlinkSync(f); } catch {}
  }
}

// ── WS message helpers ─────────────────────────────────────────────────────

export function waitFor(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for: ${type}`)), timeout);
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === type) { clearTimeout(t); ws.removeEventListener("message", h); resolve(m); }
    };
    ws.addEventListener("message", h);
  });
}

export function waitMatch(ws: WebSocket, pred: (m: any) => boolean, timeout = 5000, label = "match"): Promise<any> {
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
export function assertSilence(ws: WebSocket, types: string[], windowMs: number): Promise<void> {
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
export function collectFor(ws: WebSocket, durationMs: number): Promise<any[]> {
  return new Promise((resolve) => {
    const msgs: any[] = [];
    const h = (e: MessageEvent) => { msgs.push(JSON.parse(e.data)); };
    ws.addEventListener("message", h);
    setTimeout(() => { ws.removeEventListener("message", h); resolve(msgs); }, durationMs);
  });
}

export function openWS(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => reject(new Error("WS open timeout")), 3000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS open error")); };
  });
}

export function send(ws: WebSocket, msg: any) { ws.send(JSON.stringify(msg)); }

// ── Players + games ────────────────────────────────────────────────────────

export interface HunterPlayer {
  ws: WebSocket;
  userId: number;
  username: string;
  pin: string;
  seat: string;   // "P0".."P5" in join order
  inbox: any[];   // every raw message received, in order, across reconnects
}

/** Register a user with an always-on inbox recorder attached at open. */
export async function regRecorded(wsUrl: string, name: string, pin: string, seat: string): Promise<HunterPlayer> {
  const ws = await openWS(wsUrl);
  const inbox: any[] = [];
  ws.addEventListener("message", (e: MessageEvent) => inbox.push(JSON.parse(e.data)));
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, pin, seat, inbox };
}

export interface HunterGame {
  code: string;
  players: HunterPlayer[];
  seatOfId: Map<number, string>;
  seatOfName: Map<string, string>;
}

let gameCounter = 0;
const ts = Date.now();

export interface SetupGameOptions {
  /** Username prefix per file (hwn_/hwv_/hwr_) — keeps games uniquely named and "hunter"-free. */
  prefix: string;
  dealRoles: Role[];
  settings: Record<string, unknown>;
}

/**
 * Register `dealRoles.length` recorded clients, create/join in seat order,
 * apply settings, start, assert the fixed deal landed, and drop the Begin
 * Night gate. Returns with night 1 running (mafia sub-phase).
 */
export async function setupGame(srv: HunterServer, opts: SetupGameOptions): Promise<HunterGame> {
  const { prefix, dealRoles, settings } = opts;
  const namePrefix = `${prefix}_${ts}_${++gameCounter}`;
  const players: HunterPlayer[] = [];
  for (let i = 0; i < dealRoles.length; i++) {
    players.push(await regRecorded(srv.wsUrl, `${namePrefix}_${i}`, String(1000 + i), `P${i}`));
  }
  const admin = players[0];

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

// ── Flow drivers ───────────────────────────────────────────────────────────

/**
 * Skip night 1 without a death: admin force_dawn → day 1 with everyone
 * alive (deterministic — no mafia dance needed before the lynch).
 */
export async function forceDawnToDay(game: HunterGame): Promise<void> {
  const admin = game.players[0];
  const day = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "forced day");
  send(admin.ws, { type: "force_dawn" });
  await day;
  await Bun.sleep(100);
}

/**
 * Day-phase lynch: admin calls the vote on `target`, every voter approves,
 * vote_result awaited on the admin socket, fan-out settled.
 */
export async function lynchByVote(game: HunterGame, target: HunterPlayer, voters: HunterPlayer[]): Promise<any> {
  const admin = game.players[0];
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
export async function mafiaSoloKill(mafia: HunterPlayer, target: HunterPlayer): Promise<void> {
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
 * Night 1: mafia kills the hunter (seat index `hunterSeat`), then await the
 * gate opening on the admin socket (NIGHT-path gate: phase "night",
 * nightSubPhase null). Returns the pending message seen by the admin.
 */
export async function killHunterAndAwaitGate(
  game: HunterGame, adminSeat = 0, mafiaSeat = 1, hunterSeat = 2,
): Promise<any> {
  const pendingPromise = waitFor(game.players[adminSeat].ws, "hunter_revenge_pending", 8000);
  await mafiaSoloKill(game.players[mafiaSeat], game.players[hunterSeat]);
  const pending = await pendingPromise;
  await Bun.sleep(150); // let per-socket fan-out settle on every inbox
  return pending;
}

export function closeAll(game: HunterGame) {
  for (const p of game.players) { try { p.ws.close(); } catch {} }
}

/**
 * Disconnect + reconnect a player, buffering every post-login message for
 * `settleMs` after join_game. The new socket's recorder ALSO appends to the
 * player's running inbox (E13 sweeps span reconnects), and player.ws is
 * swapped so later actions ride the new socket. Returns the rejoin slice.
 */
export async function rejoinRecorded(srv: HunterServer, p: HunterPlayer, code: string, settleMs = 700): Promise<any[]> {
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

// ── Slog parsers + inbox utility ─────────────────────────────────────────────

export function slogEvents(srv: HunterServer, slogName: string, code: string): any[] {
  return srv.logs()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.slog === slogName && e.code === code);
}

/**
 * THIS game's revenge-timer lifecycle ("armed"/"cleared"/"fired"/
 * "overwritten"), in server stdout order — parsed from the slog
 * "revenge_timer" lines, filtered by game code (other games on the same
 * server keep their own lifecycles out of the assertion).
 */
export function revengeTimerEvents(srv: HunterServer, code: string): string[] {
  return slogEvents(srv, "revenge_timer", code).map((e) => e.event as string);
}

/** THIS game's M7 sweep rejections: the message types the dispatch-level gate check bounced. */
export function revengeGateRejects(srv: HunterServer, code: string): string[] {
  return slogEvents(srv, "revenge_gate_reject", code).map((e) => e.type as string);
}

export function indexOfMsg(inbox: any[], pred: (m: any) => boolean, from = 0): number {
  for (let i = from; i < inbox.length; i++) if (pred(inbox[i])) return i;
  return -1;
}
