# Mafia Game - Project Instructions

## Version Updates (MANDATORY)
**Before every push to main**, update the `APP_VERSION` constant in `public/app.js`:
- Format: `v1.{PR_NUMBER}_{YYYYMMDDHHmm}` (UTC timestamp)
- Increment the PR number by 1 from the current value
- Use `date -u +"%Y%m%d%H%M"` to get the UTC timestamp
- Example: `const APP_VERSION = "v1.17_202602281300";`

## Tech Stack
- Bun runtime, TypeScript server, vanilla JS client
- Single-file frontend: `public/app.js`, `public/app.css`, `public/index.html`
- Tests: `bun test` (runs all test files in `tests/`)
- Deploy: push to `main` auto-deploys via Railway

## Key Files
- `src/server.ts` - WebSocket server + static file serving
- `src/game-engine.ts` - Game state machine and logic
- `src/types.ts` - TypeScript type definitions
- `public/app.js` - All client-side code (game UI, pixel art, WebSocket client)
- `public/app.css` - All styles
- `public/index.html` - HTML structure (screens, modals, overlays)

## Pixel Art
- Role art and card back art defined as 10x10 grid arrays in `public/app.js`
- `pixelArtToSvg()` renders grids to inline SVGs with viewBox `0 0 10 10`
- Favicon/logo SVGs in `public/icons/` use the same pixel art style but as raw SVG
- `const _ = null` is used for transparent pixels in grid arrays
