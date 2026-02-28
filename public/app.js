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
  let soundEnabled = true;
  let hasVoted = false;
  let audioCtx = null;
  let knownPlayers = [];
  let dayVoteCount = 0;
  let suspenseActive = false;
  let suspenseQueue = [];
  let anonVoteChecked = true;

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
  function trackPlayers(msg) {
    if (msg.type === "lobby_update") {
      knownPlayers = msg.players;
    }
    if (msg.type === "player_died") {
      const p = knownPlayers.find((pl) => pl.id === msg.playerId);
      if (p) p.isAlive = false;
    }
    if (msg.type === "game_started") {
      knownPlayers = knownPlayers.map((p) => ({ ...p, isAlive: true }));
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
        dayVoteCount = 0;
        showScreen("game");
        updateRoleCard();
        $("event-history").classList.add("hidden");
        $("event-history-list").innerHTML = "";
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
  }

  function updateSettingsUI(settings) {
    $("mafia-count").textContent = settings.mafiaCount;
    $("toggle-doctor").checked = settings.enableDoctor;
    $("toggle-detective").checked = settings.enableDetective;
    $("toggle-joker").checked = settings.enableJoker;
    $("toggle-lovers").checked = settings.enableLovers;
    $("toggle-anon").checked = settings.anonymousVoting;
    anonVoteChecked = settings.anonymousVoting;
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

  // ============================================================
  // PHASE CHANGE (with suspense for night->day)
  // ============================================================
  function handlePhaseChange(msg) {
    // Update event history if events are provided
    if (msg.events && msg.events.length > 0) {
      renderEventHistory(msg.events);
    }

    // Night-to-day suspense transition (Phase 5)
    if (previousPhase === "night" && msg.phase === "day") {
      showSuspenseTransition(() => {
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
      setTimeout(() => populateAdminTargets(knownPlayers), 100);
    }

    if (msg.phase === "night") {
      hasVoted = false;
      dayVoteCount = 0;
      $("event-history").classList.add("hidden");
    }

    // Show event history during day/voting
    if ((msg.phase === "day" || msg.phase === "voting") && $("event-history-list").innerHTML) {
      $("event-history").classList.remove("hidden");
    }
  }

  // ============================================================
  // SUSPENSE TRANSITION (Phase 5)
  // ============================================================
  function showSuspenseTransition(callback) {
    suspenseActive = true;
    suspenseQueue = [];
    const overlay = $("suspense-overlay");
    const text = $("suspense-text");

    overlay.classList.remove("hidden", "fade-out");
    text.textContent = "The sun rises...";
    text.style.animation = "none";
    // Force reflow
    void text.offsetWidth;
    text.style.animation = "suspenseFadeIn 0.8s ease";

    setTimeout(() => {
      text.textContent = "What happened last night?";
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "suspenseFadeIn 0.8s ease";
    }, 2000);

    setTimeout(() => {
      overlay.classList.add("fade-out");
    }, 3500);

    setTimeout(() => {
      overlay.classList.add("hidden");
      overlay.classList.remove("fade-out");
      suspenseActive = false;

      // Apply the phase change
      callback();

      // Process queued messages
      for (const qMsg of suspenseQueue) {
        handleServerMessage(qMsg);
      }
      suspenseQueue = [];
    }, 4300);
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
  // EVENT HISTORY (Phase 2)
  // ============================================================
  function renderEventHistory(events) {
    if (!events || events.length === 0) return;

    const container = $("event-history-list");
    container.innerHTML = "";

    const EVENT_LABELS = {
      kill: "Killed by Mafia",
      save: "Saved by Doctor",
      execution: "Executed",
      lover_death: "Died of heartbreak",
      spared: "Spared by vote",
    };

    // Group by round
    const grouped = {};
    for (const ev of events) {
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
  // DAY VOTING (Phase 3: per-vote anon, Phase 4: multi-vote)
  // ============================================================
  function showAdminDayControls() {
    if (!isAdmin || isDead) return;
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

  $("btn-abstain").addEventListener("click", () => {
    wsSend({ type: "abstain_vote" });
  });

  $("btn-end-day").addEventListener("click", () => {
    wsSend({ type: "end_day" });
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

    // Re-show admin controls if still day (Phase 4: multi-vote)
    if (isAdmin && !isDead && currentPhase === "day") {
      showAdminDayControls();
      setTimeout(() => populateAdminTargets(knownPlayers), 100);
    }
  }

  // ============================================================
  // GAME OVER (Phase 1: show all roles)
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

    // Render role reveal (Phase 1)
    renderRoleReveal(msg.players);

    // Reset state
    gameCode = null;
    isAdmin = false;
    myRole = null;
    isLover = false;
    isDead = false;
    currentPhase = null;
    previousPhase = null;
    dayVoteCount = 0;
  }

  function renderRoleReveal(players) {
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

    container.innerHTML = players
      .map((p) => {
        const dead = !p.isAlive;
        const loverText = loverPairs[p.id] ? `<span class="role-reveal-lover">\u2764 ${escapeHtml(loverPairs[p.id])}</span>` : "";
        const deadText = dead ? '<span class="role-reveal-dead">DEAD</span>' : "";
        return `<div class="role-reveal-item${dead ? " dead" : ""}">
          <span class="role-reveal-name">${escapeHtml(p.username)}</span>
          <span class="role-reveal-role ${p.role || ""}">${(p.role || "?").toUpperCase()}</span>
          ${loverText}
          ${deadText}
        </div>`;
      })
      .join("");
  }

  $("btn-back-menu").addEventListener("click", () => {
    $("narrator-messages").innerHTML = "";
    $("role-reveal").innerHTML = "";
    $("event-history-list").innerHTML = "";
    $("event-history").classList.add("hidden");
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  connectPatched();
})();
