# Mafia

A real-time multiplayer Mafia party game. Host a room, share the code, and play from your phone.

**[Play now](https://maf1a.fly.dev)**

## Role Roster

### Core Roles (always active)

| Role | Team | Night Action | Win Condition |
|------|------|-------------|---------------|
| **Citizen** | Town | None — sleeps at night | Eliminate all Mafia |
| **Mafia** | Mafia | Chooses a victim to kill (deliberates with other Mafia) | Equal or outnumber non-Mafia alive — **but the parity-win is suppressed while any Doctor is alive** (see Doctor), so the night and day still play out; the win fires once no Doctor remains |

### Special Roles (toggled in lobby settings)

| Role | Team | Night Action | Details |
|------|------|-------------|---------|
| **Doctor** | Town | Protects one player from being killed | Cannot protect the same player two nights in a row. If they protect the Mafia's target, the kill is prevented. While a Doctor is alive, the Mafia parity-win is suppressed: even at parity the night resolves so the Doctor can block the kill and the day plays out — the Mafia only win once no Doctor remains. (A lone Doctor vs lone Mafia is a stalemate the host can end.) |
| **Detective** | Town | Investigates one player to learn if they are Mafia | Result is revealed privately at dawn. Investigation still resolves even if the Detective is killed that night. |
| **Joker** | Solo | None | Wins if voted out during the day. **Official mode** (default): the game continues — the Joker becomes a joint winner alongside the eventual winning team, and on the night immediately after the lynch may haunt one player who voted for their execution (the Doctor can block this kill). **House mode**: the Joker's execution ends the game instantly. Does not count toward either team's numbers. |
| **Hunter** | Town | None — acts only on death | When the Hunter dies a **direct** death — Mafia kill, day-vote execution, or Joker haunt — they are revealed and may immediately take one living player down with them. A Hunter who dies of **lover heartbreak** (their lover was killed) does **not** get a shot. If killed at night, the narrator wakes the Hunter ("open your eyes") to take the revenge, then sends them back to sleep. The shot cannot be blocked by the Doctor and resolves before the win check. Revenge is optional and has **no time limit** — the Hunter may decline, and the host may skip a stalled Hunter. |
| **Vigilante** | Town | Shoots one player at night (optional — may hold fire) | Has **one bullet for the entire game**; firing spends it, holding fire keeps it for a later night. The shot resolves at dawn and **can be blocked by the Doctor**, like the Mafia kill. **Friendly fire is allowed** (the Vigilante may kill town) but they may NOT shoot themselves. The Detective reads the Vigilante as innocent, and it counts as Town for win/parity. A "Vigilante, open your eyes" phase runs **every** night the role is enabled — a phantom phase when the Vigilante is dead or out of ammo — so its state can't be inferred. A Vigilante killed the same night still fires; a one-shot role never suppresses the Mafia parity-win. |
| **Godfather** | Mafia | None — votes with the Mafia | Only takes effect when **Mafia count ≥ 2** (silently no-ops at 1 Mafia); one random Mafia is secretly the Godfather, and the whole Mafia team is told who it is. Identical to Mafia in every way — joins the kill, sees/is seen by the team, counts for parity, dies normally — **except the Detective's investigation returns "not Mafia."** The Detective's history keeps the false "innocent" entry (no retro-correction); the end-game reveal shows "Godfather." |
| **Lovers** | — | None | Two random players are paired. If one dies, the other dies of heartbreak. Lovers can be any role, including Mafia. |

### Multi-Mafia Deliberation

When there are 2+ Mafia, the night kill uses a card-based deliberation system:
- **Nominate** — suggest a target
- **Lock In** — commit your vote to a target
- **Object** — block a target from being chosen
- Requires **unanimous lock** from all alive Mafia to confirm the kill
- Dead players spectate the deliberation in real-time (read-only)

## Features

- Real-time WebSocket gameplay — no page reloads
- Pixel art role cards and avatars
- Audio narration with multiple accent options
- Anonymous voting toggle (hides tallies and voter identities)
- Dead player spectator mode during night
- Auto-rejoin on disconnect
- Automatic settings memory — last-used game settings are saved when a game starts and pre-applied on the next create

## Running Locally

```bash
bun install
bun run src/server.ts
```

Open `http://localhost:3000`. Requires [Bun](https://bun.sh/docs/installation).

## Testing

```bash
bun test
```

## Deployment

| Branch | Environment | URL |
|--------|------------|-----|
| `staging` (default) | Staging | [maf1a-staging.fly.dev](https://maf1a-staging.fly.dev) |
| `main` (protected) | Production | [maf1a.fly.dev](https://maf1a.fly.dev) |

Push to `staging` auto-deploys to staging. Merge a PR from `staging` → `main` to promote to production.

## Tech Stack

Bun, TypeScript, vanilla JS, SQLite, Fly.io
