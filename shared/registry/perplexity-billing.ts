import type { BillingRules } from "./registry";

function createPerplexitySearchBilling(
    id: string,
    description: string,
    unitCost: number,
): BillingRules {
    return {
        adjustments: [
            {
                id,
                description,
                kind: "search_request",
                unit: "request",
                count: "perplexityRequest",
                unitCost,
                when: "always",
            },
        ],
    };
}

export const PERPLEXITY_FAST_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_low.search_request.v1",
    "Perplexity Search adds $5 / 1K requests for low search context.",
    5 / 1000,
);

export const PERPLEXITY_DEEP_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_high.search_request.v1",
    "Perplexity Search adds $12 / 1K requests for high search context.",
    12 / 1000,
);

export const PERPLEXITY_PRO_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_pro_high.search_request.v1",
    "Perplexity Search adds $14 / 1K requests for high search context.",
    14 / 1000,
);

export const PERPLEXITY_REASONING_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_reasoning_high.search_request.v1",
    "Perplexity Search adds $14 / 1K requests for high search context.",
    14 / 1000,
);
