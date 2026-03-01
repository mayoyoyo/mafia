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

function collectMessages(ws: WebSocket): { messages: any[], stop: () => void } {
  const messages: any[] = [];
  const h = (e: MessageEvent) => { messages.push(JSON.parse(e.data)); };
  ws.addEventListener("message", h);
  return { messages, stop: () => ws.removeEventListener("message", h) };
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

test("night action prompts arrive after phase_change on vote execution", async () => {
  const ts = Date.now();

  // Use 6 players (1 mafia, 5 citizens) so game doesn't end after 1 kill + 1 execution
  const { ws: adminWs, userId: uid1 } = await reg(`na_admin_${ts}`, "1111");
  const { ws: p2ws, userId: uid2 } = await reg(`na_p2_${ts}`, "2222");
  const { ws: p3ws, userId: uid3 } = await reg(`na_p3_${ts}`, "3333");
  const { ws: p4ws, userId: uid4 } = await reg(`na_p4_${ts}`, "4444");
  const { ws: p5ws, userId: uid5 } = await reg(`na_p5_${ts}`, "5555");
  const { ws: p6ws, userId: uid6 } = await reg(`na_p6_${ts}`, "6666");

  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  const code = created.code;

  for (const w of [p2ws, p3ws, p4ws, p5ws, p6ws]) {
    send(w, { type: "join_game", code });
    await waitFor(w, "game_joined");
  }
  await Bun.sleep(200);

  const allWs = [adminWs, p2ws, p3ws, p4ws, p5ws, p6ws];
  const allUids = [uid1, uid2, uid3, uid4, uid5, uid6];

  // Collect on ALL ws from the start so we never miss messages
  const collectors = allWs.map((w) => collectMessages(w));
  send(adminWs, { type: "start_game" });

  // Wait for all messages to settle
  await Bun.sleep(1000);

  // Find the mafia player from collected messages
  let mafiaIdx = -1;
  for (let i = 0; i < collectors.length; i++) {
    const started = collectors[i].messages.find((m) => m.type === "game_started");
    if (started && started.role === "mafia") { mafiaIdx = i; break; }
  }
  expect(mafiaIdx).toBeGreaterThanOrEqual(0);
  const mafiaWs = allWs[mafiaIdx];

  // Get mafia_targets from collected messages
  const mafiaTargets = collectors[mafiaIdx].messages.find((m) => m.type === "mafia_targets");
  expect(mafiaTargets).toBeDefined();
  expect(mafiaTargets.players.length).toBeGreaterThan(0);
  const nightKillTargetId = mafiaTargets.players[0].id;

  // Stop old collectors, start fresh for the rest of the test
  collectors.forEach((c) => c.stop());

  send(mafiaWs, { type: "mafia_vote", targetId: nightKillTargetId, voteType: "lock" });
  await waitFor(mafiaWs, "mafia_confirm_ready");

  // Set up day phase listeners BEFORE confirming kill
  const dayPhasePromises = allWs.map((w) => waitFor(w, "phase_change"));
  send(mafiaWs, { type: "confirm_mafia_kill" });
  const dayPhases = await Promise.all(dayPhasePromises);
  expect(dayPhases[0].phase).toBe("day");

  // Find an alive non-mafia citizen to nominate (skip mafia and the player killed at night)
  let nomineeId = -1;
  for (let i = 0; i < allUids.length; i++) {
    if (i === mafiaIdx) continue;
    if (allUids[i] === nightKillTargetId) continue;
    nomineeId = allUids[i];
    break;
  }
  expect(nomineeId).toBeGreaterThan(0);

  // Set up listeners BEFORE sending call_vote
  const voteCalledPromises = allWs.map((w) => waitFor(w, "vote_called"));
  send(adminWs, { type: "call_vote", targetId: nomineeId, anonymous: false });
  await Promise.all(voteCalledPromises);

  // Start collecting on mafia ws BEFORE voting
  const collector = collectMessages(mafiaWs);

  // All alive players vote yes (skip the player killed at night)
  for (let i = 0; i < allWs.length; i++) {
    if (allUids[i] !== nightKillTargetId) {
      send(allWs[i], { type: "cast_vote", approve: true });
    }
  }

  // Wait for messages to arrive
  await Bun.sleep(2000);
  collector.stop();

  const types = collector.messages.map((m) => m.type);
  const voteResultIdx = types.indexOf("vote_result");
  const nightPhaseIdx = types.findIndex((t, i) =>
    t === "phase_change" && collector.messages[i].phase === "night"
  );
  const mafiaTargetsIdx = types.indexOf("mafia_targets");

  // Diagnostic: if phase_change(night) is missing, the game probably ended
  if (nightPhaseIdx === -1) {
    const phaseChanges = collector.messages.filter((m) => m.type === "phase_change");
    const gameOvers = collector.messages.filter((m) => m.type === "game_over");
    throw new Error(
      `No phase_change(night) found. Types: [${types.join(", ")}] ` +
      `PhaseChanges: ${JSON.stringify(phaseChanges.map((m) => m.phase))} ` +
      `GameOvers: ${gameOvers.length}`
    );
  }

  expect(voteResultIdx).toBeGreaterThanOrEqual(0);
  expect(nightPhaseIdx).toBeGreaterThanOrEqual(0);
  expect(mafiaTargetsIdx).toBeGreaterThanOrEqual(0);

  // Critical ordering: vote_result → phase_change(night) → mafia_targets
  expect(voteResultIdx).toBeLessThan(nightPhaseIdx);
  expect(nightPhaseIdx).toBeLessThan(mafiaTargetsIdx);

  for (const w of allWs) w.close();
}, 30000);

test("night action prompts arrive after phase_change on end_day", async () => {
  const ts = Date.now();

  const { ws: adminWs } = await reg(`ed_admin_${ts}`, "1111");
  const { ws: p2ws } = await reg(`ed_p2_${ts}`, "2222");
  const { ws: p3ws } = await reg(`ed_p3_${ts}`, "3333");
  const { ws: p4ws } = await reg(`ed_p4_${ts}`, "4444");
  const { ws: p5ws } = await reg(`ed_p5_${ts}`, "5555");
  const { ws: p6ws } = await reg(`ed_p6_${ts}`, "6666");

  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  const code = created.code;

  for (const w of [p2ws, p3ws, p4ws, p5ws, p6ws]) {
    send(w, { type: "join_game", code });
    await waitFor(w, "game_joined");
  }
  await Bun.sleep(200);

  const allWs = [adminWs, p2ws, p3ws, p4ws, p5ws, p6ws];

  // Collect on ALL ws from the start
  const collectors = allWs.map((w) => collectMessages(w));
  send(adminWs, { type: "start_game" });
  await Bun.sleep(1000);

  // Find mafia
  let mafiaIdx = -1;
  for (let i = 0; i < collectors.length; i++) {
    const started = collectors[i].messages.find((m) => m.type === "game_started");
    if (started && started.role === "mafia") { mafiaIdx = i; break; }
  }
  expect(mafiaIdx).toBeGreaterThanOrEqual(0);
  const mafiaWs = allWs[mafiaIdx];
  const mafiaTargets = collectors[mafiaIdx].messages.find((m) => m.type === "mafia_targets");
  expect(mafiaTargets).toBeDefined();
  collectors.forEach((c) => c.stop());

  send(mafiaWs, { type: "mafia_vote", targetId: mafiaTargets.players[0].id, voteType: "lock" });
  await waitFor(mafiaWs, "mafia_confirm_ready");

  // Set up day phase listeners BEFORE confirming kill
  const dayPromises = allWs.map((w) => waitFor(w, "phase_change"));
  send(mafiaWs, { type: "confirm_mafia_kill" });
  await Promise.all(dayPromises);

  // Collect messages BEFORE sending end_day
  const collector = collectMessages(mafiaWs);
  send(adminWs, { type: "end_day" });

  await Bun.sleep(2000);
  collector.stop();

  const types = collector.messages.map((m) => m.type);
  const nightPhaseIdx = types.findIndex((t, i) =>
    t === "phase_change" && collector.messages[i].phase === "night"
  );
  const mafiaTargetsIdx = types.indexOf("mafia_targets");

  expect(nightPhaseIdx).toBeGreaterThanOrEqual(0);
  expect(mafiaTargetsIdx).toBeGreaterThanOrEqual(0);

  // phase_change(night) must arrive BEFORE mafia_targets
  expect(nightPhaseIdx).toBeLessThan(mafiaTargetsIdx);

  // No vote_result should exist (admin ended day without vote)
  expect(types.indexOf("vote_result")).toBe(-1);

  for (const w of allWs) w.close();
}, 30000);

// ── Sequential Night Tests ─────────────────────────────────────────────

test("sequential night: mafia → doctor → detective → day (all alive + enabled)", async () => {
  const ts = Date.now();

  const { ws: adminWs, userId: uid1 } = await reg(`seq_admin_${ts}`, "1111");
  const { ws: p2ws, userId: uid2 } = await reg(`seq_p2_${ts}`, "2222");
  const { ws: p3ws, userId: uid3 } = await reg(`seq_p3_${ts}`, "3333");
  const { ws: p4ws, userId: uid4 } = await reg(`seq_p4_${ts}`, "4444");
  const { ws: p5ws, userId: uid5 } = await reg(`seq_p5_${ts}`, "5555");
  const { ws: p6ws, userId: uid6 } = await reg(`seq_p6_${ts}`, "6666");

  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  const code = created.code;

  for (const w of [p2ws, p3ws, p4ws, p5ws, p6ws]) {
    send(w, { type: "join_game", code });
    await waitFor(w, "game_joined");
  }

  // Enable doctor and detective
  send(adminWs, { type: "update_settings", settings: { enableDoctor: true, enableDetective: true } });
  await waitFor(adminWs, "settings_updated");
  await Bun.sleep(200);

  const allWs = [adminWs, p2ws, p3ws, p4ws, p5ws, p6ws];

  // Collect on all ws from start
  const collectors = allWs.map((w) => collectMessages(w));
  send(adminWs, { type: "start_game" });
  await Bun.sleep(1000);

  // Find roles from collected messages
  let mafiaIdx = -1, doctorIdx = -1, detectiveIdx = -1;
  for (let i = 0; i < collectors.length; i++) {
    const started = collectors[i].messages.find((m) => m.type === "game_started");
    if (started?.role === "mafia" && mafiaIdx === -1) mafiaIdx = i;
    if (started?.role === "doctor") doctorIdx = i;
    if (started?.role === "detective") detectiveIdx = i;
  }
  expect(mafiaIdx).toBeGreaterThanOrEqual(0);
  expect(doctorIdx).toBeGreaterThanOrEqual(0);
  expect(detectiveIdx).toBeGreaterThanOrEqual(0);

  const mafiaWs = allWs[mafiaIdx];
  const doctorWs = allWs[doctorIdx];
  const detectiveWs = allWs[detectiveIdx];

  // Get mafia targets
  const mafiaTargets = collectors[mafiaIdx].messages.find((m) => m.type === "mafia_targets");
  expect(mafiaTargets).toBeDefined();
  collectors.forEach((c) => c.stop());

  // 1. Mafia sub-phase: vote and confirm
  send(mafiaWs, { type: "mafia_vote", targetId: mafiaTargets.players[0].id, voteType: "lock" });
  await waitFor(mafiaWs, "mafia_confirm_ready");
  send(mafiaWs, { type: "confirm_mafia_kill" });
  await waitFor(mafiaWs, "night_action_done");

  // 2. Doctor sub-phase: wait for targets, then save
  const doctorTargets = await waitFor(doctorWs, "doctor_targets");
  expect(doctorTargets.players.length).toBeGreaterThan(0);
  send(doctorWs, { type: "doctor_save", targetId: doctorTargets.players[0].id });
  await waitFor(doctorWs, "night_action_done");

  // 3. Detective sub-phase: wait for targets, then investigate
  const detectiveTargets = await waitFor(detectiveWs, "detective_targets");
  expect(detectiveTargets.players.length).toBeGreaterThan(0);
  send(detectiveWs, { type: "detective_investigate", targetId: detectiveTargets.players[0].id });
  await waitFor(detectiveWs, "night_action_done");

  // 4. Should resolve to day
  const dayPhase = await waitFor(adminWs, "phase_change");
  expect(dayPhase.phase === "day" || dayPhase.phase === "game_over").toBe(true);

  for (const w of allWs) w.close();
}, 30000);

test("sequential night: mafia-only (no special roles) → immediate resolution after delay", async () => {
  const ts = Date.now();

  const { ws: adminWs } = await reg(`monly_admin_${ts}`, "1111");
  const { ws: p2ws } = await reg(`monly_p2_${ts}`, "2222");
  const { ws: p3ws } = await reg(`monly_p3_${ts}`, "3333");
  const { ws: p4ws } = await reg(`monly_p4_${ts}`, "4444");

  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  const code = created.code;

  for (const w of [p2ws, p3ws, p4ws]) {
    send(w, { type: "join_game", code });
    await waitFor(w, "game_joined");
  }
  await Bun.sleep(200);

  const allWs = [adminWs, p2ws, p3ws, p4ws];
  const collectors = allWs.map((w) => collectMessages(w));
  send(adminWs, { type: "start_game" });
  await Bun.sleep(1000);

  // Find mafia
  let mafiaIdx = -1;
  for (let i = 0; i < collectors.length; i++) {
    const started = collectors[i].messages.find((m) => m.type === "game_started");
    if (started?.role === "mafia") { mafiaIdx = i; break; }
  }
  expect(mafiaIdx).toBeGreaterThanOrEqual(0);
  const mafiaWs = allWs[mafiaIdx];
  const mafiaTargets = collectors[mafiaIdx].messages.find((m) => m.type === "mafia_targets");
  collectors.forEach((c) => c.stop());

  // Mafia votes and confirms
  send(mafiaWs, { type: "mafia_vote", targetId: mafiaTargets.players[0].id, voteType: "lock" });
  await waitFor(mafiaWs, "mafia_confirm_ready");
  send(mafiaWs, { type: "confirm_mafia_kill" });

  // Should resolve to day (no doctor/detective to wait for)
  const dayPhase = await waitFor(adminWs, "phase_change");
  expect(dayPhase.phase === "day" || dayPhase.phase === "game_over").toBe(true);

  for (const w of allWs) w.close();
}, 30000);

test("sequential night: sub-phase guard rejects doctor_save during mafia sub-phase", async () => {
  const ts = Date.now();

  const { ws: adminWs } = await reg(`guard_admin_${ts}`, "1111");
  const { ws: p2ws } = await reg(`guard_p2_${ts}`, "2222");
  const { ws: p3ws } = await reg(`guard_p3_${ts}`, "3333");
  const { ws: p4ws } = await reg(`guard_p4_${ts}`, "4444");
  const { ws: p5ws } = await reg(`guard_p5_${ts}`, "5555");

  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  const code = created.code;

  for (const w of [p2ws, p3ws, p4ws, p5ws]) {
    send(w, { type: "join_game", code });
    await waitFor(w, "game_joined");
  }

  send(adminWs, { type: "update_settings", settings: { enableDoctor: true } });
  await waitFor(adminWs, "settings_updated");
  await Bun.sleep(200);

  const allWs = [adminWs, p2ws, p3ws, p4ws, p5ws];
  const collectors = allWs.map((w) => collectMessages(w));
  send(adminWs, { type: "start_game" });
  await Bun.sleep(1000);

  let doctorIdx = -1;
  for (let i = 0; i < collectors.length; i++) {
    const started = collectors[i].messages.find((m) => m.type === "game_started");
    if (started?.role === "doctor") { doctorIdx = i; break; }
  }
  expect(doctorIdx).toBeGreaterThanOrEqual(0);
  const doctorWs = allWs[doctorIdx];
  collectors.forEach((c) => c.stop());

  // Try to submit doctor_save during mafia sub-phase — should be silently rejected
  const collector = collectMessages(doctorWs);
  send(doctorWs, { type: "doctor_save", targetId: 1 });
  await Bun.sleep(500);
  collector.stop();

  // Should NOT receive night_action_done (the save was rejected)
  const actionDone = collector.messages.find((m) => m.type === "night_action_done");
  expect(actionDone).toBeUndefined();

  for (const w of allWs) w.close();
}, 15000);

test("sequential night: force dawn during doctor sub-phase transition", async () => {
  const ts = Date.now();

  const { ws: adminWs } = await reg(`fdawn_admin_${ts}`, "1111");
  const { ws: p2ws } = await reg(`fdawn_p2_${ts}`, "2222");
  const { ws: p3ws } = await reg(`fdawn_p3_${ts}`, "3333");
  const { ws: p4ws } = await reg(`fdawn_p4_${ts}`, "4444");
  const { ws: p5ws } = await reg(`fdawn_p5_${ts}`, "5555");
  const { ws: p6ws } = await reg(`fdawn_p6_${ts}`, "6666");

  send(adminWs, { type: "create_game" });
  const created = await waitFor(adminWs, "game_created");
  const code = created.code;

  for (const w of [p2ws, p3ws, p4ws, p5ws, p6ws]) {
    send(w, { type: "join_game", code });
    await waitFor(w, "game_joined");
  }

  // Enable doctor
  send(adminWs, { type: "update_settings", settings: { enableDoctor: true } });
  await waitFor(adminWs, "settings_updated");
  await Bun.sleep(200);

  const allWs = [adminWs, p2ws, p3ws, p4ws, p5ws, p6ws];
  const collectors = allWs.map((w) => collectMessages(w));
  send(adminWs, { type: "start_game" });
  await Bun.sleep(1000);

  let mafiaIdx = -1;
  for (let i = 0; i < collectors.length; i++) {
    const started = collectors[i].messages.find((m) => m.type === "game_started");
    if (started?.role === "mafia") { mafiaIdx = i; break; }
  }
  const mafiaWs = allWs[mafiaIdx];
  const mafiaTargets = collectors[mafiaIdx].messages.find((m) => m.type === "mafia_targets");
  collectors.forEach((c) => c.stop());

  // Complete mafia sub-phase
  send(mafiaWs, { type: "mafia_vote", targetId: mafiaTargets.players[0].id, voteType: "lock" });
  await waitFor(mafiaWs, "mafia_confirm_ready");
  send(mafiaWs, { type: "confirm_mafia_kill" });
  await waitFor(mafiaWs, "night_action_done");

  // Force dawn during the doctor sub-phase transition
  await Bun.sleep(200); // still within the 1.5s delay before doctor opens
  send(adminWs, { type: "force_dawn" });

  const dayPhase = await waitFor(adminWs, "phase_change");
  expect(dayPhase.phase).toBe("day");

  for (const w of allWs) w.close();
}, 20000);
