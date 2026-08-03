const CONSOLIDATED_MODEL_IDS: Record<string, string> = {
    "trellis-2-low": "trellis-2",
    "trellis-2-medium": "trellis-2",
    "trellis-2-high": "trellis-2",
    sonar: "perplexity-fast",
    "perplexity-high": "perplexity-fast",
    "perplexity-deep": "perplexity-fast",
    "sonar-deep": "perplexity-fast",
    "grok-fast": "grok",
    "grok-4-1-fast": "grok",
    "grok-4-1-fast-non-reasoning": "grok",
    "grok-legacy": "grok",
    "grok-4": "grok",
    "grok-4-fast": "grok",
    "grok-4-20-non-reasoning": "grok",
    "grok-non-reasoning": "grok",
    "grok-4-20-reasoning": "grok",
    "grok-4-20": "grok",
    "grok-4-1-fast-reasoning": "grok",
    "gemini-search-fast": "gemini-flash-lite-3.5",
    "gemini-3.1-flash-lite-search": "gemini-flash-lite-3.5",
    "gemini-3.5-flash-lite-search": "gemini-flash-lite-3.5",
    "gemini-search-large": "gemini",
    "gemini-3.6-flash-search": "gemini",
    "gemini-3.5-flash-search": "gemini",
};

export function normalizeModelPermissions(modelIds: string[]): string[] {
    return [
        ...new Set(
            modelIds.map(
                (modelId) => CONSOLIDATED_MODEL_IDS[modelId] || modelId,
            ),
        ),
    ];
}
