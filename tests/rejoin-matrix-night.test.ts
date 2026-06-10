import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

/**
 * T16a — Night-phase rejoin matrix (M9 verification).
 *
 * Closes the night-phase gaps left by tests/rejoin.test.ts:
 *   A. Dead-spectator rejoins during night sub-phases (mafia/doctor/detective)
 *   B. Haunting-joker rejoin (official joker mode): pending + resolved haunt
 *   C. Narrator-gate rejoins (awaitingNarratorReady, admin + non-admin)
 *   D. Admin rejoin mid-night retains admin power (force_dawn)
 *   E. Alive joker rejoin at night (no action, no leaks)
 *
 * Every game_sync is also checked for role-secrecy invariants: mafiaTeam is
 * only present for mafia rejoiners, detectiveHistory only for the detective.
 *
 * All scenarios rejoin during REAL sub-phases (role alive + enabled), so no
 * test ever sits through a fake 5-15s sub-phase delay.
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 11600 + Math.floor(Math.random() * 1000); // band 11600-12599
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-rejoin-matrix-${Date.now()}-${Math.floor(Math.random() * 10000)}.db`;

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

/** Collect all messages received on a ws until a specific type arrives. */
function collectUntil(ws: WebSocket, stopType: string, timeout = 5000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const msgs: any[] = [];
    const t = setTimeout(() => reject(new Error(`Timeout collecting until: ${stopType}`)), timeout);
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.type === stopType) { clearTimeout(t); ws.removeEventListener("message", h); resolve(msgs); }
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

let userCounter = 0;
async function reg(name: string, pin: string) {
  const ws = await openWS();
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, passcode: pin };
}

/** Login on a fresh WebSocket (simulates reconnect). */
async function login(username: string, passcode: string) {
  const ws = await openWS();
  send(ws, { type: "login", username, passcode });
  const r = await waitFor(ws, "logged_in");
  return { ws, userId: r.userId as number };
}

const ts = Date.now();
function uniqueName() { return `rjm_${ts}_${++userCounter}`; }

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: DB_PATH },
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

// ── Game setup helpers ─────────────────────────────────────────────────
interface TestPlayer { ws: WebSocket; userId: number; username: string; passcode: string; role?: string; }

async function setupGame(
  count: number,
  settings?: any,
  opts: { narratorReady?: boolean } = {},
): Promise<{ code: string; players: TestPlayer[] }> {
  const narratorReady = opts.narratorReady !== false;
  const players: TestPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const name = uniqueName();
    const pin = String(1000 + i);
    const p = await reg(name, pin);
    players.push({ ...p, passcode: pin });
  }

  send(players[0].ws, { type: "create_game" });
  const created = await waitFor(players[0].ws, "game_created");
  const code = created.code;

  for (let i = 1; i < count; i++) {
    send(players[i].ws, { type: "join_game", code });
    await waitFor(players[i].ws, "game_joined");
  }

  if (settings) {
    send(players[0].ws, { type: "update_settings", settings });
    await waitFor(players[0].ws, "settings_updated");
  }

  await Bun.sleep(100);

  const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
  const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));
  send(players[0].ws, { type: "start_game" });

  const started = await Promise.all(startedPromises);
  await Promise.all(phasePromises);

  for (let i = 0; i < count; i++) {
    players[i].role = started[i].role;
  }

  if (narratorReady) {
    // Drop the "Begin Night" gate so night sub-phases run
    send(players[0].ws, { type: "narrator_ready" });
    await Bun.sleep(200);
  }

  return { code, players };
}

/** Disconnect + reconnect a player, returning the game_sync message. */
async function rejoin(player: TestPlayer, code: string): Promise<any> {
  player.ws.close();
  await Bun.sleep(100);

  const fresh = await login(player.username, player.passcode);
  player.ws = fresh.ws;

  const collectPromise = collectUntil(player.ws, "game_sync");
  send(player.ws, { type: "join_game", code });
  const msgs = await collectPromise;

  const gameJoined = msgs.find(m => m.type === "game_joined");
  const gameSync = msgs.find(m => m.type === "game_sync");
  expect(gameJoined).toBeDefined();
  expect(gameSync).toBeDefined();

  // Atomicity: no old-style rejoin messages interleaved
  const oldTypes = msgs.filter(m => m.type === "rejoin_state" || m.type === "player_list");
  expect(oldTypes.length).toBe(0);

  return gameSync;
}

/**
 * Disconnect + reconnect, buffering EVERY message for `settleMs` after
 * join_game. Used when we must assert messages that arrive after game_sync
 * (or assert their absence).
 */
async function rejoinBuffered(player: TestPlayer, code: string, settleMs = 700): Promise<any[]> {
  player.ws.close();
  await Bun.sleep(100);

  const fresh = await login(player.username, player.passcode);
  player.ws = fresh.ws;

  const buf: any[] = [];
  player.ws.addEventListener("message", (e: MessageEvent) => buf.push(JSON.parse(e.data)));
  send(player.ws, { type: "join_game", code });
  await Bun.sleep(settleMs);

  expect(buf.find(m => m.type === "game_joined")).toBeDefined();
  expect(buf.filter(m => m.type === "game_sync").length).toBe(1);
  expect(buf.filter(m => m.type === "rejoin_state" || m.type === "player_list").length).toBe(0);
  return buf;
}

/** Role-secrecy invariants that must hold on every game_sync. */
function assertRoleSecrecy(sync: any) {
  if (sync.role !== "mafia") expect(sync.mafiaTeam).toBeUndefined();
  if (sync.role !== "detective") expect(sync.detectiveHistory).toBeUndefined();
}

/** Drive mafia consensus + confirm: maybe → lock for each alive mafia, then one confirms. */
async function mafiaKill(aliveMafia: TestPlayer[], target: TestPlayer) {
  const readyPromises = aliveMafia.map(m =>
    waitMatch(m.ws, x => x.type === "mafia_confirm_ready" && x.targetId === target.userId, 6000));
  for (const m of aliveMafia) {
    send(m.ws, { type: "mafia_vote", targetId: target.userId, voteType: "maybe" });
    send(m.ws, { type: "mafia_vote", targetId: target.userId, voteType: "lock" });
  }
  await Promise.all(readyPromises);
  const donePromise = waitFor(aliveMafia[0].ws, "night_action_done", 6000);
  send(aliveMafia[0].ws, { type: "confirm_mafia_kill" });
  await donePromise;
}

function closeAll(players: TestPlayer[]) {
  for (const p of players) { try { p.ws.close(); } catch {} }
}

// ═══════════════════════════════════════════════════════════════════════
// A. Dead-spectator rejoins during night sub-phases
// ═══════════════════════════════════════════════════════════════════════

describe("A. Dead spectators rejoining during night sub-phases", () => {
  test("dead citizen + dead mafia see correct spectator state in mafia/doctor/detective sub-phases", async () => {
    // 8 players: 2 mafia, doctor, detective, joker, 3 citizens
    const { code, players } = await setupGame(8, {
      mafiaCount: 2, enableDoctor: true, enableDetective: true,
      enableJoker: true, jokerMode: "official",
    });

    const admin = players[0];
    const mafias = players.filter(p => p.role === "mafia");
    const doctor = players.find(p => p.role === "doctor")!;
    const detective = players.find(p => p.role === "detective")!;
    const joker = players.find(p => p.role === "joker")!;
    const citizens = players.filter(p => p.role === "citizen");
    expect(mafias.length).toBe(2);
    expect(citizens.length).toBe(3);

    // ── Night 1: mafia kill a non-admin citizen; doctor + detective act ──
    const victim = citizens.find(c => c.userId !== admin.userId)!;
    await mafiaKill(mafias, victim);

    await waitFor(doctor.ws, "doctor_targets", 8000);
    send(doctor.ws, { type: "doctor_save", targetId: detective.userId });
    await waitFor(doctor.ws, "night_action_done", 6000);

    await waitFor(detective.ws, "detective_targets", 8000);
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 10000);
    send(detective.ws, { type: "detective_investigate", targetId: mafias[0].userId });
    await waitFor(detective.ws, "night_action_done", 6000);
    await dayPromise;
    await Bun.sleep(200);

    // ── Day 1: lynch a non-admin mafia (gives us a dead mafia spectator) ──
    const lynchedMafia = mafias.find(m => m.userId !== admin.userId)!;
    const aliveMafia = mafias.find(m => m.userId !== lynchedMafia.userId)!;
    send(admin.ws, { type: "call_vote", targetId: lynchedMafia.userId });
    await waitFor(admin.ws, "vote_called");
    const night2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 8000);
    const aliveVoters = players.filter(p => p.userId !== victim.userId);
    for (const p of aliveVoters) send(p.ws, { type: "cast_vote", approve: true });
    await night2Promise;
    await Bun.sleep(200);

    // ── Night 2, mafia sub-phase (real: one mafia still alive) ──────────
    // Surviving mafia casts a "maybe" vote so deliberation state is non-trivial
    const killTarget2 = citizens.find(c => c.userId !== victim.userId)!;
    send(aliveMafia.ws, { type: "mafia_vote", targetId: killTarget2.userId, voteType: "maybe" });
    await waitFor(aliveMafia.ws, "mafia_vote_update");

    // A1: dead CITIZEN rejoins during mafia sub-phase → spectator deliberation view
    const sync1 = await rejoin(victim, code);
    expect(sync1.phase).toBe("night");
    expect(sync1.round).toBe(2);
    expect(sync1.nightSubPhase).toBe("mafia");
    expect(sync1.isDead).toBe(true);
    expect(sync1.role).toBe("citizen");
    expect(sync1.nightAction).not.toBeNull();
    expect(sync1.nightAction.isSpectatorView).toBe(true);
    // mafia sub-phase spectator view carries deliberation fields, not spectatorSubPhase
    expect(sync1.nightAction.spectatorSubPhase).toBeUndefined();
    expect(sync1.nightAction.aliveMafiaCount).toBe(1);
    expect(sync1.nightAction.lockedTarget).toBeNull();
    // Targets = alive non-mafia (8 - victim - lynchedMafia = 6 alive, minus 1 mafia)
    expect(sync1.nightAction.targets.length).toBe(5);
    expect(sync1.nightAction.targets.every((t: any) => t.id !== aliveMafia.userId)).toBe(true);
    const m1Votes = sync1.nightAction.voterTargets[aliveMafia.username];
    expect(Array.isArray(m1Votes)).toBe(true);
    expect(m1Votes[0].target).toBe(killTarget2.username);
    expect(m1Votes[0].voteType).toBe("maybe");
    // No completed sub-phases yet → empty spectator log
    expect(Array.isArray(sync1.nightAction.spectatorLog)).toBe(true);
    expect(sync1.nightAction.spectatorLog.length).toBe(0);
    // Joker alive → no haunt status fields
    expect(sync1.nightAction.jokerDeliberating).toBeUndefined();
    expect(sync1.nightAction.jokerResolvedTarget).toBeUndefined();
    assertRoleSecrecy(sync1);

    // A2: dead MAFIA rejoins during mafia sub-phase → same spectator
    // deliberation view, but keeps mafia-team knowledge (role is mafia)
    const sync2 = await rejoin(lynchedMafia, code);
    expect(sync2.phase).toBe("night");
    expect(sync2.isDead).toBe(true);
    expect(sync2.role).toBe("mafia");
    expect(sync2.nightAction).not.toBeNull();
    expect(sync2.nightAction.isSpectatorView).toBe(true);
    expect(sync2.nightAction.aliveMafiaCount).toBe(1);
    const m1VotesForDeadMafia = sync2.nightAction.voterTargets[aliveMafia.username];
    expect(Array.isArray(m1VotesForDeadMafia)).toBe(true);
    expect(m1VotesForDeadMafia[0].target).toBe(killTarget2.username);
    // mafiaTeam IS allowed (rejoiner is mafia) — must list both mafia members
    expect(sync2.mafiaTeam).toBeDefined();
    expect(sync2.mafiaTeam.sort()).toEqual([mafias[0].username, mafias[1].username].sort());
    assertRoleSecrecy(sync2); // still: no detectiveHistory

    // Complete mafia sub-phase: lock + confirm the kill
    const readyPromise = waitMatch(aliveMafia.ws,
      m => m.type === "mafia_confirm_ready" && m.targetId === killTarget2.userId, 6000);
    send(aliveMafia.ws, { type: "mafia_vote", targetId: killTarget2.userId, voteType: "lock" });
    await readyPromise;
    const doctorTargetsPromise = waitFor(doctor.ws, "doctor_targets", 8000);
    send(aliveMafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(aliveMafia.ws, "night_action_done", 6000);
    await doctorTargetsPromise;

    // A3: dead citizen rejoins during DOCTOR sub-phase (real: doctor alive)
    const sync3 = await rejoin(victim, code);
    expect(sync3.phase).toBe("night");
    expect(sync3.nightSubPhase).toBe("doctor");
    expect(sync3.nightAction).not.toBeNull();
    expect(sync3.nightAction.isSpectatorView).toBe(true);
    expect(sync3.nightAction.spectatorSubPhase).toBe("doctor");
    expect(sync3.nightAction.spectatorSubPhaseAlive).toBe(true);
    // Spectator log shows the completed mafia sub-phase with its target
    expect(sync3.nightAction.spectatorLog.length).toBe(1);
    expect(sync3.nightAction.spectatorLog[0]).toEqual({
      phase: "mafia", targetName: killTarget2.username, alive: true,
    });
    assertRoleSecrecy(sync3);

    // Doctor saves the joker (night 1 saved the detective — no repeat-save rule hit)
    const detTargetsPromise = waitFor(detective.ws, "detective_targets", 8000);
    send(doctor.ws, { type: "doctor_save", targetId: joker.userId });
    await waitFor(doctor.ws, "night_action_done", 6000);
    await detTargetsPromise;

    // A4: dead player rejoins during DETECTIVE sub-phase (real: detective alive)
    const sync4 = await rejoin(lynchedMafia, code);
    expect(sync4.phase).toBe("night");
    expect(sync4.nightSubPhase).toBe("detective");
    expect(sync4.nightAction).not.toBeNull();
    expect(sync4.nightAction.isSpectatorView).toBe(true);
    expect(sync4.nightAction.spectatorSubPhase).toBe("detective");
    expect(sync4.nightAction.spectatorSubPhaseAlive).toBe(true);
    // Spectator log now has mafia + doctor entries in order
    expect(sync4.nightAction.spectatorLog.length).toBe(2);
    expect(sync4.nightAction.spectatorLog[0]).toEqual({
      phase: "mafia", targetName: killTarget2.username, alive: true,
    });
    expect(sync4.nightAction.spectatorLog[1]).toEqual({
      phase: "doctor", targetName: joker.username, alive: true,
    });
    assertRoleSecrecy(sync4);

    closeAll(players);
  }, 90000);
});

// ═══════════════════════════════════════════════════════════════════════
// B. Haunting-joker rejoin (official joker mode)
// ═══════════════════════════════════════════════════════════════════════

describe("B. Haunting joker rejoin (official mode)", () => {
  test("dead joker rejoin re-sends haunt targets while pending; spectators see deliberating → resolved", async () => {
    // 6 players: 1 mafia, 1 joker, 4 citizens (no doctor/detective → short nights)
    const { code, players } = await setupGame(6, {
      mafiaCount: 1, enableJoker: true, jokerMode: "official",
    });

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const jokerP = players.find(p => p.role === "joker")!;
    const citizens = players.filter(p => p.role === "citizen");
    expect(citizens.length).toBe(4);

    // ── Night 1: mafia kills a non-admin citizen ─────────────────────────
    const victim = citizens.find(c => c.userId !== admin.userId)!;
    const day1Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 10000);
    await mafiaKill([mafia], victim);
    await day1Promise;
    await Bun.sleep(200);

    // ── Day 1: lynch the joker — all 5 alive approve ─────────────────────
    send(admin.ws, { type: "call_vote", targetId: jokerP.userId });
    await waitFor(admin.ws, "vote_called");
    const hauntPromptPromise = waitFor(jokerP.ws, "joker_haunt_targets", 8000);
    const night2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 8000);
    const aliveVoters = players.filter(p => p.userId !== victim.userId);
    for (const p of aliveVoters) send(p.ws, { type: "cast_vote", approve: true });
    await night2Promise;

    // Live haunt prompt at night start: 5 approvers minus the (now dead) joker
    const livePrompt = await hauntPromptPromise;
    expect(livePrompt.players.length).toBe(4);
    await Bun.sleep(200);

    // ── Night 2, mafia sub-phase, haunt PENDING ──────────────────────────
    // B1: dead joker disconnects + rejoins → game_sync carries the pending
    // haunt AND the server re-sends joker_haunt_targets separately
    const jokerMsgs = await rejoinBuffered(jokerP, code);
    const jokerSync = jokerMsgs.find(m => m.type === "game_sync");
    expect(jokerSync.phase).toBe("night");
    expect(jokerSync.round).toBe(2);
    expect(jokerSync.isDead).toBe(true);
    expect(jokerSync.role).toBe("joker");
    expect(jokerSync.nightAction).not.toBeNull();
    expect(jokerSync.nightAction.jokerHauntPending).toBe(true);
    expect(jokerSync.nightAction.locked).toBe(false);
    expect(jokerSync.nightAction.targets.length).toBe(4);
    expect(jokerSync.nightAction.targets.every((t: any) => t.id !== jokerP.userId && t.id !== victim.userId)).toBe(true);
    assertRoleSecrecy(jokerSync);

    const resentPrompt = jokerMsgs.find(m => m.type === "joker_haunt_targets");
    expect(resentPrompt).toBeDefined();
    expect(resentPrompt.players.length).toBe(4);
    // game_sync arrives before the separate haunt-targets re-send
    expect(jokerMsgs.findIndex(m => m.type === "game_sync"))
      .toBeLessThan(jokerMsgs.findIndex(m => m.type === "joker_haunt_targets"));

    // B2: another DEAD player rejoins while haunt pending → jokerDeliberating
    const sync2 = await rejoin(victim, code);
    expect(sync2.isDead).toBe(true);
    expect(sync2.nightAction).not.toBeNull();
    expect(sync2.nightAction.isSpectatorView).toBe(true);
    expect(sync2.nightAction.jokerDeliberating).toBe(true);
    expect(sync2.nightAction.jokerResolvedTarget).toBeUndefined();
    assertRoleSecrecy(sync2);

    // ── Joker submits the haunt ──────────────────────────────────────────
    const hauntTarget = resentPrompt.players[0];
    send(jokerP.ws, { type: "joker_haunt", targetId: hauntTarget.id });
    await waitFor(jokerP.ws, "night_action_done", 6000);

    // B3: dead spectator rejoins after haunt resolved → jokerResolvedTarget
    const sync3 = await rejoin(victim, code);
    expect(sync3.nightAction).not.toBeNull();
    expect(sync3.nightAction.isSpectatorView).toBe(true);
    expect(sync3.nightAction.jokerResolvedTarget).toBe(hauntTarget.username);
    expect(sync3.nightAction.jokerDeliberating).toBeUndefined();
    assertRoleSecrecy(sync3);

    // B4: dead joker rejoins after submitting → locked haunt view, and the
    // joker_haunt_targets re-send must NOT fire (haunt no longer pending)
    const jokerMsgs2 = await rejoinBuffered(jokerP, code);
    const jokerSync2 = jokerMsgs2.find(m => m.type === "game_sync");
    expect(jokerSync2.nightAction).not.toBeNull();
    expect(jokerSync2.nightAction.locked).toBe(true);
    expect(jokerSync2.nightAction.targetName).toBe(hauntTarget.username);
    expect(jokerSync2.nightAction.jokerHauntPending).toBe(true);
    expect(jokerSync2.nightAction.targets.length).toBe(0);
    expect(jokerMsgs2.filter(m => m.type === "joker_haunt_targets").length).toBe(0);
    assertRoleSecrecy(jokerSync2);

    closeAll(players);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// C. Narrator-gate rejoins (awaitingNarratorReady)
// ═══════════════════════════════════════════════════════════════════════

describe("C. Narrator-gate rejoins (awaitingNarratorReady)", () => {
  test("admin rejoin during gate gets game_sync + awaiting_ready re-send; narrator_ready then proceeds", async () => {
    const { code, players } = await setupGame(4, undefined, { narratorReady: false });
    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;

    // Admin disconnects + rejoins while the Begin Night gate is up
    admin.ws.close();
    await Bun.sleep(100);
    const fresh = await login(admin.username, admin.passcode);
    admin.ws = fresh.ws;

    const collectPromise = collectUntil(admin.ws, "awaiting_ready", 5000);
    send(admin.ws, { type: "join_game", code });
    const msgs = await collectPromise;

    const sync = msgs.find(m => m.type === "game_sync");
    expect(msgs.find(m => m.type === "game_joined")).toBeDefined();
    expect(sync).toBeDefined();
    expect(sync.isAdmin).toBe(true);
    expect(sync.phase).toBe("night");
    expect(sync.round).toBe(1);
    expect(sync.nightSubPhase).toBe("mafia");
    expect(sync.awaitingNarratorReady).toBe(true);
    assertRoleSecrecy(sync);
    // Atomicity: game_sync first, then the separate awaiting_ready re-send
    expect(msgs.filter(m => m.type === "game_sync").length).toBe(1);
    expect(msgs.filter(m => m.type === "rejoin_state" || m.type === "player_list").length).toBe(0);
    expect(msgs.findIndex(m => m.type === "game_sync"))
      .toBeLessThan(msgs.findIndex(m => m.type === "awaiting_ready"));

    // Prove the game isn't wedged: narrator_ready from the NEW admin socket
    // starts the night sequence (mafia receives their prompt)
    const mafiaTargetsPromise = waitFor(mafia.ws, "mafia_targets", 6000);
    send(admin.ws, { type: "narrator_ready" });
    const mafiaTargets = await mafiaTargetsPromise;
    expect(mafiaTargets.players.length).toBeGreaterThan(0);

    closeAll(players);
  }, 20000);

  test("non-admin rejoin during gate sees gate up (no awaiting_ready); night proceeds after narrator_ready", async () => {
    const { code, players } = await setupGame(4, undefined, { narratorReady: false });
    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;

    // Prefer the mafia as rejoiner (richer night-action state); fall back to a citizen
    const rejoiner = mafia.userId !== admin.userId
      ? mafia
      : players.find(p => p.role === "citizen" && p.userId !== admin.userId)!;

    const msgs = await rejoinBuffered(rejoiner, code);
    const sync = msgs.find(m => m.type === "game_sync");
    expect(sync.phase).toBe("night");
    expect(sync.round).toBe(1);
    expect(sync.nightSubPhase).toBe("mafia");
    expect(sync.awaitingNarratorReady).toBe(true);
    expect(sync.isAdmin).toBe(false);
    expect(sync.isDead).toBe(false);
    assertRoleSecrecy(sync);
    // awaiting_ready is an admin-only re-send
    expect(msgs.filter(m => m.type === "awaiting_ready").length).toBe(0);

    // Night-action state consistent with the gate up: nothing has happened yet
    if (rejoiner.role === "mafia") {
      expect(sync.nightAction).not.toBeNull();
      expect(sync.nightAction.locked).toBe(false);
      expect(Object.keys(sync.nightAction.voterTargets).length).toBe(0);
    } else {
      expect(sync.nightAction).toBeNull();
    }

    // Admin (original socket) drops the gate — night proceeds normally
    const mafiaTargetsPromise = waitFor(mafia.ws, "mafia_targets", 6000);
    send(admin.ws, { type: "narrator_ready" });
    await mafiaTargetsPromise;

    // Fully unwedged: mafia can act
    const voteTarget = players.find(p => p.userId !== mafia.userId && p.role !== "mafia")!;
    send(mafia.ws, { type: "mafia_vote", targetId: voteTarget.userId, voteType: "maybe" });
    const update = await waitFor(mafia.ws, "mafia_vote_update", 6000);
    expect(update).toBeDefined();

    closeAll(players);
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════
// D. Admin rejoin mid-night (gate down) retains admin power
// ═══════════════════════════════════════════════════════════════════════

describe("D. Admin rejoin mid-night retains admin power", () => {
  test("rejoined admin has isAdmin:true and can force_dawn for all clients", async () => {
    const { code, players } = await setupGame(4);
    const admin = players[0];

    // Admin disconnects + rejoins during the mafia sub-phase
    const sync = await rejoin(admin, code);
    expect(sync.isAdmin).toBe(true);
    expect(sync.phase).toBe("night");
    expect(sync.round).toBe(1);
    expect(sync.nightSubPhase).toBe("mafia");
    expect(sync.awaitingNarratorReady).toBe(false);
    expect(sync.isDead).toBe(false);
    assertRoleSecrecy(sync);
    // Whatever role the admin drew, the sync must be internally consistent
    if (sync.role === "mafia") {
      expect(sync.nightAction).not.toBeNull();
    } else {
      expect(sync.nightAction).toBeNull();
    }

    // Retained admin power: force_dawn from the NEW socket flips everyone to day
    const dayPromises = players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 6000));
    send(admin.ws, { type: "force_dawn" });
    const phases = await Promise.all(dayPromises);
    for (const ph of phases) {
      expect(ph.phase).toBe("day");
      expect(ph.round).toBe(1);
    }

    closeAll(players);
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════
// E. Alive joker rejoin at night
// ═══════════════════════════════════════════════════════════════════════

describe("E. Alive joker rejoin at night", () => {
  test("alive joker rejoining during mafia sub-phase gets role joker, null nightAction, no leaks", async () => {
    // 5 players: 1 mafia, 1 joker, 3 citizens
    const { code, players } = await setupGame(5, {
      mafiaCount: 1, enableJoker: true, jokerMode: "official",
    });
    const jokerP = players.find(p => p.role === "joker")!;

    const sync = await rejoin(jokerP, code);
    expect(sync.phase).toBe("night");
    expect(sync.round).toBe(1);
    expect(sync.nightSubPhase).toBe("mafia");
    expect(sync.role).toBe("joker");
    expect(sync.isDead).toBe(false);
    // Joker has no night action — and must not see anyone else's
    expect(sync.nightAction).toBeNull();
    expect(sync.mafiaTeam).toBeUndefined();
    expect(sync.detectiveHistory).toBeUndefined();
    expect(sync.voteState).toBeNull();
    expect(sync.gameOver).toBeNull();

    closeAll(players);
  }, 20000);
});
