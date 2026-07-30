# Per-device language support (Korean v1) — approved design

Approved by Hanson 2026-07-30. Branch `feature/i18n-ko` off staging → PR into staging.

## Rulings
- **Per-device** language; picker in in-game settings modal AND auth screen; `localStorage` persisted; default English.
- **Audio stays English always** (explicit non-goal; narrator voice files untouched).
- **Keys + params on the wire**: server-originated game text (narration, deaths, phase announcements, event-log labels) gains additive `{ key, params, seed }` beside the existing rendered English `text` (fallback for missing translations/old clients). Server never knows the client language.
- Random variety: server sends one `seed`; client renders `pool[seed % pool.length]` — pool sizes may differ per language.
- Korean register: **한다체** (literary/dramatic) for narrator; **polite** forms for UI chrome.
- **Trimmed pools** for ko v1: every key exists, 2–3 variants each (~150–200 strings total).
- Korean only now; adding a language later = one new JSON file.

## Components
1. `public/i18n/en.json` + `public/i18n/ko.json` — flat key → template(s). en.json is generated FROM current strings (it is the source of truth extraction, not a rewrite).
2. Client runtime in `public/app.js` (or `public/i18n.js` if a new file is cleaner): `t(key, params)`, `renderMessage(msg)`, language state + switch handler that re-renders narrator transcript, event log, and static chrome live.
3. **Josa helper**: Korean particles (이/가, 은/는, 을/를, 과/와, 아/야) chosen by final-jamo batchim detection on interpolated values; non-Hangul names default to the no-batchim form. Template syntax e.g. `{name:이가}`.
4. Server: `src/narrator.ts` + message sites in `src/server.ts`/`src/game-engine.ts` attach `key/params/seed` while still rendering `text` exactly as today (English rendering unchanged — existing tests keep passing).
5. Static `index.html` text via `data-i18n` attributes; `app.js` literals through `t()`.
6. Not translated: player names, room codes, version string, server logs, README.

## Privacy invariant
A key/params pair must never reveal more than its rendered English string did. Extend `tests/playtest/death-cause-neutrality.test.ts`: for living clients, death-related keys and params are cause-neutral (no key names encoding mafia/vigilante/joker origin).

## Testing
- Unit: josa helper (batchim cases, Latin names), t() interpolation, seed→variant determinism.
- Completeness: every key referenced in code exists in en.json; every en key exists in ko.json or falls back with a logged warning (test asserts zero missing for shipped keys).
- e2e (client harness + WS): client in ko renders Korean narration for a scripted night/day; language switch re-renders transcript; privacy fence extended as above.
- Full suite stays green (staging baseline).

## Review gate
ko.json drafted by the implementing agent (한다체/polite per above); **Hanson reviews the Korean in the PR** before merge.
