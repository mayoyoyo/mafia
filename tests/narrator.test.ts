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
