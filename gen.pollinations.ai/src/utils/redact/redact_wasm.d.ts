/* tslint:disable */
/* eslint-disable */

/**
 * PII detection and anonymization engine (pattern-based, 54 entity types).
 */
export class RedactEngine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Analyze `text` and return a JSON `AnalysisResult` string.
     *
     * Returns `{"error": "..."}` if analysis or serialization fails.
     */
    analyze(text: string): string;
    /**
     * Anonymize `text` with the given strategy and return a JSON `AnalysisResult`
     * string (with `anonymized` populated).
     *
     * `strategy` is one of `replace` or `mask` (case-insensitive).
     *
     * `hash` is rejected here: unsalted hashes of low-entropy PII are enumerable.
     * Call [`Self::anonymize_with_hash`] with a non-empty caller-provided salt instead.
     * `encrypt` is also rejected (no key material in this two-argument binding).
     */
    anonymize(text: string, strategy: string): string;
    /**
     * Anonymize `text` with the hash strategy using a required non-empty `salt`.
     *
     * The salt is caller-provided key material for deterministic pseudonymization.
     * Empty salt is rejected; a random salt is never generated (that would break
     * stable pseudonyms across runs).
     */
    anonymize_with_hash(text: string, salt: string): string;
    /**
     * Create a new engine with the default pattern recognizer.
     */
    constructor();
    /**
     * Return a JSON array of the entity type strings the pattern recognizer detects.
     *
     * Useful for callers to know which entities are available in the WASM build
     * (versus NER-only types like `PERSON`/`ORGANIZATION`/`LOCATION`).
     */
    supported_entities(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_redactengine_free: (a: number, b: number) => void;
    readonly redactengine_analyze: (a: number, b: number, c: number, d: number) => void;
    readonly redactengine_anonymize: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly redactengine_anonymize_with_hash: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly redactengine_new: () => number;
    readonly redactengine_supported_entities: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
