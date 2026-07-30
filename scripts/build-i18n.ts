// Generate public/i18n/bundles.js from the canonical language JSON files.
//
// WHY a generated file exists at all: the browser client is a set of classic
// <script> tags, and English text must be available SYNCHRONOUSLY — the client
// test harness stubs fetch() with a promise that never resolves, and a fetch
// round-trip would also flash untranslated chrome on a real device. JSON cannot
// be loaded by a <script> tag, so the JSON (which stays the single source of
// truth that translators edit) is wrapped into one dual-mode script.
//
//   bun run scripts/build-i18n.ts          write public/i18n/bundles.js
//   bun run scripts/build-i18n.ts --check  exit 1 if the file is out of date
//
// tests/i18n-bundles.test.ts runs the --check equivalent, so drift between the
// JSON and the generated bundle is impossible to merge.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const I18N_DIR = join(import.meta.dir, "..", "public", "i18n");
const OUT_PATH = join(I18N_DIR, "bundles.js");

/** Language codes present as <code>.json, in stable order (en first). */
export function languageFiles(): string[] {
  const langs = readdirSync(I18N_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
  return ["en", ...langs.filter((l) => l !== "en")].filter((l) => langs.includes(l));
}

/** Parse a language file, dropping the `$comment` documentation key. */
export function loadLanguage(lang: string): Record<string, string | string[]> {
  const raw = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), "utf8"));
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "$comment") continue;
    out[k] = v as string | string[];
  }
  return out;
}

export function renderBundles(): string {
  const langs = languageFiles();
  const body = langs
    .map((lang) => `    ${JSON.stringify(lang)}: ${JSON.stringify(loadLanguage(lang), null, 2).split("\n").join("\n    ")}`)
    .join(",\n");

  return `// GENERATED FILE — do not edit. Source: public/i18n/*.json
// Regenerate with: bun run scripts/build-i18n.ts
// Loaded as a classic script before app.js so English is available synchronously.
(function () {
  "use strict";
  var BUNDLES = {
${body}
  };
  var g = typeof globalThis !== "undefined" ? globalThis : this;
  if (g) g.I18N_BUNDLES = BUNDLES;
  if (typeof window !== "undefined" && window) window.I18N_BUNDLES = BUNDLES;
  if (typeof module !== "undefined" && module && module.exports) module.exports = BUNDLES;
})();
`;
}

if (import.meta.main) {
  const next = renderBundles();
  if (process.argv.includes("--check")) {
    let current = "";
    try { current = readFileSync(OUT_PATH, "utf8"); } catch {}
    if (current !== next) {
      console.error("public/i18n/bundles.js is stale — run: bun run scripts/build-i18n.ts");
      process.exit(1);
    }
    console.log("public/i18n/bundles.js is up to date");
  } else {
    writeFileSync(OUT_PATH, next);
    console.log(`wrote ${OUT_PATH} (${languageFiles().join(", ")})`);
  }
}
