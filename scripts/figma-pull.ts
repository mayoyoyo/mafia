// ─────────────────────────────────────────────────────────────────────────
// Deterministic Figma REST pull → docs/figma-raw/.
//
// Usage:
//   FIGMA_TOKEN=figd_... bun run scripts/figma-pull.ts
//   (or drop the token in ~/.figma_token)
//
// Env overrides: FIGMA_FILE_KEY, OUT_DIR (relative to repo root).
//
// Writes a raw dump — no interpretation, no LLM:
//   rest/file.json.gz   full file JSON (gzipped)
//   rest/node-index.md  pages → sections → frames / annotations / text
//   rest/wiring.md      connectors + prototype interactions
//   screenshots/**      PNG renders (frames, annotations, components, sections)
//   svg/**              COMPONENT_SET SVGs (best effort)
//   assets/fills/**     image fills
//   MANIFEST.md         counts, expected-count cross-check, failures
//
// Resumable: every download is skipped if the file already exists and is >1KB.
// Deterministic: every collection is sorted by node id so reruns diff cleanly.
// The token is never printed, logged, or written to any output file.
// ─────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// ── Config ────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const FILE_KEY = process.env.FIGMA_FILE_KEY || "fda142bAsDXHHk5WwQAIso";
const OUT = path.resolve(REPO_ROOT, process.env.OUT_DIR || "docs/figma-raw");
const API = "https://api.figma.com/v1";

/** Cross-check targets from the design brief. Data wins; a mismatch is information. */
const EXPECTED = { sections: 4, sectionFrames: 73, annotations: 14, connectors: 40, componentSets: 9 };

const MAX_RENDER_PX = 4000;
const IDS_PER_REQUEST = 20;
const DOWNLOAD_DELAY_MS = 100;

// ── Types (only the fields this script reads) ─────────────────────────────

type Box = { x: number; y: number; width: number; height: number };

type FigNode = {
  id: string;
  name: string;
  type: string;
  children?: FigNode[];
  absoluteBoundingBox?: Box | null;
  characters?: string;
  transitionNodeID?: string | null;
  transitionDuration?: number | null;
  transitionEasing?: string | null;
  interactions?: any[];
  reactions?: any[];
  connectorStart?: { endpointNodeId?: string } | null;
  connectorEnd?: { endpointNodeId?: string } | null;
};

type Frame = { id: string; name: string; box: Box | null; sectionId: string | null; pageId: string };
type Section = { id: string; name: string; box: Box | null; pageId: string; pageName: string };
type Annotation = { id: string; name: string; box: Box | null; sectionId: string | null };
type Connector = { id: string; name: string; startId: string | null; endId: string | null };
type Interaction = { id: string; name: string; targetId: string; trigger: string; duration: string; easing: string };
type TextLabel = { id: string; characters: string; sectionId: string };
type RenderTarget = { id: string; scale: number; dest: string };

// ── Auth ──────────────────────────────────────────────────────────────────

function readToken(): string {
  const fromEnv = (process.env.FIGMA_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const tokenFile = path.join(homedir(), ".figma_token");
  if (existsSync(tokenFile)) {
    const fromFile = readFileSync(tokenFile, "utf8").trim();
    if (fromFile) return fromFile;
  }
  console.error(
    [
      "No Figma token found.",
      "",
      "Provide one of:",
      "  1. export FIGMA_TOKEN=figd_...      (personal access token)",
      `  2. echo 'figd_...' > ${tokenFile}   (then chmod 600 it)`,
      "",
      "Create a token at https://www.figma.com/developers/api#access-tokens",
      "(scopes: file_content:read — read-only is enough).",
    ].join("\n"),
  );
  process.exit(1);
}

// ── HTTP (single counted helper, with 429 + 5xx retry) ────────────────────

let httpRequests = 0;
const failures: string[] = [];

function fail(msg: string): void {
  failures.push(msg);
  console.warn(`  ! ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(url: string, headers?: Record<string, string>): Promise<Response> {
  let rateLimitRetries = 0;
  let serverRetries = 0;
  for (;;) {
    httpRequests++;
    let res: Response;
    try {
      res = await fetch(url, headers ? { headers } : undefined);
    } catch (err) {
      if (serverRetries < 2) {
        await sleep(1000 * 2 ** serverRetries++);
        continue;
      }
      throw err;
    }
    if (res.status === 429 && rateLimitRetries < 5) {
      const wait = Number(res.headers.get("retry-after")) || 30;
      if (wait > 600) {
        const hours = (wait / 3600).toFixed(1);
        console.error(
          `render quota exhausted; Retry-After ${wait}s (~${hours}h). Rerun \`bun run scripts/figma-pull.ts\` after the quota resets — the run is resumable (existing files are skipped).`,
        );
        process.exit(2);
      }
      console.log(`  … 429 rate limited, sleeping ${wait}s (retry ${rateLimitRetries + 1}/5)`);
      rateLimitRetries++;
      await sleep(wait * 1000);
      continue;
    }
    if (res.status >= 500 && serverRetries < 2) {
      await sleep(1000 * 2 ** serverRetries++);
      continue;
    }
    return res;
  }
}

const authHeaders = (token: string) => ({ "X-Figma-Token": token });

// ── Small utilities ───────────────────────────────────────────────────────

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
      .replace(/-$/, "") || "untitled"
  );
}

const nodeFile = (id: string, name: string) => `${id.replace(/:/g, "-")}--${slug(name)}`;

/** Markdown-cell safe: no pipes, no newlines. */
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

const round = (n: number | undefined) => (typeof n === "number" ? Math.round(n) : "");

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Resumability: a previously downloaded, non-truncated file is left alone. */
function alreadyDownloaded(file: string): boolean {
  return existsSync(file) && statSync(file).size > 1024;
}

async function download(url: string, dest: string): Promise<boolean> {
  if (alreadyDownloaded(dest)) return true;
  const res = await http(url);
  if (!res.ok) {
    fail(`download ${res.status} → ${path.relative(OUT, dest)}`);
    return false;
  }
  ensureDir(path.dirname(dest));
  await Bun.write(dest, await res.arrayBuffer());
  return true;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Step 2: walk the document tree ────────────────────────────────────────

type Walked = {
  byId: Map<string, FigNode>;
  pages: { id: string; name: string }[];
  sections: Section[];
  frames: Frame[];
  components: { id: string; name: string }[];
  componentSets: { id: string; name: string }[];
  annotations: Annotation[];
  connectors: Connector[];
  interactions: Interaction[];
  texts: TextLabel[];
};

const TOP_FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET"]);

/** Pull prototype wiring off a node. REST has used both `interactions` and `reactions`. */
function extractInteractions(node: FigNode): Interaction[] {
  const out: Interaction[] = [];
  const push = (targetId: string, trigger: string, duration: unknown, easing: unknown) =>
    out.push({
      id: node.id,
      name: node.name,
      targetId,
      trigger,
      duration: typeof duration === "number" ? String(duration) : "",
      easing: typeof easing === "string" ? easing : "",
    });

  if (node.transitionNodeID) {
    push(node.transitionNodeID, "transitionNodeID", node.transitionDuration, node.transitionEasing);
  }
  const raw = [...(Array.isArray(node.interactions) ? node.interactions : []), ...(Array.isArray(node.reactions) ? node.reactions : [])];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const trigger = entry.trigger?.type ?? entry.trigger ?? "UNKNOWN";
    const actions = Array.isArray(entry.actions) ? entry.actions : entry.action ? [entry.action] : [];
    if (actions.length === 0) {
      push("UNSPECIFIED", String(trigger), undefined, undefined);
      continue;
    }
    for (const action of actions) {
      push(
        action?.destinationId ?? action?.destinationNodeId ?? "UNSPECIFIED",
        String(trigger),
        action?.transition?.duration,
        action?.transition?.easing?.type ?? action?.transition?.easing,
      );
    }
  }
  return out;
}

function walk(document: FigNode): Walked {
  const w: Walked = {
    byId: new Map(),
    pages: [], sections: [], frames: [], components: [], componentSets: [],
    annotations: [], connectors: [], interactions: [], texts: [],
  };

  const visit = (node: FigNode, parent: FigNode | null, pageId: string, pageName: string, sectionId: string | null) => {
    w.byId.set(node.id, node);
    const box = node.absoluteBoundingBox ?? null;

    switch (node.type) {
      case "CANVAS":
        w.pages.push({ id: node.id, name: node.name });
        pageId = node.id;
        pageName = node.name;
        break;
      case "SECTION":
        w.sections.push({ id: node.id, name: node.name, box, pageId, pageName });
        sectionId = node.id;
        break;
      case "WIDGET":
        w.annotations.push({ id: node.id, name: node.name, box, sectionId });
        break;
      case "CONNECTOR":
        w.connectors.push({
          id: node.id,
          name: node.name,
          startId: node.connectorStart?.endpointNodeId ?? null,
          endId: node.connectorEnd?.endpointNodeId ?? null,
        });
        break;
      case "TEXT":
        if (parent?.type === "SECTION") w.texts.push({ id: node.id, characters: node.characters ?? "", sectionId: parent.id });
        break;
    }

    if (node.type === "COMPONENT_SET") w.componentSets.push({ id: node.id, name: node.name });
    if (node.type === "COMPONENT") w.components.push({ id: node.id, name: node.name });

    // Top-level frame = direct child of a SECTION or a CANVAS.
    if (parent && (parent.type === "SECTION" || parent.type === "CANVAS") && TOP_FRAME_TYPES.has(node.type)) {
      w.frames.push({ id: node.id, name: node.name, box, sectionId: parent.type === "SECTION" ? parent.id : null, pageId });
    }

    w.interactions.push(...extractInteractions(node));

    for (const child of node.children ?? []) visit(child, node, pageId, pageName, sectionId);
  };

  visit(document, null, document.id, document.name, null);

  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  w.pages.sort(byId); w.sections.sort(byId); w.frames.sort(byId); w.components.sort(byId);
  w.componentSets.sort(byId); w.annotations.sort(byId); w.connectors.sort(byId); w.texts.sort(byId);
  w.interactions.sort((a, b) => byId(a, b) || (a.targetId < b.targetId ? -1 : 1));
  return w;
}

// ── Step 2 output: node-index.md + wiring.md ──────────────────────────────

async function writeNodeIndex(w: Walked): Promise<void> {
  const L: string[] = ["# Figma node index", "", `File key: \`${FILE_KEY}\``, "", "## Pages", "", "| id | name |", "| --- | --- |"];
  for (const p of w.pages) L.push(`| \`${p.id}\` | ${cell(p.name)} |`);

  for (const s of w.sections) {
    L.push("", `## Section: ${cell(s.name)}`, "", `- id: \`${s.id}\``, `- page: ${cell(s.pageName)} (\`${s.pageId}\`)`, "", "### Frames", "");
    const frames = w.frames.filter((f) => f.sectionId === s.id);
    if (frames.length === 0) L.push("_none_");
    else {
      L.push("| id | name | x | y | w | h |", "| --- | --- | --- | --- | --- | --- |");
      for (const f of frames) {
        L.push(`| \`${f.id}\` | ${cell(f.name)} | ${round(f.box?.x)} | ${round(f.box?.y)} | ${round(f.box?.width)} | ${round(f.box?.height)} |`);
      }
    }
    L.push("", "### Annotations", "");
    const anns = w.annotations.filter((a) => a.sectionId === s.id);
    if (anns.length === 0) L.push("_none_");
    else {
      L.push("| id | name | x | y | w | h |", "| --- | --- | --- | --- | --- | --- |");
      for (const a of anns) {
        L.push(`| \`${a.id}\` | ${cell(a.name)} | ${round(a.box?.x)} | ${round(a.box?.y)} | ${round(a.box?.width)} | ${round(a.box?.height)} |`);
      }
    }
    L.push("", "### Text labels", "");
    const texts = w.texts.filter((t) => t.sectionId === s.id);
    if (texts.length === 0) L.push("_none_");
    else {
      L.push("| id | characters |", "| --- | --- |");
      for (const t of texts) L.push(`| \`${t.id}\` | ${cell(t.characters)} |`);
    }
  }

  const loose = w.frames.filter((f) => f.sectionId === null);
  if (loose.length > 0) {
    L.push("", "## Frames outside any section", "", "| id | name | page | x | y | w | h |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const f of loose) {
      const page = w.pages.find((p) => p.id === f.pageId)?.name ?? f.pageId;
      L.push(`| \`${f.id}\` | ${cell(f.name)} | ${cell(page)} | ${round(f.box?.x)} | ${round(f.box?.y)} | ${round(f.box?.width)} | ${round(f.box?.height)} |`);
    }
  }

  L.push("", "## Component sets", "", "| id | name |", "| --- | --- |");
  for (const c of w.componentSets) L.push(`| \`${c.id}\` | ${cell(c.name)} |`);
  L.push("", "## Components", "", "| id | name |", "| --- | --- |");
  for (const c of w.components) L.push(`| \`${c.id}\` | ${cell(c.name)} |`);

  await Bun.write(path.join(OUT, "rest", "node-index.md"), L.join("\n") + "\n");
}

async function writeWiring(w: Walked): Promise<void> {
  const label = (id: string | null): string => {
    if (!id) return "UNATTACHED";
    const node = w.byId.get(id);
    return node ? `\`${id}\` ${cell(node.name)}` : `\`${id}\` UNATTACHED`;
  };

  const L: string[] = ["# Figma wiring", "", "## Connectors", ""];
  if (w.connectors.length === 0) L.push("none found");
  else {
    L.push("| connector id | trigger name | source | target |", "| --- | --- | --- | --- |");
    for (const c of w.connectors) L.push(`| \`${c.id}\` | ${cell(c.name)} | ${label(c.startId)} | ${label(c.endId)} |`);
  }

  L.push("", "## Prototype interactions", "");
  if (w.interactions.length === 0) L.push("none found");
  else {
    L.push("| node id | node name | target | trigger | duration | easing |", "| --- | --- | --- | --- | --- | --- |");
    for (const i of w.interactions) {
      L.push(`| \`${i.id}\` | ${cell(i.name)} | ${label(i.targetId)} | ${cell(i.trigger)} | ${cell(i.duration)} | ${cell(i.easing)} |`);
    }
  }

  await Bun.write(path.join(OUT, "rest", "wiring.md"), L.join("\n") + "\n");
}

// ── Step 3: renders ───────────────────────────────────────────────────────

/** Largest scale keeping max(w,h)*scale under the render cap (Figma allows 0.01–4). */
function sectionScale(box: Box | null): number {
  if (!box) return 1;
  const longest = Math.max(box.width, box.height);
  if (!longest) return 1;
  const raw = Math.floor((MAX_RENDER_PX / longest) * 100) / 100;
  return Math.min(4, Math.max(0.1, raw));
}

function renderTargets(w: Walked): RenderTarget[] {
  const shots = path.join(OUT, "screenshots");
  const targets: RenderTarget[] = [];

  for (const s of w.sections) {
    const dir = path.join(shots, slug(s.name));
    for (const f of w.frames.filter((f) => f.sectionId === s.id)) {
      targets.push({ id: f.id, scale: 2, dest: path.join(dir, `${nodeFile(f.id, f.name)}.png`) });
    }
  }
  for (const a of w.annotations) {
    targets.push({ id: a.id, scale: 2, dest: path.join(shots, "annotations", `${nodeFile(a.id, a.name)}.png`) });
  }
  for (const c of w.componentSets) {
    targets.push({ id: c.id, scale: 2, dest: path.join(shots, "components", `${nodeFile(c.id, c.name)}.png`) });
  }
  for (const s of w.sections) {
    targets.push({ id: s.id, scale: sectionScale(s.box), dest: path.join(shots, `${slug(s.name)}--overview.png`) });
  }
  return targets;
}

/** One /images call per (scale, ≤20 ids) group; returns id → url|null. */
async function requestImages(token: string, ids: string[], scale: number, format: "png" | "svg"): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const group of chunk(ids, IDS_PER_REQUEST)) {
    const url = `${API}/images/${FILE_KEY}?ids=${encodeURIComponent(group.join(","))}&format=${format}&scale=${scale}`;
    const res = await http(url, authHeaders(token));
    if (!res.ok) {
      fail(`images ${format}@${scale} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      for (const id of group) out[id] = null;
      continue;
    }
    const body = (await res.json()) as { images?: Record<string, string | null>; err?: string };
    if (body.err) fail(`images ${format}@${scale} err: ${body.err}`);
    for (const id of group) out[id] = body.images?.[id] ?? null;
  }
  return out;
}

async function renderAll(token: string, w: Walked): Promise<number> {
  const targets = renderTargets(w).sort((a, b) => (a.id < b.id ? -1 : 1));
  const byScale = new Map<number, RenderTarget[]>();
  for (const t of targets) {
    const bucket = byScale.get(t.scale);
    if (bucket) bucket.push(t);
    else byScale.set(t.scale, [t]);
  }

  let saved = 0;
  for (const scale of [...byScale.keys()].sort((a, b) => a - b)) {
    const bucket = byScale.get(scale)!;
    const pending = bucket.filter((t) => !alreadyDownloaded(t.dest));
    console.log(`  renders @${scale}x: ${bucket.length} nodes (${bucket.length - pending.length} cached)`);
    if (pending.length === 0) {
      saved += bucket.length;
      continue;
    }
    const urls = await requestImages(token, pending.map((t) => t.id), scale, "png");
    for (const t of pending) {
      const url = urls[t.id];
      if (!url) {
        fail(`render failed (null url) for \`${t.id}\` → ${path.relative(OUT, t.dest)}`);
        continue;
      }
      if (await download(url, t.dest)) saved++;
      await sleep(DOWNLOAD_DELAY_MS);
    }
    saved += bucket.length - pending.length;
  }

  // SVG for component sets — best effort, never fatal.
  const svgTargets = w.componentSets.map((c) => ({ id: c.id, dest: path.join(OUT, "svg", `${nodeFile(c.id, c.name)}.svg`) }));
  const svgPending = svgTargets.filter((t) => !existsSync(t.dest));
  if (svgPending.length > 0) {
    try {
      const urls = await requestImages(token, svgPending.map((t) => t.id), 1, "svg");
      for (const t of svgPending) {
        const url = urls[t.id];
        if (!url) {
          fail(`svg render failed (null url) for \`${t.id}\``);
          continue;
        }
        const res = await http(url);
        if (!res.ok) {
          fail(`svg download ${res.status} for \`${t.id}\``);
          continue;
        }
        ensureDir(path.dirname(t.dest));
        await Bun.write(t.dest, await res.text());
        await sleep(DOWNLOAD_DELAY_MS);
      }
    } catch (err) {
      fail(`svg pass aborted: ${(err as Error).message}`);
    }
  }

  return saved;
}

// ── Step 4: image fills ───────────────────────────────────────────────────

async function pullFills(token: string): Promise<number> {
  try {
    const res = await http(`${API}/files/${FILE_KEY}/images`, authHeaders(token));
    if (!res.ok) {
      fail(`image fills HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return 0;
    }
    const body = (await res.json()) as { meta?: { images?: Record<string, string> } };
    const images = body.meta?.images ?? {};
    const refs = Object.keys(images).sort();
    console.log(`  image fills: ${refs.length}`);
    let n = 0;
    for (const ref of refs) {
      const url = images[ref];
      if (!url) continue;
      const dest = path.join(OUT, "assets", "fills", `${ref}.png`);
      if (alreadyDownloaded(dest)) { n++; continue; }
      if (await download(url, dest)) n++;
      await sleep(DOWNLOAD_DELAY_MS);
    }
    return n;
  } catch (err) {
    fail(`image fills aborted: ${(err as Error).message}`);
    return 0;
  }
}

// ── Step 5: manifest ──────────────────────────────────────────────────────

function checkLine(label: string, got: number, expected: number): string {
  return `| ${label} | ${got} | ${expected} | ${got === expected ? "MATCH" : `MISMATCH(got ${got} expected ${expected})`} |`;
}

async function writeManifest(w: Walked, meta: { name?: string; lastModified?: string; version?: string }, fills: number): Promise<void> {
  const sectionFrames = w.frames.filter((f) => f.sectionId !== null).length;
  const L = [
    "# Figma raw pull manifest",
    "",
    `- pulled: ${new Date().toISOString()}`,
    `- file key: \`${FILE_KEY}\``,
    `- file name: ${cell(meta.name ?? "(unknown)")}`,
    `- lastModified: ${cell(meta.lastModified ?? "(unknown)")}`,
    `- version: ${cell(meta.version ?? "(unknown)")}`,
    "",
    "## Counts",
    "",
    "| thing | count |",
    "| --- | --- |",
    `| pages | ${w.pages.length} |`,
    `| sections | ${w.sections.length} |`,
    `| top-level frames (in sections) | ${sectionFrames} |`,
    `| top-level frames (total) | ${w.frames.length} |`,
    `| annotations (WIDGET) | ${w.annotations.length} |`,
    `| connectors | ${w.connectors.length} |`,
    `| component sets | ${w.componentSets.length} |`,
    `| components | ${w.components.length} |`,
    `| prototype interactions | ${w.interactions.length} |`,
    `| text labels under sections | ${w.texts.length} |`,
    `| image fills downloaded | ${fills} |`,
    "",
    "## Expected-count cross-check",
    "",
    "_The file is the source of truth — a mismatch is information, not an error._",
    "",
    "| thing | got | expected | result |",
    "| --- | --- | --- | --- |",
    checkLine("sections", w.sections.length, EXPECTED.sections),
    checkLine("section frames", sectionFrames, EXPECTED.sectionFrames),
    checkLine("annotations", w.annotations.length, EXPECTED.annotations),
    checkLine("connectors (~)", w.connectors.length, EXPECTED.connectors),
    checkLine("component sets", w.componentSets.length, EXPECTED.componentSets),
    "",
    "## Failures",
    "",
    ...(failures.length === 0 ? ["none"] : failures.map((f) => `- ${f}`)),
    "",
    "## HTTP",
    "",
    `- total requests: ${httpRequests}`,
    "",
  ];
  await Bun.write(path.join(OUT, "MANIFEST.md"), L.join("\n") + "\n");
}

// ── main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const token = readToken();
  ensureDir(path.join(OUT, "rest"));

  console.log(`figma-pull → ${path.relative(REPO_ROOT, OUT)} (file ${FILE_KEY})`);

  // Step 1 — file JSON.
  const res = await http(`${API}/files/${FILE_KEY}`, authHeaders(token));
  if (!res.ok) {
    // Figma error bodies echo the request, never the token header.
    console.error(`GET /files/${FILE_KEY} failed: HTTP ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const raw = await res.text();
  await Bun.write(path.join(OUT, "rest", "file.json.gz"), Bun.gzipSync(new TextEncoder().encode(raw)));
  const doc = JSON.parse(raw) as { name?: string; lastModified?: string; version?: string; document: FigNode };
  console.log(`  file.json.gz written (${raw.length} bytes raw)`);

  // Step 2 — walk + markdown indexes.
  const w = walk(doc.document);
  await writeNodeIndex(w);
  await writeWiring(w);
  console.log(
    `  walked: ${w.pages.length} pages, ${w.sections.length} sections, ${w.frames.length} frames, ` +
      `${w.annotations.length} annotations, ${w.connectors.length} connectors, ${w.componentSets.length} component sets`,
  );

  // Step 3 + 4.
  const rendered = await renderAll(token, w);
  const fills = await pullFills(token);

  // Step 5.
  await writeManifest(w, doc, fills);
  console.log(`done: ${rendered} renders, ${fills} fills, ${failures.length} failures, ${httpRequests} HTTP requests`);
  console.log(`manifest: ${path.relative(REPO_ROOT, path.join(OUT, "MANIFEST.md"))}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`figma-pull failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
