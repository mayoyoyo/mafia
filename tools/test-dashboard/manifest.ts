// tools/test-dashboard/manifest.ts
//
// Classifies every tests/**/*.test.ts file into a concurrency bucket.
//
//   "fast"   -> engine / module / happy-dom tests. No src/server.ts subprocess.
//               Safe to run in a wide parallel pool.
//   "server" -> tests that boot a real src/server.ts WebSocket server (directly
//               via Bun.spawn, or transitively through a harness that does).
//               Running many of these at once exhausts sockets and flakes, so
//               they run in a small serial-ish pool.
//
// Classification strategy (hybrid, per the dashboard spec):
//   1. A STATIC, hand-verified list of the known server-spawning files
//      (SERVER_FILES). Each entry was confirmed by reading the file / its
//      harness for a real `Bun.spawn([... "src/server.ts"])`.
//   2. A STATIC list of the known-fast files (FAST_FILES) as they existed when
//      this manifest was built.
//   3. Fallback: any *.test.ts that appears in NEITHER list (i.e. a NEW file
//      added later) defaults to the "server" pool — the SAFE default, since a
//      mis-parallelized WS test flakes but a serialized fast test is merely a
//      little slower.
//
// New fast files should be added to FAST_FILES so they parallelize; until then
// the glob still picks them up (just serially).
//
// Paths are relative to the repo root and use forward slashes, matching the
// output of `Bun.Glob("tests/**/*.test.ts")`.

export type Bucket = "fast" | "server";

// Pool sizes (max concurrent files per bucket).
export const POOL_SIZE: Record<Bucket, number> = {
  fast: 8,
  server: 2,
};

// Per-file timeout budget (ms) before the subprocess is killed.
export const FILE_TIMEOUT_MS: Record<Bucket, number> = {
  fast: 120_000,
  server: 300_000,
};

// Known files that spawn a real src/server.ts (WS) server.
// Verified 2026-07-02 by reading each file / its harness:
//   - DIRECT: `Bun.spawn(["bun", "run", "src/server.ts"], ...)` in the file.
//   - WS-HARNESS: imports tests/helpers/ws-harness.ts (spawns server).
//   - PLAYTEST: imports tests/playtest/harness.ts (spawns server).
// NOTE: golden-sequences.test.ts and structured-logging.test.ts were flagged by
// an earlier audit as "engine-direct" but BOTH actually Bun.spawn src/server.ts
// -> they are server-bucket. invariants.test.ts and night-action-teardown.test.ts
// only *mention* src/server.ts in comments (engine/happy-dom direct) -> fast.
// db.test.ts uses a quick synchronous `bun -e` (no WS server) -> fast.
export const SERVER_FILES: readonly string[] = [
  // direct Bun.spawn(src/server.ts)
  "tests/e2e.test.ts",
  "tests/golden-sequences.test.ts",
  "tests/handler-guards.test.ts",
  "tests/night-guards.test.ts",
  "tests/rejoin.test.ts",
  "tests/rejoin-matrix-day.test.ts",
  "tests/rejoin-matrix-night.test.ts",
  "tests/save-signal.test.ts",
  "tests/settings-validation.test.ts",
  "tests/structured-logging.test.ts",
  "tests/ten-player-regression.test.ts",
  // via tests/helpers/ws-harness.ts
  "tests/hunter-night-dialogue.test.ts",
  "tests/hunter-ws-matrix.test.ts",
  "tests/hunter-ws-night.test.ts",
  "tests/hunter-ws-rejoin.test.ts",
  "tests/hunter-ws-vote.test.ts",
  // via tests/playtest/harness.ts
  "tests/playtest/doctor-reveal.test.ts",
  "tests/playtest/doctor-save-secrecy.test.ts",
  "tests/playtest/godfather.test.ts",
  "tests/playtest/mafia-spare-reset.test.ts",
  "tests/playtest/smoke.test.ts",
  "tests/playtest/vigilante-matrix.test.ts",
];

// Known cheap files (engine / module / happy-dom). As of manifest build time.
export const FAST_FILES: readonly string[] = [
  "tests/action-confirm.test.ts",
  "tests/client-app.test.ts",
  "tests/client-doctor-secrecy.test.ts",
  "tests/client-gates.test.ts",
  "tests/client-overlay-gameover.test.ts",
  "tests/conclude-round.test.ts",
  "tests/db.test.ts",
  "tests/death-pipeline.test.ts",
  "tests/doctor-joker-modes.test.ts",
  "tests/game-engine.test.ts",
  "tests/godfather.test.ts",
  "tests/hunter-client.test.ts",
  "tests/hunter-content.test.ts",
  "tests/hunter-edge-matrix.test.ts",
  "tests/hunter-engine.test.ts",
  "tests/invariants.test.ts",
  "tests/mafia-night-transition.test.ts",
  "tests/mafia-spare-reset.test.ts",
  "tests/mafia-votes.test.ts",
  "tests/narrator.test.ts",
  "tests/night-action-teardown.test.ts",
  "tests/night-death-batch.test.ts",
  "tests/parity-doctor.test.ts",
  "tests/pixel-art-registry.test.ts",
  "tests/projections.test.ts",
  "tests/reset-seam.test.ts",
  "tests/roster-modal.test.ts",
  "tests/roster-summary.test.ts",
  "tests/sw.test.ts",
  "tests/vigilante.test.ts",
];

const SERVER_SET = new Set(SERVER_FILES);
const FAST_SET = new Set(FAST_FILES);

/** Normalize a path to repo-root-relative forward-slash form. */
export function normalizePath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Classify a single test file into its bucket.
 * Unknown (new) files default to "server" — the safe default.
 */
export function classify(file: string): Bucket {
  const f = normalizePath(file);
  if (SERVER_SET.has(f)) return "server";
  if (FAST_SET.has(f)) return "fast";
  return "server"; // safe default for unrecognized new files
}

/** True when a file was explicitly listed (not a fallback classification). */
export function isKnown(file: string): boolean {
  const f = normalizePath(file);
  return SERVER_SET.has(f) || FAST_SET.has(f);
}

/**
 * Discover every test file under tests/ via glob, excluding non-*.test.ts
 * helpers and the interactive proof-runner (which is not a .test.ts anyway).
 * Returns repo-root-relative paths, sorted.
 */
export async function discoverTestFiles(root = process.cwd()): Promise<string[]> {
  const glob = new Bun.Glob("tests/**/*.test.ts");
  const out: string[] = [];
  for await (const p of glob.scan({ cwd: root })) {
    out.push(normalizePath(p));
  }
  return out.sort();
}

export interface ClassifiedFile {
  file: string;
  bucket: Bucket;
  known: boolean;
}

/** Discover + classify all test files. */
export async function buildManifest(root = process.cwd()): Promise<ClassifiedFile[]> {
  const files = await discoverTestFiles(root);
  return files.map((file) => ({
    file,
    bucket: classify(file),
    known: isKnown(file),
  }));
}
