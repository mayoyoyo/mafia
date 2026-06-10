import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

/**
 * T16b — Day / Voting / Game-over rejoin matrix (M9 closure).
 *
 * Closes the day-side gaps left by tests/rejoin.test.ts and
 * tests/rejoin-matrix-night.test.ts:
 *
 *   A. M9 closure (centerpiece): an alive-but-disconnected voter STALLS the
 *      vote (castVote's allVoted check ignores `connected` — by design); the
 *      guarantee is rejoin reliability: after rejoining they get correct
 *      voteState, cast the deciding vote, and the vote resolves for ALL
 *      clients with no double-counting and no tally leakage (T12).
 *   B. Voting-phase role matrix: alive mafia, the vote target themselves,
 *      a DEAD player (voteState is NOT alive-gated in buildGameSync — pinned
 *      here), and an alive joker.
 *   C. Day-phase gaps: alive doctor (no detectiveHistory), alive detective
 *      (detectiveHistory restored WITH entries), DEAD mafia (mafiaTeam is
 *      role-gated only, not alive-gated — pinned here), alive joker.
 *   D. Admin rejoin during day (call_vote works from the new socket) and
 *      mid-vote (cancel_vote works from the new socket).
 *   E. DEAD player rejoin at game_over after a natural town win.
 *
 * Roles are random — each test discovers them from game_started and picks
 * deterministic victims/targets among non-admin citizens. All games disable
 * unused special roles so no test sits through fake 5-15s sub-phases.
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 12600 + Math.floor(Math.random() * 1000); // band 12600-13599
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-rejoin-matrix-day-${Date.now()}-${Math.floor(Math.random() * 10000)}.db`;

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

/**
 * Assert that NONE of the given message types arrive on this ws for
 * `windowMs`. Used to prove the M9 vote stall (no resolution while an
 * alive voter is disconnected).
 */
function assertSilence(ws: WebSocket, types: string[], windowMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (types.includes(m.type)) {
        clearTimeout(t);
        ws.removeEventListener("message", h);
        reject(new Error(`Unexpected ${m.type} during stall window`));
      }
    };
    const t = setTimeout(() => { ws.removeEventListener("message", h); resolve(); }, windowMs);
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
function uniqueName() { return `rjd_${ts}_${++userCounter}`; }

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

async function setupGame(count: number, settings?: any): Promise<{ code: string; players: TestPlayer[] }> {
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

  // Drop the "Begin Night" gate so night sub-phases run
  send(players[0].ws, { type: "narrator_ready" });
  await Bun.sleep(200);

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
 * join_game. Used when we must assert absence of messages that would
 * arrive after game_sync.
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
// A. M9 closure — vote stall + rejoin + resolve
// ═══════════════════════════════════════════════════════════════════════

describe("A. M9 closure: disconnected alive voter stalls vote; rejoin + deciding vote resolves", () => {
  test("vote stalls at N-1 of N, rejoiner gets correct voteState, deciding vote resolves for all clients", async () => {
    // 6 players, lean: 1 mafia, 5 citizens, no doctor/detective/joker
    const { code, players } = await setupGame(6, {
      mafiaCount: 1, enableDoctor: false, enableDetective: false, enableJoker: false,
    });

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    // Non-admin citizens (>= 4 regardless of which role the admin drew)
    const nonAdminCitizens = players.filter(p => p.role === "citizen" && p.userId !== admin.userId);
    expect(nonAdminCitizens.length).toBeGreaterThanOrEqual(3);
    const victim = nonAdminCitizens[0];       // killed night 1
    const voteTarget = nonAdminCitizens[1];   // lynched (citizen → game continues)
    const disconnector = nonAdminCitizens[2]; // the M9 blocker

    // ── Night 1: mafia kills the victim ──────────────────────────────────
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 10000);
    await mafiaKill([mafia], victim);
    await dayPromise;
    await Bun.sleep(200);

    // ── Day 1: admin calls a vote on the target ──────────────────────────
    send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
    const called = await waitFor(admin.ws, "vote_called");
    expect(called.targetId).toBe(voteTarget.userId);
    expect(called.targetName).toBe(voteTarget.username);

    // ── The blocker disconnects (alive, hasn't voted) ────────────────────
    disconnector.ws.close();
    await Bun.sleep(200);

    // ── All OTHER alive players vote (4 of 5 alive) ──────────────────────
    const otherVoters = players.filter(p =>
      p.userId !== victim.userId && p.userId !== disconnector.userId);
    expect(otherVoters.length).toBe(4);
    for (let i = 0; i < otherVoters.length; i++) {
      const updatePromise = waitMatch(admin.ws,
        m => m.type === "vote_update" && m.totalVotes === i + 1, 5000);
      send(otherVoters[i].ws, { type: "cast_vote", approve: true });
      const update = await updatePromise;
      expect(update.total).toBe(5); // 5 alive: 6 players - 1 night kill
    }

    // Duplicate cast from an already-voted player must NOT bump the count
    const dupePromise = waitFor(admin.ws, "vote_update", 5000);
    send(otherVoters[0].ws, { type: "cast_vote", approve: true });
    const dupeUpdate = await dupePromise;
    expect(dupeUpdate.totalVotes).toBe(4); // still 4 of 5 — dupe ignored
    expect(dupeUpdate.total).toBe(5);

    // ── THE STALL (M9): no resolution while the alive voter is offline ───
    // By design the vote waits for ALL alive players; assert nothing
    // resolves for a generous 3s window.
    await assertSilence(admin.ws, ["vote_result", "player_died", "phase_change", "game_over"], 3000);

    // ── Rejoin: the blocker reconnects and receives correct voteState ────
    const rejoinMsgs = await rejoinBuffered(disconnector, code);
    expect(rejoinMsgs.filter(m => m.type === "vote_result").length).toBe(0); // still stalled
    const sync = rejoinMsgs.find(m => m.type === "game_sync");
    expect(sync.phase).toBe("voting");
    expect(sync.isDead).toBe(false);
    expect(sync.voteState).not.toBeNull();
    expect(sync.voteState.targetName).toBe(voteTarget.username);
    expect(sync.voteState.targetId).toBe(voteTarget.userId);
    expect(sync.voteState.hasVoted).toBe(false);
    expect(sync.voteState.totalVotes).toBe(4); // N-1 of N
    expect(sync.voteState.total).toBe(5);
    assertRoleSecrecy(sync);

    // ── The deciding vote: resolution reaches ALL clients ────────────────
    const resultPromises = players.map(p => waitFor(p.ws, "vote_result", 8000));
    const adminBufPromise = collectUntil(admin.ws,
      "phase_change", 8000);
    const rejoinerBufPromise = collectUntil(disconnector.ws, "phase_change", 8000);
    send(disconnector.ws, { type: "cast_vote", approve: true });

    const results = await Promise.all(resultPromises);
    for (const r of results) {
      expect(r.targetName).toBe(voteTarget.username);
      expect(r.executed).toBe(true);
      // T12: exact tallies must never appear on the wire
      expect("votesFor" in r).toBe(false);
      expect("votesAgainst" in r).toBe(false);
    }

    // Admin's message stream: final vote_update (5 of 5 — the rejoiner's
    // vote counted exactly once) → vote_result → player_died → phase_change
    const adminBuf = await adminBufPromise;
    const finalUpdate = adminBuf.find(m => m.type === "vote_update");
    expect(finalUpdate.totalVotes).toBe(5);
    expect(finalUpdate.total).toBe(5);
    const order = ["vote_update", "vote_result", "player_died", "phase_change"]
      .map(t => adminBuf.findIndex(m => m.type === t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
    const died = adminBuf.find(m => m.type === "player_died");
    expect(died.playerId).toBe(voteTarget.userId);
    expect(died.playerName).toBe(voteTarget.username);
    // Lynch applied; 4 alive (1 mafia vs 3 town) → game continues to night 2
    const phase = adminBuf.find(m => m.type === "phase_change");
    expect(phase.phase).toBe("night");
    expect(phase.round).toBe(2);

    // The rejoiner saw exactly ONE vote_result and the same consistent state
    const rejoinerBuf = await rejoinerBufPromise;
    expect(rejoinerBuf.filter(m => m.type === "vote_result").length).toBe(1);
    const rejoinerUpdate = rejoinerBuf.find(m => m.type === "vote_update");
    expect(rejoinerUpdate.totalVotes).toBe(5); // not double-counted

    closeAll(players);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// B. Voting-phase role matrix
// ═══════════════════════════════════════════════════════════════════════

describe("B. Voting-phase role matrix rejoins", () => {
  test("alive mafia, the vote target, a dead player, and an alive joker all get correct voteState", async () => {
    // 8 players: 2 mafia, 1 joker, 5 citizens
    const { code, players } = await setupGame(8, {
      mafiaCount: 2, enableDoctor: false, enableDetective: false,
      enableJoker: true, jokerMode: "official",
    });

    const admin = players[0];
    const mafias = players.filter(p => p.role === "mafia");
    const joker = players.find(p => p.role === "joker")!;
    const citizens = players.filter(p => p.role === "citizen");
    expect(mafias.length).toBe(2);
    expect(citizens.length).toBe(5);

    const nonAdminCitizens = citizens.filter(c => c.userId !== admin.userId);
    const victim = nonAdminCitizens[0];     // killed night 1 → the dead rejoiner
    const voteTarget = nonAdminCitizens[1]; // on trial → rejoins mid-vote

    // ── Night 1: mafia kill the victim ───────────────────────────────────
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 10000);
    await mafiaKill(mafias, victim);
    await dayPromise;
    await Bun.sleep(200);

    // ── Day 1: vote called; the TARGET casts the only vote (approve) ─────
    send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
    await waitFor(admin.ws, "vote_called");
    const updatePromise = waitFor(admin.ws, "vote_update", 5000);
    send(voteTarget.ws, { type: "cast_vote", approve: true });
    const update = await updatePromise;
    expect(update.totalVotes).toBe(1);
    expect(update.total).toBe(7); // 8 players - 1 night kill

    // B1: alive MAFIA rejoins mid-vote → voteState + mafiaTeam, no detectiveHistory
    const mafiaSync = await rejoin(mafias[0], code);
    expect(mafiaSync.phase).toBe("voting");
    expect(mafiaSync.role).toBe("mafia");
    expect(mafiaSync.isDead).toBe(false);
    expect(mafiaSync.voteState).not.toBeNull();
    expect(mafiaSync.voteState.targetId).toBe(voteTarget.userId);
    expect(mafiaSync.voteState.targetName).toBe(voteTarget.username);
    expect(mafiaSync.voteState.hasVoted).toBe(false);
    expect(mafiaSync.voteState.totalVotes).toBe(1);
    expect(mafiaSync.voteState.total).toBe(7);
    expect(mafiaSync.mafiaTeam).toBeDefined();
    expect([...mafiaSync.mafiaTeam].sort()).toEqual([mafias[0].username, mafias[1].username].sort());
    expect(mafiaSync.detectiveHistory).toBeUndefined();

    // B2: the VOTE TARGET rejoins → sees themselves on trial, hasVoted:true
    const targetSync = await rejoin(voteTarget, code);
    expect(targetSync.phase).toBe("voting");
    expect(targetSync.isDead).toBe(false);
    expect(targetSync.voteState).not.toBeNull();
    expect(targetSync.voteState.targetId).toBe(voteTarget.userId); // it's them
    expect(targetSync.voteState.targetName).toBe(voteTarget.username);
    expect(targetSync.voteState.hasVoted).toBe(true); // they cast the one vote
    expect(targetSync.voteState.totalVotes).toBe(1);
    assertRoleSecrecy(targetSync);

    // B3: DEAD player rejoins mid-vote. Pin actual buildGameSync gating
    // (src/server.ts ~516-527): voteState is built for ANY rejoiner while
    // phase === "voting" — it is NOT alive-gated. Dead players can't have
    // voted (castVote rejects dead voters), so hasVoted is false.
    const deadSync = await rejoin(victim, code);
    expect(deadSync.phase).toBe("voting");
    expect(deadSync.isDead).toBe(true);
    expect(deadSync.voteState).not.toBeNull(); // present even for the dead
    expect(deadSync.voteState.targetId).toBe(voteTarget.userId);
    expect(deadSync.voteState.hasVoted).toBe(false);
    expect(deadSync.voteState.totalVotes).toBe(1);
    expect(deadSync.voteState.total).toBe(7); // total counts ALIVE players only
    assertRoleSecrecy(deadSync);

    // B4: alive JOKER rejoins mid-vote → role joker, voteState, no leaks
    const jokerSync = await rejoin(joker, code);
    expect(jokerSync.phase).toBe("voting");
    expect(jokerSync.role).toBe("joker");
    expect(jokerSync.isDead).toBe(false);
    expect(jokerSync.voteState).not.toBeNull();
    expect(jokerSync.voteState.targetId).toBe(voteTarget.userId);
    expect(jokerSync.voteState.hasVoted).toBe(false);
    expect(jokerSync.mafiaTeam).toBeUndefined();
    expect(jokerSync.detectiveHistory).toBeUndefined();
    expect(jokerSync.nightAction).toBeNull();
    expect(jokerSync.gameOver).toBeNull();

    closeAll(players);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// C. Day-phase role-state gaps
// ═══════════════════════════════════════════════════════════════════════

describe("C. Day-phase rejoins: doctor, detective (with history), dead mafia, joker", () => {
  test("each role rejoins during day 2 with correct private state", async () => {
    // 9 players: 2 mafia, doctor, detective, joker, 4 citizens
    const { code, players } = await setupGame(9, {
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
    expect(citizens.length).toBe(4);

    const nonAdminCitizens = citizens.filter(c => c.userId !== admin.userId);
    const victim1 = nonAdminCitizens[0];
    const victim2 = nonAdminCitizens[1];

    // ── Night 1: kill victim1; doctor saves detective; detective IDs a mafia ──
    await mafiaKill(mafias, victim1);

    await waitFor(doctor.ws, "doctor_targets", 10000);
    send(doctor.ws, { type: "doctor_save", targetId: detective.userId });
    await waitFor(doctor.ws, "night_action_done", 6000);

    await waitFor(detective.ws, "detective_targets", 10000);
    const day1Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 12000);
    send(detective.ws, { type: "detective_investigate", targetId: mafias[0].userId });
    await waitFor(detective.ws, "detective_result", 6000);
    await day1Promise;
    await Bun.sleep(200);

    // ── Day 1: lynch a non-admin mafia (creates the dead-mafia rejoiner) ──
    const lynchedMafia = mafias.find(m => m.userId !== admin.userId)!;
    const survivingMafia = mafias.find(m => m.userId !== lynchedMafia.userId)!;
    send(admin.ws, { type: "call_vote", targetId: lynchedMafia.userId });
    await waitFor(admin.ws, "vote_called");
    const mafiaTargetsPromise = waitFor(survivingMafia.ws, "mafia_targets", 12000);
    const night2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 10000);
    const aliveDay1 = players.filter(p => p.userId !== victim1.userId);
    for (const p of aliveDay1) send(p.ws, { type: "cast_vote", approve: true });
    await night2Promise;
    await mafiaTargetsPromise;
    await Bun.sleep(200);

    // ── Night 2: kill victim2; doctor saves joker; detective IDs the joker ──
    await mafiaKill([survivingMafia], victim2);

    await waitFor(doctor.ws, "doctor_targets", 10000);
    send(doctor.ws, { type: "doctor_save", targetId: joker.userId });
    await waitFor(doctor.ws, "night_action_done", 6000);

    await waitFor(detective.ws, "detective_targets", 10000);
    const day2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 12000);
    send(detective.ws, { type: "detective_investigate", targetId: joker.userId });
    await waitFor(detective.ws, "detective_result", 6000);
    await day2Promise;
    await Bun.sleep(200);

    // ── Day 2 rejoins ─────────────────────────────────────────────────────
    // C1: alive DOCTOR — role + variant, NO detectiveHistory
    const doctorSync = await rejoin(doctor, code);
    expect(doctorSync.phase).toBe("day");
    expect(doctorSync.round).toBe(2);
    expect(doctorSync.role).toBe("doctor");
    expect(doctorSync.isDead).toBe(false);
    expect(typeof doctorSync.variant).toBe("number");
    expect(doctorSync.detectiveHistory).toBeUndefined();
    expect(doctorSync.mafiaTeam).toBeUndefined();
    expect(doctorSync.voteState).toBeNull();
    expect(doctorSync.nightAction).toBeNull();
    expect(doctorSync.dayStartedAt).toBeGreaterThan(0);

    // C2: alive DETECTIVE — full investigation history restored, with entries
    const detectiveSync = await rejoin(detective, code);
    expect(detectiveSync.phase).toBe("day");
    expect(detectiveSync.role).toBe("detective");
    expect(detectiveSync.isDead).toBe(false);
    expect(Array.isArray(detectiveSync.detectiveHistory)).toBe(true);
    expect(detectiveSync.detectiveHistory.length).toBe(2);
    expect(detectiveSync.detectiveHistory[0].round).toBe(1);
    expect(detectiveSync.detectiveHistory[0].targetName).toBe(mafias[0].username);
    expect(detectiveSync.detectiveHistory[0].isMafia).toBe(true);
    expect(detectiveSync.detectiveHistory[1].round).toBe(2);
    expect(detectiveSync.detectiveHistory[1].targetName).toBe(joker.username);
    expect(detectiveSync.detectiveHistory[1].isMafia).toBe(false);
    expect(detectiveSync.mafiaTeam).toBeUndefined();

    // C3: DEAD MAFIA — pin actual gating (src/server.ts ~562-567): mafiaTeam
    // is included for role === "mafia" regardless of isAlive, so a dead mafia
    // rejoiner keeps their team knowledge.
    const deadMafiaSync = await rejoin(lynchedMafia, code);
    expect(deadMafiaSync.phase).toBe("day");
    expect(deadMafiaSync.role).toBe("mafia");
    expect(deadMafiaSync.isDead).toBe(true);
    expect(deadMafiaSync.mafiaTeam).toBeDefined();
    expect([...deadMafiaSync.mafiaTeam].sort()).toEqual([mafias[0].username, mafias[1].username].sort());
    expect(deadMafiaSync.detectiveHistory).toBeUndefined();
    expect(deadMafiaSync.voteState).toBeNull();

    // C4: alive JOKER during day — no leaks, sane state
    const jokerSync = await rejoin(joker, code);
    expect(jokerSync.phase).toBe("day");
    expect(jokerSync.role).toBe("joker");
    expect(jokerSync.isDead).toBe(false);
    expect(jokerSync.mafiaTeam).toBeUndefined();
    expect(jokerSync.detectiveHistory).toBeUndefined();
    expect(jokerSync.voteState).toBeNull();
    expect(jokerSync.nightAction).toBeNull();
    expect(jokerSync.gameOver).toBeNull();

    closeAll(players);
  }, 90000);
});

// ═══════════════════════════════════════════════════════════════════════
// D. Admin rejoin during day / voting — retained powers
// ═══════════════════════════════════════════════════════════════════════

describe("D. Admin rejoin during day and voting retains admin powers", () => {
  test("rejoined admin can call_vote from new socket; rejoined admin can cancel_vote mid-vote", async () => {
    // 5 players, lean: 1 mafia, 4 citizens
    const { code, players } = await setupGame(5, {
      mafiaCount: 1, enableDoctor: false, enableDetective: false, enableJoker: false,
    });

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const nonAdminCitizens = players.filter(p => p.role === "citizen" && p.userId !== admin.userId);
    const victim = nonAdminCitizens[0];

    // ── Night 1 ───────────────────────────────────────────────────────────
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 10000);
    await mafiaKill([mafia], victim);
    await dayPromise;
    await Bun.sleep(200);

    // ── D1: admin rejoins during DAY ──────────────────────────────────────
    const daySync = await rejoin(admin, code);
    expect(daySync.isAdmin).toBe(true);
    expect(daySync.phase).toBe("day");
    expect(daySync.round).toBe(1);
    expect(daySync.dayStartedAt).toBeGreaterThan(0);
    expect(daySync.dayVoteCount).toBe(0);
    expect(daySync.voteState).toBeNull();
    expect(daySync.gameOver).toBeNull();
    assertRoleSecrecy(daySync);

    // Retained power: call_vote from the NEW socket reaches every client
    const voteTarget = nonAdminCitizens[1];
    const calledPromises = players
      .filter(p => p.userId !== admin.userId)
      .map(p => waitFor(p.ws, "vote_called", 6000));
    const adminCalledPromise = waitFor(admin.ws, "vote_called", 6000);
    send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
    const calls = [...(await Promise.all(calledPromises)), await adminCalledPromise];
    for (const c of calls) {
      expect(c.targetId).toBe(voteTarget.userId);
      expect(c.targetName).toBe(voteTarget.username);
    }

    // One non-admin voter casts so the vote is partially complete
    const voter = players.find(p =>
      p.userId !== admin.userId && p.userId !== victim.userId && p.userId !== voteTarget.userId)!;
    const updatePromise = waitFor(voter.ws, "vote_update", 5000);
    send(voter.ws, { type: "cast_vote", approve: true });
    await updatePromise;

    // ── D2: admin rejoins MID-VOTE ────────────────────────────────────────
    const voteSync = await rejoin(admin, code);
    expect(voteSync.isAdmin).toBe(true);
    expect(voteSync.phase).toBe("voting");
    expect(voteSync.dayVoteCount).toBe(1);
    expect(voteSync.voteState).not.toBeNull();
    expect(voteSync.voteState.targetId).toBe(voteTarget.userId);
    expect(voteSync.voteState.hasVoted).toBe(false);
    expect(voteSync.voteState.totalVotes).toBe(1);
    expect(voteSync.voteState.total).toBe(4); // 5 players - 1 night kill
    assertRoleSecrecy(voteSync);

    // Retained power: cancel_vote from the NEW socket flips everyone to day
    const cancelPromises = players.map(p =>
      waitMatch(p.ws, m => m.type === "phase_change" && m.phase === "day", 6000));
    send(admin.ws, { type: "cancel_vote" });
    const cancels = await Promise.all(cancelPromises);
    for (const c of cancels) {
      expect(c.phase).toBe("day");
      expect(c.messages).toContain("The vote has been cancelled by the admin.");
    }

    closeAll(players);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E. Dead player rejoin at game_over (natural win)
// ═══════════════════════════════════════════════════════════════════════

describe("E. Dead player rejoin at game_over after a natural win", () => {
  test("night-1 victim rejoins after town wins: full gameOver reveal, no stray re-prompts", async () => {
    // 4 players, lean: 1 mafia, 3 citizens
    const { code, players } = await setupGame(4, {
      mafiaCount: 1, enableDoctor: false, enableDetective: false, enableJoker: false,
    });

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const nonAdminCitizens = players.filter(p => p.role === "citizen" && p.userId !== admin.userId);
    const victim = nonAdminCitizens[0];

    // ── Night 1: mafia kills the victim ───────────────────────────────────
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 10000);
    await mafiaKill([mafia], victim);
    await dayPromise;
    await Bun.sleep(200);

    // ── Day 1: lynch the mafia → natural town win ─────────────────────────
    send(admin.ws, { type: "call_vote", targetId: mafia.userId });
    await waitFor(admin.ws, "vote_called");
    const gameOverPromise = waitFor(admin.ws, "game_over", 10000);
    const alive = players.filter(p => p.userId !== victim.userId);
    for (const p of alive) send(p.ws, { type: "cast_vote", approve: true });
    const liveOver = await gameOverPromise;
    expect(liveOver.winner).toBe("town");
    await Bun.sleep(200);

    // ── The DEAD victim rejoins at game_over ──────────────────────────────
    const msgs = await rejoinBuffered(victim, code);
    const sync = msgs.find(m => m.type === "game_sync");
    expect(sync.phase).toBe("game_over");
    expect(sync.isDead).toBe(true);
    expect(sync.gameOver).not.toBeNull();
    expect(sync.gameOver.winner).toBe("town");
    expect(sync.gameOver.message).toBe("Citizens win!");
    expect(sync.gameOver.forceEnded).toBe(false);
    expect(sync.gameOver.revealPlayers.length).toBe(4);
    for (const p of sync.gameOver.revealPlayers) {
      expect(p.role).toBeDefined();
    }
    expect(sync.voteState).toBeNull();
    expect(sync.nightAction).toBeNull();
    assertRoleSecrecy(sync);

    // No stray re-prompts arrive after the sync
    const strayTypes = [
      "mafia_targets", "doctor_targets", "detective_targets",
      "joker_haunt_targets", "mafia_confirm_ready", "awaiting_ready",
      "vote_called", "you_died", "game_over", "phase_change",
    ];
    expect(msgs.filter(m => strayTypes.includes(m.type)).length).toBe(0);

    closeAll(players);
  }, 60000);
});
