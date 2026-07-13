// tools/test-dashboard/server.ts
//
// Localhost test dashboard web server.
//   bun run tools/test-dashboard/server.ts   (or: bun run dashboard)
//
// Serves a single self-contained page on http://localhost:8788 (falls back to
// the next free port). Endpoints:
//   GET  /                -> the HTML page (inline CSS/JS, no external deps)
//   GET  /api/last-run    -> last-run.json (or {} if none)
//   POST /api/run         -> { filter?, bucket? }  starts a run; 409 if busy
//   GET  /api/events      -> SSE stream of progress events

import { join, dirname } from "node:path";
import {
  runAll,
  LAST_RUN_PATH,
  type ProgressEvent,
  type RunResult,
} from "./runner.ts";

const HERE = dirname(new URL(import.meta.url).pathname);
const PAGE_PATH = join(HERE, "page.html");

// --- SSE hub -----------------------------------------------------------------
type Client = { id: number; send: (data: string) => void };
const clients = new Set<Client>();
let clientSeq = 0;

function broadcast(ev: ProgressEvent) {
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) {
    try { c.send(payload); } catch { /* dropped */ }
  }
}

// --- run state ---------------------------------------------------------------
let running = false;
let currentAbort: AbortController | null = null;
let lastRun: RunResult | null = null;

async function startRun(filter?: string, bucket?: "fast" | "server") {
  running = true;
  currentAbort = new AbortController();
  broadcast({ type: "run-start", files: [], total: 0 });
  try {
    lastRun = await runAll({
      filter,
      bucket,
      signal: currentAbort.signal,
      onProgress: broadcast,
    });
  } catch (e) {
    broadcast({ type: "run-done", result: { ok: false } as any });
    console.error("run error:", e);
  } finally {
    running = false;
    currentAbort = null;
  }
}

// --- helpers -----------------------------------------------------------------
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadLastRun(): Promise<unknown> {
  if (lastRun) return lastRun;
  const f = Bun.file(LAST_RUN_PATH);
  if (await f.exists()) {
    try { return await f.json(); } catch { return {}; }
  }
  return {};
}

// --- routes ------------------------------------------------------------------
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/") {
    const page = Bun.file(PAGE_PATH);
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (req.method === "GET" && url.pathname === "/api/last-run") {
    return json(await loadLastRun());
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    return json({ running });
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    if (running) return json({ error: "a run is already in progress" }, 409);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const filter = typeof body.filter === "string" && body.filter.trim() ? body.filter.trim() : undefined;
    const bucket = body.bucket === "fast" || body.bucket === "server" ? body.bucket : undefined;
    // fire and forget; progress streams over SSE
    startRun(filter, bucket);
    return json({ started: true, filter, bucket });
  }

  if (req.method === "POST" && url.pathname === "/api/cancel") {
    if (running && currentAbort) { currentAbort.abort(); return json({ cancelled: true }); }
    return json({ cancelled: false }, 409);
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const stream = new ReadableStream({
      start(controller) {
        const id = ++clientSeq;
        const enc = new TextEncoder();
        const client: Client = {
          id,
          send: (data) => controller.enqueue(enc.encode(data)),
        };
        clients.add(client);
        controller.enqueue(enc.encode(`retry: 3000\n\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "hello", running })}\n\n`));
        // heartbeat to keep the connection open through proxies
        const hb = setInterval(() => {
          try { controller.enqueue(enc.encode(`: ping\n\n`)); }
          catch { clearInterval(hb); }
        }, 15000);
        (client as any)._hb = hb;
        (client as any)._cleanup = () => { clearInterval(hb); clients.delete(client); };
        req.signal.addEventListener("abort", () => {
          clearInterval(hb);
          clients.delete(client);
          try { controller.close(); } catch {}
        });
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  return new Response("not found", { status: 404 });
}

// --- boot with port fallback -------------------------------------------------
function boot(startPort = 8788, tries = 10) {
  for (let p = startPort; p < startPort + tries; p++) {
    try {
      const server = Bun.serve({ port: p, idleTimeout: 0, fetch: handle });
      console.log(`\n  Mafia test dashboard → http://localhost:${server.port}\n`);
      console.log("  Run All / Run Fast / Run Server from the page, or headlessly:");
      console.log("    bun run tools/test-dashboard/runner.ts --filter <substr> --bucket fast|server\n");
      return server;
    } catch (e: any) {
      if (e?.code === "EADDRINUSE" || String(e).includes("in use")) continue;
      throw e;
    }
  }
  throw new Error(`no free port in ${startPort}..${startPort + tries}`);
}

if (import.meta.main) {
  boot();
}
