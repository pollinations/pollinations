import dotenv from "dotenv";
import debug from "debug";
import { findModelByName, availableModels } from "../availableModels.js";

/**
 * Get the provider name for a model by looking it up in availableModels
 * @param {string} modelName - The name of the model
 * @returns {string} - The provider name or 'Unknown' if not found
 */
function getProviderNameFromModel(modelName) {
    const model = findModelByName(modelName);
    return model?.provider || "Unknown";
}

// Load environment variables
dotenv.config();

const log = debug("pollinations:tinybird");
const errorLog = debug("pollinations:tinybird:error");

const TINYBIRD_API_URL =
    process.env.TINYBIRD_API_URL || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_API_KEY = process.env.TINYBIRD_API_KEY;

// Staging workspace configuration
const TINYBIRD_STAGING_API_KEY = process.env.TINYBIRD_STAGING_API_KEY;
const ENABLE_DUAL_INGESTION = process.env.ENABLE_DUAL_INGESTION === 'true';

/**
 * Send event to a specific Tinybird workspace
 * @param {Object} event - The event data to send
 * @param {string} apiUrl - The Tinybird API URL
 * @param {string} apiKey - The API key for the workspace
 * @param {string} workspaceName - Name of the workspace (for logging)
 * @param {AbortSignal} signal - Abort signal for timeout
 * @returns {Promise} - Promise that resolves when the event is sent
 */
async function sendToWorkspace(event, apiUrl, apiKey, workspaceName, signal) {
    try {
        const response = await fetch(
            `${apiUrl}/v0/events?name=llm_events`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(event),
                signal: signal,
            },
        );

        const responseText = await response
            .text()
            .catch(() => "Could not read response text");

        if (!response.ok) {
            errorLog(
                `Failed to send telemetry to Tinybird ${workspaceName}: ${response.status} ${responseText}`,
            );
        } else {
            log(`Tinybird ${workspaceName} response: ${response.status} ${responseText}`);
        }
    } catch (fetchError) {
        const errorMessage =
            fetchError.name === "AbortError"
                ? `Tinybird ${workspaceName} telemetry request timed out after 5 seconds`
                : `Fetch error when sending telemetry to Tinybird ${workspaceName}: ${fetchError.message}`;
        errorLog(errorMessage);
    }
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
        // Enhanced model resolution for accurate pricing:
        // 1. First try to find a model by the actual model used (from API response)
        // 2. Then try to find a model whose original_name matches the actual model used
        // 3. Finally fall back to the requested model name
        // 4. Check if the requested model has a known original_name that matches what was actually used
        let model = null;
        let modelForPricing = null;
        let resolutionMethod = null;
        
        // Try to find model by actual model used first
        if (eventData.modelUsed) {
            model = findModelByName(eventData.modelUsed);
            if (model) {
                modelForPricing = eventData.modelUsed;
                resolutionMethod = 'direct_match';
                log(`✅ Found direct match for actual model: ${eventData.modelUsed}`);
            } else {
                // Try to find a model whose original_name matches the actual model used
                model = availableModels.find(m => m.original_name === eventData.modelUsed);
                if (model) {
                    modelForPricing = model.name;
                    resolutionMethod = 'original_name_match';
                    log(`✅ Found model by original_name match: ${model.name} (original_name: ${model.original_name}) for actual model: ${eventData.modelUsed}`);
                }
            }
        }
        
        // If no match found, try the requested model
        if (!model && eventData.model) {
            model = findModelByName(eventData.model);
            if (model) {
                modelForPricing = eventData.model;
                resolutionMethod = 'requested_model';
                
                // Check if the model has an original_name that matches what was actually used
                if (eventData.modelUsed && model.original_name === eventData.modelUsed) {
                    log(`✅ Perfect match: requested model ${eventData.model} has original_name ${model.original_name} matching actual model`);
                } else if (eventData.modelUsed && eventData.modelUsed !== eventData.model) {
                    log(`⚠️  Using fallback pricing: requested=${eventData.model}, actual=${eventData.modelUsed}, original_name=${model.original_name || 'null'}`);
                }
            }
        }
        
        const pricing = model?.pricing;
        
        if (!model) {
            log(`❌ No model found for pricing: requested=${eventData.model}, actual=${eventData.modelUsed}`);
        }

        // Simply reference cost components from the usage object directly
        // without transformations or data manipulation
        let totalCost = 0;

        // Only calculate cost if we absolutely need to for downstream services
        if (eventData.usage) {
            // Access usage data directly following the thin proxy principle
            const {
                prompt_tokens = 0,
                completion_tokens = 0,
                cached_tokens = 0,
                prompt_tokens_details = {},
                completion_tokens_details = {},
            } = eventData.usage;

            // Extract audio tokens from details if available
            // Handle both standard and alternative field names, and null details
            const prompt_audio_tokens = prompt_tokens_details?.audio_tokens || eventData.usage.audio_prompt_tokens || 0;
            const completion_audio_tokens = completion_tokens_details?.audio_tokens || eventData.usage.audio_completion_tokens || 0;
            
            // Calculate text tokens, handling null details gracefully
            const prompt_text_tokens = prompt_tokens_details?.text_tokens || (prompt_tokens - prompt_audio_tokens);
            const completion_text_tokens = completion_tokens_details?.text_tokens || (completion_tokens - completion_audio_tokens);

            // Log token breakdown if audio tokens are present
            if (prompt_audio_tokens > 0 || completion_audio_tokens > 0) {
                log(`Token breakdown - Prompt: ${prompt_text_tokens} text + ${prompt_audio_tokens} audio = ${prompt_tokens} total`);
                log(`Token breakdown - Completion: ${completion_text_tokens} text + ${completion_audio_tokens} audio = ${completion_tokens} total`);
            }

            // Calculate cost properly - text and audio tokens are separate, not additive
            // Pricing in availableModels.js is per million tokens, so we need to divide token counts by 1,000,000
            totalCost =
                (prompt_text_tokens / 1000000) * (pricing?.prompt_text || 0) +
                (completion_text_tokens / 1000000) * (pricing?.completion_text || 0) +
                (cached_tokens / 1000000) * (pricing?.prompt_cache || 0) +
                (prompt_audio_tokens / 1000000) * (pricing?.prompt_audio || 0) +
                (completion_audio_tokens / 1000000) * (pricing?.completion_audio || 0);
        }

        // Get the provider for the model
        const modelName = eventData.model || "unknown";
        const provider = getProviderNameFromModel(modelName);
        log(`Provider for model ${modelName}: ${provider}`);

        // Construct the event object: start with a shallow copy so any extra fields (ip, ua, country, etc.) are preserved
        const tinybirdEvent = {
            // Standard timestamps and identifiers
            start_time: eventData.startTime?.toISOString(),
            end_time: eventData.endTime?.toISOString(),
            message_id: eventData.requestId,
            id: eventData.requestId,

            // Ensure response_id field is always present without intrusive data transformations

            // Model and provider info
            model: modelName,
            model_used: eventData.modelUsed, // Track the actual model used by the provider (from response)
            provider,

            // Performance metrics
            duration: eventData.duration,
            llm_api_duration_ms: eventData.duration,
            standard_logging_object_response_time: eventData.duration,

            // Cost information
            cost: totalCost,

            // User info
            user: eventData.user,
            // Status and event type constants
            standard_logging_object_status: eventData.status,
            log_event_type: "chat_completion",
            call_type: "completion",
            cache_hit: false,

            // Metadata
            proxy_metadata: {
                organization: eventData.organization || "pollinations",
                project: eventData.project || "text.pollinations.ai",
                environment:
                    eventData.environment ||
                    process.env.NODE_ENV ||
                    "development",
                chat_id: eventData.chatId || "",
            },

            // Always include basic response object to prevent null response_id
            // For success cases, include full response data; for error cases, include minimal id
            response:
                eventData.status === "success"
                    ? {
                          id: eventData.requestId,
                          object: "chat.completion",
                          // Pass the usage object directly without transformation
                          usage: eventData.usage,
                      }
                    : {
                          // Minimal response object for failed requests to satisfy schema
                          id: eventData.requestId,
                      },

            // Conditionally add error info
            ...(eventData.status === "error" && {
                exception: eventData.error?.message || "Unknown error",
                traceback: eventData.error?.stack || "",
            }),
        };

        // Usage data is now automatically extracted by Tinybird from the nested response.usage object

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
        log(`   ⏱️  duration: ${tinybirdEvent.duration}ms`);
        log(`   💰 cost: $${tinybirdEvent.cost}`);
        log(`   📊 usage:`, tinybirdEvent.usage || 'N/A');
        log(`   🏢 provider: "${tinybirdEvent.provider}"`);
        log(`   📋 Full JSON payload:`, JSON.stringify(tinybirdEvent, null, 2));

        // Send to production workspace
        const promises = [];
        
        if (TINYBIRD_API_KEY) {
            promises.push(
                sendToWorkspace(
                    tinybirdEvent,
                    TINYBIRD_API_URL,
                    TINYBIRD_API_KEY,
                    'production',
                    controller.signal
                )
            );
        }
        
        // Send to staging workspace if dual ingestion is enabled
        if (ENABLE_DUAL_INGESTION && TINYBIRD_STAGING_API_KEY) {
            promises.push(
                sendToWorkspace(
                    tinybirdEvent,
                    TINYBIRD_API_URL,
                    TINYBIRD_STAGING_API_KEY,
                    'staging',
                    controller.signal
                )
            );
        }
        
        try {
            await Promise.allSettled(promises);
            log(
                `Successfully sent telemetry event for model: ${modelName}, provider: ${provider}`,
            );
        } catch (error) {
            errorLog("Error in dual workspace ingestion: %O", error);
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        errorLog("Error sending telemetry to Tinybird: %O", error);
    }
}
