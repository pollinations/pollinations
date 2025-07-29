export const MODELS = {
    // "flux-realism": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "flux-cablyai": { type: "meoow-2", enhance: false, maxSideLength: 1384 },
    // "flux-anime": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "flux-3d": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "any-dark": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "flux-pro": { type: "meoow-2", enhance:  false, maxSideLength: 1512 },

    flux: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 1280,
    },

    // Flux Kontext general purpose model
    kontext: {
        type: "kontext",
        enhance: true,
        maxSideLength: 640,
        tier: "seed",
    },

    // Assuming 'turbo' is of type 'sd'
    turbo: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
    },

    // // Azure GPT Image model
    // gptimage: {
    //     type: "azure",
    //     enhance: false,
    //     maxSideLength: 1024,
    //     tier: "flower",
    // },
} as const;
