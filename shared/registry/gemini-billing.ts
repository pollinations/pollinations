import type { BillingRules } from "./registry";

const GEMINI_25_GROUNDING_COST_PER_PROMPT = 35 / 1000;
const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;

type GroundingMetadata = {
    webSearchQueries?: string[];
    // Google returns a grounding chunk per source it cites. A `web` entry means
    // the source is a Google-Search web result (billable grounding evidence);
    // Vertex-AI-Search chunks are a different, separately-priced product.
    groundingChunks?: { web?: { uri?: string } }[];
};

type GroundedOutput = {
    choices?: { groundingMetadata?: GroundingMetadata }[];
    streamEvents?: GroundedOutput[];
};

// Counters walk raw provider output and must never throw — a throw here
// happens before the deduction/event path in track.ts, so it would skip
// billing AND the tracking event. Guard every shape assumption.
function eachGroundingMetadata(output: unknown): GroundingMetadata[] {
    const o = output as GroundedOutput | undefined;
    const events = Array.isArray(o?.streamEvents)
        ? o.streamEvents
        : o
          ? [o]
          : [];
    const metadata: GroundingMetadata[] = [];
    for (const event of events) {
        const choices = Array.isArray(event?.choices) ? event.choices : [];
        for (const choice of choices) {
            if (choice?.groundingMetadata)
                metadata.push(choice.groundingMetadata);
        }
    }
    return metadata;
}

function webSearchQueryStrings(metadata: GroundingMetadata): string[] {
    if (!Array.isArray(metadata.webSearchQueries)) return [];
    return metadata.webSearchQueries.filter(
        (q): q is string => typeof q === "string" && q.trim() !== "",
    );
}

// Gemini 2.5: Google bills one grounded prompt when Google-Search web evidence
// is returned — search queries fired OR web grounding chunks cited. Bare
// groundingSupports is deliberately NOT evidence: Vertex-AI-Search grounding
// (retrievalQueries/retrievedContext, a separately priced product) also emits
// supports and must not trigger the Google-Search fee.
function countGeminiGroundedPrompt(output: unknown): number {
    for (const metadata of eachGroundingMetadata(output)) {
        if (webSearchQueryStrings(metadata).length > 0) return 1;
        const chunks = Array.isArray(metadata.groundingChunks)
            ? metadata.groundingChunks
            : [];
        if (chunks.some((chunk) => chunk?.web?.uri)) return 1;
    }
    return 0;
}

// Gemini 3.x: each distinct web-search query fires a fee. Dedup the cumulative
// query list across stream chunks (chunks repeat the running list).
function countGeminiWebSearchQueries(output: unknown): number {
    const queries = new Set<string>();
    for (const metadata of eachGroundingMetadata(output)) {
        for (const q of webSearchQueryStrings(metadata)) {
            queries.add(q.trim());
        }
    }
    return queries.size;
}

export const GEMINI_25_GROUNDING_BILLING: BillingRules = {
    adjustments: [
        {
            id: "google.gemini_2.grounded_prompt.v1",
            description:
                "Google Search grounding adds $35 / 1K grounded prompts when grounding metadata is present.",
            kind: "grounded_prompt",
            unit: "prompt",
            unitCost: GEMINI_25_GROUNDING_COST_PER_PROMPT,
            countUnits: countGeminiGroundedPrompt,
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
            unitCost: GEMINI_3_GROUNDING_COST_PER_QUERY,
            countUnits: countGeminiWebSearchQueries,
        },
    ],
};
