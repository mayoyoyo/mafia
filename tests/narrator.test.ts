import { describe, test, expect } from "bun:test";
import { Narrator } from "../src/narrator";

describe("Narrator", () => {
  test("nightKill includes player name", () => {
    const msg = Narrator.nightKill("Alice");
    expect(msg).toContain("Alice");
  });

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

  test("loverDeath includes both names", () => {
    const msg = Narrator.loverDeath("Eve", "Frank");
    expect(msg).toContain("Eve");
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
  test("nightKill preserves a literal {tool} username", () => {
    for (let i = 0; i < 100; i++) {
      const msg = Narrator.nightKill("{tool}");
      expect(msg).toContain("{tool}");
    }
  });

  test("nightKill preserves a literal {food} username", () => {
    for (let i = 0; i < 100; i++) {
      const msg = Narrator.nightKill("{food}");
      expect(msg).toContain("{food}");
    }
  });

  test("loverDeath does not spoof a literal {lover} victim name to the partner", () => {
    for (let i = 0; i < 100; i++) {
      const msg = Narrator.loverDeath("{lover}", "Bob");
      // The victim's literal name must be preserved...
      expect(msg).toContain("{lover}");
      // ...and the partner's name must still be substituted into the template.
      expect(msg).toContain("Bob");
    }
  });

  test("jokerHauntKill preserves a literal {lastWords} username", () => {
    for (let i = 0; i < 100; i++) {
      const msg = Narrator.jokerHauntKill("{lastWords}");
      expect(msg).toContain("{lastWords}");
    }
  });

  test('nightKill preserves a name containing replacement patterns like "$&"', () => {
    for (let i = 0; i < 100; i++) {
      expect(Narrator.nightKill("$&")).toContain("$&");
      expect(Narrator.nightKill("Eve$'")).toContain("Eve$'");
    }
  });

  test("normal names are still substituted across many trials", () => {
    for (let i = 0; i < 50; i++) {
      expect(Narrator.nightKill("Alice")).toContain("Alice");
      expect(Narrator.loverDeath("Eve", "Frank")).toContain("Eve");
      expect(Narrator.execution("Charlie")).toContain("Charlie");
    }
  });
});
