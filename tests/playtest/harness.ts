// ─────────────────────────────────────────────────────────────────────────
// Deterministic WebSocket playtest harness for the Mafia game.
//
// Boots a local server subprocess with a PINNED role deal (MAFIA_FIXED_DEAL),
// drives N bot players through a scripted scenario over real WebSockets, and
// returns every client's full message log + the final phase/game-over message
// for assertions.
//
// Protocol authority: src/server.ts (message handlers), src/types.ts (shapes),
// src/game-engine.ts (FixedDeal seam ~L701). Modelled on tests/e2e.test.ts.
//
// SELF-HEALING RULE: if a step fails and you find the cause, fix THIS file so
// it can't recur, then append a symptom→cause→fix entry to
// .claude/skills/playtest-mafia/SKILL.md (## Learnings).
// ─────────────────────────────────────────────────────────────────────────

import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Role } from "../../src/types.ts";

const SERVER_ENTRY = join(import.meta.dir, "..", "..", "src", "server.ts");

/** Any JSON message off the wire. `type` is always present. */
export type WSMessage = { type: string; [k: string]: any };

// ── PlaytestClient: one WS connection + an in-memory message log ───────────
export class PlaytestClient {
  ws!: WebSocket;
  /** Every message received on this socket, in arrival order. */
  readonly log: WSMessage[] = [];
  /** Resolved after register/login. */
  userId: number | null = null;
  /** Resolved after game_started — the role the fixed deal assigned. */
  role: Role | null = null;
  /** Resolved after join/create — the room code this client is in. */
  code: string | null = null;
  isAdmin = false;

  // Pending waiters keyed by predicate; each new message tries to settle them.
  private waiters: Array<{ pred: (m: WSMessage) => boolean; resolve: (m: WSMessage) => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(public readonly label: string) {}

  // ── Connection ─────────────────────────────────────────────────────────
  connect(port: number, timeoutMs = 4000): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${port}/ws`;
      this.ws = new WebSocket(url);
      const t = setTimeout(() => reject(new Error(`[${this.label}] WS connect timeout`)), timeoutMs);
      this.ws.onopen = () => { clearTimeout(t); resolve(); };
      this.ws.onerror = () => { clearTimeout(t); reject(new Error(`[${this.label}] WS connect error`)); };
      this.ws.onmessage = (e: MessageEvent) => {
        let m: WSMessage;
        try { m = JSON.parse(e.data as string); } catch { return; }
        this.log.push(m);
        // Settle any matching waiter (oldest first).
        for (let i = 0; i < this.waiters.length; i++) {
          if (this.waiters[i].pred(m)) {
            const w = this.waiters.splice(i, 1)[0];
            clearTimeout(w.timer);
            w.resolve(m);
            break;
          }
        }
      };
    });
  }

  send(msg: WSMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    try { this.ws.close(); } catch {}
  }

  // ── Message waiting ──────────────────────────────────────────────────────
  /**
   * Resolve with the NEXT message of `type` to arrive AFTER this call.
   * (Does not look back at the log — set up the waiter before triggering.)
   */
  waitFor(type: string, timeoutMs = 5000): Promise<WSMessage> {
    return this.waitMatch((m) => m.type === type, timeoutMs, type);
  }

  /** Resolve with the next message satisfying `pred` after this call. */
  waitMatch(pred: (m: WSMessage) => boolean, timeoutMs = 5000, desc = "match"): Promise<WSMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`[${this.label}] timeout waiting for ${desc}. Seen: [${this.log.map((m) => m.type).join(", ")}]`));
      }, timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  /** The most recent logged message of `type`, or undefined. */
  lastOf(type: string): WSMessage | undefined {
    for (let i = this.log.length - 1; i >= 0; i--) {
      if (this.log[i].type === type) return this.log[i];
    }
    return undefined;
  }

  /** All logged messages of `type`, in arrival order. */
  allOf(type: string): WSMessage[] {
    return this.log.filter((m) => m.type === type);
  }

  // ── Lobby / auth flow ────────────────────────────────────────────────────
  async register(name: string, passcode: string): Promise<number> {
    const p = this.waitFor("registered");
    this.send({ type: "register", username: name, passcode });
    const m = await p;
    this.userId = m.userId;
    return m.userId;
  }

  async login(name: string, passcode: string): Promise<number> {
    const p = this.waitFor("logged_in");
    this.send({ type: "login", username: name, passcode });
    const m = await p;
    this.userId = m.userId;
    return m.userId;
  }

  async createGame(): Promise<string> {
    const p = this.waitFor("game_created");
    this.send({ type: "create_game" });
    const m = await p;
    this.code = m.code;
    this.isAdmin = true;
    return m.code;
  }

  /** Join a room. Resolves on game_joined; the caller awaits lobby_update separately for join-order determinism. */
  async joinGame(code: string): Promise<WSMessage> {
    const p = this.waitFor("game_joined");
    this.send({ type: "join_game", code });
    const m = await p;
    this.code = code;
    this.isAdmin = !!m.isAdmin;
    return m;
  }

  async updateSettings(settings: Record<string, unknown>): Promise<WSMessage> {
    const p = this.waitFor("settings_updated");
    this.send({ type: "update_settings", settings });
    return p;
  }

  /** Send start_game and resolve with this client's own game_started. */
  async startGame(): Promise<WSMessage> {
    const p = this.waitFor("game_started");
    this.send({ type: "start_game" });
    const m = await p;
    this.role = m.role;
    return m;
  }

  /**
   * The narrator-ready gate. After start_game the admin receives `awaiting_ready`
   * and night actions are GATED (server returns early while awaitingNarratorReady).
   * Admin sends `narrator_ready`; server runs startNightSequence and emits
   * mafia_targets to the mafia. (server.ts case "narrator_ready", L1738.)
   */
  signalNarratorReady(): void {
    this.send({ type: "narrator_ready" });
  }

  // ── Night actions ────────────────────────────────────────────────────────
  /** Raw single mafia vote. voteType: "maybe" | "lock" | "letsnot". */
  mafiaVote(targetId: number, voteType: "maybe" | "lock" | "letsnot" = "lock"): void {
    this.send({ type: "mafia_vote", targetId, voteType });
  }

  confirmMafiaKill(): void {
    this.send({ type: "confirm_mafia_kill" });
  }

  /**
   * Full single-mafia kill handshake: maybe → (mafia_vote_update) → lock →
   * (mafia_confirm_ready) → confirm_mafia_kill → (night_action_done).
   * For multi-mafia consensus, drive each client's mafiaVote() manually.
   */
  async killAsMafia(targetId: number): Promise<void> {
    let p = this.waitFor("mafia_vote_update");
    this.mafiaVote(targetId, "maybe");
    await p;
    p = this.waitFor("mafia_confirm_ready");
    this.mafiaVote(targetId, "lock");
    await p;
    const done = this.waitFor("night_action_done");
    this.confirmMafiaKill();
    await done;
  }

  /** Doctor save. Resolves on night_action_done. */
  async doctorSave(targetId: number): Promise<WSMessage> {
    const p = this.waitFor("night_action_done");
    this.send({ type: "doctor_save", targetId });
    return p;
  }

  /** Detective investigate. Resolves on detective_result. */
  async detectiveInvestigate(targetId: number): Promise<WSMessage> {
    const p = this.waitFor("detective_result");
    this.send({ type: "detective_investigate", targetId });
    return p;
  }

  /**
   * Vigilante shoot (targetId === null = hold fire / keep the bullet).
   * Resolves on night_action_done (sent for both a real shot and a pass).
   */
  async vigilanteShoot(targetId: number | null): Promise<WSMessage> {
    const p = this.waitFor("night_action_done");
    this.send({ type: "vigilante_shoot", targetId });
    return p;
  }

  /** Joker haunt (official mode). */
  jokerHaunt(targetId: number): void {
    this.send({ type: "joker_haunt", targetId });
  }

  /** Hunter revenge (targetId null = decline). */
  hunterRevenge(targetId: number | null): void {
    this.send({ type: "hunter_revenge", targetId });
  }

  // ── Day actions ──────────────────────────────────────────────────────────
  /** Admin: nominate a player for execution. Resolves on vote_called. */
  async callVote(targetId: number): Promise<WSMessage> {
    const p = this.waitFor("vote_called");
    this.send({ type: "call_vote", targetId });
    return p;
  }

  /** Cast a thumbs up/down on the current nominee. */
  castVote(approve: boolean): void {
    this.send({ type: "cast_vote", approve });
  }

  /** Admin: end the day with no execution (auto-transition to night). */
  endDay(): void {
    this.send({ type: "end_day" });
  }

  /** Admin: force the night sub-phases to resolve to dawn. */
  forceDawn(): void {
    this.send({ type: "force_dawn" });
  }
}

// ── Server lifecycle ───────────────────────────────────────────────────────
/** Pick an uncommon high port unlikely to collide with the e2e suite (4567–5567). */
function pickPort(): number {
  return 7100 + Math.floor(Math.random() * 1800); // 7100–8899
}

/**
 * Find the first FREE TCP port at or after `start`. Probes by attempting to
 * bind a throwaway `Bun.serve` (the same binder the real server uses), so a
 * port that passes here will actually be bindable by src/server.ts.
 * Used by the human-in-the-loop proof runner which needs a KNOWN port to print.
 */
export function findFreePort(start = 3100, attempts = 200): number {
  for (let p = start; p < start + attempts; p++) {
    try {
      const s = Bun.serve({ port: p, fetch: () => new Response("ok") });
      s.stop(true);
      return p;
    } catch {
      // busy — try the next one
    }
  }
  throw new Error(`No free port found in [${start}, ${start + attempts})`);
}

/**
 * Boot the Mafia server subprocess with a pinned deal + ephemeral DB on an
 * explicit `port`, and wait until it accepts WS connections. Returns the live
 * process and a `teardown()` that kills it and removes the temp DB (+wal/shm).
 *
 * This is the SAME boot path `runScenario` uses, factored out so the proof
 * runner (which must keep the server alive while a human plays) can reuse it.
 */
export async function bootServer(opts: {
  port: number;
  roles: Role[];
  lovers?: [number, number];
  dbPath?: string;
}): Promise<{ proc: ReturnType<typeof Bun.spawn>; port: number; dbPath: string; teardown: () => Promise<void> }> {
  const dbPath = opts.dbPath ?? join(tmpdir(), `mafia-proof-${Date.now()}-${opts.port}.db`);
  const fixedDeal = JSON.stringify({ roles: opts.roles, ...(opts.lovers ? { lovers: opts.lovers } : {}) });
  const proc = Bun.spawn(["bun", "run", SERVER_ENTRY], {
    env: { ...process.env, PORT: String(opts.port), DATABASE_PATH: dbPath, MAFIA_FIXED_DEAL: fixedDeal },
    cwd: join(import.meta.dir, "..", ".."),
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForServer(opts.port);
  const teardown = async () => {
    try { proc.kill(); } catch {}
    await Bun.sleep(50);
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try { unlinkSync(f); } catch {}
    }
  };
  return { proc, port: opts.port, dbPath, teardown };
}

/**
 * Poll the admin client's `lobby_update` log until the room holds exactly
 * `target` players (or resolve immediately if it already does). Used by the
 * proof runner to wait for the live human to JOIN before starting the game.
 * Resolves with the final lobby_update message.
 */
export async function waitForLobbyCount(
  admin: PlaytestClient,
  target: number,
  timeoutMs = 600000,
): Promise<WSMessage> {
  const already = admin.lastOf("lobby_update");
  if (already && Array.isArray(already.players) && already.players.length >= target) return already;
  return admin.waitMatch(
    (m) => m.type === "lobby_update" && Array.isArray(m.players) && m.players.length >= target,
    timeoutMs,
    `lobby_update(>=${target})`,
  );
}

async function waitForServer(port: number, attempts = 40): Promise<void> {
  const url = `ws://localhost:${port}/ws`;
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((ok, fail) => {
        const ws = new WebSocket(url);
        ws.onopen = () => { ws.close(); ok(); };
        ws.onerror = () => fail(new Error("not up"));
      });
      return;
    } catch {
      await Bun.sleep(150);
    }
  }
  throw new Error(`Server did not come up on :${port}`);
}

// ── Scenario specification ───────────────────────────────────────────────────
//
// TIMELINE FORMAT — chosen for readability + determinism:
// `timeline` is an ordered array of async steps. Each step is a function
// `(ctx) => Promise<void> | void` receiving a ScenarioContext, whose `clients`
// array is indexed by JOIN ORDER (clients[0] is the admin/creator; the fixed
// deal assigns role[i] to clients[i]). A step calls PlaytestClient methods and
// awaits whatever it needs. This keeps the format dead-simple (no DSL to learn)
// while still being fully scripted and deterministic. `sleep(ms)` is provided
// for the rare timing wait. Steps run strictly in order, each awaited.
//
// Example:
//   timeline: [
//     async ({ clients }) => { clients[0].signalNarratorReady(); },
//     async ({ clients }) => {
//       const mafia = clients[0]; // role[0] === "mafia"
//       const targets = mafia.lastOf("mafia_targets")!.players;
//       await mafia.killAsMafia(targets[0].id);
//     },
//   ]
// ─────────────────────────────────────────────────────────────────────────────
export interface ScenarioContext {
  /** Bot clients, indexed by JOIN ORDER (matches MAFIA_FIXED_DEAL role index). */
  clients: PlaytestClient[];
  /** The room code all clients are in. */
  code: string;
  /** The port the server is listening on. */
  port: number;
  /** Convenience sleep. */
  sleep: (ms: number) => Promise<void>;
}

export type ScenarioStep = (ctx: ScenarioContext) => Promise<void> | void;

export interface ScenarioSpec {
  /** Fixed role deal — role[i] is assigned to the i-th client in join order. */
  roles: Role[];
  /** Optional lover pair (join-order indices). */
  lovers?: [number, number];
  /** Optional Godfather pin (join-order index of the mafioso to flag). */
  godfather?: number;
  /** Optional lobby settings to apply (admin) before start_game. */
  settings?: Record<string, unknown>;
  /** Whether the admin should send narrator_ready automatically after start. Default false (let the timeline do it). */
  autoNarratorReady?: boolean;
  /** Ordered, awaited steps executed after the game starts. */
  timeline?: ScenarioStep[];
  /** Base name for bot usernames (default "bot"). Made unique per run. */
  namePrefix?: string;
}

export interface ScenarioResult {
  clients: PlaytestClient[];
  code: string;
  port: number;
  /** Last phase_change seen by the admin client (if any). */
  lastPhaseChange?: WSMessage;
  /** game_over seen by the admin client (if any). */
  gameOver?: WSMessage;
}

// ── runScenario ──────────────────────────────────────────────────────────────
/**
 * Boot a pinned-role server, connect N bots, register+login each, have
 * clients[0] create the room, the rest join IN ORDER (awaiting lobby_update so
 * join order is deterministic), start the game (handling the narrator-ready
 * gate per spec), run the timeline, then tear everything down. Returns each
 * client's log + final phase/game-over message.
 */
export async function runScenario(spec: ScenarioSpec): Promise<ScenarioResult> {
  const n = spec.roles.length;
  if (n < 3) throw new Error("runScenario needs at least 3 roles (server min players is 3)");

  const port = pickPort();
  const dbPath = join(tmpdir(), `mafia-playtest-${Date.now()}-${port}.db`);
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const prefix = spec.namePrefix ?? "bot";

  const fixedDeal = JSON.stringify({
    roles: spec.roles,
    ...(spec.lovers ? { lovers: spec.lovers } : {}),
    ...(spec.godfather != null ? { godfather: spec.godfather } : {}),
  });

  const serverProc = Bun.spawn(["bun", "run", SERVER_ENTRY], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, MAFIA_FIXED_DEAL: fixedDeal },
    cwd: join(import.meta.dir, "..", ".."),
    stdout: "ignore",
    stderr: "ignore",
  });

  const clients: PlaytestClient[] = [];
  const sleep = (ms: number) => Bun.sleep(ms);

  try {
    await waitForServer(port);

    // 1. Connect + register + login every bot.
    for (let i = 0; i < n; i++) {
      const c = new PlaytestClient(`${prefix}${i}`);
      await c.connect(port);
      const username = `${prefix}_${runId}_${i}`;
      const passcode = String(1000 + (i % 9000)).padStart(4, "0");
      await c.register(username, passcode);
      clients.push(c);
    }

    // 2. clients[0] creates the room.
    const code = await clients[0].createGame();
    // Admin's own create also yields a lobby_update; ignore it.

    // 3. The rest join IN ORDER. Await each one's lobby_update reflecting the
    //    new count on the ADMIN socket before sending the next join, so the
    //    server's join order (and thus fixed-deal role mapping) is deterministic.
    for (let i = 1; i < n; i++) {
      const expectedCount = i + 1;
      const lobbyP = clients[0].waitMatch(
        (m) => m.type === "lobby_update" && Array.isArray(m.players) && m.players.length === expectedCount,
        5000,
        `lobby_update(${expectedCount})`
      );
      await clients[i].joinGame(code);
      await lobbyP;
    }

    // 4. Optional lobby settings (admin).
    if (spec.settings) {
      await clients[0].updateSettings(spec.settings);
    }

    // 5. Start the game. Set up every client's game_started + the admin's
    //    awaiting_ready BEFORE sending start_game (avoid races).
    const startedPromises = clients.map((c) => c.waitFor("game_started"));
    const awaitingP = clients[0].waitFor("awaiting_ready");
    clients[0].send({ type: "start_game" });
    const started = await Promise.all(startedPromises);
    started.forEach((m, i) => { clients[i].role = m.role; });
    await awaitingP;

    // 6. Narrator-ready gate. Either auto-signal (and wait for the mafia's
    //    targets to confirm the night opened), or let the timeline drive it.
    if (spec.autoNarratorReady) {
      const mafiaIdx = spec.roles.indexOf("mafia");
      const targetsP = mafiaIdx >= 0 ? clients[mafiaIdx].waitFor("mafia_targets") : null;
      clients[0].signalNarratorReady();
      if (targetsP) await targetsP;
    }

    // 7. Run the timeline.
    const ctx: ScenarioContext = { clients, code, port, sleep };
    for (const step of spec.timeline ?? []) {
      await step(ctx);
    }

    return {
      clients,
      code,
      port,
      lastPhaseChange: clients[0].lastOf("phase_change"),
      gameOver: clients[0].lastOf("game_over"),
    };
  } finally {
    // Teardown: close sockets, kill server, remove temp DB (+ wal/shm).
    for (const c of clients) c.close();
    await Bun.sleep(50);
    try { serverProc.kill(); } catch {}
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try { unlinkSync(f); } catch {}
    }
  }
}
