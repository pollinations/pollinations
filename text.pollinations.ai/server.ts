import crypto from "node:crypto";
import debug from "debug";
import dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
// Import shared utilities
import { getIp } from "../shared/extractFromRequest.js";
import { getServiceDefinition } from "../shared/registry/registry.js";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
} from "../shared/registry/usage-headers.js";
import { availableModels } from "./availableModels.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { getRequestData } from "./requestUtils.js";
import type { Context } from "hono";

// Load environment variables including .env.local overrides
// Load .env.local first (higher priority), then .env as fallback
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = new Hono();

const log = debug("pollinations:server");
const errorLog = debug("pollinations:error");
const authLog = debug("pollinations:auth");

// CORS middleware
app.use("*", cors());

// Middleware to verify PLN_ENTER_TOKEN
app.use("*", async (c, next) => {
    const token = c.req.header("x-enter-token");
    const expectedToken = process.env.PLN_ENTER_TOKEN;

    if (!expectedToken) {
        // If PLN_ENTER_TOKEN is not configured, allow all requests (backward compatibility)
        authLog("!  PLN_ENTER_TOKEN not configured - allowing request");
        return await next();
    }

    if (token !== expectedToken) {
        authLog("❌ Invalid or missing PLN_ENTER_TOKEN from IP:", getIp(c.req.raw));
        return c.json({ error: "Unauthorized" }, 403);
    }

    authLog("✅ Valid PLN_ENTER_TOKEN from IP:", getIp(c.req.raw));
    await next();
});

// Root path - redirect to documentation
app.get("/", (c) => {
    return c.redirect(
        "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md",
        301,
    );
});

// Serve crossdomain.xml for Flash connections
app.get("/crossdomain.xml", (c) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`;
    c.header("Content-Type", "application/xml");
    return c.text(xml);
});

// Deprecated /models endpoint - moved to gateway
app.get("/models", (c) => {
    return c.json(
        {
            error: "Endpoint moved",
            message:
                "The /models endpoint has been moved to the API gateway. Please use: https://enter.pollinations.ai/api/generate/text/models",
            deprecated_endpoint: `${c.req.url}`,
            new_endpoint:
                "https://enter.pollinations.ai/api/generate/text/models",
            documentation: "https://enter.pollinations.ai/api/docs",
        },
        410,
    );
});

// Helper function to handle both GET and POST requests
async function handleRequest(c: Context, requestData: any) {
    const _startTime = Date.now();
    log(
        "Request: model=%s referrer=%s",
        requestData.model,
        requestData.referrer,
    );
    log("Request data: %O", requestData);

    try {
        // Generate a unique ID for this request
        const requestId = generatePollinationsId();

        // Get user info from authentication if available
        const authResult = (c as any).authResult || {};

        // Model lookup
        const model = availableModels.find(
            (m: any) =>
                m.name === requestData.model ||
                m.aliases?.includes(requestData.model),
        );

        log(`Model lookup: model=${requestData.model}, found=${!!model}`);

        // All requests from enter.pollinations.ai - tier checks bypassed
        if (!model) {
            log(`Model not found: ${requestData.model}`);
            const error: any = new Error(
                `Model not found: ${requestData.model}`,
            );
            error.status = 404;
            return await sendErrorResponse(c, error, requestData, 404);
        }

        // Capture the originally requested model before any mapping/overrides
        const _requestedModel = requestData.model;

        // Use request data as-is (no user-specific model mapping)
        const finalRequestData = requestData;

        // Add user info to request data - using authResult directly as a thin proxy
        // Exclude messages from options to prevent overwriting transformed messages
        const { messages: _, ...requestDataWithoutMessages } =
            finalRequestData;
        const requestWithUserInfo = {
            ...requestDataWithoutMessages,
            userInfo: {
                ...authResult,
                referrer: requestData.referrer || "unknown",
                cf_ray: c.req.header("cf-ray") || "",
            },
            // Pass user's API key for community models that need billing passthrough (e.g., NomNom)
            userApiKey: c.req.header("x-user-api-key") || "",
        };

        const completion = await generateTextBasedOnModel(
            finalRequestData.messages,
            requestWithUserInfo,
        );

        // Ensure completion has the request ID
        completion.id = requestId;

        // Check if completion contains an error
        if (completion.error) {
            errorLog(
                "Completion error details: %s",
                JSON.stringify(completion.error, null, 2),
            );

            // Return proper error response for both streaming and non-streaming
            const errorObj =
                typeof completion.error === "string"
                    ? { message: completion.error }
                    : completion.error;

            const error: any = new Error(
                errorObj.message || "An error occurred",
            );

            // Add the details if they exist
            if (errorObj.details) {
                error.response = { data: errorObj.details };
            }

            return await sendErrorResponse(
                c,
                error,
                requestData,
                errorObj.status || 500,
            );
        }

        const responseText = completion.stream
            ? "Streaming response"
            : completion.choices?.[0]?.message?.content || "";

        log("Generated response", responseText);

        if (requestData.stream) {
            log("Sending streaming response with sendAsOpenAIStream");
            // Add requestData to completion object for access in streaming ad wrapper
            completion.requestData = requestData;
            return await sendAsOpenAIStream(c, completion);
        } else {
            if (c.req.method === "GET") {
                return sendContentResponse(c, completion);
            } else if (c.req.path === "/") {
                // For POST requests to the root path, also send plain text
                return sendContentResponse(c, completion);
            } else {
                return sendOpenAIResponse(c, completion);
            }
        }
    } catch (error: any) {
        // Handle errors in streaming mode differently
        if (requestData.stream) {
            log("Error in streaming mode:", error.message);
            errorLog("Error stack:", error.stack);

            // Simply pass through the error using sendErrorResponse
            return await sendErrorResponse(
                c,
                error,
                requestData,
                error.status || error.code || 500,
            );
        }

        return sendErrorResponse(c, error, requestData);
    }
}

// Helper function for consistent error responses
export async function sendErrorResponse(
    c: Context,
    error: any,
    requestData: any,
    statusCode = 500,
) {
    const responseStatus = error.status || statusCode;
    const errorTypes: Record<number, string> = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        429: "Too Many Requests",
    };
    const errorType = errorTypes[responseStatus] || "Internal Server Error";

    const errorResponse = {
        error: errorType,
        message: error.message || "An error occurred",
        requestId: Math.random().toString(36).substring(7),
        requestParameters: requestData || {},
    };

    // Include upstream error details if available
    const errorDetails = error.details || error.response?.data;
    if (errorDetails) errorResponse.details = errorDetails;

    // Extract client information (for logs only)
    const clientInfo = {
        ip: getIp(c.req.raw) || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        referer: c.req.header("referer") || "unknown",
        origin: c.req.header("origin") || "unknown",
        cf_ray: c.req.header("cf-ray") || "",
    };

    // Extract request parameters (sanitized)
    const sanitizedRequestData = requestData
        ? {
              model: requestData.model || "unknown",
              temperature: requestData.temperature,
              max_tokens: requestData.max_tokens,
              top_p: requestData.top_p,
              frequency_penalty: requestData.frequency_penalty,
              presence_penalty: requestData.presence_penalty,
              stream: requestData.stream,
              referrer: requestData.referrer || "unknown",
              messageCount: requestData.messages
                  ? requestData.messages.length
                  : 0,
              totalMessageLength: requestData.messages
                  ? requestData.messages?.reduce?.(
                        (total: number, msg: any) =>
                            total +
                            (typeof msg?.content === "string"
                                ? msg.content.length
                                : 0),
                        0,
                    )
                  : 0,
          }
        : "no request data";

    // Extract username from auth result if available
    const authResult = (c as any).authResult || {};
    const userContext = authResult.username
        ? `${authResult.username} (${authResult.userId})`
        : "anonymous";

    // Log comprehensive error information (for internal use only)
    errorLog("Error occurred:", {
        error: {
            message: error.message,
            status: responseStatus,
            details: error.details,
        },
        user: {
            username: authResult.username || null,
            userId: authResult.userId || null,
            context: userContext,
        },
        model: error.model || requestData?.model || "unknown",
        provider: error.provider || "Pollinations",
        originalProvider: error.originalProvider,
        clientInfo,
        requestData: sanitizedRequestData,
        stack: error.stack,
    });

    // Special logging for rate limit errors with clear username identification
    if (responseStatus === 429) {
        if (authResult.username) {
            errorLog(
                "🚫 RATE LIMIT ERROR: User %s (%s) exceeded limits - IP: %s, tier: %s, model: %s",
                authResult.username,
                authResult.userId,
                clientInfo.ip,
                authResult.tier,
                requestData?.model || "unknown",
            );
        } else {
            errorLog(
                "🚫 RATE LIMIT ERROR: Anonymous user exceeded limits - IP: %s, model: %s",
                clientInfo.ip,
                requestData?.model || "unknown",
            );
        }
    }

    return c.json(errorResponse, responseStatus);
}

// Generate a unique ID with pllns_ prefix
function generatePollinationsId() {
    const hash = crypto.randomBytes(16).toString("hex");
    return `pllns_${hash}`;
}

// Helper function for consistent success responses
export function sendOpenAIResponse(c: Context, completion: any) {
    // If this is a test object (like {foo: 'bar'}), pass it through directly
    if (completion.foo) {
        return c.json(completion);
    }

    // Set appropriate headers
    c.header("Content-Type", "application/json; charset=utf-8");

    // Add usage headers if available (GitHub issue #4638)
    if (completion.usage && completion.model) {
        const usage = openaiUsageToUsage(completion.usage);
        const usageHeaders = buildUsageHeaders(completion.model, usage);

        for (const [key, value] of Object.entries(usageHeaders)) {
            c.header(key, String(value));
        }
    }

    // Follow thin proxy approach - pass through the response as-is
    // Only add required fields if they're missing
    const response = {
        ...completion,
        id: completion.id || generatePollinationsId(),
        object: completion.object || "chat.completion",
        created: completion.created || Date.now(),
    };

    return c.json(response);
}

export function sendContentResponse(c: Context, completion: any) {
    // Add usage headers if available (GitHub issue #4638)
    if (
        completion &&
        typeof completion === "object" &&
        completion.usage &&
        completion.model
    ) {
        const usage = openaiUsageToUsage(completion.usage);
        const usageHeaders = buildUsageHeaders(completion.model, usage);

        for (const [key, value] of Object.entries(usageHeaders)) {
            c.header(key, String(value));
        }
    }

    // Handle the case where the completion is already a string or simple object
    if (typeof completion === "string") {
        c.header("Content-Type", "text/plain; charset=utf-8");
        c.header("Cache-Control", "public, max-age=31536000, immutable");
        return c.text(completion);
    }

    // Only handle OpenAI-style responses (with choices array)
    if (completion.choices?.[0]) {
        const message = completion.choices[0].message;

        // If message is a string, send it directly
        if (typeof message === "string") {
            c.header("Content-Type", "text/plain; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.text(message);
        }

        // If message is not an object, convert to string
        if (!message || typeof message !== "object") {
            c.header("Content-Type", "text/plain; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.text(String(message));
        }

        // If the message contains audio, send the audio data as binary
        if (message.audio?.data) {
            c.header("Content-Type", "audio/mpeg");
            c.header("Cache-Control", "public, max-age=31536000, immutable");

            // Convert base64 data to binary
            const audioBuffer = Buffer.from(message.audio.data, "base64");
            return c.body(audioBuffer);
        }
        // For simple text responses, return just the content as plain text
        // This is the most common case and should be prioritized
        else if (message.content) {
            c.header("Content-Type", "text/plain; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            // Append citations if present (e.g., from Perplexity)
            let content = message.content;
            if (completion.citations?.length > 0) {
                content += "\n\n---\nSources:\n";
                completion.citations.forEach((url: string, index: number) => {
                    content += `[${index + 1}] ${url}\n`;
                });
            }
            return c.text(content);
        }
        // If there's other non-text content, return the message as JSON
        else if (Object.keys(message).length > 0) {
            c.header("Content-Type", "application/json; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.json(message);
        }
    }
    // Fallback for any other response structure
    else {
        errorLog("Unrecognized completion format:", JSON.stringify(completion));
        const error: any = new Error("Unrecognized response format from model");
        error.status = 500;
        throw error;
    }
}

// Helper function to process requests with queueing and caching logic
async function processRequest(c: Context, requestData: any) {
    // Authentication and rate limiting is now handled by enter.pollinations.ai
    // Just call handleRequest directly
    return await handleRequest(c, requestData);
}

// Helper function to check if a model is an audio model and add necessary parameters
function prepareRequestParameters(requestParams: any) {
    // Use registry to check if model supports audio output
    let isAudioModel = false;
    try {
        const serviceDef = getServiceDefinition(requestParams.model);
        isAudioModel = serviceDef?.outputModalities?.includes("audio") ?? false;
    } catch {
        // Model not in registry, fall back to false
    }

    log("Is audio model:", isAudioModel);

    // Create the final parameters object
    const finalParams = {
        ...requestParams,
    };

    // Add audio parameters if it's an audio model
    if (isAudioModel) {
        // Get the voice parameter from the request or use "alloy" as default
        const voice =
            requestParams.voice || requestParams.audio?.voice || "amuch";
        log(
            "Adding audio parameters for audio model:",
            requestParams.model,
            "with voice:",
            voice,
        );

        // Only add modalities and audio if not already provided in the request
        if (!finalParams.modalities) {
            finalParams.modalities = ["text", "audio"];
        }

        // If audio format is already specified in the request, use that
        // Otherwise, use pcm16 for streaming and mp3 for non-streaming
        if (!finalParams.audio) {
            finalParams.audio = {
                voice: voice,
                format: requestParams.stream ? "pcm16" : "mp3",
            };
        } else if (!finalParams.audio.format) {
            // If audio object exists but format is not specified
            finalParams.audio.format = requestParams.stream ? "pcm16" : "mp3";
        }

        // Ensure these parameters are preserved in the final request
        requestParams.modalities = finalParams.modalities;
        requestParams.audio = finalParams.audio;
    }

    return finalParams;
}

// Helper to create Express-like request object for getRequestData
function createExpressLikeRequest(c: Context, body: any = null) {
    const url = new URL(c.req.url);
    const query: any = {};
    url.searchParams.forEach((value, key) => {
        query[key] = value;
    });

    // For catch-all routes, extract the path as params[0]
    const params: any = { ...c.req.param() };
    const wildcardPath = c.req.param("*") || c.req.path.slice(1); // Remove leading /
    if (wildcardPath) {
        params[0] = wildcardPath;
    }

    return {
        query,
        body: body || {},
        path: c.req.path,
        params,
        method: c.req.method,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
    };
}

app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.messages || !Array.isArray(body.messages)) {
        return c.json({ error: "Invalid messages array" }, 400);
    }

    const req = createExpressLikeRequest(c, body);
    const requestParams = getRequestData(req as any);
    const finalRequestParams = prepareRequestParameters(requestParams);

    try {
        return await processRequest(c, finalRequestParams);
    } catch (error: any) {
        return sendErrorResponse(c, error, requestParams);
    }
});

app.get("/openai/models", (c) => {
    const models = availableModels.map((model: any) => {
        // Get provider from cost data using the model's config
        const _config =
            typeof model.config === "function" ? model.config() : model.config;
        return {
            id: model.name,
            object: "model",
            created: Date.now(),
        };
    });
    return c.json({
        object: "list",
        data: models,
    });
});

// POST /openai/* request handler
app.post("/openai*", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const req = createExpressLikeRequest(c, body);
    const requestParams = {
        ...getRequestData(req as any),
        isPrivate: true,
        private: true,
    };

    try {
        return await processRequest(c, requestParams);
    } catch (error: any) {
        return sendErrorResponse(c, error, requestParams);
    }
});

// OpenAI-compatible v1 endpoint for chat completions
app.post("/v1/chat/completions", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const req = createExpressLikeRequest(c, body);
    const requestParams = {
        ...getRequestData(req as any),
        isPrivate: true,
    };

    try {
        return await processRequest(c, requestParams);
    } catch (error: any) {
        return sendErrorResponse(c, error, requestParams);
    }
});

async function sendAsOpenAIStream(c: Context, completion: any) {
    log("sendAsOpenAIStream called with completion type:", typeof completion);
    if (completion) {
        log("Completion properties:", {
            hasStream: completion.stream,
            hasResponseStream: !!completion.responseStream,
            errorPresent: !!completion.error,
        });
    }

    // Handle error responses in streaming mode
    if (completion.error) {
        errorLog(
            "Error detected in streaming request, this should not happen, errors should be handled before reaching here",
        );
        // Just return, as the error should have been handled already
        return c.text("");
    }

    // Handle streaming response from the API
    const responseStream = completion.responseStream;

    return stream(c, async (stream) => {
        c.header("Content-Type", "text/event-stream; charset=utf-8");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        // If we have a responseStream, try to proxy it
        if (responseStream) {
            log("Attempting to proxy stream to client");

            // Pipe stream data to the client
            for await (const chunk of responseStream) {
                await stream.write(chunk);
            }
        } else {
            // If we get here, we couldn't handle the stream properly
            log(
                "Could not handle stream properly, falling back to default response. Stream type:",
                typeof responseStream,
                "Stream available:",
                !!responseStream,
            );
            await stream.write(
                `data: ${JSON.stringify({
                    choices: [
                        {
                            delta: {
                                content:
                                    "Streaming response could not be processed.",
                            },
                            finish_reason: "stop",
                            index: 0,
                        },
                    ],
                })}\n\n`,
            );
            await stream.write("data: [DONE]\n\n");
        }
    });
}

async function generateTextBasedOnModel(messages: any[], options: any) {
    // Gateway must provide a valid model - no fallback
    if (!options.model) {
        throw new Error("Model parameter is required");
    }
    const model = options.model;

    log("Using model:", model, "with options:", JSON.stringify(options));

    try {
        // Log if streaming is enabled
        if (options.stream) {
            log(
                "Streaming mode enabled for model:",
                model,
                "stream value:",
                options.stream,
            );
        }

        const processedMessages = messages;

        // Log the messages being sent
        log(
            "Sending messages to model handler:",
            JSON.stringify(
                processedMessages.map((m: any) => ({
                    role: m.role,
                    content:
                        typeof m.content === "string"
                            ? `${m.content.substring(0, 50)}...`
                            : "[non-string content]",
                })),
            ),
        );

        // Call generateTextPortkey with the processed messages and options
        const response = await generateTextPortkey(processedMessages, options);

        // Log streaming response details
        if (options.stream && response) {
            log("Received streaming response from handler:", response);
        }

        return response;
    } catch (error: any) {
        errorLog(
            "Error in generateTextBasedOnModel:",
            JSON.stringify({
                error: error.message,
                model: model,
                provider: error.provider || "unknown",
                requestParams: {
                    ...options,
                    messages: messages
                        ? messages.map((m: any) => ({
                              role: m.role,
                              content:
                                  typeof m.content === "string"
                                      ? m.content.substring(0, 100) +
                                        (m.content.length > 100 ? "..." : "")
                                      : "[non-string content]",
                          }))
                        : "none",
                },
                errorDetails: error.response?.data || null,
                stack: error.stack,
            }),
        );

        // For streaming errors, return a special error response that can be streamed
        if (options.stream) {
            // Get error details from error.details or parse error.response.data
            let errorDetails = error.details || null;
            if (!errorDetails && error.response?.data) {
                try {
                    errorDetails =
                        typeof error.response.data === "string"
                            ? JSON.parse(error.response.data)
                            : error.response.data;
                } catch {
                    errorDetails = error.response.data;
                }
            }

            // Return an error object with detailed information
            return {
                error: {
                    message:
                        error.message ||
                        "An error occurred during text generation",
                    status: error.status || error.code || 500,
                    details: errorDetails,
                },
            };
        }

        throw error;
    }
}

export default app;

// GET request handler (catch-all)
app.get("/*", async (c) => {
    const req = createExpressLikeRequest(c);
    const requestData = getRequestData(req as any);
    const finalRequestData = prepareRequestParameters(requestData);

    try {
        // For streaming requests, handle them with the same code paths as POST requests
        // This ensures consistent handling of streaming for both GET and POST
        return await processRequest(c, finalRequestData);
    } catch (error: any) {
        errorLog("Error in catch-all GET handler: %s", error.message);
        return sendErrorResponse(c, error, requestData);
    }
});
