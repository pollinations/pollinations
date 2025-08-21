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
        // Extract model and pricing information
        const modelUsed = eventData.modelUsed ?? null;
        const pricing = resolvePricing(modelUsed);

        // Extract token counts from usage data
        const extractTokenCounts = (usage) => {
            if (!usage) return {};
            
            const {
                prompt_tokens = 0,
                completion_tokens = 0,
                prompt_tokens_details = {},
                completion_tokens_details = {},
            } = usage;

            // Extract audio and cached tokens
            const prompt_audio = prompt_tokens_details?.audio_tokens ?? usage.audio_prompt_tokens ?? 0;
            const completion_audio = completion_tokens_details?.audio_tokens ?? usage.audio_completion_tokens ?? 0;
            const prompt_cached = prompt_tokens_details?.cached_tokens ?? 0;

            // Calculate text tokens with fallback to total when only text
            const prompt_text = (!prompt_audio && !prompt_cached) 
                ? prompt_tokens
                : (prompt_tokens_details?.text_tokens ?? prompt_tokens - prompt_audio - prompt_cached);
            
            const completion_text = !completion_audio
                ? completion_tokens
                : (completion_tokens_details?.text_tokens ?? completion_tokens - completion_audio);

            return {
                token_count_completion_text: completion_text,
                token_count_completion_audio: completion_audio,
                token_count_prompt_text: prompt_text,
                token_count_prompt_audio: prompt_audio,
                token_count_prompt_cached: prompt_cached,
            };
        };

        // Build token data with counts and prices
        const tokenCounts = extractTokenCounts(eventData.usage);
        const tokenData = {
            ...tokenCounts,
            ...(pricing && {
                token_price_completion_text: pricing.completion_text ?? 0,
                token_price_completion_audio: pricing.completion_audio ?? 0,
                token_price_prompt_text: pricing.prompt_text ?? 0,
                token_price_prompt_audio: pricing.prompt_audio ?? 0,
                token_price_prompt_cached: pricing.prompt_cache ?? 0,
            }),
        };

        // Calculate total cost based on token usage and pricing
        const totalCost = calculateTotalCost(tokenData) ?? 0;

        // Extract model and provider info
        const modelName = eventData.model;
        const model = findModelByName(modelName);
        const provider = model?.provider ?? 'unknown';
        log(`Provider for model ${modelName}: ${provider}`);

        // Extract moderation data from choices if present (Azure OpenAI)
        const cfr = eventData.choices?.[0]?.content_filter_results || 
                   eventData.choices?.[0]?.message?.content_filter_results;

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
            referrer: eventData.referrer ?? "unknown",

            // Status and caching flags
            standard_logging_object_status: eventData.status,
            cache_exact_hit: Boolean(eventData.cache_hit),
            cache_threshold: eventData.cache_semantic_threshold ?? 0,
            cache_similarity: eventData.cache_semantic_similarity ?? 0,
            cache_key: eventData.cache_key ?? "",
            id: getOrGenerateId(eventData.cf_ray),
            stream: Boolean(eventData.stream),

            // Moderation data (flat fields to match datasource)
            moderation_hate_severity: cfr?.hate?.severity ?? 'safe',
            moderation_self_harm_severity: cfr?.self_harm?.severity ?? 'safe',
            moderation_sexual_severity: cfr?.sexual?.severity ?? 'safe',
            moderation_violence_severity: cfr?.violence?.severity ?? 'safe',
            moderation_protected_material_code_detected: cfr?.protected_material_code?.detected ?? false,
            moderation_protected_material_text_detected: cfr?.protected_material_text?.detected ?? false,

            // Minimal proxy metadata (only environment is ingested)
            proxy_metadata: {
                environment: eventData.environment ?? process.env.NODE_ENV ?? "development",
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
                tinybirdEvent.model_requested
            } | $$${totalCost.toFixed(6)} | ${
                tinybirdEvent.token_count_completion_text +
                tinybirdEvent.token_count_prompt_text
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
