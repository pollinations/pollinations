import dotenv from "dotenv";
import debug from "debug";
import { getProviderByModelId, calculateCost } from "../../shared/registry/registry.ts";
import type { ModelId, TokenUsage } from "../../shared/registry/registry.ts";

// Load environment variables
dotenv.config();

const log = debug("pollinations:tinybird");
const errorLog = debug("pollinations:tinybird:error");

const TINYBIRD_API_URL =
    process.env.TINYBIRD_API_URL || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_API_KEY = process.env.TINYBIRD_API_KEY;

// TypeScript interfaces for better type safety
interface EventData {
    startTime?: Date;
    endTime?: Date;
    requestId: string;
    model?: string;
    duration?: number;
    status: "success" | "error";
    project?: string;
    environment?: string;
    username?: string;
    user?: string;
    organization?: string;
    chatId?: string;
    tier?: string;
    error?: {
        message?: string;
        stack?: string;
    };
}

interface TinybirdEvent {
    // Match the exact structure from working text endpoint
    start_time?: string;
    end_time?: string;
    message_id: string;
    id: string;
    model: string;
    provider: string;
    duration?: number;
    llm_api_duration_ms?: number;
    standard_logging_object_response_time?: number;
    cost: number;
    user: string;
    username?: string;
    standard_logging_object_status: string;
    log_event_type: string;
    call_type: string;
    cache_hit: boolean;
    proxy_metadata: {
        organization: string;
        project: string;
        environment: string;
        chat_id: string;
    };
    response: {
        id: string;
        object: string;
        generation_time_ms?: number;
    };
    exception?: string;
    traceback?: string;
}



/**
 * Send image generation telemetry to Tinybird
 * @param eventData - The event data to send to Tinybird
 * @returns Promise that resolves when the event is sent
 */ 
export async function sendTinybirdEvent(eventData: EventData): Promise<void> {
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
        // Get the provider for the model from registry
        const modelName = eventData.model || "unknown";
        const provider = getProviderByModelId(modelName) || "unknown";
        log(`Provider for model ${modelName}: ${provider}`);

        // Calculate cost using registry
        let cost = 0;
        try {
            const usage: TokenUsage = {
                unit: "TOKENS",
                completionImageTokens: 1, // 1 image per request
            };
            const costResult = calculateCost(modelName as ModelId, usage);
            cost = costResult.totalCost;
            log(`Cost calculated: $${cost.toFixed(6)} for model ${modelName}`);
        } catch (error) {
            log(`Warning: Could not calculate cost for model ${modelName}:`, error);
        }

        // Construct the event object to match the exact structure from working text endpoint
        const event: TinybirdEvent = {
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
            cost,

            // User info
            user: eventData.username || eventData.user || "anonymous",
            username: eventData.username,

            // Status and event type constants
            standard_logging_object_status: eventData.status,
            log_event_type: "image_generation",
            call_type: "image_generation",
            cache_hit: false,

            // Metadata - IMPORTANT: This should be an object, not a JSON string
            proxy_metadata: {
                organization: eventData.organization || "pollinations",
                project: eventData.project || "image.pollinations.ai",
                environment: eventData.environment || process.env.NODE_ENV || "development",
                chat_id: eventData.chatId || "",
            },

            // Response object - IMPORTANT: This should be an object, not a JSON string
            response: eventData.status === "success"
                ? {
                    id: eventData.requestId,
                    object: "image.generation",
                    // Add generation time if available
                    ...(eventData.duration && { generation_time_ms: eventData.duration }),
                }
                : {
                    // Minimal response object for failed requests to satisfy schema
                    id: eventData.requestId || `req_${Date.now()}`,
                    object: "image.generation",
                },

            // Conditionally add error info for failed requests
            ...(eventData.status === "error" && {
                exception: eventData.error?.message || "Unknown error",
                traceback: eventData.error?.stack || "",
            }),
        };

        // Simplified user logging with a consistent format
        const userIdentifier = eventData.username
            ? `Username: ${eventData.username}`
            : eventData.user && eventData.user !== "anonymous"
              ? `UserID: ${eventData.user}`
              : "Anonymous user";

        log(
            `Sending telemetry to Tinybird for ${eventData.model} call - ${userIdentifier}${eventData.tier ? `, Tier: ${eventData.tier}` : ""}`,
        );

        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        try {
            const response = await fetch(
                `${TINYBIRD_API_URL}/v0/events?name=llm_events`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${TINYBIRD_API_KEY}`,
                    },
                    body: JSON.stringify(event),
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
        } catch (fetchError: any) {
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
