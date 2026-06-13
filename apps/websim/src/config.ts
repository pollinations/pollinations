export const WEBSIM_APP_KEY = "pk_wYCqFfSdCXZL8UBW";
export const ENTER_URL = "https://enter.pollinations.ai";
export const DEFAULT_MODEL = "openai-fast";

export const WEB_SIM_MODELS = [
    {
        id: DEFAULT_MODEL,
        label: "Fast",
        detail: "OpenAI fast",
    },
    {
        id: "claude-fast",
        label: "Claude",
        detail: "Careful structure",
    },
    {
        id: "gemini-fast",
        label: "Gemini",
        detail: "Quick drafts",
    },
    {
        id: "gemini",
        label: "Gemini Pro",
        detail: "Larger builds",
    },
] as const;

export type WebsimModelId = (typeof WEB_SIM_MODELS)[number]["id"];
