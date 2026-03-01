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
  let currentPhase = null;
  let previousPhase = null;
  let soundEnabled = false;
  let hasVoted = false;
  let audioCtx = null;
  let knownPlayers = [];
  let mafiaTeam = [];
  let dayVoteCount = 0;
  let suspenseActive = false;
  let suspenseQueue = [];
  let anonVoteChecked = true;
  let narratorTranscript = [];
  let deadDismissTimer = null;
  let dayTimerInterval = null;
  let dayTimerStart = null;
  let detectiveHistory = [];
  let mafiaConfirmTarget = null;
  let lastGameEvents = [];

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
      if (p) p.isAlive = false;
    }
    if (msg.type === "game_started") {
      if (gotPlayerList) {
        // Rejoin — player_list already has correct alive/dead state, don't overwrite
        gotPlayerList = false;
      } else {
        // Fresh game start — everyone is alive
        knownPlayers = knownPlayers.map((p) => ({ ...p, isAlive: true }));
      }
    }
  }

  // ============================================================
  // SERVER MESSAGE HANDLER
  // ============================================================
  function handleServerMessage(msg) {
    // During suspense, queue certain messages
    if (suspenseActive && (msg.type === "player_died" || msg.type === "you_died")) {
      suspenseQueue.push(msg);
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
        if (msg.type === "registered") {
          const passcode = $("auth-passcode").value;
          localStorage.setItem("mafia_user", JSON.stringify({ username: msg.username, passcode }));
        }
        $("menu-username").textContent = username;
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
        localStorage.setItem("mafia_game_code", gameCode);
        $("lobby-code").textContent = gameCode;
        showScreen("lobbyAdmin");
        break;

      case "game_joined":
        gameCode = msg.code;
        isAdmin = msg.isAdmin;
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
        // Fresh game start — reset all state
        hasVoted = false;
        dayVoteCount = 0;
        narratorTranscript = [];
        detectiveHistory = [];
        nightActionLocked = false;
        mafiaConfirmTarget = null;
        lastGameEvents = [];
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
        $("btn-play-again").classList.add("hidden");
        // Show players tab from game start
        resetEventHistoryTabs("players");
        $("event-history").classList.remove("hidden");
        updatePlayerStatus();
        break;

      case "phase_change":
        handlePhaseChange(msg);
        break;

      case "sound_cue":
        playSound(msg.sound);
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

      case "mafia_vote_update":
        updateMafiaVoteStatus(msg);
        break;

      case "mafia_confirm_ready":
        handleMafiaConfirmReady(msg);
        break;

      case "night_action_done":
        $("action-status").textContent = msg.message;
        // If mafia and another mafia confirmed, collapse our target list too
        if (myRole === "mafia" && !nightActionLocked && mafiaConfirmTarget) {
          nightActionLocked = true;
          hideSlideConfirm();
          $("action-targets").innerHTML = `<li class="selected">${escapeHtml(mafiaConfirmTarget)} \u2714</li>`;
        }
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
        $("dead-overlay").classList.remove("hidden");
        $("death-message").textContent = msg.message;
        $("dead-dismiss-hint").classList.remove("hidden");
        $("card-back-art").innerHTML = pixelArtToSvg(CARD_BACK_DEAD_ART);
        break;

      case "game_over":
        handleGameOver(msg);
        break;

      case "configs_list":
        showConfigList(msg.configs, false);
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

      case "config_saved":
        showError(""); // clear
        closeConfigModal();
        break;

      case "config_deleted":
        wsSend({ type: "list_configs" });
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

    // 5. Restore accumulated state
    dayVoteCount = msg.dayVoteCount;
    narratorTranscript = msg.narratorHistory;
    detectiveHistory = msg.detectiveHistory;
    anonVoteChecked = msg.anonVoteChecked;
    hasVoted = false;
    nightActionLocked = false;
    mafiaConfirmTarget = null;
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

    // 10. Show recent narrator messages
    $("narrator-messages").innerHTML = "";
    if (narratorTranscript.length > 0) {
      const recent = narratorTranscript.slice(-5);
      for (const m of recent) {
        const div = document.createElement("div");
        div.className = "narrator-line";
        div.textContent = m;
        $("narrator-messages").appendChild(div);
      }
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
        if (na.locked && na.targetName) {
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
            mafiaConfirmTarget = na.targetName;
          }
        } else if (na.targets.length > 0) {
          // Show target selection
          const actionType = myRole === "mafia" ? "mafia_vote"
            : myRole === "doctor" ? "doctor_save" : "detective_investigate";
          const title = myRole === "mafia" ? "Choose a victim"
            : myRole === "doctor" ? "Choose someone to protect" : "Choose someone to investigate";
          showNightAction(title, na.targets, actionType, myRole === "doctor" ? na.lastDoctorTarget : undefined);

          // Restore mafia vote status
          if (myRole === "mafia" && Object.keys(na.voterTargets).length > 0) {
            updateMafiaVoteStatus({ voterTargets: na.voterTargets });
          }
          // Restore confirm prompt
          if (myRole === "mafia" && na.confirmTargetName) {
            handleMafiaConfirmReady({ targetName: na.confirmTargetName });
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
        anonymous: vs.anonymous,
      });
      updateVoteProgress({
        votesFor: vs.votesFor,
        votesAgainst: vs.votesAgainst,
        total: vs.total,
        voterNames: vs.voterNames || undefined,
      });
    }

    // Show event history during day/voting
    if ((msg.phase === "day" || msg.phase === "voting") && $("event-history-list").innerHTML) {
      $("event-history").classList.remove("hidden");
    }

    // 12. Show death overlay if dead
    if (isDead) {
      $("dead-overlay").classList.remove("hidden");
      $("death-message").textContent = "You were killed.";
      $("dead-dismiss-hint").classList.remove("hidden");
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
    wsSend({ type: "start_game" });
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
    });
  });

  function updateLobby(msg) {
    const { players, settings, adminName } = msg;

    $("player-count-admin").textContent = players.length;
    $("players-list-admin").innerHTML = players
      .map(
        (p) =>
          `<li>${p.username}${p.isAdmin ? ' <span class="admin-badge">HOST</span>' : ""}</li>`
      )
      .join("");

    $("player-count-player").textContent = players.length;
    $("admin-name-display").textContent = adminName;
    $("players-list-player").innerHTML = players
      .map(
        (p) =>
          `<li>${p.username}${p.isAdmin ? ' <span class="admin-badge">HOST</span>' : ""}</li>`
      )
      .join("");

    updateSettingsUI(settings);

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
    if ($("toggle-anon-vote")) $("toggle-anon-vote").checked = anonVoteChecked;
  }

  // ============================================================
  // CONFIGS
  // ============================================================
  $("btn-save-config").addEventListener("click", () => {
    openConfigModal(true);
  });

  $("btn-load-config").addEventListener("click", () => {
    openConfigModal(false);
    wsSend({ type: "list_configs" });
  });

  $("btn-close-config-modal").addEventListener("click", closeConfigModal);

  $("btn-confirm-save-config").addEventListener("click", () => {
    const name = $("config-name-input").value.trim();
    if (!name) return;
    wsSend({ type: "save_config", name });
  });

  function openConfigModal(isSave) {
    $("modal-config").classList.remove("hidden");
    $("modal-config-title").textContent = isSave ? "Save Preset" : "Load Preset";
    if (isSave) {
      $("config-save-section").classList.remove("hidden");
      $("config-name-input").value = "";
      $("config-name-input").focus();
    } else {
      $("config-save-section").classList.add("hidden");
    }
  }

  function closeConfigModal() {
    $("modal-config").classList.add("hidden");
  }

  function showConfigList(configs, isSave) {
    const list = $("config-list");
    const empty = $("config-empty");
    if (configs.length === 0) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    list.innerHTML = configs
      .map(
        (c) =>
          `<li data-id="${c.id}">
            <span class="config-name">${escapeHtml(c.name)}</span>
            <button class="config-delete" data-id="${c.id}">&times;</button>
          </li>`
      )
      .join("");

    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", (e) => {
        if (e.target.classList.contains("config-delete")) return;
        wsSend({ type: "load_config", configId: parseInt(li.dataset.id) });
        closeConfigModal();
      });
    });

    list.querySelectorAll(".config-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        wsSend({ type: "delete_config", configId: parseInt(btn.dataset.id) });
      });
    });
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
      : role === "doctor" ? CROSS_ART : MAGNIFIER_ART;
    icon.innerHTML = pixelArtToSvg(iconArt);

    const labels = { mafia: "slide to kill", doctor: "slide to save", detective: "slide to investigate" };
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
      showNightTransition(() => {
        applyPhaseChange(msg);
      });
    // Night-to-day suspense transition (Phase 5)
    } else if (previousPhase === "night" && msg.phase === "day") {
      showSuspenseTransition(msg, () => {
        applyPhaseChange(msg);
      });
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

    // Render recent narrator messages from transcript on rejoin
    if (narratorTranscript.length > 0 && (!msg.messages || msg.messages.length === 0)) {
      const recent = narratorTranscript.slice(-5);
      for (const m of recent) {
        const div = document.createElement("div");
        div.className = "narrator-line";
        div.textContent = m;
        $("narrator-messages").appendChild(div);
      }
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
      $("event-history").classList.add("hidden");
      clearDetectiveResult();
      $("mafia-vote-details").innerHTML = "";
      if (isAdmin) {
        $("admin-night-controls").classList.remove("hidden");
      }
    }

    // Show event history during day/voting
    if ((msg.phase === "day" || msg.phase === "voting") && $("event-history-list").innerHTML) {
      $("event-history").classList.remove("hidden");
    }
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
        callback();
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
    if (hasSave && hasKill) return { text: "\u{1F6E1}\uFE0F A life was saved... but not everyone.", color: "#2196f3" };
    if (hasSave) return { text: "\u{1F6E1}\uFE0F The Doctor saved a life!", color: "#2196f3" };
    if (hasKill) return { text: "\u{1F480} Someone didn't survive the night.", color: "#d32f2f" };
    return { text: "\u{1F319} A peaceful night... somehow.", color: "#8e8e93" };
  }

  function showSuspenseTransition(msg, callback) {
    suspenseActive = true;
    suspenseQueue = [];
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

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

    setTimeout(() => {
      overlay.classList.add("fade-out");
    }, 5000);

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
    }, 5800);
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
    const div = document.createElement("div");
    div.className = "narrator-line";
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
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

    $("event-history").classList.remove("hidden");
    updatePlayerStatus();
  }

  function updatePlayerStatus() {
    const container = $("player-status-list");
    if (!container) return;
    container.innerHTML = knownPlayers
      .map((p) => {
        const status = p.isAlive ? "alive" : "dead";
        const isMafiaTeammate = myRole === "mafia" && mafiaTeam.includes(p.username);
        return `<div class="player-status-item">
          <span class="player-status-dot ${status}"></span>
          <span class="player-status-name ${status}">${escapeHtml(p.username)}</span>
          ${isMafiaTeammate ? '<span class="mafia-tag">MAFIA</span>' : ''}
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

  let mafiaChoiceTarget = null; // tracks which target row has Lock/Maybe expanded

  function showNightAction(title, players, actionType, disabledId) {
    if (isDead) return;

    const panel = $("night-actions");
    panel.classList.remove("hidden");
    $("action-title").textContent = title;
    $("action-status").textContent = "";
    nightActionLocked = false;
    mafiaChoiceTarget = null;

    hideSlideConfirm();
    $("mafia-action-buttons").classList.add("hidden");
    $("btn-mafia-object").classList.add("hidden");
    $("btn-mafia-remove").classList.add("hidden");

    const list = $("action-targets");
    list.innerHTML = players
      .map((p) => {
        const isDisabled = disabledId != null && p.id === disabledId;
        const suffix = isDisabled ? " (protected last night)" : "";
        return `<li data-id="${p.id}" class="${isDisabled ? "disabled" : ""}">${escapeHtml(p.username)}${suffix}</li>`;
      })
      .join("");

    let selectedTargetId = null;

    if (actionType === "mafia_vote") {
      // Mafia: clicking a target shows Lock/Maybe inline choice
      list.querySelectorAll("li:not(.disabled)").forEach((li) => {
        li.addEventListener("click", () => {
          if (nightActionLocked) return;
          const targetId = parseInt(li.dataset.id);

          // If already showing choice for this target, collapse
          if (mafiaChoiceTarget === targetId) {
            collapseVoteChoice(list);
            return;
          }

          // Collapse any existing choice
          collapseVoteChoice(list);

          // Highlight and show Lock/Maybe buttons inline
          li.classList.add("choosing");
          mafiaChoiceTarget = targetId;
          const choiceDiv = document.createElement("div");
          choiceDiv.className = "mafia-vote-choice";
          choiceDiv.innerHTML = `<button class="btn btn-small btn-secondary" data-vote="lock">\u{1F512} Lock</button><button class="btn btn-small btn-secondary" data-vote="maybe">\u{1F914} Maybe</button>`;
          li.appendChild(choiceDiv);

          choiceDiv.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (nightActionLocked) return;
              const voteType = btn.dataset.vote;
              wsSend({ type: "mafia_vote", targetId, voteType });
              list.querySelectorAll("li").forEach((l) => l.classList.remove("selected", "choosing"));
              li.classList.add("selected");
              collapseVoteChoice(list);
              mafiaChoiceTarget = null;
            });
          });
        });
      });
      $("mafia-vote-status").classList.remove("hidden");
      $("mafia-action-buttons").classList.remove("hidden");
    } else {
      // Doctor/Detective: clicking selects visually, slide-to-confirm sends to server
      let selectedName = null;
      list.querySelectorAll("li:not(.disabled)").forEach((li) => {
        li.addEventListener("click", () => {
          if (nightActionLocked) return;
          list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
          li.classList.add("selected");
          selectedTargetId = parseInt(li.dataset.id);
          selectedName = li.textContent;
          setupSlideConfirm(myRole, () => {
            if (nightActionLocked || selectedTargetId === null) return;
            nightActionLocked = true;
            wsSend({ type: actionType, targetId: selectedTargetId });
            // Collapse to show only chosen target
            list.innerHTML = `<li class="selected">${escapeHtml(selectedName)} \u2714</li>`;
          });
        });
      });
    }
  }

  function collapseVoteChoice(list) {
    list.querySelectorAll(".mafia-vote-choice").forEach((c) => c.remove());
    list.querySelectorAll("li.choosing").forEach((l) => l.classList.remove("choosing"));
    mafiaChoiceTarget = null;
  }

  // Object button handler
  $("btn-mafia-object").addEventListener("click", () => {
    if (nightActionLocked) return;
    wsSend({ type: "mafia_object" });
    $("action-targets").querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
  });

  // Remove vote button handler
  $("btn-mafia-remove").addEventListener("click", () => {
    if (nightActionLocked) return;
    wsSend({ type: "mafia_remove_vote" });
    $("action-targets").querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
  });

  function updateMafiaVoteStatus(msg) {
    const details = $("mafia-vote-details");
    const entries = Object.entries(msg.voterTargets);
    if (entries.length === 0) {
      details.textContent = "No votes yet...";
      $("btn-mafia-object").classList.add("hidden");
      $("btn-mafia-remove").classList.add("hidden");
      return;
    }

    const VOTE_LABELS = {
      lock: { verb: "locks in", color: "#d32f2f" },
      maybe: { verb: "suggests", color: "#ff9800" },
      object: { verb: "objects to killing", color: "#d32f2f" },
    };

    details.innerHTML = entries
      .map(([voter, info]) => {
        const label = VOTE_LABELS[info.voteType] || VOTE_LABELS.lock;
        return `<div class="narrator-line animate-in"><span style="color:${label.color};font-weight:bold">${escapeHtml(voter)}</span> ${label.verb} ${escapeHtml(info.target)}.</div>`;
      })
      .join("");

    // Check if someone ELSE has a nomination (for Object button)
    const otherNomination = entries.some(([voter, info]) =>
      voter !== username && (info.voteType === "lock" || info.voteType === "maybe"));
    // Check if current player has a vote (for Remove button)
    const myVote = entries.find(([voter]) => voter === username);

    if (!nightActionLocked) {
      // Show Object button only if another player nominated, and we haven't already objected
      if (otherNomination && (!myVote || myVote[1].voteType !== "object")) {
        $("btn-mafia-object").classList.remove("hidden");
      } else {
        $("btn-mafia-object").classList.add("hidden");
      }
      // Show Remove button if we have any vote (label changes for objections)
      if (myVote) {
        $("btn-mafia-remove").textContent = myVote[1].voteType === "object" ? "Remove Objection" : "Remove Vote";
        $("btn-mafia-remove").classList.remove("hidden");
      } else {
        $("btn-mafia-remove").classList.add("hidden");
      }

      hideSlideConfirm();
      $("action-status").textContent = "";
      mafiaConfirmTarget = null;
    }
  }

  function handleMafiaConfirmReady(msg) {
    if (nightActionLocked) return;
    mafiaConfirmTarget = msg.targetName;
    $("action-status").textContent = `Unanimous! Target: ${msg.targetName}. Confirm to lock in.`;
    $("btn-mafia-object").classList.add("hidden");
    $("btn-mafia-remove").classList.add("hidden");
    setupSlideConfirm("mafia", () => {
      if (nightActionLocked) return;
      nightActionLocked = true;
      wsSend({ type: "confirm_mafia_kill" });
      // Collapse to show only chosen target
      const list = $("action-targets");
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

    // Sync anon toggle
    if ($("toggle-anon-vote")) {
      $("toggle-anon-vote").checked = anonVoteChecked;
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
        const anon = $("toggle-anon-vote") ? $("toggle-anon-vote").checked : true;
        wsSend({ type: "call_vote", targetId: parseInt(li.dataset.id), anonymous: anon });
      });
    });
  }

  // Per-vote anon toggle (Phase 3)
  if ($("toggle-anon-vote")) {
    $("toggle-anon-vote").addEventListener("change", (e) => {
      anonVoteChecked = e.target.checked;
    });
  }

  $("btn-force-dawn").addEventListener("click", () => {
    if (confirm("Force dawn? Night actions will be skipped and no one will be killed.")) {
      wsSend({ type: "force_dawn" });
    }
  });

  $("btn-end-day").addEventListener("click", () => {
    if (confirm("End the day and transition to night?")) {
      wsSend({ type: "end_day" });
    }
  });

  function handleVoteCalled(msg) {
    hasVoted = false;

    const panel = $("voting-panel");
    panel.classList.remove("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("vote-target-name").textContent = msg.targetName;
    $("vote-progress").textContent = "Waiting for votes...";
    $("vote-names").innerHTML = "";

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
    hasVoted = true;
    $("btn-vote-yes").classList.add("selected");
    $("btn-vote-yes").disabled = true;
    $("btn-vote-no").disabled = true;
    wsSend({ type: "cast_vote", approve: true });
  });

  $("btn-vote-no").addEventListener("click", () => {
    if (hasVoted || isDead) return;
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
    $("vote-progress").textContent = `${msg.votesFor + msg.votesAgainst} / ${msg.total} votes cast`;

    if (msg.voterNames) {
      const names = $("vote-names");
      names.innerHTML = Object.entries(msg.voterNames)
        .map(
          ([name, approved]) =>
            `<div class="${approved ? "vote-for" : "vote-against"}">${escapeHtml(name)}: ${approved ? "\u{1F44D}" : "\u{1F44E}"}</div>`
        )
        .join("");
    }
  }

  function handleVoteResult(msg) {
    $("voting-panel").classList.add("hidden");

    const resultText = msg.executed
      ? `${msg.targetName} has been executed. (${msg.votesFor} for, ${msg.votesAgainst} against)`
      : `${msg.targetName} has been spared. (${msg.votesFor} for, ${msg.votesAgainst} against)`;
    showNarratorMessage(resultText);

    if (msg.voterNames) {
      const breakdown = Object.entries(msg.voterNames)
        .map(([name, v]) => `${name}: ${v ? "\u{1F44D}" : "\u{1F44E}"}`)
        .join(", ");
      showNarratorMessage(`Votes: ${breakdown}`);
    }

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

  // ============================================================
  // SETTINGS MODAL
  // ============================================================
  $("btn-settings").addEventListener("click", () => {
    $("toggle-sound").checked = soundEnabled;
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
  });

  $("btn-close-settings").addEventListener("click", closeSettingsModal);

  $("modal-settings").addEventListener("click", (e) => {
    if (e.target === $("modal-settings")) closeSettingsModal();
  });

  function closeSettingsModal() {
    $("modal-settings").classList.add("hidden");
  }

  $("toggle-sound").addEventListener("change", (e) => {
    soundEnabled = e.target.checked;
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
    currentPhase = null;
    previousPhase = null;
    dayVoteCount = 0;

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
    };

    // Group by round, split night vs day
    // Night events: kill, save, lover_death following a kill
    // Day events: execution, lover_death following an execution
    const grouped = {};
    let lastPhase = "night";
    for (const ev of events) {
      if (!grouped[ev.round]) grouped[ev.round] = { night: [], day: [] };
      if (ev.type === "kill" || ev.type === "save") {
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
        return `<div class="role-reveal-item${dead ? " dead" : ""}${hiddenClass}" data-role="${p.role || ""}">
          <span class="role-reveal-name">${escapeHtml(p.username)}</span>
          <span class="role-reveal-role ${p.role || ""}">${(p.role || "?").toUpperCase()}</span>
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

  $("btn-close-room").addEventListener("click", () => {
    if (confirm("Close room? All players will be removed.")) {
      wsSend({ type: "close_room" });
    }
  });

  // ============================================================
  // SOUND
  // ============================================================
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
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
  const APP_VERSION = "v1.34_202602281646";
  document.querySelectorAll(".app-version").forEach((el) => { el.textContent = APP_VERSION; });
  $("btn-vote-yes").innerHTML = pixelArtToSvg(THUMB_UP_ART);
  $("btn-vote-no").innerHTML = pixelArtToSvg(THUMB_DOWN_ART);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  connectPatched();
})();
