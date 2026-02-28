/** INT32_MAX - for compatibility with strict providers like Vertex AI */
const MAX_SEED_VALUE = 2147483647;

export function validateFloat(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = Number.parseFloat(String(value));
    return Number.isNaN(parsed) ? undefined : parsed;
}

export function validateInt(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Processes seed value. seed=-1 means "random" (parity with image generation).
 */
export function processSeed(value: unknown): number | undefined {
    const seed = validateInt(value);
    if (seed === undefined) return undefined;
    return seed === -1 ? Math.floor(Math.random() * MAX_SEED_VALUE) : seed;
}

export function validateBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (["true", "1", "yes"].includes(lower)) return true;
        if (["false", "0", "no"].includes(lower)) return false;
    }
    return Boolean(value);
}

export function validateString(
    value: unknown,
    defaultValue?: string,
): string | undefined {
    if (value === undefined || value === null) return defaultValue;
    return String(value);
}

/**
 * Checks whether JSON mode is enabled from various input formats.
 */
export function validateJsonMode(data: Record<string, unknown>): boolean {
    const responseFormat = data.response_format as
        | Record<string, unknown>
        | undefined;
    return !!(
        data.jsonMode ||
        (typeof data.json === "string" && data.json.toLowerCase() === "true") ||
        data.json === true ||
        responseFormat?.type === "json_object"
    );
}

/**
 * Resolves thinking_budget from either a direct parameter or
 * Anthropic/OpenAI-style thinking object: { type: "enabled"|"disabled", budget_tokens: N }
 */
function resolveThinkingBudget(
    data: Record<string, unknown>,
): number | undefined {
    const direct = validateInt(data.thinking_budget);
    if (direct !== undefined) return direct;

    if (data.thinking && typeof data.thinking === "object") {
        const thinking = data.thinking as Record<string, unknown>;
        if (
            thinking.type === "enabled" &&
            thinking.budget_tokens !== undefined
        ) {
            return validateInt(thinking.budget_tokens);
        }
        if (thinking.type === "disabled") {
            return 0;
        }
    }

    return undefined;
}

/**
 * Validates all common text generation parameters from a data object.
 */
export function validateTextGenerationParams(
    data: Record<string, unknown>,
): Record<string, unknown> {
    return {
        temperature: validateFloat(data.temperature),
        top_p: validateFloat(data.top_p),
        presence_penalty: validateFloat(data.presence_penalty),
        frequency_penalty: validateFloat(data.frequency_penalty),
        repetition_penalty: validateFloat(data.repetition_penalty),
        seed: processSeed(data.seed),
        stream: validateBoolean(data.stream),
        private: validateBoolean(data.private),
        model: validateString(data.model),
        voice: validateString(data.voice, "alloy"),
        reasoning_effort: validateString(data.reasoning_effort),
        thinking_budget: resolveThinkingBudget(data),
        jsonMode: validateJsonMode(data),
    };
}
