import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import debug from "debug";
import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";
import { Transform } from "stream";
import { availableModels } from "./availableModels.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { setupFeedEndpoint, sendToFeedListeners } from "./feed.js";
import { processRequestForAds } from "./ads/initRequestFilter.js";
import { createStreamingAdWrapper } from "./ads/streamingAdWrapper.js";
import { getRequestData } from "./requestUtils.js";

// Import shared utilities
import { getIp } from "../shared/extractFromRequest.js";
import {
    buildUsageHeaders,
    openaiUsageToTokenUsage,
} from "../shared/registry/usage-headers.js";
import { getServiceDefinition } from "../shared/registry/registry.js";

// Load environment variables including .env.local overrides
// Load .env.local first (higher priority), then .env as fallback
dotenv.config({ path: ".env.local" });
dotenv.config();

// Shared authentication and queue is initialized automatically in ipQueue.js

const BANNED_PHRASES = [];

// const blockedIPs = new Set();
const blockedIPs = new Set();

async function blockIP(ip) {
    // Only proceed if IP isn't already blocked
    if (!blockedIPs.has(ip)) {
        blockedIPs.add(ip);
        log("IP blocked:", ip);

        try {
            // Append IP to log file with newline
            await fs.appendFile(BLOCKED_IPS_LOG, `${ip}\n`, "utf8");
        } catch (error) {
            errorLog("Failed to write blocked IP to log file:", error);
        }
    }
}

function isIPBlocked(ip) {
    return blockedIPs.has(ip);
}

const app = express();

const log = debug("pollinations:server");
const errorLog = debug("pollinations:error");
const authLog = debug("pollinations:auth");
const BLOCKED_IPS_LOG = path.join(process.cwd(), "blocked_ips.txt");

// Load blocked IPs from file on startup
async function loadBlockedIPs() {
    try {
        const data = await fs.readFile(BLOCKED_IPS_LOG, "utf8");
        const ips = data.split("\n").filter((ip) => ip.trim());
        for (const ip of ips) {
            blockedIPs.add(ip.trim());
        }
        log(`Loaded ${blockedIPs.size} blocked IPs from file`);
    } catch (error) {
        if (error.code !== "ENOENT") {
            errorLog("Error loading blocked IPs:", error);
        }
    }
}

// Load blocked IPs before starting server
loadBlockedIPs().catch((error) => {
    errorLog("Failed to load blocked IPs:", error);
});

// Middleware to block IPs
app.use((req, res, next) => {
    const ip = getIp(req);
    if (isIPBlocked(ip)) {
        return res.status(403).end();
    }
    next();
});

// Remove the custom JSON parsing middleware and use the standard bodyParser
app.use(bodyParser.json({ limit: "20mb" }));
app.use(cors());

// Middleware to verify ENTER_TOKEN (after CORS for consistency)
app.use((req, res, next) => {
    const token = req.headers["x-enter-token"];
    const expectedToken = process.env.ENTER_TOKEN;

    if (!expectedToken) {
        // If ENTER_TOKEN is not configured, allow all requests (backward compatibility)
        authLog("!  ENTER_TOKEN not configured - allowing request");
        return next();
    }

    if (token !== expectedToken) {
        authLog("❌ Invalid or missing ENTER_TOKEN from IP:", getIp(req));
        return res.status(403).json({ error: "Unauthorized" });
    }

    authLog("✅ Valid ENTER_TOKEN from IP:", getIp(req));
    next();
});
// New route handler for root path
app.get("/", (req, res) => {
    res.redirect(
        301,
        "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md",
    );
});

// Serve crossdomain.xml for Flash connections
app.get("/crossdomain.xml", (req, res) => {
    res.setHeader("Content-Type", "application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`);
});

app.set("trust proxy", true);

// Queue configuration for text service
const QUEUE_CONFIG = {
    interval: 18000, // 18 seconds between requests per IP (no auth)
};

// Using getIp from shared auth-utils.js

// Deprecated /models endpoint - moved to gateway
app.get("/models", (req, res) => {
    res.status(410).json({
        error: "Endpoint moved",
        message:
            "The /models endpoint has been moved to the API gateway. Please use: https://enter.pollinations.ai/api/generate/text/models",
        deprecated_endpoint: `${req.protocol}://${req.get("host")}/models`,
        new_endpoint: "https://enter.pollinations.ai/api/generate/text/models",
        documentation: "https://enter.pollinations.ai/api/docs",
    });
});

setupFeedEndpoint(app);

// Helper function to handle both GET and POST requests
async function handleRequest(req, res, requestData) {
    const startTime = Date.now();
    log(
        "Request: model=%s referrer=%s",
        requestData.model,
        requestData.referrer,
    );
    log("Request data: %O", requestData);

    // if (requestData.referrer === "Aiko_Roblox_Game")
    //     throw new Error("blocked temporarily");

    try {
        // Generate a unique ID for this request
        const requestId = generatePollinationsId();

        // Get user info from authentication if available
        const authResult = req.authResult || {};

        // Model lookup
        const model = availableModels.find(
            (m) =>
                m.name === requestData.model ||
                m.aliases?.includes(requestData.model),
        );

        log(`Model lookup: model=${requestData.model}, found=${!!model}`);

        // All requests from enter.pollinations.ai - tier checks bypassed
        if (!model) {
            log(`Model not found: ${requestData.model}`);
            const error = new Error(`Model not found: ${requestData.model}`);
            error.status = 404;
            await sendErrorResponse(res, req, error, requestData, 404);
            return;
        }

        // Capture the originally requested model before any mapping/overrides
        const requestedModel = requestData.model;

        // Use request data as-is (no user-specific model mapping)
        let finalRequestData = requestData;

        // Add user info to request data - using authResult directly as a thin proxy
        // Exclude messages from options to prevent overwriting transformed messages
        const { messages: _, ...requestDataWithoutMessages } = finalRequestData;
        const requestWithUserInfo = {
            ...requestDataWithoutMessages,
            userInfo: {
                ...authResult,
                referrer: requestData.referrer || "unknown",
                cf_ray: req.headers["cf-ray"] || "",
            },
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

            const error = new Error(errorObj.message || "An error occurred");

            // Add the details if they exist
            if (errorObj.details) {
                error.response = { data: errorObj.details };
            }

            await sendErrorResponse(
                res,
                req,
                error,
                requestData,
                errorObj.status || 500,
            );
            return;
        }

        // Process referral links if there's content in the response
        if (completion.choices?.[0]?.message?.content) {
            // Check if this is an audio response - if so, skip content processing
            const isAudioResponse =
                completion.choices?.[0]?.message?.audio !== undefined;

            // Skip ad processing for JSON mode responses
            if (!isAudioResponse && !requestData.jsonMode) {
                try {
                    const content = completion.choices[0].message.content;

                    // Then process regular referral links
                    const adString = await processRequestForAds(
                        req,
                        content,
                        requestData.messages,
                    );

                    // If an ad was generated, append it to the content
                    if (adString) {
                        completion.choices[0].message.content =
                            content + "\n\n" + adString;
                    }
                } catch (error) {
                    errorLog("Error processing content:", error);
                }
            }
        }

        const responseText = completion.stream
            ? "Streaming response"
            : completion.choices?.[0]?.message?.content || "";

        log("Generated response", responseText);

        // Extract token usage data
        const tokenUsage = completion.usage || {};

        // Send all requests to feed listeners, including private ones
        // The feed.js implementation will handle filtering for non-authenticated clients
        sendToFeedListeners(
            responseText,
            {
                ...requestData,
                ...tokenUsage,
            },
            getIp(req),
        );

        if (requestData.stream) {
            log("Sending streaming response with sendAsOpenAIStream");
            // Add requestData to completion object for access in streaming ad wrapper
            completion.requestData = requestData;
            await sendAsOpenAIStream(res, completion, req);
        } else {
            if (req.method === "GET") {
                sendContentResponse(res, completion);
            } else if (req.path === "/") {
                // For POST requests to the root path, also send plain text
                sendContentResponse(res, completion);
            } else {
                sendOpenAIResponse(res, completion);
            }
        }
    } catch (error) {
        // Handle errors in streaming mode differently
        if (requestData.stream) {
            log("Error in streaming mode:", error.message);
            errorLog("Error stack:", error.stack);

            // Simply pass through the error using sendErrorResponse
            await sendErrorResponse(
                res,
                req,
                error,
                requestData,
                error.status || error.code || 500,
            );
            return;
        }

        sendErrorResponse(res, req, error, requestData);
    }
}

// Helper function for consistent error responses
export async function sendErrorResponse(
    res,
    req,
    error,
    requestData,
    statusCode = 500,
) {
    const responseStatus = error.status || statusCode;
    const errorTypes = {
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
        ip: getIp(req) || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        referer: req.headers["referer"] || "unknown",
        origin: req.headers["origin"] || "unknown",
        cf_ray: req.headers["cf-ray"] || "",
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
                        (total, msg) =>
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
    const authResult = req.authResult || {};
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

    try {
        res.status(responseStatus).json(errorResponse);
    } catch (error) {
        console.error("Error sending error response:", error);
    }
}

// Generate a unique ID with pllns_ prefix
function generatePollinationsId() {
    const hash = crypto.randomBytes(16).toString("hex");
    return `pllns_${hash}`;
}

// Helper function for consistent success responses
export function sendOpenAIResponse(res, completion) {
    // If this is a test object (like {foo: 'bar'}), pass it through directly
    if (completion.foo) {
        res.json(completion);
        return;
    }

    // Set appropriate headers
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    // Add usage headers if available (GitHub issue #4638)
    if (completion.usage && completion.model) {
        const tokenUsage = openaiUsageToTokenUsage(completion.usage);
        const usageHeaders = buildUsageHeaders(completion.model, tokenUsage);

        for (const [key, value] of Object.entries(usageHeaders)) {
            res.setHeader(key, value);
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

    res.json(response);
}

export function sendContentResponse(res, completion) {
    // Add usage headers if available (GitHub issue #4638)
    if (
        completion &&
        typeof completion === "object" &&
        completion.usage &&
        completion.model
    ) {
        const tokenUsage = openaiUsageToTokenUsage(completion.usage);
        const usageHeaders = buildUsageHeaders(completion.model, tokenUsage);

        for (const [key, value] of Object.entries(usageHeaders)) {
            res.setHeader(key, value);
        }
    }

    // Handle the case where the completion is already a string or simple object
    if (typeof completion === "string") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(completion);
    }

    // Only handle OpenAI-style responses (with choices array)
    if (completion.choices && completion.choices[0]) {
        const message = completion.choices[0].message;

        // If message is a string, send it directly
        if (typeof message === "string") {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            );
            return res.send(message);
        }

        // If message is not an object, convert to string
        if (!message || typeof message !== "object") {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            );
            return res.send(String(message));
        }

        // If the message contains audio, send the audio data as binary
        if (message.audio && message.audio.data) {
            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            );

            // Convert base64 data to binary
            const audioBuffer = Buffer.from(message.audio.data, "base64");
            return res.send(audioBuffer);
        }
        // For simple text responses, return just the content as plain text
        // This is the most common case and should be prioritized
        else if (message.content) {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            );
            return res.send(message.content);
        }
        // If there's other non-text content, return the message as JSON
        else if (Object.keys(message).length > 0) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            );
            return res.json(message);
        }
    }
    // Fallback for any other response structure
    else {
        errorLog("Unrecognized completion format:", JSON.stringify(completion));
        return res.send("Response format not recognized");
    }
}

// Helper function to process requests with queueing and caching logic
async function processRequest(req, res, requestData) {
    const ip = getIp(req);

    // Check for blocked IPs first
    if (isIPBlocked(ip)) {
        errorLog("Blocked IP:", ip);
        const errorResponse = {
            error: "Forbidden",
            status: 403,
            details: {
                blockedIp: ip,
                timestamp: new Date().toISOString(),
            },
        };

        return res.status(403).json(errorResponse);
    }

    // Authentication and rate limiting is now handled by enter.pollinations.ai
    // Just call handleRequest directly
    await handleRequest(req, res, requestData);
}

// Helper function to check if a model is an audio model and add necessary parameters
function prepareRequestParameters(requestParams) {
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
    // finalParams.modalities = ["text", "image"]

    return finalParams;
}

app.post("/", async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        return res.status(400).json({ error: "Invalid messages array" });
    }

    const requestParams = getRequestData(req, true);
    const finalRequestParams = prepareRequestParameters(requestParams);

    try {
        await processRequest(req, res, finalRequestParams);
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams);
    }
});

app.get("/openai/models", (req, res) => {
    const models = availableModels.map((model) => {
        // Get provider from cost data using the model's config
        const config =
            typeof model.config === "function" ? model.config() : model.config;
        return {
            id: model.name,
            object: "model",
            created: Date.now(),
        };
    });
    res.json({
        object: "list",
        data: models,
    });
});

// POST /openai/* request handler
app.post("/openai*", async (req, res) => {
    const requestParams = {
        ...getRequestData(req),
        isPrivate: true,
        private: true,
    }; // figure out later if it should be isPrivate or private

    try {
        await processRequest(req, res, requestParams);
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams);
    }
});

// OpenAI-compatible v1 endpoint for chat completions
app.post("/v1/chat/completions", async (req, res) => {
    const requestParams = { ...getRequestData(req), isPrivate: true };

    try {
        await processRequest(req, res, requestParams);
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams);
    }
});

/**
 * Create a transform stream that captures usage data from SSE chunks
 * and adds HTTP trailers at the end (GitHub issue #4638)
 */
function createUsageCaptureTransform(res) {
    let finalUsage = null;
    let finalModel = null;

    return new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
            const chunkStr = chunk.toString();

            // Try to extract usage from chunks
            try {
                const dataMatches = chunkStr.match(/data: (.*?)(?:\n\n|$)/g);
                if (dataMatches) {
                    for (const match of dataMatches) {
                        const dataContent = match.replace(/^data: /, "").trim();
                        if (dataContent && dataContent !== "[DONE]") {
                            const data = JSON.parse(dataContent);
                            if (data.usage) {
                                finalUsage = data.usage;
                            }
                            if (data.model) {
                                finalModel = data.model;
                            }
                        }
                    }
                }
            } catch (err) {
                // Ignore parse errors
            }

            // Pass through unchanged
            this.push(chunk);
            callback();
        },
        flush(callback) {
            // Removed trailers as they were causing issues
            // TODO: Check if this function is still needed at all
            callback();
        },
    });
}

async function sendAsOpenAIStream(res, completion, req = null) {
    log("sendAsOpenAIStream called with completion type:", typeof completion);
    if (completion) {
        log("Completion properties:", {
            hasStream: completion.stream,
            hasResponseStream: !!completion.responseStream,
            errorPresent: !!completion.error,
        });
    }
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    // Set standard SSE headers
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Handle error responses in streaming mode
    if (completion.error) {
        errorLog(
            "Error detected in streaming request, this should not happen, errors should be handled before reaching here",
        );
        // Just return, as the error should have been handled already
        return;
    }

    // Handle streaming response from the API
    const responseStream = completion.responseStream;
    // If we have a responseStream, try to proxy it
    if (responseStream) {
        log("Attempting to proxy stream to client");

        // Get messages from the request data
        // For GET requests, messages will be in the request path
        // For POST requests, messages will be in the request body
        const messages = req
            ? // Try to get messages from different sources
              (req.body && req.body.messages) ||
              (req.requestData && req.requestData.messages) ||
              (completion.requestData && completion.requestData.messages) ||
              []
            : [];

        // Get jsonMode from request data
        const jsonMode = completion.requestData?.jsonMode || false;

        // Check if we have messages and should process the stream for ads
        if (req && messages.length > 0 && !jsonMode) {
            log("Processing stream for ads with", messages.length, "messages");

            // Create a wrapped stream that will add ads at the end
            const wrappedStream = await createStreamingAdWrapper(
                responseStream,
                req,
                messages,
            );

            // Pipe through usage capture to add trailers
            wrappedStream.pipe(res);

            // Handle client disconnect
            if (req)
                req.on("close", () => {
                    log("Client disconnected");
                    if (wrappedStream.destroy) {
                        wrappedStream.destroy();
                    }
                    if (responseStream.destroy) {
                        responseStream.destroy();
                    }
                });
        } else {
            // If no messages, no request object, or JSON mode, just pipe the stream directly
            log(
                "Skipping ad processing for stream" +
                    (jsonMode ? " (JSON mode)" : ""),
            );
            responseStream.pipe(res);

            // Handle client disconnect
            if (req)
                req.on("close", () => {
                    log("Client disconnected");
                    if (responseStream.destroy) {
                        responseStream.destroy();
                    }
                });
        }

        return;
    }

    // If we get here, we couldn't handle the stream properly
    log(
        "Could not handle stream properly, falling back to default response. Stream type:",
        typeof responseStream,
        "Stream available:",
        !!responseStream,
    );
    res.write(
        `data: ${JSON.stringify({
            choices: [
                {
                    delta: {
                        content: "Streaming response could not be processed.",
                    },
                    finish_reason: "stop",
                    index: 0,
                },
            ],
        })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
}

async function generateTextBasedOnModel(messages, options) {
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
                processedMessages.map((m) => ({
                    role: m.role,
                    content:
                        typeof m.content === "string"
                            ? m.content.substring(0, 50) + "..."
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
    } catch (error) {
        errorLog(
            "Error in generateTextBasedOnModel:",
            JSON.stringify({
                error: error.message,
                model: model,
                provider: error.provider || "unknown",
                requestParams: {
                    ...options,
                    messages: messages
                        ? messages.map((m) => ({
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
app.get("/*", async (req, res) => {
    const requestData = getRequestData(req);
    const finalRequestData = prepareRequestParameters(requestData);

    try {
        // For streaming requests, handle them with the same code paths as POST requests
        // This ensures consistent handling of streaming for both GET and POST
        await processRequest(req, res, finalRequestData);
    } catch (error) {
        errorLog("Error in catch-all GET handler: %s", error.message);
        sendErrorResponse(res, req, error, requestData);
    }
});
