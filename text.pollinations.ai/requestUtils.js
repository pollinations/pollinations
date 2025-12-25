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

    // Extract max_tokens for controlling response length
    const max_tokens = data.max_tokens || undefined;
    const max_completion_tokens = data.max_completion_tokens || undefined;

    // Extract stop sequences
    const stop = data.stop || undefined;

    // Extract stream_options for streaming configuration
    const stream_options = data.stream_options || undefined;

    // Extract logprobs for log probabilities
    const logprobs = data.logprobs || undefined;
    const top_logprobs = data.top_logprobs || undefined;

    // Extract logit_bias for token bias
    const logit_bias = data.logit_bias || undefined;

    // Extract n for number of completions
    const n = data.n || undefined;

    // Extract user identifier
    const user = data.user || undefined;

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
        repetition_penalty: validated.repetition_penalty,
        referrer,
        stream: validated.stream,
        isPrivate,
        voice: validated.voice,
        tools,
        tool_choice,
        modalities,
        audio,
        thinking: validated.thinking,
        reasoning_effort: validated.reasoning_effort,
        thinking_budget: validated.thinking_budget,
        response_format,
        max_tokens,
        max_completion_tokens,
        stop,
        stream_options,
        logprobs,
        top_logprobs,
        logit_bias,
        n,
        user,
    };
}
