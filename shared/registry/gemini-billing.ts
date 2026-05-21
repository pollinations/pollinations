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

function readNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

function readQueryStrings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (query): query is string =>
            typeof query === "string" && query.trim().length > 0,
    );
}

function collectGroundingQueries(output: unknown, queries: Set<string>): void {
    if (Array.isArray(output)) {
        for (const item of output) collectGroundingQueries(item, queries);
        return;
    }

    if (!isRecord(output)) return;

    const groundingMetadata = output.groundingMetadata;
    if (isRecord(groundingMetadata)) {
        for (const query of readQueryStrings(
            groundingMetadata.webSearchQueries,
        )) {
            queries.add(query);
        }
    }

    for (const nestedKey of ["message", "delta", "streamEvents"] as const) {
        const nested = output[nestedKey];
        collectGroundingQueries(nested, queries);
    }

    const choices = output.choices;
    if (Array.isArray(choices)) {
        for (const choice of choices) collectGroundingQueries(choice, queries);
    }
}

export function getGeminiGroundingWebSearchQueries(output: unknown): string[] {
    const queries = new Set<string>();
    collectGroundingQueries(output, queries);
    return Array.from(queries);
}

export function getGeminiGroundingWebSearchQueryCount(output: unknown): number {
    if (isRecord(output) && isRecord(output.grounding)) {
        const explicitCount = readNumber(output.grounding.webSearchQueryCount);
        if (explicitCount !== undefined) return explicitCount;
    }

    return getGeminiGroundingWebSearchQueries(output).length;
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
