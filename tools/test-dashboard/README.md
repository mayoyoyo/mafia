# Mafia Test Dashboard

A localhost web UI (and headless CLI) that runs the repo's `bun test` suite one
file at a time, parses per-file / per-test results from bun's JUnit XML, and
shows what passed/failed. Lives entirely under `tools/test-dashboard/` — it does
not touch `src/`, `public/`, or `tests/`.

## Run it (human)

```bash
bun run dashboard          # boots http://localhost:8788 (falls back to +1 if busy)
```

Open the URL. Buttons:

- **Run All** — every test file (fast + server buckets).
- **Run Fast** — only the fast bucket (engine/module/happy-dom; no WS servers).
- **Run Server** — only the server bucket (real `src/server.ts` WebSocket tests).
- **Run Filter** — files whose path contains the filter substring.

Each row is a file with a status chip, `pass/fail/skip` counts, and duration.
Click a row to expand its per-test list and failure messages. Progress streams
live over SSE; on reload the page repopulates from the last run.

## Run it (headless / agent)

The runner is a pure library **and** a CLI. It never needs the web server.

```bash
# whole suite
bun run tools/test-dashboard/runner.ts

# just a subset
bun run tools/test-dashboard/runner.ts --filter narrator
bun run tools/test-dashboard/runner.ts --bucket fast
bun run tools/test-dashboard/runner.ts --filter hunter --bucket server
```

Prints a compact per-file table, writes the full run to
`tools/test-dashboard/last-run.json`, and **exits non-zero if anything failed**
(so it drops straight into CI / an agent's success check).

As a library:

```ts
import { runAll, runFiles, parseJUnit } from "./tools/test-dashboard/runner.ts";

const run = await runAll({ bucket: "fast", onProgress: (ev) => console.log(ev) });
if (!run.ok) process.exit(1);
```

`runAll(opts)` / `runFiles(paths, opts)` accept `{ filter, bucket, onProgress,
signal, writeLastRun }` and resolve to a `RunResult`
(`{ ok, totals, filesFailed, files: [{ file, bucket, status, durationMs, tests }] }`).
`onProgress` receives streaming events (`run-start`, `file-queued`,
`file-running`, `file-done`, `run-done`). Pass an `AbortSignal` to cancel; child
subprocesses are killed on abort.

## Buckets & concurrency

`manifest.ts` classifies every `tests/**/*.test.ts` file:

| bucket   | what                                                        | pool | timeout |
| -------- | ----------------------------------------------------------- | ---- | ------- |
| `fast`   | engine / module / happy-dom — no server subprocess          | 8    | 120s    |
| `server` | boots a real `src/server.ts` WebSocket server (direct or via a harness) | 2 | 300s |

Running many WS tests at once exhausts sockets and flakes, hence the small
server pool. After the **server bucket** finishes, the runner runs
`pkill -f 'src/server.ts'` to reap orphaned servers. This pkill is **gated** —
it never fires for a fast-only run, so it can't kill unrelated servers.

Each file runs as its own `bun test <file> --reporter=junit
--reporter-outfile=<tmp>.xml`. (Bun 1.3 has no JSON reporter; JUnit XML is the
structured seam. bun's `<failure>` element is often message-less, so the runner
also captures each file's stderr and attaches its tail to failed tests.)
Files that crash before writing XML, or exceed the timeout, are marked failed
with the stderr tail.

## Adding / classifying new test files

- New `tests/**/*.test.ts` files are picked up automatically by the glob.
- A file **not** in the manifest defaults to the **`server`** bucket — the safe
  default (a serialized fast test is just slower; a mis-parallelized WS test
  flakes).
- For a new *fast* file to parallelize, add its path to `FAST_FILES` in
  `manifest.ts`. For a new *server* file, add it to `SERVER_FILES`.
- To decide: it's a **server** file if it (transitively) does
  `Bun.spawn([... "src/server.ts"])` — check the file and any harness it imports
  (`tests/helpers/ws-harness.ts`, `tests/playtest/harness.ts`). Merely
  *mentioning* `src/server.ts` in a comment does not count.

## Tests

`dashboard.test.ts` unit-tests the JUnit parser and manifest classification
(self-contained, no game server):

```bash
bun test tools/test-dashboard/dashboard.test.ts
```

## Notes

- `tests/playtest/proof-runner.ts` is interactive and standalone — the dashboard
  never runs it (it's not a `*.test.ts` file and is excluded by the glob).
- Server-bucket files as of build time: see `SERVER_FILES` in `manifest.ts`.
