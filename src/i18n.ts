// Server-side i18n: builds the additive { key, params, seed } reference that
// rides beside every narrator string on the wire, and renders the ENGLISH `text`
// from the same templates the client uses.
//
// The server never learns a client's language. It ships one seed; each client
// resolves `pool[seed % pool.length]` in its own language, so pool sizes may
// differ per language. Server LOGS stay English (they render through here).
//
// The runtime is the very same public/i18n.js the browser loads — imported, not
// reimplemented, so the template engine, the josa table and the seed mixer can
// never drift between the two sides.

import EN from "../public/i18n/en.json";
// public/i18n.js is a dual-mode script: `module.exports` under Bun, a global in
// the browser. The default import is its API object.
import I18nRuntime from "../public/i18n.js";

type Primitive = string | number | string[];
export type MsgParams = Record<string, Primitive>;

/** The additive wire reference. `text` is the rendered English fallback. */
export interface MsgRef {
  text: string;
  key: string;
  params?: MsgParams;
  seed: number;
}

interface Runtime {
  setBundle(lang: string, data: unknown): void;
  t(key: string, params?: MsgParams | null, seed?: number): string;
  has(key: string): boolean;
  pool(key: string): string[];
  lang(): string;
}

const I18n = I18nRuntime as unknown as Runtime;

// English is the server's only bundle: it renders `text` and nothing else.
I18n.setBundle("en", stripComments(EN as Record<string, unknown>));

/** Drop `$`-prefixed keys: they are translator notes, never renderable strings. */
function stripComments(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("$")) continue;
    out[k] = v;
  }
  return out;
}

/** A fresh non-negative seed. One per message; drives every variant in it. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * Build a message reference: renders the English `text` and attaches the
 * key/params/seed a translated client re-renders from.
 *
 * Callers pass `seed` only in tests (determinism assertions).
 */
export function msg(key: string, params?: MsgParams, seed?: number): MsgRef {
  const s = seed === undefined ? newSeed() : seed;
  const text = I18n.t(key, params ?? null, s);
  return params && Object.keys(params).length > 0
    ? { text, key, params, seed: s }
    : { text, key, seed: s };
}

/** Render `key` in English. Used for server logs and non-wire strings. */
export function en(key: string, params?: MsgParams, seed?: number): string {
  return I18n.t(key, params ?? null, seed ?? 0);
}

/**
 * A narrator message channel: the rendered English strings PLUS their wire
 * references, kept parallel BY INDEX.
 *
 * `messages` is unchanged from before this branch — same type, same contents, so
 * every existing reader and assertion is untouched. `refs` is the additive half:
 * `refs[i]` describes `messages[i]`, and the server ships it as `messageRefs`
 * beside the existing `messages` array. Anything that pushes into `messages`
 * MUST go through pushLine so the two never fall out of step.
 */
export interface LineSink {
  messages: string[];
  refs: MsgRef[];
}

/** Append a message to a sink, keeping `messages` and `refs` index-aligned. */
export function pushLine(sink: LineSink, m: MsgRef): void {
  sink.messages.push(m.text);
  sink.refs.push(m);
}

/** Append every line of `from` to `into`, preserving order and alignment. */
export function pushLines(into: LineSink, from: LineSink): void {
  for (let i = 0; i < from.messages.length; i++) {
    into.messages.push(from.messages[i]!);
    into.refs.push(from.refs[i]!);
  }
}

/** A fresh empty sink. */
export function newSink(): LineSink {
  return { messages: [], refs: [] };
}

/** True when `key` exists in en.json (completeness tests read this). */
export function hasKey(key: string): boolean {
  return I18n.has(key);
}

/** The English variant pool for `key` (tests assert pool membership). */
export function poolFor(key: string): string[] {
  return I18n.pool(key);
}

/** Every key defined in en.json, `$comment` excluded. */
export function englishKeys(): string[] {
  return Object.keys(stripComments(EN as Record<string, unknown>));
}

export { I18n as runtime };
