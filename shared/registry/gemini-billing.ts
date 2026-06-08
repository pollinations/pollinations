import { perMillion } from "./price-helpers";
import type {
    BillingPolicy,
    BillingPolicyInput,
    CostDefinition,
    Usage,
} from "./registry";

type GeminiLongContextCost = {
    thresholdTokens: number;
    cost: CostDefinition;
};

// Worker hands over either parsed JSON (`{ choices: [...] }`) or a stitched
// stream (`{ streamEvents: [event, ...] }`). Anything else is treated as empty.
type GroundedOutput = {
    choices?: { groundingMetadata?: { webSearchQueries?: string[] } }[];
    streamEvents?: GroundedOutput[];
};

function getGeminiGroundingWebSearchQueryCount(output: unknown): number {
    const o = output as GroundedOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    // Dedup across stream chunks — Vertex repeats groundingMetadata in deltas.
    const queries = new Set<string>();
    for (const event of events) {
        for (const choice of event.choices ?? []) {
            for (const q of choice.groundingMetadata?.webSearchQueries ?? []) {
                if (q?.trim()) queries.add(q);
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

function calculateGeminiCost(
    { usage, model, linearCost }: BillingPolicyInput,
    extraCost = 0,
    longContext?: GeminiLongContextCost,
) {
    const promptTokens = getPromptTokenCount(usage);
    const costDefinition =
        longContext && promptTokens > longContext.thresholdTokens
            ? { ...model.cost, ...longContext.cost }
            : model.cost;
    const usageCost = linearCost(costDefinition);

    if (extraCost === 0) return usageCost;

    return {
        ...usageCost,
        totalCost: usageCost.totalCost + extraCost,
    };
}

const GEMINI_25_GROUNDING_COST_PER_PROMPT = 35 / 1000;
const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;

export const geminiGroundedPromptBillingPolicy: BillingPolicy = {
    id: "google.gemini_2.grounded_prompt.v1",
    description:
        "Adds Google Search grounding at $35 / 1K grounded prompts when grounding metadata is present.",
    calculateCost: (input) =>
        calculateGeminiCost(
            input,
            getGeminiGroundingWebSearchQueryCount(input.output) > 0
                ? GEMINI_25_GROUNDING_COST_PER_PROMPT
                : 0,
        ),
};

export const geminiSearchQueryBillingPolicy: BillingPolicy = {
    id: "google.gemini_3.search_query.v1",
    description:
        "Adds Google Search grounding at $14 / 1K search queries when grounding metadata is present.",
    calculateCost: (input) =>
        calculateGeminiCost(
            input,
            getGeminiGroundingWebSearchQueryCount(input.output) *
                GEMINI_3_GROUNDING_COST_PER_QUERY,
        ),
};

const GEMINI_3_1_PRO_LONG_CONTEXT: GeminiLongContextCost = {
    thresholdTokens: 200_000,
    cost: {
        promptTextTokens: perMillion(4.0),
        promptCachedTokens: perMillion(0.4),
        promptAudioTokens: perMillion(4.0),
        promptImageTokens: perMillion(4.0),
        promptVideoTokens: perMillion(4.0),
        completionTextTokens: perMillion(18.0),
    },
};

export const gemini31ProBillingPolicy: BillingPolicy = {
    id: "google.gemini_3_1_pro.dynamic.v1",
    description:
        "Uses Gemini long-context rates above 200K prompt tokens and adds Google Search grounding at $14 / 1K search queries when grounding metadata is present.",
    calculateCost: (input) =>
        calculateGeminiCost(
            input,
            getGeminiGroundingWebSearchQueryCount(input.output) *
                GEMINI_3_GROUNDING_COST_PER_QUERY,
            GEMINI_3_1_PRO_LONG_CONTEXT,
        ),
};
