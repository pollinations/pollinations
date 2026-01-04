/**
 * Simple parameter validation utilities
 * Eliminates duplication across requestUtils.js, textGenerationUtils.js, and transforms
 */

/**
 * Validates a float value without clamping - lets downstream API handle range validation
 * @param {*} value - Value to validate
 * @returns {number|undefined} Validated float or undefined
 */
export const validateFloat = (value) => {
    if (value === undefined || value === null) return undefined;
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
};

/**
 * Validates an integer value without clamping - lets downstream API handle range validation
 * @param {*} value - Value to validate
 * @returns {number|undefined} Validated integer or undefined
 */
export const validateInt = (value) => {
    if (value === undefined || value === null) return undefined;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
};

// Maximum seed value supported by most LLM/image providers (32-bit integer)
const MAX_SEED_VALUE = 4294967296; // 2^32

/**
 * Processes seed value, converting -1 to a random seed (parity with image generation)
 * @param {*} value - Value to validate
 * @returns {number|undefined} Processed seed or undefined
 */
export const processSeed = (value) => {
    const seed = validateInt(value);
    if (seed === undefined) return undefined;
    // seed=-1 means "random" - generate a random seed
    return seed === -1 ? Math.floor(Math.random() * MAX_SEED_VALUE) : seed;
};

/**
 * Validates boolean values including string representations
 * @param {*} value - Value to validate
 * @returns {boolean|undefined} Validated boolean or undefined
 */
export const validateBoolean = (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (["true", "1", "yes"].includes(lower)) return true;
        if (["false", "0", "no"].includes(lower)) return false;
    }
    return Boolean(value);
};

/**
 * Validates value against allowed enum values
 * @param {*} value - Value to validate
 * @param {Array} allowedValues - Array of allowed values
 * @returns {*|undefined} Valid value or undefined
 */
export const validateEnum = (value, allowedValues) => {
    if (value === undefined || value === null) return undefined;
    return allowedValues.includes(value) ? value : undefined;
};

/**
 * Validates string with optional default
 * @param {*} value - Value to validate
 * @param {string} defaultValue - Default value if undefined/null
 * @returns {string|undefined} Validated string
 */
export const validateString = (value, defaultValue = undefined) => {
    if (value === undefined || value === null) return defaultValue;
    return String(value);
};

/**
 * Validates JSON mode from various input formats
 * @param {*} data - Input data object
 * @returns {boolean} Whether JSON mode is enabled
 */
export const validateJsonMode = (data) => {
    return (
        data.jsonMode ||
        (typeof data.json === "string" && data.json.toLowerCase() === "true") ||
        (typeof data.json === "boolean" && data.json === true) ||
        data.response_format?.type === "json_object"
    );
};

/**
 * Validates all common text generation parameters from data object
 * No range clamping - downstream APIs will validate and return proper errors
 * @param {Object} data - Input data object
 * @returns {Object} Validated parameters
 */
export const validateTextGenerationParams = (data) => {
    // Handle thinking_budget from multiple sources:
    // 1. Direct thinking_budget parameter
    // 2. Anthropic/OpenAI-style thinking object: { type: "enabled"|"disabled", budget_tokens: N }
    let thinking_budget = validateInt(data.thinking_budget);

    if (
        thinking_budget === undefined &&
        data.thinking &&
        typeof data.thinking === "object"
    ) {
        if (
            data.thinking.type === "enabled" &&
            data.thinking.budget_tokens !== undefined
        ) {
            thinking_budget = validateInt(data.thinking.budget_tokens);
        } else if (data.thinking.type === "disabled") {
            thinking_budget = 0;
        }
    }

    return {
        temperature: validateFloat(data.temperature),
        top_p: validateFloat(data.top_p),
        presence_penalty: validateFloat(data.presence_penalty),
        frequency_penalty: validateFloat(data.frequency_penalty),
        repetition_penalty: validateFloat(data.repetition_penalty),
        seed: processSeed(data.seed),
        stream: validateBoolean(data.stream),
        private: validateBoolean(data.private),
        model: validateString(data.model), // No default - gateway must provide valid model
        voice: validateString(data.voice, "alloy"),
        reasoning_effort: validateString(data.reasoning_effort),
        thinking_budget: thinking_budget,
        jsonMode: validateJsonMode(data),
    };
};
