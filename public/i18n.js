// ============================================================================
// i18n RUNTIME — shared by the browser client and the Bun server.
// ----------------------------------------------------------------------------
// Dual-mode module: in a browser it attaches `I18n` to the global scope (loaded
// as a classic <script> before app.js, exactly like pixel-art.js); under Bun /
// CommonJS it also sets `module.exports`, so src/i18n.ts imports THE SAME
// implementation the client runs. There is deliberately no second copy of the
// template engine, the josa table or the seed mixer — a server/client drift in
// any of them would silently desync the rendered text from the wire `text`.
//
// DATA is not baked in here. Callers install language bundles via
// I18n.setBundle(lang, data):
//   - browser: public/i18n/bundles.js (generated from the JSON, loaded as a
//     classic script so English is available SYNCHRONOUSLY — the client test
//     harness stubs fetch() to never resolve, and index.html's own English text
//     must never depend on a network round-trip)
//   - server:  src/i18n.ts imports public/i18n/en.json directly
//
// A bundle value is either a STRING (one template) or an ARRAY of strings (a
// variant pool). Pool sizes may differ per language — the wire carries a `seed`,
// never an index, so `seed % pool.length` resolves independently per language.
// ============================================================================
(function () {
  "use strict";

  var DEFAULT_LANG = "en";

  // lang -> flat { key: string | string[] }
  var bundles = Object.create(null);
  var lang = DEFAULT_LANG;
  var listeners = [];

  // ── Korean josa (particle) selection ──────────────────────────────────────
  // Templates write `{name:이가}`: the TOKEN is always the batchim-form followed
  // by the no-batchim form, so `이가` = 이 (after a final consonant) / 가 (after
  // a vowel). The table is explicit rather than "split the token in half"
  // because 으로/로 is not a 1+1 split.
  var JOSA = {
    "이가": ["이", "가"],
    "은는": ["은", "는"],
    "을를": ["을", "를"],
    "과와": ["과", "와"],
    "아야": ["아", "야"],
    "으로로": ["으로", "로"],
  };

  var HANGUL_FIRST = 0xac00; // 가
  var HANGUL_LAST = 0xd7a3;  // 힣

  /**
   * Batchim (final-consonant) analysis of a word's LAST character.
   * Returns { hangul, batchim, rieul }.
   *
   * Per the approved design: a value whose last character is NOT a Hangul
   * syllable (Latin name, digit, punctuation, emoji) takes the NO-BATCHIM form.
   * Player names are user input and are never transliterated, so guessing the
   * Korean reading of "Bob" is out of scope for v1.
   */
  function batchimInfo(value) {
    var s = String(value == null ? "" : value);
    if (!s.length) return { hangul: false, batchim: false, rieul: false };
    var code = s.charCodeAt(s.length - 1);
    if (code < HANGUL_FIRST || code > HANGUL_LAST) {
      return { hangul: false, batchim: false, rieul: false };
    }
    var jong = (code - HANGUL_FIRST) % 28; // 0 = no final consonant
    return { hangul: true, batchim: jong !== 0, rieul: jong === 8 /* ㄹ */ };
  }

  /**
   * Pick the particle `token` (e.g. "이가") for `value`.
   * 으로/로: a ㄹ-final syllable takes 로, not 으로 — the one irregular case.
   */
  function josa(value, token) {
    var pair = JOSA[token];
    if (!pair) return "";
    var info = batchimInfo(value);
    if (token === "으로로") return info.batchim && !info.rieul ? pair[0] : pair[1];
    return info.batchim ? pair[0] : pair[1];
  }

  // ── Deterministic variant selection ──────────────────────────────────────
  // The server sends ONE non-negative integer `seed` per message. The primary
  // variant is `pool[seed % pool.length]`. Composite lines (e.g. the doctor save,
  // which also picks a save method and a location) derive each extra slot from
  // the same seed through `mix`, so one wire field drives every choice and each
  // language may size each pool differently.
  function mix(seed, slot) {
    var h = (seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function pickIndex(seed, length, slot) {
    if (!(length > 0)) return 0;
    var s = typeof seed === "number" && isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
    var v = slot ? mix(s, slot) : s;
    return v % length;
  }

  // ── Bundle access ────────────────────────────────────────────────────────
  function setBundle(name, data) {
    bundles[name] = data || Object.create(null);
  }

  function hasBundle(name) {
    return Object.prototype.hasOwnProperty.call(bundles, name);
  }

  /** Raw bundle value for `key` in `name`, or undefined. */
  function rawIn(name, key) {
    var b = bundles[name];
    if (!b) return undefined;
    return Object.prototype.hasOwnProperty.call(b, key) ? b[key] : undefined;
  }

  /** Raw value for `key`: active language first, then the English fallback. */
  function raw(key) {
    var v = rawIn(lang, key);
    if (v === undefined && lang !== DEFAULT_LANG) v = rawIn(DEFAULT_LANG, key);
    return v;
  }

  function has(key) {
    return raw(key) !== undefined;
  }

  /** The variant pool for `key` as an array (a single template becomes [t]). */
  function pool(key) {
    var v = raw(key);
    if (v === undefined) return [];
    return Array.isArray(v) ? v : [v];
  }

  /** Template for `key`, choosing a pool variant with `seed` (slot 0). */
  function template(key, seed) {
    var p = pool(key);
    if (p.length === 0) return null;
    return p[pickIndex(seed, p.length, 0)];
  }

  // ── Interpolation ────────────────────────────────────────────────────────
  // Placeholder grammar (single left-to-right pass, so a substituted value can
  // never be re-expanded — a player literally named "{name}" stays literal):
  //   {key}        the param, stringified
  //   {key:이가}    the param + its Korean particle
  //   {key:list}   an ARRAY param joined with this language's list rules
  //   {key:word}   a NUMBER param as this language's number word
  // An unknown param name or formatter is left in place untouched, which makes a
  // typo visible in tests instead of silently rendering an empty string.
  var PLACEHOLDER_SRC = "\\{(\\w+)(?::([^}]+))?\\}";
  // A FRESH regex per call: fill() can nest (a {x:list} value is itself filled
  // through the list templates), and a shared /g regex's lastIndex would be a
  // re-entrancy hazard.
  function placeholderRe() {
    return new RegExp(PLACEHOLDER_SRC, "g");
  }

  function fill(tmpl, params) {
    if (typeof tmpl !== "string") return "";
    var p = params || {};
    return tmpl.replace(placeholderRe(), function (match, name, fmt) {
      if (!Object.prototype.hasOwnProperty.call(p, name)) return match;
      var value = p[name];
      if (!fmt) return stringify(value);
      if (fmt === "list") return Array.isArray(value) ? joinList(value) : stringify(value);
      if (fmt === "word") return numberWord(value);
      if (Object.prototype.hasOwnProperty.call(JOSA, fmt)) {
        return stringify(value) + josa(value, fmt);
      }
      return match;
    });
  }

  function stringify(value) {
    return value == null ? "" : String(value);
  }

  /**
   * Locale list join, driven by three bundle keys so each language owns its
   * own conjunction:
   *   list.sep  separator between all but the last item  ("A, B")
   *   list.two  the exactly-two form                     ("A and B" / "A와 B")
   *   list.end  head + final item for 3+                 ("A, B, and C")
   * The ARRAY ORDER is the caller's: the server hands over an alphabetically
   * sorted list on purpose (kill order must not be inferable), so nothing here
   * may re-sort.
   */
  function joinList(items) {
    var xs = items.map(stringify);
    if (xs.length === 0) return "";
    if (xs.length === 1) return xs[0];
    if (xs.length === 2) return fill(templateOr("list.two", "{a} and {b}"), { a: xs[0], b: xs[1] });
    var sep = templateOr("list.sep", ", ");
    var head = xs.slice(0, -1).join(sep);
    return fill(templateOr("list.end", "{a}, and {b}"), { a: head, b: xs[xs.length - 1] });
  }

  function templateOr(key, fallback) {
    var v = raw(key);
    if (v === undefined) return fallback;
    return Array.isArray(v) ? v[0] : v;
  }

  /** Number as a word ("three" / "세"), falling back to the digits. */
  function numberWord(n) {
    var num = Number(n);
    if (!isFinite(num)) return stringify(n);
    var v = raw("num.words");
    if (Array.isArray(v) && num >= 0 && num < v.length) return v[num];
    return String(num);
  }

  // ── Sub-pool placeholders ────────────────────────────────────────────────
  // Some narrator lines are composites: the doctor-save line also picks a save
  // method and a location, the execution line picks an execution style. Those
  // sub-pools must be chosen in the READER's language, so they cannot be
  // resolved into `params` server-side.
  //
  // The convention: a placeholder with NO matching param is looked up as the
  // sub-pool key `<key>.<placeholder>` and its variant is derived from the SAME
  // message seed via a slot number. The slot is the placeholder's position in
  // the template's own alphabetically-sorted set of sub-pool names, so the
  // server and the client agree without the wire carrying anything but `seed`.
  // Net effect: one integer on the wire drives every choice in the sentence.
  function subPoolNames(tmpl, params) {
    var p = params || {};
    var names = [];
    var m;
    var re = placeholderRe();
    while ((m = re.exec(tmpl)) !== null) {
      var name = m[1];
      if (Object.prototype.hasOwnProperty.call(p, name)) continue;
      if (names.indexOf(name) === -1) names.push(name);
    }
    return names.sort();
  }

  // ── Public rendering API ─────────────────────────────────────────────────
  /** Render `key` with `params`. `seed` selects a pool variant (default 0). */
  function t(key, params, seed, _depth) {
    var tmpl = template(key, seed);
    if (tmpl === null) return key; // missing key renders visibly, never blank
    var depth = _depth || 0;
    if (depth < 2) {
      var names = subPoolNames(tmpl, params);
      if (names.length > 0) {
        var merged = {};
        if (params) for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) merged[k] = params[k];
        for (var i = 0; i < names.length; i++) {
          var subKey = key + "." + names[i];
          // Slot 0 is the parent pool; sub-pools start at 1.
          if (has(subKey)) merged[names[i]] = t(subKey, null, mix(normalizeSeed(seed), i + 1), depth + 1);
        }
        return fill(tmpl, merged);
      }
    }
    return fill(tmpl, params);
  }

  function normalizeSeed(seed) {
    return typeof seed === "number" && isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  }

  /** Render a sub-pool variant for slot `slot` of the same message seed. */
  function tSlot(key, seed, slot, params) {
    var p = pool(key);
    if (p.length === 0) return key;
    return fill(p[pickIndex(seed, p.length, slot)], params);
  }

  /**
   * Render a server message reference: `{ text, key, params, seed }`.
   *
   * While the active language is English the server's own `text` wins verbatim.
   * That is not laziness — it makes English output byte-identical to the
   * pre-i18n build by construction, which is what the existing suite asserts.
   * (A separate test proves en.json renders the same string, so the fallback
   * can never mask a broken English template.)
   *
   * A plain string is passed through, so the pre-i18n `messages: string[]` wire
   * shape and any old cached client keep working.
   */
  function renderMessage(msg) {
    if (msg == null) return "";
    if (typeof msg === "string") return msg;
    if (typeof msg !== "object") return String(msg);
    if (lang === DEFAULT_LANG && typeof msg.text === "string") return msg.text;
    if (msg.key && has(msg.key)) return t(msg.key, msg.params, msg.seed);
    return typeof msg.text === "string" ? msg.text : "";
  }

  // ── Language state ──────────────────────────────────────────────────────
  function getLang() {
    return lang;
  }

  /** Switch language and notify subscribers (the client re-renders on this). */
  function setLang(next) {
    var name = hasBundle(next) ? next : DEFAULT_LANG;
    if (name === lang) return lang;
    lang = name;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](lang); } catch (e) { /* one bad subscriber must not block the rest */ }
    }
    return lang;
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  function languages() {
    return Object.keys(bundles);
  }

  var api = {
    DEFAULT_LANG: DEFAULT_LANG,
    setBundle: setBundle,
    hasBundle: hasBundle,
    languages: languages,
    lang: getLang,
    setLang: setLang,
    onChange: onChange,
    t: t,
    tSlot: tSlot,
    renderMessage: renderMessage,
    has: has,
    pool: pool,
    fill: fill,
    josa: josa,
    batchimInfo: batchimInfo,
    joinList: joinList,
    numberWord: numberWord,
    pickIndex: pickIndex,
    mix: mix,
    // Test/tooling handle: the raw bundle map (keys only are ever asserted).
    _bundles: bundles,
  };

  var g = typeof globalThis !== "undefined" ? globalThis : this;
  if (g) g.I18n = api;
  if (typeof window !== "undefined" && window) window.I18n = api;
  if (typeof module !== "undefined" && module && module.exports) module.exports = api;
})();
