// Types for the dual-mode i18n runtime in public/i18n.js.
//
// public/ is outside tsconfig's `include`, but TypeScript still resolves a
// sibling .d.ts for an imported .js module — so src/i18n.ts and the tests get
// real types (and `bun run typecheck` stays clean for src/, which was already
// error-free before this branch).

export type I18nParamValue = string | number | string[] | null | undefined;
export type I18nParams = Record<string, I18nParamValue>;

/** A server message reference as it appears on the wire, plus its English text. */
export interface I18nMessageRef {
  text?: string;
  key?: string;
  params?: I18nParams;
  seed?: number;
}

export interface I18nBatchimInfo {
  /** The last character is a Hangul syllable. */
  hangul: boolean;
  /** That syllable has a final consonant. */
  batchim: boolean;
  /** That final consonant is ㄹ (the 으로/로 exception). */
  rieul: boolean;
}

export interface I18nRuntime {
  readonly DEFAULT_LANG: string;

  /** Install a language bundle: flat key → template or variant pool. */
  setBundle(lang: string, data: Record<string, string | string[]>): void;
  hasBundle(lang: string): boolean;
  languages(): string[];

  /** The active language code. */
  lang(): string;
  /** Switch language (unknown codes fall back to English) and notify listeners. */
  setLang(lang: string): string;
  onChange(fn: (lang: string) => void): void;

  /** Render `key`; `seed` picks a variant when the key holds a pool. */
  t(key: string, params?: I18nParams | null, seed?: number): string;
  /** Render sub-pool slot `slot` of the same message seed. */
  tSlot(key: string, seed: number, slot: number, params?: I18nParams | null): string;
  /** Render a wire message reference (or pass a plain string through). */
  renderMessage(msg: I18nMessageRef | string | null | undefined): string;

  has(key: string): boolean;
  /** The variant pool for `key` (a single template becomes a 1-element array). */
  pool(key: string): string[];

  fill(template: string, params?: I18nParams | null): string;
  /** The Korean particle for `value` given a pair token such as "이가". */
  josa(value: unknown, token: string): string;
  batchimInfo(value: unknown): I18nBatchimInfo;
  joinList(items: unknown[]): string;
  numberWord(n: number): string;

  /** Deterministic in-range index for (seed, slot). */
  pickIndex(seed: number | undefined, length: number, slot?: number): number;
  mix(seed: number, slot: number): number;

  readonly _bundles: Record<string, Record<string, string | string[]>>;
}

declare const I18n: I18nRuntime;
export default I18n;
