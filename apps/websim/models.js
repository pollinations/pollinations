export const DEFAULT_MODEL = "openai-fast";

export const WEB_SIM_MODELS = /** @type {const} */ ([
    {
        id: DEFAULT_MODEL,
        label: "Quick Draft",
        detail: "Fast first pass",
    },
    {
        id: "claude-fast",
        label: "Structured",
        detail: "Cleaner hierarchy",
    },
    {
        id: "gemini-fast",
        label: "Creative",
        detail: "Richer page ideas",
    },
    {
        id: "gemini",
        label: "Detailed",
        detail: "More complete HTML",
    },
]);

export const ALLOWED_MODEL_IDS = WEB_SIM_MODELS.map((model) => model.id);
