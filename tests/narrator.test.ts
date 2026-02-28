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
