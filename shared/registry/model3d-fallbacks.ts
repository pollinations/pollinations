import type { FallbackMap } from "./merge-fallbacks";

export const MODEL3D_FALLBACKS = {
    "trellis-2": {
        "trellis-2-fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                completionImageTokens: 0.25,
            },
            costVariants: {
                medium: { completionImageTokens: 0.3 },
                high: { completionImageTokens: 0.35 },
            },
        },
    },
} as const satisfies FallbackMap;
