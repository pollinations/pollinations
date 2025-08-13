import dotenv from "dotenv";
import debug from "debug";
import { calculateTotalCost, resolvePricing } from "./costCalculator.js";
import { findModelByName } from "../availableModels.js";
import { generatePollinationsId, getOrGenerateId } from "./idGenerator.js";

// Load environment variables
dotenv.config();

const log = debug("pollinations:tinybird");
const errorLog = debug("pollinations:tinybird:error");

const TINYBIRD_API_URL =
    process.env.TINYBIRD_API_URL || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_API_KEY = process.env.TINYBIRD_API_KEY;

if (!TINYBIRD_API_KEY) {
    log("TINYBIRD_API_KEY not set, telemetry will be skipped");
}

/**
 * Send LLM call telemetry to Tinybird
 * @param {Object} eventData - The event data to send to Tinybird
 * @returns {Promise} - Promise that resolves when the event is sent
 */
export async function sendTinybirdEvent(eventData) {
    // Skip if Tinybird API key is not set - this is optional functionality
    if (!TINYBIRD_API_KEY) {
        log("TINYBIRD_API_KEY not set, skipping telemetry");
        return;
    }

    try {
        // Step 1: Simple model_used - just use the response model as-is
        const modelUsed = eventData.modelUsed || null;

        // Step 2: Resolve pricing - no fallback, null if no match
        const pricing = resolvePricing(eventData.modelUsed);

        // Extract token counts and pricing information
        let tokenData = {
            completion_text_token_generated: 0,
            completion_audio_token_generated: 0,
            prompt_text_token_generated: 0,
            prompt_audio_token_generated: 0,
            prompt_cached_token_generated: 0,
            completion_text_token_price: 0,
            completion_audio_token_price: 0,
            prompt_text_token_price: 0,
            prompt_audio_token_price: 0,
            prompt_cached_token_price: 0,
        };

        if (eventData.usage) {
            // Access usage data directly following the thin proxy principle
            const {
                prompt_tokens = 0,
                completion_tokens = 0,
                prompt_tokens_details = {},
                completion_tokens_details = {},
            } = eventData.usage;

            // Extract tokens from details, with fallbacks for different API formats
            const prompt_audio_tokens =
                prompt_tokens_details?.audio_tokens ||
                eventData.usage.audio_prompt_tokens ||
                0;
            const completion_audio_tokens =
                completion_tokens_details?.audio_tokens ||
                eventData.usage.audio_completion_tokens ||
                0;
            const prompt_cached_tokens =
                prompt_tokens_details?.cached_tokens || 0;

            // Extract text tokens - prefer explicit text_tokens, fallback to calculation
            let prompt_text_tokens =
                prompt_tokens_details?.text_tokens ??
                prompt_tokens - prompt_audio_tokens;
            let completion_text_tokens =
                completion_tokens_details?.text_tokens ??
                completion_tokens - completion_audio_tokens;

            // Independent logic: Use total token counts when each modality is text-only
            const isPromptTextOnly =
                prompt_audio_tokens === 0 && prompt_cached_tokens === 0;
            const isCompletionTextOnly = completion_audio_tokens === 0;

            if (isPromptTextOnly) {
                prompt_text_tokens = prompt_tokens;
            }
            if (isCompletionTextOnly) {
                completion_text_tokens = completion_tokens;
            }

            // Set token counts
            tokenData.completion_text_token_generated = completion_text_tokens;
            tokenData.completion_audio_token_generated =
                completion_audio_tokens;
            tokenData.prompt_text_token_generated = prompt_text_tokens;
            tokenData.prompt_audio_token_generated = prompt_audio_tokens;
            tokenData.prompt_cached_token_generated = prompt_cached_tokens;

            // Set pricing information (per million tokens from availableModels.js)
            if (pricing) {
                tokenData.completion_text_token_price =
                    pricing.completion_text || 0;
                tokenData.completion_audio_token_price =
                    pricing.completion_audio || 0;
                tokenData.prompt_text_token_price = pricing.prompt_text || 0;
                tokenData.prompt_audio_token_price = pricing.prompt_audio || 0;
                tokenData.prompt_cached_token_price = pricing.prompt_cache || 0;
            }
        }

        // Calculate total cost based on token usage and pricing
        const totalCost = calculateTotalCost(tokenData);

        // Extract model name and provider info
        const modelName = eventData.model;
        const model = findModelByName(modelName);
        const provider = model?.provider || 'unknown';
        log(`Provider for model ${modelName}: ${provider}`);

        // Construct the event payload with token counts and pricing
        const tinybirdEvent = {
            // Timestamps
            start_time: eventData.startTime?.toISOString(),
            end_time: eventData.endTime?.toISOString(),

            // Model and provider info
            model_requested: modelName,
            model_used: modelUsed,
            provider,

            // Performance metric captured by datasource
            standard_logging_object_response_time: eventData.duration,

            // Token counts and pricing with calculated total cost
            ...tokenData,
            cost: totalCost,

            // User info
            user: eventData.user,
            referrer: eventData.referrer || "unknown",

            // Status and caching flags
            standard_logging_object_status: eventData.status,
            cache_hit: eventData.cache_hit || false,
            cache_semantic_threshold: eventData.cache_semantic_threshold || 0,
            cache_semantic_similarity: eventData.cache_semantic_similarity || 0,
            cache_key: eventData.cache_key || "",
            id: getOrGenerateId(eventData.cf_ray),
            stream: Boolean(eventData.stream),

            // Minimal proxy metadata (only environment is ingested)
            proxy_metadata: {
                environment:
                    eventData.environment ||
                    process.env.NODE_ENV ||
                    "development",
            },

            // Include raw choices data for moderation detection (not sent to text_events)
            choices: eventData.choices,
        };

        // Token counts, pricing, and calculated total cost are sent as top-level fields

        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        // Log summary for telemetry tracking
        log(
            `📤 Sending telemetry: ${
                tinybirdEvent.model
            } | $${totalCost.toFixed(6)} | ${
                tinybirdEvent.completion_text_token_generated +
                tinybirdEvent.prompt_text_token_generated
            } tokens`
        );

        // Helper function to send data to Tinybird endpoint
        const sendToTinybird = async (
            endpoint,
            data,
            controller,
            description = "telemetry"
        ) => {
            const response = await fetch(
                `${TINYBIRD_API_URL}/v0/events?name=${endpoint}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${TINYBIRD_API_KEY}`,
                    },
                    body: JSON.stringify(data),
                    signal: controller.signal,
                }
            );

            const responseText = await response
                .text()
                .catch(() => "Could not read response text");

            if (!response.ok) {
                errorLog(
                    `Failed to send ${description} to Tinybird: ${response.status} ${responseText}`
                );
                return false;
            }
            return true;
        };

        try {
            // Send main telemetry data (exclude choices to avoid mixing moderation fields)
            const { choices: _omitChoices, ...textEventsEvent } = tinybirdEvent;
            const success = await sendToTinybird(
                "text_events",
                textEventsEvent,
                controller
            );

            if (success) {
                log(`✅ Telemetry sent: ${modelName}`);
            }

            // Send moderation data if present (Azure OpenAI only)
            const cfr =
                tinybirdEvent.choices?.[0]?.content_filter_results ||
                tinybirdEvent.choices?.[0]?.message?.content_filter_results;

            if (cfr) {
                const moderationController = new AbortController();
                const moderationTimeoutId = setTimeout(
                    () => moderationController.abort(),
                    5000
                );

                try {
                    const moderationSuccess = await sendToTinybird(
                        "text_moderation",
                        {
                            id: tinybirdEvent.id || generatePollinationsId(),
                            ...cfr,
                        },
                        moderationController,
                        "moderation telemetry"
                    );

                    if (moderationSuccess) {
                        log(`🛡️ Moderation data sent: ${modelName}`);
                    }
                } catch (modErr) {
                    const msg =
                        modErr.name === "AbortError"
                            ? "Moderation telemetry request timed out after 5 seconds"
                            : `Fetch error when sending moderation telemetry to Tinybird: ${modErr.message}`;
                    errorLog(msg);
                } finally {
                    clearTimeout(moderationTimeoutId);
                }
            }
        } catch (fetchError) {
            const errorMessage =
                fetchError.name === "AbortError"
                    ? "Tinybird telemetry request timed out after 5 seconds"
                    : `Fetch error when sending telemetry to Tinybird: ${fetchError.message}`;
            errorLog(errorMessage);
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        errorLog("Error sending telemetry to Tinybird: %O", error);
    }
}
