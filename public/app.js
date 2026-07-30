(function () {
  "use strict";

  // ============================================================
  // i18n — per-device language (docs/superpowers/specs/2026-07-30-i18n-korean-design.md)
  // ------------------------------------------------------------
  // English is the default and never depends on anything async: index.html ships
  // the English text inline and the generated bundle loads as a classic script
  // before this file. t() therefore always answers synchronously, and switching
  // language repaints the chrome plus every dynamic surface via rerenderForLang().
  //
  // Audio is DELIBERATELY not localized (approved non-goal) — narration mp3s stay
  // English regardless of the UI language.
  // ============================================================
  const LANG_KEY = "mafia_lang";
  // Display order of the picker. A new language = one more JSON file + one entry.
  const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "ko", label: "한국어" },
  ];

  (function initI18n() {
    const data = (typeof I18N_BUNDLES !== "undefined" && I18N_BUNDLES) || (window && window.I18N_BUNDLES) || {};
    for (const code in data) {
      if (Object.prototype.hasOwnProperty.call(data, code)) I18n.setBundle(code, data[code]);
    }
    let saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch { /* private mode */ }
    if (saved && I18n.hasBundle(saved)) I18n.setLang(saved);
  })();

  /** Render a UI string. `seed` selects a pool variant where a key has several. */
  function t(key, params, seed) {
    return I18n.t(key, params, seed);
  }

  /** Render a server message reference ({ text, key, params, seed }) or string. */
  function tMsg(m) {
    return I18n.renderMessage(m);
  }

  function currentLang() {
    return I18n.lang();
  }

  /**
   * Repaint every `data-i18n*` node from the active language.
   *
   * Idempotent and safe to run at any time: in English it writes back the same
   * text index.html already contains. Marked-up containers are NEVER given a
   * data-i18n attribute (it would wipe child nodes) — the static run of text
   * inside them is wrapped in its own span instead.
   */
  function applyStaticI18n(root) {
    const scope = root || document;
    // Keep <html lang> truthful: it drives `:lang()` CSS (Hangul needs the
    // Latin letter-spacing dropped) and screen-reader pronunciation.
    if (!root && document.documentElement) document.documentElement.setAttribute("lang", currentLang());
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    const ATTRS = ["title", "aria-label", "placeholder", "alt"];
    for (const attr of ATTRS) {
      scope.querySelectorAll("[data-i18n-" + attr + "]").forEach((el) => {
        el.setAttribute(attr, t(el.getAttribute("data-i18n-" + attr)));
      });
    }
  }

  /**
   * Switch language: persist, repaint static chrome, then re-render every
   * dynamic surface that already has content on screen (narrator line,
   * transcript, event log, role card, roster, accusations, vote panel…).
   * Registered as an I18n.onChange subscriber further down, so anything that
   * calls I18n.setLang directly also gets the repaint.
   */
  function setLanguage(code) {
    if (!I18n.hasBundle(code) || code === currentLang()) return;
    try { localStorage.setItem(LANG_KEY, code); } catch { /* private mode */ }
    I18n.setLang(code); // fires rerenderForLang via onChange
  }

  // ============================================================
  // STATE
  // ============================================================
  let ws = null;
  let userId = null;
  let username = null;
  let gameCode = null;
  let isAdmin = false;
  let myRole = null;
  // Roles whose night sub-phase emits its own "<role>_close" sound_cue
  // (mirrors CueSubPhase in src/types.ts — joker haunt / hunter revenge have
  // no close cue, so they're intentionally excluded here).
  const CLOSEABLE_NIGHT_ROLES = new Set(["mafia", "doctor", "detective", "vigilante"]);
  let myIsGodfather = false;
  let vigilanteBulletUsed = false; // Vigilante own-screen indicator: true once the bullet is spent
  let isLover = false;
  let isDead = false;
  let jokerWonOverlayShown = false;
  let currentPhase = null;
  let previousPhase = null;
  let soundEnabled = false;
  let hasVoted = false;
  let audioCtx = null;
  let soundQueue = [];
  let soundPlaying = false;
  let narrationData = null;
  let currentAccent = "classic";
  // The narrator gender ("male" | "female"); combined with the accent it forms
  // the audio dir key `<accent>-<gender>`. Ignored (randomized) when the accent
  // is "random". Single writer is setGender(); synced via update_settings.
  let currentGender = "male";
  // When currentAccent is "random", this holds the concrete `<accent>-<gender>`
  // key picked once per game/narration session (stable within a game). Cleared
  // whenever the accent/gender changes or a new game starts, so each game
  // re-rolls. Audio paths are always built from resolveAccent(), never "random".
  let resolvedAccent = null;
  let narrationAudioCache = {};
  let currentAudio = null;
  let knownPlayers = [];
  let deathOrderCounter = 0;
  let mafiaTeam = [];
  let godfatherName = null;
  let currentRoster = null; // public lineup summary for the "Roles in Play" modal
  // Pre-game inputs for the SAME modal opened from the lobby (F6). Both come
  // straight off lobby_update; neither carries any player→role pairing.
  let lobbySettings = null;
  let lobbyPlayerCount = 0;
  let lobbyAdminName = null; // host name, re-spliced into the waiting line on a language switch
  let dayVoteCount = 0;
  // Player-initiated accusations (day phase). pendingAccusations mirrors the
  // server's un-seconded list; accusationsMade/secondsMade are the per-day usage
  // sets (public info) used for button eligibility + rejoin.
  let pendingAccusations = [];
  let accusationsMade = [];
  let secondsMade = [];
  let accuseSelectedTarget = null; // "sleep" | player id | null while picking
  let suspenseActive = false;
  let suspenseQueue = [];
  let nightTransitionActive = false;
  let nightTransitionQueue = [];
  // Round the NIGHTFALL overlay has already been shown for (Bug 2). The first
  // night's transition is triggered off the opening "night" sound cue (the
  // phase_change landed at start_game with previousPhase null, so
  // handlePhaseChange skipped it); this marker fires that trigger exactly once
  // and skips it when the day->night path already ran showNightTransition.
  let nightTransitionRound = 0;
  let executionTransitionActive = false;
  let heartbreakTransitionActive = false;
  let pendingGameOver = null; // game_over held while an overlay chain animates (L5)
  let nightNarrationActive = false;
  let nightNarrationQueue = [];
  let audioUnlocked = false;
  let narratorTranscript = [];
  let deadDismissTimer = null;
  let dayTimerInterval = null;
  let dayTimerStart = null;
  let detectiveHistory = [];
  let mafiaConfirmTarget = null;
  let myMafiaVotes = []; // array of { targetId, voteType }
  let mafiaObjectedTargets = {}; // { targetId: ["username", ...] }
  let aliveMafiaCount = 0;
  let lastGameEvents = [];
  let lastVoteResult = null;
  let spectatorNightLog = [];
  let hideMafiaTag = false;
  let myPlayerColor = null;
  // The Figma "Choose your color" grid: 3 rows x 6, read in draw order from
  // docs/figma-raw/specs/game-menu/42-782--lobby-player.md.
  const PLAYER_COLORS = [
    "#E53935", "#E876A0", "#8E24AA", "#5E35B1", "#3949AB", "#1E88E5",
    "#039BE5", "#00ACC1", "#00897B", "#43A047", "#7CB342", "#C0CA33",
    "#FDD835", "#FFB300", "#FB8C00", "#F4511E", "#6D4C41", "#757575",
  ];

  // Stored player_color values predate this palette (only 2 of the old 20
  // survive), and the picker matches by exact hex — a stale colour would render
  // as "nothing selected". Map any off-palette hex to its nearest swatch by
  // squared RGB distance so returning players keep a sensible selection.
  const colorRemapCache = new Map();
  function nearestPlayerColor(hex) {
    if (!hex) return hex;
    const h = String(hex).trim().toUpperCase();
    if (PLAYER_COLORS.includes(h)) return h;
    if (colorRemapCache.has(h)) return colorRemapCache.get(h);
    // Anything that is not a plain 6-digit hex is not a colour we stored;
    // fall back to a palette entry rather than echoing it into a style string.
    const m = /^#([0-9A-F]{6})$/.exec(h);
    if (!m) return PLAYER_COLORS[0];
    const v = parseInt(m[1], 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    let best = PLAYER_COLORS[0], bestD = Infinity;
    for (const c of PLAYER_COLORS) {
      const cv = parseInt(c.slice(1), 16);
      const dr = r - ((cv >> 16) & 255), dg = g - ((cv >> 8) & 255), db = b - (cv & 255);
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = c; }
    }
    colorRemapCache.set(h, best);
    return best;
  }
  let jokerJointWinner = false;

  // ============================================================
  // DOM REFS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const screens = {
    auth: $("screen-auth"),
    menu: $("screen-menu"),
    lobbyAdmin: $("screen-lobby-admin"),
    lobbyPlayer: $("screen-lobby-player"),
    game: $("screen-game"),
    gameover: $("screen-gameover"),
  };
  // D8: tracks the currently-active screen so showScreen() can choose a
  // threshold-specific enter animation (lobby→game, game→gameover).
  let activeScreenName = null;

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(name) {
    // D8: screen transition — pick a purpose-built enter animation for the key
    // narrative thresholds (lobby→game, game→gameover), else a generic soft
    // enter. The animation classes are mutually exclusive; restart by removing
    // then re-adding so a repeat navigation re-triggers. prefers-reduced-motion
    // (CSS) collapses all of these to instant/opacity-only.
    var prevName = activeScreenName;
    var enterClass = "screen-enter";
    if (prevName === "lobbyAdmin" || prevName === "lobbyPlayer") {
      if (name === "game") enterClass = "screen-enter-game";
    }
    if (prevName === "game" && name === "gameover") enterClass = "screen-enter-gameover";

    Object.values(screens).forEach((s) => {
      s.classList.remove("active", "screen-enter", "screen-enter-game", "screen-enter-gameover");
    });
    var next = screens[name];
    next.classList.add("active");
    // Force a reflow so re-navigating to the same screen restarts the animation.
    void next.offsetWidth;
    next.classList.add(enterClass);
    activeScreenName = name;
    // D2: phase ambience is only valid on the in-game screen. Clearing it here
    // is the single chokepoint that covers every leave/return-to-lobby/menu/
    // room_closed/logout/game-over path (which all route through showScreen) —
    // no stale midnight lobby. applyPhaseChange()/handleGameSync re-set it after
    // navigating to "game".
    if (name !== "game") {
      document.body.removeAttribute("data-phase");
      // Off the game screen there's no phase — re-sync the pinned base + chrome.
      applyEffectiveTheme();
    }
  }

  // ============================================================
  // WEBSOCKET
  // ============================================================
  function connectPatched() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onopen = () => {
      const saved = localStorage.getItem("mafia_user");
      if (saved) {
        let data = null;
        try { data = JSON.parse(saved); } catch {}
        if (data && data.username) {
          wsSend({ type: "login", username: data.username, passcode: data.passcode });
        } else {
          // Corrupt stored credentials — drop them and stay logged out (L6)
          localStorage.removeItem("mafia_user");
        }
      }
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      trackPlayers(msg);
      handleServerMessage(msg);
    };

    ws.onclose = () => {
      setTimeout(connectPatched, 2000);
    };
  }

  function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      // D9: frame silently dropped — surface it for debugging (no behavior change)
      console.warn(
        "[mafia] wsSend dropped frame (socket not OPEN):",
        msg && msg.type,
        "readyState=" + (ws ? ws.readyState : "none")
      );
    }
  }

  // ============================================================
  // PLAYER TRACKING (for admin target list)
  // ============================================================
  let gotPlayerList = false; // true when rejoin provides accurate alive/dead state

  function trackPlayers(msg) {
    if (msg.type === "lobby_update") {
      knownPlayers = msg.players;
    }
    if (msg.type === "player_list") {
      knownPlayers = msg.players;
      gotPlayerList = true;
    }
    if (msg.type === "player_died") {
      const p = knownPlayers.find((pl) => pl.id === msg.playerId);
      if (p) {
        p.isAlive = false;
        p.deathOrder = ++deathOrderCounter;
      }
    }
    if (msg.type === "game_started") {
      deathOrderCounter = 0;
      if (gotPlayerList) {
        // Rejoin — player_list already has correct alive/dead state, don't overwrite
        gotPlayerList = false;
        // Reconstruct death order for rejoin based on existing dead players
        let order = 0;
        knownPlayers.forEach((p) => {
          if (!p.isAlive) p.deathOrder = ++order;
        });
        deathOrderCounter = order;
      } else {
        // Fresh game start — everyone is alive
        knownPlayers = knownPlayers.map((p) => ({ ...p, isAlive: true, deathOrder: 0 }));
      }
    }
  }

  // ============================================================
  // SERVER MESSAGE HANDLER
  // ============================================================
  // Hold-and-replay gate lists (L5): one source of truth, three derived
  // gates. HOLD_GATE_PROMPTS is the shared base — the night-action /
  // spectator prompt types that must not dispatch while an overlay chain is
  // animating. A new prompt case added to the dispatch switch below MUST
  // also be added here (once), or the overlay chains will swallow it.
  // The three gates differ deliberately:
  //   suspense   — death beats only; the suspense overlay IS the death
  //                reveal, prompts pass through it. A prompt that must wait
  //                for the death reveal (e.g. a death-triggered revenge
  //                prompt arriving mid dawn-suspense) needs its own entry in
  //                SUSPENSE_GATE_TYPES; adding it to HOLD_GATE_PROMPTS alone
  //                does NOT cover the suspense window.
  //   transition — prompts + sound_cue (narration waits for the overlay)
  //   narration  — prompts only (sound_cue IS the narration playing)
  const HOLD_GATE_PROMPTS = [
    "mafia_targets",
    "doctor_targets",
    "detective_targets",
    "vigilante_targets",
    "joker_haunt_targets",
    "hunter_revenge_pending",
    "hunter_revenge_targets",
    "spectator_joker_deliberating",
    "spectator_joker_resolved",
  ];
  // hunter_revenge_targets is the death-triggered revenge prompt the advisory
  // above anticipates: it must also ride the suspense queue so it replays
  // AFTER the death reveal (and after the chain-ending applyPhaseChange that
  // would otherwise hide the just-rendered prompt). hunter_revenge_pending
  // (the room-wide reveal + wait view, C5b) rides the same death-triggered
  // flow and gets the identical treatment: the reveal must not render before
  // the queued death beats replay, and applyPhaseChange's hide-all would
  // stomp a wait view rendered mid-chain.
  const SUSPENSE_GATE_TYPES = new Set(["player_died", "you_died", "joker_win_overlay", "hunter_revenge_pending", "hunter_revenge_targets"]);
  const TRANSITION_GATE_TYPES = new Set(["sound_cue", ...HOLD_GATE_PROMPTS]);
  const NARRATION_GATE_TYPES = new Set(HOLD_GATE_PROMPTS);
  // Test handle: tests pin the exact membership of the derived gate lists.
  // Not read by any app code.
  window.__holdGateLists = Object.freeze({
    suspense: Object.freeze([...SUSPENSE_GATE_TYPES]),
    transition: Object.freeze([...TRANSITION_GATE_TYPES]),
    narration: Object.freeze([...NARRATION_GATE_TYPES]),
  });

  // N-D1 / Figma 74:335 + 130:243: every night frame that has no panel of its
  // own shows one neutral status line. It must be gated on "no night panel is
  // up", NOT on role — otherwise a doctor whose sub-phase already closed
  // (the <role>_close teardown) would sit on a blank screen while citizens saw
  // the line, which is itself a tell. Wrapping the dispatcher keeps it in sync
  // after EVERY message, including dispatchServerMessage's early-return gate
  // paths (suspense queue, game_over hold, nightfall trigger).
  function handleServerMessage(msg) {
    try {
      dispatchServerMessage(msg);
    } finally {
      updateNightIdle();
      // G1: keep the game-header code chip in sync with whatever set gameCode
      // (create / join / rejoin / leave) without hunting every assignment site.
      const chip = $("game-room-code");
      if (chip) {
        chip.textContent = gameCode || "";
        chip.parentElement.classList.toggle("hidden", !gameCode);
      }
    }
  }

  function updateNightIdle() {
    const el = $("night-idle");
    if (!el) return;
    const anyPanelUp =
      !$("night-actions").classList.contains("hidden") ||
      !$("awaiting-ready").classList.contains("hidden") ||
      !$("revenge-wait").classList.contains("hidden") ||
      !$("dead-overlay").classList.contains("hidden");
    el.classList.toggle("hidden", !(currentPhase === "night" && !anyPanelUp));
  }

  function dispatchServerMessage(msg) {
    // During suspense, queue the death beats
    if (suspenseActive && SUSPENSE_GATE_TYPES.has(msg.type)) {
      suspenseQueue.push(msg);
      return;
    }
    // While a death/heartbreak/night overlay chain is animating, hold game_over
    // so its reveal doesn't stomp the in-flight beats; it replays after the
    // chain's final callback (applyPhaseChange) via flushPendingGameOver (L5)
    if ((suspenseActive || executionTransitionActive || heartbreakTransitionActive || nightTransitionActive) && msg.type === "game_over") {
      pendingGameOver = msg;
      return;
    }
    // Bug 2: on the FIRST night the night phase_change landed at start_game
    // (previousPhase reset to null), so handlePhaseChange never ran the shared
    // NIGHTFALL overlay. Trigger it off the opening "night" sound cue instead,
    // so the mafia kill screen (and every role prompt) is gated behind the
    // transition. applyPhaseChange already ran on the first night, so the
    // callback is a no-op; the night tone is re-dispatched through the queue so
    // it still plays after the overlay. Must run BEFORE the queue gate below or
    // the cue would be swallowed before it could trigger.
    if (msg.type === "sound_cue" && msg.sound === "night" && currentPhase === "night" && !nightTransitionActive) {
      const round = parseInt($("round-number").textContent) || 0;
      if (nightTransitionRound !== round) {
        nightTransitionRound = round;
        nightTransitionQueue.push(msg); // replay the night tone after the overlay
        showNightTransition(() => {});
        return;
      }
    }
    // During night/execution transition, queue sound_cues and night action prompts
    if ((nightTransitionActive || executionTransitionActive) && TRANSITION_GATE_TYPES.has(msg.type)) {
      nightTransitionQueue.push(msg);
      return;
    }
    // During night narration (sounds playing after overlay), hold night prompts until narration finishes
    if (nightNarrationActive && NARRATION_GATE_TYPES.has(msg.type)) {
      nightNarrationQueue.push(msg);
      return;
    }

    switch (msg.type) {
      case "error":
        showError(msg.messageRef ? tMsg(msg.messageRef) : msg.message);
        // Clear stored game code if game not found (auto-rejoin failed)
        if (msg.message === "Game not found") {
          localStorage.removeItem("mafia_game_code");
        }
        break;

      case "registered":
      case "logged_in":
        userId = msg.userId;
        username = msg.username;
        hideMafiaTag = !!msg.hide_mafia_tag;
        myPlayerColor = nearestPlayerColor(msg.player_color) || null;
        if (msg.type === "registered") {
          const passcode = $("auth-passcode").value;
          localStorage.setItem("mafia_user", JSON.stringify({ username: msg.username, passcode }));
        }
        $("menu-username").textContent = username;
        $("toggle-hide-mafia-tag").checked = hideMafiaTag;
        showScreen("menu");
        clearErrors();
        // Auto-rejoin if we have a stored game code
        {
          const storedCode = localStorage.getItem("mafia_game_code");
          if (storedCode) {
            wsSend({ type: "join_game", code: storedCode });
          }
        }
        break;

      case "game_created":
        gameCode = msg.code;
        isAdmin = true;
        soundEnabled = true; // Admin (moderator) gets sound on by default
        localStorage.setItem("mafia_game_code", gameCode);
        $("lobby-code").textContent = gameCode;
        showScreen("lobbyAdmin");
        break;

      case "game_joined":
        gameCode = msg.code;
        isAdmin = msg.isAdmin;
        if (isAdmin) soundEnabled = true; // Admin (moderator) gets sound on by default
        localStorage.setItem("mafia_game_code", gameCode);
        if (isAdmin) {
          $("lobby-code").textContent = gameCode;
          showScreen("lobbyAdmin");
        } else {
          $("lobby-code-player").textContent = gameCode;
          showScreen("lobbyPlayer");
        }
        break;

      case "lobby_update":
        updateLobby(msg);
        break;

      case "settings_updated":
        updateSettingsUI(msg.settings);
        break;

      case "game_sync":
        handleGameSync(msg);
        break;

      case "game_started":
        myRole = msg.role;
        myIsGodfather = !!msg.isGodfather;
        vigilanteBulletUsed = false; // fresh game: bullet unused
        isLover = msg.isLover;
        myVariant = msg.variant || 0;
        mafiaTeam = msg.mafiaTeam || [];
        godfatherName = msg.godfatherName || null;
        currentRoster = msg.roster || null;
        isDead = false;
        jokerWonOverlayShown = false;
        // Fresh game start — reset all state
        hasVoted = false;
        dayVoteCount = 0;
        pendingAccusations = [];
        accusationsMade = [];
        secondsMade = [];
        narratorTranscript = [];
        detectiveHistory = [];
        nightActionLocked = false;
        deadActionActive = false;
        mafiaConfirmTarget = null;
        myMafiaVotes = [];
        mafiaObjectedTargets = {};
        aliveMafiaCount = 0;
        lastVoterTargets = {};
        mafiaTargetPlayers = [];
        lastGameEvents = [];
        lastVoteResult = null;
        jokerJointWinner = false;
        previousPhase = null;
        nightTransitionRound = 0; // Bug 2: re-arm the first-night NIGHTFALL trigger
        pendingGameOver = null; // discard any game_over held by a still-animating chain (L5)
        // Fresh game: re-roll the "random" narrator and re-preload so this
        // game's cues all use the newly chosen voice (no-op for a real accent).
        if (currentAccent === "random") {
          resolvedAccent = null;
          preloadNarrationAudio();
        }
        stopDayTimer();
        showScreen("game");
        updateRoleCard();
        // Card starts face-down
        resetCardPeel();
        setCardBack(false);
        $("narrator-messages").innerHTML = "";
        clearDetectiveResult();
        $("event-history-list").innerHTML = "";
        $("dead-overlay").classList.add("hidden");
        $("joker-win-overlay").classList.add("hidden"); // D6: own element now
        $("dead-dismiss-hint").classList.add("hidden");
        $("revenge-wait").classList.add("hidden"); // C5b: restart while gated
        // Show players tab from game start
        resetEventHistoryTabs("players");
        $("event-history").classList.remove("hidden");
        updatePlayerStatus();
        // Show "Check your role card!" (all players); admin will also get awaiting_ready
        $("awaiting-ready").classList.remove("hidden");
        $("awaiting-ready-msg").textContent = t("ui.game.checkRoleCard");
        $("btn-begin-night").classList.add("hidden");
        break;

      case "awaiting_ready":
        // Admin receives this — show "Begin Night" button
        $("btn-begin-night").classList.remove("hidden");
        $("awaiting-ready").classList.remove("hidden");
        break;

      case "phase_change":
        handlePhaseChange(msg);
        break;

      case "sound_cue":
        // Hide awaiting-ready when night narration actually starts
        $("awaiting-ready").classList.add("hidden");
        $("btn-begin-night").classList.add("hidden");
        // Bug fix: the server broadcasts "<role>_close" to EVERY client when a
        // sub-phase ends, but only mafia/doctor/detective/vigilante ever emit
        // one (joker haunt / hunter revenge have no close cue — their teardown
        // is the deferred phase_change). When it's OUR role's own close cue,
        // revert to the neutral night view so the finished action doesn't sit
        // on screen (shoulder-surf risk) for the rest of the night.
        if (CLOSEABLE_NIGHT_ROLES.has(myRole) && msg.sound === myRole + "_close") {
          $("night-actions").classList.add("hidden");
          hideSlideConfirm(); // defensive: mid-selection force-advance race
          clearNightGate();
          if (myRole === "mafia") {
            $("mafia-vote-status").classList.add("hidden");
            $("mafia-vote-details").innerHTML = "";
          }
        }
        queueSound(msg.sound);
        break;

      case "mafia_targets":
        showNightAction(t("ui.night.chooseVictim"), msg.players, "mafia_vote");
        break;

      case "doctor_targets":
        showNightAction(t("ui.night.chooseProtect"), msg.players, "doctor_save", msg.lastDoctorTarget);
        break;

      case "detective_targets":
        showNightAction(t("ui.night.chooseInvestigate"), msg.players, "detective_investigate");
        break;

      case "vigilante_targets":
        vigilanteBulletUsed = msg.bulletUsed;
        updateBulletIndicator();
        showNightAction(t("ui.night.chooseShoot"), msg.players, "vigilante_shoot");
        break;

      case "joker_haunt_targets":
        deadActionActive = true;
        showNightAction(t("ui.night.chooseHaunt"), msg.players, "joker_haunt");
        break;

      case "hunter_revenge_pending":
        // C5b: the room-wide wait view — the public Hunter reveal plus a
        // "waiting" status for everyone (panels are otherwise idle because
        // the phase transition is deferred while the gate is open). On the
        // hunter's own client this arrives just before hunter_revenge_targets,
        // whose case below replaces the wait view with the prompt.
        showRevengeWait(msg.hunterName);
        break;

      case "hunter_revenge_targets":
        // The hunter is dead by definition here — the flag must be set
        // before showNightAction's dead-guard runs (joker-haunt machinery).
        deadActionActive = true;
        // The hunter's own you_died overlay must not sit on top of the
        // revenge prompt (same idea as the jokerWonOverlayShown skip below).
        $("dead-overlay").classList.add("hidden");
        $("dead-dismiss-hint").classList.add("hidden");
        // The room-wide wait view (hunter_revenge_pending arrived just
        // before this) gives way to the hunter's own prompt (C5b).
        $("revenge-wait").classList.add("hidden");
        showNightAction(t("ui.night.takeRevenge"), msg.players, "hunter_revenge");
        break;

      case "joker_win_overlay":
        jokerWonOverlayShown = true;
        showJokerWinOverlay(msg.jokerName);
        break;

      case "mafia_vote_update":
        updateMafiaVoteStatus(msg);
        break;

      case "mafia_confirm_ready":
        handleMafiaConfirmReady(msg);
        break;

      case "night_action_done":
        $("action-status").textContent = msg.messageRef ? tMsg(msg.messageRef) : msg.message;
        // If mafia and consensus was reached, collapse target list.
        // Rejoined mafia have empty myMafiaVotes; fall back to the confirm
        // target restored by mafia_confirm_ready after game_sync.
        if (myRole === "mafia" && !nightActionLocked) {
          const lockVote = myMafiaVotes.find(v => v.voteType === "lock");
          if (lockVote || mafiaConfirmTarget) {
            nightActionLocked = true;
            hideSlideConfirm();
            const lockTarget = lockVote && mafiaTargetPlayers.find(p => p.id === lockVote.targetId);
            const targetName = lockTarget ? lockTarget.username : (mafiaConfirmTarget || t("ui.night.fallbackTarget"));
            $("action-targets").innerHTML = `<li class="selected">${escapeHtml(targetName)} \u2714</li>`;
          }
        }
        break;

      case "spectator_mafia_update":
        if (isDead && !deadActionActive) showSpectatorMafiaPanel(msg);
        break;

      case "spectator_kill_confirmed":
        if (isDead && !deadActionActive) showSpectatorKillResult(msg);
        break;

      case "spectator_night_phase":
        if (isDead && !deadActionActive) showSpectatorNightPhase(msg);
        break;

      case "spectator_night_complete":
        if (isDead && !deadActionActive) appendSpectatorLog(msg);
        break;

      case "spectator_joker_deliberating":
        if (isDead && !deadActionActive) showJokerDeliberating();
        break;

      case "spectator_joker_resolved":
        if (isDead && !deadActionActive) showJokerResolved(msg.targetName);
        break;

      case "detective_result":
        showDetectiveResult(msg);
        break;

      case "vote_called":
        dayVoteCount++;
        handleVoteCalled(msg);
        break;

      case "vote_update":
        updateVoteProgress(msg);
        break;

      case "vote_result":
        handleVoteResult(msg);
        break;

      case "accusations_update":
        handleAccusationsUpdate(msg);
        break;

      case "player_died":
        // No public per-death narration: the whole night batch is announced
        // as ONE cause-neutral line via phase_change.messages (and the dawn
        // verdict beat). Re-narrating each death here would replay the kills
        // one-by-one and re-introduce an order/cause tell. The roster "mark
        // dead" + death-order tracking happen in the early interceptor above.
        break;

      case "you_died":
        isDead = true;
        setCardBack(true);
        // If joker win overlay is already showing, skip the death overlay
        if (!jokerWonOverlayShown) {
          $("dead-overlay").classList.remove("hidden");
          // Pixel art skull, or heartbreak art on the dead player's OWN screen
          // when they died of heartbreak (owner ruling: heartbreak is public).
          $("dead-emoji").innerHTML = pixelArtToSvg(msg.isLoverDeath ? HEARTBREAK_ART : CARD_BACK_DEAD_ART);
          // N-D11 (Figma 254:865): the heartbreak overlay gets its own headline
          // pair alongside the art swap. Still cause-GENERIC for every other
          // death — heartbreak is public by owner ruling
          // (src/game-engine.ts:1271-1273) and names nobody, so this is the one
          // variant that may differ. The message line stays msg.message, the
          // server's neutral pool, untouched.
          $("dead-pre").textContent = t(msg.isLoverDeath ? "ui.dead.youDiedOf" : "ui.dead.youAre");
          $("dead-text").textContent = t(msg.isLoverDeath ? "ui.dead.heartbreak" : "ui.dead.dead");
          $("death-message").textContent = msg.messageRef ? tMsg(msg.messageRef) : msg.message;
          $("dead-dismiss-hint").classList.remove("hidden");
        }
        // Dying mid-day (e.g. a Hunter's revenge shot) must drop the accuse
        // affordances immediately — the read-only spectator view takes over
        // without waiting for the next accusations_update.
        renderAccusePanel();
        break;

      case "game_over":
        handleGameOver(msg);
        break;

      case "room_closed":
        localStorage.removeItem("mafia_game_code");
        gameCode = null;
        isAdmin = false;
        pendingGameOver = null; // discard any game_over held by a still-animating chain (L5)
        $("revenge-wait").classList.add("hidden"); // C5b: return-to-lobby while gated
        $("narrator-messages").innerHTML = "";
        $("role-reveal").innerHTML = "";
        $("event-history-list").innerHTML = "";
        narratorTranscript = [];
        resetEventHistoryTabs();
        closeSettingsModal();
        showScreen("menu");
        break;

      case "player_prefs":
        hideMafiaTag = !!msg.hide_mafia_tag;
        myPlayerColor = nearestPlayerColor(msg.player_color);
        $("toggle-hide-mafia-tag").checked = hideMafiaTag;
        updatePlayerStatus();
        break;

      default:
        // D9: unknown message type — surface frames the client silently ignores
        console.warn("[mafia] unknown server message type:", msg.type, msg);
        break;
    }
  }

  // ============================================================
  // GAME SYNC (atomic rejoin handler)
  // ============================================================
  function handleGameSync(msg) {
    // 1. Set identity state
    gameCode = msg.code;
    // isAdmin already set by game_joined

    // 2. Set player list
    knownPlayers = msg.players;

    // 3. Set role
    myRole = msg.role;
    myIsGodfather = !!msg.isGodfather;
    vigilanteBulletUsed = !!msg.vigilanteBulletUsed; // restore spent-bullet indicator before the card renders
    isLover = msg.isLover;
    myVariant = msg.variant;
    mafiaTeam = msg.mafiaTeam || [];
    godfatherName = msg.godfatherName || null;
    currentRoster = msg.roster || null;
    isDead = msg.isDead;

    // 4. Set phase
    currentPhase = msg.phase;
    previousPhase = msg.phase;

    // 4b. Restore hide_mafia_tag preference
    if (msg.hide_mafia_tag !== undefined) {
      hideMafiaTag = msg.hide_mafia_tag;
      $("toggle-hide-mafia-tag").checked = hideMafiaTag;
    }

    // 5. Restore accumulated state
    if (msg.narratorGender) setGender(msg.narratorGender);
    if (msg.narrationAccent) {
      setAccent(msg.narrationAccent);
      renderGenderToggle();
      preloadNarrationAudio();
    }
    dayVoteCount = msg.dayVoteCount;
    pendingAccusations = msg.accusations || [];
    accusationsMade = msg.accusationsMade || [];
    secondsMade = msg.secondsMade || [];
    // Rejoin restores the transcript. `narratorHistoryRefs` is the additive
    // parallel array; where an entry has a ref, keep the REF (so a language
    // switch can re-render it) and otherwise keep the rendered string.
    narratorTranscript = (msg.narratorHistory || []).map((text, i) => {
      const ref = msg.narratorHistoryRefs && msg.narratorHistoryRefs[i];
      return ref || text;
    });
    detectiveHistory = msg.detectiveHistory || [];
    hasVoted = false;
    nightActionLocked = false;
    deadActionActive = false;
    mafiaConfirmTarget = null;
    myMafiaVotes = [];
    mafiaObjectedTargets = {};
    aliveMafiaCount = 0;
    lastVoterTargets = {};
    mafiaTargetPlayers = [];
    lastVoteResult = null;
    lastGameEvents = msg.eventHistory || [];

    // 6. Render event history
    if (msg.eventHistory && msg.eventHistory.length > 0) {
      renderEventHistory(msg.eventHistory);
    }

    // 7. Handle game over
    if (msg.gameOver) {
      handleGameOver({
        type: "game_over",
        winner: msg.gameOver.winner,
        message: msg.gameOver.message,
        forceEnded: msg.gameOver.forceEnded,
        players: msg.gameOver.revealPlayers,
        jokerJointWinner: msg.gameOver.jokerJointWinner,
      });
      return;
    }

    // 8. Show game screen with role card (face-down by default, like fresh start)
    showScreen("game");
    // D2: rejoin must restore phase ambience — handleGameSync does NOT route
    // through applyPhaseChange, so set data-phase here (showScreen cleared it).
    document.body.setAttribute("data-phase", msg.phase);
    // Re-sync the pinned base + chrome for the rejoined phase ambience.
    applyEffectiveTheme();
    updateRoleCard();
    resetCardPeel();
    setCardBack(isDead);
    $("dead-dismiss-hint").classList.add("hidden");
    $("round-number").textContent = msg.round;

    // Phase indicator (D3b: pixel moon/sun art)
    renderPhaseIndicator(msg.phase);

    // 9. Hide all action panels
    $("night-actions").classList.add("hidden");
    $("btn-decline-revenge").classList.add("hidden");
    $("btn-vigilante-pass").classList.add("hidden");
    clearNightGate();
    // C5b: gate-closed baseline (E10d — rejoin after resolution must leave
    // no stale wait view); the pendingRevenge branch below re-shows it.
    $("revenge-wait").classList.add("hidden");
    $("mafia-vote-status").classList.add("hidden");
    $("voting-panel").classList.add("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("admin-night-controls").classList.add("hidden");
    $("day-accuse-controls").classList.add("hidden");
    $("awaiting-ready").classList.add("hidden");
    $("btn-begin-night").classList.add("hidden");

    // 9b. Show awaiting-ready if game is waiting for narrator
    if (msg.awaitingNarratorReady) {
      $("awaiting-ready").classList.remove("hidden");
      $("awaiting-ready-msg").textContent = t("ui.game.checkRoleCard");
      // awaiting_ready message will arrive separately for admin to show button
    }

    // 10. Show most recent narrator message
    renderNarratorArea();

    // 11. Phase-specific setup
    if (msg.phase === "day") {
      if (msg.dayStartedAt) {
        startDayTimer(msg.dayStartedAt);
      } else {
        startDayTimer();
      }
      if (isAdmin) {
        showAdminDayControls();
        setTimeout(() => populateAdminTargets(knownPlayers), 100);
      }
      renderAccusePanel();
    }

    if (msg.phase === "night" || msg.phase === "game_over") {
      stopDayTimer();
    }

    if (msg.phase === "night") {
      if (isAdmin) {
        $("admin-night-controls").classList.remove("hidden");
      }
      // Night action
      if (msg.nightAction) {
        const na = msg.nightAction;
        // Restore spectator log from game_sync
        if (na.isSpectatorView && na.spectatorLog && na.spectatorLog.length > 0) {
          spectatorNightLog = [];
          $("spectator-night-log").innerHTML = "";
          for (const entry of na.spectatorLog) {
            appendSpectatorLog(entry);
          }
        }
        // Restore joker deliberating/resolved status for spectators on rejoin
        if (na.isSpectatorView && na.jokerDeliberating) {
          showJokerDeliberating();
        } else if (na.isSpectatorView && na.jokerResolvedTarget) {
          showJokerResolved(na.jokerResolvedTarget);
        }
        if (na.jokerHauntPending) {
          // Dead joker with active haunt — show haunt view, not spectator view
          deadActionActive = true;
          if (na.locked && na.targetName) {
            // Already chose — show confirmed state
            const panel = $("night-actions");
            panel.classList.remove("hidden");
            $("action-title").textContent = t("ui.night.hauntTarget");
            $("action-targets").innerHTML = `<li class="selected">${escapeHtml(na.targetName)} \u2714</li>`;
            hideSlideConfirm();
            $("action-status").textContent = t("act.jokerHaunted");
            nightActionLocked = true;
          }
          // If not locked, targets are sent separately via joker_haunt_targets
        } else if (na.isSpectatorView && na.spectatorSubPhase) {
          // Dead player spectator view for doctor/detective/resolving sub-phases
          showSpectatorNightPhase({
            subPhase: na.spectatorSubPhase,
            isRoleAlive: na.spectatorSubPhaseAlive,
          });
        } else if (na.isSpectatorView) {
          // Dead player spectator view for mafia sub-phase
          showSpectatorMafiaPanel({
            voterTargets: na.voterTargets,
            lockedTarget: na.lockedTarget,
            objectedTargets: na.objectedTargets,
            aliveMafiaCount: na.aliveMafiaCount,
            targets: na.targets,
          });
        } else if (na.locked && na.targetName) {
          // Show locked-in action
          const panel = $("night-actions");
          panel.classList.remove("hidden");
          const roleLabelKey = myRole === "mafia" ? "ui.night.roleTarget" : myRole === "doctor" ? "ui.night.roleProtecting" : myRole === "vigilante" ? "ui.night.roleShooting" : "ui.night.roleInvestigating";
          $("action-title").textContent = t(roleLabelKey);
          $("action-targets").innerHTML = `<li class="selected">${escapeHtml(na.targetName)} \u2714</li>`;
          hideSlideConfirm();
          $("action-status").textContent = t("ui.night.actionConfirmed");
          nightActionLocked = true;
          if (myRole === "mafia") {
            $("mafia-vote-status").classList.remove("hidden");
            // H4: locked during the mafia sub-phase means consensus was
            // reached but the kill is NOT yet confirmed — the server
            // re-sends mafia_confirm_ready right after game_sync. Leave
            // the action unlocked so handleMafiaConfirmReady can restore
            // the confirm/cancel buttons.
            if (msg.nightSubPhase === "mafia") {
              nightActionLocked = false;
            }
          }
        } else if (na.targets.length > 0) {
          // Show target selection
          const actionType = myRole === "mafia" ? "mafia_vote"
            : myRole === "doctor" ? "doctor_save"
            : myRole === "joker" ? "joker_haunt"
            : myRole === "vigilante" ? "vigilante_shoot"
            : "detective_investigate";
          const title = t(myRole === "mafia" ? "ui.night.chooseVictim"
            : myRole === "doctor" ? "ui.night.chooseProtect"
            : myRole === "joker" ? "ui.night.chooseHaunt"
            : myRole === "vigilante" ? "ui.night.chooseShoot"
            : "ui.night.chooseInvestigate");
          showNightAction(title, na.targets, actionType, myRole === "doctor" ? na.lastDoctorTarget : undefined);

          // Restore mafia vote status
          if (myRole === "mafia" && Object.keys(na.voterTargets).length > 0) {
            updateMafiaVoteStatus({ voterTargets: na.voterTargets, lockedTarget: na.lockedTarget, objectedTargets: na.objectedTargets || {}, aliveMafiaCount: na.aliveMafiaCount || 0 });
          }
        }
      }
    }

    if (msg.phase === "voting" && msg.voteState) {
      const vs = msg.voteState;
      hasVoted = vs.hasVoted;
      handleVoteCalled({
        targetName: vs.targetName,
        targetId: vs.targetId,
        sleep: vs.sleep,
      }, vs.hasVoted);
      updateVoteProgress({
        totalVotes: vs.totalVotes,
        total: vs.total,
      });
    }

    // C5b: revenge-gate restore. pendingRevenge is the ONLY gate signal —
    // never inferred from phase/subPhase (the gated game looks like an idle
    // night or a cleared vote). Non-hunter: render the wait view (+ the skip
    // control if admin). Hunter (isYou): render nothing here — the server
    // re-sends hunter_revenge_targets right after game_sync and that case
    // takes over (the jokerHauntPending treatment: the target list never
    // rides game_sync).
    if (msg.pendingRevenge && !msg.pendingRevenge.isYou) {
      showRevengeWait(msg.pendingRevenge.hunterName);
    }

    // Show event history (always visible during game)
    $("event-history").classList.remove("hidden");
    updatePlayerStatus();

    // 12. Dead player state (card back only — overlay only shows on real-time you_died)
    if (isDead) {
      setCardBack(true);
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  $("btn-register").addEventListener("click", () => {
    const u = $("auth-username").value.trim();
    const p = $("auth-passcode").value.trim();
    if (!u) return showAuthError(t("ui.auth.enterUsername"));
    if (!/^\d{4}$/.test(p)) return showAuthError(t("ui.auth.pinFourDigits"));
    wsSend({ type: "register", username: u, passcode: p });
  });

  $("btn-login").addEventListener("click", () => {
    const u = $("auth-username").value.trim();
    const p = $("auth-passcode").value.trim();
    if (!u || !p) return showAuthError(t("ui.auth.enterBoth"));
    wsSend({ type: "login", username: u, passcode: p });
    localStorage.setItem("mafia_user", JSON.stringify({ username: u, passcode: p }));
  });

  $("btn-logout").addEventListener("click", () => {
    localStorage.removeItem("mafia_user");
    localStorage.removeItem("mafia_game_code");
    userId = null;
    username = null;
    gameCode = null;
    isAdmin = false;
    showScreen("auth");
  });

  function showAuthError(msg) {
    $("auth-error").textContent = msg;
  }

  // ============================================================
  // MENU
  // ============================================================
  $("btn-host").addEventListener("click", () => {
    wsSend({ type: "create_game" });
  });

  // F3 (Figma 42:766 -> 287:3259): the Join CTA is disabled/grey until the code
  // field holds a valid code, then flips to the orange primary fill. "Valid" is
  // a purely CLIENT-SIDE 4-character length check (GM-11 default) — no probe is
  // sent to the server, so this costs zero wire traffic. Server-side rejections
  // ("Game not found" src/server.ts:1142, "Cannot join: game full or already
  // started" :1205) still land in #menu-error exactly as before.
  function syncJoinEnabled() {
    const code = $("join-code").value.trim();
    $("btn-join").disabled = code.length !== 4;
  }
  $("join-code").addEventListener("input", syncJoinEnabled);
  syncJoinEnabled();

  $("btn-join").addEventListener("click", () => {
    const code = $("join-code").value.trim().toUpperCase();
    // Defensive only — the disabled CTA makes this branch unreachable from the
    // UI. The string is kept so a programmatic click still reports the reason.
    if (code.length !== 4) return showError(t("ui.menu.badCode"));
    wsSend({ type: "join_game", code });
  });

  $("join-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-join").click();
  });

  // ============================================================
  // LOBBY
  // ============================================================
  $("btn-leave-admin").addEventListener("click", () => {
    wsSend({ type: "leave_game" });
    gameCode = null;
    isAdmin = false;
    localStorage.removeItem("mafia_game_code");
    showScreen("menu");
  });

  $("btn-leave-player").addEventListener("click", () => {
    wsSend({ type: "leave_game" });
    gameCode = null;
    localStorage.removeItem("mafia_game_code");
    showScreen("menu");
  });

  $("btn-start").addEventListener("click", () => {
    ensureAudioReady();
    wsSend({ type: "start_game" });
  });

  $("btn-begin-night").addEventListener("click", () => {
    ensureAudioReady();
    wsSend({ type: "narrator_ready" });
    $("awaiting-ready").classList.add("hidden");
    $("btn-begin-night").classList.add("hidden");
  });

  // Settings controls
  $("mafia-minus").addEventListener("click", () => {
    const current = parseInt($("mafia-count").textContent) || 1;
    if (current > 1) {
      $("mafia-count").textContent = current - 1;
      wsSend({ type: "update_settings", settings: { mafiaCount: current - 1 } });
    }
  });

  $("mafia-plus").addEventListener("click", () => {
    const current = parseInt($("mafia-count").textContent) || 1;
    if (current < 6) {
      $("mafia-count").textContent = current + 1;
      wsSend({ type: "update_settings", settings: { mafiaCount: current + 1 } });
    }
  });

  ["doctor", "detective", "joker", "hunter", "vigilante", "lovers", "godfather"].forEach((role) => {
    const key = role === "lovers" ? "enableLovers" : `enable${role.charAt(0).toUpperCase() + role.slice(1)}`;
    $(`toggle-${role}`).addEventListener("change", (e) => {
      wsSend({ type: "update_settings", settings: { [key]: e.target.checked } });
      // Show/hide mode sub-rows
      if (role === "doctor") {
        $("doctor-mode-row").classList.toggle("hidden", !e.target.checked);
      } else if (role === "joker") {
        $("joker-mode-row").classList.toggle("hidden", !e.target.checked);
      }
    });
  });

  // Rule mode tabs (Official vs House)
  function setupRuleTabs(containerId, settingKey, hints) {
    const container = $(containerId);
    container.querySelectorAll(".rule-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        container.querySelectorAll(".rule-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const mode = tab.dataset.mode;
        wsSend({ type: "update_settings", settings: { [settingKey]: mode } });
        const hintEl = container.nextElementSibling;
        if (hintEl && hints[mode]) hintEl.textContent = t(hints[mode]);
      });
    });
  }

  // Hint copy is keyed, so the tab handler re-renders it in the active language.
  setupRuleTabs("doctor-mode-tabs", "doctorMode", {
    house: "ui.hint.doctorHouse",
    official: "ui.hint.doctorOfficial",
  });

  setupRuleTabs("joker-mode-tabs", "jokerMode", {
    house: "ui.hint.jokerHouse",
    official: "ui.hint.jokerOfficial",
  });

  // Narrator-voice picker (custom expandable control; replaces the native
  // <select> whose long "label — description" options bled out of the panel).
  // The arrows cycle accents and fire the SAME update_settings wire call the
  // select fired; the server echo (updateSettingsUI) stays the only state writer.
  setupAccentPicker();
  // Male/Female narrator-gender toggle (host screen). Fires update_settings on
  // click; greyed/inert while the accent is "random" (gender is randomized).
  setupGenderToggle();

  function updateLobby(msg) {
    const { players, settings, adminName } = msg;

    // Feed the pre-game "Roles in Play" derivation (F6). lobby_update is the
    // only source — nothing role-identifying is stored.
    lobbySettings = settings;
    lobbyPlayerCount = players.length;

    // Figma 42:782 lines 80-90: name (+ a host marker) on the left, the
    // player's colour ellipse right-aligned on the row.
    const renderPlayerItem = (p) => {
      const colorDot = p.color ? `<span class="player-color-dot" style="background:${nearestPlayerColor(p.color)}"></span>` : '';
      const host = p.isAdmin ? ' <span class="admin-badge">HOST</span>' : "";
      return `<li><span class="player-row-name">${escapeHtml(p.username)}${host}</span>${colorDot}</li>`;
    };

    $("player-count-admin").textContent = players.length;
    $("players-list-admin").innerHTML = players.map(renderPlayerItem).join("");

    $("player-count-player").textContent = players.length;
    lobbyAdminName = adminName;
    renderWaitingText();
    $("players-list-player").innerHTML = players.map(renderPlayerItem).join("");

    updateSettingsUI(settings);
    updatePlayerLobbySettings(settings);
    renderColorPicker("color-picker-admin", players);
    renderColorPicker("color-picker-player", players);

    // If we're on the game or gameover screen, navigate to lobby
    const currentScreen = document.querySelector(".screen.active");
    if (currentScreen && (currentScreen.id === "screen-game" || currentScreen.id === "screen-gameover")) {
      showScreen(isAdmin ? "lobbyAdmin" : "lobbyPlayer");
      $("lobby-code").textContent = gameCode;
      $("lobby-code-player").textContent = gameCode;
    }
  }

  function updateSettingsUI(settings) {
    $("mafia-count").textContent = settings.mafiaCount;
    $("toggle-doctor").checked = settings.enableDoctor;
    $("toggle-detective").checked = settings.enableDetective;
    $("toggle-joker").checked = settings.enableJoker;
    $("toggle-hunter").checked = settings.enableHunter;
    $("toggle-vigilante").checked = settings.enableVigilante;
    $("toggle-lovers").checked = settings.enableLovers;
    $("toggle-godfather").checked = settings.enableGodfather;
    if (settings.narratorGender) setGender(settings.narratorGender);
    if (settings.narrationAccent) {
      setAccent(settings.narrationAccent);
      renderAccentPicker();
      renderGenderToggle();
      preloadNarrationAudio();
    } else {
      renderGenderToggle();
    }
    // Show/hide and sync mode sub-rows
    $("doctor-mode-row").classList.toggle("hidden", !settings.enableDoctor);
    $("joker-mode-row").classList.toggle("hidden", !settings.enableJoker);
    // Sync tab active state
    if (settings.doctorMode) {
      $("doctor-mode-tabs").querySelectorAll(".rule-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.mode === settings.doctorMode);
      });
      $("doctor-mode-hint").textContent = settings.doctorMode === "official"
        ? t("ui.hint.doctorOfficialLong")
        : t("ui.hint.doctorHouseLong");
    }
    if (settings.jokerMode) {
      $("joker-mode-tabs").querySelectorAll(".rule-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.mode === settings.jokerMode);
      });
      $("joker-mode-hint").textContent = settings.jokerMode === "official"
        ? t("ui.hint.jokerOfficial")
        : t("ui.hint.jokerHouse");
    }
  }

  // ============================================================
  // COLOR PICKER
  // ============================================================
  function renderColorPicker(containerId, players) {
    const container = $(containerId);
    if (!container) return;

    // Build lookup of color -> player names
    const colorOwners = {};
    for (const p of players) {
      if (p.color && p.id !== userId) {
        const c = nearestPlayerColor(p.color);
        if (!colorOwners[c]) colorOwners[c] = [];
        colorOwners[c].push(p.username);
      }
    }

    container.innerHTML = '<h4>' + escapeHtml(t("ui.lobby.chooseColor")) + '</h4>'; // Figma 42:782 line 132
    const grid = document.createElement("div");
    grid.className = "color-picker-grid";

    for (const color of PLAYER_COLORS) {
      const cell = document.createElement("div");
      cell.className = "color-picker-cell";

      const circle = document.createElement("div");
      circle.className = "color-circle";
      if (myPlayerColor === color) circle.classList.add("selected");
      if (colorOwners[color]) circle.classList.add("taken");
      circle.style.background = color;
      circle.addEventListener("click", () => {
        myPlayerColor = color;
        wsSend({ type: "update_player_pref", key: "player_color", value: color });
        // Update selection visually immediately
        container.querySelectorAll(".color-circle").forEach(c => c.classList.remove("selected"));
        circle.classList.add("selected");
      });
      cell.appendChild(circle);

      // Label showing who has this color
      const owners = colorOwners[color];
      if (owners) {
        const label = document.createElement("div");
        label.className = "color-circle-label";
        label.textContent = owners.length === 1 ? owners[0] : t("ui.lobby.colorTakenBy", { count: owners.length });
        label.title = owners.join(", ");
        cell.appendChild(label);
      }

      grid.appendChild(cell);
    }
    container.appendChild(grid);
  }

  // ============================================================
  // READ-ONLY SETTINGS DISPLAY (for non-admin player lobby)
  // ============================================================
  function updatePlayerLobbySettings(settings) {
    const container = $("player-lobby-settings");
    if (!container) return;

    const roles = [];
    const modeLabel = (mode) => t(mode === "official" ? "ui.mode.official" : "ui.mode.house");
    if (settings.enableDoctor) roles.push(t("ui.mode.labelled", { role: t("ui.role.doctor"), mode: modeLabel(settings.doctorMode) }));
    if (settings.enableDetective) roles.push(t("ui.role.detective"));
    if (settings.enableJoker) roles.push(t("ui.mode.labelled", { role: t("ui.role.joker"), mode: modeLabel(settings.jokerMode) }));
    if (settings.enableHunter) roles.push(t("ui.role.hunter"));
    if (settings.enableVigilante) roles.push(t("ui.role.vigilante"));
    if (settings.enableLovers) roles.push(t("ui.role.lovers"));
    if (settings.enableGodfather) roles.push(t("ui.role.godfather"));

    container.innerHTML = `
      <div class="lobby-settings-row">
        <span class="lobby-settings-label">${escapeHtml(t("ui.lobby.mafiaMembers"))}</span>
        <span class="lobby-settings-value">${settings.mafiaCount}</span>
      </div>
      <div class="lobby-settings-row">
        <span class="lobby-settings-label">${escapeHtml(t("ui.lobby.specialRoles"))}</span>
        <span class="lobby-settings-value">${escapeHtml(roles.length > 0 ? roles.join(", ") : t("ui.common.none"))}</span>
      </div>
    `;
  }

  // ============================================================
  // GAME
  // ============================================================
  let myVariant = 0;

  // Pixel art data loaded from pixel-art.js (window globals)

  // Membership Card display names, spec casing
  // (specs/components/77-528--membership-card.md TEXT nodes). pixel-art.js owns
  // ROLE_DESCRIPTIONS/ROLE_COLORS and is untouched, so the titles live here.
  // Keys, not labels: resolved at render time so a language switch repaints them.
  const ROLE_TITLE_KEYS = {
    citizen: "ui.role.citizen",
    mafia: "ui.role.mafia",
    doctor: "ui.role.doctor",
    detective: "ui.role.detective",
    joker: "ui.role.joker",
    hunter: "ui.role.hunter",
    vigilante: "ui.role.vigilante",
    godfather: "ui.role.godfather",
  };

  // Card back = spec "Role=Default" ("Your role is / ? / Peel to reveal") until
  // the player dies, at which point it becomes spec "Role=Dead"
  // ("You are / DEAD / Stay quiet and continue to watch the town").
  function setCardBack(dead) {
    $("card-back-art").innerHTML = pixelArtToSvg(dead ? CARD_BACK_DEAD_ART : CARD_BACK_ART);
    const back = document.querySelector("#role-card .card-back");
    if (!back) return;
    const eyebrow = back.querySelector(".role-eyebrow");
    const label = back.querySelector(".card-back-label");
    if (eyebrow) eyebrow.textContent = t(dead ? "ui.dead.youAre" : "ui.card.yourRoleIs");
    if (label) label.textContent = t(dead ? "ui.dead.dead" : "ui.card.peelToReveal");
    $("role-card").classList.toggle("dead", !!dead);
  }

  function updateRoleCard() {
    // Display-only role: the Godfather sees a distinct card but myRole stays
    // "mafia" so the mafia night-action UI keeps gating correctly.
    const displayRole = myIsGodfather ? "godfather" : myRole;
    const card = $("role-card");
    // `dead` is re-applied here because this assignment replaces the whole class
    // list and setCardBack() may have already set it (rejoin / game-sync order).
    card.className = `role-card ${ROLE_COLORS[displayRole] || ""}${isDead ? " dead" : ""}`;
    // Membership Card (specs/components/77-528--membership-card.md): the name is
    // set in the spec's own casing ("Doctor", not "DOCTOR") — the card face is
    // Grandstander Black 48px, which no longer needs all-caps to read as display.
    $("role-name").textContent = displayRole ? (ROLE_TITLE_KEYS[displayRole] ? t(ROLE_TITLE_KEYS[displayRole]) : displayRole) : "";
    $("role-description").textContent = ROLE_DESCRIPTIONS[displayRole] || "";
    // Chibi raster art region (spec RECTANGLE "image 1" 78x78) — the per-role
    // PNGs copied out of the Figma fills into /img/roles/.
    const imgEl = $("role-image");
    if (displayRole) {
      imgEl.innerHTML = `<img src="/img/roles/${displayRole}.png" alt="" draggable="false">`;
    } else {
      imgEl.innerHTML = "";
    }
    if (isLover) {
      $("lover-badge").classList.remove("hidden");
    } else {
      $("lover-badge").classList.add("hidden");
    }
    // Heart balloon for lovers
    if (isLover) {
      $("role-mini-balloon").classList.remove("hidden");
    } else {
      $("role-mini-balloon").classList.add("hidden");
    }
    updateBulletIndicator();
    fitRoleCardText();
    // Re-fit once the display font (Grandstander) is loaded — measuring the
    // single-line name against a fallback font under-reports its width and
    // leaves long names (GODFATHER/VIGILANTE/DETECTIVE) overflowing.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitRoleCardText());
  }

  // Force every role's membership card to the SAME fixed size (CSS gives the
  // card its fixed box): shrink the single-line role name to fit the card
  // width, and the description to fit the remaining height — only as far as
  // needed, so short cards keep the full font and only long ones (e.g. the
  // Vigilante) shrink. Re-runs on resize via the listener below.
  function fitRoleCardText(attempt) {
    attempt = attempt || 0;
    const front = document.querySelector("#role-card .card-front");
    const name = $("role-name");
    const desc = $("role-description");
    if (!front || !name || !desc) return;
    name.style.fontSize = "";
    desc.style.fontSize = "";
    // The card may not be laid out yet (screen hidden / fonts loading) — retry.
    if (front.clientHeight === 0) {
      if (attempt < 8) requestAnimationFrame(() => fitRoleCardText(attempt + 1));
      return;
    }
    // Name: keep it on ONE line — shrink from the spec's 48px until it fits.
    for (let s = 48; s > 20 && name.scrollWidth > name.clientWidth; s--) {
      name.style.fontSize = s + "px";
    }
    // Description: shrink from the spec's 12px until the front content fits.
    for (let s = 12; s > 8 && front.scrollHeight > front.clientHeight + 1; s--) {
      desc.style.fontSize = s + "px";
    }
  }
  window.addEventListener("resize", () => fitRoleCardText());

  // Vigilante-only one-shot indicator on the role card. Persistent across
  // day/death (the bullet count is a fact about the role, not the night).
  function updateBulletIndicator() {
    const el = $("bullet-indicator");
    if (!el) return;
    const status = $("bullet-status");
    if (myRole === "vigilante") {
      el.classList.remove("hidden");
      el.classList.toggle("spent", vigilanteBulletUsed);
      if (status) status.textContent = t(vigilanteBulletUsed ? "ui.card.bulletUsed" : "ui.card.oneBullet");
    } else {
      el.classList.add("hidden");
      el.classList.remove("spent");
    }
  }

  function resetCardPeel() {
    const card = $("role-card");
    const back = card.querySelector(".card-back");
    back.classList.remove("dragging");
    back.style.clipPath = "";
    back.style.opacity = "";
    const flap = card.querySelector(".peel-flap");
    flap.classList.remove("dragging");
    flap.style.clipPath = "";
    flap.style.opacity = "";
  }

  // ============================================================
  // CORNER-PEEL DRAG (poker-style card reveal)
  // ============================================================
  (function () {
    const card = $("role-card");
    const back = card.querySelector(".card-back");
    const flap = card.querySelector(".peel-flap");
    const GRAB_ZONE = 60; // px from bottom-right corner to start drag
    let dragging = false;
    let cardRect = null;

    function inGrabZone(clientX, clientY) {
      if (!cardRect) return false;
      const dx = cardRect.right - clientX;
      const dy = cardRect.bottom - clientY;
      return dx >= 0 && dx <= GRAB_ZONE && dy >= 0 && dy <= GRAB_ZONE;
    }

    // Reflect point C across the line through two endpoints E1,E2 (percent space).
    // Used to place the lifted corner P = mirror of C=(100,100) across the crease.
    // Returns [px,py]; degenerate (E1≈E2) returns C unchanged.
    function reflectAcrossLine(cx, cy, x1, y1, x2, y2) {
      const ex = x2 - x1, ey = y2 - y1;
      const denom = ex * ex + ey * ey;
      if (denom < 1e-9) return [cx, cy];
      const a = ex * ex - ey * ey;
      const b = 2 * ex * ey;
      const rx = cx - x1, ry = cy - y1;
      return [
        x1 + (a * rx + b * ry) / denom,
        y1 + (b * rx - a * ry) / denom,
      ];
    }

    function setPeel(clientX, clientY) {
      if (!cardRect) return;
      // Raw drag distance from the bottom-right corner (0..1 of card extent).
      // These are the SAME tracked quantities as before — only the RENDERING below
      // changes (translating-crease fold instead of D7's corner-pivot fold). No
      // gesture threshold reads these; release always snaps shut.
      const px = Math.max(0, Math.min(1, (cardRect.right - clientX) / cardRect.width));
      const py = Math.max(0, Math.min(1, (cardRect.bottom - clientY) / cardRect.height));
      flap.classList.add("dragging");
      // D7.5: ONE normalized progress t∈[0,1] drives the whole fold (pure function
      // of t → the close is just the reverse sweep). The diagonal pull is the single
      // clean driver (mixed-axis folds go ragged); reuse D7's pow(.85) resistance
      // curve, now reaching 1. pull along the diagonal: hypot(px,py)/SQRT2.
      const pull = Math.min(1, Math.hypot(px, py) / Math.SQRT2);
      const t = Math.pow(pull, 0.85);
      // t=0 guard: no fold — full-rect back + degenerate flap (matches D7's no-fold).
      // Clear any crossfade opacity left by a prior t>CAP frame: dragging back to the
      // corner without releasing must restore the OPAQUE full-rect back, else the
      // secret leaks through a transparent-but-full cover. (Mirrors the t<=CAP reset.)
      if (t < 0.005) {
        back.style.clipPath = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
        flap.style.clipPath = "polygon(100% 100%, 100% 100%, 100% 100%)";
        back.style.opacity = "";
        flap.style.opacity = "";
        return;
      }
      // TRANSLATING CREASE (docs/research/peel-full-card.md). s=t*2; s=1 is the old
      // anti-diagonal / 50% line. Crease endpoints walk the edges; P = reflection of
      // dragged corner C=(100,100) across the crease line through the two endpoints.
      const s = t * 2;
      // Crease endpoints: Bx,By on the lower/left walk, Rx,Ry on the right/top walk.
      let bx, by, rx, ry;
      if (s <= 1) {
        // Phase A: endpoints on the bottom (Bx:100→0) & right (Ry:100→0) edges
        // — reproduces D7's corner peek through t=0.5.
        bx = 100 - 100 * s; by = 100;
        rx = 100;           ry = 100 - 100 * s;
      } else {
        // Phase B: crease passed the anti-diagonal; endpoints climb the left
        // (By:100→0) & top (Rx:100→0) edges so the fold sweeps to the top-left
        // corner = 100% revealed.
        const u = s - 1; // 0..1
        bx = 0;             by = 100 - 100 * u;
        rx = 100 - 100 * u; ry = 0;
      }
      const P = reflectAcrossLine(100, 100, bx, by, rx, ry);
      const pxp = P[0], pyp = P[1];
      // FALLBACK (brief): near the far corner the geometric flap can read ragged /
      // invert. Cap the geometric peel at t≈0.9 and finish the last ~10% with an
      // opacity cross-fade of the card-back ("card lays open") — cheap, zero
      // geometry risk. Below the cap the flap is fully opaque (D7 behavior).
      const CAP = 0.9;
      if (t > CAP) {
        const k = (t - CAP) / (1 - CAP); // 0..1 across the final 10%
        back.style.opacity = String(1 - k);
        flap.style.opacity = String(1 - k);
      } else {
        back.style.opacity = "";
        flap.style.opacity = "";
      }
      // Visible card-back = card minus the swept corner region.
      // Flap = folded triangle (crease endpoints + reflected corner P).
      if (s <= 1) {
        back.style.clipPath =
          `polygon(0% 0%, 100% 0%, 100% ${ry}%, ${bx}% 100%, 0% 100%)`;
        flap.style.clipPath =
          `polygon(${bx}% 100%, 100% ${ry}%, ${pxp}% ${pyp}%)`;
      } else {
        // At exactly t=1 (s=2) both crease endpoints collapse to (0,0), so
        // reflectAcrossLine hits its degenerate guard and P snaps back to
        // (100,100) — the flap polygon degenerates to a sliver. Intentional and
        // harmless: t>CAP has already crossfaded flap.style.opacity to 0, so the
        // degenerate flap is invisible (the card-back's full reveal is what shows).
        back.style.clipPath =
          `polygon(0% 0%, ${rx}% 0%, 0% ${by}%)`;
        flap.style.clipPath =
          `polygon(0% ${by}%, ${rx}% 0%, ${pxp}% ${pyp}%)`;
      }
    }

    function resetPeel() {
      back.classList.remove("dragging");
      back.style.clipPath = "";
      back.style.opacity = "";
      flap.classList.remove("dragging");
      flap.style.clipPath = "";
      flap.style.opacity = "";
      dragging = false;
      cardRect = null;
    }

    function onStart(e) {
      const touch = e.touches ? e.touches[0] : e;
      cardRect = card.getBoundingClientRect();
      if (!inGrabZone(touch.clientX, touch.clientY)) return;
      e.preventDefault();
      dragging = true;
      back.classList.add("dragging");
      setPeel(touch.clientX, touch.clientY);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      setPeel(touch.clientX, touch.clientY);
    }

    function onEnd(e) {
      if (!dragging) return;
      e.preventDefault();
      resetPeel();
    }

    card.addEventListener("touchstart", onStart, { passive: false });
    card.addEventListener("touchmove", onMove, { passive: false });
    card.addEventListener("touchend", onEnd, { passive: false });
    card.addEventListener("mousedown", onStart);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  })();

  // ============================================================
  // SLIDE-TO-CONFIRM
  // ============================================================
  // ── Confirm / Cancel action buttons (replaced the slide-to-confirm) ──
  // The names setupSlideConfirm / hideSlideConfirm are kept so every call site
  // stays agnostic to the confirm mechanism; tests click the real buttons.
  let confirmCallback = null;
  let cancelCallback = null;

  // role → the Confirm button's verb (Cancel is always "Cancel").
  const ACTION_VERB_KEYS = { mafia: "ui.verb.kill", doctor: "ui.verb.save", detective: "ui.verb.investigate", joker_haunt: "ui.verb.haunt", hunter_revenge: "ui.verb.avenge", vigilante: "ui.verb.shoot" };

  // Arm the two-button group for `role`. onConfirm fires on Confirm; optional
  // onCancel fires on Cancel (deselect a target, or withdraw a mafia lock).
  function setupSlideConfirm(role, onConfirm, onCancel) {
    const container = $("action-confirm");
    container.className = "action-confirm role-" + role;
    container.classList.remove("hidden");
    $("btn-action-confirm").textContent = ACTION_VERB_KEYS[role] ? t(ACTION_VERB_KEYS[role]) : t("ui.common.confirm");
    confirmCallback = onConfirm || null;
    cancelCallback = onCancel || null;
  }

  function hideSlideConfirm() {
    $("action-confirm").classList.add("hidden");
    confirmCallback = null;
    cancelCallback = null;
  }

  // Wire the buttons once. Capture the armed callback, tear the group down,
  // THEN run it — so a callback that re-arms (e.g. a re-render) sticks.
  $("btn-action-confirm").addEventListener("click", () => {
    const cb = confirmCallback;
    hideSlideConfirm();
    if (cb) cb();
  });
  $("btn-action-cancel").addEventListener("click", () => {
    const cb = cancelCallback;
    hideSlideConfirm();
    if (cb) cb();
  });

  // ============================================================
  // PULL-TO-REFRESH (works on game screen and menu screen)
  // ============================================================
  (function () {
    const THRESHOLD = 60;
    const MAX_PULL = 80;
    let pulling = false;
    let startY = 0;
    let pullDist = 0;
    let refreshing = false;
    let activeIndicator = null;
    let activeSpinner = null;

    function getActiveElements() {
      if (screens.game.classList.contains("active")) {
        return { indicator: $("pull-refresh"), spinner: $("pull-refresh-spinner") };
      }
      if (screens.menu.classList.contains("active")) {
        return { indicator: $("pull-refresh-menu"), spinner: $("pull-refresh-spinner-menu") };
      }
      return null;
    }

    function onStart(e) {
      if (refreshing || window.scrollY > 0) return;
      const elements = getActiveElements();
      if (!elements) return;
      activeIndicator = elements.indicator;
      activeSpinner = elements.spinner;
      const touch = e.touches ? e.touches[0] : e;
      startY = touch.clientY;
      pulling = true;
      pullDist = 0;
    }

    function onMove(e) {
      if (!pulling || !activeIndicator) return;
      const touch = e.touches ? e.touches[0] : e;
      const dy = touch.clientY - startY;
      if (dy <= 0) {
        pullDist = 0;
        activeIndicator.style.height = "0px";
        return;
      }
      e.preventDefault();
      pullDist = Math.min(dy, MAX_PULL);
      activeIndicator.style.height = pullDist + "px";
      activeSpinner.style.transform = "rotate(" + (pullDist * 4) + "deg)";
      if (pullDist >= THRESHOLD) {
        activeIndicator.classList.add("ready");
      } else {
        activeIndicator.classList.remove("ready");
      }
    }

    function onEnd() {
      if (!pulling || !activeIndicator) return;
      pulling = false;
      const ind = activeIndicator;
      const spn = activeSpinner;

      if (pullDist >= THRESHOLD) {
        refreshing = true;
        ind.classList.remove("ready");
        ind.classList.add("refreshing");
        ind.style.height = "40px";
        spn.style.transform = "";
        if (ws) ws.close();
        setTimeout(function () {
          ind.classList.remove("refreshing");
          ind.style.height = "0px";
          refreshing = false;
        }, 1500);
      } else {
        ind.classList.remove("ready");
        ind.style.height = "0px";
        spn.style.transform = "";
      }
      pullDist = 0;
      activeIndicator = null;
      activeSpinner = null;
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
  })();

  // ============================================================
  // DAY TIMER
  // ============================================================
  function startDayTimer(fromTimestamp) {
    if (dayTimerInterval) return;
    dayTimerStart = fromTimestamp || Date.now();
    $("day-timer").classList.remove("hidden");
    $("day-timer").textContent = "00:00";
    dayTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - dayTimerStart) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      $("day-timer").textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopDayTimer() {
    if (dayTimerInterval) {
      clearInterval(dayTimerInterval);
      dayTimerInterval = null;
    }
    dayTimerStart = null;
    $("day-timer").classList.add("hidden");
  }

  // ============================================================
  // PHASE CHANGE (with suspense for night->day)
  // ============================================================
  function handlePhaseChange(msg) {
    // Update event history if events are provided
    if (msg.events && msg.events.length > 0) {
      renderEventHistory(msg.events);
    }

    // Day/voting → night transition
    if ((previousPhase === "day" || previousPhase === "voting") && msg.phase === "night") {
      // This path owns the NIGHTFALL overlay for this night — mark the round so
      // the first-night sound-cue trigger (Bug 2) skips when the queued "night"
      // cue replays after the overlay completes.
      nightTransitionRound = msg.round;
      const voteResult = lastVoteResult;
      lastVoteResult = null;
      if (voteResult) {
        showExecutionTransition(voteResult, () => {
          if (msg.loverDeathName) {
            showHeartbreakTransition(msg.loverDeathName, () => {
              showNightTransition(() => {
                applyPhaseChange(msg);
              });
            });
          } else {
            showNightTransition(() => {
              applyPhaseChange(msg);
            });
          }
        });
      } else {
        showNightTransition(() => {
          applyPhaseChange(msg);
        });
      }
    // Night-to-day suspense transition (Phase 5)
    } else if (previousPhase === "night" && msg.phase === "day") {
      showSuspenseTransition(msg, () => {
        applyPhaseChange(msg);
      });
    // Execution → game_over with lover death (owner ruling: public heartbreak
    // beat before the game-over reveal).
    } else if (msg.loverDeathName && msg.phase === "game_over") {
      const voteResult = lastVoteResult;
      lastVoteResult = null;
      if (voteResult) {
        showExecutionTransition(voteResult, () => {
          showHeartbreakTransition(msg.loverDeathName, () => {
            applyPhaseChange(msg);
          });
        });
      } else {
        showHeartbreakTransition(msg.loverDeathName, () => {
          applyPhaseChange(msg);
        });
      }
    } else {
      applyPhaseChange(msg);
    }
  }

  function applyPhaseChange(msg) {
    previousPhase = msg.phase;
    currentPhase = msg.phase;
    $("round-number").textContent = msg.round;

    // D2: phase-ambient theming — remap CSS tokens via a body attribute so the
    // whole room shifts together (night→navy, day→warm, voting→blood accents).
    // Cleared centrally in showScreen() on every return-to-lobby/menu path.
    document.body.setAttribute("data-phase", msg.phase);
    // Re-sync the pinned base + chrome (data-phase drives the CSS ambience remap).
    applyEffectiveTheme();

    // D3b: phase pill gets pixel moon/sun art alongside text
    renderPhaseIndicator(msg.phase);

    // Clear visible narrator for new phase (transcript preserves history)
    $("narrator-messages").innerHTML = "";

    // Show most recent narrator message from transcript if no new messages
    if (narratorTranscript.length > 0 && (!msg.messages || msg.messages.length === 0)) {
      renderNarratorArea();
    }

    // phase_change carries `messages` (rendered English) and, additively,
    // `messageRefs` parallel BY INDEX. Prefer the ref so the line can be
    // re-rendered in another language; fall back to the string for an older
    // server or a frame that carries no ref.
    if (msg.messages && msg.messages.length > 0) {
      for (let i = 0; i < msg.messages.length; i++) {
        const ref = msg.messageRefs && msg.messageRefs[i];
        showNarratorMessage(ref || msg.messages[i]);
      }
    }

    // Hide all action panels
    $("night-actions").classList.add("hidden");
    $("btn-decline-revenge").classList.add("hidden");
    $("btn-vigilante-pass").classList.add("hidden");
    clearNightGate();
    // C5b: the deferred phase_change IS the revenge-resolution signal — the
    // room-wide wait view (and its admin skip control) comes down with it.
    $("revenge-wait").classList.add("hidden");
    $("mafia-vote-status").classList.add("hidden");
    $("voting-panel").classList.add("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("admin-night-controls").classList.add("hidden");
    $("day-accuse-controls").classList.add("hidden");
    $("awaiting-ready").classList.add("hidden");
    $("btn-begin-night").classList.add("hidden");

    if (msg.phase === "day") {
      startDayTimer();
      if (isAdmin) {
        showAdminDayControls();
        setTimeout(() => populateAdminTargets(knownPlayers), 100);
      }
      // Living players get the accusation UI (pendingAccusations persists in
      // client memory across a failed vote — the server clears it at night).
      renderAccusePanel();
    }

    if (msg.phase === "night" || msg.phase === "game_over") {
      stopDayTimer();
    }

    if (msg.phase === "night") {
      hasVoted = false;
      dayVoteCount = 0;
      // Accusation state is day-scoped and cleared server-side at night entry.
      pendingAccusations = [];
      accusationsMade = [];
      secondsMade = [];
      $("accusations-panel").innerHTML = "";
      nightActionLocked = false;
      deadActionActive = false;
      clearDetectiveResult();
      $("mafia-vote-details").innerHTML = "";
      // Reset spectator night log and joker status for new night
      spectatorNightLog = [];
      $("spectator-night-log").innerHTML = "";
      $("spectator-night-log").classList.add("hidden");
      $("joker-spectator-status").classList.add("hidden");
      if (isAdmin) {
        $("admin-night-controls").classList.remove("hidden");
      }
    }

    updatePlayerStatus();
  }

  // L5: a game_over that arrived mid-transition replays once the chain ends.
  // If another transition chained on synchronously (execution → heartbreak →
  // night), handleServerMessage simply re-holds it until the last one completes.
  function flushPendingGameOver() {
    if (!pendingGameOver) return;
    const msg = pendingGameOver;
    pendingGameOver = null;
    handleServerMessage(msg);
  }

  // ============================================================
  // SUSPENSE STAGE COMPOSITION (D5)
  // ------------------------------------------------------------
  // The five beat writers paint a staged composition into the suspense overlay
  // (pre-line + pixel art + text) WITHOUT touching the timing/queue plumbing.
  // setSuspenseStage only changes WHAT is painted; the writers own WHEN.
  // art:  a 10x10 pixel grid (rendered via the existing pipeline) or null/"" to
  //       clear the centerpiece. preText: amber Grandstander pre-line, or "" to
  //       clear it. beatClass: a single beat-tint class on the overlay (e.g.
  //       "beat-death") or "" for none. All beat classes are reset first so no
  //       beat inherits the previous beat's tint.
  const SUSPENSE_BEAT_CLASSES = ["beat-night", "beat-dawn", "beat-death", "beat-execution", "beat-heartbreak", "beat-gameover", "beat-win-town", "beat-win-mafia", "beat-win-joker"];
  // P6: `winArtHtml` is the Victory-screen escape hatch — the game-over beat
  // stages the band's raster (a fixed, app-authored <img> string, never user
  // input) instead of a pixel grid. Sizing + the radial glow are scoped to the
  // beat-win-* class in CSS.
  function setSuspenseStage(art, preText, beatClass, winArtHtml) {
    const overlay = $("suspense-overlay");
    const artEl = $("suspense-art");
    const preEl = $("suspense-pre");
    overlay.classList.remove(...SUSPENSE_BEAT_CLASSES);
    if (beatClass) overlay.classList.add(beatClass);
    // art grids are static (pixelArtToSvg over registry grids) — no user input
    artEl.innerHTML = winArtHtml || (art ? pixelArtToSvg(art) : "");
    // pre-line is fixed copy set by the writers (never a relayed username) —
    // textContent keeps it XSS-inert regardless.
    preEl.textContent = preText || "";
  }
  // Clear the stage when the overlay hides so the next beat starts blank.
  function clearSuspenseStage() {
    setSuspenseStage("", "", "");
  }

  // ============================================================
  // EXECUTION TRANSITION (vote result → night)
  // ============================================================
  function showExecutionTransition(voteResult, callback) {
    executionTransitionActive = true;
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");

    // Day-9 (ONE SPARE STRING): a non-executed ballot has exactly one voice —
    // the engine narrator's EXECUTION_SPARED_MESSAGES line, delivered on the
    // spared phase_change. The old client-side "The vote was abstained." beat
    // contradicted it (and the old "{name} has been spared." narrator line),
    // so the verdict overlay now plays for EXECUTIONS ONLY and a spare goes
    // straight through to the caller.
    if (!voteResult.executed) {
      overlay.classList.add("hidden");
      executionTransitionActive = false;
      callback();
      return;
    }

    const msg = t("ui.vote.wasExecuted", { name: voteResult.targetName });

    // D5: staged composition — execution beat = skull + blood tint.
    setSuspenseStage(CARD_BACK_DEAD_ART, t("ui.overlay.verdict"), "beat-execution");

    text.textContent = msg;
    text.style.color = "var(--danger)";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      overlay.classList.add("fade-out");
      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
        text.style.color = "";
        clearSuspenseStage();
        executionTransitionActive = false;
        // no flushPendingGameOver here — all call sites chain into heartbreak/night, whose terminals flush
        callback();
      }, 600);
    }, 2000);
  }

  // Public heartbreak beat (owner ruling): a full-screen "X died of heartbreak"
  // overlay for the heartbroken partner, chained AFTER the execution/dawn beat
  // and BEFORE nightfall / game_over. This terminal flushes any held game_over.
  function showHeartbreakTransition(loverName, callback) {
    heartbreakTransitionActive = true;
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    // D5: heartbreak art migrated from the text node into the dedicated art slot.
    // The text node now carries only the (XSS-safe via textContent) sentence.
    setSuspenseStage(HEARTBREAK_ART, t("ui.overlay.heartbreakPre"), "beat-heartbreak");
    text.textContent = t("ui.overlay.diedOfHeartbreak", { name: loverName });
    text.style.color = "var(--role-lover)";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      overlay.classList.add("fade-out");
      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
        text.style.color = "";
        clearSuspenseStage();
        heartbreakTransitionActive = false;
        callback();
        flushPendingGameOver();
      }, 600);
    }, 2000);
  }

  // ============================================================
  // NIGHT TRANSITION (day/voting → night)
  // ============================================================
  // The nightfall overlay plays TWO sequential lines. Both pools live in the
  // language bundle and are the same length, so index i pairs lead[i]/tail[i].
  let nightMsgIndex = 0;
  function nightPair(i) {
    const lead = I18n.pool("ui.overlay.nightLead");
    const tail = I18n.pool("ui.overlay.nightTail");
    const n = Math.min(lead.length, tail.length) || 1;
    return [lead[i % n] || "", tail[i % n] || ""];
  }

  function showNightTransition(callback) {
    nightTransitionActive = true;
    // Don't clear nightTransitionQueue here — messages may already be queued
    // from the preceding execution transition. Queue is cleared after replay.

    const pair = nightPair(nightMsgIndex);
    nightMsgIndex++;

    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    // D5: nightfall = moon centerpiece, navy wash (beat-night tint).
    setSuspenseStage(MOON_ART, t("ui.overlay.nightfall"), "beat-night");
    text.textContent = pair[0];
    text.style.color = "";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      text.textContent = pair[1];
      text.style.color = "var(--text-secondary)";
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 1800);

    setTimeout(() => {
      overlay.classList.add("fade-out");
      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
        text.style.color = "";
        clearSuspenseStage();
        nightTransitionActive = false;
        callback();
        // Replay queued night action prompts after applyPhaseChange
        for (const qMsg of nightTransitionQueue) {
          handleServerMessage(qMsg);
        }
        nightTransitionQueue = [];
        flushPendingGameOver();
      }, 600);
    }, 3400);
  }

  // ============================================================
  // SUSPENSE TRANSITION (Phase 5)
  // ============================================================
  function getNightVerdict(msg) {
    // Check events for the current round to determine good/bad news
    const round = msg.round;
    const roundEvents = (msg.events || []).filter((e) => e.round === round);
    // Official doctor mode sends an anonymous `saved` flag (no named save event);
    // house mode and older payloads still carry a named "save" event.
    const hasSave = msg.saved === true || roundEvents.some((e) => e.type === "save");
    // Count EVERY night-death type so a vigilante-only / joker-only / lover-only
    // night isn't mis-read as peaceful. In-game the server now ships the ONE
    // neutral "death" type (projectEventsForClients) — the legacy cause-bearing
    // labels are kept here only for the game_over full-detail replay.
    // Owner ruling: a lover cascade (lover_death) gets its OWN public "died of
    // heartbreak" beat below, so it is NOT folded into the direct-victim
    // singling here — direct kills stay cause-ambiguous, the partner is named.
    const directDeaths = roundEvents.filter((e) =>
      e.type === "death" || e.type === "kill" || e.type === "vigilante_shot" || e.type === "joker_haunt"
    );
    const hasLoverDeath = roundEvents.some((e) => e.type === "lover_death");
    const hasKill = directDeaths.length > 0 || hasLoverDeath;
    // Only name a victim when EXACTLY ONE died; multi-death nights stay neutral
    // so the verdict can't single out (and thereby cause-tag) the mafia victim
    // \u2014 the combined narrator line already carries all the names.
    const victimName = directDeaths.length === 1 ? directDeaths[0].playerName : null;
    // D5: verdict returns an art GRID + plain text + tint, painted into the
    // dedicated stage slots (the writer uses .textContent, so the relayed
    // username never reaches innerHTML \u2014 strictly safer than the prior
    // escapeHtml-into-innerHTML path).
    if (hasSave && hasKill) return { art: CROSS_ART, text: victimName ? t("ui.overlay.savedButDied", { name: victimName }) : t("ui.overlay.savedButOthersDied"), color: "var(--role-doctor)", beatClass: "beat-dawn" };
    if (hasSave) return { art: CROSS_ART, text: t("ui.overlay.doctorSavedALife"), color: "var(--role-doctor)", beatClass: "beat-dawn" };
    if (hasKill) return { art: CARD_BACK_DEAD_ART, text: victimName ? t("ui.overlay.didntSurvive", { name: victimName }) : t("ui.overlay.severalDidntSurvive"), color: "var(--danger)", beatClass: "beat-death" };
    return { art: SUN_ART, text: t("ui.overlay.peacefulNight"), color: "var(--text-secondary)", beatClass: "beat-dawn" };
  }

  function showSuspenseTransition(msg, callback) {
    suspenseActive = true;
    suspenseQueue = [];
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");
    // Owner ruling: a night lover cascade gets a dedicated public heartbreak
    // beat after the verdict; it lengthens the dawn overlay so game_over/night
    // don't stomp it (extraDelay pushes the fade-out + teardown timers).
    const hasLoverDeath = !!msg.loverDeathName;
    const extraDelay = hasLoverDeath ? 2800 : 0;

    overlay.classList.remove("hidden", "fade-out");
    // D5: dawn opens on the sun centerpiece; the verdict beat re-stages art per
    // outcome (skull on a kill, cross on a save, sun on a peaceful night).
    setSuspenseStage(SUN_ART, t("ui.overlay.dawn"), "beat-dawn");
    text.textContent = t("ui.overlay.sunRises");
    text.style.color = "";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      text.textContent = t("ui.overlay.whatHappened");
      text.style.color = "";
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 2000);

    setTimeout(() => {
      const verdict = getNightVerdict(msg);
      // D5: verdict carries an art grid + plain text + tint for the stage.
      setSuspenseStage(verdict.art, t("ui.overlay.verdict"), verdict.beatClass);
      text.textContent = verdict.text;
      text.style.color = verdict.color;
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 3500);

    if (hasLoverDeath) {
      setTimeout(() => {
        // D5: heartbreak art into the stage slot; text node carries the sentence
        // (textContent — relayed name stays XSS-inert). Names only the partner.
        setSuspenseStage(HEARTBREAK_ART, t("ui.overlay.heartbreakPre"), "beat-heartbreak");
        text.textContent = t("ui.overlay.diedOfHeartbreak", { name: msg.loverDeathName });
        text.style.color = "var(--role-lover)";
        text.style.animation = "none";
        void text.offsetWidth;
        text.style.animation = "suspenseFadeIn 0.8s ease";
      }, 5700);
    }

    setTimeout(() => {
      overlay.classList.add("fade-out");
    }, 5500 + extraDelay);

    setTimeout(() => {
      overlay.classList.add("hidden");
      overlay.classList.remove("fade-out");
      text.style.color = "";
      clearSuspenseStage();
      suspenseActive = false;

      // Apply the phase change
      callback();

      // Process queued messages
      for (const qMsg of suspenseQueue) {
        handleServerMessage(qMsg);
      }
      suspenseQueue = [];
      flushPendingGameOver();
    }, 6300 + extraDelay);
  }

  function showDetectiveResult(msg) {
    const el = $("detective-result");
    // 140:1315 / 143:1463 — the reveal is a 326x70 #232729 card carrying the
    // 34x34 DETECTIVE art (the same asset as the Membership Card) beside the
    // sentence, shipped as designed. The COPY stays the app's: Figma's
    // "…reveals jenny NOT a member of the mafia" is ungrammatical.
    const magSvg = '<img class="detective-result-art" src="/img/roles/detective.png" alt="" draggable="false">';
    const detKey = msg.isMafia ? "ui.detective.isMafia" : "ui.detective.notMafia";
    const plainText = t(detKey, { name: msg.targetName });
    // Escape server-relayed username before interpolating into innerHTML; transcript keeps the
    // un-prefixed plain text (re-escaped at render via escapeHtml in the transcript view).
    const htmlText = escapeHtml(plainText);
    el.innerHTML = magSvg + '<span class="detective-result-text">' + htmlText + '</span>';
    el.classList.remove("hidden");
    narratorTranscript.push({ key: detKey, params: { name: msg.targetName }, text: plainText });
    detectiveHistory.push({
      round: parseInt($("round-number").textContent) || 1,
      targetName: msg.targetName,
      isMafia: msg.isMafia,
    });
  }

  function clearDetectiveResult() {
    const el = $("detective-result");
    el.textContent = "";
    el.classList.add("hidden");
  }

  // `entry` is either a server message REFERENCE ({ text, key, params, seed })
  // or a plain string (a client-authored line, or a pre-i18n/legacy frame). It is
  // stored UNRENDERED so a language switch can re-render the whole transcript;
  // tMsg() resolves it at paint time.
  function showNarratorMessage(entry) {
    narratorTranscript.push(entry);
    const container = $("narrator-messages");
    container.innerHTML = "";
    const div = document.createElement("div");
    div.className = "narrator-line animate-in";
    div.textContent = tMsg(entry);
    container.appendChild(div);
  }

  /**
   * "Waiting for <host> to start..." on the player lobby. Rendered from ONE
   * sentence template with the name spliced into its own #admin-name-display
   * span, so Korean can attach the honorific directly to the name ("Bob님이 …")
   * — a fixed pre/name/post split would force a space before 님.
   */
  function renderWaitingText() {
    const p = $("waiting-text");
    if (!p) return;
    const SENTINEL = "\u0001";
    const parts = t("ui.lobby.waitingFor", { name: SENTINEL }).split(SENTINEL);
    p.textContent = "";
    p.appendChild(document.createTextNode(parts[0] || ""));
    const span = document.createElement("span");
    span.id = "admin-name-display";
    span.textContent = lobbyAdminName || "";
    p.appendChild(span);
    p.appendChild(document.createTextNode(parts.slice(1).join(SENTINEL)));
  }

  /** Repaint the narrator block from the LAST transcript entry (or clear it). */
  function renderNarratorArea() {
    const container = $("narrator-messages");
    if (!container) return;
    container.innerHTML = "";
    if (narratorTranscript.length === 0) return;
    const div = document.createElement("div");
    div.className = "narrator-line";
    div.textContent = tMsg(narratorTranscript[narratorTranscript.length - 1]);
    container.appendChild(div);
  }

  /** Repaint the transcript modal's list from the stored entries. */
  function renderTranscript() {
    const list = $("transcript-list");
    const empty = $("transcript-empty");
    if (narratorTranscript.length === 0) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    list.innerHTML = narratorTranscript
      .map((m) => `<div class="transcript-line">${escapeHtml(tMsg(m))}</div>`)
      .join("");
  }

  /**
   * The phase pill (moon/sun pixel art + label). Extracted so a language switch
   * can repaint it; `phase` null leaves the pill alone.
   */
  function renderPhaseIndicator(phase) {
    if (!phase) return;
    const indicator = $("phase-indicator");
    if (!indicator) return;
    indicator.className = `phase-indicator ${phase}`;
    const label = phase === "game_over" ? t("ui.game.gameOver")
      : phase === "night" ? t("ui.game.night")
      : phase === "day" ? t("ui.game.day")
      : phase === "voting" ? t("ui.game.voting")
      : phase.toUpperCase();
    if (phase === "night") {
      indicator.innerHTML = pixelArtToSvg(MOON_ART) + " " + label;
    } else if (phase === "day" || phase === "voting") {
      indicator.innerHTML = pixelArtToSvg(SUN_ART) + " " + label;
    } else {
      indicator.textContent = label;
    }
  }

  // ============================================================
  // EVENT HISTORY (Phase 2)
  // ============================================================
  function renderEventHistory(events) {
    if (!events || events.length === 0) return;
    lastGameEvents = events;

    const container = $("event-history-list");
    container.innerHTML = "";

    // In-game event tab is visible to LIVING players, so the four NIGHT death
    // labels are neutralized to a cause-neutral line — naming the mafia /
    // vigilante / joker / heartbreak here would re-leak exactly what the dawn
    // fix hides. Day-public outcomes (execution/spared), positive save, and
    // the detective's private investigations keep their descriptive labels.
    // hunter_revenge is already a PUBLIC reveal (the gate announces the Hunter).
    // The end-game history (GAME_HISTORY_LABELS) stays a FULL reveal.
    const EVENT_LABELS = {
      death: "ui.event.diedInNight",
      kill: "ui.event.diedInNight",
      save: "ui.event.savedByDoctor",
      execution: "ui.event.executed",
      lover_death: "ui.event.diedOfHeartbreak",
      spared: "ui.event.sparedByVote",
      joker_haunt: "ui.event.diedInNight",
      hunter_revenge: "ui.event.shotByHunter",
      vigilante_shot: "ui.event.diedInNight",
      investigation_mafia: "ui.event.investigatedMafia",
      investigation_clear: "ui.event.investigatedClear",
    };
    // Living clients only ever receive the neutral "death" type for DIRECT night
    // kills (projectEventsForClients), but map any cause-bearing direct-death
    // label to the SAME neutral CSS class defensively so the class attribute
    // can never out the cause even if a full-detail event reaches this in-game
    // renderer (e.g. the game_over full-history replay). lover_death is
    // DELIBERATELY EXCLUDED (owner ruling): heartbreak is public, so it keeps
    // its own "lover_death" class + "Died of heartbreak" label.
    const NIGHT_DEATH_CLASS = new Set(["death", "kill", "vigilante_shot", "joker_haunt"]);

    // Merge detective history (private) into events for display
    let allEvents = [...events];
    if (myRole === "detective" && detectiveHistory.length > 0) {
      for (const inv of detectiveHistory) {
        allEvents.push({
          round: inv.round,
          type: inv.isMafia ? "investigation_mafia" : "investigation_clear",
          playerName: inv.targetName,
        });
      }
    }

    // Group by round
    const grouped = {};
    for (const ev of allEvents) {
      if (!grouped[ev.round]) grouped[ev.round] = [];
      grouped[ev.round].push(ev);
    }

    // Game Tabs Events grid (specs/components/287-3437--game-tabs.md): each round
    // is ONE row — "Round N" in the left column, that round's lines stacked in
    // the right column — with a divider between rounds. Strings and the privacy
    // projection above are unchanged; this is layout only.
    for (const round of Object.keys(grouped).sort((a, b) => a - b)) {
      const row = document.createElement("div");
      row.className = "eh-round";

      const header = document.createElement("div");
      header.className = "event-history-round";
      header.textContent = t("ui.event.round", { n: round });
      row.appendChild(header);

      const cell = document.createElement("div");
      cell.className = "eh-round-events";
      for (const ev of grouped[round]) {
        const item = document.createElement("div");
        const cls = NIGHT_DEATH_CLASS.has(ev.type) ? "death" : ev.type;
        item.className = `event-item ${cls}`;
        item.textContent = t("ui.event.line", { name: ev.playerName, label: EVENT_LABELS[ev.type] ? t(EVENT_LABELS[ev.type]) : ev.type });
        cell.appendChild(item);
      }
      row.appendChild(cell);
      container.appendChild(row);
    }

    updatePlayerStatus();
  }

  function updatePlayerStatus() {
    const container = $("player-status-list");
    if (!container) return;
    const sorted = [...knownPlayers].sort((a, b) => {
      // Dead players first (sorted by death order, earliest death at top)
      if (!a.isAlive && b.isAlive) return -1;
      if (a.isAlive && !b.isAlive) return 1;
      if (!a.isAlive && !b.isAlive) return (a.deathOrder || 0) - (b.deathOrder || 0);
      return 0; // Both alive — preserve original order
    });

    // Build detective investigation lookup
    const investigationMap = {};
    if (myRole === "detective" && detectiveHistory.length > 0) {
      for (const inv of detectiveHistory) {
        investigationMap[inv.targetName] = inv.isMafia;
      }
    }

    container.innerHTML = sorted
      .map((p) => {
        const status = p.isAlive ? "alive" : "dead";
        const dotStyle = p.isAlive && p.color ? `style="background:${nearestPlayerColor(p.color)}"` : '';
        const isMafiaTeammate = myRole === "mafia" && mafiaTeam.includes(p.username);
        const showMafiaTag = isMafiaTeammate && !hideMafiaTag;
        // The mafia (incl. the Godfather themselves) know who the Godfather is.
        const isGodfatherMember = godfatherName != null && p.username === godfatherName;
        const investigated = investigationMap.hasOwnProperty(p.username);
        const isMafia = investigated ? investigationMap[p.username] : false;
        // 261:2092 row order: name (+ the detective's 14px thumb) on the LEFT,
        // the 14x14 colour ellipse on the RIGHT.
        return `<div class="player-status-item ${status}">
          <span class="player-status-name ${status}">${escapeHtml(p.username)}</span>
          ${showMafiaTag ? (isGodfatherMember ? '<span class="mafia-tag godfather-tag">&#128081; ' + escapeHtml(t("ui.role.godfather").toUpperCase()) + '</span>' : '<span class="mafia-tag">' + escapeHtml(t("ui.role.mafia").toUpperCase()) + '</span>') : ''}
          ${investigated ? (isMafia ? '<span class="detective-tag mafia">' + pixelArtToSvg(THUMB_DOWN_ART) + '</span>' : '<span class="detective-tag clear">' + pixelArtToSvg(THUMB_UP_ART) + '</span>') : ''}
          <span class="player-status-dot ${status}" ${dotStyle}></span>
        </div>`;
      })
      .join("");
  }

  // Tab toggle for event history
  document.querySelectorAll(".eh-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".eh-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      $("eh-panel-events").classList.toggle("hidden", target !== "events");
      $("eh-panel-players").classList.toggle("hidden", target !== "players");
    });
  });

  function resetEventHistoryTabs(defaultTab = "events") {
    document.querySelectorAll(".eh-tab").forEach((t) => t.classList.remove("active"));
    const activeTab = document.querySelector(`.eh-tab[data-tab="${defaultTab}"]`);
    if (activeTab) activeTab.classList.add("active");
    $("eh-panel-events").classList.toggle("hidden", defaultTab !== "events");
    $("eh-panel-players").classList.toggle("hidden", defaultTab !== "players");
  }

  // ============================================================
  // NIGHT ACTIONS
  // ============================================================
  let nightActionLocked = false; // true after doctor/detective confirm
  // True while a dead player's own action is in progress (the joker haunt
  // and the hunter revenge set it; any future dead-player action sets the
  // same flag).
  // Suppresses the spectator views and exempts showNightAction's dead-guard.
  // Reset sites: the game_started case, the game_sync reset (handleGameSync),
  // and applyPhaseChange's night branch.
  let deadActionActive = false;
  let mafiaTargetPlayers = []; // the target list for re-rendering icons
  // M11: target of an in-flight maybe+lock pair. The pair is sent back-to-back
  // (the WS stream is ordered, so nothing can interleave) and further taps are
  // ignored until the server echoes a vote update — a duplicate "maybe" would
  // toggle the vote off, and a second target's "lock" could diverge from the UI.
  let pendingMafiaLockTarget = null;

  function sendMafiaMaybeLock(targetId) {
    if (pendingMafiaLockTarget !== null) return false;
    pendingMafiaLockTarget = targetId;
    wsSend({ type: "mafia_vote", targetId, voteType: "maybe" });
    wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
    return true;
  }

  // ── N-D2: pre-choice gates (Figma 130:573 Hunter, 225:542 Vigilante) ──────
  // Both roles open on a two-CTA screen — a primary that reveals the target
  // list and a decline that resolves the action outright — instead of showing
  // the list and the decline button together. The decline BUTTON is the same
  // element in both states (N-D6: one shared style), only its label changes to
  // the Figma per-frame string: gate vs. target-list frame.
  const NIGHT_GATES = {
    hunter_revenge: {
      go: "ui.gate.takeRevenge",          // 130:573
      declineId: "btn-decline-revenge",
      gateDecline: "ui.gate.spareOthers", // 130:573
      listDecline: "ui.gate.dontShoot",   // 225:364
    },
    vigilante_shoot: {
      go: "ui.gate.shoot",                // 225:542
      declineId: "btn-vigilante-pass",
      gateDecline: "ui.gate.holdFire",    // 225:542
      listDecline: "ui.gate.holdFire",    // 234:1332 — same string on both frames
    },
  };
  let activeNightGate = null;

  /** Drop any gate state: list visible, primary CTA gone. The default for every
   *  role/spectator surface that renders into #action-targets. */
  function clearNightGate() {
    activeNightGate = null;
    $("night-choice").classList.remove("gate-mode");
    $("action-list-wrap").classList.remove("hidden");
    $("btn-night-gate-go").classList.add("hidden");
  }

  /** Enter the gate: list shuttered, primary + decline side by side. */
  function openNightGate(actionType) {
    const gate = NIGHT_GATES[actionType];
    activeNightGate = actionType;
    $("btn-night-gate-go").textContent = t(gate.go);
    $("btn-night-gate-go").classList.remove("hidden");
    $("night-choice").classList.add("gate-mode");
    $("action-list-wrap").classList.add("hidden");
    $(gate.declineId).textContent = t(gate.gateDecline);
  }

  /** The primary CTA was tapped: reveal the target list (Figma wiring
   *  225:417 → 225:364 hunter, 225:557 → 234:1332 vigilante). */
  $("btn-night-gate-go").addEventListener("click", () => {
    if (!activeNightGate || nightActionLocked) return;
    const gate = NIGHT_GATES[activeNightGate];
    activeNightGate = null;
    $("night-choice").classList.remove("gate-mode");
    $("action-list-wrap").classList.remove("hidden");
    $("btn-night-gate-go").classList.add("hidden");
    $(gate.declineId).textContent = t(gate.listDecline);
  });

  function showNightAction(title, players, actionType, disabledId) {
    // A dead player may only act while their own dead action is active
    // (deadActionActive — joker haunting or hunter revenge from beyond the grave)
    if (isDead && !deadActionActive) return;

    const panel = $("night-actions");
    panel.classList.remove("hidden");
    $("action-title").textContent = title;
    $("action-status").textContent = "";
    nightActionLocked = false;

    hideSlideConfirm();
    clearNightGate();

    // Decline affordance is exclusive to the hunter's revenge prompt
    // (the Confirm button is reserved for the kill; declining is a plain button).
    $("btn-decline-revenge").classList.toggle("hidden", actionType !== "hunter_revenge");
    // The vigilante's "hold fire" button (parallel to the hunter's decline).
    $("btn-vigilante-pass").classList.toggle("hidden", actionType !== "vigilante_shoot");

    const list = $("action-targets");

    if (actionType === "mafia_vote") {
      mafiaTargetPlayers = players;
      pendingMafiaLockTarget = null; // fresh night render (M11)
      // A new mafia night opens with a clean slate. These vote-state globals are
      // otherwise only reset on game_started / game_sync, so without this a prior
      // night's Spare (objection), my own votes, and the voter chips would leak
      // into this night's cards — a spared target would render "Blocked" with no
      // buttons, and if the objector was lynched the remaining mafia couldn't act
      // on it. The engine already clears its state every night (NIGHT_RESETS); the
      // server echoes fresh state on the first vote. Reset the client mirror here.
      mafiaObjectedTargets = {};
      myMafiaVotes = [];
      lastVoterTargets = {};
      aliveMafiaCount = 0;
      // Branch on single vs multi mafia
      if (mafiaTeam.length <= 1) {
        renderSingleMafiaTargets(list, players);
        $("mafia-vote-status").classList.add("hidden");
      } else {
        list.innerHTML = "";
        renderMafiaTargetCards(list, players, {});
        $("mafia-vote-status").classList.remove("hidden");
      }
    } else {
      // N-D4 (Figma 130:625 / 140:1186): the detective's own past results are
      // annotated inline on the night list, sourced CLIENT-SIDE from
      // detectiveHistory — no new server field, no wire change. Gated on
      // `myRole === "detective"` exactly like updatePlayerStatus's tag column,
      // so no other role can ever render an "investigated as" string.
      // Rows stay SELECTABLE: the engine imposes no re-investigation ban
      // (submitDetectiveInvestigation, src/game-engine.ts:1062-1075, and
      // sendDetectivePrompts, src/server.ts:301-309, both send/accept every
      // living non-detective every night), so disabling them would invent a
      // rule the server does not enforce.
      const investigated = {};
      if (myRole === "detective" && actionType === "detective_investigate") {
        for (const inv of detectiveHistory) investigated[inv.targetName] = inv.isMafia;
      }
      list.innerHTML = players
        .map((p) => {
          const isDisabled = disabledId != null && p.id === disabledId;
          const suffix = isDisabled ? " " + t("ui.night.protectedLastNight") : "";
          const note = Object.prototype.hasOwnProperty.call(investigated, p.username)
            ? `<span class="tl-note${investigated[p.username] ? " tl-note-mafia" : ""}">${escapeHtml(t("ui.night.investigatedAs", { verdict: t(investigated[p.username] ? "ui.night.verdictMafia" : "ui.night.verdictNotMafia") }))}</span>`
            : "";
          return `<li data-id="${p.id}" class="${isDisabled ? "disabled" : ""}"><span class="tl-name">${escapeHtml(p.username)}${suffix}</span>${note}</li>`;
        })
        .join("");

      // Doctor/Detective/Joker haunt/Hunter revenge: clicking selects visually, the Confirm button sends to server
      let selectedTargetId = null;
      let selectedName = null;
      const slideRole = (actionType === "joker_haunt" || actionType === "hunter_revenge") ? actionType : myRole;
      list.querySelectorAll("li:not(.disabled)").forEach((li) => {
        li.addEventListener("click", () => {
          if (nightActionLocked) return;
          list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
          li.classList.add("selected");
          selectedTargetId = parseInt(li.dataset.id);
          // Read the NAME cell, not the row: the detective's rows also carry an
          // inline "investigated as …" note that must never reach the
          // collapsed confirmation row.
          const nameCell = li.querySelector(".tl-name");
          selectedName = nameCell ? nameCell.textContent : li.textContent;
          setupSlideConfirm(slideRole, () => {
            if (nightActionLocked || selectedTargetId === null) return;
            nightActionLocked = true;
            // Keep deadActionActive true for the entire night (reset when the next night begins)
            wsSend({ type: actionType, targetId: selectedTargetId });
            // A fired vigilante shot spends the bullet \u2014 reflect it on the card now.
            if (actionType === "vigilante_shoot") {
              vigilanteBulletUsed = true;
              updateBulletIndicator();
            }
            // Collapse to show only chosen target
            list.innerHTML = `<li class="selected">${escapeHtml(selectedName)} \u2714</li>`;
            // Action resolved: the hunter's decline / vigilante's hold-fire
            // affordances go with it (no-op for other action types; already hidden)
            $("btn-decline-revenge").classList.add("hidden");
            $("btn-vigilante-pass").classList.add("hidden");
            clearNightGate();
          }, () => {
            // Cancel: deselect so the player can choose a different target.
            selectedTargetId = null;
            selectedName = null;
            list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
          });
        });
      });
    }

    // N-D2: the two gated roles land on the two-CTA screen first. Opened AFTER
    // the list is built so the shutter has something to reveal.
    if (NIGHT_GATES[actionType]) openNightGate(actionType);
  }

  // C5b: the room-wide wait view while the revenge gate is open. The reveal
  // is PUBLIC (HUNTER-DESIGN decision #10) — alive players, dead spectators
  // and the admin all see who the Hunter is and wait for the shot. The admin
  // (alive or dead — admin rights persist) additionally gets the force-skip
  // safety net; showRevengeWait is the ONLY un-hide path, so re-toggling the
  // button here keeps a stale skip control structurally impossible.
  // Teardown sites (the wait view outlives no resolution): the
  // hunter_revenge_targets case (the hunter's prompt replaces it), the
  // game_started reset, the game_sync hide-all (re-shown by the
  // pendingRevenge restore branch when the gate is still open),
  // applyPhaseChange's hide-all (the deferred phase_change IS the
  // resolution signal), handleGameOver, and room_closed.
  function showRevengeWait(hunterName) {
    $("revenge-wait-reveal").textContent = t("ui.hunter.wasTheHunter", { name: hunterName });
    $("btn-skip-revenge").classList.toggle("hidden", !isAdmin);
    $("revenge-wait").classList.remove("hidden");
  }

  // Admin-only safety net for a stalled Hunter (the kitchen problem). The
  // server resolves it as a decline; a click after the gate closed is a
  // wire-silent no-op server-side, so no client-side locking is needed.
  $("btn-skip-revenge").addEventListener("click", () => {
    wsSend({ type: "force_skip_revenge" });
  });

  // C5a: declining the revenge shot is a plain button (the Confirm button is
  // reserved for the kill). Only visible while the hunter_revenge prompt is
  // up; null targetId is the wire shape for a decline.
  $("btn-decline-revenge").addEventListener("click", () => {
    if (nightActionLocked) return;
    nightActionLocked = true;
    wsSend({ type: "hunter_revenge", targetId: null });
    $("btn-decline-revenge").classList.add("hidden");
    hideSlideConfirm();
    clearNightGate();
    $("action-status").textContent = t("ui.hunter.loweredBow");
  });

  // The vigilante holds fire — keep the bullet for a later night (null = pass).
  $("btn-vigilante-pass").addEventListener("click", () => {
    if (nightActionLocked) return;
    nightActionLocked = true;
    wsSend({ type: "vigilante_shoot", targetId: null });
    $("btn-vigilante-pass").classList.add("hidden");
    hideSlideConfirm();
    clearNightGate();
    $("action-targets").innerHTML = "";
    // N-D8: ONE hold-fire string on both sides. The server's night_action_done
    // (src/server.ts:1489) overwrites this line a moment later, so the transient
    // client copy is unified to the settled server wording instead of flashing
    // a shorter variant first.
    $("action-status").textContent = t("act.vigilanteHoldFire");
  });

  function renderSingleMafiaTargets(list, players) {
    list.innerHTML = players
      .map((p) => `<li data-id="${p.id}" class="single-mafia-target">${escapeHtml(p.username)}</li>`)
      .join("");

    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        if (nightActionLocked) return;
        const targetId = parseInt(li.dataset.id);
        // Atomic maybe+lock; further taps are no-ops so the UI can never
        // highlight a different target than the one locked on the wire (M11)
        if (!sendMafiaMaybeLock(targetId)) return;
        list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
        li.classList.add("selected");
      });
    });
  }

  let lastVoterTargets = {}; // track for chip rendering

  function renderMafiaTargetCards(list, players, voteCounts, readOnly) {
    list.innerHTML = "";
    for (const p of players) {
      const targetId = p.id;
      const counts = voteCounts[targetId] || { maybe: 0, lock: 0, letsnot: 0 };
      const myVote = myMafiaVotes.find(v => v.targetId === targetId);
      const myVoteType = myVote ? myVote.voteType : null;
      const hasMyMaybe = myMafiaVotes.some(v => v.targetId === targetId && v.voteType === "maybe");
      const isObjected = mafiaObjectedTargets[targetId] && mafiaObjectedTargets[targetId].length > 0;
      const iMyObjection = myVoteType === "letsnot";

      // Determine card state
      let cardState = "idle";
      if (isObjected) {
        cardState = "objected";
      } else if (aliveMafiaCount > 0 && counts.lock === aliveMafiaCount) {
        cardState = "unanimous";
      } else if (counts.lock > 0) {
        cardState = "partial-lock";
      } else if (counts.maybe > 0) {
        cardState = "suggested";
      }

      const card = document.createElement("li");
      card.className = "mafia-target-card " + cardState;
      card.dataset.id = String(targetId);
      if (isObjected && iMyObjection) card.classList.add("my-objection");

      // Header
      const header = document.createElement("div");
      header.className = "mtc-header";
      const nameEl = document.createElement("span");
      nameEl.className = "mtc-name";
      nameEl.textContent = p.username;
      header.appendChild(nameEl);

      // Voter chips inline in header (between name and badge)
      if (counts.maybe > 0 || counts.lock > 0 || counts.letsnot > 0) {
        const chipsDiv = document.createElement("div");
        chipsDiv.className = "mtc-chips";
        for (const [voterName, votes] of Object.entries(lastVoterTargets)) {
          for (const v of votes) {
            if (v.targetId === targetId) {
              const chip = document.createElement("span");
              const initial = voterName.charAt(0).toUpperCase();
              chip.textContent = initial;
              if (v.voteType === "lock") chip.className = "mtc-chip chip-lock";
              else if (v.voteType === "maybe") chip.className = "mtc-chip chip-suggest";
              else chip.className = "mtc-chip chip-object";
              chip.title = voterName + ": " + v.voteType;
              // Apply voter's player color as chip background (except for objections)
              if (v.voteType !== "letsnot") {
                const voterPlayer = knownPlayers.find(kp => kp.username === voterName);
                if (voterPlayer && voterPlayer.color) {
                  chip.style.background = nearestPlayerColor(voterPlayer.color);
                }
              }
              chipsDiv.appendChild(chip);
            }
          }
        }
        header.appendChild(chipsDiv);
      }

      if (isObjected) {
        const badge = document.createElement("span");
        badge.className = "mtc-blocked-label";
        badge.textContent = t("ui.mafia.blocked");
        header.appendChild(badge);
      } else if (cardState === "unanimous") {
        const badge = document.createElement("span");
        badge.className = "mtc-lock-progress";
        badge.textContent = t("ui.mafia.unanimous");
        header.appendChild(badge);
      } else if (counts.lock > 0) {
        const badge = document.createElement("span");
        badge.className = "mtc-lock-progress";
        badge.textContent = t("ui.mafia.lockProgress", { locked: counts.lock, total: aliveMafiaCount });
        header.appendChild(badge);
      }
      card.appendChild(header);

      // Objection message
      if (isObjected) {
        const objMsg = document.createElement("div");
        objMsg.className = "mtc-objection-msg";
        objMsg.textContent = t("ui.mafia.objectedBy", { names: mafiaObjectedTargets[targetId].join(", ") });
        card.appendChild(objMsg);
      }

      // Action buttons (skip entirely in read-only spectator mode)
      if (!readOnly) {
        const actions = document.createElement("div");
        actions.className = "mtc-actions";

        if (cardState === "objected") {
          if (iMyObjection) {
            const btn = document.createElement("button");
            btn.className = "mtc-btn mtc-btn-remove-objection";
            btn.textContent = t("ui.mafia.removeObjection");
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "letsnot" });
            });
            actions.appendChild(btn);
          }
        } else if (cardState === "unanimous") {
          // No buttons — the Confirm button takes over
        } else if (cardState === "idle") {
          const nomBtn = document.createElement("button");
          nomBtn.className = "mtc-btn mtc-btn-suggest";
          // D3b: pixel POINT icon + Grandstander label — mechanics unchanged
          nomBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(POINT_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.nominate")) + '</span>';
          nomBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (nightActionLocked) return;
            wsSend({ type: "mafia_vote", targetId, voteType: "maybe" });
          });
          actions.appendChild(nomBtn);

          const spareBtn = document.createElement("button");
          spareBtn.className = "mtc-btn mtc-btn-object";
          // D3b: pixel X icon + Grandstander label
          spareBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(X_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.spare")) + '</span>';
          spareBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (nightActionLocked) return;
            wsSend({ type: "mafia_vote", targetId, voteType: "letsnot" });
          });
          actions.appendChild(spareBtn);
        } else {
          // Suggested or partial-lock
          if (myVoteType === "lock") {
            const unlockBtn = document.createElement("button");
            unlockBtn.className = "mtc-btn mtc-btn-unlock";
            unlockBtn.textContent = t("ui.mafia.unlock");
            unlockBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
            });
            actions.appendChild(unlockBtn);
          } else if (hasMyMaybe) {
            // Check if I already have a lock on a different target
            const myExistingLock = myMafiaVotes.find(v => v.voteType === "lock");
            if (myExistingLock && myExistingLock.targetId !== targetId) {
              const lockBtn = document.createElement("button");
              lockBtn.className = "mtc-btn mtc-btn-lock mtc-btn-disabled";
              // D3b: pixel LOCK icon + Grandstander label
              lockBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(LOCK_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.lockedElsewhere")) + '</span>';
              lockBtn.disabled = true;
              actions.appendChild(lockBtn);
            } else {
              const lockBtn = document.createElement("button");
              lockBtn.className = "mtc-btn mtc-btn-lock";
              // D3b: pixel LOCK icon + Grandstander label
              lockBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(LOCK_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.lockIn")) + '</span>';
              lockBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (nightActionLocked) return;
                wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
              });
              actions.appendChild(lockBtn);
            }
          } else if (cardState === "partial-lock") {
            // Someone else already locked — show Lock In (auto-sends maybe+lock)
            const myExistingLock = myMafiaVotes.find(v => v.voteType === "lock");
            if (myExistingLock && myExistingLock.targetId !== targetId) {
              const lockBtn = document.createElement("button");
              lockBtn.className = "mtc-btn mtc-btn-lock mtc-btn-disabled";
              // D3b: pixel LOCK icon + Grandstander label
              lockBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(LOCK_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.lockedElsewhere")) + '</span>';
              lockBtn.disabled = true;
              actions.appendChild(lockBtn);
            } else {
              const lockBtn = document.createElement("button");
              lockBtn.className = "mtc-btn mtc-btn-lock";
              // D3b: pixel LOCK icon + Grandstander label
              lockBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(LOCK_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.lockIn")) + '</span>';
              lockBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (nightActionLocked) return;
                sendMafiaMaybeLock(targetId); // atomic maybe+lock; no-op while in flight (M11)
              });
              actions.appendChild(lockBtn);
            }
          } else {
            const nomBtn = document.createElement("button");
            nomBtn.className = "mtc-btn mtc-btn-suggest";
            // D3b: pixel POINT icon + Grandstander label
            nomBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(POINT_ART) + '</span><span class="mtc-label">' + escapeHtml(t("ui.mafia.nominate")) + '</span>';
            nomBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "maybe" });
            });
            actions.appendChild(nomBtn);
          }

          if (myVoteType !== "letsnot") {
            const objBtn = document.createElement("button");
            objBtn.className = "mtc-btn mtc-btn-object";
            // D3b: pixel X icon (spare/object shorthand)
            objBtn.innerHTML = '<span class="mtc-icon">' + pixelArtToSvg(X_ART) + '</span>';
            objBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "letsnot" });
            });
            actions.appendChild(objBtn);
          }
        }

        if (actions.children.length > 0) {
          card.appendChild(actions);
        }
      }
      list.appendChild(card);
    }
  }

  function computeVoteCounts(voterTargets) {
    // voterTargets: Record<string, Array<{ target, targetId, voteType }>>
    const counts = {}; // { [targetId]: { maybe: 0, lock: 0, letsnot: 0 } }
    for (const [, votes] of Object.entries(voterTargets)) {
      for (const v of votes) {
        if (!counts[v.targetId]) counts[v.targetId] = { maybe: 0, lock: 0, letsnot: 0 };
        if (v.voteType in counts[v.targetId]) counts[v.targetId][v.voteType]++;
      }
    }
    return counts;
  }

  function updateMafiaVoteStatus(msg) {
    // Update myMafiaVotes from server state
    const myVotes = msg.voterTargets[username];
    if (myVotes) {
      myMafiaVotes = myVotes.map(v => ({ targetId: v.targetId, voteType: v.voteType }));
    } else {
      myMafiaVotes = [];
    }

    // Update objected targets and alive mafia count
    mafiaObjectedTargets = msg.objectedTargets || {};
    aliveMafiaCount = msg.aliveMafiaCount || 0;
    lastVoterTargets = msg.voterTargets;

    // If consensus reached (lockedTarget set), don't re-render cards —
    // handleMafiaConfirmReady will collapse the list and show the Confirm button
    if (msg.lockedTarget) return;

    // For single mafia, don't re-render cards (consensus will trigger confirm)
    if (mafiaTeam.length <= 1) return;

    // Server echoed vote state — cards re-render from truth below, so a new
    // Lock In may be dispatched again (M11)
    pendingMafiaLockTarget = null;

    // Re-render cards on the target list
    const list = $("action-targets");
    const voteCounts = computeVoteCounts(msg.voterTargets);
    renderMafiaTargetCards(list, mafiaTargetPlayers, voteCounts);

    // Update mafia vote status text area with activity feed
    const details = $("mafia-vote-details");
    {
      // Build activity summary
      const lines = [];
      for (const [voterName, votes] of Object.entries(msg.voterTargets)) {
        for (const v of votes) {
          const feedKey = v.voteType === "maybe" ? "ui.mafia.nominates" : v.voteType === "lock" ? "ui.mafia.locksIn" : v.voteType === "letsnot" ? "ui.mafia.objectsTo" : null;
          if (feedKey) lines.push(escapeHtml(t(feedKey, { voter: voterName, target: v.target })));
        }
      }
      if (lines.length > 0) {
        details.innerHTML = lines.map(l => `<div class="narrator-line animate-in" style="font-size:13px;color:var(--text-secondary)">${l}</div>`).join("");
        $("mafia-vote-status").classList.remove("hidden");
      } else {
        details.textContent = "";
        $("mafia-vote-status").classList.add("hidden");
      }
    }
  }

  // ============================================================
  // SPECTATOR VIEW (dead players watching mafia night)
  // ============================================================
  function showSpectatorMafiaPanel(msg) {
    const panel = $("night-actions");
    panel.classList.remove("hidden");
    $("action-status").textContent = "";
    hideSlideConfirm();
    clearNightGate(); // spectator surfaces are never gated

    const list = $("action-targets");

    if (msg.lockedTarget) {
      // Consensus reached — show collapsed "chosen" view
      $("action-title").textContent = t("ui.spec.mafiaChosen");
      list.innerHTML = `<li class="spectator-locked">${escapeHtml(t("ui.spec.chosen", { name: msg.lockedTarget }))}</li>`;
      $("mafia-vote-status").classList.add("hidden");
    } else {
      // Deliberation in progress — show read-only cards
      $("action-title").textContent = t("ui.spec.mafiaDeliberating");

      // Update spectator-side tracking for chip rendering
      lastVoterTargets = msg.voterTargets || {};
      mafiaObjectedTargets = msg.objectedTargets || {};
      aliveMafiaCount = msg.aliveMafiaCount || 0;

      const voteCounts = computeVoteCounts(msg.voterTargets || {});
      renderMafiaTargetCards(list, msg.targets, voteCounts, true);

      // Activity feed
      const details = $("mafia-vote-details");
      const lines = [];
      for (const [voterName, votes] of Object.entries(msg.voterTargets || {})) {
        for (const v of votes) {
          const feedKey = v.voteType === "maybe" ? "ui.mafia.nominates" : v.voteType === "lock" ? "ui.mafia.locksIn" : v.voteType === "letsnot" ? "ui.mafia.objectsTo" : null;
          if (feedKey) lines.push(escapeHtml(t(feedKey, { voter: voterName, target: v.target })));
        }
      }
      if (lines.length > 0) {
        details.innerHTML = lines.map(l => `<div class="narrator-line animate-in" style="font-size:13px;color:var(--text-secondary)">${l}</div>`).join("");
        $("mafia-vote-status").classList.remove("hidden");
      } else {
        details.textContent = "";
        $("mafia-vote-status").classList.add("hidden");
      }
    }
  }

  function showSpectatorKillResult(msg) {
    const panel = $("night-actions");
    panel.classList.remove("hidden");
    hideSlideConfirm();
    clearNightGate();
    $("mafia-vote-status").classList.add("hidden");
    renderSpectatorLog();

    $("action-title").textContent = t("ui.spec.dawnApproaches");
    // Cause-neutral for the night batch: the dead-spectator list names WHO died,
    // not by whose hand. (This also fixes the old bug where a vigilante/joker
    // kill was mislabeled "killed by the Mafia".) The full reveal lives on the
    // end-game history screen.
    if (msg.kills && msg.kills.length > 0) {
      $("action-targets").innerHTML = msg.kills.map(k =>
        `<li class="spectator-kill-result">${escapeHtml(t("ui.spec.diedInNight", { name: k.name }))}</li>`
      ).join("");
    } else {
      // No kills \u27f9 a save-only night: no one died. Never name msg.targetName here:
      // it carries the SAVED player's name (dead spectators may see it), but the
      // death roll comes from `kills` only \u2014 a save must never imply a death. The
      // save itself is reported by the doctorMessage below.
      $("action-targets").innerHTML = `<li class="spectator-kill-result">${escapeHtml(t("ui.spec.noOneDied"))}</li>`;
    }
    $("action-status").textContent = msg.doctorMessageRef ? tMsg(msg.doctorMessageRef) : (msg.doctorMessage || "");
  }

  function showSpectatorNightPhase(msg) {
    const panel = $("night-actions");
    panel.classList.remove("hidden");
    hideSlideConfirm();
    clearNightGate();
    $("mafia-vote-status").classList.add("hidden");
    $("action-status").textContent = "";
    renderSpectatorLog();

    const list = $("action-targets");
    if (msg.subPhase === "doctor") {
      if (msg.isRoleAlive) {
        $("action-title").textContent = t("ui.spec.doctorDeliberating");
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.7">${escapeHtml(t("ui.spec.doctorChoosing"))}</li>`;
      } else {
        $("action-title").textContent = t("ui.spec.doctorFallen");
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.5">${escapeHtml(t("ui.spec.doctorNoSave"))}</li>`;
      }
    } else if (msg.subPhase === "detective") {
      if (msg.isRoleAlive) {
        $("action-title").textContent = t("ui.spec.detectiveInvestigating");
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.7">${escapeHtml(t("ui.spec.detectiveChoosing"))}</li>`;
      } else {
        $("action-title").textContent = t("ui.spec.detectiveFallen");
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.5">${escapeHtml(t("ui.spec.detectiveNoInvestigation"))}</li>`;
      }
    } else if (msg.subPhase === "vigilante") {
      // Phantom-safe: identical when the vigilante is dead vs out of ammo
      // (server sends isRoleAlive=false for both), so state can't be inferred.
      if (msg.isRoleAlive) {
        $("action-title").textContent = t("ui.spec.vigilanteAiming");
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.7">${escapeHtml(t("ui.spec.vigilanteDeciding"))}</li>`;
      } else {
        $("action-title").textContent = t("ui.spec.quietNight");
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.5">${escapeHtml(t("ui.spec.noShot"))}</li>`;
      }
    } else if (msg.subPhase === "resolving") {
      $("action-title").textContent = t("ui.spec.dawnApproaches");
      list.innerHTML = "";
    }
  }

  // Wraps the interpolated name in .log-target while keeping the sentence
  // translatable: the template is rendered with a sentinel, escaped, then the
  // sentinel is swapped for the highlighted span. Korean word order can put the
  // name anywhere in the line and this still works.
  function specLogHtml(key, name) {
    const SENTINEL = "\u0001";
    return escapeHtml(t(key, { name: SENTINEL }))
      .split(SENTINEL)
      .join('<span class="log-target">' + escapeHtml(name) + "</span>");
  }

  function formatSpectatorLogEntry(entry) {
    const div = document.createElement("div");
    div.className = "spectator-log-entry" + (entry.alive ? "" : " log-dead");
    if (entry.phase === "mafia") {
      div.innerHTML = specLogHtml("ui.spec.logMafia", entry.targetName);
    } else if (entry.phase === "doctor") {
      if (entry.alive && entry.targetName) {
        div.innerHTML = specLogHtml("ui.spec.logDoctor", entry.targetName);
      } else if (entry.alive) {
        // Official mode: the save is secret \u2014 the target name is withheld, so
        // render an anonymous line (mirrors the vigilante's held-fire phrasing).
        div.textContent = t("ui.spec.logDoctorAnon");
      } else {
        div.textContent = t("ui.spec.logDoctorFallen");
      }
    } else if (entry.phase === "detective") {
      if (entry.alive) {
        div.innerHTML = specLogHtml("ui.spec.logDetective", entry.targetName);
      } else {
        div.textContent = t("ui.spec.logDetectiveFallen");
      }
    } else if (entry.phase === "vigilante") {
      if (entry.alive && entry.targetName) {
        div.innerHTML = specLogHtml("ui.spec.logVigilante", entry.targetName);
      } else if (entry.alive) {
        div.textContent = t("ui.spec.logVigilanteHeld");
      } else {
        div.textContent = t("ui.spec.logVigilanteNoShot");
      }
    }
    return div;
  }

  function appendSpectatorLog(entry) {
    spectatorNightLog.push({ phase: entry.phase, targetName: entry.targetName, alive: entry.alive });
    const logEl = $("spectator-night-log");
    logEl.appendChild(formatSpectatorLogEntry(entry));
    logEl.classList.remove("hidden");
  }

  function renderSpectatorLog() {
    const logEl = $("spectator-night-log");
    logEl.innerHTML = "";
    if (spectatorNightLog.length === 0) {
      logEl.classList.add("hidden");
      return;
    }
    for (const entry of spectatorNightLog) {
      logEl.appendChild(formatSpectatorLogEntry(entry));
    }
    logEl.classList.remove("hidden");
  }

  function showJokerDeliberating() {
    const el = $("joker-spectator-status");
    if (el) {
      el.textContent = t("ui.spec.jokerChoosing");
      el.className = "joker-spectator-status deliberating";
      el.classList.remove("hidden");
    }
  }

  function showJokerResolved(targetName) {
    const el = $("joker-spectator-status");
    if (el) {
      el.textContent = t("ui.spec.jokerChosen", { name: targetName });
      el.className = "joker-spectator-status resolved";
      el.classList.remove("hidden");
    }
  }

  function handleMafiaConfirmReady(msg) {
    if (nightActionLocked) return;
    mafiaConfirmTarget = msg.targetName;

    // Collapse target list to only show the locked target
    const list = $("action-targets");
    list.innerHTML = `<li class="selected">${escapeHtml(msg.targetName)}</li>`;

    // Hide vote status
    $("mafia-vote-status").classList.add("hidden");

    $("action-status").textContent = "";

    setupSlideConfirm("mafia", () => {
      if (nightActionLocked) return;
      nightActionLocked = true;
      wsSend({ type: "confirm_mafia_kill" });
      // Show confirmed state
      list.innerHTML = `<li class="selected">${escapeHtml(mafiaConfirmTarget)} \u2714</li>`;
    }, () => {
      // Cancel: withdraw my lock to reopen the team vote. Toggling a lock off is
      // the same wire frame as locking; the server re-broadcasts the (now
      // unconsensused) state. Restore the picking UI now so there's no dead gap.
      mafiaConfirmTarget = null;
      wsSend({ type: "mafia_vote", targetId: msg.targetId, voteType: "lock" });
      if (mafiaTeam.length <= 1) {
        renderSingleMafiaTargets(list, mafiaTargetPlayers);
        $("mafia-vote-status").classList.add("hidden");
      } else {
        renderMafiaTargetCards(list, mafiaTargetPlayers, computeVoteCounts(lastVoterTargets));
        $("mafia-vote-status").classList.remove("hidden");
      }
    });
  }

  // ============================================================
  // DAY VOTING (Phase 3: per-vote anon, Phase 4: multi-vote)
  // ============================================================
  function showAdminDayControls() {
    if (!isAdmin) return;
    const panel = $("admin-day-controls");
    panel.classList.remove("hidden");

    // Update vote count label (Phase 4)
    const label = $("vote-count-label");
    if (dayVoteCount > 0) {
      label.textContent = t("ui.admin.voteDone", { n: dayVoteCount });
      $("admin-status-msg").textContent = t("ui.admin.voteFailed");
    } else {
      label.textContent = "";
      $("admin-status-msg").textContent = "";
    }

  }

  function populateAdminTargets(players) {
    const list = $("admin-target-list");
    list.innerHTML = players
      .filter((p) => p.isAlive)
      .map((p) => `<li data-id="${p.id}">${escapeHtml(p.username)}</li>`)
      .join("");

    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
        li.classList.add("selected");
        wsSend({ type: "call_vote", targetId: parseInt(li.dataset.id) });
      });
    });
  }

  // ============================================================
  // PLAYER ACCUSATIONS (day phase)
  // ============================================================
  function handleAccusationsUpdate(msg) {
    pendingAccusations = msg.accusations || [];
    accusationsMade = msg.accusationsMade || [];
    secondsMade = msg.secondsMade || [];
    if (msg.message) showNarratorMessage(msg.message);
    renderAccusePanel();
  }

  function iAccusedToday() { return accusationsMade.indexOf(userId) !== -1; }
  function iSecondedToday() { return secondsMade.indexOf(userId) !== -1; }

  // The accuse UI shows during the day only (voting, night and game_over hide
  // day-accuse-controls in their phase handlers).
  // LIVING players get the launcher + picker + per-row actions; DEAD players
  // get the same standing-accusations list READ-ONLY (mockup state 7): the
  // launcher and every row action come down and a spectator note takes their
  // place. Accusations are public by construction — accuser/target/seconder
  // names are broadcast room-wide and narrated to everyone — so nothing
  // role-derived reaches this surface.
  function renderAccusePanel() {
    const wrap = $("day-accuse-controls");
    if (currentPhase !== "day") {
      wrap.classList.add("hidden");
      $("accuse-picker").classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");

    // Spectator: no launcher, no picker, one status line instead.
    $("accuse-launch").classList.toggle("hidden", isDead);
    $("accuse-spectator-note").classList.toggle("hidden", !isDead);
    if (isDead) $("accuse-picker").classList.add("hidden");

    if (!isDead) {
      const btn = $("btn-accuse");
      if (iAccusedToday()) {
        btn.disabled = true;
        btn.textContent = t("ui.accuse.spent");
      } else {
        btn.disabled = false;
        btn.textContent = t("ui.accuse.launch");
      }
    }

    renderAccusationsList();
  }

  function accusationLabel(a) {
    // A sleep proposal is the SAME object as an accusation (targetId === null);
    // the moon glyph is the mockup's visual marker for it, decoration only.
    return a.targetId === null
      ? '<span class="acc-moon">\u{1F319}</span>' + escapeHtml(t("ui.accuse.movesSleep", { accuser: a.accuserName }))
      : escapeHtml(t("ui.accuse.accuses", { accuser: a.accuserName, target: a.targetName }));
  }

  // Standing accusations — mockup states 3 / 5a / 6 / 7. Rows are the Figma
  // 326x70 card with the label + a 12px status line on the left and exactly the
  // ONE action this viewer may take on the right. The engine drops invalid
  // messages silently, so eligibility is enforced here, locally:
  //   accuser  → Withdraw only   (own_accusation / withdraw is accuser-only)
  //   accused  → nothing, row dimmed  (accused_cannot_second)
  //   second already spent → nothing  (already_seconded)
  //   dead     → nothing at all, read-only spectator view
  function renderAccusationsList() {
    const panel = $("accusations-panel");
    const heading = $("accusations-heading");
    if (!pendingAccusations.length) {
      panel.innerHTML = "";
      heading.classList.add("hidden");
      return;
    }
    heading.classList.remove("hidden");
    panel.innerHTML = pendingAccusations.map((a) => {
      const mine = a.accuserId === userId;
      const accused = a.targetId === userId;
      // Eligible to second: living, not the accuser, not the accused, and
      // haven't already spent this day's second.
      const canSecond = !isDead
        && a.accuserId !== userId
        && a.targetId !== userId
        && !iSecondedToday();
      const secondBtn = canSecond
        ? '<button class="acc-pill acc-second" data-id="' + a.id + '">'
          + '<img class="acc-pill-thumb" src="/img/ui/thumb-up.png" alt="" draggable="false">' + escapeHtml(t("ui.accuse.second")) + '</button>'
        : "";
      const withdrawBtn = (mine && !isDead)
        ? '<button class="acc-pill acc-pill-alt acc-withdraw" data-id="' + a.id + '">' + escapeHtml(t("ui.accuse.withdraw")) + '</button>'
        : "";
      // Spectators get the label alone (mockup 7); the living get the status line.
      let status = "";
      if (!isDead) {
        if (mine) status = t("ui.accuse.statusYours");
        else if (accused) status = t("ui.accuse.statusAccused");
        else if (canSecond) status = t("ui.accuse.statusNeedsSecond");
        else status = t("ui.accuse.statusSpent");
      }
      const rowCls = "accusation-row"
        + (accused && !isDead ? " accusation-row-accused" : "")
        + (isDead ? " accusation-row-readonly" : "");
      return '<div class="' + rowCls + '" data-id="' + a.id + '">'
        + '<span class="accusation-main">'
        + '<span class="accusation-text">' + accusationLabel(a) + '</span>'
        + (status ? '<span class="accusation-status">' + escapeHtml(status) + '</span>' : "")
        + '</span>'
        + '<span class="accusation-actions">' + secondBtn + withdrawBtn + '</span>'
        + '</div>';
    }).join("");
    panel.querySelectorAll(".acc-second").forEach((b) => {
      b.addEventListener("click", () => wsSend({ type: "second_accusation", accusationId: parseInt(b.dataset.id) }));
    });
    panel.querySelectorAll(".acc-withdraw").forEach((b) => {
      b.addEventListener("click", () => wsSend({ type: "withdraw_accusation", accusationId: parseInt(b.dataset.id) }));
    });
  }

  function populateAccuseTargets() {
    const list = $("accuse-target-list");
    // Picker rows = the Figma player row (326x70 #232729 card) + the 14x14
    // colour dot from the Players tab. Self is excluded (the engine rejects a
    // self-accusation), and the sleep motion is the final row.
    const rows = knownPlayers
      .filter((p) => p.isAlive && p.id !== userId)
      .map((p) => {
        const dot = p.color
          ? '<span class="accuse-dot" style="background:' + nearestPlayerColor(p.color) + '"></span>'
          : '<span class="accuse-dot"></span>';
        return '<li data-id="' + p.id + '">' + dot + escapeHtml(p.username) + '</li>';
      })
      .join("");
    list.innerHTML = rows
      + '<li data-id="sleep" class="accuse-sleep-row">'
      + '<span class="accuse-dot accuse-dot-moon">\u{1F319}</span>' + escapeHtml(t("ui.accuse.proposeSleep")) + '</li>';
    accuseSelectedTarget = null;
    $("btn-accuse-confirm").disabled = true;
    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
        li.classList.add("selected");
        accuseSelectedTarget = li.dataset.id;
        $("btn-accuse-confirm").disabled = false;
      });
    });
  }

  $("btn-accuse").addEventListener("click", () => {
    populateAccuseTargets();
    $("accuse-picker").classList.remove("hidden");
  });
  $("btn-accuse-cancel").addEventListener("click", () => {
    $("accuse-picker").classList.add("hidden");
  });
  $("btn-accuse-confirm").addEventListener("click", () => {
    if (accuseSelectedTarget === null) return;
    const targetId = accuseSelectedTarget === "sleep" ? null : parseInt(accuseSelectedTarget);
    wsSend({ type: "accuse", targetId });
    $("accuse-picker").classList.add("hidden");
  });

  $("btn-force-dawn").addEventListener("click", () => {
    showConfirmSheet(
      t("ui.confirm.forceDawnTitle"),
      t("ui.confirm.forceDawnBody"),
      t("ui.confirm.forceDawnTitle"),
      () => { wsSend({ type: "force_dawn" }); },
      { danger: true }
    );
  });

  $("btn-end-day").addEventListener("click", () => {
    showConfirmSheet(
      t("ui.confirm.endDayTitle"),
      t("ui.confirm.endDayBody"),
      t("ui.confirm.endDayTitle"),
      () => {
        // AUDIO GESTURE CHAIN (spec §10): ensureAudioReady() runs FIRST, here,
        // synchronously inside the Confirm-button click handler's call stack —
        // no await/microtask sits between the tap and this call, so iOS Safari
        // keeps the user-gesture context that unlocks/plays night narration.
        ensureAudioReady();
        wsSend({ type: "end_day" });
      }
    );
  });

  function handleVoteCalled(msg, fromSync) {
    if (!fromSync) hasVoted = false;

    // D2: an active execution ballot is the engine's "voting" sub-state, but the
    // wire never broadcasts phase:"voting" (it arrives as vote_called over a
    // day phase). Flip data-phase here so the blood tint scoped to .voting-panel
    // lights up while the vote is live; handleVoteResult/cancel revert to the
    // underlying phase. (game_sync rejoin mid-vote routes through here too.)
    document.body.setAttribute("data-phase", "voting");
    // Re-sync the pinned base + chrome; data-phase="voting" drives the CSS ambience.
    applyEffectiveTheme();

    const panel = $("voting-panel");
    panel.classList.remove("hidden");
    // .voted dims the target block (270:1741 Execute / 270:1801 Spare); a fresh
    // ballot starts undimmed.
    panel.classList.toggle("voted", !!(isDead || hasVoted));
    $("admin-day-controls").classList.add("hidden");
    // Accusations hide while the ballot is live (rule 9).
    $("day-accuse-controls").classList.add("hidden");
    // Sleep ("town considers sleeping") ballot vs an ordinary execution vote.
    // 270:1649 copy: "Execute X?" (Figma drops the app's old "Vote:" prefix).
    // A sleep ballot carries targetName:"" on the wire, so it gets no portrait
    // and its thumbs take labels — a bare thumb is ambiguous with no target.
    if (msg.sleep) {
      $("voting-title").textContent = t("ui.vote.sleepTitle");
      $("vote-target-art").classList.add("hidden");
      $("vote-target-art").innerHTML = "";
      setVoteButtonFaces(true);
    } else {
      renderVotingTitle(msg.targetName);
      // 270:1649 "image 1" (78x78) — the generic verdict art, not a per-player
      // portrait (the app has none and the wire carries no image).
      $("vote-target-art").innerHTML = '<img src="/img/roles/dead.png" alt="" draggable="false">';
      $("vote-target-art").classList.remove("hidden");
      setVoteButtonFaces(false);
    }

    // Hide vote buttons if dead or already voted (rejoin), show otherwise
    if (isDead || hasVoted) {
      $("vote-buttons-wrapper").classList.add("hidden");
    } else {
      $("vote-buttons-wrapper").classList.remove("hidden");
      $("btn-vote-yes").classList.remove("selected");
      $("btn-vote-no").classList.remove("selected");
      $("btn-vote-yes").disabled = false;
      $("btn-vote-no").disabled = false;
    }

    // Show cancel vote button for admin
    if (isAdmin) {
      $("btn-cancel-vote").classList.remove("hidden");
    } else {
      $("btn-cancel-vote").classList.add("hidden");
    }
  }

  // 270:1649 thumb CTAs. A target-less (sleep) ballot adds the invented
  // "Sleep" / "Stay up" labels — Figma's Voting frame has no label slot
  // because it never modelled a no-target ballot.
  // "Execute {name}?" with the name kept inside its own #vote-target-name span
  // (CSS targets it). Rendered through a sentinel so Korean can place the name
  // anywhere in the sentence; textContent stays exactly the template's output.
  function renderVotingTitle(targetName) {
    const SENTINEL = "\u0001";
    const title = $("voting-title");
    title.textContent = "";
    const parts = t("ui.vote.execute", { name: SENTINEL }).split(SENTINEL);
    title.appendChild(document.createTextNode(parts[0] || ""));
    const span = document.createElement("span");
    span.id = "vote-target-name";
    span.textContent = targetName;
    title.appendChild(span);
    title.appendChild(document.createTextNode(parts.slice(1).join(SENTINEL)));
  }

  function setVoteButtonFaces(sleep) {
    const up = '<img class="thumb-art" src="/img/ui/thumb-up.png" alt="' + escapeHtml(t("ui.vote.yes")) + '" draggable="false">';
    const down = '<img class="thumb-art" src="/img/ui/thumb-down.png" alt="' + escapeHtml(t("ui.vote.no")) + '" draggable="false">';
    $("btn-vote-yes").innerHTML = up + (sleep ? '<span class="vote-cta-label">' + escapeHtml(t("ui.vote.sleep")) + '</span>' : "");
    $("btn-vote-no").innerHTML = down + (sleep ? '<span class="vote-cta-label">' + escapeHtml(t("ui.vote.stayUp")) + '</span>' : "");
  }

  $("btn-vote-yes").addEventListener("click", () => {
    if (hasVoted || isDead) return;
    ensureAudioReady();
    hasVoted = true;
    $("btn-vote-yes").classList.add("selected");
    $("btn-vote-yes").disabled = true;
    $("btn-vote-no").disabled = true;
    // 270:1741 Execute: the target block dims once your ballot is in.
    $("voting-panel").classList.add("voted");
    wsSend({ type: "cast_vote", approve: true });
  });

  $("btn-vote-no").addEventListener("click", () => {
    if (hasVoted || isDead) return;
    ensureAudioReady();
    hasVoted = true;
    $("btn-vote-no").classList.add("selected");
    $("btn-vote-yes").disabled = true;
    $("btn-vote-no").disabled = true;
    // 270:1801 Spare: same dimmed treatment.
    $("voting-panel").classList.add("voted");
    wsSend({ type: "cast_vote", approve: false });
  });

  $("btn-cancel-vote").addEventListener("click", () => {
    wsSend({ type: "cancel_vote" });
  });

  function updateVoteProgress(msg) {
    // 270:1649 tally copy: "2/4 votes cast" (no spaces around the slash).
    $("vote-progress").textContent = t("ui.vote.tally", { cast: msg.totalVotes, total: msg.total });
  }

  function handleVoteResult(msg) {
    $("voting-panel").classList.add("hidden");
    // D2: ballot over — drop the voting tint back to the live phase (day). If an
    // execution follows, the day/voting→night chain re-sets data-phase via
    // applyPhaseChange; a spared vote stays on day, which this restores.
    if (currentPhase) {
      document.body.setAttribute("data-phase", currentPhase);
      // Re-sync the pinned base + chrome for the restored phase ambience.
      applyEffectiveTheme();
    }
    // Sleep ballot: no execution/heartbreak overlay. A passed sleep vote is
    // followed by a plain day→night phase_change (handled without lastVoteResult
    // so no execution transition plays); the narrator carries the outcome.
    if (msg.sleep) {
      lastVoteResult = null;
      return;
    }

    lastVoteResult = msg;

    // Day-9: only the EXECUTED outcome gets a client-side line. A spare is
    // narrated once, by the engine (EXECUTION_SPARED_MESSAGES on the spared
    // phase_change) — the old "{name} has been spared." here was a second,
    // contradicting string for the same event.
    if (msg.executed) showNarratorMessage({ key: "ui.vote.executed", params: { name: msg.targetName }, text: t("ui.vote.executed", { name: msg.targetName }) });
  }

  // ============================================================
  // TRANSCRIPT
  // ============================================================
  $("btn-transcript").addEventListener("click", () => {
    renderTranscript();
    $("modal-transcript").classList.remove("hidden");
  });

  $("btn-close-transcript").addEventListener("click", () => {
    $("modal-transcript").classList.add("hidden");
  });

  // Dead overlay click-to-dismiss (for all players) — dismissing reveals the
  // live room view (spectator panels) beneath. The "WATCH THE TOWN" button uses
  // this same dismiss path; no new spectate flow is invented.
  $("dead-overlay").addEventListener("click", () => {
    $("dead-overlay").classList.add("hidden");
    $("dead-dismiss-hint").classList.add("hidden");
  });

  // Joker win overlay (D6: its own #joker-win-overlay, no longer reuses the dead
  // overlay). Click-to-dismiss reveals the room/gameover view beneath, same as
  // the dead overlay. GO-D6a: kept because official joker mode announces this
  // win MID-GAME (the game then continues) — no game-over screen exists yet —
  // and because it is the joint-victory carrier. Restyled to the Victory frame:
  // the joker raster on its band radial.
  $("joker-win-overlay").addEventListener("click", () => {
    $("joker-win-overlay").classList.add("hidden");
  });

  function showJokerWinOverlay(jokerName) {
    $("joker-win-overlay").classList.remove("hidden");
    $("joker-trophy-art").innerHTML = winArtHtml("joker");
    // Winner name comes from the existing payload field only.
    $("joker-win-name").textContent = jokerName
      ? t("ui.joker.lastLaughName", { name: jokerName })
      : t("ui.joker.jointVictory");
  }

  // ============================================================
  // SETTINGS MODAL
  // ============================================================
  function openSettingsModal() {
    $("toggle-sound").checked = soundEnabled;
    updateThemeModeControl(); // D5.5b: reflect the active theme mode in the segmented control
    $("toggle-hide-mafia-tag").checked = hideMafiaTag;
    // F9 (Figma 130:370 lines 245-253): the Room code row is unconditional for
    // everyone in a room, not admin-only. Not a new leak — every player already
    // reads the code off the lobby nav (index.html #lobby-code-player).
    if (gameCode) {
      $("settings-room-code").classList.remove("hidden");
      $("settings-room-code-value").textContent = gameCode;
    } else {
      $("settings-room-code").classList.add("hidden");
    }
    // Show end-game button only for admin during active game
    if (isAdmin && currentPhase && currentPhase !== "game_over") {
      $("settings-end-game").classList.remove("hidden");
    } else {
      $("settings-end-game").classList.add("hidden");
    }
    // Show leave-game button for non-admin players during active game
    if (!isAdmin && gameCode && currentPhase && currentPhase !== "game_over") {
      $("settings-leave-game").classList.remove("hidden");
    } else {
      $("settings-leave-game").classList.add("hidden");
    }
    $("modal-settings").classList.remove("hidden");
  }

  $("btn-settings").addEventListener("click", openSettingsModal);
  $("btn-settings-lobby-admin").addEventListener("click", openSettingsModal);
  $("btn-settings-lobby-player").addEventListener("click", openSettingsModal);

  $("btn-close-settings").addEventListener("click", closeSettingsModal);

  $("modal-settings").addEventListener("click", (e) => {
    if (e.target === $("modal-settings")) closeSettingsModal();
  });

  function closeSettingsModal() {
    $("modal-settings").classList.add("hidden");
  }

  // ============================================================
  // ROLES IN PLAY MODAL (public lineup — every player, any time)
  // ============================================================
  const ROSTER_ROLE_KEYS = { mafia: "ui.role.mafia", doctor: "ui.role.doctor", detective: "ui.role.detective", vigilante: "ui.role.vigilante", hunter: "ui.role.hunter", joker: "ui.role.joker", citizen: "ui.role.citizen" };

  function renderRoster(roster) {
    const list = $("roster-list");
    if (!roster || !Array.isArray(roster.roles) || roster.roles.length === 0) {
      list.innerHTML = `<p class="roster-empty">${escapeHtml(t("ui.roster.empty"))}</p>`;
      return;
    }
    const modes = roster.modes || {};
    let html = roster.roles.map((e) => {
      const mode = modes[e.role];
      const badge = mode ? `<span class="roster-mode-badge roster-mode-${mode}">${escapeHtml(t(mode === "official" ? "ui.mode.official" : "ui.mode.house").toUpperCase())}</span>` : "";
      return `
      <div class="roster-row" data-role="${e.role}" style="--rc:var(--role-${e.role});--rc-ink:var(--role-${e.role}-ink)">
        <span class="roster-name">${escapeHtml(ROSTER_ROLE_KEYS[e.role] ? t(ROSTER_ROLE_KEYS[e.role]) : e.role)}</span>
        ${badge}
        <span class="roster-count">${escapeHtml(t("ui.roster.count", { n: e.count }))}</span>
      </div>`;
    }).join("");
    const mods = [];
    if (roster.godfather) mods.push(t("ui.role.godfather"));
    if (roster.lovers) mods.push(t("ui.role.lovers"));
    if (mods.length) html += `<div class="roster-mods">+ ${mods.join(" · ")}</div>`;
    list.innerHTML = html;
  }

  // ── Pre-game "Roles in Play" (Figma F6 — 268:566 people icon -> 268:640) ──
  //
  // PREMISE VERIFIED: the pre-game lineup is derivable EXACTLY on the client,
  // so P3 ships no server change for this. `lobby_update` already carries the
  // whole `game.settings` object plus the `players` array (src/server.ts:80-92),
  // and role COUNTS in assignRoles() are a pure function of (player count,
  // settings) — the shuffle only decides WHICH player gets a role, never how
  // many of each exist. Nothing identity-bearing is added to the wire.
  //
  // Mirrors src/game-engine.ts assignRoles() step for step:
  //   :831-832  mafia = min(settings.mafiaCount, floor(total/3)), floored at 1
  //   :837-839  mafia seats consumed only while idx < total
  //   :842-865  doctor, detective, joker, hunter, vigilante — in THAT order,
  //             one seat each, and only if enabled with a seat left
  //   :868-871  every remaining seat is a citizen
  //   :888      lovers is a per-player FLAG (needs total >= 2), not a seat
  //   :903-907  godfather is a FLAG on one mafioso (enabled && mafia >= 2)
  // ...and rosterSummary() for presentation (src/game-engine.ts:660-678):
  //   ROSTER_ORDER (:651) row order, zero-count roles omitted, doctor/joker
  //   mode badges only when that role is actually dealt.
  function deriveLobbyRoster(settings, total) {
    if (!settings) return null;
    let mafia = Math.min(Number(settings.mafiaCount), Math.floor(total / 3));
    if (!(mafia >= 1)) mafia = 1;                                  // engine :832
    let idx = Math.min(mafia, total);                              // engine :837
    const counts = { mafia: idx };
    const take = (role, enabled) => {                              // engine :842-865
      if (enabled && idx < total) { counts[role] = 1; idx++; }
    };
    take("doctor", settings.enableDoctor);
    take("detective", settings.enableDetective);
    take("joker", settings.enableJoker);
    take("hunter", settings.enableHunter);
    take("vigilante", settings.enableVigilante);
    counts.citizen = Math.max(0, total - idx);                     // engine :868-871

    const ROSTER_ORDER = ["mafia", "doctor", "detective", "vigilante", "hunter", "joker", "citizen"];
    const roles = ROSTER_ORDER
      .filter((r) => (counts[r] || 0) > 0)
      .map((r) => ({ role: r, count: counts[r] }));
    const modes = {};
    if (counts.doctor) modes.doctor = settings.doctorMode;
    if (counts.joker) modes.joker = settings.jokerMode;
    return {
      roles,
      godfather: !!settings.enableGodfather && mafia >= 2,         // engine :903
      lovers: !!settings.enableLovers && total >= 2,               // engine :888
      ...(Object.keys(modes).length ? { modes } : {}),
    };
  }

  function openRosterModal() {
    renderRoster(currentRoster);
    $("modal-roster").classList.remove("hidden");
  }
  /** Same modal, pre-game: the lineup only — never a player→role pairing. */
  function openLobbyRosterModal() {
    renderRoster(deriveLobbyRoster(lobbySettings, lobbyPlayerCount));
    $("modal-roster").classList.remove("hidden");
  }
  function closeRosterModal() {
    $("modal-roster").classList.add("hidden");
  }
  $("btn-roster").addEventListener("click", openRosterModal);
  $("btn-roster-lobby-admin").addEventListener("click", openLobbyRosterModal);
  $("btn-roster-lobby-player").addEventListener("click", openLobbyRosterModal);
  $("btn-close-roster").addEventListener("click", closeRosterModal);
  $("modal-roster").addEventListener("click", (e) => {
    if (e.target === $("modal-roster")) closeRosterModal();
  });

  // ============================================================
  // D8: IN-WORLD CONFIRM SHEET (replaces native confirm())
  // ============================================================
  // CRITICAL audio-gesture contract (spec §10): native confirm() was
  // SYNCHRONOUS — End Day's ensureAudioReady() ran in the SAME user gesture as
  // the click. This sheet is async (the user taps Confirm later), so the
  // Confirm-button click handler IS the user gesture. onConfirm() MUST be
  // invoked SYNCHRONOUSLY from that listener — no await, no .then, no
  // setTimeout — or iOS Safari loses the gesture context and night narration
  // audio silently fails to unlock/play. The OK listener below is registered
  // ONCE and calls the stored callback directly in-stack.
  var _confirmOnConfirm = null;

  function hideConfirmSheet() {
    $("confirm-sheet").classList.add("hidden");
    _confirmOnConfirm = null;
  }

  // showConfirmSheet(title, body, confirmLabel, onConfirm, opts?)
  //   opts.danger=true → red Confirm button (destructive actions).
  function showConfirmSheet(title, body, confirmLabel, onConfirm, opts) {
    opts = opts || {};
    $("confirm-sheet-title").textContent = title;
    $("confirm-sheet-body").textContent = body;
    var ok = $("confirm-sheet-ok");
    ok.textContent = confirmLabel || t("ui.common.confirm");
    // danger styling: swap the amber primary for the blood-red danger fill.
    ok.classList.toggle("btn-danger", !!opts.danger);
    ok.classList.toggle("btn-primary", !opts.danger);
    _confirmOnConfirm = onConfirm;
    $("confirm-sheet").classList.remove("hidden");
  }

  // OK button: registered ONCE. Invokes the stored callback SYNCHRONOUSLY (real
  // user gesture) so ensureAudioReady() inside an onConfirm keeps iOS audio
  // unlocked. Do NOT make this async / await the callback / defer it.
  $("confirm-sheet-ok").addEventListener("click", () => {
    var cb = _confirmOnConfirm;
    hideConfirmSheet();
    if (cb) cb(); // SYNCHRONOUS — preserves the user-gesture call stack
  });

  $("confirm-sheet-cancel").addEventListener("click", hideConfirmSheet);

  // Backdrop tap dismisses with no action.
  $("confirm-sheet").addEventListener("click", (e) => {
    if (e.target === $("confirm-sheet")) hideConfirmSheet();
  });

  $("toggle-sound").addEventListener("change", (e) => {
    soundEnabled = e.target.checked;
    if (!soundEnabled) flushSoundQueue();
  });

  // Dark mode toggle
  // D2: sync the browser-chrome <meta name="theme-color"> to the page bg so it
  // tracks BOTH the theme AND the data-phase remap (night→navy, day→warm, etc.).
  // Reading the computed --bg keeps one source of truth: the CSS cascade already
  // resolves [data-theme] × [data-phase], so we just mirror the result.
  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
    if (bg) meta.setAttribute("content", bg);
  }

  // ============================================================
  // TWO-WAY THEME PREFERENCE (Dark / Light) — Dark is the default.
  // Pure client-local display pref. NEVER sends a wire message and NEVER touches
  // game state — switching is display-only. (The old "Dynamic" phase-driven base
  // was removed; the base is now always the pinned mode.)
  // ----------------------------------------------------------------
  // EFFECTIVE BASE contract: data-theme (dark|light) is ALWAYS set and is the
  // pinned base. The §4 token remap still keys on [data-theme]×[data-phase] in
  // CSS (e.g. the navy night takeover, gated to the dark base), so phase ambience
  // still layers on top of whichever base the user picked.
  // ============================================================
  let themeMode = "dark"; // dark | light

  // The effective base is simply the pinned mode (no phase logic anymore).
  function effectiveTheme() {
    return themeMode === "light" ? "light" : "dark";
  }

  // Apply the pinned base, set data-theme, sync chrome. Retains the optional
  // phaseOverride arg so existing call sites stay valid (it's now ignored — the
  // base no longer depends on the phase; data-phase still drives CSS ambience).
  function applyEffectiveTheme() {
    document.documentElement.setAttribute("data-theme", effectiveTheme());
    syncThemeColor();
  }

  // Persist + apply a new mode immediately.
  function setThemeMode(mode) {
    themeMode = mode === "light" ? "light" : "dark";
    localStorage.setItem("themeMode", themeMode);
    applyEffectiveTheme();
    updateThemeModeControl();
  }

  // Reflect the active mode in the segmented control (if present in the DOM).
  function updateThemeModeControl() {
    const seg = document.getElementById("theme-mode-control");
    if (!seg) return;
    seg.querySelectorAll("[data-mode]").forEach((b) => {
      const on = b.getAttribute("data-mode") === themeMode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // Initialize theme mode: only "light" is honored as an alternative; anything
  // else (including a legacy "dynamic" pref or the old 'mafia_dark_mode' flag)
  // falls back to the dark default.
  (function initThemeMode() {
    const saved = localStorage.getItem("themeMode");
    if (saved === "light") {
      themeMode = "light";
    } else if (saved === "dark") {
      themeMode = "dark";
    } else {
      // Legacy "dynamic" / unset / old 'mafia_dark_mode' → fall back to dark,
      // honoring only an explicit old light preference.
      themeMode = localStorage.getItem("mafia_dark_mode") === "false" ? "light" : "dark";
      localStorage.setItem("themeMode", themeMode);
    }
    applyEffectiveTheme();
  })();

  // Wire the segmented control (3 buttons). Display-only: no wire, no game state.
  const themeModeControl = document.getElementById("theme-mode-control");
  if (themeModeControl) {
    themeModeControl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      setThemeMode(btn.getAttribute("data-mode"));
    });
  }

  $("toggle-hide-mafia-tag").addEventListener("change", (e) => {
    hideMafiaTag = e.target.checked;
    wsSend({ type: "update_player_pref", key: "hide_mafia_tag", value: hideMafiaTag });
    updatePlayerStatus();
  });

  $("btn-end-game").addEventListener("click", () => {
    showConfirmSheet(
      t("ui.confirm.endGameTitle"),
      t("ui.confirm.endGameBody"),
      t("ui.confirm.endGameTitle"),
      () => {
        wsSend({ type: "end_game" });
        closeSettingsModal();
      },
      { danger: true }
    );
  });

  $("btn-settings-leave").addEventListener("click", () => {
    showConfirmSheet(
      t("ui.confirm.leaveGameTitle"),
      t("ui.confirm.leaveGameBody"),
      t("ui.confirm.leaveGameTitle"),
      () => {
        wsSend({ type: "leave_game" });
        localStorage.removeItem("mafia_game_code");
        $("event-history").classList.add("hidden");
        gameCode = null;
        isAdmin = false;
        closeSettingsModal();
        showScreen("menu");
      },
      { danger: true }
    );
  });

  // ============================================================
  // GAME OVER (Phase 1: show all roles)
  // ============================================================

  function handleGameOver(msg) {
    $("dead-overlay").classList.add("hidden");
    $("joker-win-overlay").classList.add("hidden"); // D6: own element now
    $("revenge-wait").classList.add("hidden"); // C5b: e.g. force-end while gated
    closeSettingsModal();

    // Reset gameplay state but keep gameCode/isAdmin for Play Again
    const savedIsAdmin = isAdmin;
    myRole = null;
    myIsGodfather = false;
    vigilanteBulletUsed = false;
    isLover = false;
    mafiaTeam = [];
    godfatherName = null;
    isDead = false;
    jokerWonOverlayShown = false;
    currentPhase = null;
    previousPhase = null;
    dayVoteCount = 0;
    jokerJointWinner = !!msg.jokerJointWinner;

    if (msg.forceEnded) {
      // Force-ended: no suspense, show immediately
      showGameOverScreen(msg, savedIsAdmin);
      renderRoleReveal(msg.players, false);
      showGameOverButtons(savedIsAdmin);
    } else {
      // Natural end: suspense reveal
      showGameOverSuspense(msg, savedIsAdmin);
    }
  }

  // ---- P6 game-over constants -------------------------------------------
  // Victory art: the Figma "image 8" raster of each band, downscaled to 800px
  // from docs/figma-raw/assets/fills into public/img/ui/
  // (c902a3b3… campfire → town, 6252da56… revolver → mafia,
  //  f0e46bd3… jester mask → joker).
  const WIN_ART_SRC = {
    town: "/img/ui/win-town.png",
    mafia: "/img/ui/win-mafia.png",
    joker: "/img/ui/win-joker.png",
  };
  function winArtHtml(band) {
    return WIN_ART_SRC[band] ? `<img src="${WIN_ART_SRC[band]}" alt="" draggable="false">` : "";
  }
  // Which of the three Figma bands a game_over payload belongs to. Force-ended
  // games carry winner:"town" on the wire but concluded nothing, so they take
  // the neutral variant (GO-D13) — checked FIRST.
  function gameOverBand(msg) {
    if (msg.forceEnded) return "neutral";
    return WIN_ART_SRC[msg.winner] ? msg.winner : "neutral";
  }
  const WIN_TITLE_KEYS = { town: "ui.gameover.townWins", mafia: "ui.gameover.mafiaWins", joker: "ui.gameover.jokerWins" };
  // GO-D3b: the canonical Figma narrative is what the SCREEN shows; the
  // narrator's randomised pools (src/narrator.ts TOWN_WIN_MESSAGES /
  // MAFIA_WIN_MESSAGES / JOKER_WIN_MESSAGES) keep feeding the transcript
  // untouched — they still ride phase_change.messages, which is where the
  // transcript is built. Nothing on the wire changes.
  const FIGMA_WIN_KEYS = {
    town: "ui.gameover.figmaTown",
    mafia: "ui.gameover.figmaMafia",
    // 332:6071 is name-parameterised, matching Narrator.jokerWin(name)'s shape.
    joker: "ui.gameover.figmaJoker",
  };
  function gameOverNarrative(band, msg) {
    const key = FIGMA_WIN_KEYS[band];
    if (!key) return msg.messageRef ? tMsg(msg.messageRef) : (msg.message || "");
    if (band !== "joker") return t(key);
    // The joker's name is not a wire field on game_over; it is derivable from
    // the reveal roster the same payload already carries.
    const joker = (msg.players || []).find((p) => p.role === "joker");
    if (joker) return t(key, { name: joker.username });
    if (msg.messageRef) return tMsg(msg.messageRef);
    return msg.message || t(key, { name: t("ui.gameover.theJoker") });
  }

  function showGameOverScreen(msg, admin) {
    showScreen("gameover");
    const band = gameOverBand(msg);
    const screenEl = $("screen-gameover");
    screenEl.classList.remove("win-town", "win-mafia", "win-joker", "win-neutral");
    screenEl.classList.add("win-" + band);

    // Victory art on its band radial (278-2780 "After" 244x245 / 278-2810
    // "Skull" 183x183.75). GO-D13: the force-ended variant draws no art and no
    // verdict line — there is no winner to celebrate.
    const art = band === "neutral" ? "" : winArtHtml(band);
    $("gameover-art").innerHTML = art;
    $("gameover-art-sm").innerHTML = art;
    $("gameover-pre").classList.toggle("hidden", band === "neutral");
    $("gameover-details-pre").classList.toggle("hidden", band === "neutral");

    const title = band === "neutral" ? t("ui.gameover.gameOver") : t(WIN_TITLE_KEYS[msg.winner]);
    $("gameover-title").textContent = title;
    $("gameover-details-title").textContent = title;
    // Headline ink now rides the screen's band class (--win-ink); clear any
    // inline colour a previous game left behind.
    $("gameover-title").style.color = "";
    // Force-ended games keep the server's explanatory line ("The host has left
    // the game.") — it is information, not narrative.
    $("gameover-message").textContent = band === "neutral" ? (msg.messageRef ? tMsg(msg.messageRef) : (msg.message || "")) : gameOverNarrative(band, msg);

    // CTAs animate in only once the reveal has played (Figma animates the same
    // group opacity 0% → 100%).
    $("gameover-ctas").classList.add("hidden");
    $("gameover-buttons").classList.add("hidden");
    $("gameover-buttons-player").classList.add("hidden");
    $("gameover-danger").classList.add("hidden");
    roleRevealReplayed = false;
    setGameOverTab("players");
    showGameOverOptionsView();
    renderGameHistory();
  }

  // ---- The two game-over views (Figma "Game options" ↔ "View game details") --
  function showGameOverOptionsView() {
    $("gameover-view-options").classList.remove("hidden");
    $("gameover-view-details").classList.add("hidden");
  }
  function showGameOverDetailsView() {
    $("gameover-view-options").classList.add("hidden");
    $("gameover-view-details").classList.remove("hidden");
    replayRoleReveal();
  }
  // GO-D2b: the details screen's Game Tabs instance. Independent of the in-game
  // #event-history tabs, which are force-reset on phase changes.
  function setGameOverTab(tab) {
    document.querySelectorAll(".go-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.gotab === tab);
    });
    $("go-panel-events").classList.toggle("hidden", tab !== "events");
    $("go-panel-players").classList.toggle("hidden", tab !== "players");
  }
  document.querySelectorAll(".go-tab").forEach((b) => {
    b.addEventListener("click", () => setGameOverTab(b.dataset.gotab));
  });
  $("btn-view-details").addEventListener("click", showGameOverDetailsView);
  $("btn-details-back").addEventListener("click", showGameOverOptionsView);
  $("btn-details-lobby").addEventListener("click", () => {
    // Same capability split the options view draws (C12): the admin's lobby
    // return re-opens settings for everyone, a player's returns only them.
    wsSend({ type: isAdmin ? "return_to_lobby" : "player_return_to_lobby" });
  });

  // Game-over history label map (death causes → readable text).
  const GAME_HISTORY_LABELS = {
    kill: "ui.history.killedByMafia",
    save: "ui.history.savedByDoctor",
    execution: "ui.history.executedByVote",
    lover_death: "ui.event.diedOfHeartbreak",
    joker_haunt: "ui.history.hauntedByJoker",
    hunter_revenge: "ui.event.shotByHunter",
    vigilante_shot: "ui.history.shotByVigilante",
    death: "ui.event.diedInNight", // defensive fallback (see renderGameHistory)
  };
  // Test handle: pins the game-over history labels. Not read by any app code.
  // The map itself now holds KEYS, but this handle keeps exposing the RENDERED
  // labels — that is what a player actually sees, so the existing assertions
  // stay meaningful and automatically follow the active language.
  Object.defineProperty(window, "__gameOverHistoryLabels", {
    configurable: true,
    get() {
      const out = {};
      for (const type in GAME_HISTORY_LABELS) {
        if (Object.prototype.hasOwnProperty.call(GAME_HISTORY_LABELS, type)) {
          out[type] = t(GAME_HISTORY_LABELS[type]);
        }
      }
      return out;
    },
  });

  function renderGameHistory() {
    const container = $("game-history");
    container.innerHTML = "";
    // Filter to kills, saves, executions, lover deaths (skip spared)
    const events = lastGameEvents.filter((e) => e.type !== "spared");
    if (events.length === 0) return;

    const LABELS = GAME_HISTORY_LABELS;

    // Group by round, split night vs day
    // Night events: kill, save, lover_death/hunter_revenge following a kill
    // Day events: execution, lover_death/hunter_revenge following an execution
    const grouped = {};
    let lastPhase = "night";
    for (const ev of events) {
      if (!grouped[ev.round]) grouped[ev.round] = { night: [], day: [] };
      // "death" is the defensive neutral fallback if a projected event ever
      // reaches this FULL-detail reveal (game_over ships the unprojected
      // history, so normally the real cause labels arrive — including
      // vigilante_shot, which must group as a night death like the mafia kill).
      if (ev.type === "kill" || ev.type === "save" || ev.type === "joker_haunt" || ev.type === "vigilante_shot" || ev.type === "death") {
        grouped[ev.round].night.push(ev);
        lastPhase = "night";
      } else if (ev.type === "execution") {
        grouped[ev.round].day.push(ev);
        lastPhase = "day";
      } else if (ev.type === "lover_death" || ev.type === "hunter_revenge") {
        // No phase field (DeathEventType, like joker_haunt): follow the death
        // that triggered it via lastPhase — dawn-gate revenge rides the night
        // kill, vote-gate revenge rides the day execution. Same precedent as
        // lover_death.
        grouped[ev.round][lastPhase].push(ev);
      }
    }

    // GO-D2b: rendered as Game Tabs' two-column Events grid: the "Night N" /
    // "Day N" label in the left column, that block's lines stacked in the
    // right, a 1px rule between blocks (specs/components/287-3437). The
    // .game-history-round / .game-history-item classes are unchanged.
    const appendBlock = (label, evs) => {
      if (evs.length === 0) return;
      const row = document.createElement("div");
      row.className = "go-history-round";
      const header = document.createElement("div");
      header.className = "game-history-round";
      header.textContent = label;
      row.appendChild(header);
      const list = document.createElement("div");
      list.className = "go-history-events";
      for (const ev of evs) {
        const item = document.createElement("div");
        item.className = `game-history-item ${ev.type}`;
        item.textContent = t("ui.event.line", { name: ev.playerName, label: LABELS[ev.type] ? t(LABELS[ev.type]) : ev.type });
        list.appendChild(item);
      }
      row.appendChild(list);
      container.appendChild(row);
    };

    for (const round of Object.keys(grouped).sort((a, b) => a - b)) {
      const { night, day } = grouped[round];
      appendBlock(t("ui.history.night", { n: round }), night);
      appendBlock(t("ui.history.day", { n: round }), day);
    }
  }

  // GO-D1c: Figma's Game options frame offers ONE CTA ("Return to lobby", to
  // Lobby/Host for the admin per 332:6290, Lobby/Player otherwise). The app's
  // three wired admin capabilities have no Figma equivalent and are kept (R7):
  // Play again (restart_game) is the primary, Return to lobby (return_to_lobby)
  // the secondary, Close room (close_room) the destructive tail. Players get
  // Return to lobby (player_return_to_lobby) and the header's Leave room.
  function showGameOverButtons(admin) {
    if (admin) {
      $("gameover-buttons").classList.remove("hidden");
      $("gameover-buttons-player").classList.add("hidden");
      $("gameover-danger").classList.remove("hidden");
    } else {
      $("gameover-buttons-player").classList.remove("hidden");
      $("gameover-buttons").classList.add("hidden");
      $("gameover-danger").classList.add("hidden");
    }
    $("gameover-ctas").classList.remove("hidden");
  }

  function showGameOverSuspense(msg, admin) {
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    // P6: this beat IS Figma's Victory screen (278:2772 / 332:5939 / 332:6071)
    // — the band raster on its radial glow under the sentence-case 24px
    // "The final verdict", holding from the opening line through the winner
    // reveal. A winnerless end keeps the neutral trophy.
    const band = gameOverBand(msg);
    const winBeat = band === "neutral" ? "beat-gameover" : "beat-win-" + band;
    setSuspenseStage(
      band === "neutral" ? TROPHY_ART : null,
      t("ui.overlay.finalVerdict"),
      winBeat,
      band === "neutral" ? "" : winArtHtml(band),
    );
    text.textContent = t("ui.overlay.gameIsOver");
    text.style.color = "";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    // The overlay is always black, so the band hex is used directly (its
    // theme-aware --win-*-ink partner is for the game-over screen).
    const winColor = band === "neutral" ? "#FFFFFF" : `var(--win-${band})`;
    const winText = band === "neutral" ? t("ui.gameover.gameOver") : t(WIN_TITLE_KEYS[msg.winner]);

    // Beat 2: winner reveal
    setTimeout(() => {
      text.textContent = winText;
      text.style.color = winColor;
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 2200);

    // Fade out overlay, show gameover screen behind it
    setTimeout(() => {
      // Prepare gameover screen (title/message visible, roles hidden)
      showGameOverScreen(msg, admin);
      renderRoleReveal(msg.players, true); // hidden=true
      overlay.classList.add("fade-out");
    }, 4000);

    // Remove overlay, start staggered role reveal
    setTimeout(() => {
      overlay.classList.add("hidden");
      overlay.classList.remove("fade-out");
      text.style.color = "";
      clearSuspenseStage();
      revealRolesStaggered(msg.players, admin);
    }, 4800);
  }

  function renderRoleReveal(players, hidden) {
    const container = $("role-reveal");
    if (!players || players.length === 0) {
      container.innerHTML = "";
      return;
    }

    // Build lover pairs lookup
    const loverPairs = {};
    for (const p of players) {
      if (p.isLover && p.loverId) {
        const partner = players.find((o) => o.id === p.loverId);
        if (partner) loverPairs[p.id] = partner.username;
      }
    }

    // Sort: non-mafia first, then mafia
    const sorted = [...players].sort((a, b) => {
      const aIsMafia = a.role === "mafia" ? 1 : 0;
      const bIsMafia = b.role === "mafia" ? 1 : 0;
      return aIsMafia - bIsMafia;
    });

    // 278:2810 row: name on the left, the role chip on the right. GO-D12 keeps
    // the app's five other disclosures in the right-hand cluster (the sixth,
    // mafia-last ordering, is the sort above). Chip labels are Title Case via
    // CSS text-transform, so the raw role name stays in the DOM.
    const hiddenClass = hidden ? " reveal-hidden" : "";
    container.innerHTML = sorted
      .map((p) => {
        const dead = !p.isAlive;
        const loverText = loverPairs[p.id] ? `<span class="role-reveal-lover">${pixelArtToSvg(HEART_ART)} ${escapeHtml(loverPairs[p.id])}</span>` : "";
        const deadText = dead ? '<span class="role-reveal-dead">' + escapeHtml(t("ui.gameover.dead")) + '</span>' : "";
        const trophyText = (jokerJointWinner && p.role === "joker") ? `<span class="role-reveal-trophy">${pixelArtToSvg(TROPHY_ART)}</span>` : "";
        // The Godfather reveals as "Godfather" (role stays "mafia" under the hood).
        const revealRole = p.isGodfather ? "godfather" : (p.role || "?");
        return `<div class="role-reveal-item${dead ? " dead" : ""}${hiddenClass}" data-role="${revealRole}">
          <span class="role-reveal-name">${escapeHtml(p.username)}</span>
          <span class="role-reveal-tags">
            ${trophyText}
            ${loverText}
            ${deadText}
            <span class="role-reveal-role ${revealRole}">${escapeHtml(revealRole)}</span>
          </span>
        </div>`;
      })
      .join("");
  }

  // GO-D12: the staggered reveal is one of the six kept disclosures, but the
  // Figma flow puts the roster behind a tap, so the auto-stagger (which gates
  // the CTAs) would play on a view nobody is looking at. Opening the details
  // view replays it ONCE, and only if the auto-stagger already finished — a
  // mid-flight reveal is left alone.
  let roleRevealReplayed = false;
  function replayRoleReveal() {
    if (roleRevealReplayed) return;
    const items = Array.from($("role-reveal").querySelectorAll(".role-reveal-item"));
    if (items.length === 0) return;
    if (!items.every((el) => el.classList.contains("reveal-show"))) return;
    roleRevealReplayed = true;
    items.forEach((el) => {
      el.classList.remove("reveal-show");
      el.classList.add("reveal-hidden");
    });
    void $("role-reveal").offsetWidth;
    items.forEach((el, i) => {
      setTimeout(() => {
        el.classList.remove("reveal-hidden");
        el.classList.add("reveal-show");
      }, i * 120);
    });
  }

  function revealRolesStaggered(players, admin) {
    const items = Array.from($("role-reveal").querySelectorAll(".role-reveal-item"));
    if (items.length === 0) {
      showGameOverButtons(admin);
      return;
    }

    // Find the boundary between non-mafia and mafia (the Godfather sorts into
    // the mafia block but carries data-role="godfather", so match both).
    const firstMafiaIdx = items.findIndex((el) => el.dataset.role === "mafia" || el.dataset.role === "godfather");
    const DELAY_PER_CARD = 300;
    const PAUSE_BEFORE_MAFIA = 800;

    items.forEach((el, i) => {
      let delay = i * DELAY_PER_CARD;
      // Add extra pause before mafia reveals
      if (firstMafiaIdx > 0 && i >= firstMafiaIdx) {
        delay += PAUSE_BEFORE_MAFIA;
      }
      setTimeout(() => {
        el.classList.remove("reveal-hidden");
        el.classList.add("reveal-show");
      }, delay);
    });

    // Show buttons after all reveals complete
    const lastIdx = items.length - 1;
    let totalTime = lastIdx * DELAY_PER_CARD + 400;
    if (firstMafiaIdx > 0) totalTime += PAUSE_BEFORE_MAFIA;
    setTimeout(() => showGameOverButtons(admin), totalTime);
  }

  $("btn-play-again-same").addEventListener("click", () => {
    ensureAudioReady();
    wsSend({ type: "restart_game" });
  });

  $("btn-play-again-new").addEventListener("click", () => {
    // Go back to lobby with current players to reconfigure settings
    wsSend({ type: "return_to_lobby" });
  });

  $("btn-leave-room").addEventListener("click", () => {
    wsSend({ type: "leave_game" });
    localStorage.removeItem("mafia_game_code");
    $("narrator-messages").innerHTML = "";
    $("role-reveal").innerHTML = "";
    $("event-history-list").innerHTML = "";
    $("event-history").classList.add("hidden");
    narratorTranscript = [];
    mafiaTeam = [];
    godfatherName = null;
    myIsGodfather = false;
    vigilanteBulletUsed = false;
    resetEventHistoryTabs();
    closeSettingsModal();
    gameCode = null;
    isAdmin = false;
    showScreen("menu");
  });

  $("btn-return-to-lobby-player").addEventListener("click", () => {
    wsSend({ type: "player_return_to_lobby" });
  });

  $("btn-close-room").addEventListener("click", () => {
    showConfirmSheet(
      t("ui.confirm.closeRoomTitle"),
      t("ui.confirm.closeRoomBody"),
      t("ui.confirm.closeRoomTitle"),
      () => { wsSend({ type: "close_room" }); },
      { danger: true }
    );
  });

  // ============================================================
  // SOUND — queued playback + accent narration system
  // ============================================================
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Route Web Audio through media channel so iOS mute switch doesn't silence it
      if ("audioSession" in navigator) {
        navigator.audioSession.type = "playback";
      }
    }
    return audioCtx;
  }

  // Silent WAV data URI (7 samples, 8-bit mono) — keeps iOS audio session alive
  var silentAudioUri = (function () {
    var sr = 22050;
    try { sr = new (window.AudioContext || window.webkitAudioContext)().sampleRate; } catch {}
    var ab = new ArrayBuffer(10);
    var dv = new DataView(ab);
    dv.setUint32(0, sr, true);
    dv.setUint32(4, sr, true);
    dv.setUint16(8, 1, true);
    var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(ab))).slice(0, 13);
    return "data:audio/wav;base64,UklGRisAAABXQVZFZm10IBAAAAABAAEA" + b64 + "AgAZGF0YQcAAACAgICAgICAAAA=";
  })();
  var silentAudioLoop = null;

  // Start a silent looping <audio> element to keep iOS audio session permanently alive.
  // This bypasses the mute switch and prevents AudioContext from auto-suspending.
  function startSilentLoop() {
    if (silentAudioLoop) return;
    var audio = document.createElement("audio");
    audio.setAttribute("x-webkit-airplay", "deny");
    audio.preload = "auto";
    audio.loop = true;
    audio.src = silentAudioUri;
    audio.load();
    audio.play().then(function () {
      silentAudioLoop = audio;
    }).catch(function () {
      // Will retry on next user gesture
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    });
  }

  // Call from any user-gesture handler that precedes night audio (Start Game, End Day, etc.)
  function ensureAudioReady() {
    if (!soundEnabled) return;
    startSilentLoop();
    var ctx = getAudioContext();
    if (ctx.state !== "running") ctx.resume();
    // Re-preload narration in case cache was lost
    if (Object.keys(narrationAudioCache).length === 0) {
      preloadNarrationAudio();
    }
  }

  // iOS Safari blocks all audio until a user gesture triggers playback.
  // On first tap/touchend, start silent loop + resume AudioContext + preload narration.
  function unlockAudio() {
    if (audioUnlocked) return;
    startSilentLoop();
    var ctx = getAudioContext();
    ctx.resume().then(function () {
      audioUnlocked = true;
      preloadNarrationAudio();
    });
    document.removeEventListener("touchend", unlockAudio, true);
    document.removeEventListener("click", unlockAudio, true);
    document.removeEventListener("keydown", unlockAudio, true);
  }
  document.addEventListener("touchend", unlockAudio, true);
  document.addEventListener("click", unlockAudio, true);
  document.addEventListener("keydown", unlockAudio, true);

  // Recover from iOS "interrupted" state when returning from background/lock screen
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && audioCtx) {
      audioCtx.resume();
      // Restart silent loop if it died during background/lock
      if (silentAudioLoop) {
        silentAudioLoop.play().catch(function () {});
      }
    }
  });

  const NARRATION_CUES = [
    "everyone_close",
    "mafia_open", "mafia_close",
    "doctor_open", "doctor_close",
    "detective_open", "detective_close",
    "vigilante_open", "vigilante_close",
    "hunter_open", "hunter_close",
  ];

  function queueSound(type) {
    if (!soundEnabled) return;
    soundQueue.push(type);
    // Mark narration active when night tone or any narration cue enters the queue
    if (type === "night" || NARRATION_CUES.includes(type)) {
      nightNarrationActive = true;
    }
    if (!soundPlaying) processNextSound();
  }

  function finishNarrationQueue() {
    if (nightNarrationActive) {
      nightNarrationActive = false;
      const queued = nightNarrationQueue;
      nightNarrationQueue = [];
      for (const qMsg of queued) {
        handleServerMessage(qMsg);
      }
    }
  }

  function playNarrationCue(type, onDone) {
    const cached = narrationAudioCache[type];
    if (cached) {
      playAudioBuffer(cached, onDone);
    } else {
      // No mp3 cached — skip
      onDone();
    }
  }

  function processNextSound() {
    if (soundQueue.length === 0) {
      soundPlaying = false;
      finishNarrationQueue();
      return;
    }
    soundPlaying = true;
    const type = soundQueue.shift();

    if (type === "night" || type === "day") {
      playOscillatorTone(type);
      const duration = type === "night" ? 2000 : 1200;
      setTimeout(() => processNextSound(), duration);
      return;
    }

    if (NARRATION_CUES.includes(type)) {
      playNarrationCue(type, () => {
        // 2-second pause after "everyone_close" before next sound
        if (type === "everyone_close") {
          setTimeout(() => processNextSound(), 2000);
        } else {
          processNextSound();
        }
      });
      return;
    }

    // Unknown cue type, skip
    processNextSound();
  }

  function playOscillatorTone(type) {
    try {
      const ctx = getAudioContext();
      if (ctx.state !== "running") ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      if (type === "night") {
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(180, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 1.5);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 2);
      } else if (type === "day") {
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(330, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 1);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
        osc2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.45);
        gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 1.2);
      }
    } catch {
      // Audio not supported
    }
  }

  // Play an AudioBuffer through Web Audio API (works on iOS after AudioContext unlock)
  function playAudioBuffer(buffer, onDone) {
    try {
      const ctx = getAudioContext();
      // Resume context if it auto-suspended during a long day phase
      if (ctx.state !== "running") ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      var done = false;
      var safetyTimer = null;
      function finish() {
        if (done) return;
        done = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        currentAudio = null;
        onDone();
      }
      source.onended = finish;
      currentAudio = source;
      source.start(0);
      // Safety timeout: if onended never fires (iOS suspend), advance the queue anyway
      safetyTimer = setTimeout(finish, (buffer.duration || 5) * 1000 + 500);
    } catch {
      currentAudio = null;
      onDone();
    }
  }

  // Resolve the active selection to a concrete `<accent>-<gender>` audio dir key.
  // For a real accent this is `${currentAccent}-${currentGender}`; for "random"
  // it picks ONE random accent (of the 14 in narration.json cues) AND a random
  // gender, caching the combined key in resolvedAccent so every cue in the game
  // uses the same voice. The cache is cleared on accent/gender change / new game
  // (see setAccent/setGender), so the next game re-rolls. Audio paths are ALWAYS
  // built from this — never the literal "random" and never a bare accent.
  function resolveAccent() {
    if (currentAccent !== "random") return currentAccent + "-" + currentGender;
    if (resolvedAccent) return resolvedAccent;
    // Real accent keys come from cues (random has no cues entry).
    const keys = narrationData ? Object.keys(narrationData.cues || {}) : [];
    if (keys.length === 0) return null;
    const accent = keys[Math.floor(Math.random() * keys.length)];
    const gender = Math.random() < 0.5 ? "male" : "female";
    resolvedAccent = accent + "-" + gender;
    return resolvedAccent;
  }

  // Single writer for the active accent. Clears the random resolution when the
  // selected accent key actually changes, so a new "random" selection (or a new
  // game) re-rolls; reselecting the same key keeps the voice stable.
  function setAccent(accent) {
    if (accent && accent !== currentAccent) {
      currentAccent = accent;
      resolvedAccent = null;
    }
  }

  // Single writer for the narrator gender. Clears the random resolution so a
  // re-roll happens if needed; for a real accent it changes the resolved dir.
  function setGender(gender) {
    if ((gender === "male" || gender === "female") && gender !== currentGender) {
      currentGender = gender;
      resolvedAccent = null;
    }
  }

  // Fetch mp3 files and decode into AudioBuffers (bypasses HTML5 Audio entirely)
  function preloadNarrationAudio() {
    narrationAudioCache = {};
    const accent = resolveAccent();
    if (!accent) return; // narration.json not loaded yet — nothing to preload
    const ctx = getAudioContext();
    NARRATION_CUES.forEach((cue) => {
      fetch("/audio/" + accent + "/" + cue + ".mp3")
        .then((res) => res.ok ? res.arrayBuffer() : Promise.reject())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => { narrationAudioCache[cue] = decoded; })
        .catch(() => {}); // silently skip missing files
    });
  }

  function flushSoundQueue() {
    soundQueue = [];
    soundPlaying = false;
    if (currentAudio) {
      try { currentAudio.stop(); } catch {}
      currentAudio = null;
    }
    // Clear narration hold and replay any held prompts immediately
    if (nightNarrationActive) {
      nightNarrationActive = false;
      const queued = nightNarrationQueue;
      nightNarrationQueue = [];
      for (const qMsg of queued) {
        handleServerMessage(qMsg);
      }
    }
  }

  // ============================================================
  // NARRATOR-VOICE PICKER (custom expandable control)
  // ============================================================
  // Ordered accent keys, derived from narrationData. The arrows cycle this list
  // (wrapping at both ends). currentAccent is NOT written locally as truth — each
  // arrow press fires update_settings and the server echo (updateSettingsUI ->
  // renderAccentPicker + preloadNarrationAudio) remains the single state writer.
  function accentKeys() {
    return narrationData ? Object.keys(narrationData.accents) : [];
  }

  // Wire the picker's expand/collapse and arrow handlers once at boot. Idempotent
  // markup is in index.html; this only attaches listeners.
  function setupAccentPicker() {
    const root = $("lobby-accent");
    if (!root) return;
    // P3/F7 (Figma 45:466 lines 153-181): the narrator block is drawn ALWAYS
    // EXPANDED, so the disclosure toggle and its outside-click collapse are
    // gone. The arrows keep firing the same update_settings call.

    const prev = $("accent-arrow-prev");
    const next = $("accent-arrow-next");
    if (prev) prev.addEventListener("click", () => cycleAccent(-1));
    if (next) next.addEventListener("click", () => cycleAccent(1));

    renderAccentPicker();
  }

  // Step to the prev/next accent (wrap around the ends) and IMMEDIATELY send the
  // same update_settings call the old <select> sent. No local state write — the
  // displayed accent updates when the server echo lands in updateSettingsUI.
  function cycleAccent(dir) {
    const keys = accentKeys();
    if (keys.length === 0) return;
    let idx = keys.indexOf(currentAccent);
    if (idx === -1) idx = 0;
    const nextKey = keys[(idx + dir + keys.length) % keys.length];
    wsSend({ type: "update_settings", settings: { narrationAccent: nextKey } });
  }

  // Wire the Male/Female narrator-gender toggle once at boot. Like the accent
  // arrows, clicking fires update_settings and lets the server echo
  // (updateSettingsUI -> renderGenderToggle + preloadNarrationAudio) be the sole
  // state writer. No-op while the accent is "random" (gender is randomized).
  function setupGenderToggle() {
    const ctrl = $("narrator-gender-control");
    if (!ctrl) return;
    ctrl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-gender]");
      if (!btn) return;
      if (currentAccent === "random") return; // inert when randomized
      const gender = btn.getAttribute("data-gender");
      if (gender !== "male" && gender !== "female") return;
      wsSend({ type: "update_settings", settings: { narratorGender: gender } });
    });
    renderGenderToggle();
  }

  // Paint the Male/Female toggle from currentGender + currentAccent. When the
  // accent is "random" the gender is randomized per game, so the control is
  // greyed/inert (disabled buttons, no active selection shown).
  function renderGenderToggle() {
    const ctrl = $("narrator-gender-control");
    if (!ctrl) return;
    const isRandom = currentAccent === "random";
    ctrl.classList.toggle("disabled", isRandom);
    ctrl.querySelectorAll("[data-gender]").forEach((b) => {
      const on = !isRandom && b.getAttribute("data-gender") === currentGender;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.disabled = isRandom;
    });
  }

  // Paint the picker from currentAccent + narrationData. Called by the server-echo
  // path (updateSettingsUI) and at init once narration.json loads. Labels and
  // descriptions come from served JSON, so set them via textContent (no innerHTML).
  function renderAccentPicker() {
    const root = $("lobby-accent");
    if (!root || !narrationData) return;
    const info = narrationData.accents[currentAccent];
    const label = info ? info.label : currentAccent;
    const desc = info ? info.description : "";
    const lbl = $("accent-picker-label");
    const dsc = $("accent-picker-desc");
    if (lbl) lbl.textContent = label;      // prominent label between the arrows
    if (dsc) dsc.textContent = desc;       // wrapped description below
  }

  // Kept for the init fetch call site below; now paints the picker + gender toggle.
  function populateAccentSelector() {
    renderAccentPicker();
    renderGenderToggle();
  }

  // Init: load narration data
  fetch("/narration.json")
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data) return;
      narrationData = data;
      populateAccentSelector();
      preloadNarrationAudio();
    })
    .catch(() => {});

  // ============================================================
  // HELPERS
  // ============================================================
  function showError(msg) {
    const active = document.querySelector(".screen.active");
    const errorEl = active ? active.querySelector(".error-msg") : null;
    if (errorEl) errorEl.textContent = msg;
  }

  function clearErrors() {
    document.querySelectorAll(".error-msg").forEach((el) => (el.textContent = ""));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  // LANGUAGE PICKER (settings modal + auth screen)
  // ============================================================
  // Both pickers are `.lang-control` groups of `[data-lang]` buttons. Purely
  // client-local: switching NEVER sends a wire frame and never touches game
  // state — two players in the same room may read the game in different
  // languages. Returns early when no picker is in the DOM.
  function renderLanguageControls() {
    const active = currentLang();
    document.querySelectorAll(".lang-control").forEach((ctrl) => {
      ctrl.querySelectorAll("[data-lang]").forEach((b) => {
        const on = b.getAttribute("data-lang") === active;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest ? e.target.closest(".lang-control [data-lang]") : null;
    if (!btn) return;
    setLanguage(btn.getAttribute("data-lang"));
  });

  // ============================================================
  // LANGUAGE SWITCH RE-RENDER
  // ============================================================
  // Every surface whose text is produced by JS rather than by index.html has to
  // be repainted when the language changes, because none of them re-run on their
  // own. The narrator transcript is the important one: it stores message
  // REFERENCES ({ text, key, params, seed }), so switching language re-renders
  // the whole history in the new language instead of leaving old lines behind.
  function rerenderForLang() {
    applyStaticI18n();
    renderPhaseIndicator(currentPhase);
    renderNarratorArea();
    if (!$("modal-transcript").classList.contains("hidden")) renderTranscript();
    if (myRole || isDead) updateRoleCard();
    updatePlayerStatus();
    if (lastGameEvents && lastGameEvents.length > 0) renderEventHistory(lastGameEvents);
    if (currentPhase === "day") renderAccusePanel();
    if (!$("modal-roster").classList.contains("hidden")) renderRoster(currentRoster);
    renderLanguageControls();
    // Read-only lobby settings + accent picker labels are language-dependent too.
    if (lobbySettings) updatePlayerLobbySettings(lobbySettings);
    renderWaitingText();
    renderAccentPicker();
  }
  I18n.onChange(rerenderForLang);

  // ============================================================
  // INIT
  // ============================================================
  const APP_VERSION = "v1.5_202607130233";
  const APP_VERSION_STAGING = "staging.44_202607300350";
  const displayVersion = window.location.hostname.includes("staging") ? APP_VERSION_STAGING : APP_VERSION;
  document.querySelectorAll(".app-version").forEach((el) => { el.textContent = displayVersion; });
  // Paint the static chrome for the stored language (a no-op repaint in English).
  applyStaticI18n();
  renderLanguageControls();
  // Thumbs (specs/components/225-918--thumbs.md). The 40px vote buttons are at
  // or above the spec's Medium (32px) band, where the chibi raster stays crisp,
  // so they take the PNG. The 16px detective tag keeps THUMB_*_ART — see the
  // crispness note on .detective-tag in app.css.
  setVoteButtonFaces(false);

  // P3: the auth/menu hero is now the Figma chibi raster
  // (specs/game-menu/42-678--auth.md:48-51, image fill
  // e721e25818db0cf44d23ba66f5720bb5dc2c04a7 -> /img/ui/hero.png), declared
  // statically in index.html so it is precached with the shell. MASCOT_ART is
  // no longer injected here; it stays in pixel-art.js (registry test) and its
  // retirement is logged in docs/figma-raw/analysis/pixel-art-retirement.md.

  // D3b: Wire pixel icons into all static emoji/entity sites
  (function() {
    // D3.5: settings gear buttons reverted to stock &#9881; (user amendment §3.3 extension).
    // GEAR_ART stays in the registry (pixel-art.js) but is not injected at these sites.

    // Scroll icon into transcript button
    var scrollSvg = pixelArtToSvg(SCROLL_ART);
    var transcriptBtn = document.getElementById("btn-transcript");
    if (transcriptBtn) transcriptBtn.innerHTML = scrollSvg;

    // Refresh icon into pull-refresh spinners
    var refreshSvg = pixelArtToSvg(REFRESH_ART);
    ["pull-refresh-spinner-menu", "pull-refresh-spinner"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = refreshSvg;
    });

    // Skull into dead overlay (default state — JS also updates on you_died)
    var deadEl = document.getElementById("dead-emoji");
    if (deadEl) deadEl.innerHTML = pixelArtToSvg(CARD_BACK_DEAD_ART);

    // Joker raster into the joker win overlay (P6 — default state;
    // showJokerWinOverlay also (re)sets it on every show). The container id
    // keeps "joker-trophy-art".
    var trophyEl = document.getElementById("joker-trophy-art");
    if (trophyEl) trophyEl.innerHTML = winArtHtml("joker");

    // Heart icon into lover-badge
    var loverIcon = document.querySelector(".lover-badge-icon");
    if (loverIcon) loverIcon.innerHTML = pixelArtToSvg(HEART_ART);

    // D5: BOW centerpiece into the hunter revenge-wait panel (static — the
    // reveal name + show/hide are owned by the C5b plumbing, untouched here).
    var revengeArt = document.getElementById("revenge-wait-art");
    if (revengeArt) revengeArt.innerHTML = pixelArtToSvg(BOW_ART);
  })();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  connectPatched();
})();
