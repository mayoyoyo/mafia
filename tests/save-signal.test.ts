import { describe, test, expect, beforeAll, afterAll } from "bun:test";

/**
 * Anonymous save signal E2E test.
 *
 * In official doctor mode the save event is suppressed from eventHistory
 * (so the saved player's name never leaks), but the FACT of a save is
 * public. The post-night `phase_change` must carry `saved: true` so the
 * client's dawn suspense overlay can announce "The Doctor saved a life!"
 * without naming anyone.
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 6567 + Math.floor(Math.random() * 1000);
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-save-signal-${Date.now()}.db`;

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
  return { ws, userId: r.userId as number, username: name };
}

const ts = Date.now();
function uniqueName() { return `sv_${ts}_${++userCounter}`; }

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

describe("Anonymous save signal (official doctor mode)", () => {
  test("phase_change after a doctor save has saved=true and no named save event", async () => {
    interface TestPlayer { ws: WebSocket; userId: number; username: string; role?: string; }
    const players: TestPlayer[] = [];

    // Register 5 players
    for (let i = 0; i < 5; i++) {
      const p = await reg(uniqueName(), String(1000 + i));
      players.push(p);
    }

    // Admin creates game, others join
    send(players[0].ws, { type: "create_game" });
    const created = await waitFor(players[0].ws, "game_created");
    const code = created.code;
    for (let i = 1; i < 5; i++) {
      send(players[i].ws, { type: "join_game", code });
      await waitFor(players[i].ws, "game_joined");
    }

    // Official doctor mode
    send(players[0].ws, { type: "update_settings", settings: { mafiaCount: 1, enableDoctor: true, doctorMode: "official" } });
    await waitFor(players[0].ws, "settings_updated");
    await Bun.sleep(100);

    // Start game — discover roles from each client's game_started
    const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
    const phasePromises = players.map(p => waitFor(p.ws, "phase_change"));
    send(players[0].ws, { type: "start_game" });
    const started = await Promise.all(startedPromises);
    await Promise.all(phasePromises);
    for (let i = 0; i < players.length; i++) players[i].role = started[i].role;

    const mafia = players.find(p => p.role === "mafia")!;
    const doctor = players.find(p => p.role === "doctor")!;
    expect(mafia).toBeDefined();
    expect(doctor).toBeDefined();

    // Begin night
    send(players[0].ws, { type: "narrator_ready" });
    await Bun.sleep(200);

    // Mafia locks a citizen target
    const target = players.find(p => p.role === "citizen")!;
    send(mafia.ws, { type: "mafia_vote", targetId: target.userId, voteType: "maybe" });
    await waitFor(mafia.ws, "mafia_vote_update");
    send(mafia.ws, { type: "mafia_vote", targetId: target.userId, voteType: "lock" });
    await waitFor(mafia.ws, "mafia_confirm_ready");

    // Listen for the post-night day phase_change before confirming the kill
    const dayPhasePromise = waitMatch(players[0].ws, (m) => m.type === "phase_change" && m.phase === "day", 15000);

    send(mafia.ws, { type: "confirm_mafia_kill" });

    // Doctor saves the mafia's locked target during the doctor sub-phase
    await waitFor(doctor.ws, "doctor_targets", 10000);
    send(doctor.ws, { type: "doctor_save", targetId: target.userId });

    // Night resolves automatically — capture the day phase_change
    const dayPhase = await dayPhasePromise;

    expect(dayPhase.phase).toBe("day");
    expect(dayPhase.saved).toBe(true);
    // The name must stay secret: no "save" event in the broadcast event history
    const saveEvents = (dayPhase.events || []).filter((e: any) => e.type === "save");
    expect(saveEvents.length).toBe(0);

    for (const p of players) p.ws.close();
  }, 30000);
});
