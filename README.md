# Mafia

A real-time multiplayer Mafia party game. Host a room, share the code, and play from your phone.

**[Play now](https://maf1a.fly.dev)**

## Features

- **Real-time WebSocket gameplay** — no page reloads, instant updates
- **Pixel art UI** — role cards, avatars, and animations rendered as inline SVGs
- **Optional roles** — Doctor, Detective, Joker, Lovers (configurable per game)
- **Multi-mafia deliberation** — nomination, locking, and objection system for 2+ mafia
- **Narrated nights** — audio narration with multiple accent options
- **Anonymous voting** — toggle per-vote to hide tallies and voter identities
- **Spectator mode** — dead players watch mafia deliberation in real-time
- **Auto-rejoin** — reconnect mid-game without losing state
- **Save/load configs** — store game presets for quick setup

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Server:** TypeScript, WebSocket (Bun native)
- **Client:** Vanilla JS, CSS — single-file frontend, no build step
- **Database:** SQLite (via `bun:sqlite`)
- **Deploy:** [Fly.io](https://fly.io) with Docker

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

## License

Private.
