/**
 * Simple parameter validation utilities
 * Eliminates duplication across requestUtils.js, textGenerationUtils.js, and transforms
 */

/**
 * Validates and clamps a float value within range
 * @param {*} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number|undefined} Validated float or undefined
 */
export const validateFloat = (value, min = -Infinity, max = Infinity) => {
    if (value === undefined || value === null) return undefined;
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return undefined;
    return Math.max(min, Math.min(max, parsed));
};

/**
 * Validates and clamps an integer value within range
 * @param {*} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number|undefined} Validated integer or undefined
 */
export const validateInt = (value, min = -Infinity, max = Infinity) => {
    if (value === undefined || value === null) return undefined;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return undefined;
    return Math.max(min, Math.min(max, parsed));
};

/**
 * Validates boolean values including string representations
 * @param {*} value - Value to validate
 * @returns {boolean|undefined} Validated boolean or undefined
 */
export const validateBoolean = (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (['true', '1', 'yes'].includes(lower)) return true;
        if (['false', '0', 'no'].includes(lower)) return false;
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
    return data.jsonMode ||
        (typeof data.json === "string" && data.json.toLowerCase() === "true") ||
        (typeof data.json === "boolean" && data.json === true) ||
        data.response_format?.type === "json_object";
};

/**
 * Validates all common text generation parameters from data object
 * @param {Object} data - Input data object
 * @returns {Object} Validated parameters
 */
export const validateTextGenerationParams = (data) => {
    return {
        temperature: validateFloat(data.temperature, 0, 3),
        top_p: validateFloat(data.top_p, 0, 1),
        presence_penalty: validateFloat(data.presence_penalty, -2, 2),
        frequency_penalty: validateFloat(data.frequency_penalty, -2, 2),
        seed: validateInt(data.seed, 0),
        stream: validateBoolean(data.stream),
        private: validateBoolean(data.private),
        model: validateString(data.model, "openai-fast"),
        voice: validateString(data.voice, "alloy"),
        reasoning_effort: validateString(data.reasoning_effort),
        jsonMode: validateJsonMode(data)
    };
};
