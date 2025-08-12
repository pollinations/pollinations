import dotenv from "dotenv";
import debug from "debug";
import { calculateTotalCost } from "./costCalculator.js";
import { getProviderNameFromModel, resolveModelForPricing } from "./modelResolver.js";
import { TOKENS_PER_MILLION } from "./constants.js";



// Load environment variables
dotenv.config();

const log = debug("pollinations:tinybird");
const errorLog = debug("pollinations:tinybird:error");

const TINYBIRD_API_URL = process.env.TINYBIRD_API_URL || "https://api.europe-west2.gcp.tinybird.co";
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

    // Log the friendly model name we received
    log(
        `Sending telemetry to Tinybird for model: ${eventData.model || "unknown"}`,
    );

    try {
        // Resolve model and pricing using enhanced fallback logic
        const { model, modelForPricing, resolutionMethod, pricing } = resolveModelForPricing(
            eventData.model, 
            eventData.modelUsed
        );

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
            const prompt_audio_tokens = prompt_tokens_details?.audio_tokens || eventData.usage.audio_prompt_tokens || 0;
            const completion_audio_tokens = completion_tokens_details?.audio_tokens || eventData.usage.audio_completion_tokens || 0;
            const prompt_cached_tokens = prompt_tokens_details?.cached_tokens || 0;
            
            // Extract text tokens - prefer explicit text_tokens, fallback to calculation
            let prompt_text_tokens = prompt_tokens_details?.text_tokens ?? (prompt_tokens - prompt_audio_tokens);
            let completion_text_tokens = completion_tokens_details?.text_tokens ?? (completion_tokens - completion_audio_tokens);

            // Special case: If text is the only modality (no audio, no cached tokens), 
            // use the total token counts to ensure we capture all text tokens
            const isTextOnlyModality = prompt_audio_tokens === 0 && completion_audio_tokens === 0 && prompt_cached_tokens === 0;
            if (isTextOnlyModality) {
                prompt_text_tokens = prompt_tokens;
                completion_text_tokens = completion_tokens;
                log(`Text-only modality detected - using total token counts`);
            }

            // Log token breakdown for debugging
            log(`Token breakdown - Prompt: ${prompt_text_tokens} text + ${prompt_audio_tokens} audio + ${prompt_cached_tokens} cached = ${prompt_tokens} total`);
            log(`Token breakdown - Completion: ${completion_text_tokens} text + ${completion_audio_tokens} audio = ${completion_tokens} total`);

            // Set token counts
            tokenData.completion_text_token_generated = completion_text_tokens;
            tokenData.completion_audio_token_generated = completion_audio_tokens;
            tokenData.prompt_text_token_generated = prompt_text_tokens;
            tokenData.prompt_audio_token_generated = prompt_audio_tokens;
            tokenData.prompt_cached_token_generated = prompt_cached_tokens;

            // Set pricing information (per million tokens from availableModels.js)
            if (pricing) {
                tokenData.completion_text_token_price = pricing.completion_text || 0;
                tokenData.completion_audio_token_price = pricing.completion_audio || 0;
                tokenData.prompt_text_token_price = pricing.prompt_text || 0;
                tokenData.prompt_audio_token_price = pricing.prompt_audio || 0;
                tokenData.prompt_cached_token_price = pricing.prompt_cache || 0;
            }
        }

        // Calculate total cost based on token usage and pricing
        const totalCost = calculateTotalCost(tokenData);

        // Get the provider for the model
        const modelName = eventData.model || "unknown";
        const provider = getProviderNameFromModel(modelName);
        log(`Provider for model ${modelName}: ${provider}`);

        // Construct the event payload with token counts and pricing
        const tinybirdEvent = {
            // Timestamps
            start_time: eventData.startTime?.toISOString(),
            end_time: eventData.endTime?.toISOString(),

            // Model and provider info
            model: modelName,
            model_used: eventData.modelUsed,
            provider,

            // Performance metric captured by datasource
            response_time: eventData.duration,

            // Token counts and pricing with calculated total cost
            ...tokenData,
            cost: totalCost,

            // User info
            user: eventData.user,
            referrer: eventData.referrer || "unknown",

            // Status and caching flags
            standard_logging_object_status: eventData.status,
            cache_hit: false,
            stream: Boolean(eventData.stream),

            // Minimal proxy metadata (only environment is ingested)
            proxy_metadata: {
                environment:
                    eventData.environment || process.env.NODE_ENV || "development",
            },
        };

        // Token counts, pricing, and calculated total cost are sent as top-level fields

        // Simplified user logging with a consistent format
        const userIdentifier = eventData.user
            ? `UserID: ${eventData.user}`
            : "Anonymous user";

        log(
            `Sending telemetry to Tinybird for ${eventData.model} call - ${userIdentifier}${eventData.tier ? `, Tier: ${eventData.tier}` : ""}`,
        );

        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        // Log the complete payload being sent to Tinybird for debugging
        log(`📤 TINYBIRD PAYLOAD - Full event data being sent:`);
        log(`   🎯 model: "${tinybirdEvent.model}"`);
        log(`   🔧 model_used: "${tinybirdEvent.model_used}"`);
        log(`   👤 user: "${tinybirdEvent.user}"`);
        log(
            `   ⏱️  response_time: ${tinybirdEvent.response_time}ms`,
        );
        log(`   🔢 tokens: prompt_text=${tokenData.prompt_text_token_generated}, completion_text=${tokenData.completion_text_token_generated}, cached=${tokenData.prompt_cached_token_generated}`);
        log(`   💰 prices: prompt_text=${tokenData.prompt_text_token_price}, completion_text=${tokenData.completion_text_token_price}`);
        log(`   💵 total_cost: $${totalCost.toFixed(6)}`);
        log(`   📊 token_data:`, tokenData);
        log(`   🏢 provider: "${tinybirdEvent.provider}"`);
        // Only log full payload in development to avoid performance impact
        if (process.env.NODE_ENV === 'development') {
            log(`   📋 Full JSON payload:`, JSON.stringify(tinybirdEvent, null, 2));
        } else {
            log(`   📋 Payload summary: model=${tinybirdEvent.model}, cost=${tinybirdEvent.cost}, tokens=${tinybirdEvent.completion_text_token_generated + tinybirdEvent.prompt_text_token_generated}`);
        }

        try {
            const response = await fetch(
                `${TINYBIRD_API_URL}/v0/events?name=text_events`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${TINYBIRD_API_KEY}`,
                    },
                    body: JSON.stringify(tinybirdEvent),
                    signal: controller.signal,
                },
            );

            const responseText = await response
                .text()
                .catch(() => "Could not read response text");

            if (!response.ok) {
                errorLog(
                    `Failed to send telemetry to Tinybird: ${response.status} ${responseText}`,
                );
            } else {
                log(`Tinybird response: ${response.status} ${responseText}`);
                log(
                    `Successfully sent telemetry event for model: ${modelName}, provider: ${provider}`,
                );
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
