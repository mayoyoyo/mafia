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
  let soundEnabled = true;
  let hasVoted = false;
  let audioCtx = null;

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
  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onopen = () => {
      // Auto-login if saved
      const saved = localStorage.getItem("mafia_user");
      if (saved) {
        const data = JSON.parse(saved);
        wsSend({ type: "login", username: data.username, passcode: data.passcode });
      }
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleServerMessage(msg);
    };

    ws.onclose = () => {
      setTimeout(connect, 2000);
    };
  }

  function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // ============================================================
  // SERVER MESSAGE HANDLER
  // ============================================================
  function handleServerMessage(msg) {
    switch (msg.type) {
      case "error":
        showError(msg.message);
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
        break;

      case "game_created":
        gameCode = msg.code;
        isAdmin = true;
        $("lobby-code").textContent = gameCode;
        showScreen("lobbyAdmin");
        break;

      case "game_joined":
        gameCode = msg.code;
        isAdmin = msg.isAdmin;
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

      case "game_started":
        myRole = msg.role;
        isLover = msg.isLover;
        isDead = false;
        hasVoted = false;
        showScreen("game");
        updateRoleCard();
        if (isAdmin) $("admin-end-game").classList.remove("hidden");
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
        showNightAction("Choose someone to protect", msg.players, "doctor_save");
        break;

      case "detective_targets":
        showNightAction("Choose someone to investigate", msg.players, "detective_investigate");
        break;

      case "mafia_vote_update":
        updateMafiaVoteStatus(msg);
        break;

      case "night_action_done":
        $("action-status").textContent = msg.message;
        break;

      case "detective_result":
        showNarratorMessage(
          msg.isMafia
            ? `Your investigation reveals: ${msg.targetName} IS a member of the Mafia!`
            : `Your investigation reveals: ${msg.targetName} is NOT a member of the Mafia.`
        );
        break;

      case "vote_called":
        handleVoteCalled(msg);
        break;

      case "vote_update":
        updateVoteProgress(msg);
        break;

      case "vote_result":
        handleVoteResult(msg);
        break;

      case "player_died":
        // Another player died
        showNarratorMessage(msg.message);
        break;

      case "you_died":
        isDead = true;
        $("dead-overlay").classList.remove("hidden");
        $("death-message").textContent = msg.message;
        break;

      case "game_over":
        handleGameOver(msg);
        break;

      case "configs_list":
        showConfigList(msg.configs, false);
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
    // Save for auto-login
    localStorage.setItem("mafia_user", JSON.stringify({ username: u, passcode: p }));
  });

  $("btn-logout").addEventListener("click", () => {
    localStorage.removeItem("mafia_user");
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
    showScreen("menu");
  });

  $("btn-leave-player").addEventListener("click", () => {
    wsSend({ type: "leave_game" });
    gameCode = null;
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

  $("toggle-anon").addEventListener("change", (e) => {
    wsSend({ type: "update_settings", settings: { anonymousVoting: e.target.checked } });
  });

  function updateLobby(msg) {
    const { players, settings, adminName } = msg;

    // Update admin lobby
    $("player-count-admin").textContent = players.length;
    $("players-list-admin").innerHTML = players
      .map(
        (p) =>
          `<li>${p.username}${p.isAdmin ? ' <span class="admin-badge">HOST</span>' : ""}</li>`
      )
      .join("");

    // Update player lobby
    $("player-count-player").textContent = players.length;
    $("admin-name-display").textContent = adminName;
    $("players-list-player").innerHTML = players
      .map(
        (p) =>
          `<li>${p.username}${p.isAdmin ? ' <span class="admin-badge">HOST</span>' : ""}</li>`
      )
      .join("");

    updateSettingsUI(settings);
  }

  function updateSettingsUI(settings) {
    $("mafia-count").textContent = settings.mafiaCount;
    $("toggle-doctor").checked = settings.enableDoctor;
    $("toggle-detective").checked = settings.enableDetective;
    $("toggle-joker").checked = settings.enableJoker;
    $("toggle-lovers").checked = settings.enableLovers;
    $("toggle-anon").checked = settings.anonymousVoting;
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

    // Click to load
    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", (e) => {
        if (e.target.classList.contains("config-delete")) return;
        wsSend({ type: "load_config", configId: parseInt(li.dataset.id) });
        closeConfigModal();
      });
    });

    // Click to delete
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
    if (isLover) {
      $("lover-badge").classList.remove("hidden");
    } else {
      $("lover-badge").classList.add("hidden");
    }
  }

  function handlePhaseChange(msg) {
    currentPhase = msg.phase;
    $("round-number").textContent = msg.round;

    // Update phase indicator
    const indicator = $("phase-indicator");
    indicator.className = `phase-indicator ${msg.phase}`;
    indicator.textContent = msg.phase === "game_over" ? "GAME OVER" : msg.phase.toUpperCase();

    // Show narrator messages
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

    if (msg.phase === "day" && isAdmin && !isDead) {
      showAdminDayControls();
    }

    if (msg.phase === "night") {
      // Night actions will be sent via separate messages (mafia_targets, etc.)
      hasVoted = false;
    }
  }

  function showNarratorMessage(text) {
    const container = $("narrator-messages");
    const div = document.createElement("div");
    div.className = "narrator-line";
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ============================================================
  // NIGHT ACTIONS
  // ============================================================
  function showNightAction(title, players, actionType) {
    if (isDead) return;

    const panel = $("night-actions");
    panel.classList.remove("hidden");
    $("action-title").textContent = title;
    $("action-status").textContent = "";

    const list = $("action-targets");
    list.innerHTML = players
      .map((p) => `<li data-id="${p.id}">${p.username}</li>`)
      .join("");

    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        // Deselect others
        list.querySelectorAll("li").forEach((l) => l.classList.remove("selected"));
        li.classList.add("selected");

        const targetId = parseInt(li.dataset.id);
        wsSend({ type: actionType, targetId });
      });
    });

    if (actionType === "mafia_vote") {
      $("mafia-vote-status").classList.remove("hidden");
    }
  }

  function updateMafiaVoteStatus(msg) {
    const details = $("mafia-vote-details");
    const entries = Object.entries(msg.votes);
    if (entries.length === 0) {
      details.textContent = "No votes yet...";
      return;
    }
    details.innerHTML = entries
      .map(([name, count]) => `<div>${name}: ${count} vote${count > 1 ? "s" : ""}</div>`)
      .join("");
  }

  // ============================================================
  // DAY VOTING
  // ============================================================
  function showAdminDayControls() {
    if (!isAdmin || isDead) return;
    const panel = $("admin-day-controls");
    panel.classList.remove("hidden");

    // We need to request the alive players list
    // For now, build from what we know — server will send player_list if needed
    // The admin nominates from the target list
    // We'll populate this when phase changes to day
  }

  // Populate admin target list on phase change
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

  $("btn-abstain").addEventListener("click", () => {
    wsSend({ type: "abstain_vote" });
  });

  $("btn-end-day").addEventListener("click", () => {
    wsSend({ type: "end_day" });
  });

  $("btn-toggle-anon-game") && $("btn-toggle-anon-game").addEventListener("click", () => {
    wsSend({ type: "toggle_anonymous_voting" });
  });

  function handleVoteCalled(msg) {
    if (isDead) return;
    hasVoted = false;

    const panel = $("voting-panel");
    panel.classList.remove("hidden");
    $("admin-day-controls").classList.add("hidden");
    $("vote-target-name").textContent = msg.targetName;
    $("vote-progress").textContent = "Waiting for votes...";
    $("vote-names").innerHTML = "";

    // Reset button states
    $("btn-vote-yes").classList.remove("selected");
    $("btn-vote-no").classList.remove("selected");
    $("btn-vote-yes").disabled = false;
    $("btn-vote-no").disabled = false;
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

  function updateVoteProgress(msg) {
    $("vote-progress").textContent = `${msg.votesFor + msg.votesAgainst} / ${msg.total} votes cast`;

    if (msg.voterNames) {
      const names = $("vote-names");
      names.innerHTML = Object.entries(msg.voterNames)
        .map(
          ([name, approved]) =>
            `<div class="${approved ? "vote-for" : "vote-against"}">${escapeHtml(name)}: ${approved ? "👍" : "👎"}</div>`
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
        .map(([name, v]) => `${name}: ${v ? "👍" : "👎"}`)
        .join(", ");
      showNarratorMessage(`Votes: ${breakdown}`);
    }

    // Re-show admin controls if still day
    if (isAdmin && !isDead && currentPhase === "day") {
      showAdminDayControls();
    }
  }

  // ============================================================
  // GAME OVER
  // ============================================================
  $("btn-end-game").addEventListener("click", () => {
    if (confirm("Are you sure you want to end the game?")) {
      wsSend({ type: "end_game" });
    }
  });

  function handleGameOver(msg) {
    $("dead-overlay").classList.add("hidden");
    showScreen("gameover");

    const titles = {
      town: "Citizens Win!",
      mafia: "Mafia Wins!",
      joker: "Joker Wins!",
    };

    $("gameover-title").textContent = titles[msg.winner] || "Game Over";
    $("gameover-title").style.color =
      msg.winner === "town" ? "var(--role-citizen)" :
      msg.winner === "mafia" ? "var(--role-mafia)" :
      msg.winner === "joker" ? "var(--role-joker)" : "var(--text)";
    $("gameover-message").textContent = msg.message;

    // Reset state
    gameCode = null;
    isAdmin = false;
    myRole = null;
    isLover = false;
    isDead = false;
    currentPhase = null;
  }

  $("btn-back-menu").addEventListener("click", () => {
    $("narrator-messages").innerHTML = "";
    showScreen("menu");
  });

  // ============================================================
  // SOUND
  // ============================================================
  $("btn-sound-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    $("btn-sound-toggle").innerHTML = soundEnabled ? "&#128264;" : "&#128263;";
  });

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
        // Low, eerie tone
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(180, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 1.5);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 2);
      } else if (type === "day") {
        // Bright, ascending tone
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(330, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 1);

        // Second chime
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
  // KEEP ALIVE PLAYER LIST FOR ADMIN TARGETS
  // ============================================================
  // We listen for lobby_update and phase_change to keep track of alive players
  let knownPlayers = [];

  const origHandler = handleServerMessage;
  const patchedHandler = function (msg) {
    if (msg.type === "lobby_update") {
      knownPlayers = msg.players;
    }
    if (msg.type === "phase_change" && msg.phase === "day" && isAdmin && !isDead) {
      // Use last known players, filter alive
      setTimeout(() => populateAdminTargets(knownPlayers), 100);
    }
    if (msg.type === "player_died") {
      const p = knownPlayers.find((pl) => pl.id === msg.playerId);
      if (p) p.isAlive = false;
    }
    if (msg.type === "game_started") {
      // Players are alive at start
      knownPlayers = knownPlayers.map((p) => ({ ...p, isAlive: true }));
    }
  };

  // Wrap the handler
  const originalOnMessage = handleServerMessage;

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    connect();

    // Patch message handler to also track players
    const origOnMessage = ws ? ws.onmessage : null;
    // We handle this in-line instead
  }

  // Override handleServerMessage to add tracking
  const _origHandle = handleServerMessage;
  window._handleMsg = function (msg) {
    patchedHandler(msg);
    _origHandle(msg);
  };

  // Reconnect ws.onmessage after connect
  const _origConnect = connect;

  // Simpler approach: just patch once
  // We'll redefine the connect function's onmessage
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
      patchedHandler(msg);
      handleServerMessage(msg);
    };

    ws.onclose = () => {
      setTimeout(connectPatched, 2000);
    };
  }

  // Override connect
  connect = connectPatched;

  // Start
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  connectPatched();
})();
