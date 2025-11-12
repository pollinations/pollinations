import debug from "debug";
import dotenv from "dotenv";
// Import shared utilities for authentication and environment handling
import { extractReferrer } from "../shared/extractFromRequest.js";
// Import parameter validators
import {
    validateTextGenerationParams,
    validateJsonMode,
} from "./utils/parameterValidators.js";

// Load environment variables including .env.local overrides
// Load .env.local first (higher priority), then .env as fallback
dotenv.config();

dotenv.config({ path: ".env.local" });

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

    // Use validators to eliminate duplication
    const validated = validateTextGenerationParams(data);

    const systemPrompt = data.system ? data.system : null;
    const isPrivate = req.path?.startsWith("/openai")
        ? true
        : validated.private === true;

    // Use shared referrer extraction utility
    const referrer = extractReferrer(req);

    // Extract audio parameters
    const modalities = data.modalities;
    const audio = data.audio;

    // Extract tools and tool_choice for function calling
    const tools = data.tools || undefined;
    const tool_choice = data.tool_choice || undefined;

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
        jsonMode: validated.jsonMode,
        seed: validated.seed,
        model: validated.model,
        temperature: validated.temperature,
        top_p: validated.top_p,
        presence_penalty: validated.presence_penalty,
        frequency_penalty: validated.frequency_penalty,
        referrer,
        stream: validated.stream,
        isPrivate,
        voice: validated.voice,
        tools,
        tool_choice,
        modalities,
        audio,
        reasoning_effort: validated.reasoning_effort,
        response_format,
    };
}

/**
 * Prepares model data for output by applying sorting and filtering.
 * Always sorts with community models (community: false first, then community: true).
 * Filters out hidden models from public listings.
 * @param {Array} models - Array of model objects
 * @returns {Array} - Sanitized model array properly sorted, excluding hidden models
 */
export function prepareModelsForOutput(models) {
    // Filter out hidden models (no need to remove pricing since it's no longer in model objects)
    const prepared = models.filter((m) => !m.hidden);

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

