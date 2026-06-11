import { describe, test, expect, beforeAll, afterAll } from "bun:test";

/**
 * Handler guard tests (T5 audit findings: M1, M3, M10, L7).
 *
 * Each test verifies that a server handler ignores messages sent in the
 * wrong phase — no broadcast should arrive on an observer socket.
 *
 * Port range: 7600-8599 (e2e: 4567+, rejoin: 5567+, save-signal: 6567+)
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 7600 + Math.floor(Math.random() * 1000);
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-handler-guards-${Date.now()}.db`;

// ── Low-level helpers ──────────────────────────────────────────────────

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

/**
 * Collect all messages on ws for `durationMs` ms, then resolve with the list.
 * Used to assert that a FORBIDDEN message type does NOT arrive.
 */
function collectFor(ws: WebSocket, durationMs: number): Promise<any[]> {
  return new Promise((resolve) => {
    const msgs: any[] = [];
    const h = (e: MessageEvent) => { msgs.push(JSON.parse(e.data)); };
    ws.addEventListener("message", h);
    setTimeout(() => { ws.removeEventListener("message", h); resolve(msgs); }, durationMs);
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
const ts = Date.now();
function uniqueName() { return `hg_${ts}_${++userCounter}`; }

async function reg(name: string, pin: string) {
  const ws = await openWS();
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number, username: name, passcode: pin };
}

// ── Server lifecycle ───────────────────────────────────────────────────

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

afterAll(() => { try { serverProc?.kill(); } catch {} });

// ── Game setup helper ──────────────────────────────────────────────────

interface TestPlayer { ws: WebSocket; userId: number; username: string; passcode: string; role?: string; }

/**
 * Register N players, admin creates game, others join, start, narrator_ready.
 * Returns players with .role populated from game_started.
 */
async function setupAndStart(count: number, settings?: any): Promise<{ code: string; players: TestPlayer[] }> {
  const players: TestPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const name = uniqueName();
    const pin = String(2000 + i);
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

  send(players[0].ws, { type: "narrator_ready" });
  await Bun.sleep(200);

  for (let i = 0; i < count; i++) {
    players[i].role = started[i].role;
  }

  return { code, players };
}

/**
 * Drive a game from night → day → voting phase.
 * Mafia kills a non-admin citizen, then admin calls a vote on another player.
 * Returns the game setup so tests can probe state.
 */
async function driveToVoting(count: number): Promise<{
  code: string;
  players: TestPlayer[];
  admin: TestPlayer;
  observer: TestPlayer;
}> {
  const { code, players } = await setupAndStart(count);

  const admin = players[0];
  const mafia = players.find(p => p.role === "mafia")!;
  const citizens = players.filter(p => p.role === "citizen");
  // Kill a non-admin citizen
  const killTarget = citizens.find(p => p.userId !== admin.userId)!;

  send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
  await waitFor(mafia.ws, "mafia_vote_update");
  send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
  await waitFor(mafia.ws, "mafia_confirm_ready");
  send(mafia.ws, { type: "confirm_mafia_kill" });
  // Wait for day phase
  await waitFor(admin.ws, "phase_change");
  await Bun.sleep(100);

  // Admin calls a vote on a surviving player (not admin, not dead killTarget)
  const voteTarget = players.find(
    p => p.userId !== admin.userId && p.userId !== killTarget.userId
  )!;
  send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
  await waitFor(admin.ws, "vote_called");
  await Bun.sleep(100);

  // Pick an observer — alive, not the voteTarget
  const observer = players.find(
    p => p.userId !== admin.userId && p.userId !== killTarget.userId && p.userId !== voteTarget.userId
  ) ?? players.find(p => p.userId !== killTarget.userId)!;

  return { code, players, admin, observer };
}

// ═══════════════════════════════════════════════════════════════════════
// M1 — end_day must be a no-op when phase !== "day"
// ═══════════════════════════════════════════════════════════════════════

describe("M1: end_day guard (no-op outside day phase)", () => {
  test("end_day during VOTING must NOT broadcast phase_change{night}", async () => {
    // Drive to voting phase
    const { players, admin, observer } = await driveToVoting(4);

    // Start collecting on observer BEFORE sending end_day
    const collector = collectFor(observer.ws, 1500);
    send(admin.ws, { type: "end_day" });

    const msgs = await collector;
    const nightChanges = msgs.filter(
      m => m.type === "phase_change" && m.phase === "night"
    );
    expect(nightChanges.length).toBe(0);

    for (const p of players) p.ws.close();
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════
// M3 — abstain_vote must be a no-op when phase !== "day"
// ═══════════════════════════════════════════════════════════════════════

describe("M3: abstain_vote guard (no-op outside day phase)", () => {
  test("abstain_vote during NIGHT must NOT broadcast phase_change{day}", async () => {
    // Night phase — game just started with narrator_ready
    const { code, players } = await setupAndStart(4);

    const admin = players[0];
    // Pick any non-admin as observer
    const observer = players.find(p => p.userId !== admin.userId)!;

    // We are in night phase now
    const collector = collectFor(observer.ws, 1500);
    send(admin.ws, { type: "abstain_vote" });

    const msgs = await collector;
    const dayChanges = msgs.filter(
      m => m.type === "phase_change" && m.phase === "day"
    );
    expect(dayChanges.length).toBe(0);

    for (const p of players) p.ws.close();
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════
// M10 — end_game must be a no-op when game is already game_over
// ═══════════════════════════════════════════════════════════════════════

describe("M10: end_game guard (no-op when already game_over)", () => {
  test("end_game after a NATURAL win must NOT broadcast a second game_over or phase_change", async () => {
    // 4 players, default settings: 1 mafia + 3 citizens.
    // Natural town win path:
    //   Night 1 — mafia kills a non-admin citizen (or a citizen if admin IS mafia).
    //   Day 1   — admin calls vote on the mafia; all 3 alive players approve → mafia dies → town wins.
    // Then admin sends end_game; guard must suppress any further broadcast.
    const { code, players } = await setupAndStart(4);

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");

    // Choose kill target: a non-admin citizen (so admin survives and can call votes).
    // If admin IS mafia there are 3 citizens; any of them works.
    const killTarget = citizens.find(p => p.userId !== admin.userId) ?? citizens[0];

    // ── Night 1: drive the mafia kill ──────────────────────────────
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    // Wait for day phase (resolving takes ~1 s on server; bounded by 5 s)
    await waitFor(admin.ws, "phase_change", 5000);
    await Bun.sleep(100);

    // ── Day 1: lynch the mafia → natural town win ──────────────────
    // After the night kill, 3 players are alive: mafia + 2 others (one of whom is admin
    // if admin is citizen, or admin + 2 citizens if admin is mafia).
    // Admin calls vote on the mafia player regardless.
    send(admin.ws, { type: "call_vote", targetId: mafia.userId });
    await waitFor(admin.ws, "vote_called");

    // All 3 alive players approve.  Cast from each alive player's socket.
    // Alive = everyone except killTarget.
    const alivePlayers = players.filter(p => p.userId !== killTarget.userId);
    expect(alivePlayers.length).toBe(3);

    // Collect the natural game_over on the observer socket before sending votes.
    // Pick observer = first alive player who is not admin (so not the vote-caller).
    const observer = alivePlayers.find(p => p.userId !== admin.userId)!;
    const naturalGameOverPromise = waitFor(observer.ws, "game_over", 5000);

    for (const p of alivePlayers) {
      send(p.ws, { type: "cast_vote", approve: true });
    }

    const naturalGameOver = await naturalGameOverPromise;
    // Verify it is a genuine town win (no forceEnded flag)
    expect(naturalGameOver.winner).toBe("town");
    expect(naturalGameOver.forceEnded).toBeFalsy();
    await Bun.sleep(100);

    // ── Guard check: end_game after game_over must be a no-op ──────
    const collector = collectFor(observer.ws, 1500);
    send(admin.ws, { type: "end_game" });

    const msgs = await collector;
    const extraGameOvers = msgs.filter(m => m.type === "game_over");
    const extraPhaseChanges = msgs.filter(m => m.type === "phase_change");
    expect(extraGameOvers.length).toBe(0);
    expect(extraPhaseChanges.length).toBe(0);

    for (const p of players) p.ws.close();
  }, 20000);

  // Regression: end_game during an active game still broadcasts game_over
  test("end_game during active game still broadcasts game_over (regression)", async () => {
    const { code, players } = await setupAndStart(4);

    const admin = players[0];
    const observer = players.find(p => p.userId !== admin.userId)!;

    // Observe the first (and only) game_over
    const gameOverPromise = waitFor(observer.ws, "game_over");
    send(admin.ws, { type: "end_game" });

    const gameOver = await gameOverPromise;
    expect(gameOver.forceEnded).toBe(true);
    expect(gameOver.message).toBe("Host has ended the game.");

    for (const p of players) p.ws.close();
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════
// L7 — cast_vote must NOT broadcast vote_update outside voting phase
// ═══════════════════════════════════════════════════════════════════════

describe("L7: cast_vote guard (no broadcast outside voting phase)", () => {
  test("cast_vote during NIGHT must NOT broadcast vote_update", async () => {
    // Game just started — we are in night phase
    const { code, players } = await setupAndStart(4);

    const admin = players[0];
    // Any alive player tries to cast a vote during night
    const voter = players.find(p => p.role !== "mafia")!;
    const observer = players.find(p => p.userId !== voter.userId)!;

    const collector = collectFor(observer.ws, 1500);
    send(voter.ws, { type: "cast_vote", approve: true });

    const msgs = await collector;
    const voteUpdates = msgs.filter(m => m.type === "vote_update");
    expect(voteUpdates.length).toBe(0);

    for (const p of players) p.ws.close();
  }, 10000);

  // Regression: cast_vote during an active vote still broadcasts vote_update
  test("cast_vote during voting phase still broadcasts vote_update (regression)", async () => {
    // 5-player game so there are extra alive players after one kill
    const { code, players } = await setupAndStart(5);

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    // Kill a non-admin citizen to get to day
    const killTarget = citizens.find(p => p.userId !== admin.userId)!;

    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(100);

    // Admin calls vote on a surviving citizen (not admin, not dead)
    const voteTarget = citizens.find(
      p => p.userId !== admin.userId && p.userId !== killTarget.userId
    )!;
    send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
    await waitFor(admin.ws, "vote_called");
    await Bun.sleep(100);

    // Observer is any alive player other than admin and voteTarget
    const observer = players.find(
      p => p.userId !== admin.userId && p.userId !== voteTarget.userId &&
           p.userId !== killTarget.userId
    )!;
    // Voter is also alive, not the voteTarget or observer — pick admin to guarantee alive
    const voter = admin;

    const voteUpdatePromise = waitFor(observer.ws, "vote_update", 3000);
    send(voter.ws, { type: "cast_vote", approve: true });

    const voteUpdate = await voteUpdatePromise;
    expect(voteUpdate.type).toBe("vote_update");
    expect(typeof voteUpdate.totalVotes).toBe("number");

    for (const p of players) p.ws.close();
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════
// C1 (B8 finding) — start_game must be a silent no-op outside the lobby
// ═══════════════════════════════════════════════════════════════════════

describe("C1: start_game guard (no-op outside lobby)", () => {
  test("start_game during NIGHT is silently ignored: no error, no re-deal, no phase_change", async () => {
    // Game just started — we are in night phase
    const { code, players } = await setupAndStart(4);
    const admin = players[0];

    // Crafted-WS edge: admin re-sends start_game mid-game. The engine's
    // startGame already refuses (returns null), but without a handler-level
    // lobby guard the server falls through to the misleading
    // "Need at least 3 players to start" error. The guard makes this a
    // silent no-op, consistent with update_settings.
    const collector = collectFor(admin.ws, 1500);
    send(admin.ws, { type: "start_game" });

    const msgs = await collector;
    expect(msgs.filter(m => m.type === "error").length).toBe(0);
    expect(msgs.filter(m => m.type === "game_started").length).toBe(0);
    expect(msgs.filter(m => m.type === "phase_change").length).toBe(0);
    expect(msgs.filter(m => m.type === "awaiting_ready").length).toBe(0);

    for (const p of players) p.ws.close();
  }, 10000);
});
