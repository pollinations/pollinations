import { perMillion } from "./price-helpers";
import type {
    BillingRules,
    CostDefinition,
    PriceMultiplierContext,
    PriceMultiplierFunctor,
} from "./registry";

const GEMINI_25_GROUNDING_COST_PER_PROMPT = 35 / 1000;
const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;

const GEMINI_3_1_PRO_LONG_CONTEXT_COST: CostDefinition = {
    promptTextTokens: perMillion(4.0),
    promptCachedTokens: perMillion(0.4),
    promptAudioTokens: perMillion(4.0),
    promptImageTokens: perMillion(4.0),
    promptVideoTokens: perMillion(4.0),
    completionTextTokens: perMillion(18.0),
};

type GroundedOutput = {
    choices?: { groundingMetadata?: { webSearchQueries?: string[] } }[];
    streamEvents?: GroundedOutput[];
};

function getPromptTokenCount(context: PriceMultiplierContext): number {
    const { usage } = context;
    return (
        (usage.promptTextTokens ?? 0) +
        (usage.promptCachedTokens ?? 0) +
        (usage.promptAudioTokens ?? 0) +
        (usage.promptImageTokens ?? 0) +
        (usage.promptVideoTokens ?? 0)
    );
}

function getGeminiGroundingWebSearchQueryCount(output: unknown): number {
    const o = output as GroundedOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
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

const GEMINI_25_GROUNDING_BILLING: BillingRules = {
    adjustments: [
        {
            id: "google.gemini_2.grounded_prompt.v1",
            description:
                "Google Search grounding adds $35 / 1K grounded prompts when grounding metadata is present.",
            kind: "grounded_prompt",
            unit: "prompt",
            count: "geminiGroundedPrompt",
            unitCost: GEMINI_25_GROUNDING_COST_PER_PROMPT,
            when: "grounded",
        },
    ],
};

const GEMINI_3_SEARCH_BILLING: BillingRules = {
    adjustments: [
        {
            id: "google.gemini_3.search_query.v1",
            description:
                "Google Search grounding adds $14 / 1K search queries when grounding metadata is present.",
            kind: "search_query",
            unit: "query",
            count: "geminiWebSearchQueries",
            unitCost: GEMINI_3_GROUNDING_COST_PER_QUERY,
            when: "grounded",
        },
    ],
};

const GEMINI_31_PRO_BILLING: BillingRules = {
    tiers: [
        {
            id: "google.gemini_3_1_pro.long_context.v1",
            description:
                "Prompts above 200K tokens use Gemini long-context rates.",
            when: { promptTokensGt: 200_000 },
            cost: GEMINI_3_1_PRO_LONG_CONTEXT_COST,
        },
    ],
    adjustments: GEMINI_3_SEARCH_BILLING.adjustments,
};

export const GEMINI_25_GROUNDING_PRICE_MULTIPLIER: PriceMultiplierFunctor = {
    multiplier: 1,
    description:
        "Uses 1x token pricing and adds the Gemini 2.5 Google Search grounded-prompt fee when grounding metadata is present.",
    billing: GEMINI_25_GROUNDING_BILLING,
    apply: ({ output }) => ({
        costAdjustment:
            getGeminiGroundingWebSearchQueryCount(output) > 0
                ? GEMINI_25_GROUNDING_COST_PER_PROMPT
                : 0,
    }),
};

export const GEMINI_3_SEARCH_PRICE_MULTIPLIER: PriceMultiplierFunctor = {
    multiplier: 1,
    description:
        "Uses 1x token pricing and adds the Gemini 3 Google Search fee per unique grounded web search query.",
    billing: GEMINI_3_SEARCH_BILLING,
    apply: ({ output }) => ({
        costAdjustment:
            getGeminiGroundingWebSearchQueryCount(output) *
            GEMINI_3_GROUNDING_COST_PER_QUERY,
    }),
};

export const GEMINI_31_PRO_PRICE_MULTIPLIER: PriceMultiplierFunctor = {
    multiplier: 1,
    description:
        "Uses 1x token pricing, switches Gemini 3.1 Pro prompts above 200K tokens to long-context rates, and adds search query fees.",
    billing: GEMINI_31_PRO_BILLING,
    apply: (context) => ({
        cost:
            getPromptTokenCount(context) > 200_000
                ? { ...context.baseCost, ...GEMINI_3_1_PRO_LONG_CONTEXT_COST }
                : context.baseCost,
        costAdjustment:
            getGeminiGroundingWebSearchQueryCount(context.output) *
            GEMINI_3_GROUNDING_COST_PER_QUERY,
    }),
};
