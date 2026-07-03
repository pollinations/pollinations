import type { BillingRules } from "./registry";

const GEMINI_25_GROUNDING_COST_PER_PROMPT = 35 / 1000;
const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;

export const GEMINI_25_GROUNDING_BILLING: BillingRules = {
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

export const GEMINI_3_SEARCH_BILLING: BillingRules = {
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
