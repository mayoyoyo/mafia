(function () {
  "use strict";

  // ============================================================
  // STATE
  // ============================================================
  let ws = null;
  let userId = null;
  let username = null;
  let gameCode = null;
  let isAdmin = false;
  let myRole = null;
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
  let narrationAudioCache = {};
  let currentAudio = null;
  let knownPlayers = [];
  let deathOrderCounter = 0;
  let mafiaTeam = [];
  let dayVoteCount = 0;
  let suspenseActive = false;
  let suspenseQueue = [];
  let nightTransitionActive = false;
  let nightTransitionQueue = [];
  let executionTransitionActive = false;
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
  const PLAYER_COLORS = [
    "#E53935", "#EC407A", "#AB47BC", "#7E57C2", "#5C6BC0",
    "#42A5F5", "#29B6F6", "#26C6DA", "#26A69A", "#66BB6A",
    "#9CCC65", "#C0CA33", "#FFEE58", "#FFA726", "#FF7043",
    "#D84315", "#8D6E63", "#78909C", "#546E7A", "#F06292",
  ];
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

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
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
        const data = JSON.parse(saved);
        wsSend({ type: "login", username: data.username, passcode: data.passcode });
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
  function handleServerMessage(msg) {
    // During suspense, queue certain messages
    if (suspenseActive && (msg.type === "player_died" || msg.type === "you_died" || msg.type === "joker_win_overlay")) {
      suspenseQueue.push(msg);
      return;
    }
    // During night/execution transition, queue sound_cues and night action prompts
    if ((nightTransitionActive || executionTransitionActive) && (msg.type === "sound_cue" || msg.type === "mafia_targets" || msg.type === "doctor_targets" || msg.type === "detective_targets" || msg.type === "joker_haunt_targets")) {
      nightTransitionQueue.push(msg);
      return;
    }
    // During night narration (sounds playing after overlay), hold night prompts until narration finishes
    if (nightNarrationActive && (msg.type === "mafia_targets" || msg.type === "doctor_targets" || msg.type === "detective_targets" || msg.type === "joker_haunt_targets")) {
      nightNarrationQueue.push(msg);
      return;
    }

    switch (msg.type) {
      case "error":
        showError(msg.message);
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
        myPlayerColor = msg.player_color || null;
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
        isLover = msg.isLover;
        myVariant = msg.variant || 0;
        mafiaTeam = msg.mafiaTeam || [];
        isDead = false;
        jokerWonOverlayShown = false;
        // Fresh game start — reset all state
        hasVoted = false;
        dayVoteCount = 0;
        narratorTranscript = [];
        detectiveHistory = [];
        nightActionLocked = false;
        jokerHauntActive = false;
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
        stopDayTimer();
        showScreen("game");
        updateRoleCard();
        // Card starts face-down
        resetCardPeel();
        $("card-back-art").innerHTML = pixelArtToSvg(CARD_BACK_ART);
        $("peel-hint").classList.remove("hidden");
        $("narrator-messages").innerHTML = "";
        clearDetectiveResult();
        $("event-history-list").innerHTML = "";
        $("dead-overlay").classList.add("hidden");
        $("dead-dismiss-hint").classList.add("hidden");
        // Show players tab from game start
        resetEventHistoryTabs("players");
        $("event-history").classList.remove("hidden");
        updatePlayerStatus();
        // Show "Check your role card!" (all players); admin will also get awaiting_ready
        $("awaiting-ready").classList.remove("hidden");
        $("awaiting-ready-msg").textContent = "Check your role card!";
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
        queueSound(msg.sound);
        break;

      case "mafia_targets":
        showNightAction("Choose a victim", msg.players, "mafia_vote");
        break;

      case "doctor_targets":
        showNightAction("Choose someone to protect", msg.players, "doctor_save", msg.lastDoctorTarget);
        break;

      case "detective_targets":
        showNightAction("Choose someone to investigate", msg.players, "detective_investigate");
        break;

      case "joker_haunt_targets":
        jokerHauntActive = true;
        showNightAction("Choose someone to haunt", msg.players, "joker_haunt");
        break;

      case "joker_win_overlay":
        jokerWonOverlayShown = true;
        showJokerWinOverlay(msg.jokerName);
        break;

      case "doctor_save_private":
        showDoctorSavePrivate(msg.message);
        break;

      case "mafia_vote_update":
        updateMafiaVoteStatus(msg);
        break;

      case "mafia_confirm_ready":
        handleMafiaConfirmReady(msg);
        break;

      case "night_action_done":
        $("action-status").textContent = msg.message;
        // If mafia and consensus was reached, collapse target list
        if (myRole === "mafia" && !nightActionLocked) {
          const lockVote = myMafiaVotes.find(v => v.voteType === "lock");
          if (lockVote) {
            nightActionLocked = true;
            hideSlideConfirm();
            const lockTarget = mafiaTargetPlayers.find(p => p.id === lockVote.targetId);
            const targetName = lockTarget ? lockTarget.username : "target";
            $("action-targets").innerHTML = `<li class="selected">${escapeHtml(targetName)} \u2714</li>`;
          }
        }
        break;

      case "spectator_mafia_update":
        if (isDead && !jokerHauntActive) showSpectatorMafiaPanel(msg);
        break;

      case "spectator_kill_confirmed":
        if (isDead) showSpectatorKillResult(msg);
        break;

      case "spectator_night_phase":
        if (isDead) showSpectatorNightPhase(msg);
        break;

      case "spectator_night_complete":
        if (isDead) appendSpectatorLog(msg);
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

      case "player_died":
        showNarratorMessage(msg.message);
        break;

      case "you_died":
        isDead = true;
        $("card-back-art").innerHTML = pixelArtToSvg(CARD_BACK_DEAD_ART);
        // If joker win overlay is already showing, skip the death overlay
        if (!jokerWonOverlayShown) {
          $("dead-overlay").classList.remove("hidden");
          $("dead-emoji").textContent = msg.isLoverDeath ? "\u{1F494}" : "\u{1F480}";
          $("death-message").textContent = msg.message;
          $("dead-dismiss-hint").classList.remove("hidden");
        }
        break;

      case "game_over":
        handleGameOver(msg);
        break;

      case "room_closed":
        localStorage.removeItem("mafia_game_code");
        gameCode = null;
        isAdmin = false;
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
        myPlayerColor = msg.player_color;
        $("toggle-hide-mafia-tag").checked = hideMafiaTag;
        updatePlayerStatus();
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
    isLover = msg.isLover;
    myVariant = msg.variant;
    mafiaTeam = msg.mafiaTeam || [];
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
    if (msg.narrationAccent) {
      currentAccent = msg.narrationAccent;
      preloadNarrationAudio(currentAccent);
    }
    dayVoteCount = msg.dayVoteCount;
    narratorTranscript = msg.narratorHistory;
    detectiveHistory = msg.detectiveHistory;
    hasVoted = false;
    nightActionLocked = false;
    jokerHauntActive = false;
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
    updateRoleCard();
    resetCardPeel();
    $("card-back-art").innerHTML = pixelArtToSvg(isDead ? CARD_BACK_DEAD_ART : CARD_BACK_ART);
    $("dead-dismiss-hint").classList.add("hidden");
    $("round-number").textContent = msg.round;

    // Phase indicator
    const indicator = $("phase-indicator");
    indicator.className = `phase-indicator ${msg.phase}`;
    indicator.textContent = msg.phase.toUpperCase();

    // 9. Hide all action panels
    $("night-actions").classList.add("hidden");
    $("mafia-vote-status").classList.add("hidden");
    $("voting-panel").classList.add("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("admin-night-controls").classList.add("hidden");
    $("awaiting-ready").classList.add("hidden");
    $("btn-begin-night").classList.add("hidden");

    // 9b. Show awaiting-ready if game is waiting for narrator
    if (msg.awaitingNarratorReady) {
      $("awaiting-ready").classList.remove("hidden");
      $("awaiting-ready-msg").textContent = "Check your role card!";
      // awaiting_ready message will arrive separately for admin to show button
    }

    // 10. Show most recent narrator message
    $("narrator-messages").innerHTML = "";
    if (narratorTranscript.length > 0) {
      const div = document.createElement("div");
      div.className = "narrator-line";
      div.textContent = narratorTranscript[narratorTranscript.length - 1];
      $("narrator-messages").appendChild(div);
    }

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
        if (na.isSpectatorView && na.spectatorSubPhase) {
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
          const roleLabel = myRole === "mafia" ? "Target" : myRole === "doctor" ? "Protecting" : "Investigating";
          $("action-title").textContent = roleLabel;
          $("action-targets").innerHTML = `<li class="selected">${escapeHtml(na.targetName)} \u2714</li>`;
          hideSlideConfirm();
          $("action-status").textContent = "Action confirmed.";
          nightActionLocked = true;
          if (myRole === "mafia") {
            $("mafia-vote-status").classList.remove("hidden");
          }
        } else if (na.targets.length > 0) {
          // Show target selection
          const actionType = myRole === "mafia" ? "mafia_vote"
            : myRole === "doctor" ? "doctor_save"
            : myRole === "joker" ? "joker_haunt"
            : "detective_investigate";
          const title = myRole === "mafia" ? "Choose a victim"
            : myRole === "doctor" ? "Choose someone to protect"
            : myRole === "joker" ? "Choose someone to haunt"
            : "Choose someone to investigate";
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
      }, vs.hasVoted);
      updateVoteProgress({
        totalVotes: vs.totalVotes,
        total: vs.total,
      });
    }

    // Show event history (always visible during game)
    $("event-history").classList.remove("hidden");
    updatePlayerStatus();

    // 12. Dead player state (card back only — overlay only shows on real-time you_died)
    if (isDead) {
      $("card-back-art").innerHTML = pixelArtToSvg(CARD_BACK_DEAD_ART);
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  $("btn-register").addEventListener("click", () => {
    const u = $("auth-username").value.trim();
    const p = $("auth-passcode").value.trim();
    if (!u) return showAuthError("Enter a username");
    if (!/^\d{4}$/.test(p)) return showAuthError("PIN must be exactly 4 digits");
    wsSend({ type: "register", username: u, passcode: p });
  });

  $("btn-login").addEventListener("click", () => {
    const u = $("auth-username").value.trim();
    const p = $("auth-passcode").value.trim();
    if (!u || !p) return showAuthError("Enter username and PIN");
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

  $("btn-join-show").addEventListener("click", () => {
    $("join-section").classList.toggle("hidden");
    $("join-code").focus();
  });

  $("btn-join").addEventListener("click", () => {
    const code = $("join-code").value.trim().toUpperCase();
    if (code.length !== 4) return showError("Enter a 4-character room code");
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
    const current = parseInt($("mafia-count").textContent);
    if (current > 1) {
      $("mafia-count").textContent = current - 1;
      wsSend({ type: "update_settings", settings: { mafiaCount: current - 1 } });
    }
  });

  $("mafia-plus").addEventListener("click", () => {
    const current = parseInt($("mafia-count").textContent);
    if (current < 6) {
      $("mafia-count").textContent = current + 1;
      wsSend({ type: "update_settings", settings: { mafiaCount: current + 1 } });
    }
  });

  ["doctor", "detective", "joker", "lovers"].forEach((role) => {
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
        if (hintEl && hints[mode]) hintEl.textContent = hints[mode];
      });
    });
  }

  setupRuleTabs("doctor-mode-tabs", "doctorMode", {
    house: "Narrator reveals who was saved",
    official: "Save is secret \u2014 only victim is notified",
  });

  setupRuleTabs("joker-mode-tabs", "jokerMode", {
    house: "Game ends when Joker is executed",
    official: "Game continues \u2014 Joker can haunt a voter",
  });

  $("lobby-accent").addEventListener("change", (e) => {
    wsSend({ type: "update_settings", settings: { narrationAccent: e.target.value } });
  });

  function updateLobby(msg) {
    const { players, settings, adminName } = msg;

    const renderPlayerItem = (p) => {
      const colorDot = p.color ? `<span class="player-color-dot" style="background:${p.color}"></span>` : '';
      return `<li>${colorDot}${escapeHtml(p.username)}${p.isAdmin ? ' <span class="admin-badge">HOST</span>' : ""}</li>`;
    };

    $("player-count-admin").textContent = players.length;
    $("players-list-admin").innerHTML = players.map(renderPlayerItem).join("");

    $("player-count-player").textContent = players.length;
    $("admin-name-display").textContent = adminName;
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
    $("toggle-lovers").checked = settings.enableLovers;
    if (settings.narrationAccent) {
      currentAccent = settings.narrationAccent;
      const sel = $("lobby-accent");
      if (sel) sel.value = currentAccent;
      preloadNarrationAudio(currentAccent);
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
        ? "Save is secret \u2014 only victim is notified"
        : "Narrator reveals who was saved";
    }
    if (settings.jokerMode) {
      $("joker-mode-tabs").querySelectorAll(".rule-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.mode === settings.jokerMode);
      });
      $("joker-mode-hint").textContent = settings.jokerMode === "official"
        ? "Game continues \u2014 Joker can haunt a voter"
        : "Game ends when Joker is executed";
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
        if (!colorOwners[p.color]) colorOwners[p.color] = [];
        colorOwners[p.color].push(p.username);
      }
    }

    container.innerHTML = '<h4>Your Color</h4>';
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
        label.textContent = owners.length === 1 ? owners[0] : owners.length + " players";
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
    if (settings.enableDoctor) roles.push(`Doctor (${settings.doctorMode === "official" ? "Official" : "House"})`);
    if (settings.enableDetective) roles.push("Detective");
    if (settings.enableJoker) roles.push(`Joker (${settings.jokerMode === "official" ? "Official" : "House"})`);
    if (settings.enableLovers) roles.push("Lovers");

    container.innerHTML = `
      <div class="lobby-settings-row">
        <span class="lobby-settings-label">Mafia Members</span>
        <span class="lobby-settings-value">${settings.mafiaCount}</span>
      </div>
      <div class="lobby-settings-row">
        <span class="lobby-settings-label">Special Roles</span>
        <span class="lobby-settings-value">${roles.length > 0 ? roles.join(", ") : "None"}</span>
      </div>
    `;
  }

  // ============================================================
  // GAME
  // ============================================================
  let myVariant = 0;

  // ============================================================
  // PIXEL ART ROLE IMAGES
  // ============================================================
  const _ = null; // transparent
  const PIXEL_ART = {
    doctor: [
      [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
      [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
      [_,"#fff","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fff",_],
      [_,"#fff","#fdd","#29f","#fdd","#fdd","#29f","#fdd","#fff",_],
      [_,_,"#fff","#fdd","#fdd","#fdd","#fdd","#fff",_,_],
      [_,_,"#fff","#fdd","#222","#222","#fdd","#fff",_,_],
      [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
      [_,"#fff","#29f","#fff","#29f","#29f","#fff","#29f","#fff",_],
      [_,"#fff","#29f","#29f","#29f","#29f","#29f","#29f","#fff",_],
      [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
    ],
    detective: [
      [_,_,"#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2",_,_,_],
      [_,"#7b1fa2","#7b1fa2","#9c27b0","#9c27b0","#9c27b0","#7b1fa2","#7b1fa2",_,_],
      ["#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2",_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
      [_,_,"#555","#555","#555","#555","#555","#555",_,_],
      [_,_,_,_,_,_,_,"#ff0","#ff0",_],
      [_,_,_,_,_,_,"#ff0","#ccc","#ff0","#ff0"],
    ],
    joker: [
      [_,"#f00","#ff0",_,_,"#0f0","#00f",_,_,_],
      ["#f00","#f00","#ff0","#ff0",_,"#0f0","#0f0","#00f",_,_],
      [_,"#ff0","#ff0","#ff0","#f0f","#0f0","#0f0","#00f","#00f",_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#f00","#f00","#f00","#f00","#fdd",_,_],
      [_,_,"#ff0","#0f0","#ff0","#0f0","#ff0","#0f0",_,_],
      [_,_,"#ff0","#0f0","#ff0","#0f0","#ff0","#0f0",_,_],
      [_,_,_,"#f00",_,_,"#00f",_,_,_],
    ],
    citizen: [
      // 0: farmer
      [
        [_,_,"#8b4","#8b4","#8b4","#8b4","#8b4","#8b4",_,_],
        [_,"#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4",_],
        ["#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4"],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#a62","#a62","#fdd","#fdd",_,_],
        [_,_,"#27a","#27a","#27a","#27a","#27a","#27a",_,_],
        [_,_,"#27a","#27a","#27a","#27a","#27a","#27a",_,_],
        [_,_,"#a62","#a62",_,_,"#a62","#a62",_,_],
      ],
      // 1: engineer
      [
        [_,_,"#ff0","#ff0","#ff0","#ff0","#ff0","#ff0",_,_],
        [_,"#ff0","#ff0","#ff0","#ff0","#ff0","#ff0","#ff0","#ff0",_],
        [_,"#ff0","#222","#222","#222","#222","#222","#222","#ff0",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#f80","#f80","#f80","#f80","#f80","#f80",_,_],
        [_,_,"#f80","#f80","#f80","#f80","#f80","#f80",_,_],
        [_,_,"#555","#555",_,_,"#555","#555",_,_],
      ],
      // 2: baker
      [
        [_,_,_,"#fff","#fff","#fff","#fff",_,_,_],
        [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
        [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fff","#da4","#fff","#fff","#da4","#fff",_,_],
        [_,_,"#555","#555",_,_,"#555","#555",_,_],
      ],
      // 3: chef
      [
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fff","#222","#fff","#fff","#222","#fff",_,_],
        [_,_,"#333","#333",_,_,"#333","#333",_,_],
      ],
      // 4: astronaut
      [
        [_,_,"#ccc","#ccc","#ccc","#ccc","#ccc","#ccc",_,_],
        [_,"#ccc","#48f","#48f","#48f","#48f","#48f","#48f","#ccc",_],
        [_,"#ccc","#48f","#48f","#48f","#48f","#48f","#48f","#ccc",_],
        [_,"#ccc","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#ccc",_],
        [_,"#ccc","#fdd","#222","#fdd","#fdd","#222","#fdd","#ccc",_],
        [_,_,"#ccc","#fdd","#fdd","#fdd","#fdd","#ccc",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fff","#f80","#fff","#fff","#f80","#fff",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#ccc","#ccc",_,_,"#ccc","#ccc",_,_],
      ],
      // 5: musician
      [
        [_,_,_,_,_,_,_,_,_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,"#333","#333","#333","#333","#333","#333","#333","#333",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#f00","#222","#222","#f00","#222",_,_],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 6: artist
      [
        [_,_,"#e44","#e44","#e44","#e44","#e44",_,_,_],
        [_,"#e44","#e44","#e44","#e44","#e44","#e44","#e44",_,_],
        [_,_,"#e44","#e44","#e44","#e44","#e44",_,_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#48f","#48f","#48f","#48f","#48f","#48f",_,_],
        [_,_,"#48f","#ff0","#0f0","#f0f","#f80","#48f",_,_],
        [_,_,"#333","#333",_,_,"#333","#333",_,_],
      ],
      // 7: firefighter
      [
        [_,_,"#d00","#d00","#d00","#d00","#d00","#d00",_,_],
        [_,"#d00","#ff0","#ff0","#ff0","#ff0","#ff0","#ff0","#d00",_],
        [_,"#d00","#d00","#d00","#d00","#d00","#d00","#d00","#d00",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#d00","#d00","#d00","#d00","#d00","#d00",_,_],
        [_,_,"#d00","#ff0","#d00","#d00","#ff0","#d00",_,_],
        [_,_,"#333","#333",_,_,"#333","#333",_,_],
      ],
    ],
    mafia: [
      // 0: gun robber
      [
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,_,"#fdd","#222","#222","#222","#222","#fdd",_,_],
        [_,_,"#fdd","#fff","#fdd","#fdd","#fff","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,"#888"],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 1: sword warrior
      [
        [_,_,"#555","#555","#555","#555","#555","#555",_,_],
        [_,"#555","#555","#555","#555","#555","#555","#555","#555",_],
        [_,"#555","#555","#555","#555","#555","#555","#555","#555",_],
        [_,_,"#fdd","#555","#555","#555","#555","#fdd",_,_],
        [_,_,"#fdd","#d00","#fdd","#fdd","#d00","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        ["#ccc",_,"#444","#444","#444","#444","#444","#444",_,_],
        ["#ccc",_,"#444","#d00","#444","#444","#d00","#444",_,_],
        ["#a82",_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 2: ninja
      [
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#fff","#222","#222","#fff","#222",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 3: mafia boss
      [
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,"#333","#333","#333","#333","#333","#333","#333","#333",_],
        ["#333","#333","#333","#333","#333","#333","#333","#333","#333","#333"],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#a62","#a62","#fdd","#fdd",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#fff","#222","#222","#fff","#222",_,_],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
    ],
  };

  function pixelArtToSvg(grid) {
    const size = grid.length;
    let rects = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x]) {
          rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${grid[y][x]}"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects}</svg>`;
  }

  // Card back: mafioso + civilian side by side
  const CARD_BACK_ART = [
    [_,"#222","#222","#222",_,     _,    _,    _,    _,    _   ],
    ["#333","#c22","#c22","#c22","#333", _,"#654","#654","#654", _  ],
    [_,"#fdd","#fdd","#fdd",_,     _,"#fdd","#fdd","#fdd", _  ],
    [_,"#222","#fdd","#222",_,     _,"#222","#fdd","#222", _  ],
    [_,"#fdd","#dbb","#fdd",_,     _,"#fdd","#fdd","#fdd", _  ],
    [_,"#fdd","#fdd","#fdd",_,     _,"#fdd","#b77","#fdd", _  ],
    [_,"#111","#c22","#111",_,     _,"#27a","#27a","#27a", _  ],
    [_,"#111","#c22","#111",_,     _,"#27a","#27a","#27a", _  ],
    [_,"#111", _ ,"#111",_,        _,"#27a", _ ,"#27a", _  ],
    [_,"#111", _ ,"#111",_,        _,"#333", _ ,"#333", _  ],
  ];

  // Skull pixel art for dead player card back
  const CARD_BACK_DEAD_ART = [
    [_,_,_,"#aaa","#aaa","#aaa","#aaa",_,_,_],
    [_,_,"#aaa","#ddd","#ddd","#ddd","#ddd","#aaa",_,_],
    [_,"#aaa","#ddd","#ddd","#ddd","#ddd","#ddd","#ddd","#aaa",_],
    [_,"#aaa","#ddd","#222","#222","#ddd","#222","#222","#aaa",_],
    [_,"#aaa","#ddd","#222","#222","#ddd","#222","#222","#aaa",_],
    [_,_,"#aaa","#ddd","#ddd","#333","#ddd","#ddd",_,_],
    [_,_,"#aaa","#ddd","#333","#ddd","#333","#aaa",_,_],
    [_,_,_,"#aaa","#ddd","#ddd","#ddd","#aaa",_,_],
    [_,_,_,"#aaa","#333","#ddd","#333","#aaa",_,_],
    [_,_,_,_,"#aaa","#aaa","#aaa",_,_,_],
  ];

  const THUMB_UP_ART = [
    [_,_,_,_,_,"#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,"#fdd",_,_,"#fdd","#fdd",_,_,_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,_,"#fdd","#fdd","#fdd","#fdd",_,_],
  ];

  const THUMB_DOWN_ART = [
    [_,_,_,_,"#fdd","#fdd","#fdd","#fdd",_,_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd",_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,_,"#fdd",_,_,_,_],
  ];

  // Slide-to-confirm pixel art icons
  const KNIFE_ART = [
    [_,_,_,_,_,_,_,_,"#ccc",_],
    [_,_,_,_,_,_,_,"#ccc","#eee",_],
    [_,_,_,_,_,_,"#ccc","#eee","#ccc",_],
    [_,_,_,_,_,"#ccc","#eee","#ccc",_,_],
    [_,"#d32","#d32","#ccc","#eee","#ccc",_,_,_,_],
    [_,_,"#d32","#d32","#eee","#ccc",_,_,_,_],
    [_,_,_,"#a62","#ccc",_,_,_,_,_],
    [_,_,"#a62","#555","#a62",_,_,_,_,_],
    [_,"#a62","#555",_,"#555","#a62",_,_,_,_],
    [_,"#a62",_,_,_,"#a62",_,_,_,_],
  ];

  // Capsule pill tilted ~30 degrees — top-left blue, bottom-right white
  const CROSS_ART = [
    [_,_,_,_,_,_,_,_,_,_],
    [_,_,_,"#e53","#e53","#e53","#e53",_,_,_],
    [_,_,_,"#f44","#f66","#f66","#e53",_,_,_],
    [_,"#e53","#f44","#f44","#f66","#f66","#e53","#e53",_,_],
    [_,"#e53","#f66","#f66","#f88","#f88","#f66","#e53",_,_],
    [_,"#e53","#f44","#f66","#f88","#f66","#f44","#e53",_,_],
    [_,"#e53","#e53","#f44","#f66","#f66","#e53","#e53",_,_],
    [_,_,_,"#e53","#f44","#f44","#e53",_,_,_],
    [_,_,_,"#c32","#e53","#e53","#c32",_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  const MAGNIFIER_ART = [
    [_,_,_,"#9c27b0","#9c27b0","#9c27b0",_,_,_,_],
    [_,_,"#9c27b0",_,_,_,"#9c27b0",_,_,_],
    [_,"#9c27b0",_,_,_,_,_,"#9c27b0",_,_],
    [_,"#9c27b0",_,_,_,_,_,"#9c27b0",_,_],
    [_,_,"#9c27b0",_,_,_,"#9c27b0",_,_,_],
    [_,_,_,"#9c27b0","#9c27b0","#9c27b0",_,_,_,_],
    [_,_,_,_,_,_,"#a62",_,_,_],
    [_,_,_,_,_,_,_,"#a62",_,_],
    [_,_,_,_,_,_,_,_,"#a62",_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // 8-bit clown icon for joker haunt slide-to-confirm
  const CLOWN_ART = [
    [_,_,"#e53",_,_,_,_,"#e53",_,_],
    [_,"#e53","#e53","#e53",_,_,"#e53","#e53","#e53",_],
    [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd","#29f",_,"#fdd","#fdd",_,"#29f","#fdd",_],
    [_,"#fdd","#fdd","#fdd","#e53","#e53","#fdd","#fdd","#fdd",_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,"#fdd","#e53","#e53","#e53","#e53","#fdd",_,_],
    [_,_,_,"#fdd","#e53","#e53","#fdd",_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  function getRoleImage(role, variant) {
    if (role === "citizen") {
      const grids = PIXEL_ART.citizen;
      return pixelArtToSvg(grids[variant % grids.length]);
    }
    if (role === "mafia") {
      const grids = PIXEL_ART.mafia;
      return pixelArtToSvg(grids[variant % grids.length]);
    }
    if (PIXEL_ART[role]) {
      return pixelArtToSvg(PIXEL_ART[role]);
    }
    return "";
  }

  const ROLE_DESCRIPTIONS = {
    citizen: "You are a Citizen. Find and eliminate the Mafia to win.",
    mafia: "You are the Mafia. Eliminate citizens until you outnumber them.",
    doctor: "You are the Doctor. Each night, choose one player to protect from the Mafia.",
    detective: "You are the Detective. Each night, investigate one player to discover if they are Mafia.",
    joker: "You are the Joker. Win by getting yourself executed during the day vote.",
  };

  const ROLE_COLORS = {
    citizen: "citizen",
    mafia: "mafia",
    doctor: "doctor",
    detective: "detective",
    joker: "joker",
  };

  function updateRoleCard() {
    const card = $("role-card");
    card.className = `role-card ${ROLE_COLORS[myRole] || ""}`;
    $("role-name").textContent = myRole ? myRole.toUpperCase() : "";
    $("role-description").textContent = ROLE_DESCRIPTIONS[myRole] || "";
    // Pixel art role image
    const imgEl = $("role-image");
    if (myRole) {
      imgEl.innerHTML = getRoleImage(myRole, myVariant);
    } else {
      imgEl.innerHTML = "";
    }
    if (isLover) {
      $("lover-badge").classList.remove("hidden");
    } else {
      $("lover-badge").classList.add("hidden");
    }
    // Mini role icon in bottom-right of card-front for quick-peek
    const miniEl = $("role-icon-mini");
    if (myRole) {
      miniEl.innerHTML = getRoleImage(myRole, myVariant);
    } else {
      miniEl.innerHTML = "";
    }
    // Heart balloon for lovers
    if (isLover) {
      $("role-mini-balloon").classList.remove("hidden");
    } else {
      $("role-mini-balloon").classList.add("hidden");
    }
  }

  function resetCardPeel() {
    const card = $("role-card");
    const back = card.querySelector(".card-back");
    back.classList.remove("dragging");
    back.style.clipPath = "";
    const flap = card.querySelector(".peel-flap");
    flap.classList.remove("dragging");
    flap.style.left = "";
    flap.style.top = "";
    flap.style.right = "";
    flap.style.bottom = "";
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

    function setPeel(clientX, clientY) {
      if (!cardRect) return;
      const px = Math.max(0, Math.min(1, (cardRect.right - clientX) / cardRect.width));
      const py = Math.max(0, Math.min(1, (cardRect.bottom - clientY) / cardRect.height));
      const cx = (1 - px) * 100;
      const cy = (1 - py) * 100;
      back.style.clipPath = `polygon(0% 0%, 100% 0%, 100% ${cy}%, ${cx}% ${cy}%, ${cx}% 100%, 0% 100%)`;
      // Move peel-flap to follow the fold point
      flap.classList.add("dragging");
      flap.style.right = "auto";
      flap.style.bottom = "auto";
      flap.style.left = `${cx}%`;
      flap.style.top = `${cy}%`;
    }

    function resetPeel() {
      back.classList.remove("dragging");
      back.style.clipPath = "";
      flap.classList.remove("dragging");
      flap.style.left = "";
      flap.style.top = "";
      flap.style.right = "";
      flap.style.bottom = "";
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
      $("peel-hint").classList.add("hidden");
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
  let slideCallback = null;

  function setupSlideConfirm(role, callback) {
    const container = $("slide-confirm");
    const icon = $("slide-icon");
    const label = $("slide-label");
    const fill = $("slide-fill");

    // Reset state
    container.className = "slide-confirm";
    container.classList.add(`role-${role}`);
    container.classList.remove("confirmed", "dragging");
    icon.style.left = "4px";
    fill.style.width = "0";
    fill.classList.remove("dripping");

    // Set role-specific icon and label
    const iconArt = role === "mafia" ? KNIFE_ART
      : role === "doctor" ? CROSS_ART
      : role === "joker_haunt" ? CLOWN_ART : MAGNIFIER_ART;
    icon.innerHTML = pixelArtToSvg(iconArt);

    const labels = { mafia: "slide to kill", doctor: "slide to save", detective: "slide to investigate", joker_haunt: "slide to haunt" };
    label.textContent = labels[role] || "slide to confirm";

    slideCallback = callback;
  }

  function hideSlideConfirm() {
    const container = $("slide-confirm");
    container.classList.add("hidden");
    container.classList.remove("confirmed", "dragging");
    slideCallback = null;
  }

  // Slide drag handlers
  (function () {
    const container = $("slide-confirm");
    const icon = $("slide-icon");
    const fill = $("slide-fill");
    const THRESHOLD = 0.85;
    let dragging = false;
    let startX = 0;
    let trackWidth = 0;
    let iconWidth = 48;
    let padding = 4;

    function onStart(e) {
      if (!slideCallback) return;
      if (container.classList.contains("confirmed")) return;
      const touch = e.touches ? e.touches[0] : e;
      // Only start if touching the icon
      const iconRect = icon.getBoundingClientRect();
      const dx = touch.clientX - iconRect.left;
      const dy = touch.clientY - iconRect.top;
      if (dx < 0 || dx > iconRect.width || dy < 0 || dy > iconRect.height) return;
      e.preventDefault();
      dragging = true;
      startX = touch.clientX - icon.offsetLeft;
      const trackEl = container.querySelector(".slide-track");
      trackWidth = trackEl.offsetWidth;
      container.classList.add("dragging");
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const maxLeft = trackWidth - iconWidth - padding;
      let newLeft = Math.max(padding, Math.min(maxLeft, touch.clientX - startX));
      icon.style.left = newLeft + "px";
      fill.style.width = (newLeft + iconWidth / 2) + "px";

      const pct = (newLeft - padding) / (maxLeft - padding);
      if (pct > 0.3 && container.classList.contains("role-mafia")) {
        fill.classList.add("dripping");
      } else {
        fill.classList.remove("dripping");
      }
    }

    function onEnd(e) {
      if (!dragging) return;
      e.preventDefault();
      dragging = false;
      container.classList.remove("dragging");

      const maxLeft = trackWidth - iconWidth - padding;
      const currentLeft = icon.offsetLeft;
      const pct = (currentLeft - padding) / (maxLeft - padding);

      if (pct >= THRESHOLD && slideCallback) {
        // Confirmed
        container.classList.add("confirmed");
        $("slide-label").textContent = "confirmed";
        fill.classList.remove("dripping");
        const cb = slideCallback;
        slideCallback = null;
        cb();
        setTimeout(() => hideSlideConfirm(), 400);
      } else {
        // Snap back
        icon.style.left = "4px";
        fill.style.width = "0";
        fill.classList.remove("dripping");
      }
    }

    container.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
    container.addEventListener("mousedown", onStart);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  })();

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
    // Execution → game_over with lover death
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

    const indicator = $("phase-indicator");
    indicator.className = `phase-indicator ${msg.phase}`;
    indicator.textContent = msg.phase === "game_over" ? "GAME OVER" : msg.phase.toUpperCase();

    // Clear visible narrator for new phase (transcript preserves history)
    $("narrator-messages").innerHTML = "";

    // Show most recent narrator message from transcript if no new messages
    if (narratorTranscript.length > 0 && (!msg.messages || msg.messages.length === 0)) {
      const div = document.createElement("div");
      div.className = "narrator-line";
      div.textContent = narratorTranscript[narratorTranscript.length - 1];
      $("narrator-messages").appendChild(div);
    }

    if (msg.messages && msg.messages.length > 0) {
      for (const m of msg.messages) {
        showNarratorMessage(m);
      }
    }

    // Hide all action panels
    $("night-actions").classList.add("hidden");
    $("mafia-vote-status").classList.add("hidden");
    $("voting-panel").classList.add("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("admin-night-controls").classList.add("hidden");
    $("awaiting-ready").classList.add("hidden");
    $("btn-begin-night").classList.add("hidden");

    if (msg.phase === "day") {
      startDayTimer();
      if (isAdmin) {
        showAdminDayControls();
        setTimeout(() => populateAdminTargets(knownPlayers), 100);
      }
    }

    if (msg.phase === "night" || msg.phase === "game_over") {
      stopDayTimer();
    }

    if (msg.phase === "night") {
      hasVoted = false;
      dayVoteCount = 0;
      nightActionLocked = false;
      jokerHauntActive = false;
      clearDetectiveResult();
      $("mafia-vote-details").innerHTML = "";
      // Reset spectator night log for new night
      spectatorNightLog = [];
      $("spectator-night-log").innerHTML = "";
      $("spectator-night-log").classList.add("hidden");
      if (isAdmin) {
        $("admin-night-controls").classList.remove("hidden");
      }
    }

    updatePlayerStatus();
  }

  // ============================================================
  // EXECUTION TRANSITION (vote result → night)
  // ============================================================
  function showExecutionTransition(voteResult, callback) {
    executionTransitionActive = true;
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");

    const msg = voteResult.executed
      ? `${voteResult.targetName} was executed.`
      : "The vote was abstained.";
    const color = voteResult.executed ? "#d32f2f" : "#8e8e93";

    text.textContent = msg;
    text.style.color = color;
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      overlay.classList.add("fade-out");
      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
        text.style.color = "";
        executionTransitionActive = false;
        callback();
      }, 600);
    }, 2000);
  }

  function showHeartbreakTransition(loverName, callback) {
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    text.textContent = `\u{1F494} ${loverName} died of heartbreak.`;
    text.style.color = "#9c27b0";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      overlay.classList.add("fade-out");
      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
        text.style.color = "";
        callback();
      }, 600);
    }, 2000);
  }

  // ============================================================
  // NIGHT TRANSITION (day/voting → night)
  // ============================================================
  const NIGHT_MESSAGES = [
    ["The village grows quiet...", "Lock your doors."],
    ["Darkness falls over the town...", "No one is safe tonight."],
    ["The last candle flickers out...", "Sleep tight."],
    ["Shadows creep through the streets...", "The wolves are hungry."],
    ["The moon rises, cold and silent...", "Someone won't see morning."],
    ["Night blankets the town...", "Close your eyes... if you dare."],
    ["The stars watch from above...", "But they won't protect you."],
    ["One by one, the lights go out...", "The game begins in the dark."],
    ["A chill wind sweeps the village...", "Trust no one tonight."],
    ["The town drifts into uneasy sleep...", "Not everyone will wake up."],
    ["Crickets fall silent...", "Something stirs in the dark."],
    ["The clock strikes midnight...", "Evil walks among you."],
  ];
  let nightMsgIndex = 0;

  function showNightTransition(callback) {
    nightTransitionActive = true;
    // Don't clear nightTransitionQueue here — messages may already be queued
    // from the preceding execution transition. Queue is cleared after replay.

    const pair = NIGHT_MESSAGES[nightMsgIndex % NIGHT_MESSAGES.length];
    nightMsgIndex++;

    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    text.textContent = pair[0];
    text.style.color = "";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      text.textContent = pair[1];
      text.style.color = "#8e8e93";
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
        nightTransitionActive = false;
        callback();
        // Replay queued night action prompts after applyPhaseChange
        for (const qMsg of nightTransitionQueue) {
          handleServerMessage(qMsg);
        }
        nightTransitionQueue = [];
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
    const hasSave = roundEvents.some((e) => e.type === "save");
    const hasKill = roundEvents.some((e) => e.type === "kill" || e.type === "lover_death");
    const killEvent = roundEvents.find((e) => e.type === "kill");
    const victimName = killEvent ? killEvent.playerName : "Someone";
    if (hasSave && hasKill) return { text: `\u{1F6E1}\uFE0F A life was saved... but ${victimName} didn't make it.`, color: "#2196f3" };
    if (hasSave) return { text: "\u{1F6E1}\uFE0F The Doctor saved a life!", color: "#2196f3" };
    if (hasKill) return { text: `\u{1F480} ${victimName} didn't survive the night.`, color: "#d32f2f" };
    return { text: "\u{1F319} A peaceful night... somehow.", color: "#8e8e93" };
  }

  function showSuspenseTransition(msg, callback) {
    suspenseActive = true;
    suspenseQueue = [];
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");
    const hasLoverDeath = !!msg.loverDeathName;
    const extraDelay = hasLoverDeath ? 2800 : 0;

    overlay.classList.remove("hidden", "fade-out");
    text.textContent = "The sun rises...";
    text.style.color = "";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      text.textContent = "What happened last night?";
      text.style.color = "";
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 2000);

    setTimeout(() => {
      const verdict = getNightVerdict(msg);
      text.textContent = verdict.text;
      text.style.color = verdict.color;
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 3500);

    if (hasLoverDeath) {
      setTimeout(() => {
        text.textContent = `\u{1F494} ${msg.loverDeathName} died of heartbreak.`;
        text.style.color = "#9c27b0";
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
      suspenseActive = false;

      // Apply the phase change
      callback();

      // Process queued messages
      for (const qMsg of suspenseQueue) {
        handleServerMessage(qMsg);
      }
      suspenseQueue = [];
    }, 6300 + extraDelay);
  }

  function showDetectiveResult(msg) {
    const el = $("detective-result");
    const text = msg.isMafia
      ? `\u{1F50D} Your investigation reveals: ${msg.targetName} IS a member of the Mafia!`
      : `\u{1F50D} Your investigation reveals: ${msg.targetName} is NOT a member of the Mafia.`;
    el.textContent = text;
    el.classList.remove("hidden");
    narratorTranscript.push(text);
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

  function showNarratorMessage(text) {
    narratorTranscript.push(text);
    const container = $("narrator-messages");
    container.innerHTML = "";
    const div = document.createElement("div");
    div.className = "narrator-line animate-in";
    div.textContent = text;
    container.appendChild(div);
  }

  // ============================================================
  // EVENT HISTORY (Phase 2)
  // ============================================================
  function renderEventHistory(events) {
    if (!events || events.length === 0) return;
    lastGameEvents = events;

    const container = $("event-history-list");
    container.innerHTML = "";

    const EVENT_LABELS = {
      kill: "Killed by Mafia",
      save: "Saved by Doctor",
      execution: "Executed",
      lover_death: "Died of heartbreak",
      spared: "Spared by vote",
      joker_haunt: "Haunted by the Joker",
      investigation_mafia: "Investigated — MAFIA",
      investigation_clear: "Investigated — Clear",
    };

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

    for (const round of Object.keys(grouped).sort((a, b) => a - b)) {
      const header = document.createElement("div");
      header.className = "event-history-round";
      header.textContent = `Round ${round}`;
      container.appendChild(header);

      for (const ev of grouped[round]) {
        const item = document.createElement("div");
        item.className = `event-item ${ev.type}`;
        item.textContent = `${ev.playerName} — ${EVENT_LABELS[ev.type] || ev.type}`;
        container.appendChild(item);
      }
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
        const dotStyle = p.isAlive && p.color ? `style="background:${p.color}"` : '';
        const isMafiaTeammate = myRole === "mafia" && mafiaTeam.includes(p.username);
        const showMafiaTag = isMafiaTeammate && !hideMafiaTag;
        const investigated = investigationMap.hasOwnProperty(p.username);
        const isMafia = investigated ? investigationMap[p.username] : false;
        return `<div class="player-status-item">
          <span class="player-status-dot ${status}" ${dotStyle}></span>
          <span class="player-status-name ${status}">${escapeHtml(p.username)}</span>
          ${showMafiaTag ? '<span class="mafia-tag">MAFIA</span>' : ''}
          ${investigated ? (isMafia ? '<span class="detective-tag mafia">\u{1F44E}</span>' : '<span class="detective-tag clear">\u{1F44D}</span>') : ''}
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
  let jokerHauntActive = false; // true while dead joker is choosing haunt target
  let mafiaTargetPlayers = []; // the target list for re-rendering icons

  function showNightAction(title, players, actionType, disabledId) {
    // Allow joker_haunt even when dead (joker haunts from beyond the grave)
    if (isDead && actionType !== "joker_haunt") return;

    const panel = $("night-actions");
    panel.classList.remove("hidden");
    $("action-title").textContent = title;
    $("action-status").textContent = "";
    nightActionLocked = false;

    hideSlideConfirm();

    const list = $("action-targets");

    if (actionType === "mafia_vote") {
      mafiaTargetPlayers = players;
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
      list.innerHTML = players
        .map((p) => {
          const isDisabled = disabledId != null && p.id === disabledId;
          const suffix = isDisabled ? " (protected last night)" : "";
          return `<li data-id="${p.id}" class="${isDisabled ? "disabled" : ""}">${escapeHtml(p.username)}${suffix}</li>`;
        })
        .join("");

      // Doctor/Detective/Joker haunt: clicking selects visually, slide-to-confirm sends to server
      let selectedTargetId = null;
      let selectedName = null;
      const slideRole = actionType === "joker_haunt" ? "joker_haunt" : myRole;
      list.querySelectorAll("li:not(.disabled)").forEach((li) => {
        li.addEventListener("click", () => {
          if (nightActionLocked) return;
          list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
          li.classList.add("selected");
          selectedTargetId = parseInt(li.dataset.id);
          selectedName = li.textContent;
          setupSlideConfirm(slideRole, () => {
            if (nightActionLocked || selectedTargetId === null) return;
            nightActionLocked = true;
            if (actionType === "joker_haunt") jokerHauntActive = false;
            wsSend({ type: actionType, targetId: selectedTargetId });
            // Collapse to show only chosen target
            list.innerHTML = `<li class="selected">${escapeHtml(selectedName)} \u2714</li>`;
          });
        });
      });
    }
  }

  function renderSingleMafiaTargets(list, players) {
    list.innerHTML = players
      .map((p) => `<li data-id="${p.id}" class="single-mafia-target">${escapeHtml(p.username)}</li>`)
      .join("");

    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        if (nightActionLocked) return;
        const targetId = parseInt(li.dataset.id);
        list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
        li.classList.add("selected");
        // Send maybe then lock with small delay
        wsSend({ type: "mafia_vote", targetId, voteType: "maybe" });
        setTimeout(() => {
          wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
        }, 50);
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
                  chip.style.background = voterPlayer.color;
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
        badge.textContent = "Blocked";
        header.appendChild(badge);
      } else if (cardState === "unanimous") {
        const badge = document.createElement("span");
        badge.className = "mtc-lock-progress";
        badge.textContent = "Unanimous";
        header.appendChild(badge);
      } else if (counts.lock > 0) {
        const badge = document.createElement("span");
        badge.className = "mtc-lock-progress";
        badge.textContent = counts.lock + "/" + aliveMafiaCount + " locked";
        header.appendChild(badge);
      }
      card.appendChild(header);

      // Objection message
      if (isObjected) {
        const objMsg = document.createElement("div");
        objMsg.className = "mtc-objection-msg";
        objMsg.textContent = "Objected by " + mafiaObjectedTargets[targetId].join(", ");
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
            btn.textContent = "Remove Objection";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "letsnot" });
            });
            actions.appendChild(btn);
          }
        } else if (cardState === "unanimous") {
          // No buttons — slide-to-kill takes over
        } else if (cardState === "idle") {
          const nomBtn = document.createElement("button");
          nomBtn.className = "mtc-btn mtc-btn-suggest";
          nomBtn.textContent = "\u{1F449} Nominate";
          nomBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (nightActionLocked) return;
            wsSend({ type: "mafia_vote", targetId, voteType: "maybe" });
          });
          actions.appendChild(nomBtn);

          const spareBtn = document.createElement("button");
          spareBtn.className = "mtc-btn mtc-btn-object";
          spareBtn.textContent = "\u{274C} Spare";
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
            unlockBtn.textContent = "Unlock";
            unlockBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
            });
            actions.appendChild(unlockBtn);
          } else if (hasMyMaybe) {
            const lockBtn = document.createElement("button");
            lockBtn.className = "mtc-btn mtc-btn-lock";
            lockBtn.textContent = "\u{1F512} Lock In";
            lockBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
            });
            actions.appendChild(lockBtn);
          } else if (cardState === "partial-lock") {
            // Someone else already locked — show Lock In (auto-sends maybe+lock)
            const lockBtn = document.createElement("button");
            lockBtn.className = "mtc-btn mtc-btn-lock";
            lockBtn.textContent = "\u{1F512} Lock In";
            lockBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              wsSend({ type: "mafia_vote", targetId, voteType: "maybe" });
              setTimeout(() => {
                wsSend({ type: "mafia_vote", targetId, voteType: "lock" });
              }, 50);
            });
            actions.appendChild(lockBtn);
          } else {
            const nomBtn = document.createElement("button");
            nomBtn.className = "mtc-btn mtc-btn-suggest";
            nomBtn.textContent = "\u{1F449} Nominate";
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
            objBtn.textContent = "\u{274C}";
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
    // handleMafiaConfirmReady will collapse the list and show slide-to-kill
    if (msg.lockedTarget) return;

    // For single mafia, don't re-render cards (consensus will trigger confirm)
    if (mafiaTeam.length <= 1) return;

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
          if (v.voteType === "maybe") lines.push(`${escapeHtml(voterName)} nominates ${escapeHtml(v.target)}`);
          else if (v.voteType === "lock") lines.push(`${escapeHtml(voterName)} locks in ${escapeHtml(v.target)}`);
          else if (v.voteType === "letsnot") lines.push(`${escapeHtml(voterName)} objects to killing ${escapeHtml(v.target)}`);
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

    const list = $("action-targets");

    if (msg.lockedTarget) {
      // Consensus reached — show collapsed "chosen" view
      $("action-title").textContent = "Mafia has chosen\u2026";
      list.innerHTML = `<li class="spectator-locked">${escapeHtml(msg.lockedTarget)} \u2014 chosen</li>`;
      $("mafia-vote-status").classList.add("hidden");
    } else {
      // Deliberation in progress — show read-only cards
      $("action-title").textContent = "Mafia is deliberating\u2026";

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
          if (v.voteType === "maybe") lines.push(`${escapeHtml(voterName)} nominates ${escapeHtml(v.target)}`);
          else if (v.voteType === "lock") lines.push(`${escapeHtml(voterName)} locks in ${escapeHtml(v.target)}`);
          else if (v.voteType === "letsnot") lines.push(`${escapeHtml(voterName)} objects to killing ${escapeHtml(v.target)}`);
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
    $("mafia-vote-status").classList.add("hidden");
    renderSpectatorLog();

    $("action-title").textContent = "Dawn approaches\u2026";
    if (msg.kills && msg.kills.length > 0) {
      $("action-targets").innerHTML = msg.kills.map(k => {
        const label = k.source === "joker_haunt" ? "haunted by the Joker" : "killed by the Mafia";
        return `<li class="spectator-kill-result">${escapeHtml(k.name)} \u2014 ${label}</li>`;
      }).join("");
    } else {
      $("action-targets").innerHTML = `<li class="spectator-kill-result">${escapeHtml(msg.targetName)} \u2014 killed by the Mafia</li>`;
    }
    $("action-status").textContent = msg.doctorMessage || "";
  }

  function showSpectatorNightPhase(msg) {
    const panel = $("night-actions");
    panel.classList.remove("hidden");
    hideSlideConfirm();
    $("mafia-vote-status").classList.add("hidden");
    $("action-status").textContent = "";
    renderSpectatorLog();

    const list = $("action-targets");
    if (msg.subPhase === "doctor") {
      if (msg.isRoleAlive) {
        $("action-title").textContent = "Doctor is deliberating\u2026";
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.7">Choosing who to protect\u2026</li>`;
      } else {
        $("action-title").textContent = "The Doctor has fallen\u2026";
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.5">No one will be saved tonight</li>`;
      }
    } else if (msg.subPhase === "detective") {
      if (msg.isRoleAlive) {
        $("action-title").textContent = "Detective is investigating\u2026";
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.7">Choosing who to investigate\u2026</li>`;
      } else {
        $("action-title").textContent = "The Detective has fallen\u2026";
        list.innerHTML = `<li class="spectator-locked" style="opacity:0.5">No investigation tonight</li>`;
      }
    } else if (msg.subPhase === "resolving") {
      $("action-title").textContent = "Dawn approaches\u2026";
      list.innerHTML = "";
    }
  }

  function formatSpectatorLogEntry(entry) {
    const div = document.createElement("div");
    div.className = "spectator-log-entry" + (entry.alive ? "" : " log-dead");
    if (entry.phase === "mafia") {
      div.innerHTML = `Mafia chose to kill <span class="log-target">${escapeHtml(entry.targetName)}</span>`;
    } else if (entry.phase === "doctor") {
      if (entry.alive) {
        div.innerHTML = `Doctor chose to protect <span class="log-target">${escapeHtml(entry.targetName)}</span>`;
      } else {
        div.textContent = "Doctor has fallen \u2014 no protection tonight";
      }
    } else if (entry.phase === "detective") {
      if (entry.alive) {
        div.innerHTML = `Detective chose to investigate <span class="log-target">${escapeHtml(entry.targetName)}</span>`;
      } else {
        div.textContent = "Detective has fallen \u2014 no investigation tonight";
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
      label.textContent = `(Vote #${dayVoteCount} done)`;
      $("admin-status-msg").textContent = "Vote failed. Nominate another player or end the day.";
    } else {
      label.textContent = "";
      $("admin-status-msg").textContent = "";
    }

  }

  function populateAdminTargets(players) {
    const list = $("admin-target-list");
    list.innerHTML = players
      .filter((p) => p.isAlive)
      .map((p) => `<li data-id="${p.id}">${p.username}</li>`)
      .join("");

    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
        li.classList.add("selected");
        wsSend({ type: "call_vote", targetId: parseInt(li.dataset.id) });
      });
    });
  }

  $("btn-force-dawn").addEventListener("click", () => {
    if (confirm("Force dawn? Night actions will be skipped and no one will be killed.")) {
      wsSend({ type: "force_dawn" });
    }
  });

  $("btn-end-day").addEventListener("click", () => {
    if (confirm("End the day and transition to night?")) {
      ensureAudioReady();
      wsSend({ type: "end_day" });
    }
  });

  function handleVoteCalled(msg, fromSync) {
    if (!fromSync) hasVoted = false;

    const panel = $("voting-panel");
    panel.classList.remove("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("vote-target-name").textContent = msg.targetName;
    $("vote-progress").textContent = "Waiting for votes...";

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

  $("btn-vote-yes").addEventListener("click", () => {
    if (hasVoted || isDead) return;
    ensureAudioReady();
    hasVoted = true;
    $("btn-vote-yes").classList.add("selected");
    $("btn-vote-yes").disabled = true;
    $("btn-vote-no").disabled = true;
    wsSend({ type: "cast_vote", approve: true });
  });

  $("btn-vote-no").addEventListener("click", () => {
    if (hasVoted || isDead) return;
    ensureAudioReady();
    hasVoted = true;
    $("btn-vote-no").classList.add("selected");
    $("btn-vote-yes").disabled = true;
    $("btn-vote-no").disabled = true;
    wsSend({ type: "cast_vote", approve: false });
  });

  $("btn-cancel-vote").addEventListener("click", () => {
    wsSend({ type: "cancel_vote" });
  });

  function updateVoteProgress(msg) {
    $("vote-progress").textContent = `${msg.totalVotes} / ${msg.total} votes cast`;
  }

  function handleVoteResult(msg) {
    $("voting-panel").classList.add("hidden");
    lastVoteResult = msg;

    const resultText = msg.executed
      ? `${msg.targetName} has been executed. (${msg.votesFor} for, ${msg.votesAgainst} against)`
      : `${msg.targetName} has been spared. (${msg.votesFor} for, ${msg.votesAgainst} against)`;
    showNarratorMessage(resultText);
  }

  // ============================================================
  // TRANSCRIPT
  // ============================================================
  $("btn-transcript").addEventListener("click", () => {
    const list = $("transcript-list");
    const empty = $("transcript-empty");
    if (narratorTranscript.length === 0) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      list.innerHTML = narratorTranscript
        .map((msg) => `<div class="transcript-line">${escapeHtml(msg)}</div>`)
        .join("");
    }
    $("modal-transcript").classList.remove("hidden");
  });

  $("btn-close-transcript").addEventListener("click", () => {
    $("modal-transcript").classList.add("hidden");
  });

  // Dead overlay click-to-dismiss (for all players)
  $("dead-overlay").addEventListener("click", () => {
    $("dead-overlay").classList.add("hidden");
    $("dead-dismiss-hint").classList.add("hidden");
  });

  // Joker win overlay (official mode — only visible to the joker, replaces death screen)
  function showJokerWinOverlay(jokerName) {
    // Show using the death overlay but with joker-specific content
    $("dead-overlay").classList.remove("hidden");
    $("dead-emoji").textContent = "\u{1F0CF}"; // joker card emoji
    $("death-message").textContent = "You achieved a joint victory!";
    $("dead-dismiss-hint").classList.remove("hidden");
  }

  // Doctor save private notification (official mode)
  function showDoctorSavePrivate(message) {
    // Show as a detective-result-style notification
    const el = $("detective-result");
    el.textContent = message;
    el.style.borderColor = "var(--role-doctor)";
    el.classList.remove("hidden");
  }

  // ============================================================
  // SETTINGS MODAL
  // ============================================================
  function openSettingsModal() {
    $("toggle-sound").checked = soundEnabled;
    $("toggle-dark-mode").checked = document.documentElement.getAttribute("data-theme") !== "light";
    $("toggle-hide-mafia-tag").checked = hideMafiaTag;
    // Show room code for admin
    if (isAdmin && gameCode) {
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

  $("toggle-sound").addEventListener("change", (e) => {
    soundEnabled = e.target.checked;
    if (!soundEnabled) flushSoundQueue();
  });

  // Dark mode toggle
  function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0a0a0a" : "#f0ebe1");
  }

  // Initialize theme from localStorage (dark by default)
  const savedTheme = localStorage.getItem("mafia_dark_mode");
  const darkMode = savedTheme === null ? true : savedTheme === "true";
  $("toggle-dark-mode").checked = darkMode;
  if (!darkMode) applyTheme(false);

  $("toggle-dark-mode").addEventListener("change", (e) => {
    const isDark = e.target.checked;
    localStorage.setItem("mafia_dark_mode", String(isDark));
    applyTheme(isDark);
  });

  $("toggle-hide-mafia-tag").addEventListener("change", (e) => {
    hideMafiaTag = e.target.checked;
    wsSend({ type: "update_player_pref", key: "hide_mafia_tag", value: hideMafiaTag });
    updatePlayerStatus();
  });

  $("btn-end-game").addEventListener("click", () => {
    if (confirm("Are you sure you want to end the game?")) {
      wsSend({ type: "end_game" });
      closeSettingsModal();
    }
  });

  $("btn-settings-leave").addEventListener("click", () => {
    if (confirm("Leave the game? You can rejoin later with the same room code.")) {
      wsSend({ type: "leave_game" });
      localStorage.removeItem("mafia_game_code");
      $("event-history").classList.add("hidden");
      gameCode = null;
      isAdmin = false;
      closeSettingsModal();
      showScreen("menu");
    }
  });

  // ============================================================
  // GAME OVER (Phase 1: show all roles)
  // ============================================================

  function handleGameOver(msg) {
    $("dead-overlay").classList.add("hidden");
    closeSettingsModal();

    // Reset gameplay state but keep gameCode/isAdmin for Play Again
    const savedIsAdmin = isAdmin;
    myRole = null;
    isLover = false;
    mafiaTeam = [];
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

  function showGameOverScreen(msg, admin) {
    showScreen("gameover");
    const titles = {
      town: "Citizens Win!",
      mafia: "Mafia Wins!",
      joker: "Joker Wins!",
    };
    if (msg.forceEnded) {
      $("gameover-title").textContent = "Game Over";
      $("gameover-title").style.color = "var(--text)";
    } else {
      $("gameover-title").textContent = titles[msg.winner] || "Game Over";
      $("gameover-title").style.color =
        msg.winner === "town" ? "var(--role-citizen)" :
        msg.winner === "mafia" ? "var(--role-mafia)" :
        msg.winner === "joker" ? "var(--role-joker)" : "var(--text)";
    }
    $("gameover-message").textContent = msg.message;
    $("gameover-buttons").classList.add("hidden");
    $("gameover-buttons-player").classList.add("hidden");
    renderGameHistory();
  }

  function renderGameHistory() {
    const container = $("game-history");
    container.innerHTML = "";
    // Filter to kills, saves, executions, lover deaths (skip spared)
    const events = lastGameEvents.filter((e) => e.type !== "spared");
    if (events.length === 0) return;

    const LABELS = {
      kill: "Killed by the Mafia",
      save: "Saved by the Doctor",
      execution: "Executed by vote",
      lover_death: "Died of heartbreak",
      joker_haunt: "Haunted by the Joker",
    };

    // Group by round, split night vs day
    // Night events: kill, save, lover_death following a kill
    // Day events: execution, lover_death following an execution
    const grouped = {};
    let lastPhase = "night";
    for (const ev of events) {
      if (!grouped[ev.round]) grouped[ev.round] = { night: [], day: [] };
      if (ev.type === "kill" || ev.type === "save" || ev.type === "joker_haunt") {
        grouped[ev.round].night.push(ev);
        lastPhase = "night";
      } else if (ev.type === "execution") {
        grouped[ev.round].day.push(ev);
        lastPhase = "day";
      } else if (ev.type === "lover_death") {
        grouped[ev.round][lastPhase].push(ev);
      }
    }

    for (const round of Object.keys(grouped).sort((a, b) => a - b)) {
      const { night, day } = grouped[round];
      if (night.length > 0) {
        const header = document.createElement("div");
        header.className = "game-history-round";
        header.textContent = `Night ${round}`;
        container.appendChild(header);
        for (const ev of night) {
          const item = document.createElement("div");
          item.className = `game-history-item ${ev.type}`;
          item.textContent = `${ev.playerName} \u2014 ${LABELS[ev.type] || ev.type}`;
          container.appendChild(item);
        }
      }
      if (day.length > 0) {
        const header = document.createElement("div");
        header.className = "game-history-round";
        header.textContent = `Day ${round}`;
        container.appendChild(header);
        for (const ev of day) {
          const item = document.createElement("div");
          item.className = `game-history-item ${ev.type}`;
          item.textContent = `${ev.playerName} \u2014 ${LABELS[ev.type] || ev.type}`;
          container.appendChild(item);
        }
      }
    }
  }

  function showGameOverButtons(admin) {
    if (admin) {
      $("gameover-buttons").classList.remove("hidden");
      $("gameover-buttons-player").classList.add("hidden");
    } else {
      $("gameover-buttons-player").classList.remove("hidden");
      $("gameover-buttons").classList.add("hidden");
    }
  }

  function showGameOverSuspense(msg, admin) {
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    text.textContent = "The game is over...";
    text.style.color = "";
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    const winColor =
      msg.winner === "town" ? "var(--role-citizen)" :
      msg.winner === "mafia" ? "var(--role-mafia)" :
      msg.winner === "joker" ? "var(--role-joker)" : "var(--text)";
    const winText =
      msg.winner === "town" ? "Citizens Win!" :
      msg.winner === "mafia" ? "Mafia Wins!" :
      msg.winner === "joker" ? "Joker Wins!" : "Game Over";

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

    const hiddenClass = hidden ? " reveal-hidden" : "";
    container.innerHTML = sorted
      .map((p) => {
        const dead = !p.isAlive;
        const loverText = loverPairs[p.id] ? `<span class="role-reveal-lover">\u2764 ${escapeHtml(loverPairs[p.id])}</span>` : "";
        const deadText = dead ? '<span class="role-reveal-dead">DEAD</span>' : "";
        const trophyText = (jokerJointWinner && p.role === "joker") ? '<span class="role-reveal-trophy">\uD83C\uDFC6</span>' : "";
        return `<div class="role-reveal-item${dead ? " dead" : ""}${hiddenClass}" data-role="${p.role || ""}">
          <span class="role-reveal-name">${escapeHtml(p.username)}</span>
          <span class="role-reveal-role ${p.role || ""}">${(p.role || "?").toUpperCase()}</span>
          ${trophyText}
          ${loverText}
          ${deadText}
        </div>`;
      })
      .join("");
  }

  function revealRolesStaggered(players, admin) {
    const items = Array.from($("role-reveal").querySelectorAll(".role-reveal-item"));
    if (items.length === 0) {
      showGameOverButtons(admin);
      return;
    }

    // Find the boundary between non-mafia and mafia
    const firstMafiaIdx = items.findIndex((el) => el.dataset.role === "mafia");
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
    if (confirm("Close room? All players will be removed.")) {
      wsSend({ type: "close_room" });
    }
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
      preloadNarrationAudio(currentAccent);
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
      preloadNarrationAudio(currentAccent);
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

  // Fetch mp3 files and decode into AudioBuffers (bypasses HTML5 Audio entirely)
  function preloadNarrationAudio(accent) {
    narrationAudioCache = {};
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

  function populateAccentSelector() {
    const sel = $("lobby-accent");
    if (!sel || !narrationData) return;
    sel.innerHTML = "";
    for (const [key, info] of Object.entries(narrationData.accents)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = info.label + " — " + info.description;
      sel.appendChild(opt);
    }
    sel.value = currentAccent;
  }

  // Init: load narration data
  fetch("/narration.json")
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data) return;
      narrationData = data;
      populateAccentSelector();
      preloadNarrationAudio(currentAccent);
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
  // INIT
  // ============================================================
  const APP_VERSION = "v1.2_202603040319";
  const APP_VERSION_STAGING = "staging.9_202603041610";
  const displayVersion = window.location.hostname.includes("staging") ? APP_VERSION_STAGING : APP_VERSION;
  document.querySelectorAll(".app-version").forEach((el) => { el.textContent = displayVersion; });
  $("btn-vote-yes").innerHTML = pixelArtToSvg(THUMB_UP_ART);
  $("btn-vote-no").innerHTML = pixelArtToSvg(THUMB_DOWN_ART);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  connectPatched();
})();
