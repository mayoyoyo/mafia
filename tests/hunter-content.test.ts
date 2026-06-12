// C7 (HUNTER-DESIGN §10) — the Hunter content layer: role-card pixel art,
// role description/color, the per-role CSS classes, and the README roster
// row (the CLAUDE.md "update the Role Roster on any role change" mandate,
// pinned by reading the file).
//
// No harness, no server, no port band: pixel-art.js is a plain IIFE that
// only touches `window`, so it is evaluated here with a bare object. CSS
// and README checks are string containment on the real files — exact
// selectors, deliberately non-brittle.

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;

function loadPixelArt(): any {
  const src = readFileSync(`${ROOT}/public/pixel-art.js`, "utf8");
  const win: any = {};
  new Function("window", src)(win);
  return win;
}

const win = loadPixelArt();
const css = readFileSync(`${ROOT}/public/app.css`, "utf8");
const readme = readFileSync(`${ROOT}/README.md`, "utf8");

// The exact structural shape shared by the single-variant roles: a PLAIN
// 10x10 grid (not an array-of-variants like citizen/mafia, not an
// array-of-one), cells null or hex color strings.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function expectPlainGrid(grid: unknown) {
  expect(Array.isArray(grid)).toBe(true);
  const rows = grid as unknown[];
  expect(rows.length).toBe(10);
  for (const row of rows) {
    expect(Array.isArray(row)).toBe(true);
    const cells = row as unknown[];
    expect(cells.length).toBe(10);
    for (const cell of cells) {
      if (cell !== null) {
        expect(typeof cell).toBe("string");
        expect(cell).toMatch(HEX);
      }
    }
  }
}

describe("C7: PIXEL_ART.hunter", () => {
  test("the structural-shape oracle accepts the existing single-variant roles", () => {
    expectPlainGrid(win.PIXEL_ART.doctor);
    expectPlainGrid(win.PIXEL_ART.detective);
    expectPlainGrid(win.PIXEL_ART.joker);
  });

  test("hunter is a plain 10x10 grid matching the doctor/detective/joker shape", () => {
    expectPlainGrid(win.PIXEL_ART.hunter);
  });

  test("hunter grid is a real drawing, not a blank placeholder", () => {
    const colored = (win.PIXEL_ART.hunter as unknown[][])
      .flat()
      .filter((c) => c !== null && c !== undefined).length;
    expect(colored).toBeGreaterThanOrEqual(20);
  });

  test("getRoleImage renders the hunter grid to an svg", () => {
    const svg = win.getRoleImage("hunter", 0);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
  });
});

describe("C7: ROLE_DESCRIPTIONS / ROLE_COLORS", () => {
  test("ROLE_DESCRIPTIONS.hunter is the exact §10 spec string", () => {
    expect(win.ROLE_DESCRIPTIONS.hunter).toBe(
      "You are the Hunter. If you die, you may take one player down with you."
    );
  });

  test("ROLE_COLORS.hunter follows the role-to-class-name pattern of every other entry", () => {
    // ROLE_COLORS values feed `role-card ${ROLE_COLORS[myRole]}` in app.js;
    // every existing entry maps a role to its own class name.
    for (const role of ["citizen", "mafia", "doctor", "detective", "joker"]) {
      expect(win.ROLE_COLORS[role]).toBe(role);
    }
    expect(win.ROLE_COLORS.hunter).toBe("hunter");
  });
});

describe("C7: app.css per-role classes", () => {
  test("--role-hunter variable is defined with a valid hex color", () => {
    const m = css.match(/--role-hunter:\s*(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))\s*;/);
    expect(m).not.toBeNull();
  });

  test("role card border + name color classes exist", () => {
    expect(css).toContain(".role-card.hunter .card-front { border-color: var(--role-hunter); }");
    expect(css).toContain(".role-card.hunter .role-name { color: var(--role-hunter); }");
  });

  test("game-over role reveal badge class exists", () => {
    expect(css).toContain(".role-reveal-role.hunter { background: var(--role-hunter); color: #fff; }");
  });

  test("game-history hunter_revenge events get the hunter color (DeathEventType renders as game-history-item class)", () => {
    expect(css).toContain(".game-history-item.hunter_revenge { color: var(--role-hunter); }");
  });

  test("the C5a revenge slide-fill is reconciled to --role-hunter (rgba of the var color, like every other role's slide skin)", () => {
    const varMatch = css.match(/--role-hunter:\s*(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))\s*;/);
    expect(varMatch).not.toBeNull();
    let hex = varMatch![1];
    if (hex.length === 4) hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const block = css.match(/\.slide-confirm\.role-hunter_revenge \.slide-fill\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    expect(block![1]).toContain(`rgba(${r},${g},${b}`);
    // The C5a ad-hoc green must be gone.
    expect(css).not.toContain("rgba(46,125,50");
  });
});

describe("C7: README Role Roster (CLAUDE.md mandate)", () => {
  test("the Special Roles table contains the exact §10 Hunter row", () => {
    expect(readme).toContain(
      "| **Hunter** | Town | None — acts only on death | When the Hunter dies — by Mafia kill, day-vote execution, Joker haunt, or lover heartbreak — they are revealed and may immediately take one living player down with them. The shot cannot be blocked by the Doctor and resolves before the win check. Revenge is optional in both modes — the Hunter may decline (and the host may skip a stalled Hunter). |"
    );
  });

  test("the Hunter row sits in deal order: after Joker, before Lovers", () => {
    const iJoker = readme.indexOf("| **Joker** |");
    const iHunter = readme.indexOf("| **Hunter** |");
    const iLovers = readme.indexOf("| **Lovers** |");
    expect(iJoker).toBeGreaterThan(-1);
    expect(iHunter).toBeGreaterThan(iJoker);
    expect(iLovers).toBeGreaterThan(iHunter);
  });
});
