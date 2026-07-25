# Mafia App Client UI Screen Inventory

Complete inventory of all screens, modals, overlays, and interactive panels in `public/app.js` and `public/index.html`.

---

## FULL SCREENS (view transitions)

### 1. Authentication Screen
- **ID/Anchor:** `#screen-auth`
- **Purpose:** Login/registration flow before entering the game
- **App States:** Initial load (logged out)
- **Key Interactive Elements:**
  - `#auth-username` (text input) — username entry, max 16 chars
  - `#auth-passcode` (tel input) — 4-digit PIN entry
  - `#btn-login` (button) — submit login
  - `#btn-register` (button) — create new account
  - `#auth-error` (text display) — error message area
  - `.app-version` (text) — app version display
  - `.logo`, `.logo-icon` — Mafia branding
- **Transitions:**
  - **In:** On initial page load if not authenticated; after logout (via `showScreen("auth")`)
  - **Out:** Successful login → `#screen-menu`
- **Notes:** Shows copyright/DaleWorldwide branding

---

### 2. Main Menu Screen
- **ID/Anchor:** `#screen-menu`
- **Purpose:** Post-login menu to host a new game or join existing room
- **App States:** Authenticated, no active game
- **Key Interactive Elements:**
  - `#menu-username` (text) — displays logged-in username
  - `#btn-logout` (button) — return to auth screen
  - `#btn-host` (button) — create new game room
  - `#btn-join-show` (button) — toggle join section visibility
  - `#join-section` (panel, hidden by default)
    - `#join-code` (text input) — room code entry, max 4 chars
    - `#btn-join` (button) — join game by code
  - `#menu-error` (text) — error message area
  - `#pull-refresh-menu` (pull-to-refresh) — refresh player list
  - `.app-version` (text)
- **Transitions:**
  - **In:** After successful login; after leaving a room
  - **Out:** Click "Host" → `#screen-lobby-admin`; Click "Join" → `#screen-lobby-player`; Click "Log Out" → `#screen-auth`

---

### 3. Lobby — Admin View
- **ID/Anchor:** `#screen-lobby-admin`
- **Purpose:** Host-only lobby to configure game settings and start game
- **App States:** Room created by current user, pre-game
- **Key Interactive Elements:**
  - **Header:**
    - `#btn-leave-admin` (button) — return to menu
    - `#lobby-code` (text) — displays 4-char room code
    - `#btn-settings-lobby-admin` (icon button) — open settings modal
  - **Settings Panel:**
    - `#mafia-count` + `#mafia-minus`/`#mafia-plus` (counter) — adjust mafia count
    - `#toggle-doctor` (checkbox) — enable/disable doctor role
    - `#doctor-mode-row` (conditional panel)
      - `#doctor-mode-tabs` (buttons: Official/House) — doctor save visibility rule
      - `#doctor-mode-hint` (text) — rule explanation
    - `#toggle-detective` (checkbox) — enable/disable detective
    - `#toggle-joker` (checkbox) — enable/disable joker
    - `#joker-mode-row` (conditional panel)
      - `#joker-mode-tabs` (buttons: Official/House) — joker haunt continuation
      - `#joker-mode-hint` (text)
    - `#toggle-hunter` (checkbox) — enable/disable hunter
    - `#toggle-vigilante` (checkbox) — enable/disable vigilante
    - `#toggle-lovers` (checkbox) — enable/disable lovers
    - `#toggle-godfather` (checkbox) — enable/disable godfather
    - `#lobby-accent` (narrator voice picker)
      - `#accent-picker-toggle` (button) — expand/collapse voice list
      - `#accent-picker-current` (text) — selected voice name
      - `#accent-picker-expanded` (panel, hidden by default)
        - `#accent-arrow-prev`/`#accent-arrow-next` (buttons) — cycle voices
        - `#accent-picker-label` (text) — voice display name
        - `#narrator-gender-control` (button group) — Male/Female gender selection
      - `#accent-picker-desc` (text) — voice description
  - **Players Section:**
    - `#players-list-admin` (list) — displays connected players
    - `#player-count-admin` (text) — player count display
  - **Color Picker:**
    - `#color-picker-admin` (section) — dynamically populated color selection UI
  - **Action:**
    - `#btn-start` (button) — launch the game
  - `#lobby-error` (text) — error message area
- **Transitions:**
  - **In:** User clicks "Host Game" from menu
  - **Out:** Click "Start Game" → `#screen-game`; Click "Leave" → `#screen-menu`
- **Notes:** Updates in real-time as players join

---

### 4. Lobby — Player View
- **ID/Anchor:** `#screen-lobby-player`
- **Purpose:** Player-only lobby showing game settings and waiting for host to start
- **App States:** Joined a game room as non-admin, pre-game
- **Key Interactive Elements:**
  - **Header:**
    - `#btn-leave-player` (button) — return to menu
    - `#lobby-code-player` (text) — displays room code
    - `#btn-settings-lobby-player` (icon button) — open settings modal
  - **Status:**
    - Admin name display (`#admin-name-display`) — "Waiting for X to start..."
  - **Player Lobby Settings:**
    - `#player-lobby-settings` (panel) — read-only settings display
  - **Players Section:**
    - `#players-list-player` (list) — lists all connected players
    - `#player-count-player` (text) — count display
  - **Color Picker:**
    - `#color-picker-player` (section) — player color selection UI
- **Transitions:**
  - **In:** User clicks "Join" from menu or game_sync if joining mid-game
  - **Out:** Host starts game → `#screen-game`; Leave → `#screen-menu`

---

### 5. Main Game Screen
- **ID/Anchor:** `#screen-game`
- **Purpose:** Central hub for all in-game UI; displays role card, narrator, night actions, voting, accusations, etc.
- **App States:** Game is active (any phase: night, day, voting, game_over)
- **Key Interactive Elements (Header):**
  - `#phase-indicator` (text) — shows current phase (Night/Day/Voting)
  - `#round-indicator` (text + `#round-number`) — displays current round
  - `#day-timer` (text, hidden) — countdown timer during day phase
  - `#btn-roster` (icon button) — opens "Roles in Play" modal
  - `#btn-settings` (icon button) — opens settings modal
- **Persistent Content Areas:**
  - `#role-card` (card element)
    - Front face: `#role-image`, `#role-name`, `#role-description`, `#role-icon-mini`
    - Additional indicators:
      - `#lover-badge` (badge, hidden by default)
      - `#bullet-indicator` (vigilante ammo count, hidden by default)
      - `#role-mini-balloon` (mini indicator for joker haunt, hidden by default)
    - Back face: `#card-back`, `#card-back-art` — card design when flipped
  - `#narrator-area` (persistent section)
    - `#btn-transcript` (icon button) — opens full transcript modal
    - `#narrator-messages` (scrollable list) — narrator message history
  - `#event-history` (scrollable panel, visible during game)
    - `.eh-tabs` (button group) — switch between "Events" and "Players" tabs
    - `#eh-panel-events` (list) — round-by-round event log
    - `#eh-panel-players` (list) — player alive/dead status overview
  - `#pull-refresh` (pull-to-refresh) — refresh game state
- **Conditional Panels (shown per phase/role):**
  - **Awaiting Phase Start:**
    - `#awaiting-ready` (panel, hidden by default)
      - `#awaiting-ready-msg` (text) — instruction ("Check your role card!")
      - `#btn-begin-night` (button, hidden) — appear only for admin to gate the start
  - **Night Phase — Role Actions:**
    - `#night-actions` (panel, hidden by default)
      - `#action-title` (text) — role-specific prompt ("Mafia: choose a target", "Doctor: protect", etc.)
      - `#action-targets` (list) — clickable target players or locked-choice display
      - `#action-confirm` (button group, hidden initially)
        - `#btn-action-cancel` (button)
        - `#btn-action-confirm` (button)
      - `#action-status` (text) — confirmation feedback
      - Role-specific buttons (conditionally shown):
        - `#btn-decline-revenge` (button) — hunter declines revenge
        - `#btn-vigilante-pass` (button) — vigilante holds fire
      - **Spectator-only elements (shown to dead players):**
        - `#spectator-night-log` (list, hidden) — shows dead players what actions occurred
        - `#joker-spectator-status` (text, hidden) — shows dead joker the haunt target
  - **Night Phase — Admin:**
    - `#admin-night-controls` (panel, hidden by default)
      - `#btn-force-dawn` (button) — skip night and move to day
  - **Day Phase — Accusations (living players only):**
    - `#day-accuse-controls` (panel, hidden by default)
      - `#accusations-panel` (list) — displays all pending accusations with Second/Withdraw buttons
      - `#btn-accuse` (button) — launch accusation picker
      - `#accuse-picker` (modal-like, hidden initially)
        - Title: "Point a finger — or move that the town sleeps:"
        - `#accuse-target-list` (list) — living players + "Propose the town sleeps" option
        - `#btn-accuse-cancel` (button)
        - `#btn-accuse-confirm` (button, disabled initially)
  - **Day Phase — Admin Nomination:**
    - `#admin-day-controls` (panel, hidden by default)
      - `#vote-count-label` (text) — shows vote tallies
      - `#admin-status-msg` (text) — instructions for admin
      - `#admin-target-list` (list) — living players to nominate for execution
      - `#btn-end-day` (button) — transition to night
  - **Mafia-Only Night Status:**
    - `#mafia-vote-status` (panel, hidden by default)
      - `#mafia-vote-details` (list) — shows how each mafia member voted during deliberation
  - **Voting Phase:**
    - `#voting-panel` (panel, hidden by default, applies `data-phase="voting"`)
      - `#voting-title` (text) — "Vote: Execute X?" or "The town considers sleeping..."
      - `#btn-vote-yes` (button with pixel art thumb) — vote to execute/sleep
      - `#btn-vote-no` (button with pixel art thumb) — vote to spare/stay awake
      - `#vote-progress` (text) — "X / Y votes cast"
      - `#btn-cancel-vote` (button, hidden) — only if player can withdraw vote
  - **Detective Result (persistent during day):**
    - `#detective-result` (panel, hidden by default) — shows detective find (alignment reveal)
  - **Hunter Revenge Wait (room-wide during revenge gate):**
    - `#revenge-wait` (panel, hidden by default)
      - `#revenge-wait-art` (pixel art) — bow centerpiece
      - `#revenge-wait-headline` (text) — "THE HUNTER FALLS"
      - `#revenge-wait-reveal` (text) — hunter name and instruction
      - `#btn-skip-revenge` (button, hidden, admin-only) — skip the revenge window
- **Transitions:**
  - **In:** Host starts game or player rejoins → `showScreen("game")`
  - **Out:** Game over → `#screen-gameover`; Player leaves → `#screen-menu`

---

### 6. Game Over Screen
- **ID/Anchor:** `#screen-gameover`
- **Purpose:** Display game results, winner, and full role reveal
- **App States:** Game has ended
- **Key Interactive Elements:**
  - **Header:**
    - `#btn-leave-room` (button) — return to menu
  - **Content:**
    - `#gameover-trophy` (pixel art) — trophy icon (Citizens/Mafia/Joker win)
    - `#gameover-title` (text) — winning team name ("Citizens Win", "Mafia Wins", "JOKER WINS", etc.)
    - `#gameover-message` (text) — narrative summary of game result
    - `#game-history` (panel) — full event log with deaths, executions, lover cascades, etc.
    - `#role-reveal` (list) — all players with their roles revealed (dead marked, lovers linked, joker marked with trophy)
  - **Action Buttons:**
    - **Admin Only:**
      - `#gameover-buttons` (button group)
        - `#btn-play-again-same` (button) — restart game with same settings
        - `#btn-play-again-new` (button) — configure new game in lobby
        - `#btn-close-room` (button, danger) — close the room and return to menu
    - **Player:**
      - `#gameover-buttons-player` (button group)
        - `#btn-return-to-lobby-player` (button) — return to main menu
- **Transitions:**
  - **In:** Game ends (any win condition) → `showScreen("gameover")`
  - **Out:** Admin click "Play Again" → `#screen-lobby-admin`; Admin/Player click "Leave" → `#screen-menu`

---

## MODALS (dismissible overlays)

### 1. Settings Modal
- **ID/Anchor:** `#modal-settings`
- **Purpose:** Player-wide settings (theme, sound, hide mafia tag, room code copy, leave/end game actions)
- **App States:** Shown from any screen (auth, menu, lobby, game)
- **Key Interactive Elements:**
  - `#btn-close-settings` (icon button) — close modal
  - `#settings-room-code` (row, hidden except in game)
    - `#settings-room-code-value` (text) — displays current room code (copiable)
  - `#toggle-sound` (checkbox) — enable/disable sound effects
  - `#theme-mode-control` (button group) — Dark/Light theme selection
  - `#toggle-hide-mafia-tag` (checkbox) — hide "MAFIA" indicator on role card (obfuscation)
  - `#settings-end-game` (button group, hidden, admin-only in game)
    - `#btn-end-game` (button, danger) — force end the game
  - `#settings-leave-game` (button group, hidden except in game)
    - `#btn-settings-leave` (button, danger) — leave the game mid-play
- **Transitions:**
  - **Show:** Click settings icon (gear) from header
  - **Hide:** Click close button; click outside modal
- **Notes:** Dynamically shows/hides room-code row and end-game options based on context

---

### 2. Roles in Play Modal
- **ID/Anchor:** `#modal-roster`
- **Purpose:** Display all roles configured for the current game with badges/indicators
- **App States:** Shown during game (from header button)
- **Key Interactive Elements:**
  - `#btn-close-roster` (icon button) — close modal
  - `#roster-list` (list) — dynamically populated with role badges and descriptions
  - Hint text: "Tap outside to dismiss"
- **Transitions:**
  - **Show:** Click roster icon from game header
  - **Hide:** Click close button; click outside modal
- **Notes:** Reveals all roles in play including Hunter, Vigilante (normally hidden at game start)

---

### 3. Full Transcript Modal
- **ID/Anchor:** `#modal-transcript`
- **Purpose:** Display chronological log of all narrator messages
- **App States:** Shown during game (from narrator header button)
- **Key Interactive Elements:**
  - `#btn-close-transcript` (icon button) — close modal
  - `#transcript-list` (scrollable list) — narrator message history with timestamps
  - `#transcript-empty` (text, hidden initially) — "No messages yet" placeholder
- **Transitions:**
  - **Show:** Click transcript button from narrator section
  - **Hide:** Click close button
- **Notes:** Maintained throughout the game; empty at start of game

---

### 4. Confirm Sheet (In-World Confirm Dialog)
- **ID/Anchor:** `#confirm-sheet`
- **Purpose:** Custom confirmation prompt for admin high-stakes actions (Force Dawn, End Day, End Game, Close Room, Play Again)
- **App States:** Shown when admin triggers a destructive action
- **Key Interactive Elements:**
  - `#confirm-sheet-title` (text) — action name ("Force Dawn", "End Day", etc.)
  - `#confirm-sheet-body` (text) — action consequence/confirmation prompt
  - `#confirm-sheet-cancel` (button) — dismiss without confirming
  - `#confirm-sheet-ok` (button) — confirm and execute action
- **Transitions:**
  - **Show:** Admin clicks Force Dawn, End Day, End Game, Close Room, or Play Again
  - **Hide:** Click Cancel; click Confirm; click outside
- **Notes:** Replaces native `confirm()` for brand consistency

---

## FULL-SCREEN OVERLAYS (positioned over game screen, z-index layering)

### 1. Dead Overlay (z-index 100)
- **ID/Anchor:** `#dead-overlay`
- **Purpose:** Death announcement poster; shown when local player dies
- **App States:** Player death (any phase), spectating mode
- **Key Interactive Elements:**
  - `#dead-emoji` (pixel art) — skull or heartbreak art
  - `.dead-pre` (text) — "YOU ARE"
  - `.dead-text` (text) — "DEAD"
  - `#death-message` (text) — cause of death (e.g., "voted out", "killed in the night", "died of heartbreak")
  - `#btn-watch-town` (button) — dismiss overlay and enter spectator mode
  - `#dead-dismiss-hint` (text, hidden initially) — "Tap to dismiss" (appears after animation)
- **Transitions:**
  - **Show:** `player_died` or `you_died` message received (adds `hidden` class off, triggers fade-in animation)
  - **Hide:** Click button or wait for auto-dismiss; also hidden when game_sync occurs (rejoin) or game_over
- **Notes:** Renders at APP ROOT (outside `#screen-game`) to avoid transform clipping

---

### 2. Joker Win Overlay (z-index 100)
- **ID/Anchor:** `#joker-win-overlay`
- **Purpose:** Joker victory announcement (full-screen celebration poster)
- **App States:** Joker haunt vote succeeds (phase transition to game_over)
- **Key Interactive Elements:**
  - `#joker-trophy-art` (pixel art) — clown centerpiece + celebration art
  - `.joker-win-pre` (text) — "THE LAST LAUGH"
  - `.joker-win-title` (text) — "JOKER WINS"
  - `#joker-win-name` (text) — joker player name
  - `.joker-win-hint` (text) — "Tap to dismiss"
- **Transitions:**
  - **Show:** `joker_win_overlay` message received (while suspenseActive; queued in suspenseQueue if mid-death overlay)
  - **Hide:** Click/tap; also auto-dismisses after animation
- **Notes:** Rendered at APP ROOT for z-index layering above dead-overlay

---

### 3. Suspense Overlay (z-index 300, topmost)
- **ID/Anchor:** `#suspense-overlay`
- **Purpose:** Narrative transition beats (Night Fall, Dawn, Execution, Heartbreak, Game Over) with pixel art and themed text
- **App States:** Phase transitions (night → day, day → night, execution, death-triggered reveals)
- **Key Interactive Elements:**
  - `#suspense-pre` (text) — amber-colored Silkscreen preface ("THE MAFIA STRIKES", "DAWN BREAKS", etc.)
  - `#suspense-art` (pixel art SVG) — phase-appropriate centerpiece
  - `#suspense-text` (text) — detailed narrative of the beat (e.g., execution victim name, heartbreak couple)
- **Transitions:**
  - **Show:** `showSuspenseTransition()` called during phase_change (initiates fade-in)
  - **Hide:** Animation ends and callback fires (chains into `applyPhaseChange()`)
- **Notes:** 
  - Sits above dead/joker overlays; death beats reveal BENEATH it
  - Multiple beats can chain (e.g., execution → heartbreak → night_start)
  - Queue system (suspenseQueue) holds prompts until active beat completes

---

## SUMMARY BY STATE COMPLEXITY

### Top 10 Most Complex UI States (by element count and conditional logic)

1. **Main Game Screen (#screen-game) — Mafia Night Phase**
   - ~35+ elements active
   - Shows: role card, narrator, night-actions panel (mafia kill targets), mafia-vote-status, event-history, admin-night-controls, awaiting-ready
   - Complex: target list rendering, live vote tracking, spectator log for dead players

2. **Main Game Screen (#screen-game) — Voting Phase**
   - ~30+ elements active
   - Shows: role card, narrator, voting-panel (execute/spare vote buttons), vote-progress, event-history
   - Complex: phase-dependent CSS tinting, button state management (disabled after vote), progress counter

3. **Day Accusations Flow**
   - ~28+ elements active
   - Shows: day-accuse-controls, accusations-panel (all pending accusations), accuse-picker (modal-within-game), event-history
   - Complex: Second/Withdraw button rendering per accusation, sleep-proposal option, picker multi-step flow

4. **Game Over Screen (#screen-gameover)**
   - ~25+ elements active
   - Shows: trophy art, title/message, game-history (full log), role-reveal (all players with roles)
   - Complex: role reveal rendering (dead marked, lovers linked, joker trophy), history event grouping by round

5. **Admin Lobby (#screen-lobby-admin)**
   - ~24+ elements active
   - Shows: settings panel (9 toggles, 2 conditional sub-panels, accent picker with 28 voices + gender), players list, color picker, start button
   - Complex: dependent toggles (doctor/joker modes), accent picker expand/collapse, voice playback, gender selection

6. **Night Phase — Detective/Doctor/Hunter Spectator View**
   - ~22+ elements active
   - Shows: night-actions panel, spectator-night-log (live action log), role-specific deliberation messages, revenge-wait (if hunter dies)
   - Complex: different action titles/targets for each role, spectator-lock states, log appending per sub-phase

7. **Admin Day Controls**
   - ~20+ elements active
   - Shows: admin-day-controls (vote count label, target nomination list), voting-panel (when vote called), event-history
   - Complex: admin-only buttons, target list updates, hidden when day-accuse or voting active

8. **Hunter Revenge Gate**
   - ~15+ elements active
   - Shows: revenge-wait (room-wide, all players see), detective-result, event-history, role-card (inactive)
   - Complex: skip-revenge button (admin-only), timeout logic, chains into next phase

9. **Settings Modal (from Game)**
   - ~12+ elements active
   - Shows: room-code row (visible only in game), sound toggle, theme control, hide-mafia-tag toggle, end-game/leave-game buttons (admin/player context-dependent)
   - Complex: context-aware button visibility, theme state synchronization

10. **Narrator Area + Full Transcript Modal**
    - ~10+ elements active
    - Shows: narrator-messages (scrollable list), btn-transcript, modal-transcript with full history
    - Complex: dynamic message rendering, scroll-to-latest on new message, timestamp tracking

---

## PERSISTENT UI CHROME (always visible on #screen-game during active game)

- **Game Header:** phase-indicator, round-indicator, day-timer (conditionally shown), btn-roster, btn-settings
- **Role Card:** Always present with front/back flip, lover badge, bullet indicator, haunt balloon
- **Narrator Section:** Always present; messages append chronologically
- **Event History:** Always present but toggled visible/hidden; maintains Events + Players tabs
- **Pull-to-Refresh:** Available on main menu and game screen

---

## STATE MACHINE DIAGRAM (Screen Transitions)

```
┌─────────────────────────────────────────────────────────────────┐
│                      screen-auth                                 │
│ (Login / Register)                                               │
└────────────┬──────────────────────────────────────────────────────┘
             │ [successful login]
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      screen-menu                                 │
│ (Host / Join game)                                               │
└────────────┬─────────────────────────┬──────────────────────────┘
             │ [click Host]            │ [click Join]
             ▼                         ▼
  ┌──────────────────────┐   ┌──────────────────────┐
  │ screen-lobby-admin   │   │ screen-lobby-player  │
  │ (Admin Lobby)        │   │ (Player Lobby)       │
  └────────────┬─────────┘   └──────────────┬───────┘
               │ [click Start]              │
               └──────────────┬─────────────┘
                              ▼
                  ┌────────────────────────┐
                  │   screen-game          │
                  │ (Night/Day/Voting)     │
                  └────────────┬───────────┘
                               │ [game_over]
                               ▼
                  ┌────────────────────────┐
                  │  screen-gameover       │
                  │ (Results/Role Reveal)  │
                  └────────────┬───────────┘
                               │ [Play Again/Leave]
                               ▼ (back to lobby or menu)
```

---

## MESSAGE TYPES DRIVING UI UPDATES

**Game State Messages:**
- `game_started` — transition to game screen, initialize players
- `phase_change` — update phase indicator, trigger suspense overlay, reset panel visibility
- `player_died` / `you_died` — show dead overlay, enter spectator mode
- `player_list` — update player lists in lobby/admin controls
- `lobby_update` — update player list in lobby
- `game_sync` — full state rejoin (player returns mid-game)
- `game_over` — show game over screen with results
- `room_closed` — return to menu

**Night Phase Messages:**
- `mafia_targets` — show night-actions with mafia kill targets
- `doctor_targets` — show night-actions with doctor protect targets
- `detective_targets` — show night-actions with detective investigate targets
- `hunter_revenge_pending` / `hunter_revenge_targets` — show revenge-wait overlay
- `vigilante_targets` — show night-actions with pass/kill options
- `joker_haunt_targets` — show night-actions with haunt target list
- `spectator_*` — show spectator logs/vote status for dead players

**Day Phase Messages:**
- `accusations_update` — render pending accusations and second/withdraw buttons
- `vote_called` — show voting-panel with execute/spare buttons
- `vote_result` — update vote progress or show winner
- `day_timer` — countdown timer during day
- `detective_result` — show detective find (alignment reveal)

**Narrator/Transitions:**
- `sound_cue` — play narration audio, trigger night/dawn overlay
- `narrator_message` — append message to narrator area
- `suspense_transition` — show suspense overlay with beat art

---

## ANIMATION STATES & CLASSES

- `.active` — screen is displayed (main visibility flag)
- `.screen-enter` — generic soft fade-in for screen transitions
- `.screen-enter-game` — specialized lobby→game transition (dramatic)
- `.screen-enter-gameover` — specialized game→gameover transition (dramatic)
- `.hidden` — element hidden (individual panels, modals, overlays)
- `.fade-out` — overlay exit animation class (removed on hide)
- `.selected` — button/list item selected state (voting, accusations, target selection)
- `data-phase="night" / "day" / "voting" / "game_over"` — theme/ambience CSS scoping (body attribute)

---

## NOTES FOR FIGMA MIGRATION

1. **Responsive/Mobile-First:** All screens designed for portrait mobile (max-width on most containers, touch-friendly button sizing)
2. **Pixel Art Integration:** SVG inline pixel art used throughout (roles, trophies, achievements, decorative elements)
3. **Theme Switching:** Dark/Light mode toggleable; CSS-driven via `prefers-color-scheme` and `data-theme` attribute
4. **Audio Integration:** Narrator audio plays alongside text; audio state gated by WebSocket message sequencing (HOLD_GATE_PROMPTS)
5. **Animation Timing:** Suspense overlays have multi-second durations; queued prompts wait for overlay completion before rendering
6. **Accessibility:** Confirm dialogs replace native prompts; button labels on voting/action controls; ARIA attributes on role groups
7. **State Persistence:** Scroll positions in event history/transcript maintained; player sorting by alive/dead in role reveal

---

**Generated:** 2026-07-25
**Source Files:** `public/index.html`, `public/app.js`, `public/app.css`
