// ─────────────────────────────────────────────────────────────────────────
// Deterministic Figma spec emitter → docs/figma-raw/specs/.
//
// Usage:
//   bun run scripts/figma-spec.ts
//
// Env overrides: OUT_DIR (relative to repo root, defaults to docs/figma-raw).
//
// Pure local transformation of the raw pull — NO network calls. Reads the
// gzipped file JSON written by figma-pull.ts and emits per-frame UI specs a
// human or an agent can read without opening Figma:
//   specs/<section-or-page>/<node-id>--<name>.md   layout tree, text, colors
//   specs/INDEX.md                                 every spec file, one row each
//   specs/fills-used.txt                           imageRefs actually referenced
//   specs/typography.md                            (family, weight, size) combos
//   specs/palette.md                               solid hexes by usage
//
// Deterministic: every collection is sorted (node id, then count) so reruns
// diff cleanly. Token-lean by design: no JSON dumps, no absolute coordinates
// except the frame header, instance internals truncated below 2 levels.
// ─────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

// ── Config ────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const OUT = path.resolve(REPO_ROOT, process.env.OUT_DIR || "docs/figma-raw");
const FILE_JSON = path.join(OUT, "rest", "file.json.gz");
const SPECS = path.join(OUT, "specs");
const FILLS_DIR = path.join(OUT, "assets", "fills");

/** Pages whose top-level frames get spec'd even though they hold no SECTION. */
const EXTRA_PAGES = new Set(["-", "Assets"]);
const COMPONENTS_PAGE = "Components";
/** Node types that count as a "top-level frame" under a SECTION or CANVAS. */
const TOP_FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET"]);
/** Levels of an INSTANCE subtree to expand before truncating. */
const INSTANCE_DEPTH = 2;
/** Font key separator: families contain spaces, so a space-joined key cannot split back. */
const KEY_SEP = "\t";

// ── Types (only the fields this script reads) ─────────────────────────────

type Box = { x: number; y: number; width: number; height: number };
type RGBA = { r: number; g: number; b: number; a: number };

type Paint = {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: RGBA;
  imageRef?: string;
  gradientStops?: { color: RGBA; position: number }[];
};

type Effect = { type: string; visible?: boolean; radius?: number; color?: RGBA; offset?: { x: number; y: number } };

type TextStyle = {
  fontFamily?: string;
  fontPostScriptName?: string | null;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  lineHeightUnit?: string;
};

type FigNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigNode[];
  absoluteBoundingBox?: Box | null;
  characters?: string;
  style?: TextStyle;
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  effects?: Effect[];
  opacity?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  componentId?: string;
  transitionNodeID?: string | null;
  interactions?: any[];
  reactions?: any[];
};

type FileJson = {
  name?: string;
  lastModified?: string;
  version?: string;
  document: FigNode;
  components?: Record<string, { name?: string; componentSetId?: string }>;
  componentSets?: Record<string, { name?: string }>;
};

/** One markdown spec file to emit. */
type Target = { node: FigNode; group: string; groupLabel: string; groupKind: "section" | "page" };

/** Per-file tallies collected while rendering a subtree. */
type Stats = { texts: number; imageRefs: Set<string> };

// ── Small utilities (slug/cell/nodeFile mirror figma-pull.ts) ─────────────

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

/** Compact number: integers stay bare, fractions keep 2 decimals max. */
function num(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// ── Color ─────────────────────────────────────────────────────────────────

const channel = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

/** {r,g,b} floats 0..1 → `#RRGGBB`. Alpha is reported separately. */
function hex(c: RGBA): string {
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}

/** `#RRGGBB`, or `#RRGGBB @ 62%` when the color alpha × paint opacity is under 1. */
function colorLabel(c: RGBA | undefined, paintOpacity?: number): string {
  if (!c) return "";
  const alpha = (typeof c.a === "number" ? c.a : 1) * (typeof paintOpacity === "number" ? paintOpacity : 1);
  return alpha < 0.999 ? `${hex(c)} @ ${Math.round(alpha * 100)}%` : hex(c);
}

// ── Paint / stroke / effect description ───────────────────────────────────

const visiblePaints = (paints: Paint[] | undefined) => (paints ?? []).filter((p) => p && p.visible !== false);

/** One paint → one human line. IMAGE fills name the ref so assets/fills links up. */
function paintLabel(p: Paint, palette: Map<string, number>, refs: Set<string>): string {
  if (p.type === "SOLID") {
    if (p.color) bump(palette, hex(p.color));
    return colorLabel(p.color, p.opacity);
  }
  if (p.type === "IMAGE") {
    if (p.imageRef) refs.add(p.imageRef);
    return `image fill ref=${p.imageRef ?? "(none)"}`;
  }
  if (p.type.startsWith("GRADIENT")) {
    const stops = (p.gradientStops ?? []).map((s) => colorLabel(s.color, p.opacity)).join(" -> ");
    return `${p.type} ${stops || "(no stops)"}`;
  }
  return p.type;
}

function effectLabel(e: Effect): string {
  const bits = [e.type];
  if (typeof e.radius === "number") bits.push(`r${num(e.radius)}`);
  if (e.offset && (e.offset.x || e.offset.y)) bits.push(`offset ${num(e.offset.x)},${num(e.offset.y)}`);
  const c = colorLabel(e.color);
  if (c) bits.push(c);
  return bits.join(" ");
}

// ── Text ──────────────────────────────────────────────────────────────────

function lineHeightLabel(s: TextStyle): string {
  if (s.lineHeightUnit === "INTRINSIC_%") return "auto";
  if (typeof s.lineHeightPx === "number") return `${num(s.lineHeightPx)}px`;
  if (typeof s.lineHeightPercent === "number") return `${num(s.lineHeightPercent)}%`;
  return "";
}

// ── Node header line ──────────────────────────────────────────────────────

function cornerLabel(node: FigNode): string {
  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) return `radius=${num(node.cornerRadius)}`;
  const radii = node.rectangleCornerRadii;
  if (Array.isArray(radii) && radii.some((r) => r > 0)) return `radius=[${radii.map(num).join(",")}]`;
  return "";
}

function paddingLabel(node: FigNode): string {
  const t = node.paddingTop ?? 0;
  const r = node.paddingRight ?? 0;
  const b = node.paddingBottom ?? 0;
  const l = node.paddingLeft ?? 0;
  if (!t && !r && !b && !l) return "";
  if (t === r && r === b && b === l) return `pad=${num(t)}`;
  return `pad=${num(t)}/${num(r)}/${num(b)}/${num(l)}`;
}

function headLine(node: FigNode, comps: FileJson["components"], sets: FileJson["componentSets"]): string {
  const bits = [`${node.type} "${node.name}"`];
  const box = node.absoluteBoundingBox;
  if (box) bits.push(`${num(box.width)}x${num(box.height)}`);
  if (node.layoutMode && node.layoutMode !== "NONE") {
    bits.push(`layout=${node.layoutMode}`);
    if (typeof node.itemSpacing === "number" && node.itemSpacing !== 0) bits.push(`gap=${num(node.itemSpacing)}`);
    const pad = paddingLabel(node);
    if (pad) bits.push(pad);
  }
  const radius = cornerLabel(node);
  if (radius) bits.push(radius);
  if (typeof node.opacity === "number" && node.opacity < 0.999) bits.push(`opacity=${Math.round(node.opacity * 100)}%`);
  if (node.type === "INSTANCE" && node.componentId) {
    const comp = comps?.[node.componentId];
    const setName = comp?.componentSetId ? sets?.[comp.componentSetId]?.name : undefined;
    const label = comp?.name ? `"${comp.name}"${setName ? ` of set "${setName}"` : ""}` : "(component not in file)";
    bits.push(`instance of \`${node.componentId}\` ${label}`);
  }
  return bits.join("  ");
}

// ── Wiring ────────────────────────────────────────────────────────────────

type Wire = { id: string; name: string; trigger: string; target: string };

/** REST has used both `interactions` and `reactions`; `transitionNodeID` is the legacy field. */
function wiresOf(node: FigNode): Wire[] {
  const out: Wire[] = [];
  if (node.transitionNodeID) out.push({ id: node.id, name: node.name, trigger: "transitionNodeID", target: node.transitionNodeID });
  const raw = [...(Array.isArray(node.interactions) ? node.interactions : []), ...(Array.isArray(node.reactions) ? node.reactions : [])];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const trigger = String(entry.trigger?.type ?? entry.trigger ?? "UNKNOWN");
    const actions = Array.isArray(entry.actions) ? entry.actions : entry.action ? [entry.action] : [];
    if (actions.length === 0) {
      out.push({ id: node.id, name: node.name, trigger, target: "UNSPECIFIED" });
      continue;
    }
    for (const action of actions) {
      out.push({
        id: node.id,
        name: node.name,
        trigger,
        target: String(action?.destinationId ?? action?.destinationNodeId ?? "UNSPECIFIED"),
      });
    }
  }
  return out;
}

// ── Subtree rendering ─────────────────────────────────────────────────────

type Ctx = {
  comps: FileJson["components"];
  sets: FileJson["componentSets"];
  palette: Map<string, number>;
  fonts: Map<string, number>;
  stats: Stats;
  wires: Wire[];
};

/**
 * One node → its tree line plus indented detail lines, then its children.
 * `instDepth` is the depth below the nearest INSTANCE ancestor (null outside one);
 * children past INSTANCE_DEPTH collapse to a truncation marker.
 */
function renderNode(node: FigNode, depth: number, instDepth: number | null, out: string[], ctx: Ctx): void {
  if (node.visible === false) return;

  const pad = "  ".repeat(depth);
  out.push(`${pad}- ${headLine(node, ctx.comps, ctx.sets)}`);
  const detail = `${pad}  `;

  if (node.type === "TEXT") {
    ctx.stats.texts++;
    out.push(`${detail}text: ${JSON.stringify(node.characters ?? "")}`);
    const s = node.style ?? {};
    const lh = lineHeightLabel(s);
    const font = [
      s.fontFamily ?? "(no family)",
      s.fontPostScriptName ? `/ ${s.fontPostScriptName}` : "",
      typeof s.fontSize === "number" ? `${num(s.fontSize)}px` : "",
      typeof s.fontWeight === "number" ? `w${s.fontWeight}` : "",
      lh ? `lh ${lh}` : "",
      typeof s.letterSpacing === "number" && s.letterSpacing !== 0 ? `ls ${num(s.letterSpacing)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    out.push(`${detail}font: ${font}`);
    if (s.fontFamily && typeof s.fontSize === "number") {
      bump(ctx.fonts, [s.fontFamily, String(s.fontWeight ?? ""), num(s.fontSize)].join(KEY_SEP));
    }
  }

  for (const p of visiblePaints(node.fills)) {
    out.push(`${detail}fill: ${paintLabel(p, ctx.palette, ctx.stats.imageRefs)}`);
  }
  const strokes = visiblePaints(node.strokes);
  if (strokes.length > 0) {
    const weight = typeof node.strokeWeight === "number" ? ` ${num(node.strokeWeight)}px` : "";
    for (const p of strokes) out.push(`${detail}stroke: ${paintLabel(p, ctx.palette, ctx.stats.imageRefs)}${weight}`);
  }
  for (const e of node.effects ?? []) {
    if (e.visible === false) continue;
    out.push(`${detail}effect: ${effectLabel(e)}`);
  }

  ctx.wires.push(...wiresOf(node));

  const kids = (node.children ?? []).filter((c) => c.visible !== false);
  if (kids.length === 0) return;

  const childInstDepth = node.type === "INSTANCE" ? 1 : instDepth === null ? null : instDepth + 1;
  if (childInstDepth !== null && childInstDepth > INSTANCE_DEPTH) {
    out.push(`${detail}...instance internals truncated`);
    return;
  }
  for (const child of kids) renderNode(child, depth + 1, childInstDepth, out, ctx);
}

// ── One spec file ─────────────────────────────────────────────────────────

type SpecResult = { target: Target; file: string; texts: number; refs: string[] };

function buildSpec(
  target: Target,
  doc: FileJson,
  palette: Map<string, number>,
  fonts: Map<string, number>,
): { lines: string[]; result: SpecResult } {
  const node = target.node;
  const stats: Stats = { texts: 0, imageRefs: new Set() };
  const ctx: Ctx = { comps: doc.components, sets: doc.componentSets, palette, fonts, stats, wires: [] };

  const tree: string[] = [];
  renderNode(node, 0, node.type === "INSTANCE" ? 0 : null, tree, ctx);

  const box = node.absoluteBoundingBox;
  const L: string[] = [
    `# ${node.name}`,
    "",
    `- id: \`${node.id}\``,
    `- type: ${node.type}`,
    `- ${target.groupKind}: ${target.groupLabel}`,
    `- size: ${box ? `${num(box.width)} x ${num(box.height)}` : "(no bounding box)"}`,
    `- position: ${box ? `x ${num(box.x)}, y ${num(box.y)}` : "(none)"}`,
    "",
    "## Layout",
    "",
    ...tree,
    "",
    "## Assets used",
    "",
  ];

  const refs = [...stats.imageRefs].sort(byStr);
  if (refs.length === 0) L.push("_none_");
  else for (const ref of refs) L.push(`- \`${ref}\` -> assets/fills/${ref}.png`);

  L.push("", "## Wiring", "");
  const wires = ctx.wires.slice().sort((a, b) => byId(a, b) || byStr(a.trigger, b.trigger) || byStr(a.target, b.target));
  if (wires.length === 0) L.push("_none_");
  else {
    L.push("| node id | node name | trigger | target id |", "| --- | --- | --- | --- |");
    for (const w of wires) L.push(`| \`${w.id}\` | ${cell(w.name)} | ${cell(w.trigger)} | \`${w.target}\` |`);
  }

  const file = path.join(SPECS, target.group, `${nodeFile(node.id, node.name)}.md`);
  return { lines: L, result: { target, file, texts: stats.texts, refs } };
}

// ── Target discovery ──────────────────────────────────────────────────────

function collectTargets(document: FigNode): Target[] {
  const targets: Target[] = [];
  for (const page of document.children ?? []) {
    if (page.type !== "CANVAS") continue;
    for (const child of page.children ?? []) {
      if (child.type === "SECTION") {
        for (const frame of child.children ?? []) {
          if (TOP_FRAME_TYPES.has(frame.type)) {
            targets.push({ node: frame, group: slug(child.name), groupLabel: child.name, groupKind: "section" });
          }
        }
        continue;
      }
      if (page.name === COMPONENTS_PAGE) {
        // COMPONENT_SETs plus any COMPONENT sitting outside a set.
        if (child.type === "COMPONENT_SET" || child.type === "COMPONENT") {
          targets.push({ node: child, group: slug(page.name), groupLabel: page.name, groupKind: "page" });
        }
        continue;
      }
      if (EXTRA_PAGES.has(page.name) && TOP_FRAME_TYPES.has(child.type)) {
        targets.push({ node: child, group: slug(page.name), groupLabel: page.name, groupKind: "page" });
      }
    }
  }
  return targets.sort((a, b) => byId(a.node, b.node));
}

// ── Aggregate outputs ─────────────────────────────────────────────────────

async function writeIndex(results: SpecResult[]): Promise<void> {
  const L = [
    "# Figma spec index",
    "",
    `${results.length} spec files under \`docs/figma-raw/specs/\`.`,
    "",
    "| section / page | id | name | w x h | text nodes | image refs |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const sorted = results.slice().sort((a, b) => byStr(a.target.group, b.target.group) || byId(a.target.node, b.target.node));
  for (const r of sorted) {
    const box = r.target.node.absoluteBoundingBox;
    const size = box ? `${num(box.width)} x ${num(box.height)}` : "";
    const link = path.relative(SPECS, r.file);
    L.push(
      `| ${cell(r.target.groupLabel)} | \`${r.target.node.id}\` | [${cell(r.target.node.name)}](${link}) | ${size} | ${r.texts} | ${r.refs.length} |`,
    );
  }
  await Bun.write(path.join(SPECS, "INDEX.md"), L.join("\n") + "\n");
}

async function writeFillsUsed(refs: string[]): Promise<{ used: number; present: number; unreferenced: number }> {
  await Bun.write(path.join(SPECS, "fills-used.txt"), refs.length ? refs.join("\n") + "\n" : "");
  const present = existsSync(FILLS_DIR)
    ? readdirSync(FILLS_DIR)
        .filter((f) => f.endsWith(".png"))
        .map((f) => f.slice(0, -4))
    : [];
  const used = new Set(refs);
  return { used: refs.length, present: present.length, unreferenced: present.filter((p) => !used.has(p)).length };
}

async function writeTypography(fonts: Map<string, number>): Promise<{ key: string; count: number }[]> {
  const rows = [...fonts.entries()]
    .map(([key, count]) => {
      const [family = "", weight = "", size = ""] = key.split(KEY_SEP);
      return { key, family, weight, size, count };
    })
    .sort((a, b) => b.count - a.count || byStr(a.family, b.family) || Number(b.size) - Number(a.size) || byStr(a.weight, b.weight));

  const L = [
    "# Typography",
    "",
    `${rows.length} distinct (family, weight, size) combinations across all spec'd frames.`,
    "",
    "| family | weight | size | uses |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${cell(r.family)} | ${cell(r.weight)} | ${cell(r.size)} | ${r.count} |`),
  ];
  await Bun.write(path.join(SPECS, "typography.md"), L.join("\n") + "\n");
  return rows.map((r) => ({ key: `${r.family} w${r.weight} ${r.size}px`, count: r.count }));
}

async function writePalette(palette: Map<string, number>): Promise<{ hex: string; count: number }[]> {
  const rows = [...palette.entries()]
    .map(([hexValue, count]) => ({ hex: hexValue, count }))
    .sort((a, b) => b.count - a.count || byStr(a.hex, b.hex));

  const L = [
    "# Palette",
    "",
    `${rows.length} distinct solid colors (SOLID fills and strokes; gradient stops and shadow colors stay in the frame specs).`,
    "",
    "| hex | uses |",
    "| --- | --- |",
    ...rows.map((r) => `| \`${r.hex}\` | ${r.count} |`),
  ];
  await Bun.write(path.join(SPECS, "palette.md"), L.join("\n") + "\n");
  return rows;
}

// ── main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(FILE_JSON)) {
    console.error(`Missing ${path.relative(REPO_ROOT, FILE_JSON)} - run scripts/figma-pull.ts first.`);
    process.exit(1);
  }

  const raw = new TextDecoder().decode(Bun.gunzipSync(await Bun.file(FILE_JSON).bytes()));
  const doc = JSON.parse(raw) as FileJson;
  console.log(`figma-spec <- ${path.relative(REPO_ROOT, FILE_JSON)} (${doc.name ?? "unknown file"}, v${doc.version ?? "?"})`);

  const targets = collectTargets(doc.document);
  const palette = new Map<string, number>();
  const fonts = new Map<string, number>();
  const results: SpecResult[] = [];
  const allRefs = new Set<string>();

  for (const target of targets) {
    const { lines, result } = buildSpec(target, doc, palette, fonts);
    ensureDir(path.dirname(result.file));
    await Bun.write(result.file, lines.join("\n") + "\n");
    for (const ref of result.refs) allRefs.add(ref);
    results.push(result);
  }

  ensureDir(SPECS);
  await writeIndex(results);
  const fills = await writeFillsUsed([...allRefs].sort(byStr));
  const fontRows = await writeTypography(fonts);
  const paletteRows = await writePalette(palette);

  const perGroup = new Map<string, number>();
  for (const r of results) bump(perGroup, r.target.groupLabel);
  for (const [group, n] of [...perGroup.entries()].sort((a, b) => byStr(a[0], b[0]))) {
    console.log(`  ${group}: ${n} spec files`);
  }
  console.log(`  total: ${results.length} spec files, ${results.reduce((n, r) => n + r.texts, 0)} text nodes`);
  console.log(`  image fills: ${fills.used} refs used, ${fills.present} files present, ${fills.unreferenced} unreferenced`);
  console.log(`  palette: ${paletteRows.length} solid colors, top: ${paletteRows.slice(0, 5).map((r) => `${r.hex} (${r.count})`).join(", ")}`);
  console.log(`  typography: ${fontRows.length} combos, top: ${fontRows.slice(0, 3).map((r) => `${r.key} (${r.count})`).join(", ")}`);
  console.log(`index: ${path.relative(REPO_ROOT, path.join(SPECS, "INDEX.md"))}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`figma-spec failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
