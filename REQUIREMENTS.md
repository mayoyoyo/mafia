# Mafia Game - Coherent Requirements

## Overview
A mobile-first Progressive Web App (PWA) for playing the party game Mafia. Optimized for iPhone — can be saved to the home screen and launched like a native app. Supports up to 20 players per game. Uses Bun runtime with SQLite for persistence and WebSockets for real-time multiplayer.

## Accounts
- Players create an account with a **username** and a **4-digit passcode** (PIN).
- Account data is stored in SQLite. The app remembers the user via localStorage.
- To log in again, the user enters their username and 4-digit passcode.

## Game Creation & Lobby
- Any registered player can create a game (becoming the **admin**).
- Creating a game generates a **room code** (4-character alphanumeric) that other players enter to join.
- The admin configures the game before starting:
  - **Number of Mafia members** (adjustable)
  - **Toggle roles**: Doctor, Detective, Joker, Lovers (each on/off)
- The admin can **save game configurations as named profiles** and load them later.
- Players join the lobby by entering the room code. Up to 20 players.
- The admin presses "Start Game" to begin. After that, the admin is treated as a regular player (except for admin-only controls: end game, call vote, end day, toggle anonymous voting).

## Roles & Colors
| Role | Color | Team | Description |
|------|-------|------|-------------|
| Citizen | Green | Town | Basic townsperson. Wins when all Mafia are eliminated. |
| Mafia | Red | Mafia | Kills one player each night. Wins when Mafia >= living town members. |
| Doctor | Green | Town | Each night, chooses one player to protect. If Mafia targets that player, they survive. |
| Detective | Green | Town | Each night, investigates one player to learn if they are Mafia or not. |
| Joker | Blue | Neutral | Wins individually if voted out (executed) during the day. If the Joker wins, both Town and Mafia lose. |
| Lover | (varies) | (varies) | Two players randomly paired as secret lovers. They don't know who the other lover is. If one dies (by any cause), the other dies too. A Lover can also be any other role simultaneously. |

## Game Flow

### Night Phase
1. The game announces "Night has fallen" (with optional sound).
2. **Mafia** members see each other and collectively vote on one non-Mafia player to kill. All living Mafia must agree (unanimous).
3. **Doctor** (if enabled & alive) selects one player to protect.
4. **Detective** (if enabled & alive) selects one player to investigate.
5. Night ends when the Mafia has unanimously chosen a victim (and Doctor/Detective have acted).

### Day Phase
1. **Narrator** announces what happened overnight:
   - If the Mafia's target was saved by the Doctor: "The town wakes to find everyone alive..."
   - If someone was killed: dramatic death announcement from pre-written prompts.
   - If a Lover died, their partner also dies (with a star-crossed lovers narrative).
2. **Detective** receives their investigation result privately.
3. **Discussion** period — players talk in person.
4. **Admin** can:
   - **Call for a vote** against a nominated player, or **abstain** (skip voting for the day).
   - **Choose anonymous or named voting** (can be set before or during the game).
   - **End the day** to transition back to night.
5. **Voting** (if called):
   - All living players vote **thumbs up** (execute) or **thumbs down** (spare).
   - **Anonymous vote**: only totals are shown.
   - **Named vote**: each player's name and vote are displayed to everyone.
   - If strictly more than 50% vote thumbs up, the nominated player is **executed**.
   - If the executed player is the **Joker**, the Joker wins and the game ends (everyone else loses).
6. Admin ends the day → transition to next Night.

### Death
- Dead players see a **skull** on their screen.
- Dead players can no longer vote or perform actions.
- Dead players remain in the game as spectators.

### Win Conditions
- **Town wins**: All Mafia members are dead.
- **Mafia wins**: Living Mafia >= living non-Mafia (excluding Joker).
- **Joker wins**: The Joker is executed during a day vote. Both Town and Mafia lose.
- **Admin can end the game** at any time (emergency stop).

## Narrator
- Pre-determined dramatic messages for each event type:
  - Night kills, Doctor saves, executions, Lover deaths, Joker victory, game over.
- Messages are randomly selected from a pool for variety.

## Sound
- Toggle-able sound on/off per player.
- Sound cues for night-to-day and day-to-night transitions.

## Technical Stack
- **Runtime**: Bun
- **Database**: SQLite (via bun:sqlite)
- **Real-time**: Bun WebSocket
- **Frontend**: Vanilla JS PWA (mobile-first, iPhone-optimized)
- **Deployment**: Railway

## PWA Requirements
- `manifest.json` with app name, icons, theme color, standalone display.
- Service worker for offline shell caching.
- Apple-specific meta tags for iOS home screen behavior.
