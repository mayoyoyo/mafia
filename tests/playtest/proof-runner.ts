// ─────────────────────────────────────────────────────────────────────────
// Human-in-the-loop "proof runner" for the Mafia game.
//
// Boots a local Mafia server on a KNOWN port with a pinned role deal, connects
// BOT clients for every seat except the LAST (which a real human joins in a
// browser), waits for the human to join, then drives the bots through a
// scripted night so the human can SCREENSHOT the resulting dawn view.
//
//   bun run tests/playtest/proof-runner.ts doctor-reveal
//   bun run tests/playtest/proof-runner.ts parity-continue
//
// SELF-TEST (no human needed — a bot fills the human seat, asserts end state):
//   bun run tests/playtest/proof-runner.ts doctor-reveal  --selftest
//   bun run tests/playtest/proof-runner.ts parity-continue --selftest
//
// Roles are dealt by JOIN ORDER (MAFIA_FIXED_DEAL seam): clients[i] → roles[i].
// The human is ALWAYS the last slot and always a passive role (no night action).
// ─────────────────────────────────────────────────────────────────────────

import type { Role } from "../../src/types.ts";
import {
  PlaytestClient,
  bootServer,
  findFreePort,
  waitForLobbyCount,
  type WSMessage,
} from "./harness.ts";

// ── Scenario catalogue ──────────────────────────────────────────────────────
interface ProofScenario {
  /** Fixed deal — role[i] → join-slot i. Last slot = the human (passive). */
  roles: Role[];
  /** Lobby settings (optional roles must be enable*'d). */
  settings: Record<string, unknown>;
  /** One line telling the human what role they have / what to expect. */
  humanRoleDesc: string;
  /** One line describing what the human should see on screen after the script. */
  expectedView: string;
  /**
   * The scripted night. `bots` are the BOT clients only (in PROOF mode the human
   * seat is NOT among them; in --selftest a bot fills it and IS among them).
   * `seatUserId(joinIdx)` resolves ANY seat's userId — including the human's —
   * from the admin bot's lobby roster, so the night works in both modes.
   */
  runNight: (bots: PlaytestClient[], seatUserId: (joinIdx: number) => number, humanIdx: number) => Promise<void>;
  /**
   * Self-test assertion over the final client logs. Throws on failure.
   * Returns a human-readable PASS summary string.
   */
  assertSelfTest: (clients: PlaytestClient[], humanIdx: number) => string;
}

const SCENARIOS: Record<string, ProofScenario> = {
  // ── 1. doctor-reveal ──────────────────────────────────────────────────────
  // deal: [mafia, doctor, citizen]; human = citizen (slot 2, the victim).
  // mafia kills the citizen; doctor saves the citizen → citizen SURVIVES with
  // NO private "you were targeted/saved" message (official-mode anonymity).
  "doctor-reveal": {
    roles: ["mafia", "doctor", "citizen"],
    settings: { enableDoctor: true },
    humanRoleDesc: "You are the CITIZEN (slot 3). You have no night action — just watch.",
    expectedView:
      "Dawn breaks and YOU ARE STILL ALIVE. There is NO private 'you were targeted / the doctor saved you' message — only the anonymous public dawn narration (someone was saved).",
    async runNight(bots, seatUserId, humanIdx) {
      const mafia = bots[0];
      const doctor = bots[1];
      const victimId = seatUserId(humanIdx); // the citizen (human seat, slot 2)

      // 1) Mafia kills the citizen.
      const targets = mafia.lastOf("mafia_targets")!.players as Array<{ id: number }>;
      if (!targets.some((t) => t.id === victimId)) {
        throw new Error("citizen is not a legal mafia target");
      }
      await mafia.killAsMafia(victimId);

      // 2) Doctor saves the citizen. Doctor is the last night actor → resolving
      //    the save advances the night to dawn (day). Wait for that phase_change.
      await doctor.waitFor("doctor_targets");
      const dawnP = bots[0].waitMatch(
        (m) => m.type === "phase_change" && m.phase === "day",
        8000,
        "phase_change(day)",
      );
      await doctor.doctorSave(victimId);
      await dawnP;
      await Bun.sleep(200); // settle: let any (wrongly-sent) private message land
    },
    assertSelfTest(clients, humanIdx) {
      const victim = clients[humanIdx]; // citizen
      const privates = victim.allOf("doctor_save_private");
      if (privates.length !== 0) {
        throw new Error(`citizen received ${privates.length} doctor_save_private message(s); expected 0`);
      }
      // Still alive: the citizen must NOT have a you_died, and must NOT be a
      // player_died target.
      if (victim.lastOf("you_died")) throw new Error("citizen received you_died; expected to survive");
      const deaths = clients[0].allOf("player_died").map((m) => m.playerId);
      if (deaths.includes(victim.userId!)) {
        throw new Error("citizen appears in a player_died broadcast; expected to survive");
      }
      // Dawn reached day (not game_over) and the save was flagged.
      const dawn = clients[0].lastOf("phase_change");
      if (!dawn || dawn.phase !== "day") throw new Error(`expected dawn phase_change phase=day, got ${dawn?.phase}`);
      if (dawn.saved !== true) throw new Error("dawn phase_change did not flag saved:true");
      return `citizen survived, received 0 doctor_save_private, dawn=day saved=true`;
    },
  },

  // ── 2. parity-continue ────────────────────────────────────────────────────
  // deal: [mafia, doctor, citizen, joker]; human = joker (slot 3, passive).
  // mafia kills the citizen; doctor saves SELF (not the citizen) → citizen DIES.
  // alive = {mafia, doctor, joker} = mafia-parity-WITH-a-doctor → game CONTINUES
  // to Day 1 (doctor-suppresses-parity rule), it does NOT show MAFIA WINS.
  "parity-continue": {
    roles: ["mafia", "doctor", "citizen", "joker"],
    settings: { enableDoctor: true, enableJoker: true },
    humanRoleDesc: "You are the JOKER (slot 4). You have no required night action — just watch.",
    expectedView:
      "The citizen has died (shown in the noir dawn narration) and the game CONTINUES to Day 1 — a day/voting phase begins. It does NOT show 'MAFIA WINS' / game over, even though Mafia is at parity, because a Doctor is still alive.",
    async runNight(bots, _seatUserId, _humanIdx) {
      const mafia = bots[0];
      const doctor = bots[1];
      const citizenId = bots[2].userId!; // citizen is a bot (slot 2) in both modes
      const doctorId = bots[1].userId!;

      // 1) Mafia kills the citizen.
      const targets = mafia.lastOf("mafia_targets")!.players as Array<{ id: number }>;
      if (!targets.some((t) => t.id === citizenId)) {
        throw new Error("citizen is not a legal mafia target");
      }
      await mafia.killAsMafia(citizenId);

      // 2) Doctor saves SELF (not the citizen) so the citizen dies. Doctor is the
      //    last night actor → resolving advances to dawn. Joker is passive (no
      //    required night action), so the night resolves on its own.
      await doctor.waitFor("doctor_targets");
      const dawnP = bots[0].waitMatch(
        (m) => m.type === "phase_change",
        8000,
        "phase_change(dawn)",
      );
      await doctor.doctorSave(doctorId); // self-save
      await dawnP;
      await Bun.sleep(200);
    },
    assertSelfTest(clients, humanIdx) {
      const citizen = clients[2];
      const joker = clients[humanIdx];

      // Citizen is dead.
      const deaths = clients[0].allOf("player_died").map((m) => m.playerId);
      if (!deaths.includes(citizen.userId!)) {
        throw new Error("citizen did NOT die; expected the unsaved mafia target to die");
      }
      // Joker is alive (no you_died, not in player_died).
      if (joker.lastOf("you_died")) throw new Error("joker received you_died; expected to survive");
      if (deaths.includes(joker.userId!)) throw new Error("joker appears in player_died; expected to survive");

      // Game CONTINUED to a day/voting phase — NOT game_over, no winner declared.
      const dawn = clients[0].lastOf("phase_change");
      if (!dawn) throw new Error("no dawn phase_change seen");
      if (dawn.phase !== "day") {
        throw new Error(`expected game to continue to day, but dawn phase=${dawn.phase}`);
      }
      const over = clients[0].lastOf("game_over");
      if (over) throw new Error(`game_over was broadcast (winner=${over.winner}); expected the game to continue`);
      return `citizen died, joker alive, dawn=day (no game_over) — doctor-suppresses-parity continued the game`;
    },
  },
};

// ── Bot lobby setup (shared by proof + self-test) ────────────────────────────
/**
 * Connect+register `n` bots, have bots[0] create the room, the rest join in
 * deterministic order. If `fillSeats === n` (self-test) all seats are bots;
 * otherwise `fillSeats` bots are seated and the remaining seats wait for humans.
 * Returns the bot clients (length = fillSeats) + room code.
 */
async function setupBots(port: number, runId: string, fillSeats: number): Promise<{ bots: PlaytestClient[]; code: string }> {
  const bots: PlaytestClient[] = [];
  for (let i = 0; i < fillSeats; i++) {
    const c = new PlaytestClient(`bot${i}`);
    await c.connect(port);
    const username = `proofbot_${runId}_${i}`;
    const passcode = String(1000 + (i % 9000)).padStart(4, "0");
    await c.register(username, passcode);
    bots.push(c);
  }

  const code = await bots[0].createGame();

  // Join the remaining bot seats IN ORDER, awaiting the admin's lobby_update at
  // each new count so join order (and the fixed-deal role mapping) is deterministic.
  for (let i = 1; i < fillSeats; i++) {
    const expectedCount = i + 1;
    const lobbyP = bots[0].waitMatch(
      (m) => m.type === "lobby_update" && Array.isArray(m.players) && m.players.length === expectedCount,
      8000,
      `lobby_update(${expectedCount})`,
    );
    await bots[i].joinGame(code);
    await lobbyP;
  }
  return { bots, code };
}

/** Start the game (admin) and open the night via narrator_ready. */
async function startAndOpenNight(clients: PlaytestClient[]): Promise<void> {
  const startedPromises = clients.map((c) => c.waitFor("game_started", 8000));
  const awaitingP = clients[0].waitFor("awaiting_ready", 8000);
  clients[0].send({ type: "start_game" });
  const started = await Promise.all(startedPromises);
  started.forEach((m, i) => { clients[i].role = m.role; });
  await awaitingP;

  // Narrator-ready gate → opens the night; mafia receives mafia_targets.
  const mafiaIdx = 0; // slot 0 is mafia in both scenarios
  const targetsP = clients[mafiaIdx].waitFor("mafia_targets", 8000);
  clients[0].signalNarratorReady();
  await targetsP;
}

// ── PROOF mode (one real human in the last seat) ─────────────────────────────
async function runProof(scenarioName: string): Promise<void> {
  const scenario = SCENARIOS[scenarioName];
  const total = scenario.roles.length;
  const humanIdx = total - 1;
  const botSeats = total - 1; // everyone except the human

  const port = findFreePort(3100);
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const url = `http://localhost:${port}`;

  const srv = await bootServer({ port, roles: scenario.roles });

  // Clean teardown on Ctrl-C.
  let bots: PlaytestClient[] = [];
  const teardown = async () => {
    for (const b of bots) b.close();
    await srv.teardown();
  };
  process.on("SIGINT", async () => {
    console.log("\n[proof-runner] SIGINT — tearing down server + sockets…");
    await teardown();
    process.exit(0);
  });

  const setup = await setupBots(port, runId, botSeats);
  bots = setup.bots;
  const code = setup.code;

  console.log("");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  MAFIA PROOF RUNNER — scenario: ${scenarioName}`);
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("  WARNING: run this standalone — do NOT run `bun test` concurrently");
  console.log("           (server starvation can drop the bot sockets).");
  console.log("");
  console.log(`  >>> OPEN THIS URL IN YOUR BROWSER:   ${url}`);
  console.log("");
  console.log(`  1. Register a NEW account (any username, 4-digit passcode).`);
  console.log(`  2. JOIN room   ${code}`);
  console.log("");
  console.log(`  ${scenario.humanRoleDesc}`);
  console.log("");
  console.log(`  ${botSeats} bot(s) are already seated. Waiting for YOU to join…`);
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("");

  // Wait (poll admin's lobby_update) until the human joins → total players.
  // Heartbeat every ~20s so the process is visibly alive while waiting on a human.
  const waitStarted = Date.now();
  const heartbeat = setInterval(() => {
    const elapsed = Math.round((Date.now() - waitStarted) / 1000);
    const lastLobby = bots[0].lastOf("lobby_update");
    const seated = Array.isArray(lastLobby?.players) ? lastLobby.players.length : botSeats;
    console.log(`[proof-runner] still waiting for the human to join... (${elapsed}s elapsed, ${seated}/${total} seated)`);
  }, 20_000);

  let finalLobby: WSMessage;
  try {
    finalLobby = await waitForLobbyCount(bots[0], total, 10 * 60 * 1000);
  } finally {
    clearInterval(heartbeat);
  }
  console.log(`[proof-runner] Human joined — lobby now has ${total} players. Starting game…`);

  // Seat→userId resolver from the admin's lobby roster. The lobby_update.players
  // array is in JOIN ORDER (= fixed-deal index), so players[joinIdx].id is the
  // userId of that seat — including the human's seat the bots can't reference.
  const roster = (finalLobby.players as Array<{ id: number }>);
  const seatUserId = (joinIdx: number): number => {
    const entry = roster[joinIdx];
    if (!entry) throw new Error(`no lobby roster entry for seat ${joinIdx} (have ${roster.length})`);
    return entry.id;
  };

  // The bots are clients[0..botSeats-1]; the human occupies the last seat
  // server-side. We drive only the bot clients.
  await startAndOpenNight(bots);
  await scenario.runNight(bots, seatUserId, humanIdx);

  console.log("");
  console.log("===== READY FOR SCREENSHOT =====");
  console.log(`Scenario: ${scenarioName}`);
  console.log(`What you should see now: ${scenario.expectedView}`);
  console.log("");
  console.log("(Process is idling to keep the game + sockets alive. Press Ctrl-C to tear down.)");

  // Idle forever (until SIGINT).
  await new Promise<void>(() => {});
}

// ── SELF-TEST mode (a bot fills the human seat; assert end state) ────────────
async function runSelfTest(scenarioName: string): Promise<{ ok: boolean; summary: string }> {
  const scenario = SCENARIOS[scenarioName];
  const total = scenario.roles.length;
  const humanIdx = total - 1;

  const port = findFreePort(3100 + Math.floor(Math.random() * 400)); // avoid colliding with a live proof on 3100
  const runId = `selftest_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const srv = await bootServer({ port, roles: scenario.roles });

  let clients: PlaytestClient[] = [];
  try {
    // ALL seats are bots (human seat filled by a bot too).
    const setup = await setupBots(port, runId, total);
    clients = setup.bots;

    // Apply the scenario's lobby settings (admin) before start.
    await clients[0].updateSettings(scenario.settings);

    await startAndOpenNight(clients);
    // In self-test every seat is a bot, so resolve a seat's userId from its client.
    const seatUserId = (joinIdx: number): number => clients[joinIdx].userId!;
    await scenario.runNight(clients, seatUserId, humanIdx);

    const summary = scenario.assertSelfTest(clients, humanIdx);
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, summary: (e as Error).message };
  } finally {
    for (const c of clients) c.close();
    await srv.teardown();
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const selftest = args.includes("--selftest");
  const scenarioName = args.find((a) => !a.startsWith("--"));

  if (selftest && !scenarioName) {
    // --selftest with no scenario → run BOTH and report.
    let allOk = true;
    for (const name of Object.keys(SCENARIOS)) {
      const r = await runSelfTest(name);
      console.log(`[selftest] ${name}: ${r.ok ? "PASS" : "FAIL"} — ${r.summary}`);
      if (!r.ok) allOk = false;
    }
    process.exit(allOk ? 0 : 1);
  }

  if (!scenarioName || !SCENARIOS[scenarioName]) {
    console.error(`Usage: bun run tests/playtest/proof-runner.ts <${Object.keys(SCENARIOS).join("|")}> [--selftest]`);
    console.error(`Unknown scenario: ${scenarioName ?? "(none)"}`);
    process.exit(2);
  }

  if (selftest) {
    const r = await runSelfTest(scenarioName);
    console.log(`[selftest] ${scenarioName}: ${r.ok ? "PASS" : "FAIL"} — ${r.summary}`);
    process.exit(r.ok ? 0 : 1);
  }

  await runProof(scenarioName);
}

main().catch((e) => {
  console.error("[proof-runner] fatal:", e);
  process.exit(1);
});
