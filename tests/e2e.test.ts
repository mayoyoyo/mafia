import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// E2E test: start server externally, run tests against it.
// This test file spawns its own server and manages the lifecycle carefully.

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 4567 + Math.floor(Math.random() * 1000);
const WS_URL = `ws://localhost:${PORT}/ws`;

function waitFor(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${type}`)), timeout);
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
    const t = setTimeout(() => reject(new Error("WS timeout")), 3000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });
}

function send(ws: WebSocket, msg: any) { ws.send(JSON.stringify(msg)); }

async function reg(name: string, pin: string) {
  const ws = await openWS();
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number };
}

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: { ...process.env, PORT: String(PORT) },
    cwd: import.meta.dir + "/..",
    stdout: "ignore", stderr: "ignore",
  });
  // Poll until server is up
  for (let i = 0; i < 30; i++) {
    try {
      const ws = new WebSocket(WS_URL);
      await new Promise<void>((ok, fail) => {
        ws.onopen = () => { ws.close(); ok(); };
        ws.onerror = () => fail();
      });
      return; // server is up
    } catch { await Bun.sleep(200); }
  }
  throw new Error("Server failed to start");
});

afterAll(() => { try { serverProc?.kill(); } catch {} });

// Single comprehensive E2E test to avoid process lifecycle issues
test("full E2E flow", async () => {
  const ts = Date.now();

  // 1. Register
  const { ws: ws1, userId: uid1 } = await reg(`user1_${ts}`, "1234");
  expect(uid1).toBeGreaterThan(0);
  ws1.close();

  // 2. Login
  const ws2 = await openWS();
  send(ws2, { type: "login", username: `user1_${ts}`, passcode: "1234" });
  const login = await waitFor(ws2, "logged_in");
  expect(login.username).toBe(`user1_${ts}`);
  ws2.close();

  // 3. Bad passcode
  const ws3 = await openWS();
  send(ws3, { type: "register", username: `bad_${ts}`, passcode: "abc" });
  const err3 = await waitFor(ws3, "error");
  expect(err3.message).toContain("4 digits");
  ws3.close();

  // 4. Create game
  const { ws: adminWs } = await reg(`admin_${ts}`, "1111");
  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  expect(created.code).toHaveLength(4);

  // 5. Join game
  const { ws: playerWs } = await reg(`player_${ts}`, "2222");
  // Set up listener BEFORE join to avoid race condition
  const lobbyPromise = waitMatch(adminWs, (m) => m.type === "lobby_update" && m.players?.length === 2);
  send(playerWs, { type: "join_game", code: created.code });
  const joined = await waitFor(playerWs, "game_joined");
  expect(joined.code).toBe(created.code);
  expect(joined.isAdmin).toBe(false);

  const lobby = await lobbyPromise;
  expect(lobby.players.length).toBe(2);

  // 6. Join non-existent game
  const { ws: ws6 } = await reg(`noexist_${ts}`, "3333");
  send(ws6, { type: "join_game", code: "ZZZZ" });
  const err6 = await waitFor(ws6, "error");
  expect(err6.message).toContain("not found");
  ws6.close();

  // 7. Settings update
  send(adminWs, { type: "update_settings", settings: { mafiaCount: 2, enableDoctor: true } });
  const settingsMsg = await waitFor(adminWs, "settings_updated");
  expect(settingsMsg.settings.mafiaCount).toBe(2);
  expect(settingsMsg.settings.enableDoctor).toBe(true);

  // Reset for start
  send(adminWs, { type: "update_settings", settings: { mafiaCount: 1, enableDoctor: false } });
  await waitFor(adminWs, "settings_updated");

  // 8. Can't start with <3 players (need to test separately)
  // We have 2 players, but let's add more
  const { ws: p3 } = await reg(`p3_${ts}`, "4444");
  send(p3, { type: "join_game", code: created.code });
  await waitFor(p3, "game_joined");

  const { ws: p4 } = await reg(`p4_${ts}`, "5555");
  send(p4, { type: "join_game", code: created.code });
  await waitFor(p4, "game_joined");

  await Bun.sleep(200);

  // 9. Start game with 4 players
  const allWs = [adminWs, playerWs, p3, p4];

  // Set up ALL listeners BEFORE sending start to avoid race conditions
  const startedPromises = allWs.map((w) => waitFor(w, "game_started"));
  const phasePromises = allWs.map((w) => waitFor(w, "phase_change"));

  send(adminWs, { type: "start_game" });

  // Await all started messages
  const startedResults = await Promise.all(startedPromises);
  const roles = startedResults.map((s) => s.role);
  for (const role of roles) expect(role).toBeTruthy();

  // Should have 1 mafia and 3 citizens
  expect(roles.filter((r) => r === "mafia").length).toBe(1);
  expect(roles.filter((r) => r === "citizen").length).toBe(3);

  // All get night phase
  const phaseResults = await Promise.all(phasePromises);
  for (const phase of phaseResults) {
    expect(phase.phase).toBe("night");
    expect(phase.round).toBe(1);
  }

  // 10. Config save/load
  const { ws: cfgWs } = await reg(`cfg_${ts}`, "6666");
  send(cfgWs, { type: "create_game" });
  const cfgGame = await waitFor(cfgWs, "game_created");
  send(cfgWs, { type: "update_settings", settings: { mafiaCount: 3 } });
  await waitFor(cfgWs, "settings_updated");
  send(cfgWs, { type: "save_config", name: "TestPreset" });
  const saved = await waitFor(cfgWs, "config_saved");
  expect(saved.config.name).toBe("TestPreset");

  send(cfgWs, { type: "list_configs" });
  const configs = await waitFor(cfgWs, "configs_list");
  expect(configs.configs.length).toBeGreaterThanOrEqual(1);

  cfgWs.close();

  // Cleanup
  for (const w of allWs) w.close();
}, 30000);
