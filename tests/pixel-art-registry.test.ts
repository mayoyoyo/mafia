// Pure-function registry tests for public/pixel-art.js.
//
// pixel-art.js is a classic IIFE that only writes to `window` (no DOM, no
// network) — see the no-DOM grep in D3a. So instead of standing up happy-dom
// (the client-harness route), we evaluate it against a plain object that plays
// the role of `window`, the same `new Function("window", "with (window) {…}")`
// trick the harness uses, minus the GlobalRegistrator. No port band, no DOM.

import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

function loadPixelArt(): Record<string, any> {
  const code = readFileSync(
    join(import.meta.dir, "..", "public", "pixel-art.js"),
    "utf8",
  );
  const win: Record<string, any> = {};
  new Function("window", "with (window) {\n" + code + "\n}")(win);
  return win;
}

const win = loadPixelArt();

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function isGrid(v: unknown): v is (string | null)[][] {
  return Array.isArray(v) && v.length > 0 && v.every((row) => Array.isArray(row));
}

// Every flat grid the module exports under a *_ART name. PIXEL_ART is the
// role->art MAP (a plain object, and its citizen/mafia values are arrays OF
// grids), so it is intentionally excluded by the isGrid shape check.
const artNames = Object.keys(win).filter((k) => /_ART$/.test(k) && isGrid(win[k]));

describe("pixel-art registry", () => {
  test("there is at least one *_ART export", () => {
    expect(artNames.length).toBeGreaterThan(0);
  });

  test("every *_ART export is a grid of rows of null-or-#hex cells", () => {
    for (const name of artNames) {
      const grid = win[name];
      expect(isGrid(grid), `${name} is a 2D array`).toBe(true);
      for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        expect(Array.isArray(row), `${name}[${y}] is an array`).toBe(true);
        for (let x = 0; x < row.length; x++) {
          const cell = row[x];
          const ok = cell === null || (typeof cell === "string" && HEX.test(cell));
          expect(ok, `${name}[${y}][${x}] = ${JSON.stringify(cell)} is null or #hex`).toBe(true);
        }
      }
    }
  });

  test("the 11 new D3 icon names all exist", () => {
    const expected = [
      "TROPHY_ART",
      "GEAR_ART",
      "SCROLL_ART",
      "LOCK_ART",
      "POINT_ART",
      "X_ART",
      "HEART_ART",
      "HEARTBREAK_ART",
      "REFRESH_ART",
      "MOON_ART",
      "SUN_ART",
    ];
    for (const name of expected) {
      expect(artNames, `${name} is exported`).toContain(name);
    }
  });

  test("10x10 grids are at most 10 rows of at most 10 cells", () => {
    // MASCOT_ART is the only non-10x10 grid; everything else is the 10x10
    // house format (a row may be shorter than 10 when its tail is transparent).
    for (const name of artNames) {
      if (name === "MASCOT_ART") continue;
      const grid = win[name];
      expect(grid.length, `${name} has <= 10 rows`).toBeLessThanOrEqual(10);
      for (let y = 0; y < grid.length; y++) {
        expect(grid[y].length, `${name}[${y}] has <= 10 cells`).toBeLessThanOrEqual(10);
      }
    }
  });

  test("MASCOT_ART is exactly 16x16", () => {
    const grid = win.MASCOT_ART;
    expect(isGrid(grid)).toBe(true);
    expect(grid.length).toBe(16);
    for (let y = 0; y < grid.length; y++) {
      expect(grid[y].length, `MASCOT_ART[${y}] has 16 cells`).toBe(16);
    }
  });
});

describe("pixelArtToSvg sizing", () => {
  test("default emits a 0 0 10 10 viewBox", () => {
    const svg = win.pixelArtToSvg(win.MOON_ART);
    expect(svg).toContain('viewBox="0 0 10 10"');
  });

  test("size 16 emits a 0 0 16 16 viewBox", () => {
    const svg = win.pixelArtToSvg(win.MASCOT_ART, 16);
    expect(svg).toContain('viewBox="0 0 16 16"');
  });

  test("renders one <rect> per non-null cell", () => {
    const grid = win.MOON_ART;
    const filled = grid.reduce(
      (n: number, row: (string | null)[]) => n + row.filter((c) => c !== null).length,
      0,
    );
    const svg = win.pixelArtToSvg(grid);
    const rects = (svg.match(/<rect /g) || []).length;
    expect(rects).toBe(filled);
  });
});
