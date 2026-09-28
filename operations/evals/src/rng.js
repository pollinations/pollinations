// Deterministic RNG + per-run seeds.
//
// gen.pollinations.ai caches text responses by request body across all users,
// so a fixed seed would return cached answers. Every run therefore draws a
// fresh random seed, and repeats within a run vary it too. The seed is printed
// so a run is reproducible from its report.

/** Small, fast, seeded PRNG (mulberry32). */
export function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    };
}

// The API rejects seeds outside the signed 32-bit range (a uint32 seed returns
// "JSON body validation failed"), so every seed we send is kept in [0, 2^31).
const SEED_MAX = 0x7fffffff;

/** Random int in [min, max] using the platform CSPRNG. */
function randomInt(min, max) {
    const float = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    return min + Math.floor(float * (max - min + 1));
}

/** A fresh run seed (unless an explicit one is given), in [1, 2^31). */
export function runSeed(explicit) {
    if (explicit !== undefined) return clampSeed(Number(explicit));
    return randomInt(1, SEED_MAX);
}

/** Per-repeat seed derived from the run seed: keeps each request uncached. */
export function repeatSeed(seed, index) {
    return clampSeed(seed + Math.imul(index, 0x9e3779b1));
}

export function clampSeed(n) {
    return (((n | 0) % SEED_MAX) + SEED_MAX) % SEED_MAX;
}
