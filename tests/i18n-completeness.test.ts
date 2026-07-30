// i18n completeness + English byte-identity fences.
//
// Three guarantees, all enforced mechanically:
//   1. Every key referenced by public/index.html or public/app.js exists in
//      en.json — a typo'd key would otherwise render as the key string itself.
//   2. Every `data-i18n` element's INLINE English text (the text index.html
//      ships, entities decoded) equals what t(key) renders. This is the
//      byte-identity proof for the static chrome: the extraction cannot have
//      reworded anything, and applyStaticI18n() is a no-op repaint in English.
//   3. Every en.json key exists in every SHIPPED translation, and no
//      translation invents a key or changes a placeholder set.
//
// Run ONLY this file:  bun test tests/i18n-completeness.test.ts

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { en, englishKeys, hasKey, poolFor } from "../src/i18n";

const ROOT = join(import.meta.dir, "..");
const HTML = readFileSync(join(ROOT, "public", "index.html"), "utf8");
const APP_JS = readFileSync(join(ROOT, "public", "app.js"), "utf8");
const I18N_DIR = join(ROOT, "public", "i18n");

/** Language codes with a JSON file, excluding English. */
function translations(): string[] {
  return readdirSync(I18N_DIR)
    .filter((f) => f.endsWith(".json") && f !== "en.json")
    .map((f) => f.slice(0, -".json".length));
}

function loadJson(lang: string): Record<string, string | string[]> {
  const raw = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), "utf8"));
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("$")) continue;
    out[k] = v as string | string[];
  }
  return out;
}

/** Decode the handful of HTML entities index.html actually uses. */
function decodeEntities(s: string): string {
  return s
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&copy;/g, "©")
    .replace(/&times;/g, "×")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** [key, inlineEnglishText] for every simple `data-i18n` element. */
function htmlTextKeys(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(HTML)) !== null) out.push([m[2]!, decodeEntities(m[3]!)]);
  return out;
}

/** Every key named by a data-i18n* attribute in index.html. */
function htmlAttrKeys(): string[] {
  return [...HTML.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]!);
}

/** Every literal key string passed to t() in app.js. */
function appJsKeys(): string[] {
  const keys = new Set<string>();
  for (const m of APP_JS.matchAll(/\bt\(\s*"([a-z][\w.]*\.[\w.]+)"/g)) keys.add(m[1]!);
  // Key maps such as EVENT_LABELS store keys as plain values.
  for (const m of APP_JS.matchAll(/"((?:ui|narr|err|act|sys|spec)\.[\w.]+)"/g)) keys.add(m[1]!);
  return [...keys];
}

describe("key completeness", () => {
  test("every data-i18n key in index.html exists in en.json", () => {
    const missing = htmlAttrKeys().filter((k) => !hasKey(k));
    expect(missing).toEqual([]);
  });

  test("every key referenced in app.js exists in en.json", () => {
    const missing = appJsKeys().filter((k) => !hasKey(k));
    expect(missing).toEqual([]);
  });

  test("en.json defines a non-trivial number of keys", () => {
    // Guards against a truncated/corrupted bundle silently shipping.
    expect(englishKeys().length).toBeGreaterThan(250);
  });

  test("no en.json key is an empty string or empty pool", () => {
    for (const key of englishKeys()) {
      const p = poolFor(key);
      expect(p.length).toBeGreaterThan(0);
      for (const s of p) expect(s.length).toBeGreaterThan(0);
    }
  });
});

describe("English byte-identity of the static chrome", () => {
  const pairs = htmlTextKeys();

  test("index.html actually carries data-i18n markup", () => {
    expect(pairs.length).toBeGreaterThan(60);
  });

  test("every data-i18n element's inline text equals t(key) exactly", () => {
    const mismatches: string[] = [];
    for (const [key, inline] of pairs) {
      const rendered = en(key);
      if (rendered !== inline.trim()) {
        mismatches.push(`${key}: html=${JSON.stringify(inline.trim())} en.json=${JSON.stringify(rendered)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("translation completeness", () => {
  const langs = translations();

  test("at least one translation ships", () => {
    expect(langs.length).toBeGreaterThan(0);
  });

  for (const lang of langs) {
    describe(lang, () => {
      const data = loadJson(lang);
      const keys = Object.keys(data);

      test("has NO missing keys (every en.json key is translated)", () => {
        const missing = englishKeys().filter((k) => !Object.prototype.hasOwnProperty.call(data, k));
        expect(missing).toEqual([]);
      });

      test("invents no key that English does not define", () => {
        const extra = keys.filter((k) => !hasKey(k));
        expect(extra).toEqual([]);
      });

      test("every value is a non-empty string or pool of non-empty strings", () => {
        for (const k of keys) {
          const v = data[k]!;
          const arr = Array.isArray(v) ? v : [v];
          expect(arr.length).toBeGreaterThan(0);
          for (const s of arr) {
            expect(typeof s).toBe("string");
            expect(s.length).toBeGreaterThan(0);
          }
        }
      });

      test("uses the same PARAMS as the English template", () => {
        // A translation may reorder, drop a purely decorative param, or add a
        // josa suffix — but it must never reference a param English does not
        // supply, which would render as a literal "{foo}" on screen.
        const paramsOf = (s: string) =>
          new Set([...s.matchAll(/\{(\w+)(?::[^}]+)?\}/g)].map((m) => m[1]!));
        const offenders: string[] = [];
        for (const k of keys) {
          const enParams = new Set<string>();
          for (const s of poolFor(k)) for (const p of paramsOf(s)) enParams.add(p);
          const v = data[k]!;
          for (const s of Array.isArray(v) ? v : [v]) {
            for (const p of paramsOf(s)) {
              // Sub-pool placeholders are resolved from `<key>.<name>`, so a
              // template may legitimately reference one English also uses.
              if (!enParams.has(p)) offenders.push(`${k}: {${p}}`);
            }
          }
        }
        expect(offenders).toEqual([]);
      });

      test("the two nightfall pools stay the same length as each other", () => {
        const lead = data["ui.overlay.nightLead"];
        const tail = data["ui.overlay.nightTail"];
        expect(Array.isArray(lead)).toBe(true);
        expect(Array.isArray(tail)).toBe(true);
        expect((lead as string[]).length).toBe((tail as string[]).length);
      });

      test("num.words covers 0..10", () => {
        const words = data["num.words"];
        expect(Array.isArray(words)).toBe(true);
        expect((words as string[]).length).toBe(11);
      });
    });
  }
});

describe("generated bundle is in sync with the JSON", () => {
  test("public/i18n/bundles.js matches a fresh generation", async () => {
    // Drift here would ship a stale translation to browsers while the tests
    // (which read the JSON) stayed green.
    const { renderBundles } = await import("../scripts/build-i18n");
    const onDisk = readFileSync(join(I18N_DIR, "bundles.js"), "utf8");
    expect(onDisk).toBe(renderBundles());
  });

  test("bundles.js exists and contains every shipped language", () => {
    const src = readFileSync(join(I18N_DIR, "bundles.js"), "utf8");
    for (const lang of ["en", ...translations()]) {
      expect(existsSync(join(I18N_DIR, `${lang}.json`))).toBe(true);
      expect(src).toContain(`"${lang}":`);
    }
  });
});
