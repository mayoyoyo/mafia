# Mafia Game - Project Instructions

## Deployment Workflow
1. **Develop on `staging`** (default branch) — push triggers auto-deploy to `maf1a-staging.fly.dev`
2. **Promote to production** — file a PR from `staging` → `main`, merge triggers auto-deploy to `maf1a.fly.dev`
3. `main` is protected: requires 1 approving review (admin can bypass)

## Version Updates (MANDATORY)
`APP_VERSION` constant lives in `public/app.js`.

**On push to staging:**
- Format: `staging.{PATCH}_{YYYYMMDDHHmm}` (PST timestamp)
- PATCH = incremented by 1 from the current numeric value
- Example: `const APP_VERSION = "staging.3_202603031200";`

**On push to main (via PR merge):**
- Format: `v1.{PATCH}_{YYYYMMDDHHmm}` (PST timestamp)
- PATCH carries over from the staging version being promoted
- Example: `const APP_VERSION = "v1.3_202603031200";`

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

## Game Rules
- The admin retains full admin rights (call votes, force dawn, end day, etc.) regardless of whether they are alive or dead
- **When adding/changing/removing roles**, update the Role Roster tables in `README.md`

## Pixel Art
- Role art and card back art defined as 10x10 grid arrays in `public/app.js`
- `pixelArtToSvg()` renders grids to inline SVGs with viewBox `0 0 10 10`
- Favicon/logo SVGs in `public/icons/` use the same pixel art style but as raw SVG
- `const _ = null` is used for transparent pixels in grid arrays
