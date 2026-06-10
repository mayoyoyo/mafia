import { describe, test, expect, beforeAll, afterAll } from "bun:test";

/**
 * Night-action guard tests (T6 audit findings: M4, M7, L2).
 *
 * M4 — confirm_mafia_kill must verify the sender is an alive mafia member.
 * M7 — night actions must be rejected while awaitingNarratorReady is set
 *      (the "Begin Night" gate).
 * L2 — narrator_ready must be a no-op outside the night phase.
 *
 * Port range: 9600-10599 (e2e: 4567+, rejoin: 5567+, save-signal: 6567+,
 * handler-guards: 7600+, ten-player: 8600+)
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 9600 + Math.floor(Math.random() * 1000);
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-night-guards-${Date.now()}.db`;

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
function uniqueName() { return `ng_${ts}_${++userCounter}`; }

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
 * Register N players, admin creates game, others join, start.
 * Sends narrator_ready unless opts.narratorReady === false.
 * Returns players with .role populated from game_started.
 */
async function setupAndStart(
  count: number,
  opts: { narratorReady?: boolean } = {},
): Promise<{ code: string; players: TestPlayer[] }> {
  const players: TestPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const name = uniqueName();
    const pin = String(3000 + i);
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

  await Bun.sleep(100);

  const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
  const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));
  send(players[0].ws, { type: "start_game" });

  const started = await Promise.all(startedPromises);
  await Promise.all(phasePromises);

  if (opts.narratorReady !== false) {
    send(players[0].ws, { type: "narrator_ready" });
    await Bun.sleep(200);
  }

  for (let i = 0; i < count; i++) {
    players[i].role = started[i].role;
  }

  return { code, players };
}

// ═══════════════════════════════════════════════════════════════════════
// M4 — confirm_mafia_kill must verify sender is an alive mafia member
// ═══════════════════════════════════════════════════════════════════════

describe("M4: confirm_mafia_kill sender guard", () => {
  test("confirm_mafia_kill from a non-mafia player must NOT advance the night", async () => {
    const { players } = await setupAndStart(4);

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    const killTarget = citizens.find(p => p.userId !== admin.userId)!;
    // A citizen who is neither the admin nor the kill target sends the confirm
    const impostor = citizens.find(
      p => p.userId !== admin.userId && p.userId !== killTarget.userId
    ) ?? citizens.find(p => p.userId !== killTarget.userId)!;

    // Mafia reaches consensus (maybe → lock) but does NOT confirm
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");

    // The impostor citizen tries to end mafia deliberation
    const collector = collectFor(admin.ws, 2500);
    send(impostor.ws, { type: "confirm_mafia_kill" });

    const msgs = await collector;
    const dayChanges = msgs.filter(m => m.type === "phase_change" && m.phase === "day");
    expect(dayChanges.length).toBe(0);

    // Regression: the real mafia can still confirm and the night resolves
    send(mafia.ws, { type: "confirm_mafia_kill" });
    const day = await waitFor(admin.ws, "phase_change", 5000);
    expect(day.phase).toBe("day");

    for (const p of players) p.ws.close();
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════
// M7 — night actions must be rejected while awaitingNarratorReady is set
// ═══════════════════════════════════════════════════════════════════════

describe("M7: night actions blocked behind the Begin Night gate", () => {
  test("mafia cannot drive the night to resolution before narrator_ready", async () => {
    // Start the game but do NOT send narrator_ready — the gate is up
    const { players } = await setupAndStart(4, { narratorReady: false });

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;
    const citizens = players.filter(p => p.role === "citizen");
    const killTarget = citizens.find(p => p.userId !== admin.userId)!;

    // Scripted mafia client tries to vote, lock, and confirm during the gate
    const mafiaCollector = collectFor(mafia.ws, 2500);
    const adminCollector = collectFor(admin.ws, 2500);
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await Bun.sleep(150);
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await Bun.sleep(150);
    send(mafia.ws, { type: "confirm_mafia_kill" });

    const mafiaMsgs = await mafiaCollector;
    const adminMsgs = await adminCollector;
    expect(mafiaMsgs.filter(m => m.type === "mafia_vote_update").length).toBe(0);
    expect(mafiaMsgs.filter(m => m.type === "mafia_confirm_ready").length).toBe(0);
    expect(mafiaMsgs.filter(m => m.type === "night_action_done").length).toBe(0);
    expect(adminMsgs.filter(m => m.type === "phase_change" && m.phase === "day").length).toBe(0);

    // Regression: once the admin begins the night, the normal flow works
    send(admin.ws, { type: "narrator_ready" });
    await Bun.sleep(200);

    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");
    send(mafia.ws, { type: "confirm_mafia_kill" });
    const day = await waitFor(admin.ws, "phase_change", 5000);
    expect(day.phase).toBe("day");

    for (const p of players) p.ws.close();
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════
// L2 — narrator_ready must be a no-op outside the night phase
// ═══════════════════════════════════════════════════════════════════════

describe("L2: narrator_ready guard (no-op outside night phase)", () => {
  test("narrator_ready during DAY (after force_dawn during the gate) must NOT fire the night sequence", async () => {
    // Start the game but do NOT send narrator_ready — the gate is up
    const { players } = await setupAndStart(4, { narratorReady: false });

    const admin = players[0];
    const mafia = players.find(p => p.role === "mafia")!;

    // Admin forces dawn while the gate is still up → phase becomes "day"
    send(admin.ws, { type: "force_dawn" });
    const dawn = await waitFor(admin.ws, "phase_change", 5000);
    expect(dawn.phase).toBe("day");
    await Bun.sleep(100);

    // Admin now sends narrator_ready during the day — must be a no-op
    const mafiaCollector = collectFor(mafia.ws, 1500);
    send(admin.ws, { type: "narrator_ready" });

    const mafiaMsgs = await mafiaCollector;
    expect(mafiaMsgs.filter(m => m.type === "sound_cue" && m.sound === "night").length).toBe(0);
    expect(mafiaMsgs.filter(m => m.type === "mafia_targets").length).toBe(0);

    for (const p of players) p.ws.close();
  }, 15000);
});
