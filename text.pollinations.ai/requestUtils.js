import debug from "debug";
import dotenv from "dotenv";
// Import shared utilities for authentication and environment handling
import { extractReferrer } from "../shared/extractFromRequest.js";

// Load environment variables including .env.local overrides
// Load .env.local first (higher priority), then .env as fallback
dotenv.config();

dotenv.config({ path: '.env.local' });

const log = debug("pollinations:requestUtils");

/**
 * Common function to handle request data
 * @param {object} req - Express request object
 * @returns {object} - Processed request data
 */
export function getRequestData(req) {
    const query = req.query || {};
    const body = req.body || {};
    const data = { ...query, ...body };

    const jsonMode =
        data.jsonMode ||
        (typeof data.json === "string" && data.json.toLowerCase() === "true") ||
        (typeof data.json === "boolean" && data.json === true) ||
        data.response_format?.type === "json_object";

    const seed = data.seed ? parseInt(data.seed, 10) : null;
    let model = data.model || "openai-fast";
    const systemPrompt = data.system ? data.system : null;
    const temperature = data.temperature
        ? parseFloat(data.temperature)
        : undefined;
    const top_p = data.top_p ? parseFloat(data.top_p) : undefined;
    const presence_penalty = data.presence_penalty
        ? parseFloat(data.presence_penalty)
        : undefined;
    const frequency_penalty = data.frequency_penalty
        ? parseFloat(data.frequency_penalty)
        : undefined;
    const isPrivate = req.path?.startsWith("/openai")
        ? true
        : data.private === true ||
          (typeof data.private === "string" &&
              data.private.toLowerCase() === "true");

    // Use shared referrer extraction utility
    const referrer = extractReferrer(req);

    const stream = data.stream || false;

    // Extract voice parameter for audio models
    const voice = data.voice || "alloy";

    // Extract audio parameters
    const modalities = data.modalities;
    const audio = data.audio;

    // Extract tools and tool_choice for function calling
    const tools = data.tools || undefined;
    const tool_choice = data.tool_choice || undefined;

    // Extract reasoning_effort parameter for o3-mini model
    const reasoning_effort = data.reasoning_effort || undefined;

    // Preserve the original response_format object if it exists
    const response_format = data.response_format || undefined;

    const messages = data.messages || [
        { role: "user", content: req.params[0] },
    ];
    if (systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
        top_p,
        presence_penalty,
        frequency_penalty,
        referrer,
        stream,
        isPrivate,
        voice,
        tools,
        tool_choice,
        modalities,
        audio,
        reasoning_effort,
        response_format,
    };
}

/**
 * Prepares model data for output by removing pricing information and applying sorting.
 * Always sorts with community models (community: false first, then community: true).
 * @param {Array} models - Array of model objects
 * @returns {Array} - Sanitized model array without pricing, properly sorted
 */
export function prepareModelsForOutput(models) {
    // Remove pricing information from all models
    const prepared = models.map(({ pricing, ...rest }) => rest);

    // Sort models with non-community first, then community models
    return [
        ...prepared
            .filter((m) => m.community === false)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ...prepared
            .filter((m) => m.community === true)
            .sort((a, b) => a.name.localeCompare(b.name)),
    ];
}

/**
 * Get mapped model for a specific user
 * Uses environment variable USER_MODEL_MAPPING for configuration
 * Format: "username1:model1,username2:model2,blockeduser:blocked"
 * Special value "blocked" will throw Error with status 403
 * @param {string} username - The username to check for mapping
 * @returns {string|null} The mapped model name or null if no mapping exists
 * @throws {Error} If user is mapped to "blocked"
 */
export function getUserMappedModel(username) {
    log("checking model mapping for username", username);

    if (!username) return null;

    const mappingStr = process.env.USER_MODEL_MAPPING;
    if (!mappingStr) return null;

    try {
        // Parse mapping string: "thespecificdev:openai-large,testuser:grok,spammer:blocked"
        const mappings = mappingStr
            .split(",")
            .map((pair) => pair.split(":"))
            .filter(([user, model]) => user && model)
            .reduce((acc, [user, model]) => {
                acc[user.trim()] = model.trim();
                return acc;
            }, {});

        const mappedModel = mappings[username];
        log("got mapped model", mappedModel, "for user", username);
        if (mappedModel) {
            // Check for blocked user
            if (mappedModel.toLowerCase() === "blocked") {
                log(`🚫 User ${username} is blocked`);
                const error = new Error(
                    `User ${username} is currently blocked from using the text service`,
                );
                error.status = 403;
                throw error;
            }

            log(`🎯 User ${username} mapped to model: ${mappedModel}`);
        }

        return mappedModel || null;
    } catch (error) {
        // Re-throw blocked user errors as-is
        if (error.status === 403) {
            throw error;
        }
        log("Error parsing USER_MODEL_MAPPING:", error);
        return null;
    }
}
