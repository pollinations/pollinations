import type { FallbackMap } from "./merge-fallbacks";

export const MODEL3D_FALLBACKS = {
    "microsoft/trellis-2": {
        "microsoft/trellis-2:fallback": {
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
