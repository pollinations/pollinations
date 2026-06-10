import type {
    BillingRules,
    PriceMultiplierContext,
    PriceMultiplierFunctor,
} from "./registry";

// Trust a provider-reported unit cost only up to this multiple of the static
// registry fee — a malformed or hostile value beyond it bills the static fee.
const PROVIDER_UNIT_COST_MAX_RATIO = 10;

type PerplexityCostOutput = {
    usage?: {
        cost?: {
            request_cost?: unknown;
        };
    };
    streamEvents?: unknown[];
};

function asProviderUnitCost(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return undefined;
    }
    return value;
}

function getPerplexityReportedRequestCost(output: unknown): number | undefined {
    const o = output as PerplexityCostOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);

    for (const event of [...events].reverse()) {
        const requestCost = (event as PerplexityCostOutput | undefined)?.usage
            ?.cost?.request_cost;
        const unitCost = asProviderUnitCost(requestCost);
        if (unitCost !== undefined) return unitCost;
    }

    return undefined;
}

function getPerplexityRequestCost(
    output: PriceMultiplierContext["output"],
    staticUnitCost: number,
): number {
    const reported = getPerplexityReportedRequestCost(output);
    if (
        reported !== undefined &&
        reported <= staticUnitCost * PROVIDER_UNIT_COST_MAX_RATIO
    ) {
        return reported;
    }
    return staticUnitCost;
}

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
                providerReportedUnitCost: "perplexityUsageCostRequest",
                when: "always",
            },
        ],
    };
}

function createPerplexitySearchPriceMultiplier(
    id: string,
    description: string,
    unitCost: number,
): PriceMultiplierFunctor {
    return {
        multiplier: 1,
        description:
            "Uses 1x token pricing and adds the Perplexity search request fee, preferring bounded provider-reported usage.cost.request_cost when present.",
        billing: createPerplexitySearchBilling(id, description, unitCost),
        apply: ({ output }) => ({
            costAdjustment: getPerplexityRequestCost(output, unitCost),
        }),
    };
}

export const PERPLEXITY_FAST_PRICE_MULTIPLIER =
    createPerplexitySearchPriceMultiplier(
        "perplexity.sonar_low.search_request.v1",
        "Perplexity Search adds $5 / 1K requests for low search context.",
        5 / 1000,
    );

export const PERPLEXITY_DEEP_PRICE_MULTIPLIER =
    createPerplexitySearchPriceMultiplier(
        "perplexity.sonar_high.search_request.v1",
        "Perplexity Search adds $12 / 1K requests for high search context.",
        12 / 1000,
    );

export const PERPLEXITY_PRO_PRICE_MULTIPLIER =
    createPerplexitySearchPriceMultiplier(
        "perplexity.sonar_pro_high.search_request.v1",
        "Perplexity Search adds $14 / 1K requests for high search context.",
        14 / 1000,
    );

export const PERPLEXITY_REASONING_PRICE_MULTIPLIER =
    createPerplexitySearchPriceMultiplier(
        "perplexity.sonar_reasoning_high.search_request.v1",
        "Perplexity Search adds $14 / 1K requests for high search context.",
        14 / 1000,
    );
