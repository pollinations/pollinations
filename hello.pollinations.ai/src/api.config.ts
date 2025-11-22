// Publishable API Key (safe for frontend - pollinations.ai2 only)
export const API_KEY = "plln_sk_ru9V1kDJyhjei9BJgBegJbJnmdf2hymU";
// Development key (faster, no rate limits): plln_sk_ru9V1kDJyhjei9BJgBegJbJnmdf2hymU - NEVER COMMIT
// Production key: plln_pk_JYeNIYDfEi0dwDT7kPAXujYWyYT2TaKm

export const API = {
    TEXT_GENERATION:
        "https://enter.pollinations.ai/api/generate/v1/chat/completions",
    IMAGE_GENERATION: "https://enter.pollinations.ai/api/generate/image",
};

export const DEFAULTS = {
    IMAGE_MODEL: "flux",
    TEXT_MODEL: "openai-large",
    IMAGE_WIDTH: 400,
    IMAGE_HEIGHT: 400,
    SEED: 42,
};
