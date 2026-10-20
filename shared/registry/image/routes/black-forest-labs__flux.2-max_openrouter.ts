import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "black-forest-labs/flux.2-max:openrouter";
export const parent = "black-forest-labs/flux.2-max";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-09-13").getTime(),
    // OpenRouter (BFL's own "black-forest-labs/us-3" deployment). The
    // handler records OpenRouter's reported usage.cost (plus the
    // 5.5% credit fee, #14895) as this route's cost, since BFL bills
    // tiered megapixels of the size it picks. These rates only
    // describe the route: $0.07 per output megapixel with the fee,
    // no input charge, no execution fee.
    cost: {
        promptImageTokens: 0,
        completionImageTokens: 0.07 * 1.055,
    },
    billing: {
        adjustments: [],
    },
} satisfies FallbackDefinition;
