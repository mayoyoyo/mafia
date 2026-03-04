import { describe, test, expect, beforeAll, afterAll } from "bun:test";

/**
 * Rejoin / game_sync E2E tests.
 *
 * These tests verify that when a player disconnects and reconnects mid-game,
 * the server sends a single atomic `game_sync` message with the complete
 * game state, covering every phase: night, day, voting, and game_over.
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 5567 + Math.floor(Math.random() * 1000);
const WS_URL = `ws://localhost:${PORT}/ws`;

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
function uniqueName() { return `rj_${ts}_${++userCounter}`; }

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: { ...process.env, PORT: String(PORT) },
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

// ── Helpers to set up a game with N players and start it ──────────────
interface TestPlayer { ws: WebSocket; userId: number; username: string; passcode: string; role?: string; }

async function setupAndStart(count: number, settings?: any): Promise<{ code: string; players: TestPlayer[] }> {
  const players: TestPlayer[] = [];

  // Register all players
  for (let i = 0; i < count; i++) {
    const name = uniqueName();
    const pin = String(1000 + i);
    const p = await reg(name, pin);
    players.push({ ...p, passcode: pin });
  }

  // Admin creates game
  send(players[0].ws, { type: "create_game" });
  const created = await waitFor(players[0].ws, "game_created");
  const code = created.code;

  // Others join
  for (let i = 1; i < count; i++) {
    send(players[i].ws, { type: "join_game", code });
    await waitFor(players[i].ws, "game_joined");
  }

  // Update settings if provided
  if (settings) {
    send(players[0].ws, { type: "update_settings", settings });
    await waitFor(players[0].ws, "settings_updated");
  }

  await Bun.sleep(100);

  // Start game — collect game_started for each to learn roles
  const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
  const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));
  send(players[0].ws, { type: "start_game" });

  const started = await Promise.all(startedPromises);
  await Promise.all(phasePromises);

  for (let i = 0; i < count; i++) {
    players[i].role = started[i].role;
  }

  return { code, players };
}

/** Disconnect + reconnect a player, returning the game_sync message. */
async function rejoin(player: TestPlayer, code: string): Promise<any> {
  player.ws.close();
  await Bun.sleep(100);

  const fresh = await login(player.username, player.passcode);
  player.ws = fresh.ws;

  // Collect messages after join_game — we expect game_joined then game_sync
  const collectPromise = collectUntil(player.ws, "game_sync");
  send(player.ws, { type: "join_game", code });
  const msgs = await collectPromise;

  const gameJoined = msgs.find(m => m.type === "game_joined");
  const gameSync = msgs.find(m => m.type === "game_sync");
  expect(gameJoined).toBeDefined();
  expect(gameSync).toBeDefined();

  // Verify NO old-style rejoin messages are sent
  const oldTypes = msgs.filter(m =>
    m.type === "rejoin_state" || m.type === "player_list"
  );
  expect(oldTypes.length).toBe(0);

  return gameSync;
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Rejoin during night phase", () => {
  test("game_sync contains correct state when rejoining during night (before action)", async () => {
    const { code, players } = await setupAndStart(4);

    // Find mafia player
    const mafia = players.find(p => p.role === "mafia")!;
    const citizen = players.find(p => p.role === "citizen")!;

    // Rejoin mafia before they've done anything
    const sync = await rejoin(mafia, code);

    expect(sync.type).toBe("game_sync");
    expect(sync.code).toBe(code);
    expect(sync.phase).toBe("night");
    expect(sync.round).toBe(1);
    expect(sync.role).toBe("mafia");
    expect(sync.isDead).toBe(false);
    expect(sync.players.length).toBe(4);
    expect(sync.nightAction).not.toBeNull();
    expect(sync.nightAction.locked).toBe(false);
    expect(sync.nightAction.targets.length).toBeGreaterThan(0);
    // No mafia should be in targets
    expect(sync.nightAction.targets.every((t: any) => t.id !== mafia.userId)).toBe(true);
    expect(sync.voteState).toBeNull();
    expect(sync.gameOver).toBeNull();

    // Cleanup
    for (const p of players) p.ws.close();
  }, 15000);

  test("game_sync shows locked action when mafia confirmed kill", async () => {
    // Use doctor to prevent night from auto-resolving after mafia confirm
    const { code, players } = await setupAndStart(5, { enableDoctor: true });

    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");

    if (citizens.length === 0) { for (const p of players) p.ws.close(); return; }

    // Mafia votes and slide-confirms (doctor hasn't acted, so night stays open)
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(mafia.ws, "night_action_done");
    await Bun.sleep(100);

    // Verify still night (doctor hasn't acted)
    // Now rejoin mafia
    const sync = await rejoin(mafia, code);

    expect(sync.phase).toBe("night");
    expect(sync.nightAction).not.toBeNull();
    expect(sync.nightAction.locked).toBe(true);
    expect(sync.nightAction.targetName).toBe(citizens[0].username);
    expect(sync.nightAction.targets.length).toBe(0); // no targets when locked

    for (const p of players) p.ws.close();
  }, 15000);

  test("game_sync shows locked action for doctor after saving", async () => {
    // Use detective too so night doesn't auto-resolve after doctor + mafia
    const { code, players } = await setupAndStart(6, { enableDoctor: true, enableDetective: true });

    const doctor = players.find(p => p.role === "doctor");
    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    if (!doctor) { for (const p of players) p.ws.close(); return; }

    // Sequential night: must complete mafia sub-phase first
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(mafia.ws, "night_action_done");

    // Wait for doctor sub-phase to start (1.5s delay after mafia_close)
    await waitFor(doctor.ws, "doctor_targets");

    // Doctor saves someone
    const saveTarget = players.find(p => p.userId !== doctor.userId && p.role !== "mafia")!;
    send(doctor.ws, { type: "doctor_save", targetId: saveTarget.userId });
    await waitFor(doctor.ws, "night_action_done");
    await Bun.sleep(100);

    const sync = await rejoin(doctor, code);

    expect(sync.role).toBe("doctor");
    expect(sync.nightAction).not.toBeNull();
    expect(sync.nightAction.locked).toBe(true);
    expect(sync.nightAction.targetName).toBeTruthy();

    for (const p of players) p.ws.close();
  }, 20000);

  test("game_sync shows locked action for detective after investigating", async () => {
    // Use doctor too so night doesn't auto-resolve after detective + mafia
    const { code, players } = await setupAndStart(6, { enableDetective: true, enableDoctor: true });

    const detective = players.find(p => p.role === "detective");
    const mafia = players.find(p => p.role === "mafia")!;
    const doctor = players.find(p => p.role === "doctor");
    const citizens = players.filter(p => p.role === "citizen");
    if (!detective) { for (const p of players) p.ws.close(); return; }

    // Sequential night: complete mafia sub-phase first
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(mafia.ws, "night_action_done");

    // Wait for doctor sub-phase, then complete it
    if (doctor) {
      await waitFor(doctor.ws, "doctor_targets");
      const saveTarget = players.find(p => p.userId !== doctor.userId && p.role !== "mafia")!;
      send(doctor.ws, { type: "doctor_save", targetId: saveTarget.userId });
      await waitFor(doctor.ws, "night_action_done");
    }

    // Wait for detective sub-phase to start
    await waitFor(detective.ws, "detective_targets");

    // Detective investigates
    const target = players.find(p => p.role !== "detective" && p.role !== "mafia")!;
    send(detective.ws, { type: "detective_investigate", targetId: target.userId });
    await waitFor(detective.ws, "night_action_done");
    await Bun.sleep(100);

    const sync = await rejoin(detective, code);

    expect(sync.role).toBe("detective");
    expect(sync.nightAction).not.toBeNull();
    expect(sync.nightAction.locked).toBe(true);

    for (const p of players) p.ws.close();
  }, 25000);

  test("citizen gets null nightAction on rejoin during night", async () => {
    const { code, players } = await setupAndStart(4);

    const citizen = players.find(p => p.role === "citizen")!;
    const sync = await rejoin(citizen, code);

    expect(sync.phase).toBe("night");
    expect(sync.role).toBe("citizen");
    expect(sync.nightAction).toBeNull();

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Rejoin during day phase", () => {
  test("game_sync contains correct day state with timer", async () => {
    const { code, players } = await setupAndStart(4);

    // Complete night: mafia kills a citizen
    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });

    // Wait for day phase
    await waitFor(mafia.ws, "phase_change");
    await Bun.sleep(100);

    // Rejoin a surviving citizen
    const alive = citizens.find(p => p.userId !== citizens[0].userId)!;
    const sync = await rejoin(alive, code);

    expect(sync.phase).toBe("day");
    expect(sync.round).toBe(1);
    expect(sync.dayStartedAt).toBeGreaterThan(0);
    expect(sync.nightAction).toBeNull();
    expect(sync.voteState).toBeNull();
    expect(sync.gameOver).toBeNull();
    expect(sync.narratorHistory.length).toBeGreaterThan(0);
    expect(sync.eventHistory.length).toBeGreaterThan(0);

    for (const p of players) p.ws.close();
  }, 15000);

  test("dead player rejoining during day sees isDead = true", async () => {
    const { code, players } = await setupAndStart(4);

    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    const victim = citizens[0];

    // Mafia kills victim
    send(mafia.ws, { type: "mafia_vote", targetId: victim.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: victim.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(mafia.ws, "phase_change");
    await Bun.sleep(100);

    // Victim rejoins
    const sync = await rejoin(victim, code);

    expect(sync.phase).toBe("day");
    expect(sync.isDead).toBe(true);
    expect(sync.role).toBe("citizen");

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Rejoin during voting phase", () => {
  test("game_sync contains vote state when rejoining mid-vote", async () => {
    const { code, players } = await setupAndStart(6);

    // Complete night — mafia kills a citizen who is NOT the admin
    const mafia = players.find(p => p.role === "mafia")!;
    const admin = players[0];
    const citizens = players.filter(p => p.role === "citizen");
    const killTarget = citizens.find(p => p.userId !== admin.userId)!;
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(200);

    // Admin calls a vote on another surviving citizen
    const survivingCitizens = citizens.filter(p => p.userId !== killTarget.userId && p.userId !== admin.userId);
    const voteTarget = survivingCitizens[0] || mafia;
    send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
    await waitFor(admin.ws, "vote_called");
    await Bun.sleep(100);

    // A surviving non-admin player casts a vote
    const voter = players.find(p =>
      p.userId !== admin.userId && p.userId !== killTarget.userId &&
      p.userId !== voteTarget.userId
    )!;
    send(voter.ws, { type: "cast_vote", approve: true });
    await waitFor(admin.ws, "vote_update");
    await Bun.sleep(200);

    // Another surviving player who hasn't voted rejoins
    const nonVoter = players.find(p =>
      p.userId !== admin.userId && p.userId !== killTarget.userId &&
      p.userId !== voteTarget.userId && p.userId !== voter.userId
    );
    if (!nonVoter) { for (const p of players) p.ws.close(); return; }

    const sync = await rejoin(nonVoter, code);

    expect(sync.phase).toBe("voting");
    expect(sync.voteState).not.toBeNull();
    expect(sync.voteState.targetName).toBe(voteTarget.username);
    expect(sync.voteState.targetId).toBe(voteTarget.userId);
    expect(sync.voteState.hasVoted).toBe(false);
    expect(sync.voteState.totalVotes).toBeGreaterThanOrEqual(1);
    expect(sync.voteState.total).toBeGreaterThan(0);
    expect(sync.nightAction).toBeNull();

    for (const p of players) p.ws.close();
  }, 15000);

  test("game_sync shows hasVoted=true for player who already voted", async () => {
    const { code, players } = await setupAndStart(6);

    // Complete night — mafia kills a non-admin citizen
    const mafia = players.find(p => p.role === "mafia")!;
    const admin = players[0];
    const citizens = players.filter(p => p.role === "citizen");
    const killTarget = citizens.find(p => p.userId !== admin.userId)!;
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(200);

    // Find a surviving non-admin citizen to be the voter
    const voter = citizens.find(p => p.userId !== killTarget.userId && p.userId !== admin.userId)!;

    // Admin calls vote on mafia (safe target that's alive)
    send(admin.ws, { type: "call_vote", targetId: mafia.userId });
    await waitFor(voter.ws, "vote_called");

    // Voter casts a vote
    send(voter.ws, { type: "cast_vote", approve: true });
    await waitFor(admin.ws, "vote_update");
    await Bun.sleep(200);

    // Voter rejoins — should show hasVoted=true
    const sync = await rejoin(voter, code);

    expect(sync.voteState).not.toBeNull();
    expect(sync.voteState.hasVoted).toBe(true);

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Rejoin during game_over", () => {
  test("game_sync contains gameOver with correct winner", async () => {
    const { code, players } = await setupAndStart(4);

    // Force end the game
    const admin = players[0];
    send(admin.ws, { type: "end_game" });
    await waitFor(admin.ws, "game_over");
    await Bun.sleep(100);

    // Non-admin rejoins
    const other = players[1];
    const sync = await rejoin(other, code);

    expect(sync.phase).toBe("game_over");
    expect(sync.gameOver).not.toBeNull();
    expect(sync.gameOver.forceEnded).toBe(true);
    expect(sync.gameOver.message).toBe("Host has ended the game.");
    expect(sync.gameOver.revealPlayers.length).toBe(4);
    // Reveal players should include roles
    for (const p of sync.gameOver.revealPlayers) {
      expect(p.role).toBeDefined();
    }

    for (const p of players) p.ws.close();
  }, 15000);

  test("joker win is correctly reported on rejoin", async () => {
    const { code, players } = await setupAndStart(5, { enableJoker: true, jokerMode: "house" });

    const mafia = players.find(p => p.role === "mafia")!;
    const joker = players.find(p => p.role === "joker");
    const citizens = players.filter(p => p.role === "citizen");

    if (!joker) { for (const p of players) p.ws.close(); return; }

    // Night: mafia kills citizen
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(mafia.ws, "phase_change");
    await Bun.sleep(100);

    // Day: admin calls vote on joker, everyone votes yes
    const admin = players[0];
    send(admin.ws, { type: "call_vote", targetId: joker.userId });
    await waitFor(admin.ws, "vote_called");

    // All alive players vote yes — collect game_over on admin
    const gameOverPromise = waitFor(admin.ws, "game_over");
    const alivePlayers = players.filter(p => p.userId !== citizens[0].userId);
    for (const p of alivePlayers) {
      send(p.ws, { type: "cast_vote", approve: true });
    }
    await gameOverPromise;
    await Bun.sleep(100);

    // Rejoin a player who was alive
    const survivor = citizens.find(p => p.userId !== citizens[0].userId)!;
    const sync = await rejoin(survivor, code);

    expect(sync.phase).toBe("game_over");
    expect(sync.gameOver).not.toBeNull();
    expect(sync.gameOver.winner).toBe("joker");
    expect(sync.gameOver.message).toBe("Joker wins!");
    expect(sync.gameOver.forceEnded).toBe(false);

    for (const p of players) p.ws.close();
  }, 20000);
});

describe("Rejoin atomicity", () => {
  test("game_sync is the ONLY game-state message sent on rejoin (no player_list, rejoin_state, game_started, phase_change)", async () => {
    const { code, players } = await setupAndStart(4);

    const citizen = players.find(p => p.role === "citizen")!;
    citizen.ws.close();
    await Bun.sleep(100);

    const fresh = await login(citizen.username, citizen.passcode);
    citizen.ws = fresh.ws;

    // Set up collector BEFORE sending join_game
    const collectPromise = collectUntil(citizen.ws, "game_sync", 5000);
    send(citizen.ws, { type: "join_game", code });
    const allMsgs = await collectPromise;

    // Should only have game_joined + game_sync
    const types = allMsgs.map(m => m.type);
    expect(types).toContain("game_joined");
    expect(types).toContain("game_sync");
    expect(types).not.toContain("rejoin_state");
    expect(types).not.toContain("player_list");
    expect(types).not.toContain("game_started");
    expect(types).not.toContain("phase_change");
    expect(types).not.toContain("you_died");
    expect(types).not.toContain("game_over");

    for (const p of players) p.ws.close();
  }, 15000);

  test("lobby rejoin does NOT send game_sync", async () => {
    const players: TestPlayer[] = [];
    for (let i = 0; i < 3; i++) {
      const name = uniqueName();
      const pin = String(1000 + i);
      const p = await reg(name, pin);
      players.push({ ...p, passcode: pin });
    }

    send(players[0].ws, { type: "create_game" });
    const created = await waitFor(players[0].ws, "game_created");
    const code = created.code;

    send(players[1].ws, { type: "join_game", code });
    await waitFor(players[1].ws, "game_joined");

    // Disconnect and rejoin player 1 (not admin)
    players[1].ws.close();
    await Bun.sleep(100);

    const fresh = await login(players[1].username, players[1].passcode);
    players[1].ws = fresh.ws;

    // Collect messages after rejoin — should get game_joined + lobby_update, NOT game_sync
    const collectPromise = collectUntil(players[1].ws, "lobby_update");
    send(players[1].ws, { type: "join_game", code });
    const msgs = await collectPromise;

    const types = msgs.map(m => m.type);
    expect(types).toContain("game_joined");
    expect(types).toContain("lobby_update");
    expect(types).not.toContain("game_sync");

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Rejoin state accumulation", () => {
  test("narrator history and event history accumulate across rounds", async () => {
    const { code, players } = await setupAndStart(7);

    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    const admin = players[0];

    // Night 1: mafia kills citizen[0]
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(200);

    // Day 1: end day without voting
    // Set up mafia_targets listener BEFORE end_day triggers night
    const mafiaTargetsPromise = waitFor(mafia.ws, "mafia_targets");
    send(admin.ws, { type: "end_day" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(100);

    // Night 2: mafia kills citizen[1]
    const mafiaTargets = await mafiaTargetsPromise;
    const target2 = mafiaTargets.players.find((p: any) => p.id === citizens[1].userId);
    if (target2) {
      send(mafia.ws, { type: "mafia_vote", targetId: citizens[1].userId, voteType: "maybe" });
      await waitFor(mafia.ws, "mafia_vote_update");
      send(mafia.ws, { type: "mafia_vote", targetId: citizens[1].userId, voteType: "lock" });
      await waitFor(mafia.ws, "mafia_confirm_ready");
      send(mafia.ws, { type: "confirm_mafia_kill" });
      await waitFor(admin.ws, "phase_change");
      await Bun.sleep(100);
    }

    // Now rejoin a survivor — should have accumulated history
    const survivor = citizens.find(p => p.userId !== citizens[0].userId && p.userId !== citizens[1].userId)!;
    const sync = await rejoin(survivor, code);

    expect(sync.narratorHistory.length).toBeGreaterThanOrEqual(2);
    expect(sync.eventHistory.length).toBeGreaterThanOrEqual(1);
    expect(sync.round).toBeGreaterThanOrEqual(2);

    for (const p of players) p.ws.close();
  }, 20000);

  test("dayVoteCount is preserved on rejoin", async () => {
    const { code, players } = await setupAndStart(6);

    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    const admin = players[0];

    // Complete night
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(100);

    // Call a vote and cancel it (incrementing dayVoteCount)
    const voteTarget = citizens.find(p => p.userId !== citizens[0].userId)!;
    send(admin.ws, { type: "call_vote", targetId: voteTarget.userId });
    await waitFor(admin.ws, "vote_called");
    send(admin.ws, { type: "cancel_vote" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(100);

    // Rejoin
    const sync = await rejoin(admin, code);

    expect(sync.phase).toBe("day");
    expect(sync.dayVoteCount).toBe(1);

    for (const p of players) p.ws.close();
  }, 15000);

});

describe("Rejoin with force dawn", () => {
  test("rejoin after force dawn shows day phase correctly", async () => {
    const { code, players } = await setupAndStart(4);

    const admin = players[0];

    // Force dawn (skip night)
    send(admin.ws, { type: "force_dawn" });
    await waitFor(admin.ws, "phase_change");
    await Bun.sleep(100);

    const citizen = players.find(p => p.role === "citizen")!;
    const sync = await rejoin(citizen, code);

    expect(sync.phase).toBe("day");
    expect(sync.dayStartedAt).toBeGreaterThan(0);
    expect(sync.narratorHistory.length).toBeGreaterThan(0);

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Rejoin with mafia vote status", () => {
  test("game_sync includes partial mafia vote status", async () => {
    const { code, players } = await setupAndStart(7, { mafiaCount: 2 });

    const mafias = players.filter(p => p.role === "mafia");
    const citizens = players.filter(p => p.role === "citizen");

    if (mafias.length < 2) { for (const p of players) p.ws.close(); return; }

    // First mafia votes (maybe)
    send(mafias[0].ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafias[0].ws, "mafia_vote_update");
    await Bun.sleep(100);

    // Second mafia rejoins — should see first mafia's vote in voterTargets
    const sync = await rejoin(mafias[1], code);

    expect(sync.nightAction).not.toBeNull();
    expect(sync.nightAction.locked).toBe(false);
    expect(Object.keys(sync.nightAction.voterTargets).length).toBeGreaterThanOrEqual(1);
    const m0Votes = sync.nightAction.voterTargets[mafias[0].username];
    expect(Array.isArray(m0Votes)).toBe(true);
    expect(m0Votes.length).toBeGreaterThanOrEqual(1);
    expect(m0Votes[0].target).toBe(citizens[0].username);
    expect(m0Votes[0].voteType).toBe("maybe");

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Restart game (Play Again)", () => {
  test("restart_game sends new roles and night phase to all players", async () => {
    const { code, players } = await setupAndStart(4);

    // Force end the game
    const admin = players[0];
    send(admin.ws, { type: "end_game" });
    await waitFor(admin.ws, "game_over");
    await Bun.sleep(100);

    // Set up listeners BEFORE restart
    const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
    const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));

    send(admin.ws, { type: "restart_game" });

    const started = await Promise.all(startedPromises);
    const phases = await Promise.all(phasePromises);

    // All players get new roles
    for (const s of started) {
      expect(s.role).toBeTruthy();
    }

    // All enter night phase round 1
    for (const ph of phases) {
      expect(ph.phase).toBe("night");
      expect(ph.round).toBe(1);
    }

    // Roles are valid distribution (1 mafia, rest citizens for 4 players)
    const roles = started.map(s => s.role);
    expect(roles.filter(r => r === "mafia").length).toBe(1);

    for (const p of players) p.ws.close();
  }, 15000);

  test("rejoin after restart shows fresh game state", async () => {
    const { code, players } = await setupAndStart(4);

    // End game
    const admin = players[0];
    send(admin.ws, { type: "end_game" });
    await waitFor(admin.ws, "game_over");
    await Bun.sleep(100);

    // Restart
    const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
    const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));
    send(admin.ws, { type: "restart_game" });
    await Promise.all(startedPromises);
    await Promise.all(phasePromises);
    await Bun.sleep(100);

    // Citizen disconnects and rejoins
    const citizen = players.find(p => p.role !== "mafia")!;
    const sync = await rejoin(citizen, code);

    expect(sync.phase).toBe("night");
    expect(sync.round).toBe(1);
    expect(sync.isDead).toBe(false);
    expect(sync.gameOver).toBeNull();
    expect(sync.narratorHistory.length).toBeGreaterThan(0);
    expect(sync.dayVoteCount).toBe(0);

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Return to lobby", () => {
  test("return_to_lobby sends lobby_update to all players", async () => {
    const { code, players } = await setupAndStart(4);

    // End game
    const admin = players[0];
    send(admin.ws, { type: "end_game" });
    await waitFor(admin.ws, "game_over");
    await Bun.sleep(100);

    // Return to lobby — all players should get lobby_update
    const lobbyPromises = players.map(p => waitFor(p.ws, "lobby_update"));
    send(admin.ws, { type: "return_to_lobby" });
    const lobbies = await Promise.all(lobbyPromises);

    for (const lobby of lobbies) {
      expect(lobby.players.length).toBe(4);
      expect(lobby.settings).toBeDefined();
      expect(lobby.adminName).toBeTruthy();
    }

    for (const p of players) p.ws.close();
  }, 15000);

  test("rejoin during lobby after return_to_lobby gets lobby_update (not game_sync)", async () => {
    const { code, players } = await setupAndStart(4);

    // End game then return to lobby
    const admin = players[0];
    send(admin.ws, { type: "end_game" });
    await waitFor(admin.ws, "game_over");
    await Bun.sleep(100);

    const lobbyPromises = players.map(p => waitFor(p.ws, "lobby_update"));
    send(admin.ws, { type: "return_to_lobby" });
    await Promise.all(lobbyPromises);
    await Bun.sleep(100);

    // Player disconnects and rejoins — should get lobby_update, NOT game_sync
    const player = players[1];
    player.ws.close();
    await Bun.sleep(100);

    const fresh = await login(player.username, player.passcode);
    player.ws = fresh.ws;

    const collectPromise = collectUntil(player.ws, "lobby_update");
    send(player.ws, { type: "join_game", code });
    const msgs = await collectPromise;

    const types = msgs.map(m => m.type);
    expect(types).toContain("game_joined");
    expect(types).toContain("lobby_update");
    expect(types).not.toContain("game_sync");

    for (const p of players) p.ws.close();
  }, 15000);

  test("can start a new game after return_to_lobby", async () => {
    const { code, players } = await setupAndStart(4);

    // End → return to lobby → start again
    const admin = players[0];
    send(admin.ws, { type: "end_game" });
    await waitFor(admin.ws, "game_over");
    await Bun.sleep(100);

    const lobbyPromises = players.map(p => waitFor(p.ws, "lobby_update"));
    send(admin.ws, { type: "return_to_lobby" });
    await Promise.all(lobbyPromises);
    await Bun.sleep(100);

    // Start new game
    const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
    const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));
    send(admin.ws, { type: "start_game" });

    const started = await Promise.all(startedPromises);
    const phases = await Promise.all(phasePromises);

    for (const s of started) expect(s.role).toBeTruthy();
    for (const ph of phases) {
      expect(ph.phase).toBe("night");
      expect(ph.round).toBe(1);
    }

    for (const p of players) p.ws.close();
  }, 15000);
});

describe("Rejoin during sequential night sub-phases", () => {
  test("rejoin during mafia sub-phase: mafia gets nightAction, others get null", async () => {
    const { code, players } = await setupAndStart(4);

    const mafia = players.find(p => p.role === "mafia")!;
    const citizen = players.find(p => p.role === "citizen")!;

    // During mafia sub-phase, rejoin mafia — should see targets
    const mafiaSync = await rejoin(mafia, code);
    expect(mafiaSync.phase).toBe("night");
    expect(mafiaSync.nightSubPhase).toBe("mafia");
    expect(mafiaSync.nightAction).not.toBeNull();
    expect(mafiaSync.nightAction.targets.length).toBeGreaterThan(0);

    // During mafia sub-phase, rejoin citizen — should see null nightAction
    const citizenSync = await rejoin(citizen, code);
    expect(citizenSync.phase).toBe("night");
    expect(citizenSync.nightSubPhase).toBe("mafia");
    expect(citizenSync.nightAction).toBeNull();

    for (const p of players) p.ws.close();
  }, 15000);

  test("rejoin during doctor sub-phase: doctor gets nightAction, mafia gets locked", async () => {
    const { code, players } = await setupAndStart(6, { enableDoctor: true, enableDetective: true });

    const mafia = players.find(p => p.role === "mafia")!;
    const doctor = players.find(p => p.role === "doctor");
    const citizens = players.filter(p => p.role === "citizen");
    if (!doctor) { for (const p of players) p.ws.close(); return; }

    // Complete mafia sub-phase
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: citizens[0].userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    await waitFor(mafia.ws, "night_action_done");

    // Wait for doctor sub-phase to start
    await waitFor(doctor.ws, "doctor_targets");

    // Rejoin mafia during doctor sub-phase — should show locked
    const mafiaSync = await rejoin(mafia, code);
    expect(mafiaSync.nightSubPhase).toBe("doctor");
    expect(mafiaSync.nightAction).not.toBeNull();
    expect(mafiaSync.nightAction.locked).toBe(true);

    for (const p of players) p.ws.close();
  }, 20000);
});
