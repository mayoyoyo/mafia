// Korean end-to-end rendering + live language switch, driven through the real
// browser client (happy-dom harness) and the real wire frames.
//
// These assertions are deliberately STRUCTURAL (Hangul present, no leftover
// placeholder, differs from English, English restored byte-for-byte) rather than
// pinned to exact Korean sentences — the Korean copy is under native-speaker
// review and will be reworded, but none of these properties may regress.
//
// Run ONLY this file:  bun test tests/i18n-korean.test.ts

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";
import { msg } from "../src/i18n";

declare const document: any;
declare const window: any;
declare const localStorage: any;

const HANGUL = /[가-힣]/;
const { ws, serverSays } = loadClientApp();
const I18n = () => window.I18n;

const KO = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "public", "i18n", "ko.json"), "utf8"),
) as Record<string, string | string[]>;

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  I18n().setLang("en");
  ws.sent.length = 0;
});

/** Seat this client as a living citizen in a started game. */
function startGame() {
  serverSays({ type: "logged_in", userId: 1, username: "Ann" });
  serverSays({ type: "game_started", role: "citizen", isLover: false, variant: 0 });
}

describe("the Korean bundle is loaded and selectable", () => {
  test("ko is a registered bundle", () => {
    expect(I18n().hasBundle("ko")).toBe(true);
    expect(I18n().languages()).toContain("ko");
  });

  test("setLang switches and reports the active language", () => {
    expect(I18n().lang()).toBe("en");
    I18n().setLang("ko");
    expect(I18n().lang()).toBe("ko");
  });

  test("an unknown language falls back to English rather than breaking", () => {
    I18n().setLang("xx");
    expect(I18n().lang()).toBe("en");
  });
});

describe("static chrome renders in Korean", () => {
  test("every data-i18n element repaints to Hangul-bearing Korean", () => {
    const before = document.getElementById("btn-login").textContent;
    expect(before).toBe("Log in");

    I18n().setLang("ko");

    // A representative spread across screens: auth, lobby, settings, modals.
    const ids = ["btn-login", "btn-register", "btn-host", "btn-join", "btn-start", "btn-accuse"];
    for (const id of ids) {
      const el = document.getElementById(id);
      expect(el, id).toBeTruthy();
      expect(HANGUL.test(el.textContent), `${id} = ${el.textContent}`).toBe(true);
    }
    expect(document.querySelector("#modal-settings h3").textContent).toMatch(HANGUL);
    expect(document.querySelector("#modal-roster h3").textContent).toMatch(HANGUL);
  });

  test("no data-i18n element renders a raw key or an empty string", () => {
    I18n().setLang("ko");
    const offenders: string[] = [];
    for (const el of document.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n");
      const text = String(el.textContent ?? "");
      if (text.length === 0 || text === key) offenders.push(`${key} -> ${JSON.stringify(text)}`);
    }
    expect(offenders).toEqual([]);
  });

  test("switching back to English restores the original text exactly", () => {
    const snapshot = new Map<string, string>();
    for (const el of document.querySelectorAll("[data-i18n]")) {
      snapshot.set(el.getAttribute("data-i18n"), el.textContent);
    }
    I18n().setLang("ko");
    I18n().setLang("en");
    const mismatches: string[] = [];
    for (const el of document.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n");
      if (snapshot.get(key) !== el.textContent) {
        mismatches.push(`${key}: ${JSON.stringify(snapshot.get(key))} -> ${JSON.stringify(el.textContent)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("the language picker reflects and drives the active language", () => {
    I18n().setLang("en");
    const koBtn = document.querySelector('#modal-settings .lang-control [data-lang="ko"]');
    const enBtn = document.querySelector('#modal-settings .lang-control [data-lang="en"]');
    expect(koBtn).toBeTruthy();
    expect(enBtn.classList.contains("active")).toBe(true);

    koBtn.click();
    expect(I18n().lang()).toBe("ko");
    expect(koBtn.classList.contains("active")).toBe(true);
    expect(enBtn.classList.contains("active")).toBe(false);
    // Per-device: the choice is persisted locally and never sent to the server.
    expect(localStorage.getItem("mafia_lang")).toBe("ko");
    expect(ws.sent.filter((m: any) => JSON.stringify(m).includes("lang"))).toEqual([]);
  });

  test("an auth-screen picker exists too (a player picks before signing in)", () => {
    expect(document.querySelector('#screen-auth .lang-control [data-lang="ko"]')).toBeTruthy();
  });
});

describe("narration renders in Korean from the wire reference", () => {
  test("a phase_change line renders Korean, then English, from the same frame", () => {
    startGame();
    const ref = msg("narr.nightDeath.single", { name: "밥" });
    serverSays({
      type: "phase_change", phase: "day", round: 1,
      messages: [ref.text], messageRefs: [ref],
    });

    const area = document.getElementById("narrator-messages");
    // English first: the server's own text, verbatim.
    expect(area.textContent).toBe(ref.text);

    I18n().setLang("ko");
    const ko = area.textContent;
    expect(ko).toMatch(HANGUL);
    expect(ko).not.toBe(ref.text);
    expect(ko).toContain("밥");
    expect(ko).not.toMatch(/\{\w+/); // no unresolved placeholder

    I18n().setLang("en");
    expect(area.textContent).toBe(ref.text);
  });

  test("the transcript modal re-renders every stored line on switch", () => {
    startGame();
    const a = msg("narr.nightFalls");
    const b = msg("narr.dayBreaks");
    // BOTH lines in ONE frame on purpose: a night→day phase_change would defer
    // applyPhaseChange behind the ~6.3s dawn suspense overlay, so the second
    // line would not be in the transcript yet when this test asserts.
    serverSays({
      type: "phase_change", phase: "day", round: 1,
      messages: [a.text, b.text], messageRefs: [a, b],
    });

    document.getElementById("btn-transcript").click();
    const list = document.getElementById("transcript-list");
    expect(list.textContent).toContain(a.text);
    expect(list.textContent).toContain(b.text);

    I18n().setLang("ko");
    // The modal is open, so the switch repaints it in place.
    expect(list.textContent).toMatch(HANGUL);
    expect(list.textContent).not.toContain(a.text);
    expect(list.querySelectorAll(".transcript-line").length).toBe(2);

    I18n().setLang("en");
    expect(list.textContent).toContain(a.text);
    expect(list.textContent).toContain(b.text);
  });

  test("a legacy frame with no messageRefs still renders (fallback path)", () => {
    startGame();
    serverSays({ type: "phase_change", phase: "day", round: 1, messages: ["PLAIN LEGACY LINE"] });
    const area = document.getElementById("narrator-messages");
    expect(area.textContent).toBe("PLAIN LEGACY LINE");
    // No key to translate → the English text survives the switch untouched.
    I18n().setLang("ko");
    expect(area.textContent).toBe("PLAIN LEGACY LINE");
  });

  test("the phase pill and event log localize", () => {
    startGame();
    serverSays({
      type: "phase_change", phase: "day", round: 3, messages: [],
      events: [{ round: 3, type: "death", playerName: "밥" }],
    });
    I18n().setLang("ko");
    expect(document.getElementById("phase-indicator").textContent).toMatch(HANGUL);
    const log = document.getElementById("event-history-list").textContent;
    expect(log).toMatch(HANGUL);
    expect(log).toContain("밥");
    expect(log).not.toContain("Died in the night");
  });
});

describe("josa (particle) selection in real Korean templates", () => {
  test("a batchim name and a vowel-final name take different particles", () => {
    I18n().setLang("ko");
    // 밥 ends in a consonant, 사과 does not — any template using a josa token on
    // {name} must therefore produce two DIFFERENT strings.
    const withBatchim = I18n().t("narr.nightDeath.single", { name: "밥" }, 0);
    const withVowel = I18n().t("narr.nightDeath.single", { name: "사과" }, 0);
    expect(withBatchim).toMatch(HANGUL);
    expect(withVowel).toMatch(HANGUL);
    expect(withBatchim.replace("밥", "")).not.toBe(withVowel.replace("사과", ""));
  });

  test("no Korean template hardcodes a particle straight after a placeholder", () => {
    // "{name}은" would be wrong for a vowel-final name; the josa token
    // "{name:은는}" must be used instead. This is the most common defect.
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(KO)) {
      if (key.startsWith("$")) continue;
      for (const s of Array.isArray(value) ? value : [value]) {
        const m = s.match(/\{\w+\}(?:은|는|이|가|을|를|와|과|아|야)(?![\w가-힣])/g);
        if (m) offenders.push(`${key}: ${m.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every Korean josa token is one the runtime knows", () => {
    const KNOWN = new Set(["이가", "은는", "을를", "과와", "아야", "으로로", "list", "word"]);
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(KO)) {
      if (key.startsWith("$")) continue;
      for (const s of Array.isArray(value) ? value : [value]) {
        for (const m of s.matchAll(/\{\w+:([^}]+)\}/g)) {
          if (!KNOWN.has(m[1]!)) offenders.push(`${key}: {…:${m[1]}}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Korean list joining renders both the 2-name and 3-name shapes", () => {
    I18n().setLang("ko");
    const two = I18n().joinList(["밥", "사과"]);
    const three = I18n().joinList(["밥", "사과", "물"]);
    for (const s of [two, three]) {
      expect(s).toMatch(HANGUL);
      expect(s).not.toMatch(/\{\w+/);
    }
    expect(two).toContain("밥");
    expect(two).toContain("사과");
    for (const n of ["밥", "사과", "물"]) expect(three).toContain(n);
    // Order is the caller's (the server sorts to hide kill order) — never re-sorted.
    expect(three.indexOf("밥")).toBeLessThan(three.indexOf("사과"));
  });

  test("the multi-death dawn line renders Korean with a counted list", () => {
    I18n().setLang("ko");
    const rendered = I18n().t("narr.nightDeath.many", { names: ["밥", "사과", "물"], count: 3 }, 0);
    expect(rendered).toMatch(HANGUL);
    expect(rendered).not.toMatch(/\{\w+/);
    for (const n of ["밥", "사과", "물"]) expect(rendered).toContain(n);
  });
});

describe("Korean pools stay deterministic and complete", () => {
  test("every Korean pool resolves for any seed with no leftover placeholder", () => {
    I18n().setLang("ko");
    const offenders: string[] = [];
    for (const key of Object.keys(KO)) {
      if (key.startsWith("$")) continue;
      for (let seed = 0; seed < 7; seed++) {
        // Every param name any template may reference, so a leftover
        // "{placeholder}" can only mean a real defect in the translation.
        const out = I18n().t(key, {
          name: "밥", accuser: "밥", target: "사과", seconder: "물", voter: "밥",
          a: "밥", b: "사과", names: ["밥", "사과"], count: 2,
          from: 3, to: 2, locked: 1, total: 2, cast: 1, n: 1,
          verdict: "마피아", label: "죽음", role: "의사", mode: "공식",
        }, seed);
        if (/\{\w+/.test(out)) offenders.push(`${key} (seed ${seed}): ${out}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Korean narrator variant selection is deterministic per seed", () => {
    I18n().setLang("ko");
    for (const seed of [0, 1, 5, 99]) {
      expect(I18n().t("narr.noKill", null, seed)).toBe(I18n().t("narr.noKill", null, seed));
    }
  });

  test("pools are TRIMMED for ko v1 but never empty (2+ where English has 2+)", () => {
    const thin: string[] = [];
    for (const [key, value] of Object.entries(KO)) {
      if (key.startsWith("$")) continue;
      if (!Array.isArray(value)) continue;
      if (value.length < 2 && key.startsWith("narr.")) thin.push(key);
    }
    expect(thin).toEqual([]);
  });
});
