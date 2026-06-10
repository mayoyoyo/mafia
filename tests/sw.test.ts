import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Service worker tests (M14, L11).
 *
 * sw.js is a classic SW script (self.addEventListener / caches / fetch),
 * so it is evaluated in a sandbox with stubbed globals. The install and
 * fetch listeners are captured and driven directly with stub events.
 *
 * - M14: a resolved non-OK response (e.g. Fly's 503 deploy page) must be
 *   returned to the page but must NOT overwrite the cached app shell.
 * - L11: the precache list must match the files index.html actually loads
 *   (/pixel-art.js present, real .svg icons, every entry exists on disk)
 *   and CACHE_NAME must be bumped past "mafia-v2" so clients reinstall.
 */

const ROOT = join(import.meta.dir, "..");
const PUBLIC_DIR = join(ROOT, "public");
const SW_SOURCE = readFileSync(join(PUBLIC_DIR, "sw.js"), "utf8");
const ORIGIN = "https://mafia.test";

type FetchStub = (input: string | Request) => Promise<Response>;

interface Sandbox {
  listeners: Map<string, (e: any) => void>;
  /** cacheName -> (pathname -> Response) */
  stores: Map<string, Map<string, Response>>;
  /** URL lists passed to cache.addAll, in call order */
  addAllCalls: string[][];
  /** cache names passed to caches.open, in call order */
  openedNames: string[];
}

function keyOf(request: string | Request): string {
  return typeof request === "string" ? request : new URL(request.url).pathname;
}

function loadSw(fetchStub: FetchStub): Sandbox {
  const listeners = new Map<string, (e: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const addAllCalls: string[][] = [];
  const openedNames: string[] = [];

  const makeCache = (store: Map<string, Response>) => ({
    addAll: async (urls: string[]) => {
      addAllCalls.push([...urls]);
      for (const url of urls) store.set(keyOf(url), new Response("precached"));
    },
    put: async (request: string | Request, response: Response) => {
      store.set(keyOf(request), response);
    },
    match: async (request: string | Request) => store.get(keyOf(request)),
  });

  const cachesStub = {
    open: async (name: string) => {
      openedNames.push(name);
      if (!stores.has(name)) stores.set(name, new Map());
      return makeCache(stores.get(name)!);
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (request: string | Request) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const selfStub = {
    addEventListener: (type: string, fn: (e: any) => void) => listeners.set(type, fn),
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };

  new Function("self", "caches", "fetch", SW_SOURCE)(selfStub, cachesStub, fetchStub);
  return { listeners, stores, addAllCalls, openedNames };
}

async function driveInstall(sb: Sandbox): Promise<void> {
  let waited: Promise<unknown> = Promise.resolve();
  sb.listeners.get("install")!({ waitUntil: (p: Promise<unknown>) => { waited = p; } });
  await waited;
}

async function driveActivate(sb: Sandbox): Promise<void> {
  let waited: Promise<unknown> = Promise.resolve();
  sb.listeners.get("activate")!({ waitUntil: (p: Promise<unknown>) => { waited = p; } });
  await waited;
}

async function driveFetch(sb: Sandbox, path: string): Promise<Response> {
  let responded!: Promise<Response>;
  sb.listeners.get("fetch")!({
    request: new Request(ORIGIN + path),
    respondWith: (p: Response | Promise<Response>) => { responded = Promise.resolve(p); },
  });
  const response = await responded;
  // cache.put runs in a .then() chain not awaited by respondWith — flush it
  await new Promise((r) => setTimeout(r, 0));
  return response;
}

describe("sw.js precache list (L11)", () => {
  test("install precaches /pixel-art.js (offline boot dependency of app.js)", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("ok")));
    await driveInstall(sb);
    expect(sb.addAllCalls.length).toBe(1);
    expect(sb.addAllCalls[0]).toContain("/pixel-art.js");
  });

  test("every precached entry maps to a real file in public/", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("ok")));
    await driveInstall(sb);
    for (const url of sb.addAllCalls[0]) {
      const file = url === "/" ? join(PUBLIC_DIR, "index.html") : join(PUBLIC_DIR, url.slice(1));
      expect(existsSync(file), `precached "${url}" has no file at ${file}`).toBe(true);
    }
  });

  test("no nonexistent .png icon entries are precached", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("ok")));
    await driveInstall(sb);
    expect(sb.addAllCalls[0].filter((u) => u.endsWith(".png"))).toEqual([]);
  });

  test("CACHE_NAME is mafia-v{N} with N > 2 so existing clients reinstall", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("ok")));
    await driveInstall(sb);
    expect(sb.openedNames.length).toBe(1);
    const match = sb.openedNames[0].match(/^mafia-v(\d+)$/);
    expect(match, `CACHE_NAME "${sb.openedNames[0]}" does not match mafia-v{N}`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(2);
  });

  test("every same-origin static reference in index.html is precached", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("ok")));
    await driveInstall(sb);
    const precached = new Set(sb.addAllCalls[0]);

    // References index.html makes at runtime that the SW intentionally does
    // NOT precache. Currently empty — add entries here (with a reason) if
    // index.html ever gains a legitimately runtime-only reference.
    const RUNTIME_ONLY: string[] = [];

    const html = readFileSync(join(PUBLIC_DIR, "index.html"), "utf8");
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((url) => url.startsWith("/") && !url.startsWith("//"))
      .filter((url) => !RUNTIME_ONLY.includes(url));

    // Sanity: the parser must actually find the known static references.
    expect(refs).toContain("/app.js");
    expect(refs).toContain("/app.css");

    for (const ref of refs) {
      expect(precached.has(ref), `index.html references "${ref}" but it is not in ASSETS (L11 drift)`).toBe(true);
    }
  });
});

describe("sw.js activate handler (L11)", () => {
  test("activate deletes stale caches (mafia-v2) and keeps the current one", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("ok")));
    await driveInstall(sb);
    const current = sb.openedNames[0];
    sb.stores.set("mafia-v2", new Map([["/app.js", new Response("stale shell")]]));

    await driveActivate(sb);

    expect(sb.stores.has("mafia-v2"), "stale mafia-v2 cache was not deleted on activate").toBe(false);
    expect(sb.stores.has(current), "current cache must survive activate").toBe(true);
  });
});

describe("sw.js fetch handler (M14)", () => {
  test("a resolved 503 is returned to the page but does NOT overwrite the cache", async () => {
    const sb = loadSw(() =>
      Promise.resolve(new Response("App is not available", { status: 503 }))
    );
    await driveInstall(sb);
    const cacheName = sb.openedNames[0];
    const store = sb.stores.get(cacheName)!;
    store.set("/app.js", new Response("good app shell"));

    const response = await driveFetch(sb, "/app.js");
    expect(response.status).toBe(503);

    const cached = store.get("/app.js");
    expect(cached).toBeDefined();
    expect(await cached!.clone().text()).toBe("good app shell");
  });

  test("an OK response IS cached and returned", async () => {
    const sb = loadSw(() => Promise.resolve(new Response("fresh", { status: 200 })));
    await driveInstall(sb);
    const store = sb.stores.get(sb.openedNames[0])!;

    const response = await driveFetch(sb, "/app.js");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fresh");

    const cached = store.get("/app.js");
    expect(cached).toBeDefined();
    expect(await cached!.clone().text()).toBe("fresh");
  });

  test("network failure falls back to the cached response", async () => {
    const sb = loadSw(() => Promise.reject(new TypeError("network down")));
    await driveInstall(sb);
    sb.stores.get(sb.openedNames[0])!.set("/app.js", new Response("offline shell"));

    const response = await driveFetch(sb, "/app.js");
    expect(await response.clone().text()).toBe("offline shell");
  });
});
