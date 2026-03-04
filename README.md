# Mafia

A real-time multiplayer Mafia party game. Host a room, share the code, and play from your phone.

**[Play now](https://maf1a.fly.dev)**

## Role Roster

### Core Roles (always active)

| Role | Team | Night Action | Win Condition |
|------|------|-------------|---------------|
| **Citizen** | Town | None — sleeps at night | Eliminate all Mafia |
| **Mafia** | Mafia | Chooses a victim to kill (deliberates with other Mafia) | Equal or outnumber non-Mafia alive |

### Special Roles (toggled in lobby settings)

| Role | Team | Night Action | Details |
|------|------|-------------|---------|
| **Doctor** | Town | Protects one player from being killed | Cannot protect the same player two nights in a row. If they protect the Mafia's target, the kill is prevented. |
| **Detective** | Town | Investigates one player to learn if they are Mafia | Result is revealed privately at dawn. Investigation still resolves even if the Detective is killed that night. |
| **Joker** | Solo | None | Wins instantly if voted out during the day. The Joker's execution ends the game. Does not count toward either team's numbers. |
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
- Save/load game setting presets

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
