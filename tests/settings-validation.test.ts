import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

/**
 * Settings validation + registration guard tests (T8 audit findings: M6b, M6c, L8).
 *
 * M6b — update_settings must whitelist/coerce settings (garbage rejected).
 * M6c — poisoned last_settings_json must be sanitized when loaded on create_game.
 * L8  — register must cap username length.
 *
 * Port range: 10600-10999 (e2e: 4567+, rejoin: 5567+, save-signal: 6567+,
 * handler-guards: 7600+, ten-player: 8600+, night-guards: 9600+)
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 10600 + Math.floor(Math.random() * 400);
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-settings-validation-${Date.now()}.db`;

// M6c seeds last_settings_json by opening the server's SQLite file directly
// (the src/db module can't be used here: it caches DATABASE_PATH at first
// import, which another test file may have already triggered in a full run).
function seedLastSettings(userId: number, json: string): string | null {
  const d = new Database(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL");
  d.query("UPDATE users SET last_settings_json = ? WHERE id = ?").run(json, userId);
  const row = d.query("SELECT last_settings_json FROM users WHERE id = ?").get(userId) as any;
  d.close();
  return row?.last_settings_json ?? null;
}

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
function uniqueName() { return `sv8_${ts}_${++userCounter}`; }

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

// ═══════════════════════════════════════════════════════════════════════
// M6b — update_settings must validate/coerce incoming settings
// ═══════════════════════════════════════════════════════════════════════

describe("M6b: update_settings validation", () => {
  test("garbage mafiaCount and unknown keys are rejected; game still starts with >=1 mafia", async () => {
    const admin = await reg(uniqueName(), "3001");
    const p2 = await reg(uniqueName(), "3002");
    const p3 = await reg(uniqueName(), "3003");
    const players = [admin, p2, p3];

    send(admin.ws, { type: "create_game" });
    const created = await waitFor(admin.ws, "game_created");
    const code = created.code;

    for (const p of [p2, p3]) {
      send(p.ws, { type: "join_game", code });
      await waitFor(p.ws, "game_joined");
    }

    // Admin sends garbage settings
    send(admin.ws, {
      type: "update_settings",
      settings: { mafiaCount: "lol", bogusKey: 123, enableDoctor: "yes" },
    });
    const updated = await waitFor(admin.ws, "settings_updated");

    // mafiaCount must remain a valid positive integer; bogus keys dropped
    expect(Number.isInteger(updated.settings.mafiaCount)).toBe(true);
    expect(updated.settings.mafiaCount).toBeGreaterThanOrEqual(1);
    expect(updated.settings.bogusKey).toBeUndefined();
    // "yes" must be dropped, leaving the default (false) — not coerced to true
    expect(updated.settings.enableDoctor).toBe(false);

    // Game must start with at least one mafia
    const startedPromises = players.map(p => waitFor(p.ws, "game_started"));
    send(admin.ws, { type: "start_game" });
    const started = await Promise.all(startedPromises);
    const mafiaRoles = started.filter(m => m.role === "mafia");
    expect(mafiaRoles.length).toBeGreaterThanOrEqual(1);

    for (const p of players) p.ws.close();
  }, 15000);

  test("legitimate settings still apply (regression)", async () => {
    const admin = await reg(uniqueName(), "3004");
    send(admin.ws, { type: "create_game" });
    await waitFor(admin.ws, "game_created");

    send(admin.ws, {
      type: "update_settings",
      settings: { mafiaCount: 2, enableJoker: true, jokerMode: "official" },
    });
    const updated = await waitFor(admin.ws, "settings_updated");
    expect(updated.settings.mafiaCount).toBe(2);
    expect(updated.settings.enableJoker).toBe(true);
    expect(updated.settings.jokerMode).toBe("official");

    admin.ws.close();
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════
// M6c — poisoned last_settings_json must be sanitized on create_game
// ═══════════════════════════════════════════════════════════════════════

describe("M6c: poisoned persisted settings are repaired on load", () => {
  test("create_game with poisoned last_settings_json yields valid lobby settings", async () => {
    const admin = await reg(uniqueName(), "3005");

    // Seed poisoned settings directly into the server's SQLite file
    const stored = seedLastSettings(admin.userId, JSON.stringify({ mafiaCount: null, enableDoctor: "yes", bogusKey: 1 }));
    expect(stored).toContain("bogusKey");

    const lobbyPromise = waitFor(admin.ws, "lobby_update");
    send(admin.ws, { type: "create_game" });
    await waitFor(admin.ws, "game_created");
    const lobby = await lobbyPromise;

    expect(Number.isInteger(lobby.settings.mafiaCount)).toBe(true);
    expect(lobby.settings.mafiaCount).toBeGreaterThanOrEqual(1);
    expect(lobby.settings.bogusKey).toBeUndefined();
    // "yes" must be dropped, leaving the default (false) — not coerced to true
    expect(lobby.settings.enableDoctor).toBe(false);

    admin.ws.close();
  }, 10000);

  test("valid persisted settings still load (regression)", async () => {
    const admin = await reg(uniqueName(), "3006");

    const stored = seedLastSettings(admin.userId, JSON.stringify({ mafiaCount: 2, enableDetective: true }));
    expect(stored).toContain("enableDetective");

    const lobbyPromise = waitFor(admin.ws, "lobby_update");
    send(admin.ws, { type: "create_game" });
    await waitFor(admin.ws, "game_created");
    const lobby = await lobbyPromise;

    expect(lobby.settings.mafiaCount).toBe(2);
    expect(lobby.settings.enableDetective).toBe(true);

    admin.ws.close();
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════
// L8 — register must cap username length
// ═══════════════════════════════════════════════════════════════════════

describe("L8: username length cap on register", () => {
  test("100-char username is rejected with an error", async () => {
    const ws = await openWS();
    const longName = "x".repeat(100);
    send(ws, { type: "register", username: longName, passcode: "4001" });
    const err = await waitFor(ws, "error");
    expect(err.message.toLowerCase()).toContain("username");
    ws.close();
  }, 10000);

  test("normal-length username still registers (regression)", async () => {
    const name = uniqueName(); // ~22 chars
    const p = await reg(name, "4002");
    expect(p.userId).toBeGreaterThan(0);
    expect(p.username).toBe(name);
    p.ws.close();
  }, 10000);
});
