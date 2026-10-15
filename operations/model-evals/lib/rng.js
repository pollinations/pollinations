/** Deterministic PRNG (mulberry32): the same seed always yields the same questions. */
export function createRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Integer in [min, max], inclusive. */
export const randomInt = (rng, min, max) =>
    min + Math.floor(rng() * (max - min + 1));
