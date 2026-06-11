import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

/**
 * B0d — structured logging at the server choke points (audit D2/D9) + the
 * dumpGame debug serializer.
 *
 * Part 1 (engine-level, no ports): dumpGame(game) produces a JSON-safe
 * snapshot — Maps become arrays/objects, JSON.stringify round-trips, key
 * fields survive.
 *
 * Part 2 (WS-level): a spawned server emits one structured JSON line on
 * STDOUT (never the wire) for each inbound WS message, night-timer event
 * (armed/fired) and phase transition. The golden-sequence tests prove the
 * wire stays untouched; here we capture the subprocess stdout pipe and
 * assert the lines appear.
 *
 * Port band: 20600-20999 claimed by this file (taken elsewhere: 4567, 5567,
 * 6567, 7600, 8600, 9600, 10600, 11600-13599, 13600-17600 reserved,
 * 18600-19999 golden-sequences).
 */

import {
  createGame, addPlayer, startGame, removeGame, setFixedDeal, submitMafiaVote,
} from "../src/game-engine";
import type { FixedDeal } from "../src/game-engine";
import { dumpGame } from "../src/debug";

// ── Part 1: dumpGame serializer (no server, no ports) ───────────────────

describe("B0d: dumpGame serializer", () => {
  function buildNightGame() {
    setFixedDeal({ roles: ["mafia", "citizen", "citizen"] });
    const game = createGame(9001, "dump_admin");
    addPlayer(game, 9002, "dump_bob");
    addPlayer(game, 9003, "dump_carol");
    startGame(game);
    setFixedDeal(null);
    return game;
  }

  test("Maps are serialized and the snapshot JSON round-trips", () => {
    const game = buildNightGame();
    try {
      // Populate the Map-typed fields so serialization is actually exercised
      submitMafiaVote(game, 9001, 9002, "maybe");
      submitMafiaVote(game, 9001, 9002, "lock");
      game.votes.set(9003, true);

      const dump = dumpGame(game) as any;

      // Key fields present
      expect(dump.code).toBe(game.code);
      expect(dump.phase).toBe("night");
      expect(dump.round).toBe(1);
      expect(dump.adminId).toBe(9001);
      expect(dump.nightSubPhase).toBe("mafia");
      expect(dump.settings.mafiaCount).toBe(1);

      // players Map -> array (join order), plain objects
      expect(Array.isArray(dump.players)).toBe(true);
      expect(dump.players.length).toBe(3);
      expect(dump.players[0].username).toBe("dump_admin");
      expect(dump.players[0].role).toBe("mafia");

      // mafiaVotes Map -> plain object keyed by voter id
      expect(dump.mafiaVotes["9001"]).toEqual([{ targetId: 9002, voteType: "lock" }]);
      // votes Map -> plain object
      expect(dump.votes["9003"]).toBe(true);

      // JSON.stringify round-trips losslessly (no functions, no undefined,
      // no circular refs — stringify would throw on a cycle)
      const back = JSON.parse(JSON.stringify(dump));
      expect(back).toEqual(dump);
    } finally {
      removeGame(game.code);
    }
  });

  test("dump keys exactly mirror Game keys (runtime twin of the satisfies guard)", () => {
    const game = buildNightGame();
    try {
      expect(Object.keys(dumpGame(game)).sort()).toEqual(Object.keys(game).sort());
    } finally {
      removeGame(game.code);
    }
  });

  test("snapshot contains no Map/Set/function values anywhere", () => {
    const game = buildNightGame();
    try {
      const dump = dumpGame(game);
      const offenders: string[] = [];
      const walk = (v: unknown, path: string) => {
        if (v instanceof Map || v instanceof Set || typeof v === "function") {
          offenders.push(`${path}: ${typeof v === "function" ? "function" : v.constructor.name}`);
          return;
        }
        if (v && typeof v === "object") {
          for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
        }
      };
      walk(dump, "dump");
      expect(offenders).toEqual([]);
    } finally {
      removeGame(game.code);
    }
  });
});

// ── B7 (audit P8): typed sound-cue producer (pure unit, no ports) ───────

import { subPhaseCue } from "../src/types";

describe("B7: subPhaseCue typed producer", () => {
  test("emits the exact historical cue string for every cue-emitting sub-phase", () => {
    // Pinned byte-for-byte: the goldens assert these on the wire; this pins
    // the producer itself. "resolving" needs no case — subPhaseCue("resolving", ...)
    // is a compile error (CueSubPhase excludes it).
    expect(subPhaseCue("mafia", "open")).toBe("mafia_open");
    expect(subPhaseCue("mafia", "close")).toBe("mafia_close");
    expect(subPhaseCue("doctor", "open")).toBe("doctor_open");
    expect(subPhaseCue("doctor", "close")).toBe("doctor_close");
    expect(subPhaseCue("detective", "open")).toBe("detective_open");
    expect(subPhaseCue("detective", "close")).toBe("detective_close");
  });
});

// ── Part 2: server choke-point logs on subprocess stdout ────────────────

const PORT = 20600 + Math.floor(Math.random() * 400); // band 20600-20999
const WS_URL = `ws://localhost:${PORT}/ws`;
const DB_PATH = `/tmp/mafia-slog-${Date.now()}-${PORT}.db`;
// P0 = admin = the lone mafia; doctor/detective disabled so the night
// resolves straight after the mafia confirm (timer kind "resolve"). Four
// players so the night-1 kill leaves 1 mafia vs 2 citizens (no insta-win).
const FIXED_DEAL: FixedDeal = { roles: ["mafia", "citizen", "citizen", "citizen"] };

let serverProc: ReturnType<typeof Bun.spawn> | null = null;
let stdoutBuf = "";
let stderrBuf = "";

function startStreamReader(stream: ReadableStream<Uint8Array>, append: (s: string) => void): void {
  const dec = new TextDecoder();
  (async () => {
    for await (const chunk of stream) append(dec.decode(chunk, { stream: true }));
  })();
}

/** Last ~2KB of the server's stderr, for diagnosing crashed/wedged servers. */
function stderrTail(): string {
  const tail = stderrBuf.slice(-2000).trim();
  return tail ? `\n--- server stderr (tail) ---\n${tail}` : " (server stderr empty)";
}

/** Parsed structured log lines seen so far on the server's stdout. */
function slogLines(): any[] {
  return stdoutBuf
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && typeof e.slog === "string");
}

async function waitForLog(pred: (e: any) => boolean, label: string, timeout = 6000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = slogLines().find(pred);
    if (hit) return hit;
    await Bun.sleep(100);
  }
  throw new Error(`Timeout waiting for slog line: ${label}${stderrTail()}`);
}

function waitFor(ws: WebSocket, type: string, timeout = 6000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${type}`)), timeout);
    const h = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === type) { clearTimeout(t); ws.removeEventListener("message", h); resolve(m); }
    };
    ws.addEventListener("message", h);
  });
}

function waitMatch(ws: WebSocket, pred: (m: any) => boolean, label: string, timeout = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeout);
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

async function reg(name: string, pin: string): Promise<{ ws: WebSocket; userId: number }> {
  const ws = await openWS();
  send(ws, { type: "register", username: name, passcode: pin });
  const r = await waitFor(ws, "registered");
  return { ws, userId: r.userId as number };
}

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: DB_PATH,
      MAFIA_FIXED_DEAL: JSON.stringify(FIXED_DEAL),
    },
    cwd: import.meta.dir + "/..",
    stdout: "pipe", stderr: "pipe",
  });
  startStreamReader(serverProc.stdout as ReadableStream<Uint8Array>, (s) => { stdoutBuf += s; });
  startStreamReader(serverProc.stderr as ReadableStream<Uint8Array>, (s) => { stderrBuf += s; });
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
  throw new Error(`Server failed to start${stderrTail()}`);
});

afterAll(() => {
  try { serverProc?.kill(); } catch {}
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try { unlinkSync(f); } catch {}
  }
});

describe("B0d: server choke-point logs on stdout", () => {
  test("inbound messages, night-timer arm/fire, and phase transitions all log", async () => {
    const ts = Date.now();
    const p0 = await reg(`slog_admin_${ts}`, "1111");
    const p1 = await reg(`slog_p1_${ts}`, "2222");
    const p2 = await reg(`slog_p2_${ts}`, "3333");
    const p3 = await reg(`slog_p3_${ts}`, "4444");

    // Pre-game inbound message: code resolves to null
    const regLine = await waitForLog(
      (e) => e.slog === "ws_in" && e.type === "register" && e.userId === null,
      "ws_in register",
    );
    expect(regLine.code).toBe(null);
    expect(regLine.phase).toBe(null);

    // Lobby → start
    send(p0.ws, { type: "create_game" });
    const created = await waitFor(p0.ws, "game_created");
    const code = created.code as string;
    for (const p of [p1, p2, p3]) {
      send(p.ws, { type: "join_game", code });
      await waitFor(p.ws, "game_joined");
    }
    send(p0.ws, {
      type: "update_settings",
      settings: { mafiaCount: 1, enableDoctor: false, enableDetective: false, enableJoker: false, enableLovers: false },
    });
    await waitFor(p0.ws, "settings_updated");

    const startedPromises = [p0, p1, p2, p3].map((p) => waitFor(p.ws, "game_started"));
    const readyGate = waitFor(p0.ws, "awaiting_ready");
    send(p0.ws, { type: "start_game" });
    await Promise.all(startedPromises);
    await readyGate;

    // Phase transition: lobby → night
    const startLine = await waitForLog(
      (e) => e.slog === "phase_transition" && e.code === code && e.from === "lobby" && e.to === "night",
      "phase_transition lobby->night",
    );
    expect(startLine.reason).toBe("start_game");

    // Night: solo mafia (P0) locks P1 and confirms
    const mafiaTargets = waitFor(p0.ws, "mafia_targets");
    send(p0.ws, { type: "narrator_ready" });
    await mafiaTargets;

    // Solo-mafia consensus: maybe → lock (lock requires a prior maybe)
    const maybeUpdate = waitFor(p0.ws, "mafia_vote_update");
    send(p0.ws, { type: "mafia_vote", targetId: p1.userId, voteType: "maybe" });
    await maybeUpdate;
    const confirmReady = waitFor(p0.ws, "mafia_confirm_ready");
    send(p0.ws, { type: "mafia_vote", targetId: p1.userId, voteType: "lock" });
    await confirmReady;

    // In-game inbound message log carries code/phase/subPhase
    const voteLine = await waitForLog(
      (e) => e.slog === "ws_in" && e.type === "mafia_vote" && e.code === code,
      "ws_in mafia_vote",
    );
    expect(voteLine.userId).toBe(p0.userId);
    expect(voteLine.phase).toBe("night");
    expect(voteLine.subPhase).toBe("mafia");

    const done = waitFor(p0.ws, "night_action_done");
    // Attach dawn listeners BEFORE the confirm: the resolve timer fires ~1s
    // later and the phase_change would beat a late-attached listener.
    const dayPromises = [p0, p1, p2, p3].map((p) =>
      waitMatch(p.ws, (m) => m.type === "phase_change" && m.phase === "day", "day phase_change", 12000));
    send(p0.ws, { type: "confirm_mafia_kill" });
    await done;

    // Doctor/detective disabled → confirm arms the "resolve" timer, which
    // fires ~1s later and transitions night → day.
    const armed = await waitForLog(
      (e) => e.slog === "night_timer" && e.code === code && e.kind === "resolve" && e.event === "armed",
      "night_timer armed",
    );
    expect(armed.delay).toBe(1000);
    await waitForLog(
      (e) => e.slog === "night_timer" && e.code === code && e.kind === "resolve" && e.event === "fired",
      "night_timer fired",
    );

    await Promise.all(dayPromises);

    const dawnLine = await waitForLog(
      (e) => e.slog === "phase_transition" && e.code === code && e.from === "night" && e.to === "day",
      "phase_transition night->day",
    );
    expect(dawnLine.reason).toBe("night_resolved");
    expect(dawnLine.round).toBe(1);

    for (const p of [p0, p1, p2, p3]) p.ws.close();
  }, 30000);
});
