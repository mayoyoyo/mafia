import { describe, test, expect } from "bun:test";
import { Narrator } from "../src/narrator";

describe("Narrator", () => {
  test("doctorSave includes player name", () => {
    const msg = Narrator.doctorSave("Bob");
    expect(msg).toContain("Bob");
  });

  test("noKill returns a message", () => {
    const msg = Narrator.noKill();
    expect(msg.length).toBeGreaterThan(0);
  });

  test("execution includes player name", () => {
    const msg = Narrator.execution("Charlie");
    expect(msg).toContain("Charlie");
  });

  test("executionSpared includes player name", () => {
    const msg = Narrator.executionSpared("Dave");
    expect(msg).toContain("Dave");
  });

  test("cascadeDeath names the victim and never reveals the bond", () => {
    const msg = Narrator.cascadeDeath("Eve");
    expect(msg).toContain("Eve");
    expect(msg).not.toMatch(/heartbreak|lover|beloved/i);
  });

  test("jokerWin includes player name", () => {
    const msg = Narrator.jokerWin("George");
    expect(msg).toContain("George");
  });

  test("townWin returns a message", () => {
    expect(Narrator.townWin().length).toBeGreaterThan(0);
  });

  test("mafiaWin returns a message", () => {
    expect(Narrator.mafiaWin().length).toBeGreaterThan(0);
  });

  test("nightFalls returns a message", () => {
    expect(Narrator.nightFalls().length).toBeGreaterThan(0);
  });

  test("dayBreaks returns a message", () => {
    expect(Narrator.dayBreaks().length).toBeGreaterThan(0);
  });
});

describe("Narrator hunter lines (C6)", () => {
  // Variant tables are picked via Math.random, so iterate many trials to
  // reach every variant (same approach as the M13 suite below).
  const TRIALS = 200;

  test("hunterReveal has at least 3 distinct variants", () => {
    const seen = new Set<string>();
    for (let i = 0; i < TRIALS; i++) seen.add(Narrator.hunterReveal("Alice"));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  test("hunterRevengeKill has at least 3 distinct variants", () => {
    const seen = new Set<string>();
    for (let i = 0; i < TRIALS; i++) seen.add(Narrator.hunterRevengeKill("Bob"));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  test("hunterDecline has at least 3 distinct variants", () => {
    const seen = new Set<string>();
    for (let i = 0; i < TRIALS; i++) seen.add(Narrator.hunterDecline());
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  test("hunterReveal contains the provided name exactly once in every variant", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.hunterReveal("Zxqv9");
      expect(msg.split("Zxqv9").length - 1).toBe(1);
    }
  });

  test("hunterRevengeKill contains the victim name exactly once in every variant", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.hunterRevengeKill("Zxqv9");
      expect(msg.split("Zxqv9").length - 1).toBe(1);
    }
  });

  test("hunterDecline variants never contain a player name or leftover placeholder", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.hunterDecline();
      expect(msg.length).toBeGreaterThan(0);
      // No placeholder may survive (a leaked "{name}" would render literally).
      expect(msg).not.toMatch(/\{\w+\}/);
    }
  });

  test("hunterReveal preserves a literal {name} username (single-pass fill)", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.hunterReveal("{name}");
      expect(msg.split("{name}").length - 1).toBe(1);
    }
  });

  test("hunterRevengeKill preserves a literal {name} username (single-pass fill)", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.hunterRevengeKill("{name}");
      expect(msg.split("{name}").length - 1).toBe(1);
    }
  });

  test('hunter lines preserve names containing replacement patterns like "$&"', () => {
    for (let i = 0; i < TRIALS; i++) {
      expect(Narrator.hunterReveal("$&")).toContain("$&");
      expect(Narrator.hunterRevengeKill("Eve$'")).toContain("Eve$'");
    }
  });
});

describe("Narrator template injection (M13)", () => {
  // A username that is a literal placeholder must NOT be re-expanded into
  // mad-libs filler. Templates are picked at random, so run many trials to
  // cover every template; the name must survive in EVERY output.
  test("cascadeDeath does not spoof a literal placeholder victim name", () => {
    for (let i = 0; i < 100; i++) {
      const msg = Narrator.cascadeDeath("{name}");
      // The victim's literal name must be preserved (no re-expansion).
      expect(msg).toContain("{name}");
    }
  });

  test("normal names are still substituted across many trials", () => {
    for (let i = 0; i < 50; i++) {
      expect(Narrator.cascadeDeath("Eve")).toContain("Eve");
      expect(Narrator.execution("Charlie")).toContain("Charlie");
    }
  });
});

describe("Narrator.nightDeaths — cause-neutral dawn batch", () => {
  // The single combined dawn announcement. It names WHO died, never HOW —
  // a leak of mafia/vigilante/joker/heartbreak here would re-out the role
  // the whole night-batch fix exists to hide.
  const FORBIDDEN = /vigilante|gunshot|bullet|joker|playing card|heartbreak|knife|wire|pistol|razor|shot|clean shot|mafia/i;
  const TRIALS = 200;

  test("one death: names the single victim, never reveals the cause", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.nightDeaths(["Alice"]);
      expect(msg).toContain("Alice");
      expect(msg).not.toMatch(FORBIDDEN);
      expect(msg).not.toMatch(/\{\w+\}/);
    }
  });

  test("two deaths: names BOTH victims, sorted, never reveals the cause", () => {
    for (let i = 0; i < TRIALS; i++) {
      // pass in reverse order — the announcer must sort so the kill ORDER
      // (targeted-first vs lover cascade) can't be inferred.
      const msg = Narrator.nightDeaths(["Zed", "Anna"]);
      expect(msg).toContain("Anna");
      expect(msg).toContain("Zed");
      expect(msg.indexOf("Anna")).toBeLessThan(msg.indexOf("Zed")); // alphabetical
      expect(msg).not.toMatch(FORBIDDEN);
    }
  });

  test("three+ deaths: names every victim, sorted, never reveals the cause", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.nightDeaths(["Carol", "Bob", "Dave"]);
      for (const n of ["Bob", "Carol", "Dave"]) expect(msg).toContain(n);
      expect(msg.indexOf("Bob")).toBeLessThan(msg.indexOf("Carol"));
      expect(msg.indexOf("Carol")).toBeLessThan(msg.indexOf("Dave"));
      expect(msg).not.toMatch(FORBIDDEN);
    }
  });

  test("diedInNight: neutral per-victim line names only the victim", () => {
    for (let i = 0; i < TRIALS; i++) {
      const msg = Narrator.diedInNight("Mallory");
      expect(msg).toContain("Mallory");
      expect(msg).not.toMatch(FORBIDDEN);
      expect(msg).not.toContain("Frank"); // no partner / other-victim tell
    }
  });
});
