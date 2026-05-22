import { perMillion } from "./price-helpers";
import type { CostCalculator, CostDefinition, Usage } from "./registry";

type GeminiGroundingMode = "perPrompt" | "perQuery";

type GeminiCostCalculatorOptions = {
    grounding: {
        mode: GeminiGroundingMode;
        costPerUnit: number;
    };
    longContext?: {
        thresholdTokens: number;
        cost: CostDefinition;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function getOutputEvents(output: unknown): unknown[] {
    if (!isRecord(output)) return [];
    return Array.isArray(output.streamEvents) ? output.streamEvents : [output];
}

function getGeminiGroundingWebSearchQueryCount(output: unknown): number {
    const queries = new Set<string>();
    for (const event of getOutputEvents(output)) {
        if (!isRecord(event) || !Array.isArray(event.choices)) continue;
        for (const choice of event.choices) {
            if (!isRecord(choice) || !isRecord(choice.groundingMetadata)) {
                continue;
            }
            const webSearchQueries = choice.groundingMetadata.webSearchQueries;
            if (!Array.isArray(webSearchQueries)) continue;
            for (const query of webSearchQueries) {
                if (typeof query === "string" && query.trim()) {
                    queries.add(query);
                }
            }
        }
    }
    return queries.size;
}

function getPromptTokenCount(usage: Usage): number {
    return (
        (usage.promptTextTokens ?? 0) +
        (usage.promptCachedTokens ?? 0) +
        (usage.promptAudioTokens ?? 0) +
        (usage.promptImageTokens ?? 0) +
        (usage.promptVideoTokens ?? 0)
    );
}

export function createGeminiCostCalculator({
    grounding,
    longContext,
}: GeminiCostCalculatorOptions): CostCalculator {
    return ({ usage, output, model, linearCost }) => {
        const promptTokens = getPromptTokenCount(usage);
        const costDefinition =
            longContext && promptTokens > longContext.thresholdTokens
                ? { ...model.cost, ...longContext.cost }
                : model.cost;
        const usageCost = linearCost(costDefinition);
        const queryCount = getGeminiGroundingWebSearchQueryCount(output);
        const groundingUnits =
            grounding.mode === "perPrompt"
                ? queryCount > 0
                    ? 1
                    : 0
                : queryCount;

        if (groundingUnits === 0) return usageCost;

        return {
            ...usageCost,
            totalCost:
                usageCost.totalCost + groundingUnits * grounding.costPerUnit,
        };
    };
}

export const GEMINI_25_GROUNDING_COST_PER_PROMPT = 35 / 1000;
export const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;

export const GEMINI_3_1_PRO_LONG_CONTEXT_COST: CostDefinition = {
    promptTextTokens: perMillion(4.0),
    promptCachedTokens: perMillion(0.4),
    promptAudioTokens: perMillion(4.0),
    promptImageTokens: perMillion(4.0),
    promptVideoTokens: perMillion(4.0),
    completionTextTokens: perMillion(18.0),
};
