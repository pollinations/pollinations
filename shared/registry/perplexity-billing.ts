import type { BillingRules, PerplexitySearchContextSize } from "./registry";

function createPerplexitySearchBilling(
    id: string,
    description: string,
    defaultSearchContextSize: PerplexitySearchContextSize,
    unitCostsBySearchContextSize: Record<PerplexitySearchContextSize, number>,
): BillingRules {
    return {
        adjustments: [
            {
                id,
                description,
                kind: "search_request",
                unit: "request",
                count: "perplexityRequest",
                unitCost:
                    unitCostsBySearchContextSize[defaultSearchContextSize],
                unitCostsBySearchContextSize,
                providerReportedUnitCost: "perplexityUsageCostRequest",
                when: "always",
            },
        ],
    };
}

const SONAR_REQUEST_COSTS = {
    low: 5 / 1000,
    medium: 8 / 1000,
    high: 12 / 1000,
};

const SONAR_PRO_REQUEST_COSTS = {
    low: 6 / 1000,
    medium: 10 / 1000,
    high: 14 / 1000,
};

export const PERPLEXITY_FAST_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_low.search_request.v1",
    "Perplexity Search adds $5 / 1K requests for low search context.",
    "low",
    SONAR_REQUEST_COSTS,
);

export const PERPLEXITY_DEEP_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_high.search_request.v1",
    "Perplexity Search adds $12 / 1K requests for high search context.",
    "high",
    SONAR_REQUEST_COSTS,
);

export const PERPLEXITY_PRO_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_pro_high.search_request.v1",
    "Perplexity Search adds $14 / 1K requests for high search context.",
    "high",
    SONAR_PRO_REQUEST_COSTS,
);

export const PERPLEXITY_REASONING_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_reasoning_high.search_request.v1",
    "Perplexity Search adds $14 / 1K requests for high search context.",
    "high",
    SONAR_PRO_REQUEST_COSTS,
);
