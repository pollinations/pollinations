// Small, dependency-free helpers shared by the eval CLI and the tests.

// Deterministic seeded RNG (mulberry32). All question generation and seed
// picking flows through this so a whole run is reproducible from one seed.
export function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Stable string hash (FNV-1a) used to derive per-request seeds from the run
// seed, model and question ids.
export function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function requestSeed(runSeed, ...parts) {
    // The chat-completions schema caps seeds at signed int32, unlike some
    // other endpoints. Keep deterministic hashes within that accepted range.
    return hashString([String(runSeed), ...parts].join("\u0000")) & 0x7fffffff;
}

export function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
