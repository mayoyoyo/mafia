import { getDb, createUser, loginUser, getUserById, saveLastSettings, getLastSettings, getUserPrefs, updateUserPref } from "./db";
import {
  createGame, getGame, removeGame, addPlayer, removePlayer, rejoinPlayer, updateSettings, sanitizeSettings,
  getPlayerInfo, rosterSummary, startGame, submitMafiaVote, removeMafiaVote, submitDoctorSave,
  submitDetectiveInvestigation, checkNightReady, transitionToDay, advanceNightSubPhase,
  callVote, castVote, resolveVote, cancelVote, endDay, forceDawn, forceEndGame,
  getAlivePlayers, getAliveByRole, getMafiaVoteStatus, restartGame, returnToLobby, getAllGames,
  submitJokerHaunt, getJokerHauntTargets, assertInvariants, assertPhaseEdge,
  toTargetInfo, projectGameOver, projectEventsForClients, submitHunterRevenge, submitVigilanteShoot,
} from "./game-engine";
import { Narrator } from "./narrator";
import { slog } from "./debug";
import type { ClientMessage, ServerMessage, WSClient, GameSettings, Game, PendingRevenge } from "./types";
import { subPhaseCue } from "./types";
import path from "path";
import fs from "fs";

// Player color palette (20 medium-brightness colors)
const PLAYER_COLORS = [
  "#E53935", "#EC407A", "#AB47BC", "#7E57C2", "#5C6BC0",
  "#42A5F5", "#29B6F6", "#26C6DA", "#26A69A", "#66BB6A",
  "#9CCC65", "#C0CA33", "#FFEE58", "#FFA726", "#FF7043",
  "#D84315", "#8D6E63", "#78909C", "#546E7A", "#F06292",
];

// Initialize database
getDb();

const PORT = parseInt(process.env.PORT || "3000");
const PUBLIC_DIR = path.join(import.meta.dir, "..", "public");

// Track connected clients
const clients = new Map<any, WSClient>();

function send(ws: any, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch { /* client disconnected */ }
}

function broadcastToGame(gameCode: string, msg: ServerMessage, excludeUserId?: number): void {
  for (const [ws, client] of clients) {
    if (client.gameCode === gameCode && client.userId !== excludeUserId) {
      send(ws, msg);
    }
  }
}

function sendToUser(userId: number, msg: ServerMessage): void {
  for (const [ws, client] of clients) {
    if (client.userId === userId) {
      send(ws, msg);
    }
  }
}

function sendToDeadPlayers(game: Game, msg: ServerMessage, excludeUserId?: number): void {
  // C3a (HUNTER-DESIGN §3.9): the prompted Hunter is isolated from the
  // spectator feed while the revenge gate is open — the dead-joker
  // treatment, applied centrally because EVERY sendToDeadPlayers payload is
  // a dead-spectator panel and none may reach the hunter mid-prompt. The
  // gate-open broadcasts themselves (hunter_revenge_pending, the resolution
  // deaths, phase_change) ride broadcastToGame and are unaffected.
  const revengeHunterId = game.pendingRevenge?.hunterId;
  for (const [, player] of game.players) {
    if (!player.isAlive && player.id !== excludeUserId && player.id !== revengeHunterId) {
      sendToUser(player.id, msg);
    }
  }
}

/** Returns the dead joker's id if haunt is active this night, or undefined */
function getHauntingJokerId(game: Game): number | undefined {
  if (game.settings.jokerMode !== "official" || game.jokerHauntVoters.length === 0) return undefined;
  const joker = Array.from(game.players.values()).find(p => p.role === "joker" && !p.isAlive);
  return joker?.id;
}

function broadcastLobbyUpdate(game: Game): void {
  const players = getPlayerInfo(game).map(p => ({
    ...p,
    color: getUserPrefs(p.id).player_color,
  }));
  const admin = game.players.get(game.adminId);
  broadcastToGame(game.code, {
    type: "lobby_update",
    players,
    settings: game.settings,
    adminName: admin?.username ?? "Unknown",
  });
}

function recordNarrator(game: Game, messages: string[]): void {
  for (const m of messages) game.narratorHistory.push(m);
}

// Night timer management for sequential sub-phases.
// B0d (audit D2): every arm/fire/clear/overwrite is slog'd ("night_timer")
// so timer lifecycles are reconstructable from stdout.
const nightTimers = new Map<string, { timer: Timer; kind: string; delay: number }>();

function clearNightTimer(gameCode: string): void {
  const entry = nightTimers.get(gameCode);
  if (entry) {
    clearTimeout(entry.timer);
    nightTimers.delete(gameCode);
    slog("night_timer", { code: gameCode, kind: entry.kind, delay: entry.delay, event: "cleared" });
  }
}

/**
 * Arm the (single) night timer for a game. Logs "armed"; logs "overwritten"
 * for any live timer the set displaces (pre-existing semantics: the old
 * timeout is NOT cancelled here — callers clearNightTimer first when they
 * mean to cancel). The callback logs "fired" and drops the map entry before
 * running, exactly as the inline callbacks did before B0d.
 *
 * Log-reader note: because a displaced timer keeps ticking, a "fired" event
 * that follows an "overwritten" belongs to the DISPLACED timer (its kind is
 * the OLD kind) — and its callback deletes the map entry now occupied by the
 * NEW timer. Don't misread it as the new timer firing. This documents the
 * pre-existing behavior only; fixing it is B4's concern.
 */
function armNightTimer(game: Game, kind: string, delay: number, fn: () => void): void {
  const existing = nightTimers.get(game.code);
  if (existing) {
    slog("night_timer", { code: game.code, kind: existing.kind, delay: existing.delay, event: "overwritten" });
  }
  const timer = setTimeout(() => {
    nightTimers.delete(game.code);
    slog("night_timer", { code: game.code, kind, delay, event: "fired" });
    // B2 (audit D4): invariant sweep at the timer choke point, on the settled
    // state the timer found. nightTimers.has(code) is ALWAYS false here today:
    // the delete just above runs synchronously, and under the displacement
    // quirk a stale timer's delete removes the NEWER entry too. Kept so the
    // assert shape matches ws_in; B4 revisits the displacement quirk.
    assertInvariants(game, {
      at: `timer_fire:${kind}`,
      hasPendingNightTimer: nightTimers.has(game.code),
    });
    fn();
  }, delay);
  nightTimers.set(game.code, { timer, kind, delay });
  slog("night_timer", { code: game.code, kind, delay, event: "armed" });
}

// ── The Hunter revenge gate has NO timer ────────────────────────────────────
//
// By design the gate never auto-resolves: a Hunter killed at night has
// unlimited time to take their shot. The only ways the gate closes are the
// Hunter's own hunter_revenge action and the admin's force_skip_revenge
// safety net (for an AFK Hunter). There is therefore no revenge-timer slot,
// no MAFIA_REVENGE_TIMER_MS seam, and no gate⇔timer correlation invariant.

// ── B4b (audit D1): the ONE phase_change assembly point ─────────────────────
//
// Every phase_change broadcast is built here: one uniform structure, one
// edge assertion (assertPhaseEdge — log in prod, throw under bun test), one
// optional clearNightTimer hook. The per-site payload DISAGREEMENTS are
// deliberate and PINNED by the golden message-sequence tests: some sites
// include `events`, only the two dawn paths emit the day sound cue, only
// night resolution carries `saved`. Each call site DECLARES its current shape
// through the options — the helper unifies the assembly, NOT the payloads.
//
// Logging: the engine's logTransition (B0d) already slogs every transition
// at the game.phase= write sites; this helper adds no routine slog line (the
// only line it can emit is assertPhaseEdge's violation, and clearTimer's
// clearNightTimer keeps its own "cleared" event).
interface PhaseChangeOptions {
  /** game.phase BEFORE the engine transition ran (callers capture it). */
  // Footgun: a post-transition capture (`from: game.phase` AFTER the engine call) self-passes on legal self-edges (night→night, day→day); capture BEFORE.
  from: Game["phase"];
  messages: string[];
  /** Include `events: game.eventHistory` in the payload. */
  events?: boolean;
  /** Include `saved` (night resolution only — always present there, even when false). */
  saved?: boolean;
  /**
   * Include `loverDeathName` when a lover cascaded on this transition (truthy
   * check). Names the heartbroken partner so the client fires its public
   * "died of heartbreak" beat AFTER the original victim's announcement (owner
   * ruling). One lover pair per game ⟹ at most one cascade name per transition.
   */
  loverDeathName?: string;
  /** Broadcast the "day" sound cue immediately before (force_dawn + night resolution only). */
  dayCue?: boolean;
  /**
   * Clear this game's tracked night timer first. ONLY for sites that cleared
   * today (the leave_game/end_game force-end paths) — sites that did not
   * clear must not start. force_dawn/restart_game keep their clear AT THE
   * SITE instead: it precedes a fallible engine call and must run even on
   * the failure path, which never reaches this helper.
   * Accepted delta: at the two clearTimer:true sites the clear now runs AFTER the engine call (was before) — benign because forceEndGame is synchronous and touches no timers.
   */
  clearTimer?: boolean;
}

function broadcastPhaseChange(game: Game, opts: PhaseChangeOptions): void {
  if (opts.clearTimer) clearNightTimer(game.code);
  // The broadcast phase is read from game.phase AT BUILD TIME, so the
  // M1/M3 class — a phase_change the engine never made — is structurally
  // impossible, and the from→to edge is checked against the legal table.
  assertPhaseEdge(game, opts.from, game.phase);
  if (opts.dayCue) broadcastToGame(game.code, { type: "sound_cue", sound: "day" });
  broadcastToGame(game.code, {
    type: "phase_change",
    phase: game.phase,
    round: game.round,
    messages: opts.messages,
    // New options need a matching spread line below + a golden pinning their presence — a forgotten spread silently drops the field (tsc can't catch optional omissions).
    // Wire cause-neutrality (finding 1): while the game is in progress the
    // per-death cause/source is projected away and the four night-death labels
    // collapse to a neutral "death" (projectEventsForClients). At game_over the
    // FULL history rides the wire — that IS the end-of-game reveal surface the
    // client renders from (renderGameHistory reads the last events it saw).
    ...(opts.events
      ? { events: game.phase === "game_over" ? game.eventHistory : projectEventsForClients(game.eventHistory) }
      : {}),
    ...(opts.saved !== undefined ? { saved: opts.saved } : {}),
    ...(opts.loverDeathName ? { loverDeathName: opts.loverDeathName } : {}),
  });
}

function sendMafiaPrompts(game: Game): void {
  const aliveMafia = getAliveByRole(game, "mafia");
  const aliveNonMafia = getAlivePlayers(game).filter((p) => p.role !== "mafia");
  const mafiaTargets = aliveNonMafia.map((p) => toTargetInfo(p, game));

  for (const m of aliveMafia) {
    sendToUser(m.id, { type: "mafia_targets", players: mafiaTargets });
  }

  // Send initial spectator view to dead players (exclude haunting joker)
  const jokerExclude = getHauntingJokerId(game);
  sendToDeadPlayers(game, {
    type: "spectator_mafia_update",
    voterTargets: {},
    lockedTarget: null,
    objectedTargets: {},
    aliveMafiaCount: aliveMafia.length,
    targets: mafiaTargets,
  }, jokerExclude);
}

function sendDoctorPrompts(game: Game): void {
  const aliveDoctor = getAliveByRole(game, "doctor");
  if (aliveDoctor.length > 0) {
    const allAlive = getAlivePlayers(game).map((p) => toTargetInfo(p, game));
    for (const d of aliveDoctor) {
      sendToUser(d.id, { type: "doctor_targets", players: allAlive, lastDoctorTarget: game.lastDoctorTarget });
    }
  }
  // Notify dead players about doctor sub-phase (exclude haunting joker)
  sendToDeadPlayers(game, {
    type: "spectator_night_phase",
    subPhase: "doctor",
    isRoleAlive: aliveDoctor.length > 0,
  }, getHauntingJokerId(game));
}

function sendDetectivePrompts(game: Game): void {
  const aliveDetective = getAliveByRole(game, "detective");
  if (aliveDetective.length > 0) {
    const allAliveExceptSelf = getAlivePlayers(game)
      .filter((p) => p.role !== "detective")
      .map((p) => toTargetInfo(p, game));
    for (const d of aliveDetective) {
      sendToUser(d.id, { type: "detective_targets", players: allAliveExceptSelf });
    }
  }
  // Notify dead players about detective sub-phase (exclude haunting joker)
  sendToDeadPlayers(game, {
    type: "spectator_night_phase",
    subPhase: "detective",
    isRoleAlive: aliveDetective.length > 0,
  }, getHauntingJokerId(game));
}

function sendVigilantePrompts(game: Game): void {
  const aliveVig = getAliveByRole(game, "vigilante");
  const actionable = aliveVig.filter((v) => !v.vigilanteBulletUsed);
  if (actionable.length > 0) {
    for (const v of actionable) {
      // D3: the vigilante may NOT target themselves — exclude self from the list.
      const targets = getAlivePlayers(game)
        .filter((p) => p.id !== v.id)
        .map((p) => toTargetInfo(p, game));
      sendToUser(v.id, { type: "vigilante_targets", players: targets, bulletUsed: false });
    }
  }
  // Notify dead players about the vigilante sub-phase (exclude haunting joker).
  sendToDeadPlayers(game, {
    type: "spectator_night_phase",
    subPhase: "vigilante",
    isRoleAlive: actionable.length > 0,
  }, getHauntingJokerId(game));
}

function sendJokerHauntPrompts(game: Game): void {
  // Find the dead joker
  const joker = Array.from(game.players.values()).find(p => p.role === "joker" && !p.isAlive);
  if (!joker) return;

  const targets = getJokerHauntTargets(game);
  if (targets.length === 0) return;

  sendToUser(joker.id, { type: "joker_haunt_targets", players: targets });
  // No spectator announcement, no sound cues — joker haunt is silent
}

function handleSubPhaseAdvance(game: Game): void {
  if (!getGame(game.code)) return; // game was removed

  // Send close cue for the current sub-phase
  const closingPhase = game.nightSubPhase;
  if (closingPhase && closingPhase !== "resolving") {
    broadcastToGame(game.code, { type: "sound_cue", sound: subPhaseCue(closingPhase, "close") });
  }

  const result = advanceNightSubPhase(game);

  if (result.nextPhase === "resolving") {
    // Small delay after last close cue before resolving
    armNightTimer(game, "resolve", 1000, () => {
      if (!getGame(game.code)) return;
      resolveNightAndTransition(game);
    });
    return;
  }

  // Past the resolving early-return, nextPhase is a cue-emitting sub-phase.
  // Captured as a const (B7) so the narrowing survives into the timer
  // closures below — TS re-widens property accesses across function bounds.
  const nextPhase = result.nextPhase;

  if (result.isFake) {
    // Fake sub-phase: enabled but dead role → open cue, random delay, close cue, then advance
    armNightTimer(game, "fake_open", 1500 /* pause after close cue before open */, () => {
      if (!getGame(game.code)) return;
      broadcastToGame(game.code, { type: "sound_cue", sound: subPhaseCue(nextPhase, "open") });
      // Notify dead players that this role is dead (exclude haunting joker)
      if (result.nextPhase === "doctor" || result.nextPhase === "detective" || result.nextPhase === "vigilante") {
        sendToDeadPlayers(game, {
          type: "spectator_night_phase",
          subPhase: result.nextPhase,
          isRoleAlive: false,
        }, getHauntingJokerId(game));
      }

      // Normal-distribution fake delay centered at 10s, range ~5-15s
      const u1 = Math.random() || 0.0001;
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const fakeDelay = Math.max(5000, Math.min(15000, Math.round(10000 + z * 2000)));
      armNightTimer(game, "fake_advance", fakeDelay, () => {
        if (!getGame(game.code)) return;
        // Notify dead players that this fake sub-phase completed (role is dead, exclude haunting joker)
        if (result.nextPhase === "doctor" || result.nextPhase === "detective" || result.nextPhase === "vigilante") {
          sendToDeadPlayers(game, {
            type: "spectator_night_complete",
            phase: result.nextPhase,
            targetName: null,
            alive: false,
          }, getHauntingJokerId(game));
        }
        // Recurse to next sub-phase (sends close cue for this phase)
        handleSubPhaseAdvance(game);
      });
    });
    return;
  }

  // Real sub-phase: alive + enabled role → open cue + send prompts, wait for player action
  armNightTimer(game, "subphase_open", 1500 /* pause after close cue before open */, () => {
    if (!getGame(game.code)) return;

    broadcastToGame(game.code, { type: "sound_cue", sound: subPhaseCue(nextPhase, "open") });

    if (result.nextPhase === "doctor") {
      sendDoctorPrompts(game);
    } else if (result.nextPhase === "detective") {
      sendDetectivePrompts(game);
    } else if (result.nextPhase === "vigilante") {
      sendVigilantePrompts(game);
    }
  });
}

/** Start the night sequence: sound cues + mafia prompts + joker haunt if active */
function startNightSequence(game: Game): void {
  broadcastToGame(game.code, { type: "sound_cue", sound: "night" });
  broadcastToGame(game.code, { type: "sound_cue", sound: "everyone_close" });
  broadcastToGame(game.code, { type: "sound_cue", sound: "mafia_open" });
  sendMafiaPrompts(game);

  // Send joker haunt prompts if active (official mode + voters exist)
  if (game.settings.jokerMode === "official" && game.jokerHauntVoters.length > 0) {
    sendJokerHauntPrompts(game);
    // Notify other dead players that joker is deliberating
    const jokerId = getHauntingJokerId(game);
    sendToDeadPlayers(game, { type: "spectator_joker_deliberating" }, jokerId);
  }
}

// ── C3a (HUNTER-DESIGN §4): the revenge gate's server flow ──────────────────

/**
 * Stage 2 of the two-stage dawn: the gate just opened (engine-side, in
 * concludeRound) — publicly reveal the Hunter (hunter_revenge_pending + the
 * narrator reveal line) and send the living-target list to the hunter ALONE.
 * When the Hunter was killed AT NIGHT (gate.wakeHunter), broadcast the
 * hunter_open wake cue FIRST so the table — eyes still closed mid-dawn — hears
 * "Hunter, open your eyes" and the client holds the prompt behind that audio.
 * The deferred day cue / phase_change happen in resolveRevenge once the gate
 * clears. Also re-entered by resolveRevenge itself when a revenge cascade
 * re-opens the gate (C2a post-condition). Callers pass the open gate itself,
 * making the "gate is open" precondition structural (no non-null assertion to
 * go stale). There is NO revenge timer — the gate stays open until the Hunter
 * shoots or the admin force-skips.
 */
function openRevengeGate(game: Game, gate: PendingRevenge): void {
  const hunter = game.players.get(gate.hunterId);
  const hunterName = hunter?.username ?? "The Hunter";
  recordNarrator(game, [Narrator.hunterReveal(hunterName)]);
  broadcastToGame(game.code, { type: "hunter_revenge_pending", hunterName });
  if (gate.wakeHunter) broadcastToGame(game.code, { type: "sound_cue", sound: "hunter_open" });
  sendRevengeTargets(game, gate);
}

/**
 * The hunter's private prompt: the living-target list (C4 factoring of
 * openRevengeGate's middle). Two callers — the gate-open path above (which
 * also reveals the Hunter and, for a night kill, plays the wake cue) and the
 * hunter's rejoin re-send in join_game, which is RE-SEND-ONLY (a disconnect
 * never re-reveals or re-cues; it just restores the prompt).
 */
function sendRevengeTargets(game: Game, gate: PendingRevenge): void {
  const hunter = game.players.get(gate.hunterId);
  if (!hunter) return;
  // Living targets only — the gate never opens with zero living players
  // (concludeRound's E11 suppression), so this list is non-empty.
  const targets = getAlivePlayers(game).map((p) => toTargetInfo(p, game));
  sendToUser(hunter.id, { type: "hunter_revenge_targets", players: targets });
}

/**
 * The ONE revenge resolution path (C3a): the hunter_revenge handler, the
 * admin force_skip_revenge handler and the timer expiry all land here
 * (HUNTER-DESIGN decision #2 — the three declines are one code path; a kill
 * is the same path with a target). On ok the engine has already cleared the
 * gate and re-entered concludeRound with the stored resume, so game.phase
 * is the POST-epilogue phase when the closing broadcasts run. Returns false
 * on engine rejection — zero state change, zero broadcast, the gate stays
 * open and the hunter can retry.
 */
function resolveRevenge(game: Game, hunterId: number, targetId: number | null): boolean {
  const from = game.phase; // BEFORE the engine resumes the deferred epilogue
  // Capture the wake flag BEFORE submitHunterRevenge clears the gate — a
  // night-killed Hunter gets the "Hunter, close your eyes" cue once they act.
  const wakeHunter = game.pendingRevenge?.wakeHunter ?? false;
  // Capture the deferred night-batch dawn lines BEFORE submitHunterRevenge
  // clears the gate, so the ONE cause-neutral combined death line still leads
  // the deferred phase_change. Empty for the vote-path gate (no deferred dawn).
  const deferredNight = game.pendingRevenge?.deferredNightMessages ?? [];
  const result = submitHunterRevenge(game, hunterId, targetId);
  if (!result.ok) return false;

  recordNarrator(game, result.messages);

  // Revenge death broadcasts — keyed on Death.cause, never position (B3). A
  // lover cascade off a revenge kill is PUBLIC heartbreak (owner ruling):
  // isLoverDeath rides the victim's you_died (private heartbreak art), and
  // revengeLoverDeathName is threaded onto the deferred phase_change so the
  // client fires the public "died of heartbreak" beat after the revenge line.
  let revengeLoverDeathName: string | undefined;
  for (const d of result.deaths) {
    const isLoverDeath = d.cause === "lover_cascade";
    if (isLoverDeath) revengeLoverDeathName = d.player.username;
    sendToUser(d.player.id, { type: "you_died", message: d.message, ...(isLoverDeath ? { isLoverDeath: true } : {}) });
    broadcastToGame(game.code, {
      type: "player_died",
      playerId: d.player.id,
      playerName: d.player.username,
      message: d.message,
    });
  }

  // C2a POST-CONDITION re-check: ok:true does NOT guarantee a closed gate —
  // a Hunter dying in the revenge cascade re-opens it inside the resume
  // before submitHunterRevenge returns. Re-prompt instead of closing.
  // (Unreachable under today's single-Hunter deal; contract-mandated.)
  if (game.pendingRevenge) {
    openRevengeGate(game, game.pendingRevenge);
    return true;
  }

  // The gate is truly closing: a night-killed Hunter is told to close their
  // eyes again (mirror of the hunter_open wake cue), before the deferred dawn.
  if (wakeHunter) broadcastToGame(game.code, { type: "sound_cue", sound: "hunter_close" });

  // The deferred epilogue broadcast, dispatched on the phase concludeRound
  // landed on. Night path (this task) resumes { autoNight: false } → "day"
  // or "game_over"; the "night" branch keeps the path resume-shape-generic
  // for the vote-path gate (C3b arms it) — it mirrors cast_vote's
  // execution-to-night branch.
  if (game.phase === "game_over") {
    game.dayStartedAt = null;
    broadcastPhaseChange(game, {
      from,
      messages: [...deferredNight, ...result.messages],
      events: true,
      loverDeathName: revengeLoverDeathName,
      // The dawn's deferred day cue (the night-path game_over shape, golden
      // #7); a vote-path game_over sends no cue (cast_vote shape).
      dayCue: from === "night",
    });
    // Divergence kept visible: the live broadcast's message is the
    // narrator's last line, NOT buildGameSync's canonical win line.
    broadcastToGame(game.code, {
      type: "game_over",
      ...projectGameOver(game, result.messages[result.messages.length - 1]),
    });
  } else if (game.phase === "night") {
    // Vote-path resume: auto-transition to the next night (C3b).
    game.dayStartedAt = null;
    game.dayVoteCount = 0;
    broadcastPhaseChange(game, {
      from,
      messages: [...deferredNight, ...result.messages],
      events: true,
      loverDeathName: revengeLoverDeathName,
    });
    startNightSequence(game);
  } else {
    // Day — the deferred dawn completes.
    game.dayStartedAt = Date.now();
    broadcastPhaseChange(game, {
      from,
      messages: [...deferredNight, ...result.messages],
      events: true,
      loverDeathName: revengeLoverDeathName,
      dayCue: true,
    });
  }
  return true;
}

function buildSpectatorLog(game: Game): Array<{ phase: string; targetName: string | null; alive: boolean }> {
  // Sub-phase order: mafia=0, doctor=1, detective=2, vigilante=3, resolving=4
  const phaseOrder = ["mafia", "doctor", "detective", "vigilante", "resolving"];
  const currentIdx = phaseOrder.indexOf(game.nightSubPhase || "mafia");
  const log: Array<{ phase: string; targetName: string | null; alive: boolean }> = [];

  for (let i = 0; i < currentIdx; i++) {
    const phase = phaseOrder[i];
    if (phase === "mafia") {
      if (game.mafiaTarget !== null) {
        const victim = game.players.get(game.mafiaTarget);
        log.push({ phase: "mafia", targetName: victim ? victim.username : null, alive: true });
      }
    } else if (phase === "doctor") {
      if (!game.settings.enableDoctor) continue;
      const doctorAlive = getAliveByRole(game, "doctor").length > 0;
      if (doctorAlive && game.doctorTarget !== null) {
        const protected_ = game.players.get(game.doctorTarget);
        log.push({ phase: "doctor", targetName: protected_ ? protected_.username : null, alive: true });
      } else if (!doctorAlive) {
        log.push({ phase: "doctor", targetName: null, alive: false });
      }
    } else if (phase === "detective") {
      if (!game.settings.enableDetective) continue;
      const detectiveAlive = getAliveByRole(game, "detective").length > 0;
      if (detectiveAlive && game.detectiveTarget !== null) {
        const investigated = game.players.get(game.detectiveTarget);
        log.push({ phase: "detective", targetName: investigated ? investigated.username : null, alive: true });
      } else if (!detectiveAlive) {
        log.push({ phase: "detective", targetName: null, alive: false });
      }
    } else if (phase === "vigilante") {
      if (!game.settings.enableVigilante) continue;
      const actionable = getAliveByRole(game, "vigilante").some((v) => !v.vigilanteBulletUsed);
      if (actionable && game.vigilanteTarget !== null) {
        const shot = game.players.get(game.vigilanteTarget);
        log.push({ phase: "vigilante", targetName: shot ? shot.username : null, alive: true });
      } else if (!actionable) {
        log.push({ phase: "vigilante", targetName: null, alive: false });
      }
    }
  }

  return log;
}

function buildGameSync(game: Game, client: WSClient, rejoined: import("./types").Player): ServerMessage {
  const userId = client.userId!;

  // Night action state (only if night + alive + has role with action + correct sub-phase)
  let nightAction: Extract<ServerMessage, { type: "game_sync" }>["nightAction"] = null;
  if (game.phase === "night" && !rejoined.isAlive) {
    // Dead joker with active haunt gets haunt view, not spectator view
    const isHauntingJoker = rejoined.role === "joker"
      && game.settings.jokerMode === "official"
      && game.jokerHauntVoters.length > 0;

    if (isHauntingJoker) {
      if (game.jokerHauntTarget === null) {
        // Joker hasn't picked yet — show haunt targets (sent separately via joker_haunt_targets on rejoin)
        const hauntTargets = getJokerHauntTargets(game);
        nightAction = {
          locked: false,
          targetName: null,
          targets: hauntTargets,
          voterTargets: {},
          lockedTarget: null,
          objectedTargets: {},
          aliveMafiaCount: 0,
          lastDoctorTarget: null,
          jokerHauntPending: true,
        };
      } else {
        // Joker already picked — show confirmed state
        const hauntTarget = game.players.get(game.jokerHauntTarget);
        nightAction = {
          locked: true,
          targetName: hauntTarget ? hauntTarget.username : null,
          targets: [],
          voterTargets: {},
          lockedTarget: null,
          objectedTargets: {},
          aliveMafiaCount: 0,
          lastDoctorTarget: null,
          jokerHauntPending: true,
        };
      }
    } else {
    // Build spectator log of completed sub-phases for dead players
    const spectatorLog = buildSpectatorLog(game);

    // Check if joker haunt is active (for spectator joker status restoration)
    const jokerStatus: { jokerDeliberating?: boolean; jokerResolvedTarget?: string } = {};
    if (game.settings.jokerMode === "official" && game.jokerHauntVoters.length > 0) {
      if (game.jokerHauntTarget === null) {
        jokerStatus.jokerDeliberating = true;
      } else {
        const jTarget = game.players.get(game.jokerHauntTarget);
        if (jTarget) jokerStatus.jokerResolvedTarget = jTarget.username;
      }
    }

    // Dead player spectator view for all night sub-phases
    if (game.nightSubPhase === "mafia") {
      const aliveNonMafia = getAlivePlayers(game).filter(p => p.role !== "mafia");
      const spectatorTargets = aliveNonMafia.map(p => toTargetInfo(p, game));
      const status = getMafiaVoteStatus(game);
      nightAction = {
        locked: false,
        targetName: null,
        targets: spectatorTargets,
        voterTargets: status.voterTargets,
        lockedTarget: status.lockedTarget,
        objectedTargets: status.objectedTargets,
        aliveMafiaCount: status.aliveMafiaCount,
        lastDoctorTarget: null,
        isSpectatorView: true,
        spectatorLog,
        ...jokerStatus,
      };
    } else if (game.nightSubPhase === "doctor" || game.nightSubPhase === "detective" || game.nightSubPhase === "vigilante") {
      const isRoleAlive = game.nightSubPhase === "doctor"
        ? getAliveByRole(game, "doctor").length > 0
        : game.nightSubPhase === "detective"
          ? getAliveByRole(game, "detective").length > 0
          : getAliveByRole(game, "vigilante").some((v) => !v.vigilanteBulletUsed);
      nightAction = {
        locked: false,
        targetName: null,
        targets: [],
        voterTargets: {},
        lockedTarget: null,
        objectedTargets: {},
        aliveMafiaCount: 0,
        lastDoctorTarget: null,
        isSpectatorView: true,
        spectatorSubPhase: game.nightSubPhase,
        spectatorSubPhaseAlive: isRoleAlive,
        spectatorLog,
        ...jokerStatus,
      };
    } else if (game.nightSubPhase === "resolving") {
      nightAction = {
        locked: false,
        targetName: null,
        targets: [],
        voterTargets: {},
        lockedTarget: null,
        objectedTargets: {},
        aliveMafiaCount: 0,
        lastDoctorTarget: null,
        isSpectatorView: true,
        spectatorSubPhase: "resolving",
        spectatorSubPhaseAlive: false,
        spectatorLog,
        ...jokerStatus,
      };
    }
    } // close else (non-haunting dead player spectator view)
  } else if (game.phase === "night" && rejoined.isAlive) {
    if (rejoined.role === "mafia" && game.nightSubPhase === "mafia") {
      const locked = game.mafiaTarget !== null;
      const targetName = locked ? (game.players.get(game.mafiaTarget!)?.username ?? null) : null;

      // Build targets list (non-mafia alive players)
      const targets = locked ? [] : getAlivePlayers(game)
        .filter(p => p.role !== "mafia")
        .map(p => toTargetInfo(p, game));

      const status = getMafiaVoteStatus(game);

      nightAction = {
        locked,
        targetName,
        targets,
        voterTargets: status.voterTargets,
        lockedTarget: status.lockedTarget,
        objectedTargets: status.objectedTargets,
        aliveMafiaCount: status.aliveMafiaCount,
        lastDoctorTarget: null,
      };
    } else if (rejoined.role === "mafia" && game.nightSubPhase !== "mafia") {
      // Mafia sub-phase is done — show locked state
      const doneStatus = getMafiaVoteStatus(game);
      nightAction = {
        locked: true,
        targetName: game.mafiaTarget !== null ? (game.players.get(game.mafiaTarget)?.username ?? null) : null,
        targets: [],
        voterTargets: doneStatus.voterTargets,
        lockedTarget: null,
        objectedTargets: doneStatus.objectedTargets,
        aliveMafiaCount: doneStatus.aliveMafiaCount,
        lastDoctorTarget: null,
      };
    } else if (rejoined.role === "doctor" && game.nightSubPhase === "doctor") {
      const locked = game.doctorTarget !== null;
      const targetName = locked ? (game.players.get(game.doctorTarget!)?.username ?? null) : null;
      const targets = locked ? [] : getAlivePlayers(game)
        .map(p => toTargetInfo(p, game));

      nightAction = {
        locked, targetName, targets,
        voterTargets: {}, lockedTarget: null,
        objectedTargets: {}, aliveMafiaCount: 0,
        lastDoctorTarget: game.lastDoctorTarget,
      };
    } else if (rejoined.role === "doctor" && game.nightSubPhase !== "doctor") {
      // Doctor sub-phase hasn't started or is done — show locked if acted, null otherwise
      if (game.doctorTarget !== null) {
        nightAction = {
          locked: true,
          targetName: game.players.get(game.doctorTarget!)?.username ?? null,
          targets: [],
          voterTargets: {}, lockedTarget: null,
          objectedTargets: {}, aliveMafiaCount: 0,
          lastDoctorTarget: game.lastDoctorTarget,
        };
      }
      // else nightAction stays null (waiting for their turn)
    } else if (rejoined.role === "detective" && game.nightSubPhase === "detective") {
      const locked = game.detectiveTarget !== null;
      const targetName = locked ? (game.players.get(game.detectiveTarget!)?.username ?? null) : null;
      const targets = locked ? [] : getAlivePlayers(game)
        .filter(p => p.role !== "detective")
        .map(p => toTargetInfo(p, game));

      nightAction = {
        locked, targetName, targets,
        voterTargets: {}, lockedTarget: null,
        objectedTargets: {}, aliveMafiaCount: 0,
        lastDoctorTarget: null,
      };
    } else if (rejoined.role === "detective" && game.nightSubPhase !== "detective") {
      // Detective sub-phase hasn't started or is done — show locked if acted, null otherwise
      if (game.detectiveTarget !== null) {
        nightAction = {
          locked: true,
          targetName: game.players.get(game.detectiveTarget!)?.username ?? null,
          targets: [],
          voterTargets: {}, lockedTarget: null,
          objectedTargets: {}, aliveMafiaCount: 0,
          lastDoctorTarget: null,
        };
      }
      // else nightAction stays null (waiting for their turn)
    } else if (rejoined.role === "vigilante" && game.nightSubPhase === "vigilante") {
      const usable = !rejoined.vigilanteBulletUsed;
      const locked = game.vigilanteTarget !== null || !usable;
      // D3: targets exclude the vigilante themselves.
      const targets = (usable && game.vigilanteTarget === null)
        ? getAlivePlayers(game).filter((p) => p.id !== rejoined.id).map((p) => toTargetInfo(p, game))
        : [];
      nightAction = {
        locked, targets,
        targetName: game.vigilanteTarget !== null ? (game.players.get(game.vigilanteTarget)?.username ?? null) : null,
        voterTargets: {}, lockedTarget: null, objectedTargets: {}, aliveMafiaCount: 0, lastDoctorTarget: null,
      };
    } else if (rejoined.role === "vigilante" && game.nightSubPhase !== "vigilante") {
      // Vigilante sub-phase hasn't started or is done — show locked if a shot was fired this night, null otherwise.
      if (game.vigilanteTarget !== null) {
        nightAction = {
          locked: true,
          targetName: game.players.get(game.vigilanteTarget)?.username ?? null,
          targets: [],
          voterTargets: {}, lockedTarget: null,
          objectedTargets: {}, aliveMafiaCount: 0,
          lastDoctorTarget: null,
        };
      }
      // else nightAction stays null (waiting for their turn / spent)
    }
  }

  // Vote state (only if voting)
  let voteState: Extract<ServerMessage, { type: "game_sync" }>["voteState"] = null;
  if (game.phase === "voting" && game.voteTarget !== null) {
    const target = game.players.get(game.voteTarget)!;
    voteState = {
      targetName: target.username,
      targetId: game.voteTarget,
      hasVoted: game.votes.has(userId),
      totalVotes: game.votes.size,
      total: getAlivePlayers(game).length,
    };
  }

  // Game over state
  let gameOver: Extract<ServerMessage, { type: "game_sync" }>["gameOver"] = null;
  if (game.phase === "game_over") {
    const winMessages: Record<string, string> = { town: "Citizens win!", mafia: "Mafia wins!", joker: "Joker wins!" };
    // Pinned divergence vs the live game_over broadcasts (rejoin goldens):
    // the sync reconstruction sends the CANONICAL win line, not the
    // narrator's prose; it always carries forceEnded and names the reveal
    // `revealPlayers`. Only the shared core comes from projectGameOver.
    const { players: revealPlayers, ...core } = projectGameOver(
      game,
      game.forceEnded ? "Host has ended the game." : winMessages[game.winner!],
    );
    gameOver = { ...core, forceEnded: game.forceEnded, revealPlayers };
  }

  const userPrefs = getUserPrefs(userId);
  return {
    type: "game_sync",
    code: game.code,
    isAdmin: userId === game.adminId,
    narrationAccent: game.settings.narrationAccent,
    narratorGender: game.settings.narratorGender,
    hide_mafia_tag: userPrefs.hide_mafia_tag,
    players: getPlayerInfo(game).map(p => ({ ...p, color: getUserPrefs(p.id).player_color })),
    role: rejoined.role!,
    isLover: rejoined.isLover,
    variant: rejoined.variant,
    roster: rosterSummary(game),
    phase: game.phase,
    round: game.round,
    nightSubPhase: game.nightSubPhase,
    awaitingNarratorReady: game.awaitingNarratorReady,
    isDead: !rejoined.isAlive,
    dayStartedAt: game.dayStartedAt,
    dayVoteCount: game.dayVoteCount,
    narratorHistory: game.narratorHistory,
    // Wire cause-neutrality (finding 1): in-progress syncs get the projected
    // (cause-stripped, night-deaths-neutralized) history; a game_over sync
    // carries the FULL detail for the end-of-game reveal. Dead spectators keep
    // their omniscient live night log via the spectator_* stream + spectatorLog
    // below — not via this field — so projecting it costs them no information.
    eventHistory: game.phase === "game_over" ? game.eventHistory : projectEventsForClients(game.eventHistory),
    ...(rejoined.role === "detective" ? { detectiveHistory: game.detectiveHistory } : {}),
    ...(rejoined.role === "mafia" ? {
      mafiaTeam: Array.from(game.players.values())
        .filter(p => p.role === "mafia")
        .map(p => p.username),
      // Every rejoining mafia keeps knowing who the Godfather is.
      ...(() => {
        const gf = Array.from(game.players.values()).find(p => p.isGodfather)?.username;
        return gf ? { godfatherName: gf } : {};
      })(),
    } : {}),
    // The Godfather keeps their own card on rejoin.
    ...(rejoined.isGodfather ? { isGodfather: true } : {}),
    // The Vigilante keeps their spent-bullet indicator on rejoin (own screen only).
    ...(rejoined.role === "vigilante" ? { vigilanteBulletUsed: rejoined.vigilanteBulletUsed } : {}),
    nightAction,
    voteState,
    gameOver,
    // C4 (HUNTER-DESIGN §3.4, the H4 lesson): the open revenge gate is
    // PUBLIC pending state — projected for EVERY rejoiner. Driven off
    // game.pendingRevenge alone (while gated, phase holds at "night" with
    // nightSubPhase already nulled, or at "voting" with the ballot cleared —
    // neither sub-state can carry the signal). Key OMITTED when the gate is
    // closed so the payload stays byte-identical to pre-Hunter syncs (the
    // detectiveHistory/mafiaTeam absence pattern). isYou cues the hunter's
    // client to expect the separate hunter_revenge_targets re-send — the
    // target list itself never rides game_sync.
    ...(game.pendingRevenge ? {
      pendingRevenge: {
        // The "The Hunter" fallback is defensive dead code — removePlayer
        // only runs at game_over/lobby, where the gate is structurally null (§4).
        hunterName: game.players.get(game.pendingRevenge.hunterId)?.username ?? "The Hunter",
        isYou: userId === game.pendingRevenge.hunterId,
      },
    } : {}),
  };
}

// ── C3b (HUNTER-DESIGN §3.6, gate checklist M7 row): the rejection sweep ────
//
// While a game's revenge gate is open, every game-mutating message is
// rejected at the DISPATCH level, before its handler runs — one check
// instead of 13 hand-edited guards (the M7 lesson: hand-edited guard sets
// drift). The classification is EXHAUSTIVE over ClientMessage["type"] (a
// new message type is a compile error until classified — the sanitizeSettings
// boolKeys pattern), so the §3.6 list and its exceptions live in one table:
//
//   true  — rejected while gated (§3.6, verbatim). The two engine-reachable
//           holes this sweep exists for: cast_vote (the phase HOLDS at
//           "voting" with the ballot cleared, so castVote would take votes)
//           and cancel_vote (cancelVote would wipe the gate via
//           resetNightActions and orphan the armed revenge timer). The rest
//           are double-guarded by their handlers' own phase checks.
//   false — exempt (§3.6 exceptions): the resolution pair
//           (hunter_revenge / force_skip_revenge), the gate-CLEARING forced
//           transitions (§6 L2 — each clears the revenge timer at its site;
//           force_dawn and return_to_lobby are engine-rejected at a voting
//           gate and leave it intact; close_room destroys the room),
//           connection-level traffic + prefs, and the two messages whose
//           own guards make them unreachable while gated (update_settings:
//           lobby-only; player_return_to_lobby: game_over-only — the gate
//           is structurally null at both phases, §4).
//
// Rejections are SILENT on the wire (the established guard style — no
// error, no broadcast); the slog line is their one positive trace (D2).
const REVENGE_GATE_REJECTED: Record<ClientMessage["type"], boolean> = {
  // §3.6 rejection list (verbatim)
  call_vote: true,
  cast_vote: true,
  abstain_vote: true,
  cancel_vote: true,
  end_day: true,
  mafia_vote: true,
  mafia_remove_vote: true,
  confirm_mafia_kill: true,
  doctor_save: true,
  detective_investigate: true,
  vigilante_shoot: true,
  joker_haunt: true,
  narrator_ready: true,
  start_game: true,
  // the resolution pair
  hunter_revenge: false,
  force_skip_revenge: false,
  // gate-clearing forced transitions (§6 L2)
  force_dawn: false,
  end_game: false,
  restart_game: false,
  return_to_lobby: false,
  close_room: false,
  // connection-level traffic + prefs
  register: false,
  login: false,
  create_game: false,
  join_game: false,
  leave_game: false,
  toggle_sound: false,
  update_player_pref: false,
  // unreachable while gated by their own phase guards (§4 phase scoping)
  update_settings: false,
  player_return_to_lobby: false,
};

function handleMessage(ws: any, client: WSClient, msg: ClientMessage): void {
  // B0d (audit D2): one structured line per inbound WS message
  {
    const g = client.gameCode ? getGame(client.gameCode) : undefined;
    slog("ws_in", {
      code: g?.code ?? null,
      userId: client.userId ?? null,
      type: msg.type,
      phase: g?.phase ?? null,
      subPhase: g?.nightSubPhase ?? null,
    });
    // B2 (audit D4): invariant sweep at the message choke point, on the
    // settled state this message found. The night-timer map lives in this
    // module, so its tracked-slot state is passed in here.
    if (g) {
      assertInvariants(g, {
        at: `ws_in:${msg.type}`,
        hasPendingNightTimer: nightTimers.has(g.code),
      });
    }
    // C3b (§3.6 M7): the revenge-gate rejection sweep. `=== true` (C4 fix):
    // the table is a plain object literal, so an unknown wire type either
    // indexes to undefined (most strings) or to an INHERITED prototype
    // member (e.g. "toString" → a truthy function) — only the strict check
    // keeps both falling through to the switch (no case matches), exactly
    // as before the sweep. Invisible when pendingRevenge is null.
    if (g?.pendingRevenge && REVENGE_GATE_REJECTED[msg.type] === true) {
      slog("revenge_gate_reject", { code: g.code, userId: client.userId ?? null, type: msg.type });
      return;
    }
  }

  switch (msg.type) {
    case "register": {
      if (!msg.username || msg.username.trim().length === 0) {
        send(ws, { type: "error", message: "Username is required" });
        return;
      }
      if (msg.username.trim().length > 32) {
        send(ws, { type: "error", message: "Username must be 32 characters or fewer" });
        return;
      }
      if (!msg.passcode || !/^\d{4}$/.test(msg.passcode)) {
        send(ws, { type: "error", message: "Passcode must be exactly 4 digits" });
        return;
      }
      const userId = createUser(msg.username.trim(), msg.passcode);
      if (userId === null) {
        send(ws, { type: "error", message: "Username already taken" });
        return;
      }
      // Assign random color on registration
      const randomColor = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
      updateUserPref(userId, "player_color", randomColor);
      client.userId = userId;
      send(ws, { type: "registered", userId, username: msg.username.trim(), hide_mafia_tag: false, player_color: randomColor });
      break;
    }

    case "login": {
      const user = loginUser(msg.username, msg.passcode);
      if (!user) {
        send(ws, { type: "error", message: "Invalid username or passcode" });
        return;
      }
      // Assign random color for legacy users without one
      let playerColor = user.player_color;
      if (!playerColor) {
        playerColor = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
        updateUserPref(user.id, "player_color", playerColor);
      }
      client.userId = user.id;
      send(ws, { type: "logged_in", userId: user.id, username: user.username, hide_mafia_tag: user.hide_mafia_tag, player_color: playerColor });
      break;
    }

    case "create_game": {
      if (!client.userId) {
        send(ws, { type: "error", message: "Not logged in" });
        return;
      }
      if (client.gameCode) {
        send(ws, { type: "error", message: "Already in a game" });
        return;
      }
      let initialSettings: Partial<GameSettings> | undefined;
      const savedJson = getLastSettings(client.userId);
      if (savedJson) {
        try { initialSettings = sanitizeSettings(JSON.parse(savedJson)); } catch {}
      }
      const game = createGame(client.userId, getUsernameFromClients(client.userId), initialSettings);
      client.gameCode = game.code;
      send(ws, { type: "game_created", code: game.code });
      broadcastLobbyUpdate(game);
      break;
    }

    case "join_game": {
      if (!client.userId) {
        send(ws, { type: "error", message: "Not logged in" });
        return;
      }
      if (client.gameCode) {
        send(ws, { type: "error", message: "Already in a game" });
        return;
      }
      const code = msg.code.toUpperCase();
      const game = getGame(code);
      if (!game) {
        send(ws, { type: "error", message: "Game not found" });
        return;
      }

      // Try rejoin first (player already exists in game)
      const rejoined = rejoinPlayer(game, client.userId);
      if (rejoined) {
        client.gameCode = code;
        send(ws, { type: "game_joined", code, isAdmin: client.userId === game.adminId });

        // If game is active (not lobby), send single atomic game_sync
        if (game.phase !== "lobby") {
          send(ws, buildGameSync(game, client, rejoined));
          // If admin rejoins during awaiting state, re-send awaiting_ready
          if (game.awaitingNarratorReady && client.userId === game.adminId) {
            send(ws, { type: "awaiting_ready" });
          }
          // H4: mafia consensus locked but kill not yet confirmed — re-send
          // mafia_confirm_ready so the rejoining mafia can confirm the kill
          // (otherwise the night soft-locks waiting for a confirm the client
          // no longer offers)
          if (game.phase === "night" && game.nightSubPhase === "mafia"
              && game.mafiaTarget !== null
              && rejoined.isAlive && rejoined.role === "mafia") {
            const confirmTarget = game.players.get(game.mafiaTarget);
            send(ws, {
              type: "mafia_confirm_ready",
              targetName: confirmTarget ? confirmTarget.username : "target",
              targetId: game.mafiaTarget,
            });
          }
          // If dead joker with pending haunt during night, send haunt targets separately
          if (game.phase === "night" && game.nightSubPhase !== "resolving"
              && !rejoined.isAlive && rejoined.role === "joker"
              && game.jokerHauntTarget === null
              && game.settings.jokerMode === "official"
              && game.jokerHauntVoters.length > 0) {
            const hauntTargets = getJokerHauntTargets(game);
            if (hauntTargets.length > 0) {
              send(ws, { type: "joker_haunt_targets", players: hauntTargets });
            }
          }
          // C4 (H4): revenge gate open + the rejoiner IS the hunter —
          // re-send the private prompt right after game_sync (the dead-joker
          // haunt re-send precedent above; game_sync.pendingRevenge.isYou
          // told the client to expect it). Re-send-ONLY: a disconnect must not
          // re-reveal the Hunter or replay the wake cue, so this path goes
          // through sendRevengeTargets, never openRevengeGate.
          // Keyed on game.pendingRevenge alone (gated phase is night with a
          // null sub-phase, or voting — never a sub-phase condition).
          if (game.pendingRevenge && client.userId === game.pendingRevenge.hunterId) {
            sendRevengeTargets(game, game.pendingRevenge);
          }
        } else {
          broadcastLobbyUpdate(game);
        }
        break;
      }

      // Normal join (lobby only)
      const username = getUsernameFromClients(client.userId);
      const player = addPlayer(game, client.userId, username);
      if (!player) {
        send(ws, { type: "error", message: "Cannot join: game full or already started" });
        return;
      }
      client.gameCode = code;
      send(ws, { type: "game_joined", code, isAdmin: client.userId === game.adminId });
      broadcastLobbyUpdate(game);
      break;
    }

    case "leave_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game) {
        client.gameCode = null;
        return;
      }

      if (game.phase === "game_over") {
        // During game_over, remove the player
        removePlayer(game, client.userId);
        // If admin leaves during game_over, destroy the room (nobody can restart)
        if (client.userId === game.adminId) {
          broadcastToGame(game.code, { type: "room_closed", message: "The host has left. Room closed." });
          const leftCode = game.code;
          removeGame(leftCode);
          for (const [, c] of clients) {
            if (c.gameCode === leftCode) {
              c.gameCode = null;
            }
          }
        }
        client.gameCode = null;
        return;
      }

      if (game.phase === "lobby") {
        if (client.userId === game.adminId) {
          // Admin leaves lobby = end game for everyone.
          // NOT projectGameOver: no game ever concluded here (game.winner is
          // null in lobby) — winner "town" is forced, jokerJointWinner omitted.
          broadcastToGame(game.code, { type: "game_over", winner: "town", message: "The host has left the lobby.", forceEnded: true, players: getPlayerInfo(game, true) });
          removeGame(game.code);
          for (const [, c] of clients) {
            if (c.gameCode === client.gameCode) {
              c.gameCode = null;
            }
          }
        } else {
          removePlayer(game, client.userId);
          broadcastLobbyUpdate(game);
        }
      } else {
        // Active game (night/day/voting)
        if (client.userId === game.adminId) {
          // Admin leaves active game = force end (room persists at game_over)
          const from = game.phase;
          forceEndGame(game); // clears the revenge gate by hand (§6 L2)
          broadcastPhaseChange(game, {
            from,
            clearTimer: true,
            messages: ["The host has left the game."],
            events: true,
          });
          // NOT projectGameOver: this payload omits jokerJointWinner even
          // though official-joker mode can set it mid-game (resolveVote) —
          // pinned wire behavior, kept hand-assembled rather than arbitrated.
          broadcastToGame(game.code, {
            type: "game_over",
            winner: "town",
            message: "The host has left the game.",
            forceEnded: true,
            players: getPlayerInfo(game, true),
          });
          // Remove the game since admin explicitly left (can't restart)
          removeGame(game.code);
          for (const [, c] of clients) {
            if (c.gameCode === client.gameCode) {
              c.gameCode = null;
            }
          }
        } else {
          // Non-admin leaves active game — just mark disconnected (they can rejoin)
          const player = game.players.get(client.userId);
          if (player) player.connected = false;
        }
      }
      client.gameCode = null;
      break;
    }

    case "update_settings": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;
      if (game.phase !== "lobby") return;
      updateSettings(game, sanitizeSettings(msg.settings));
      send(ws, { type: "settings_updated", settings: game.settings });
      broadcastLobbyUpdate(game);
      break;
    }

    case "start_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) {
        send(ws, { type: "error", message: "Only the admin can start the game" });
        return;
      }
      // C1 (B8 finding): crafted-WS edge — start_game outside the lobby is a
      // silent no-op (like update_settings). Without this, the engine's null
      // return fell through to the misleading "Need at least 3 players" error.
      if (game.phase !== "lobby") return;
      const from = game.phase;
      const messages = startGame(game);
      if (!messages) {
        send(ws, { type: "error", message: "Need at least 3 players to start" });
        return;
      }
      saveLastSettings(game.adminId, JSON.stringify(game.settings));
      recordNarrator(game, messages);

      // Build mafia team names
      const mafiaNames = Array.from(game.players.values())
        .filter(p => p.role === "mafia")
        .map(p => p.username);
      // Godfather (if any): every mafia learns who it is; the godfather learns they are it.
      const godfatherName = Array.from(game.players.values()).find(p => p.isGodfather)?.username;
      // Public lineup summary for the "Roles in Play" modal (same for everyone).
      const roster = rosterSummary(game);

      // Send each player their role
      for (const [playerId, player] of game.players) {
        sendToUser(playerId, {
          type: "game_started",
          role: player.role!,
          isLover: player.isLover,
          variant: player.variant,
          roster,
          ...(player.role === "mafia" ? { mafiaTeam: mafiaNames } : {}),
          ...(player.role === "mafia" && godfatherName ? { godfatherName } : {}),
          ...(player.isGodfather ? { isGodfather: true } : {}),
        });
      }

      // Send night phase
      broadcastPhaseChange(game, { from, messages });

      // Gate night narration behind "Begin Night" button
      send(ws, { type: "awaiting_ready" });
      break;
    }

    case "mafia_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase !== "mafia") return;
      if (game.awaitingNarratorReady) return;

      const voteType = msg.voteType || "lock";
      const result = submitMafiaVote(game, client.userId, msg.targetId, voteType);

      broadcastMafiaStatus(game, result);
      break;
    }


    case "mafia_remove_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase !== "mafia") return;
      if (game.awaitingNarratorReady) return;

      if (!removeMafiaVote(game, client.userId, msg.targetId)) break;

      broadcastMafiaStatus(game, { consensus: false, target: null });
      break;
    }

    case "confirm_mafia_kill": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase !== "mafia") return;
      if (game.awaitingNarratorReady) return;
      if (game.mafiaTarget === null) return;
      const confirmer = game.players.get(client.userId);
      if (!confirmer || confirmer.role !== "mafia" || !confirmer.isAlive) return;

      const aliveMafia = getAliveByRole(game, "mafia");
      for (const m of aliveMafia) {
        sendToUser(m.id, { type: "night_action_done", message: "The Mafia has chosen their victim." });
      }

      // Notify dead players that mafia sub-phase completed (exclude haunting joker)
      const mafiaVictim = game.players.get(game.mafiaTarget);
      sendToDeadPlayers(game, {
        type: "spectator_night_complete",
        phase: "mafia",
        targetName: mafiaVictim ? mafiaVictim.username : null,
        alive: true,
      }, getHauntingJokerId(game));

      handleSubPhaseAdvance(game);
      break;
    }

    case "doctor_save": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.nightSubPhase !== "doctor") return;
      if (game.awaitingNarratorReady) return;

      const saved = submitDoctorSave(game, client.userId, msg.targetId);
      if (saved) {
        sendToUser(client.userId, { type: "night_action_done", message: "You have chosen to protect someone tonight." });

        // Notify dead players that doctor sub-phase completed (exclude haunting joker).
        // Official mode keeps the save fully secret: dead spectators must NOT learn
        // who the doctor protected, so the target name is withheld (null). House mode
        // reveals it. (Matches the public dawn narration, which is anonymous in
        // official mode — see resolveNightAndTransition + Narrator.doctorSaveOfficial.)
        const protectedPlayer = game.players.get(msg.targetId);
        const revealDoctorTarget = game.settings.doctorMode !== "official";
        sendToDeadPlayers(game, {
          type: "spectator_night_complete",
          phase: "doctor",
          targetName: revealDoctorTarget && protectedPlayer ? protectedPlayer.username : null,
          alive: true,
        }, getHauntingJokerId(game));

        // Advance to next sub-phase (detective/resolving)
        handleSubPhaseAdvance(game);
      } else {
        send(ws, { type: "error", message: "You cannot protect the same player two nights in a row." });
      }
      break;
    }

    case "detective_investigate": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.nightSubPhase !== "detective") return;
      if (game.awaitingNarratorReady) return;

      const result = submitDetectiveInvestigation(game, client.userId, msg.targetId);
      if (result) {
        sendToUser(client.userId, {
          type: "night_action_done",
          message: "You have chosen to investigate someone tonight. Results will be revealed at dawn.",
        });

        // Notify dead players that detective sub-phase completed (exclude haunting joker)
        const investigatedPlayer = game.players.get(msg.targetId);
        sendToDeadPlayers(game, {
          type: "spectator_night_complete",
          phase: "detective",
          targetName: investigatedPlayer ? investigatedPlayer.username : null,
          alive: true,
        }, getHauntingJokerId(game));

        // Advance to resolving
        handleSubPhaseAdvance(game);
      }
      break;
    }

    case "vigilante_shoot": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.nightSubPhase !== "vigilante") return;
      if (game.awaitingNarratorReady) return;
      // M6 hygiene: accept only null (hold fire) or a numeric target id.
      const targetId = msg.targetId;
      if (targetId !== null && typeof targetId !== "number") return;

      const ok = submitVigilanteShoot(game, client.userId, targetId);
      if (ok) {
        sendToUser(client.userId, {
          type: "night_action_done",
          message: targetId === null
            ? "You hold your fire and keep your bullet."
            : "You have taken your shot. Your bullet is spent.",
        });
        // Notify dead players that the vigilante sub-phase completed (exclude haunting joker).
        const tgt = targetId !== null ? game.players.get(targetId) : null;
        sendToDeadPlayers(game, {
          type: "spectator_night_complete",
          phase: "vigilante",
          targetName: tgt ? tgt.username : null,
          alive: true,
        }, getHauntingJokerId(game));

        handleSubPhaseAdvance(game);
      }
      break;
    }

    case "joker_haunt": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase === "resolving") return;
      if (game.awaitingNarratorReady) return;

      const haunted = submitJokerHaunt(game, client.userId, msg.targetId);
      if (haunted) {
        sendToUser(client.userId, { type: "night_action_done", message: "You have chosen your victim. Revenge is sweet." });
        // Notify other dead players that joker has chosen (exclude joker themselves)
        const target = game.players.get(msg.targetId);
        if (target) {
          sendToDeadPlayers(game, {
            type: "spectator_joker_resolved",
            targetName: target.username,
          }, client.userId);
        }
        // No sub-phase advance — haunt is a parallel action
      }
      break;
    }

    case "hunter_revenge": {
      // C3a (HUNTER-DESIGN §3.6): guards — in a game, gate open, sender IS
      // the hunter. Rejections are silent (the night-action handler
      // pattern); an engine rejection (dead/missing target) is equally
      // silent and leaves the gate open so the hunter can retry.
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || !game.pendingRevenge) return;
      if (client.userId !== game.pendingRevenge.hunterId) return;
      // M6 hygiene: accept only null (decline) or a numeric target id from
      // the wire — a malformed/missing targetId must not read as a decline.
      const targetId = msg.targetId;
      if (targetId !== null && typeof targetId !== "number") return;
      // Boolean deliberately dropped (false = engine rejection, gate stays open — see resolveRevenge doc); C3b consumes it.
      resolveRevenge(game, client.userId, targetId);
      break;
    }

    case "force_skip_revenge": {
      // C3a (HUNTER-DESIGN §3.6): admin only (rights retained dead or
      // alive), gate open — resolves as a decline through the identical
      // path (decision #2: the kitchen-problem safety net).
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || !game.pendingRevenge) return;
      if (client.userId !== game.adminId) return;
      // Boolean deliberately dropped (false = engine rejection, gate stays open — see resolveRevenge doc); C3b consumes it.
      resolveRevenge(game, game.pendingRevenge.hunterId, null);
      break;
    }

    case "call_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      if (callVote(game, client.userId, msg.targetId)) {
        game.dayVoteCount++;
        const target = game.players.get(msg.targetId)!;
        broadcastToGame(game.code, {
          type: "vote_called",
          targetName: target.username,
          targetId: msg.targetId,
        });
      }
      break;
    }

    case "abstain_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;
      if (game.phase !== "day") return;
      // Admin abstains - just stay in day phase, no vote happens
      recordNarrator(game, ["The admin has chosen to abstain from calling a vote today."]);
      broadcastPhaseChange(game, {
        from: game.phase, // no engine transition on abstain: the day→day self-edge
        messages: ["The admin has chosen to abstain from calling a vote today."],
      });
      break;
    }

    case "cancel_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      const from = game.phase;
      if (cancelVote(game, client.userId)) {
        game.dayStartedAt = Date.now();
        recordNarrator(game, ["The vote has been cancelled by the admin."]);
        broadcastPhaseChange(game, {
          from,
          messages: ["The vote has been cancelled by the admin."],
          events: true,
        });
      }
      break;
    }

    case "cast_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game) return;

      const result = castVote(game, client.userId, msg.approve);

      // Only broadcast vote progress when in voting phase and the vote was recorded
      if (game.phase === "voting" && game.votes.has(client.userId)) {
        broadcastToGame(game.code, {
          type: "vote_update",
          totalVotes: game.votes.size,
          total: getAlivePlayers(game).length,
        });
      }

      if (result.allVoted) {
        const from = game.phase;
        const voteResult = resolveVote(game);
        if (voteResult) {
          recordNarrator(game, voteResult.messages);

          // M12: never broadcast exact tallies — in small games they de-anonymize voters
          broadcastToGame(game.code, {
            type: "vote_result",
            targetName: voteResult.targetName,
            executed: voteResult.executed,
          });

          // Send joker win overlay only to the joker (official mode: game continues)
          if (voteResult.jokerWin && game.settings.jokerMode === "official") {
            const jokerPlayer = voteResult.killed.find(k => k.player.role === "joker");
            if (jokerPlayer) {
              sendToUser(jokerPlayer.player.id, {
                type: "joker_win_overlay",
                jokerName: jokerPlayer.player.username,
              });
            }
          }

          let voteLoverDeathName: string | undefined;
          for (const k of voteResult.killed) {
            // B3: keyed on the Death's cause, not array position — revenge
            // deaths joining vote kill lists (Program C) keep correct labels.
            // A day-execution lover cascade is PUBLIC heartbreak (owner ruling):
            // isLoverDeath on the victim's you_died, and voteLoverDeathName
            // threaded onto the epilogue phase_change for the public beat.
            const isLoverDeath = k.cause === "lover_cascade";
            if (isLoverDeath) voteLoverDeathName = k.player.username;
            sendToUser(k.player.id, { type: "you_died", message: k.message, ...(isLoverDeath ? { isLoverDeath: true } : {}) });
            broadcastToGame(game.code, {
              type: "player_died",
              playerId: k.player.id,
              playerName: k.player.username,
              message: k.message,
            });
          }

          // ── Vote-path revenge interrupt (C3b, HUNTER-DESIGN §4) ────────
          // A Hunter died in this execution (directly or by lover cascade):
          // the engine deferred the win check + auto-night, so the phase
          // HOLDS at "voting" with the ballot already cleared. vote_result
          // and the death loop above went out exactly as always; the public
          // reveal + hunter prompt + revenge timeout now replace the
          // epilogue branches below — resolveRevenge's night/game_over
          // branches emit the deferred broadcast on resolution. While gated
          // NO phase_change leaves this handler, so the illegal
          // voting→voting edge (the pre-C3b "spared" fall-through) is
          // structurally unreachable, and no day/night cue fires early.
          // Note: voteLoverDeathName is deliberately dropped on THIS path —
          // the executed player's own cascade was already surfaced via the
          // loop above (you_died isLoverDeath), and the post-revenge phase_change
          // carries only REVENGE-cascade names (C5: the client must not expect
          // it on the resumed broadcast).
          if (game.pendingRevenge) {
            openRevengeGate(game, game.pendingRevenge);
            break;
          }

          if (game.phase === "game_over") {
            game.dayStartedAt = null;
            broadcastPhaseChange(game, {
              from,
              messages: voteResult.messages,
              events: true,
              loverDeathName: voteLoverDeathName,
            });
            // Divergence kept visible: the live broadcast's message is the
            // narrator's last line, NOT buildGameSync's canonical win line.
            broadcastToGame(game.code, {
              type: "game_over",
              ...projectGameOver(game, voteResult.messages[voteResult.messages.length - 1]),
            });
          } else if (game.phase === "night") {
            // Auto-transition to night after execution
            game.dayStartedAt = null;
            game.dayVoteCount = 0;
            broadcastPhaseChange(game, {
              from,
              messages: voteResult.messages,
              events: true,
              loverDeathName: voteLoverDeathName,
            });
            startNightSequence(game);
          } else {
            // Spared — stay in day
            game.dayStartedAt = Date.now();
            broadcastPhaseChange(game, { from, messages: [], events: true });
          }
        }
      }
      break;
    }

    case "force_dawn": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      // Timer clear stays AT THE SITE (not the helper's clearTimer option):
      // today it runs even when forceDawn rejects (non-night), and that
      // failure path returns before the helper. Pre-existing semantics.
      clearNightTimer(game.code);
      const from = game.phase;
      const messages = forceDawn(game);
      if (messages.length === 0) return;
      // C3a (§6 L2): force_dawn is a sanctioned gate-CLEARING forced
      // transition — forceDawn's reset just wiped pendingRevenge, so the
      // dawn proceeds with NO revenge.
      game.dayStartedAt = Date.now();
      recordNarrator(game, messages);

      // Send detective result if investigation was submitted before force dawn
      if (game.detectiveResult) {
        const allDetectives = Array.from(game.players.values()).filter((p) => p.role === "detective");
        for (const d of allDetectives) {
          sendToUser(d.id, {
            type: "detective_result",
            targetName: game.players.get(game.detectiveResult.targetId)?.username ?? "Unknown",
            isMafia: game.detectiveResult.isMafia,
          });
        }
        game.detectiveResult = null;
      }

      broadcastPhaseChange(game, { from, messages, events: true, dayCue: true });
      break;
    }

    case "end_day": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      const from = game.phase;
      const messages = endDay(game);
      if (messages.length === 0) return;
      game.dayStartedAt = null;
      game.dayVoteCount = 0;
      recordNarrator(game, messages);
      broadcastPhaseChange(game, { from, messages });
      startNightSequence(game);
      break;
    }

    case "end_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;
      if (game.phase === "game_over") return;

      const from = game.phase;
      forceEndGame(game); // clears the revenge gate by hand (§6 L2)
      recordNarrator(game, ["Host has ended the game."]);
      broadcastPhaseChange(game, {
        from,
        clearTimer: true,
        messages: ["Host has ended the game."],
        events: true,
      });
      // winner comes from the projection: forceEndGame just set it to "town"
      // (the L3 well-defined-winner rule). forceEnded: true stays per-site —
      // the live win broadcasts omit it.
      broadcastToGame(game.code, {
        type: "game_over",
        ...projectGameOver(game, "Host has ended the game."),
        forceEnded: true,
      });
      // Room persists — do NOT removeGame or clear gameCode refs
      break;
    }

    case "return_to_lobby": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) {
        send(ws, { type: "error", message: "Only the admin can return to lobby" });
        return;
      }
      if (!returnToLobby(game)) {
        send(ws, { type: "error", message: "Cannot return to lobby" });
        return;
      }
      // After the success check: an errant return_to_lobby during an active
      // night must NOT clear the legit pending timer (M2)
      clearNightTimer(game.code);
      broadcastLobbyUpdate(game);
      break;
    }

    case "close_room": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      clearNightTimer(game.code);
      broadcastToGame(game.code, { type: "room_closed", message: "The host has closed the room." });
      const closedCode = game.code;
      removeGame(closedCode);
      // Clear all clients' gameCode refs
      for (const [, c] of clients) {
        if (c.gameCode === closedCode) {
          c.gameCode = null;
        }
      }
      break;
    }

    case "restart_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) {
        send(ws, { type: "error", message: "Only the admin can restart the game" });
        return;
      }
      // Timer clear stays AT THE SITE (not the helper's clearTimer option):
      // today it runs even when restartGame fails (<3 players), and that
      // failure path returns before the helper. Pre-existing semantics —
      // restartGame has no phase guard (M2's enabler, audit D1).
      clearNightTimer(game.code);
      const from = game.phase;
      const messages = restartGame(game);
      if (!messages) {
        send(ws, { type: "error", message: "Cannot restart game" });
        return;
      }
      recordNarrator(game, messages);

      // Build mafia team names
      const mafiaNames2 = Array.from(game.players.values())
        .filter(p => p.role === "mafia")
        .map(p => p.username);
      const godfatherName2 = Array.from(game.players.values()).find(p => p.isGodfather)?.username;
      const roster2 = rosterSummary(game);

      // Send each player their new role
      for (const [playerId, player] of game.players) {
        sendToUser(playerId, {
          type: "game_started",
          role: player.role!,
          isLover: player.isLover,
          variant: player.variant,
          roster: roster2,
          ...(player.role === "mafia" ? { mafiaTeam: mafiaNames2 } : {}),
          ...(player.role === "mafia" && godfatherName2 ? { godfatherName: godfatherName2 } : {}),
          ...(player.isGodfather ? { isGodfather: true } : {}),
        });
      }

      // Send night phase
      broadcastPhaseChange(game, { from, messages });

      // Gate night narration behind "Begin Night" button
      send(ws, { type: "awaiting_ready" });
      break;
    }

    case "narrator_ready": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;
      if (game.phase !== "night") return;
      // C3a's interim pendingRevenge guard was removed here: the C3b M7
      // sweep (REVENGE_GATE_REJECTED, dispatch level) now rejects
      // narrator_ready before this handler can run while gated.
      if (!game.awaitingNarratorReady) return;
      game.awaitingNarratorReady = false;
      startNightSequence(game);
      break;
    }

    case "toggle_sound": {
      // Sound toggle is client-side only, but we acknowledge it
      break;
    }

    case "update_player_pref": {
      if (!client.userId) return;
      const key = msg.key;
      if (key === "hide_mafia_tag") {
        updateUserPref(client.userId, "hide_mafia_tag", !!msg.value);
      } else if (key === "player_color") {
        if (!PLAYER_COLORS.includes(msg.value)) {
          send(ws, { type: "error", message: "Invalid color" });
          return;
        }
        updateUserPref(client.userId, "player_color", msg.value);
      } else {
        return;
      }
      const prefs = getUserPrefs(client.userId);
      send(ws, { type: "player_prefs", hide_mafia_tag: prefs.hide_mafia_tag, player_color: prefs.player_color });
      // If color changed and player is in a lobby, broadcast update
      if (key === "player_color" && client.gameCode) {
        const game = getGame(client.gameCode);
        if (game && game.phase === "lobby") {
          broadcastLobbyUpdate(game);
        }
      }
      break;
    }

    case "player_return_to_lobby": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "game_over") return;
      // Non-admin only (admin uses return_to_lobby)
      if (client.userId === game.adminId) return;
      // Send lobby_update to just this player so they can navigate to lobby
      const players = getPlayerInfo(game).map(p => ({
        ...p,
        color: getUserPrefs(p.id).player_color,
      }));
      const admin = game.players.get(game.adminId);
      send(ws, {
        type: "lobby_update",
        players,
        settings: game.settings,
        adminName: admin?.username ?? "Unknown",
      });
      break;
    }
  }
}

function broadcastMafiaStatus(game: Game, result: { consensus: boolean; target: number | null }): void {
  const status = getMafiaVoteStatus(game);
  const aliveMafia = getAliveByRole(game, "mafia");
  for (const m of aliveMafia) {
    sendToUser(m.id, { type: "mafia_vote_update", voterTargets: status.voterTargets, lockedTarget: status.lockedTarget, objectedTargets: status.objectedTargets, aliveMafiaCount: status.aliveMafiaCount });
  }

  // Send spectator update to dead players (exclude haunting joker)
  const aliveNonMafia = getAlivePlayers(game).filter((p) => p.role !== "mafia");
  const spectatorTargets = aliveNonMafia.map((p) => toTargetInfo(p, game));
  sendToDeadPlayers(game, {
    type: "spectator_mafia_update",
    voterTargets: status.voterTargets,
    lockedTarget: status.lockedTarget,
    objectedTargets: status.objectedTargets,
    aliveMafiaCount: status.aliveMafiaCount,
    targets: spectatorTargets,
  }, getHauntingJokerId(game));

  // On consensus: send confirm-ready so mafia can confirm the kill
  if (result.consensus && result.target !== null) {
    const target = game.players.get(result.target);
    const targetName = target ? target.username : "target";
    for (const m of aliveMafia) {
      sendToUser(m.id, { type: "mafia_confirm_ready", targetName, targetId: result.target });
    }
  }
}

function resolveNightAndTransition(game: Game): void {
  if (!getGame(game.code)) return; // game was removed (e.g., admin left)
  // Capture haunting joker id before transitionToDay clears jokerHauntVoters
  const hauntingJokerId = getHauntingJokerId(game);
  const from = game.phase;
  const nightResult = transitionToDay(game);
  recordNarrator(game, nightResult.messages);

  // Track dayStartedAt
  if (game.phase === "day") {
    game.dayStartedAt = Date.now();
  }

  // Official Mafia keeps the Doctor save ANONYMOUS: the saved victim is NOT
  // privately told they were targeted (only the anonymous public "someone was
  // saved" narration is broadcast at dawn). We intentionally send nothing to
  // the victim here (the old doctor_save_private message was removed entirely).

  // Send detective result privately (even if detective died this night)
  if (game.detectiveResult) {
    const allDetectives = Array.from(game.players.values()).filter((p) => p.role === "detective");
    for (const d of allDetectives) {
      sendToUser(d.id, {
        type: "detective_result",
        targetName: game.players.get(game.detectiveResult.targetId)?.username ?? "Unknown",
        isMafia: game.detectiveResult.isMafia,
      });
    }
    game.detectiveResult = null;
  }

  // Finding 3 (adjusted for the public-heartbreak ruling): the same-night death
  // BATCH is emitted so that the DIRECT deaths (mafia + vigilante + joker haunt)
  // are alphabetical among themselves — their resolution order stays hidden, so
  // the player_died / you_died / spectator sequence can't out which was the
  // mafia vs the vigilante kill. Each lover cascade is then inserted IMMEDIATELY
  // AFTER its partner (identified via loverId), matching the dawn narrator line
  // order [directs…, then heartbreak(partner)]. A global alphabetical sort is
  // WRONG here: it could place a heartbroken partner before the lover whose
  // death caused the cascade. Hunter-revenge deaths are a SEPARATE, later,
  // by-design-public broadcast (resolveRevenge) — never folded in here.
  {
    const cascades = nightResult.killed.filter((k) => k.cause === "lover_cascade");
    const directs = nightResult.killed
      .filter((k) => k.cause !== "lover_cascade")
      .sort((a, b) => a.player.username.localeCompare(b.player.username));
    const ordered: typeof nightResult.killed = [];
    for (const d of directs) {
      ordered.push(d);
      for (const c of cascades) {
        if (c.player.loverId === d.player.id) ordered.push(c);
      }
    }
    // Defensive: surface any cascade whose partner somehow isn't in directs.
    for (const c of cascades) if (!ordered.includes(c)) ordered.push(c);
    nightResult.killed = ordered;
  }

  // Send spectator kill result to dead players (before phase change clears their panel)
  if (nightResult.killed.length > 0 || nightResult.saved) {
    // On a save-only night (no deaths) targetName would otherwise be the SAVED
    // player's name — a secrecy leak in official mode. Withhold it there; the
    // `kills` array (empty here) is the real death list. When someone actually
    // died, targetName is that public death, which is fine to name.
    const targetName = nightResult.killed.length > 0
      ? nightResult.killed[0].player.username
      : (game.settings.doctorMode === "official" ? null : nightResult.savedName!);
    let doctorMessage: string | null = null;
    if (game.settings.enableDoctor) {
      if (nightResult.saved && nightResult.savedName) {
        // Official mode keeps the save anonymous to dead spectators too — the
        // saved player's name is withheld, consistent with the public dawn
        // narration (Narrator.doctorSaveOfficial). House mode names them.
        doctorMessage = game.settings.doctorMode === "official"
          ? "The Doctor saved someone tonight"
          : `Doctor saved ${nightResult.savedName}`;
      } else {
        doctorMessage = `Doctor was not able to save ${targetName}`;
      }
    }
    // Finding 4: `source` dropped — a dead spectator's raw frame must not out
    // whether each death was a mafia kill or a vigilante shot. The name list is
    // the death roll; per-role targeting is already visible in the spectator_*
    // per-sub-phase stream for those who watched it live.
    const kills = nightResult.killed.map(k => ({ name: k.player.username }));
    sendToDeadPlayers(game, {
      type: "spectator_kill_confirmed",
      targetName,
      doctorMessage,
      kills,
    }, hauntingJokerId);
  }

  // Notify killed players. The DIRECT deaths are announced as ONE cause-neutral
  // combined line (engine resolveNight); each lover cascade is a SEPARATE public
  // "died of heartbreak" narrator line after it. isLoverDeath rides the cascade
  // victim's own you_died (private heartbreak art), and nightLoverDeathName is
  // threaded onto the dawn phase_change so the client fires the public
  // heartbreak beat AFTER the combined dawn verdict (owner ruling). One lover
  // pair per game ⟹ at most one cascade name.
  let nightLoverDeathName: string | undefined;
  for (const k of nightResult.killed) {
    const isLoverDeath = k.cause === "lover_cascade";
    if (isLoverDeath) nightLoverDeathName = k.player.username;
    sendToUser(k.player.id, { type: "you_died", message: k.message, ...(isLoverDeath ? { isLoverDeath: true } : {}) });
    broadcastToGame(game.code, {
      type: "player_died",
      playerId: k.player.id,
      playerName: k.player.username,
      message: k.message,
    });
  }

  // ── Two-stage dawn (C3a, HUNTER-DESIGN §4) ─────────────────────────────
  // Stage 1 always ran above: private results delivered, deaths announced.
  // If a Hunter died tonight the engine opened the revenge gate (and
  // concludeRound deferred the win check + transition — phase is still
  // "night"): Stage 2 replaces the closing day-cue/phase_change with the
  // public reveal + the hunter's prompt + the revenge timeout.
  // resolveRevenge emits the deferred epilogue once the gate clears. With
  // no gate, the tail below is byte-identical to the pre-C3a dawn (pinned
  // by the golden message-sequence tests).
  if (game.pendingRevenge) {
    // Stash the (already-recorded) night-batch dawn lines so resolveRevenge can
    // still deliver the ONE cause-neutral combined death line to living clients
    // when the gate clears — the deferred dawn would otherwise drop it.
    game.pendingRevenge.deferredNightMessages = nightResult.messages;
    openRevengeGate(game, game.pendingRevenge);
    return;
  }

  // Day sound cue + phase change (night → day, or night → game_over on a win)
  broadcastPhaseChange(game, {
    from,
    messages: nightResult.messages,
    events: true,
    saved: nightResult.saved,
    loverDeathName: nightLoverDeathName,
    dayCue: true,
  });

  if (game.phase === "game_over") {
    // Divergence kept visible: the live broadcast's message is the
    // narrator's last line, NOT buildGameSync's canonical win line.
    broadcastToGame(game.code, {
      type: "game_over",
      ...projectGameOver(game, nightResult.messages[nightResult.messages.length - 1]),
    });
  }
}

function getUsernameFromClients(userId: number): string {
  const user = getUserById(userId);
  return user?.username ?? `Player${userId}`;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".webmanifest": "application/manifest+json",
  };
  return types[ext] || "application/octet-stream";
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Serve static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = path.join(PUBLIC_DIR, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(PUBLIC_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const file = Bun.file(fullPath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": getMimeType(fullPath) },
        });
      }
    } catch { /* fall through */ }

    // SPA fallback
    const indexFile = Bun.file(path.join(PUBLIC_DIR, "index.html"));
    return new Response(indexFile, {
      headers: { "Content-Type": "text/html" },
    });
  },

  websocket: {
    open(ws) {
      clients.set(ws, { ws, userId: null, gameCode: null });
    },

    message(ws, message) {
      const client = clients.get(ws);
      if (!client) return;

      try {
        const msg = JSON.parse(String(message)) as ClientMessage;
        handleMessage(ws, client, msg);
      } catch (e) {
        send(ws, { type: "error", message: "Invalid message format" });
      }
    },

    close(ws) {
      const client = clients.get(ws);
      if (client) {
        if (client.gameCode && client.userId) {
          const game = getGame(client.gameCode);
          if (game) {
            const player = game.players.get(client.userId);
            if (player) {
              player.connected = false;
            }
            // All disconnects are non-destructive — player can rejoin via auto-rejoin
          }
        }
        clients.delete(ws);
      }
    },
  },
});

// Auto-kill games older than 2 hours
const TWO_HOURS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of getAllGames()) {
    if (now - game.createdAt > TWO_HOURS) {
      clearNightTimer(code);
      // NOT projectGameOver: the sweep also reaps games idling AT game_over
      // (where winner may be "joker"/"mafia" and jokerJointWinner true) yet
      // always reports winner "town" with no jokerJointWinner/forceEnded —
      // pinned wire behavior, kept hand-assembled rather than arbitrated.
      broadcastToGame(code, {
        type: "game_over",
        winner: "town",
        message: "Game ended: exceeded 2-hour time limit.",
        players: getPlayerInfo(game, true),
      });
      removeGame(code);
      for (const [, c] of clients) {
        if (c.gameCode === code) {
          c.gameCode = null;
        }
      }
    }
  }
}, 60_000);

console.log(`Mafia server running on http://localhost:${PORT}`);
