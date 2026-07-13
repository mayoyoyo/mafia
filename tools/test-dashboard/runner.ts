// tools/test-dashboard/runner.ts
//
// Pure-ish library that runs the repo's test suite one file at a time with
// bucketed concurrency, parses bun's JUnit XML into structured results, and
// writes the whole run to tools/test-dashboard/last-run.json.
//
// Also a CLI:
//   bun run tools/test-dashboard/runner.ts [--filter <substr>] [--bucket fast|server]
// prints a compact per-file table and exits non-zero if anything failed.
//
// Design notes:
//   * `bun test <file> --reporter=junit --reporter-outfile=<tmp>` per file.
//     There is NO JSON reporter in Bun 1.3.x; JUnit XML is the structured seam.
//   * bun's <failure> element frequently has NO message body, so we also
//     capture each file's stderr and attach its tail to failed tests.
//   * The server bucket runs `pkill -f 'src/server.ts'` ONLY after that bucket
//     finishes, to reap orphaned WS servers. It is gated so a fast-only run
//     never pkills (which would murder other agents' servers).

import { join, dirname } from "node:path";
import {
  buildManifest,
  classify,
  POOL_SIZE,
  FILE_TIMEOUT_MS,
  type Bucket,
  type ClassifiedFile,
} from "./manifest.ts";

const HERE = dirname(new URL(import.meta.url).pathname);
export const REPO_ROOT = join(HERE, "..", "..");
export const LAST_RUN_PATH = join(HERE, "last-run.json");

export type Status = "passed" | "failed" | "skipped" | "running" | "queued";

export interface TestResult {
  name: string;
  suite?: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  error?: string;
}

export interface FileResult {
  file: string;
  bucket: Bucket;
  status: "passed" | "failed" | "skipped" | "running" | "queued";
  durationMs: number;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  error?: string; // file-level error (crash / timeout / no XML)
}

export interface RunResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  totals: { files: number; passed: number; failed: number; skipped: number };
  filesFailed: string[];
  files: FileResult[];
  filter?: string;
  bucket?: Bucket;
}

export type ProgressEvent =
  | { type: "run-start"; files: string[]; total: number }
  | { type: "file-queued"; file: string; bucket: Bucket }
  | { type: "file-running"; file: string; bucket: Bucket }
  | { type: "file-done"; result: FileResult }
  | { type: "run-done"; result: RunResult };

export type ProgressCb = (ev: ProgressEvent) => void;

// ----------------------------------------------------------------------------
// JUnit XML parsing
// ----------------------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : undefined;
}

/**
 * Parse bun's JUnit XML into a flat list of test results.
 * Handles nested <testsuite> (describe blocks), self-closing and block
 * <testcase>, and <failure>/<error>/<skipped> children.
 */
export function parseJUnit(xml: string): TestResult[] {
  const results: TestResult[] = [];
  // Match each <testcase ...> up to its close (self-closing OR </testcase>).
  const caseRe = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(xml)) !== null) {
    const attrs = m[1];
    const selfClosed = m[2] === "/>";
    const body = selfClosed ? "" : m[3] ?? "";
    const name = attr(attrs, "name") ?? "(unnamed)";
    const suite = attr(attrs, "classname") || undefined;
    const time = Number(attr(attrs, "time") ?? "0");
    const durationMs = Number.isFinite(time) ? Math.round(time * 1000) : 0;

    let status: TestResult["status"] = "passed";
    let error: string | undefined;

    if (/<skipped\b/.test(body)) {
      status = "skipped";
    } else if (/<failure\b/.test(body) || /<error\b/.test(body)) {
      status = "failed";
      // Prefer message attr, then any child text body, else the element type.
      const fm = body.match(/<(failure|error)\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:failure|error)>)/);
      if (fm) {
        const fattrs = fm[2];
        const ftext = fm[4] ? decodeXml(fm[4]).trim() : "";
        const msg = attr(fattrs, "message");
        const type = attr(fattrs, "type");
        error = [msg, ftext].filter(Boolean).join("\n").trim() || type || "failed";
      } else {
        error = "failed";
      }
    }
    results.push({ name, suite, status, durationMs, error });
  }
  return results;
}

// ----------------------------------------------------------------------------
// Per-file execution
// ----------------------------------------------------------------------------

function tail(s: string, n = 2000): string {
  if (s.length <= n) return s.trim();
  return "..." + s.slice(s.length - n).trim();
}

async function runOneFile(
  cf: ClassifiedFile,
  signal: AbortSignal,
): Promise<FileResult> {
  const { file, bucket } = cf;
  const outfile = join(
    "/tmp",
    `mafia-dash-${Bun.hash(file).toString(16)}-${Date.now()}.xml`,
  );
  const started = Date.now();

  const proc = Bun.spawn(
    ["bun", "test", file, "--reporter=junit", `--reporter-outfile=${outfile}`],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    },
  );

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try { proc.kill(); } catch {}
  }, FILE_TIMEOUT_MS[bucket]);

  const onAbort = () => { try { proc.kill(); } catch {} };
  signal.addEventListener("abort", onAbort, { once: true });

  const [stderr, stdout, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  clearTimeout(timeout);
  signal.removeEventListener("abort", onAbort);

  const durationMs = Date.now() - started;

  // Read + parse XML if present.
  let tests: TestResult[] = [];
  let xmlOk = false;
  try {
    const xmlFile = Bun.file(outfile);
    if (await xmlFile.exists()) {
      const xml = await xmlFile.text();
      if (xml.includes("<testcase")) {
        tests = parseJUnit(xml);
        xmlOk = true;
      }
      await xmlFile.delete().catch(() => {});
    }
  } catch {
    /* fall through to failure below */
  }

  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const skipped = tests.filter((t) => t.status === "skipped").length;

  let status: FileResult["status"];
  let fileError: string | undefined;

  if (timedOut) {
    status = "failed";
    fileError = `TIMEOUT after ${FILE_TIMEOUT_MS[bucket]}ms\n${tail(stderr)}`;
  } else if (signal.aborted) {
    status = "failed";
    fileError = "aborted";
  } else if (!xmlOk) {
    // Crashed before writing usable XML.
    status = "failed";
    fileError =
      `test process wrote no JUnit XML (exit ${exitCode}).\n` +
      tail(stderr || stdout || "(no output)");
  } else if (failed > 0 || exitCode !== 0) {
    status = "failed";
    // If bun's <failure> had no message, surface the stderr tail once.
    if (failed > 0 && tests.every((t) => t.status !== "failed" || !t.error?.trim())) {
      fileError = tail(stderr);
    } else if (failed === 0 && exitCode !== 0) {
      // nonzero exit but every parsed test passed (e.g. uncaught after tests)
      fileError = tail(stderr) || `nonzero exit ${exitCode}`;
    }
  } else if (tests.length > 0 && passed === 0 && skipped === tests.length) {
    status = "skipped";
  } else {
    status = "passed";
  }

  // Enrich individual failed tests lacking a message with the stderr tail.
  if (failed > 0) {
    const st = tail(stderr);
    for (const t of tests) {
      if (t.status === "failed" && (!t.error || !t.error.trim())) {
        t.error = st || "assertion failed (no message in JUnit output)";
      }
    }
  }

  return { file, bucket, status, durationMs, tests, passed, failed, skipped, error: fileError };
}

// ----------------------------------------------------------------------------
// Pool scheduling
// ----------------------------------------------------------------------------

async function runBucket(
  files: ClassifiedFile[],
  bucket: Bucket,
  signal: AbortSignal,
  onProgress: ProgressCb,
  results: Map<string, FileResult>,
): Promise<void> {
  const queue = [...files];
  const size = Math.max(1, POOL_SIZE[bucket]);

  async function worker() {
    while (queue.length > 0) {
      if (signal.aborted) return;
      const cf = queue.shift()!;
      onProgress({ type: "file-running", file: cf.file, bucket });
      const res = await runOneFile(cf, signal);
      results.set(cf.file, res);
      onProgress({ type: "file-done", result: res });
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, worker));

  // Reap orphaned WS servers ONLY after the server bucket. Gated so a
  // fast-only run never pkills (which could kill unrelated servers).
  if (bucket === "server" && files.length > 0 && !signal.aborted) {
    try {
      Bun.spawnSync(["pkill", "-f", "src/server.ts"]);
    } catch {
      /* pkill returns nonzero when nothing matched; ignore */
    }
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export interface RunOptions {
  filter?: string;
  bucket?: Bucket;
  onProgress?: ProgressCb;
  signal?: AbortSignal;
  writeLastRun?: boolean; // default true
}

/** Run every test file (optionally filtered by substring and/or bucket). */
export async function runAll(opts: RunOptions = {}): Promise<RunResult> {
  const manifest = await buildManifest(REPO_ROOT);
  let files = manifest;
  if (opts.filter) files = files.filter((f) => f.file.includes(opts.filter!));
  if (opts.bucket) files = files.filter((f) => f.bucket === opts.bucket);
  return runClassified(files, opts);
}

/** Run an explicit set of files (paths relative to repo root). */
export async function runFiles(paths: string[], opts: RunOptions = {}): Promise<RunResult> {
  const cf = paths.map((p) => {
    const file = p.replace(/\\/g, "/");
    return { file, bucket: classify(file), known: true } as ClassifiedFile;
  });
  return runClassified(cf, opts);
}

async function runClassified(files: ClassifiedFile[], opts: RunOptions): Promise<RunResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;

  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  onProgress({ type: "run-start", files: files.map((f) => f.file), total: files.length });
  for (const f of files) onProgress({ type: "file-queued", file: f.file, bucket: f.bucket });

  const results = new Map<string, FileResult>();
  const fast = files.filter((f) => f.bucket === "fast");
  const server = files.filter((f) => f.bucket === "server");

  // Fast pool and server pool run concurrently with each other; within each
  // bucket the pool size caps concurrency. (Server pool is small.)
  await Promise.all([
    runBucket(fast, "fast", signal, onProgress, results),
    runBucket(server, "server", signal, onProgress, results),
  ]);

  // Preserve manifest order in output.
  const ordered = files.map((f) => results.get(f.file)!).filter(Boolean);
  const totals = {
    files: ordered.length,
    passed: ordered.reduce((n, r) => n + r.passed, 0),
    failed: ordered.reduce((n, r) => n + r.failed, 0),
    skipped: ordered.reduce((n, r) => n + r.skipped, 0),
  };
  const filesFailed = ordered.filter((r) => r.status === "failed").map((r) => r.file);
  const finishedAt = new Date().toISOString();

  const run: RunResult = {
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    ok: filesFailed.length === 0,
    totals,
    filesFailed,
    files: ordered,
    filter: opts.filter,
    bucket: opts.bucket,
  };

  onProgress({ type: "run-done", result: run });

  if (opts.writeLastRun !== false) {
    try {
      await Bun.write(LAST_RUN_PATH, JSON.stringify(run, null, 2));
    } catch (e) {
      console.error("failed to write last-run.json:", e);
    }
  }
  return run;
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

function parseArgs(argv: string[]): { filter?: string; bucket?: Bucket } {
  const out: { filter?: string; bucket?: Bucket } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--filter") out.filter = argv[++i];
    else if (a === "--bucket") {
      const b = argv[++i];
      if (b === "fast" || b === "server") out.bucket = b;
      else { console.error(`invalid --bucket "${b}" (fast|server)`); process.exit(2); }
    } else if (a === "-h" || a === "--help") {
      console.log("usage: bun run tools/test-dashboard/runner.ts [--filter <substr>] [--bucket fast|server]");
      process.exit(0);
    }
  }
  return out;
}

function chip(status: FileResult["status"]): string {
  switch (status) {
    case "passed": return "PASS";
    case "failed": return "FAIL";
    case "skipped": return "SKIP";
    default: return status.toUpperCase();
  }
}

async function main() {
  const { filter, bucket } = parseArgs(process.argv.slice(2));
  const controller = new AbortController();
  const onSig = () => { console.error("\ninterrupted — killing children..."); controller.abort(); };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const rows: string[] = [];
  const run = await runAll({
    filter,
    bucket,
    signal: controller.signal,
    onProgress: (ev) => {
      if (ev.type === "file-done") {
        const r = ev.result;
        rows.push(
          `${chip(r.status).padEnd(5)} ${r.file.padEnd(46)} ` +
          `${String(r.passed).padStart(3)}p ${String(r.failed).padStart(2)}f ${String(r.skipped).padStart(2)}s ` +
          `${(r.durationMs / 1000).toFixed(1)}s`,
        );
      }
    },
  });

  console.log("\n" + rows.sort().join("\n"));
  console.log("\n" + "─".repeat(72));
  console.log(
    `files: ${run.totals.files}  tests: ${run.totals.passed}p ${run.totals.failed}f ${run.totals.skipped}s  ` +
    `(${(run.durationMs / 1000).toFixed(1)}s)  ${run.ok ? "OK" : "FAILED"}`,
  );
  if (!run.ok) {
    console.log("\nfailed files:");
    for (const f of run.files.filter((x) => x.status === "failed")) {
      console.log(`  ✗ ${f.file}`);
      if (f.error) console.log("      " + f.error.split("\n").slice(0, 4).join("\n      "));
      for (const t of f.tests.filter((x) => x.status === "failed").slice(0, 20)) {
        console.log(`      - ${t.suite ? t.suite + " › " : ""}${t.name}`);
      }
    }
  }
  console.log(`\nwrote ${LAST_RUN_PATH}`);
  process.exit(run.ok ? 0 : 1);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
