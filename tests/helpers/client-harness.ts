// Test harness for the vanilla-JS browser client (public/app.js).
//
// Loads public/index.html's body into a happy-dom environment, installs a
// stub WebSocket that records sent frames, then evaluates pixel-art.js and
// app.js the way a browser would (bare identifiers resolve against window).
// Tests drive the real DOM handlers and assert on the exact wire sequence.
//
// IMPORTANT: bun test runs all files in one process, so callers must invoke
// unloadClientApp() in afterAll to restore globals for other test files.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "fs";
import { join } from "path";

// The server tsconfig has no "dom" lib; these exist at runtime once
// GlobalRegistrator.register() has run.
declare const window: any;
declare const document: any;

export class StubWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: StubWebSocket[] = [];

  url: string;
  readyState = StubWebSocket.OPEN;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    StubWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = StubWebSocket.CLOSED;
  }
}

export interface ClientHarness {
  /** The stub socket app.js connected to; `sent` holds parsed outbound frames. */
  ws: StubWebSocket;
  /** Deliver a server message to the client as if received over the wire. */
  serverSays: (msg: Record<string, unknown>) => void;
  $: (id: string) => any;
}

export interface LoadClientAppOptions {
  /**
   * Multiply every setTimeout delay app.js schedules (e.g. 0.05 compresses
   * the multi-second overlay chains into tens of milliseconds). app.js calls
   * resolve `setTimeout` through the with(window) scope on every invocation,
   * so wrapping window.setTimeout here covers all of its timers. Timer order
   * is preserved (delays scale uniformly, minimum 1ms). unloadClientApp's
   * GlobalRegistrator.unregister() discards the wrapper with the rest of the
   * happy-dom globals.
   */
  timeScale?: number;
}

let loaded: ClientHarness | null = null;
const realWebSocket = (globalThis as any).WebSocket;

export function loadClientApp(opts: LoadClientAppOptions = {}): ClientHarness {
  if (loaded) return loaded;

  GlobalRegistrator.register({ url: "http://localhost:3000/" });

  const publicDir = join(import.meta.dir, "..", "..", "public");
  const html = readFileSync(join(publicDir, "index.html"), "utf8");
  const body = html
    .slice(html.indexOf("<body>") + "<body>".length, html.indexOf("</body>"))
    .replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.innerHTML = body;

  // Stub WebSocket so app.js records frames instead of connecting.
  (window as any).WebSocket = StubWebSocket;
  (globalThis as any).WebSocket = StubWebSocket;

  // happy-dom has no AudioContext; app.js unlocks audio on first click.
  // resume() never resolves so narration preloading stays out of tests.
  (window as any).AudioContext = class {
    state = "suspended";
    resume() {
      return new Promise(() => {});
    }
  };

  // Keep happy-dom from actually fetching /sw.js during app init.
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: { register: () => new Promise(() => {}) },
    configurable: true,
  });

  // app.js fetches /narration.json at init; keep the harness offline.
  (window as any).fetch = () => new Promise(() => {});

  // Compress app.js timers so overlay-chain tests don't sleep wall-clock
  // seconds. Installed before app.js evaluates; see LoadClientAppOptions.
  if (opts.timeScale !== undefined) {
    const scale = opts.timeScale;
    const realSetTimeout = window.setTimeout.bind(window);
    (window as any).setTimeout = (fn: any, delay?: number, ...args: any[]) =>
      realSetTimeout(fn, Math.max(1, Math.round((delay || 0) * scale)), ...args);
  }

  // Evaluate classic scripts with bare identifiers resolving against window,
  // matching browser script semantics (pixel-art.js attaches window globals
  // that app.js reads as bare identifiers).
  for (const file of ["pixel-art.js", "app.js"]) {
    const code = readFileSync(join(publicDir, file), "utf8");
    new Function("window", "with (window) {\n" + code + "\n}")(window);
  }

  const ws = StubWebSocket.instances[StubWebSocket.instances.length - 1];
  if (!ws) throw new Error("app.js did not open a WebSocket");

  loaded = {
    ws,
    serverSays(msg) {
      ws.onmessage!({ data: JSON.stringify(msg) });
    },
    $: (id: string) => document.getElementById(id),
  };
  return loaded;
}

export async function unloadClientApp(): Promise<void> {
  loaded = null;
  StubWebSocket.instances = [];
  await GlobalRegistrator.unregister();
  (globalThis as any).WebSocket = realWebSocket;
}
