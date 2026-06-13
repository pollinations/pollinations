export const WEBSIM_APP_KEY = "pk_wYCqFfSdCXZL8UBW";
export const ENTER_URL = "https://enter.pollinations.ai";
export const DEFAULT_MODEL = "openai-fast";

export const WEB_SIM_MODELS = [
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
] as const;

export type WebsimModelId = (typeof WEB_SIM_MODELS)[number]["id"];
