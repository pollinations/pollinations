import type { BillingPolicy } from "./registry";

function createPerplexitySearchPolicy(
    id: string,
    description: string,
    unitCost: number,
): BillingPolicy {
    return {
        id,
        description,
        adjustments: [
            {
                id,
                description,
                kind: "search_request",
                unit: "request",
                unitCost,
                when: "always",
            },
        ],
        calculateCost: ({ linearCost }) => linearCost(),
    };
}

export const perplexityFastBillingPolicy = createPerplexitySearchPolicy(
    "perplexity.sonar_low.search_request.v1",
    "Adds Perplexity Search at $5 / 1K requests for low search context.",
    5 / 1000,
);

export const perplexityDeepBillingPolicy = createPerplexitySearchPolicy(
    "perplexity.sonar_high.search_request.v1",
    "Adds Perplexity Search at $12 / 1K requests for high search context.",
    12 / 1000,
);

export const perplexityProBillingPolicy = createPerplexitySearchPolicy(
    "perplexity.sonar_pro_high.search_request.v1",
    "Adds Perplexity Search at $14 / 1K requests for high search context.",
    14 / 1000,
);

export const perplexityReasoningBillingPolicy = createPerplexitySearchPolicy(
    "perplexity.sonar_reasoning_high.search_request.v1",
    "Adds Perplexity Search at $14 / 1K requests for high search context.",
    14 / 1000,
);
