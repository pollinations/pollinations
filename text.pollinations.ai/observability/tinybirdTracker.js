import dotenv from 'dotenv';
import debug from 'debug';
import { getModelPricing, findModelByName } from '../availableModels.js';

/**
 * Get the provider name for a model by looking it up in availableModels
 * @param {string} modelName - The name of the model
 * @returns {string} - The provider name or 'Unknown' if not found
 */
function getProviderNameFromModel(modelName) {
    const model = findModelByName(modelName);
    return model?.provider || 'Unknown';
}

// Load environment variables
dotenv.config();

const log = debug('pollinations:tinybird');
const errorLog = debug('pollinations:tinybird:error');

const TINYBIRD_API_URL = process.env.TINYBIRD_API_URL || 'https://api.europe-west2.gcp.tinybird.co';
const TINYBIRD_API_KEY = process.env.TINYBIRD_API_KEY;

/**
 * Send LLM call telemetry to Tinybird
 * @param {Object} eventData - The event data to send to Tinybird
 * @returns {Promise} - Promise that resolves when the event is sent
 */
export async function sendTinybirdEvent(eventData) {
    // Skip if Tinybird API key is not set - this is optional functionality
    if (!TINYBIRD_API_KEY) {
        log('TINYBIRD_API_KEY not set, skipping telemetry');
        return;
    }
    
    // Log the friendly model name we received
    log(`Sending telemetry to Tinybird for model: ${eventData.model || 'unknown'}`);

    try {
        // If we need to calculate cost, we'll use the pricing model
        // But we'll avoid transforming data as much as possible (thin proxy principle)
        const pricing = getModelPricing(eventData.model);
        
        // Simply reference cost components from the usage object directly
        // without transformations or data manipulation
        let totalCost = 0;
        
        // Only calculate cost if we absolutely need to for downstream services
        if (eventData.usage) {
            // Access usage data directly following the thin proxy principle
            const { prompt_tokens = 0, completion_tokens = 0, cached_tokens = 0 } = eventData.usage;
            
            // Calculate cost using direct references
            // Pricing in availableModels.js is per million tokens, so we need to divide token counts by 1,000,000
            totalCost = (
                (prompt_tokens / 1000000) * pricing.prompt_tokens + 
                (completion_tokens / 1000000) * pricing.completion_tokens + 
                (cached_tokens / 1000000) * (pricing.cached_tokens || 0)
            );
        }

        // Get the provider for the model
        const modelName = eventData.model || 'unknown';
        const provider = getProviderNameFromModel(modelName);
        log(`Provider for model ${modelName}: ${provider}`);
        
        // Construct the event object with defaults and conditionals using spread operator
        const event = {
            // Standard timestamps and identifiers
            start_time: eventData.startTime?.toISOString(),
            end_time: eventData.endTime?.toISOString(),
            message_id: eventData.requestId,
            id: eventData.requestId,
            
            // Model and provider info
            model: modelName,
            provider,
            
            // Performance metrics
            duration: eventData.duration,
            llm_api_duration_ms: eventData.duration,
            standard_logging_object_response_time: eventData.duration,
            
            // Cost information
            cost: totalCost,
            
            // User info
            user: eventData.username || eventData.user || 'anonymous',
            username: eventData.username,
            
            // Status and event type constants
            standard_logging_object_status: eventData.status,
            log_event_type: 'chat_completion',
            call_type: 'completion',
            cache_hit: false,
            
            // Metadata
            proxy_metadata: {
                organization: eventData.organization || 'pollinations',
                project: eventData.project || 'text.pollinations.ai',
                environment: eventData.environment || process.env.NODE_ENV || 'development',
                chat_id: eventData.chatId || '',
            },
            
            // Conditionally add response data for successful requests
            ...(eventData.status === 'success' && {
                response: {
                    id: eventData.requestId,
                    object: 'chat.completion',
                    // Pass the usage object directly without transformation
                    usage: eventData.usage
                }
            }),
            
            // Conditionally add error info
            ...(eventData.status === 'error' && {
                exception: eventData.error?.message || 'Unknown error',
                traceback: eventData.error?.stack || '',
            }),
        };

        // Simplified user logging with a consistent format
        const userIdentifier = eventData.username ? 
            `Username: ${eventData.username}` : 
            eventData.user && eventData.user !== 'anonymous' ? 
                `UserID: ${eventData.user}` : 
                'Anonymous user';
            
        log(`Sending telemetry to Tinybird for ${eventData.model} call - ${userIdentifier}${eventData.tier ? `, Tier: ${eventData.tier}` : ''}`);
        
        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);  // 5 second timeout
        
        try {
            const response = await fetch(`${TINYBIRD_API_URL}/v0/events?name=llm_events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${TINYBIRD_API_KEY}`,
                },
                body: JSON.stringify(event),
                signal: controller.signal
            });

            const responseText = await response.text().catch(() => 'Could not read response text');
            
            if (!response.ok) {
                errorLog(`Failed to send telemetry to Tinybird: ${response.status} ${responseText}`);
            } else {
                log(`Tinybird response: ${response.status} ${responseText}`);
                log(`Successfully sent telemetry event for model: ${modelName}, provider: ${provider}`);
            }
        } catch (fetchError) {
            const errorMessage = fetchError.name === 'AbortError' ? 
                'Tinybird telemetry request timed out after 5 seconds' : 
                `Fetch error when sending telemetry to Tinybird: ${fetchError.message}`;
            errorLog(errorMessage);
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        errorLog('Error sending telemetry to Tinybird: %O', error);
    }
}
