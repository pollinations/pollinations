/**
 * Deterministic randomness for the weekly evals.
 *
 * Every run derives its puzzles from one run seed, so the numbers change from
 * week to week while `--seed <n>` still reproduces an earlier quiz exactly.
 */

const UINT32 = 4294967296;
const MAX_SEED = 2147483647;

/** FNV-1a over the string form of every part, folded into a positive int31. */
export function hashSeed(...parts: (string | number)[]): number {
    let hash = 2166136261;
    for (const part of parts) {
        const text = String(part);
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
    }
    return (hash >>> 0) % MAX_SEED || 1;
}

/** mulberry32: tiny, fast, and stable across Node versions. */
export function rngFrom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / UINT32;
    };
}

export function randomInt(rng: () => number, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
    return items[Math.floor(rng() * items.length) % items.length];
}

/**
 * Request seed for one (run, model, question) triple.
 *
 * gen.pollinations.ai caches responses by request body across all users, so two
 * runs of the same puzzle would otherwise be served the same cached answer. The
 * seed is part of the body, which gives every request its own cache entry while
 * staying reproducible.
 */
export function requestSeed(
    runSeed: number,
    model: string,
    questionId: string,
    attempt = 1,
): number {
    return hashSeed(runSeed, model, questionId, attempt);
}
