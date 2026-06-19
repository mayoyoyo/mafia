# Mafia Game - Project Instructions

## Deployment Workflow
1. **Develop on `staging`** (default branch) — push triggers auto-deploy to `maf1a-staging.fly.dev`
2. **Promote to production** — file a PR from `staging` → `main`, merge triggers auto-deploy to `maf1a.fly.dev`
3. `main` is protected: requires 1 approving review (admin can bypass)

## Version Updates (MANDATORY)
Two version constants in `public/app.js`:
- `APP_VERSION` — production version, format `v1.{PATCH}_{YYYYMMDDHHmm}`
- `APP_VERSION_STAGING` — staging version, format `staging.{PATCH}_{YYYYMMDDHHmm}`

The client auto-selects which to display based on hostname (`staging` in URL → staging version).

**On every push (staging or main):**
- Update `APP_VERSION_STAGING` with incremented PATCH and fresh timestamp
- Update `APP_VERSION` only when promoting to production (PR merge to main) — increment PATCH, fresh timestamp

Use `TZ="America/Los_Angeles" date +"%Y%m%d%H%M"` to get the PST timestamp.

## Tech Stack
- Bun runtime, TypeScript server, vanilla JS client
- Single-file frontend: `public/app.js`, `public/app.css`, `public/index.html`
- Tests: `bun test` (runs all test files in `tests/`)
- Production: push to `main` auto-deploys to `maf1a.fly.dev` via Fly.io
- Staging: push to `staging` auto-deploys to `maf1a-staging.fly.dev` via Fly.io

## Key Files
- `src/server.ts` - WebSocket server + static file serving
- `src/game-engine.ts` - Game state machine and logic
- `src/types.ts` - TypeScript type definitions
- `public/app.js` - All client-side code (game UI, pixel art, WebSocket client)
- `public/app.css` - All styles
- `public/index.html` - HTML structure (screens, modals, overlays)

## Local Playtesting & Verification
- **Deterministic WS harness** (`tests/playtest/harness.ts`): boots a local server with the `MAFIA_FIXED_DEAL` seam (roles pinned by join order, so `clients[i]` always gets `roles[i]`) and drives scripted bot players over real WebSockets. Headless assertions run as `bun test` and double as permanent regression tests. See `tests/playtest/smoke.test.ts` for the example.
- **Human-in-the-loop visual proof** (`tests/playtest/proof-runner.ts`): `bun run tests/playtest/proof-runner.ts <doctor-reveal|parity-continue>` seats bots in every seat but one, prints a URL + room code, then waits for a human to join in a real browser and screenshot while the bots play a scripted night. `--selftest` fills the last seat with a bot and validates the end state headlessly.
- **The verify → fix → verify loop** (standard workflow for engine/rules/narration changes): write a failing playtest that reproduces the bug/spec → delegate the fix to a subagent → get it green → optional Chrome proof.
- **Gotchas:**
  - Optional roles must have their `enable*` setting on — `DEFAULT_SETTINGS` has them `false`, and a disabled role's night sub-phase is skipped even when the role was dealt.
  - The admin night gate is `{ type: "narrator_ready" }` (sent after `start_game` opens the night).
  - Run the proof-runner **STANDALONE** — no concurrent `bun test`; many server subprocesses starve its sockets and drop the bots.
  - The `claude-in-chrome` MCP may be permission-blocked. If so, headless `bun test` / `--selftest` is the source of truth and the Chrome proof is a self-serve manual step (a human runs the proof-runner and opens the printed URL).
- Deeper protocol discoveries live in the skill's self-healing log at `.claude/skills/playtest-mafia/SKILL.md` (gitignored/local).

## Game Rules
- The admin retains full admin rights (call votes, force dawn, end day, etc.) regardless of whether they are alive or dead
- **When adding/changing/removing roles**, update the Role Roster tables in `README.md`

## Pixel Art
- Role art and card back art defined as 10x10 grid arrays in `public/pixel-art.js`
- `pixelArtToSvg()` renders grids to inline SVGs with viewBox `0 0 10 10`
- Favicon/logo SVGs in `public/icons/` use the same pixel art style but as raw SVG
- `const _ = null` is used for transparent pixels in grid arrays
