import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

/**
 * T5b — Standing 10-player full-game WS regression gate.
 *
 * Simulates a realistic 10-player game end-to-end over real WebSockets:
 *   2 mafia + doctor + detective + joker + 5 citizens (roles RANDOM —
 *   discovered from each client's own game_started message).
 *
 * Script (drives a deterministic TOWN win — lynch both mafia — because
 * mafia-parity rules are scheduled to change in task M8):
 *   Night 1: mafia consensus-kill a citizen, doctor SAVES that citizen,
 *            detective investigates a mafia (result must be isMafia=true).
 *   Day 1:   admin calls vote on mafia #1, all alive approve → lynched.
 *   Night 2: remaining mafia kills another citizen (doctor saves self,
 *            so the kill lands), detective investigates a citizen (false).
 *   Day 2:   admin calls vote on mafia #2, all alive approve → lynched
 *            → 0 mafia alive → game_over winner "town".
 *
 * Invariants checked on EVERY message received by EVERY client (recorder
 * attached at socket open):
 *   - mafiaTeam never reaches a non-mafia client
 *   - detectiveHistory never reaches a non-detective client
 *   - detective_result / mafia coordination messages only reach their role
 *   - no other player's role appears in any payload before game_over
 *   - official-doctor saves stay anonymous (no named "save" event anywhere)
 *   - game_over never arrives before the last mafia dies
 * Plus end-of-game checks: exact phase_change sequence per client, exact
 * death order per client (alive-list consistency), exactly one game_over
 * (winner town, not forceEnded), reveal roles match discovered roles.
 *
 * Intentionally NOT asserted (behaviors scheduled to change in later tasks):
 *   - votesFor/votesAgainst tallies in vote_result (payload will change)
 *   - mafia-parity win math involving a living joker (M8)
 *   - rejection of night actions during the narrator-ready gate
 *
 * Port range: 8600-8999 (e2e: 4567+, rejoin: 5567+, save-signal: 6567+,
 * handler-guards: 7600+)
 */

let serverProc: ReturnType<typeof Bun.spawn>;
const PORT = 8600 + Math.floor(Math.random() * 400);
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-ten-player-${Date.now()}-${PORT}.db`;

// ── Test player model + always-on message recorder ─────────────────────

interface TestPlayer {
  ws: WebSocket;
  userId: number;
  username: string;
  role?: string; // discovered from this client's own game_started
  inbox: any[];  // every message this client ever received, in order
}

const players: TestPlayer[] = [];
const violations: string[] = [];
let gameOverAllowed = false; // flipped just before the final lynch votes

const MAFIA_ONLY_TYPES = new Set(["mafia_targets", "mafia_vote_update", "mafia_confirm_ready"]);

function deepHasKey(node: any, key: string): boolean {
  if (Array.isArray(node)) return node.some((v) => deepHasKey(v, key));
  if (node === null || typeof node !== "object") return false;
  if (key in node) return true;
  return Object.values(node).some((v) => deepHasKey(v, key));
}

/** Flag any object carrying another player's role (PlayerInfo-style leak). */
function findRoleLeaks(node: any, p: TestPlayer, tag: string): void {
  if (Array.isArray(node)) { for (const v of node) findRoleLeaks(v, p, tag); return; }
  if (node === null || typeof node !== "object") return;
  if (typeof node.username === "string" && node.username !== p.username && node.role != null) {
    violations.push(`${tag}: role "${node.role}" of player "${node.username}" leaked pre-game_over`);
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "gameOver") continue; // game_sync end-of-game reveal block is allowed
    findRoleLeaks(v, p, tag);
  }
}

/** Official doctor mode: a save event naming the saved player must never appear. */
function findNamedSaveEvents(node: any, tag: string): void {
  if (Array.isArray(node)) { for (const v of node) findNamedSaveEvents(v, tag); return; }
  if (node === null || typeof node !== "object") return;
  if (node.type === "save" && typeof node.playerName === "string") {
    violations.push(`${tag}: named save event leaked ("${node.playerName}") in official doctor mode`);
  }
  for (const v of Object.values(node)) findNamedSaveEvents(v, tag);
}

function checkMessage(p: TestPlayer, m: any): void {
  const tag = `[${p.username} role=${p.role ?? "?"}] msg=${m.type}`;

  if (p.role !== "mafia" && deepHasKey(m, "mafiaTeam")) {
    violations.push(`${tag}: mafiaTeam leaked to non-mafia client`);
  }
  if (p.role !== "detective" && deepHasKey(m, "detectiveHistory")) {
    violations.push(`${tag}: detectiveHistory leaked to non-detective client`);
  }
  if (m.type === "detective_result" && p.role !== "detective") {
    violations.push(`${tag}: detective_result sent to non-detective client`);
  }
  if (MAFIA_ONLY_TYPES.has(m.type) && p.role !== "mafia") {
    violations.push(`${tag}: mafia-only message sent to non-mafia client`);
  }
  if (m.type !== "game_over") {
    findRoleLeaks(m, p, tag);
  }
  findNamedSaveEvents(m, tag);
  if (m.type === "game_over" && !gameOverAllowed) {
    violations.push(`${tag}: game_over arrived before the last mafia died`);
  }
}

function assertNoViolations(stage: string): void {
  if (violations.length > 0) {
    throw new Error(`Invariant violations detected by ${stage}:\n  ${violations.join("\n  ")}`);
  }
}

// ── Low-level helpers ──────────────────────────────────────────────────

function send(ws: WebSocket, msg: any) { ws.send(JSON.stringify(msg)); }

/**
 * Wait for a message matching `pred`, scanning p.inbox starting at index
 * `from` (capture `from = p.inbox.length` BEFORE the triggering send to
 * avoid races). Polls — the recorder is the only listener.
 */
async function waitSince(
  p: TestPlayer, from: number, pred: (m: any) => boolean, desc: string, timeout = 15000,
): Promise<any> {
  const deadline = Date.now() + timeout;
  let i = from;
  while (Date.now() < deadline) {
    for (; i < p.inbox.length; i++) {
      if (pred(p.inbox[i])) return p.inbox[i];
    }
    await Bun.sleep(25);
  }
  const seen = p.inbox.slice(from).map((m) => m.type).join(", ") || "(nothing)";
  throw new Error(`[${p.username}] timeout waiting for ${desc}; received since mark: ${seen}`);
}

function openWS(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const t = setTimeout(() => reject(new Error("WS open timeout")), 3000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS open error")); };
  });
}

let userCounter = 0;
const ts = Date.now();
function uniqueName() { return `tp_${ts}_${++userCounter}`; }

/** Open socket, attach the recorder/invariant-checker, register the user. */
async function regPlayer(): Promise<TestPlayer> {
  const ws = await openWS();
  const p: TestPlayer = { ws, userId: -1, username: uniqueName(), inbox: [] };
  ws.addEventListener("message", (e: MessageEvent) => {
    const m = JSON.parse(e.data);
    if (m.type === "game_started" && p.role === undefined) p.role = m.role;
    p.inbox.push(m);
    checkMessage(p, m);
  });
  send(ws, { type: "register", username: p.username, passcode: String(3000 + userCounter) });
  const r = await waitSince(p, 0, (m) => m.type === "registered", "registered", 5000);
  p.userId = r.userId;
  return p;
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

afterAll(() => {
  for (const p of players) { try { p.ws.close(); } catch {} }
  try { serverProc?.kill(); } catch {}
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try { unlinkSync(f); } catch {}
  }
});

// ── Game drivers ───────────────────────────────────────────────────────

const dead = new Set<number>();
const alive = () => players.filter((p) => !dead.has(p.userId));

/**
 * Drive one full night: mafia consensus + confirm, doctor save, detective
 * investigation, then dawn. Returns the detective_result and each client's
 * day phase_change.
 */
async function runNight(opts: {
  mafiaAlive: TestPlayer[];
  killTarget: TestPlayer;
  doctorSave: TestPlayer;
  doctor: TestPlayer;
  detective: TestPlayer;
  detectiveTarget: TestPlayer;
  expectVictimDies: boolean;
}) {
  const { mafiaAlive, killTarget, doctorSave, doctor, detective, detectiveTarget } = opts;

  // Capture marks BEFORE any night traffic
  const mafiaMarks = mafiaAlive.map((m) => m.inbox.length);
  const docMark = doctor.inbox.length;
  const detMark = detective.inbox.length;
  const allMarks = players.map((p) => p.inbox.length);

  // Mafia consensus: each alive mafia votes maybe then lock on the same target
  // (per-socket ordering guarantees maybe precedes lock for each member)
  for (const m of mafiaAlive) {
    send(m.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "maybe" });
    send(m.ws, { type: "mafia_vote", targetId: killTarget.userId, voteType: "lock" });
  }
  await Promise.all(mafiaAlive.map((m, i) =>
    waitSince(m, mafiaMarks[i],
      (x) => x.type === "mafia_confirm_ready" && x.targetId === killTarget.userId,
      "mafia_confirm_ready")));

  // One mafia slides to confirm the kill
  send(mafiaAlive[0].ws, { type: "confirm_mafia_kill" });

  // Doctor sub-phase (~1.5s later)
  const docTargets = await waitSince(doctor, docMark, (m) => m.type === "doctor_targets", "doctor_targets");
  expect(docTargets.players.some((t: any) => t.id === doctorSave.userId)).toBe(true);
  send(doctor.ws, { type: "doctor_save", targetId: doctorSave.userId });

  // Detective sub-phase (~1.5s later)
  const detTargets = await waitSince(detective, detMark, (m) => m.type === "detective_targets", "detective_targets");
  expect(detTargets.players.some((t: any) => t.id === detective.userId)).toBe(false); // never offered self
  send(detective.ws, { type: "detective_investigate", targetId: detectiveTarget.userId });

  // Detective result arrives privately at dawn
  const detRes = await waitSince(detective, detMark, (m) => m.type === "detective_result", "detective_result");
  expect(detRes.targetName).toBe(detectiveTarget.username);

  // Death broadcast (if the kill landed) must reach EVERY client
  if (opts.expectVictimDies) {
    await Promise.all(players.map((p, i) =>
      waitSince(p, allMarks[i],
        (m) => m.type === "player_died" && m.playerId === killTarget.userId,
        `player_died(${killTarget.username})`)));
    dead.add(killTarget.userId);
  }

  // Dawn: day phase_change on every client
  const dayMsgs = await Promise.all(players.map((p, i) =>
    waitSince(p, allMarks[i],
      (m) => m.type === "phase_change" && m.phase === "day",
      "day phase_change")));

  return { detRes, dayMsgs };
}

/**
 * Drive a day lynch: admin calls a vote, every alive player approves.
 * Verifies vote_called, vote_result (target/executed only — tallies are
 * scheduled to change, so votesFor/votesAgainst are deliberately ignored),
 * and player_died on every client. Non-final lynches must auto-transition
 * to night; the final one must produce game_over winner "town".
 */
async function runLynch(admin: TestPlayer, target: TestPlayer, final: boolean) {
  const marks = players.map((p) => p.inbox.length);

  send(admin.ws, { type: "call_vote", targetId: target.userId });
  await Promise.all(players.map((p, i) =>
    waitSince(p, marks[i],
      (m) => m.type === "vote_called" && m.targetId === target.userId,
      "vote_called")));

  if (final) gameOverAllowed = true; // the recorder flags any earlier game_over
  for (const v of alive()) send(v.ws, { type: "cast_vote", approve: true });

  const results = await Promise.all(players.map((p, i) =>
    waitSince(p, marks[i], (m) => m.type === "vote_result", "vote_result")));
  for (const r of results) {
    expect(r.targetName).toBe(target.username);
    expect(r.executed).toBe(true);
  }

  await Promise.all(players.map((p, i) =>
    waitSince(p, marks[i],
      (m) => m.type === "player_died" && m.playerId === target.userId,
      `player_died(${target.username})`)));
  dead.add(target.userId);

  if (final) {
    const overs = await Promise.all(players.map((p, i) =>
      waitSince(p, marks[i], (m) => m.type === "game_over", "game_over")));
    return overs;
  }
  await Promise.all(players.map((p, i) =>
    waitSince(p, marks[i],
      (m) => m.type === "phase_change" && m.phase === "night",
      "night phase_change")));
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// The regression gate
// ═══════════════════════════════════════════════════════════════════════

describe("10-player full game (2 mafia + doctor + detective + joker)", () => {
  test("plays multiple nights and days to a natural town win with all invariants held", async () => {
    // ── Lobby: register 10, admin creates, 9 join ──────────────────
    for (let i = 0; i < 10; i++) players.push(await regPlayer());
    const admin = players[0];

    const createMark = admin.inbox.length;
    send(admin.ws, { type: "create_game" });
    const created = await waitSince(admin, createMark, (m) => m.type === "game_created", "game_created");
    const code = created.code;

    for (let i = 1; i < 10; i++) {
      const jm = players[i].inbox.length;
      send(players[i].ws, { type: "join_game", code });
      await waitSince(players[i], jm, (m) => m.type === "game_joined", "game_joined");
    }

    const sm = admin.inbox.length;
    send(admin.ws, {
      type: "update_settings",
      settings: {
        mafiaCount: 2,
        enableDoctor: true,
        enableDetective: true,
        enableJoker: true,
        enableLovers: false,
        doctorMode: "official",
        jokerMode: "official",
      },
    });
    await waitSince(admin, sm, (m) => m.type === "settings_updated", "settings_updated");
    await Bun.sleep(100);

    // ── Start: roles are random — discover each client's own role ──
    const startMarks = players.map((p) => p.inbox.length);
    send(admin.ws, { type: "start_game" });
    const started = await Promise.all(players.map((p, i) =>
      waitSince(p, startMarks[i], (m) => m.type === "game_started", "game_started")));
    players.forEach((p, i) => { p.role = started[i].role; });

    await Promise.all(players.map((p, i) =>
      waitSince(p, startMarks[i],
        (m) => m.type === "phase_change" && m.phase === "night" && m.round === 1,
        "initial night phase_change")));
    await waitSince(admin, startMarks[0], (m) => m.type === "awaiting_ready", "awaiting_ready");

    // Role distribution must be exactly 2/1/1/1/5
    const mafias = players.filter((p) => p.role === "mafia");
    const doctor = players.find((p) => p.role === "doctor")!;
    const detective = players.find((p) => p.role === "detective")!;
    const joker = players.find((p) => p.role === "joker")!;
    const citizens = players.filter((p) => p.role === "citizen");
    expect(mafias.length).toBe(2);
    expect(doctor).toBeDefined();
    expect(detective).toBeDefined();
    expect(joker).toBeDefined();
    expect(citizens.length).toBe(5);

    // Each mafia client's mafiaTeam must match the discovered mafia set
    const mafiaNames = mafias.map((m) => m.username).sort();
    for (const m of mafias) {
      const gs = started[players.indexOf(m)];
      expect([...(gs.mafiaTeam ?? [])].sort()).toEqual(mafiaNames);
    }
    assertNoViolations("game start");

    // Script targets: two distinct non-admin citizens
    const townTargets = citizens.filter((c) => c !== admin);
    expect(townTargets.length).toBeGreaterThanOrEqual(2);
    const [victimSaved, victimKilled] = townTargets;

    // ── Night 1 (admin gates the first night via narrator_ready) ───
    const mafiaPromptMarks = mafias.map((m) => m.inbox.length);
    send(admin.ws, { type: "narrator_ready" });
    const prompts = await Promise.all(mafias.map((m, i) =>
      waitSince(m, mafiaPromptMarks[i], (x) => x.type === "mafia_targets", "mafia_targets")));
    for (const pr of prompts) {
      expect(pr.players.length).toBe(8); // all alive non-mafia
      expect(pr.players.some((t: any) => mafiaNames.includes(t.username))).toBe(false);
    }

    // Doctor saves the mafia's target; detective investigates mafia #1
    const night1 = await runNight({
      mafiaAlive: mafias,
      killTarget: victimSaved,
      doctorSave: victimSaved,
      doctor, detective,
      detectiveTarget: mafias[0],
      expectVictimDies: false,
    });
    expect(night1.detRes.isMafia).toBe(true);
    // The save is public as a FACT (saved flag) but anonymous (no name) —
    // the recorder separately flags any named save event.
    for (const day of night1.dayMsgs) {
      expect(day.round).toBe(1);
      expect(day.saved).toBe(true);
    }
    // Private save notice goes to the saved player only (asserted globally below)
    await waitSince(victimSaved, 0, (m) => m.type === "doctor_save_private", "doctor_save_private");
    assertNoViolations("end of night 1");

    // ── Day 1: lynch mafia #1 ───────────────────────────────────────
    await runLynch(admin, mafias[0], false);
    assertNoViolations("end of day 1");

    // ── Night 2: remaining mafia kills a citizen; the kill lands ───
    const night2 = await runNight({
      mafiaAlive: [mafias[1]],
      killTarget: victimKilled,
      doctorSave: doctor,           // self-save; differs from last night's target
      doctor, detective,
      detectiveTarget: victimKilled, // a citizen → isMafia false
      expectVictimDies: true,
    });
    expect(night2.detRes.isMafia).toBe(false);
    for (const day of night2.dayMsgs) {
      expect(day.round).toBe(2);
      expect(day.saved).toBeFalsy();
    }
    assertNoViolations("end of night 2");

    // No client may have seen game_over yet
    for (const p of players) {
      expect(p.inbox.filter((m) => m.type === "game_over").length).toBe(0);
    }

    // ── Day 2: lynch mafia #2 → 0 mafia alive → natural town win ───
    const overs = (await runLynch(admin, mafias[1], true))!;
    for (const over of overs) {
      expect(over.winner).toBe("town");
      expect(over.forceEnded).toBeFalsy();
    }

    // game_over reveal must match the roles each client privately discovered
    for (const p of players) {
      const gos = p.inbox.filter((m) => m.type === "game_over");
      expect(gos.length).toBe(1); // win fired exactly once
      for (const q of players) {
        const entry = (gos[0].players ?? []).find((r: any) => r.username === q.username);
        expect(entry?.role).toBe(q.role);
      }
    }

    // ── Whole-game invariants over every client's full message log ──
    // Phase progression is coherent and identical for all clients
    for (const p of players) {
      const seq = p.inbox
        .filter((m) => m.type === "phase_change")
        .map((m) => [m.phase, m.round]);
      expect(seq).toEqual([
        ["night", 1], ["day", 1],
        ["night", 2], ["day", 2],
        ["game_over", 2],
      ]);
    }

    // Alive lists consistent: every client saw the same deaths in the same order
    const expectedDeaths = [mafias[0].userId, victimKilled.userId, mafias[1].userId];
    for (const p of players) {
      const deaths = p.inbox.filter((m) => m.type === "player_died").map((m) => m.playerId);
      expect(deaths).toEqual(expectedDeaths);
    }

    // you_died went to exactly the three dead players, once each
    for (const p of players) {
      const n = p.inbox.filter((m) => m.type === "you_died").length;
      expect(n).toBe(expectedDeaths.includes(p.userId) ? 1 : 0);
    }

    // doctor_save_private reached only the saved player
    for (const p of players) {
      const n = p.inbox.filter((m) => m.type === "doctor_save_private").length;
      expect(n).toBe(p === victimSaved ? 1 : 0);
    }

    // Secrecy + win-timing invariants held on every message all game long
    assertNoViolations("end of game");
  }, 90000);
});
