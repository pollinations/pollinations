import dotenv from 'dotenv';
import debug from 'debug';

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

    try {
        const event = {
            // Standard timestamps
            start_time: eventData.startTime?.toISOString(),
            end_time: eventData.endTime?.toISOString(),
            
            // Message and model info
            message_id: eventData.requestId,
            model: eventData.model || 'unknown',
            provider: eventData.provider || 'unknown',
            
            // Performance metrics
            duration: eventData.duration,
            llm_api_duration_ms: eventData.duration,
            
            // Response data (if success)
            response: eventData.status === 'success' ? {
                id: eventData.requestId,
                object: 'chat.completion',
                usage: {
                    prompt_tokens: eventData.promptTokens || 0,
                    completion_tokens: eventData.completionTokens || 0,
                    total_tokens: (eventData.promptTokens || 0) + (eventData.completionTokens || 0),
                }
            } : undefined,
            
            // No message content is stored for privacy reasons
            
            // Metadata
            proxy_metadata: {
                organization: eventData.organization || 'pollinations',
                project: eventData.project || 'text.pollinations.ai',
                environment: eventData.environment || process.env.NODE_ENV || 'development',
                chat_id: eventData.chatId || '',
            },
            
            // User info
            user: eventData.user || 'anonymous',
            
            // Status and performance 
            standard_logging_object_status: eventData.status,
            standard_logging_object_response_time: eventData.duration,
            
            // Event type and ID
            log_event_type: 'chat_completion',
            id: eventData.requestId,
            call_type: 'completion',
            cache_hit: false,
            
            // Error info (if error)
            ...(eventData.status === 'error' && {
                exception: eventData.error?.message || 'Unknown error',
                traceback: eventData.error?.stack || '',
            }),
        };

        log(`Sending telemetry to Tinybird for ${eventData.provider} ${eventData.model} call`);
        
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

            if (!response.ok) {
                errorLog('Failed to send telemetry to Tinybird: %s %s', response.status, await response.text().catch(() => 'Could not read response text'));
            }
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                errorLog('Tinybird telemetry request timed out after 5 seconds');
            } else {
                errorLog('Fetch error when sending telemetry to Tinybird: %O', fetchError);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        errorLog('Error sending telemetry to Tinybird: %O', error);
    }
}
