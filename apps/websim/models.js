export const DEFAULT_MODEL = "openai/gpt-5-nano";

export const WEB_SIM_MODELS = /** @type {const} */ ([
    {
        id: DEFAULT_MODEL,
        label: "Quick Draft",
        detail: "Fast first pass",
    },
    {
        id: "anthropic/claude-haiku-4.5",
        label: "Structured",
        detail: "Cleaner hierarchy",
    },
    {
        id: "google/gemini-2.5-flash-lite",
        label: "Creative",
        detail: "Richer page ideas",
    },
    {
        id: "google/gemini-3.6-flash",
        label: "Detailed",
        detail: "More complete HTML",
    },
]);

export const ALLOWED_MODEL_IDS = WEB_SIM_MODELS.map((model) => model.id);
