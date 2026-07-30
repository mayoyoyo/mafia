// Unit tests for the shared i18n runtime (public/i18n.js) and the server-side
// message-reference builder (src/i18n.ts).
//
// Scope: the josa helper (batchim detection incl. Latin/digit-final names),
// template interpolation, locale list joining, number words, and seed→variant
// determinism. The Korean CONTENT is asserted in tests/i18n-korean.test.ts; here
// only the mechanics are under test.
//
// Run ONLY this file:  bun test tests/i18n-runtime.test.ts

import { describe, test, expect } from "bun:test";
import { msg, en, hasKey, poolFor, englishKeys, runtime } from "../src/i18n";
import RUNTIME from "../public/i18n.js";

const I18n = RUNTIME as any;

describe("josa: batchim detection", () => {
  // A Hangul syllable with a final consonant takes the FIRST form of the pair,
  // one without takes the second. The pair token is always batchim-form first.
  test("Hangul with batchim takes 이 / 은 / 을 / 과", () => {
    expect(I18n.josa("밥", "이가")).toBe("이");
    expect(I18n.josa("밥", "은는")).toBe("은");
    expect(I18n.josa("밥", "을를")).toBe("을");
    expect(I18n.josa("밥", "과와")).toBe("과");
    expect(I18n.josa("밥", "아야")).toBe("아");
  });

  test("Hangul without batchim takes 가 / 는 / 를 / 와", () => {
    expect(I18n.josa("사과", "이가")).toBe("가");
    expect(I18n.josa("사과", "은는")).toBe("는");
    expect(I18n.josa("사과", "을를")).toBe("를");
    expect(I18n.josa("사과", "과와")).toBe("와");
    expect(I18n.josa("사과", "아야")).toBe("야");
  });

  test("only the LAST character decides", () => {
    // 앨리스 ends in 스 (no final consonant) even though 앨 has one.
    expect(I18n.josa("앨리스", "이가")).toBe("가");
    // 이안 ends in 안 (final ㄴ).
    expect(I18n.josa("이안", "이가")).toBe("이");
  });

  test("으로/로 is the ㄹ exception: 물 takes 로, 책 takes 으로", () => {
    expect(I18n.josa("물", "으로로")).toBe("로");   // ㄹ-final → 로
    expect(I18n.josa("책", "으로로")).toBe("으로"); // other batchim → 으로
    expect(I18n.josa("사과", "으로로")).toBe("로"); // no batchim → 로
    // ㄹ still takes the batchim form for every OTHER particle.
    expect(I18n.josa("물", "이가")).toBe("이");
  });

  test("non-Hangul values default to the no-batchim form (approved ruling)", () => {
    // Player names are user input and are never transliterated in v1, so a
    // Latin- or digit-final name takes the vowel-form particle.
    expect(I18n.josa("Bob", "이가")).toBe("가");
    expect(I18n.josa("Alice", "은는")).toBe("는");
    expect(I18n.josa("Player1", "이가")).toBe("가");
    expect(I18n.josa("xX_9", "을를")).toBe("를");
    expect(I18n.josa("", "이가")).toBe("가");
    expect(I18n.josa("!", "이가")).toBe("가");
  });

  test("batchimInfo reports hangul / batchim / rieul", () => {
    expect(I18n.batchimInfo("물")).toEqual({ hangul: true, batchim: true, rieul: true });
    expect(I18n.batchimInfo("밥")).toEqual({ hangul: true, batchim: true, rieul: false });
    expect(I18n.batchimInfo("사과")).toEqual({ hangul: true, batchim: false, rieul: false });
    expect(I18n.batchimInfo("Bob")).toEqual({ hangul: false, batchim: false, rieul: false });
  });

  test("an unknown particle token renders nothing rather than throwing", () => {
    expect(I18n.josa("밥", "nope")).toBe("");
  });
});

describe("template interpolation", () => {
  test("substitutes named params", () => {
    expect(I18n.fill("{a} then {b}", { a: "one", b: "two" })).toBe("one then two");
  });

  test("single pass: a substituted value is never re-expanded", () => {
    // A player literally named "{b}" must not pull in b's value.
    expect(I18n.fill("{a}-{b}", { a: "{b}", b: "X" })).toBe("{b}-X");
  });

  test("leaves unknown placeholders in place", () => {
    expect(I18n.fill("{a} {zzz}", { a: "1" })).toBe("1 {zzz}");
  });

  test("$ patterns in values stay literal", () => {
    expect(I18n.fill("{a}!", { a: "$&" })).toBe("$&!");
  });

  test("josa formatter appends the particle to the value", () => {
    expect(I18n.fill("{name:이가} 죽었다", { name: "밥" })).toBe("밥이 죽었다");
    expect(I18n.fill("{name:이가} 죽었다", { name: "사과" })).toBe("사과가 죽었다");
    expect(I18n.fill("{name:이가} 죽었다", { name: "Bob" })).toBe("Bob가 죽었다");
  });

  test("null / undefined params render empty", () => {
    expect(I18n.fill("[{a}]", { a: null })).toBe("[]");
  });
});

describe("list joining and number words (English bundle)", () => {
  test("1 / 2 / 3+ forms match the pre-i18n joinNames output", () => {
    expect(I18n.joinList(["A"])).toBe("A");
    expect(I18n.joinList(["A", "B"])).toBe("A and B");
    expect(I18n.joinList(["A", "B", "C"])).toBe("A, B, and C");
    expect(I18n.joinList(["A", "B", "C", "D"])).toBe("A, B, C, and D");
  });

  test("joinList preserves the caller's order (never re-sorts)", () => {
    // The server hands over an alphabetically sorted array on purpose — the
    // kill order must not be inferable — so the renderer must not reorder it.
    expect(I18n.joinList(["Zed", "Ann"])).toBe("Zed and Ann");
  });

  test("number words 0..10, digits beyond", () => {
    expect(I18n.numberWord(0)).toBe("zero");
    expect(I18n.numberWord(3)).toBe("three");
    expect(I18n.numberWord(10)).toBe("ten");
    expect(I18n.numberWord(11)).toBe("11");
  });
});

describe("seed → variant determinism", () => {
  test("the same seed always selects the same variant", () => {
    for (const seed of [0, 1, 7, 12345, 0x7ffffffe]) {
      expect(en("narr.execution", { name: "Ann" }, seed)).toBe(en("narr.execution", { name: "Ann" }, seed));
    }
  });

  test("variant index is seed % pool.length", () => {
    const pool = poolFor("narr.loverDeath");
    expect(pool.length).toBeGreaterThan(1);
    for (let seed = 0; seed < pool.length * 3; seed++) {
      const expected = pool[seed % pool.length].replace("{name}", "Eve");
      expect(en("narr.loverDeath", { name: "Eve" }, seed)).toBe(expected);
    }
  });

  test("sweeping seeds reaches every variant in the pool", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) seen.add(en("narr.hunterReveal", { name: "Ann" }, seed));
    expect(seen.size).toBe(poolFor("narr.hunterReveal").length);
  });

  test("pickIndex is stable and in range for any slot", () => {
    for (let seed = 0; seed < 50; seed++) {
      for (let slot = 0; slot < 4; slot++) {
        const a = I18n.pickIndex(seed, 7, slot);
        expect(a).toBe(I18n.pickIndex(seed, 7, slot));
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(7);
      }
    }
  });

  test("a negative or non-numeric seed still resolves in range", () => {
    expect(I18n.pickIndex(-5, 4, 0)).toBeGreaterThanOrEqual(0);
    expect(I18n.pickIndex(NaN, 4, 0)).toBe(0);
    expect(I18n.pickIndex(undefined, 4, 0)).toBe(0);
  });
});

describe("sub-pool composites resolve from the one message seed", () => {
  test("doctorSave fills saveMethod / location from their own pools", () => {
    const m = msg("narr.doctorSave", { name: "Bob" }, 12345);
    expect(m.text).toContain("Bob");
    // No placeholder may survive rendering.
    expect(m.text).not.toMatch(/\{\w+/);
    const methods = poolFor("narr.doctorSave.saveMethod");
    expect(methods.some((x) => m.text.includes(x))).toBe(true);
  });

  test("execution fills executionStyle from its own pool", () => {
    const m = msg("narr.execution", { name: "Ann" }, 3);
    expect(m.text).toContain("Ann");
    expect(m.text).not.toMatch(/\{\w+/);
    const styles = poolFor("narr.execution.executionStyle");
    expect(styles.some((x) => m.text.includes(x))).toBe(true);
  });

  test("the same seed reproduces every sub-choice", () => {
    expect(msg("narr.doctorSave", { name: "Bob" }, 999).text)
      .toBe(msg("narr.doctorSave", { name: "Bob" }, 999).text);
  });

  test("sweeping seeds reaches more than one sub-pool value", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) seen.add(msg("narr.execution", { name: "Ann" }, seed).text);
    // 5 templates x 8 styles — a sweep must produce well over 5 distinct lines.
    expect(seen.size).toBeGreaterThan(poolFor("narr.execution").length);
  });
});

describe("msg(): the additive wire reference", () => {
  test("carries text + key + seed, and params only when non-empty", () => {
    const withParams = msg("narr.execution", { name: "Ann" });
    expect(withParams.key).toBe("narr.execution");
    expect(typeof withParams.seed).toBe("number");
    expect(withParams.params).toEqual({ name: "Ann" });

    const bare = msg("narr.noKill");
    expect(bare.key).toBe("narr.noKill");
    expect(bare).not.toHaveProperty("params");
  });

  test("seeds are non-negative integers", () => {
    for (let i = 0; i < 50; i++) {
      const s = msg("narr.noKill").seed;
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  test("text renders the pool variant the seed selects", () => {
    const m = msg("narr.noKill");
    expect(poolFor("narr.noKill")).toContain(m.text);
  });
});

describe("renderMessage()", () => {
  test("English keeps the server's own text verbatim", () => {
    // English byte-identity is guaranteed by construction, not by re-rendering.
    const m = { text: "SERVER TEXT", key: "narr.noKill", seed: 3 };
    expect(I18n.renderMessage(m)).toBe("SERVER TEXT");
  });

  test("a plain string passes through (pre-i18n wire shape / old clients)", () => {
    expect(I18n.renderMessage("just a line")).toBe("just a line");
  });

  test("null / undefined render empty", () => {
    expect(I18n.renderMessage(null)).toBe("");
    expect(I18n.renderMessage(undefined)).toBe("");
  });

  test("falls back to text when the key is unknown", () => {
    expect(I18n.renderMessage({ text: "fallback", key: "narr.does.not.exist", seed: 0 })).toBe("fallback");
  });
});

describe("en.json integrity", () => {
  test("the $comment documentation key is not exposed as a string", () => {
    expect(englishKeys()).not.toContain("$comment");
  });

  test("every value is a string or an array of strings", () => {
    for (const key of englishKeys()) {
      const v = poolFor(key);
      expect(v.length).toBeGreaterThan(0);
      for (const s of v) expect(typeof s).toBe("string");
    }
  });

  test("no English template leaves an unclosed placeholder", () => {
    for (const key of englishKeys()) {
      for (const s of poolFor(key)) {
        expect(s).not.toMatch(/\{[^}]*$/);
      }
    }
  });

  test("hasKey answers for present and absent keys", () => {
    expect(hasKey("narr.noKill")).toBe(true);
    expect(hasKey("narr.nope")).toBe(false);
  });

  test("the runtime the server imports is the one the browser loads", () => {
    // Same object identity — proves there is no second copy of the engine.
    expect(runtime).toBe(RUNTIME as any);
  });
});
