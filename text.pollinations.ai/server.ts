import crypto from "node:crypto";
import debug from "debug";
import dotenv from "dotenv";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import type { Context } from "hono";
// Import shared utilities
import { getIp } from "../shared/extractFromRequest.js";
import { getServiceDefinition } from "../shared/registry/registry.js";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
} from "../shared/registry/usage-headers.js";
import { availableModels, findModelByName } from "./availableModels.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { getRequestData } from "./requestUtils.js";
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = new Hono();

const log = debug("pollinations:server");
const errorLog = debug("pollinations:error");
const authLog = debug("pollinations:auth");

// CORS middleware
app.use("*", cors());

app.use(
    "*",
    bodyLimit({
        maxSize: 20 * 1024 * 1024,
    }),
);

app.use("*", async (c, next) => {
    const token = c.req.header("x-enter-token");
    const expectedToken = process.env.PLN_ENTER_TOKEN;

    if (!expectedToken) {
        authLog("PLN_ENTER_TOKEN not configured - allowing request");
        return await next();
    }

    if (token !== expectedToken) {
        authLog("❌ Invalid or missing PLN_ENTER_TOKEN from IP:", getIp(c.req.raw));
        return c.json({ error: "Unauthorized" }, 403);
    }

    authLog("✅ Valid PLN_ENTER_TOKEN from IP:", getIp(c.req.raw));
    await next();
});

app.get("/", (c) => {
    return c.redirect(
        "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md",
        301,
    );
});

app.get("/crossdomain.xml", (c) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`;
    c.header("Content-Type", "application/xml");
    return c.text(xml);
});

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

async function handleRequest(c: Context, requestData: any): Promise<Response> {
    log(
        "Request: model=%s referrer=%s",
        requestData.model,
        requestData.referrer,
    );
    log("Request data: %O", requestData);

    try {
        const requestId = generatePollinationsId();
        const authResult = (c as any).authResult || {};

        const model = findModelByName(requestData.model);

        log(`Model lookup: model=${requestData.model}, found=${!!model}`);

        if (!model) {
            log(`Model not found: ${requestData.model}`);
            const error: any = new Error(
                `Model not found: ${requestData.model}`,
            );
            error.status = 404;
            return await sendErrorResponse(c, error, requestData, 404);
        }

        const { messages: _, ...requestDataWithoutMessages } = requestData;
        const requestWithUserInfo = {
            ...requestDataWithoutMessages,
            userInfo: {
                ...authResult,
                referrer: requestData.referrer || "unknown",
                cf_ray: c.req.header("cf-ray") || "",
            },
            userApiKey: c.req.header("x-user-api-key") || "",
        };

        const completion = await generateTextBasedOnModel(
            requestData.messages,
            requestWithUserInfo,
        );

        completion.id = requestId;

        if (completion.error) {
            errorLog(
                "Completion error: %s",
                JSON.stringify(completion.error, null, 2),
            );

            const errorObj =
                typeof completion.error === "string"
                    ? { message: completion.error }
                    : completion.error;

            const error: any = new Error(
                errorObj.message || "An error occurred",
            );
            if (errorObj.details) error.response = { data: errorObj.details };

            return await sendErrorResponse(
                c,
                error,
                requestData,
                errorObj.status || 500,
            );
        }

        log(
            "Generated response",
            completion.stream
                ? "Streaming"
                : completion.choices?.[0]?.message?.content || "",
        );

        if (requestData.stream) {
            completion.requestData = requestData;
            return await sendAsOpenAIStream(c, completion);
        }

        if (c.req.method === "GET" || c.req.path === "/") {
            return sendContentResponse(c, completion);
        }
        return sendOpenAIResponse(c, completion);
    } catch (error: any) {
        if (requestData.stream) {
            log("Error in streaming mode:", error.message);
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

    const errorDetails = error.details || error.response?.data;
    const errorResponse: any = {
        error: errorType,
        message: error.message || "An error occurred",
        requestId: Math.random().toString(36).substring(7),
        requestParameters: requestData || {},
    };
    if (errorDetails) errorResponse.details = errorDetails;

    const clientInfo = {
        ip: getIp(c.req.raw) || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        referer: c.req.header("referer") || "unknown",
        origin: c.req.header("origin") || "unknown",
        cf_ray: c.req.header("cf-ray") || "",
    };

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

    const authResult = (c as any).authResult || {};
    const userContext = authResult.username
        ? `${authResult.username} (${authResult.userId})`
        : "anonymous";

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

function generatePollinationsId(): string {
    const hash = crypto.randomBytes(16).toString("hex");
    return `pllns_${hash}`;
}

export function sendOpenAIResponse(c: Context, completion: any): Response {
    if (completion.foo) {
        return c.json(completion);
    }

    c.header("Content-Type", "application/json; charset=utf-8");

    if (completion.usage && completion.model) {
        const usage = openaiUsageToUsage(completion.usage);
        const usageHeaders = buildUsageHeaders(completion.model, usage);

        for (const [key, value] of Object.entries(usageHeaders)) {
            c.header(key, String(value));
        }
    }

    const response = {
        ...completion,
        id: completion.id || generatePollinationsId(),
        object: completion.object || "chat.completion",
        created: completion.created || Date.now(),
    };

    return c.json(response);
}

export function sendContentResponse(c: Context, completion: any): Response {
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

    if (typeof completion === "string") {
        c.header("Content-Type", "text/plain; charset=utf-8");
        c.header("Cache-Control", "public, max-age=31536000, immutable");
        return c.text(completion);
    }

    if (completion.choices?.[0]) {
        const message = completion.choices[0].message;

        if (typeof message === "string") {
            c.header("Content-Type", "text/plain; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.text(message);
        }

        if (!message || typeof message !== "object") {
            c.header("Content-Type", "text/plain; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.text(String(message));
        }

        if (message.audio?.data) {
            c.header("Content-Type", "audio/mpeg");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.body(Buffer.from(message.audio.data, "base64"));
        } else if (message.content) {
            c.header("Content-Type", "text/plain; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            let content = message.content;
            if (completion.citations?.length > 0) {
                content += "\n\n---\nSources:\n";
                completion.citations.forEach((url: string, index: number) => {
                    content += `[${index + 1}] ${url}\n`;
                });
            }
            return c.text(content);
        } else if (Object.keys(message).length > 0) {
            c.header("Content-Type", "application/json; charset=utf-8");
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            return c.json(message);
        }
    } else {
        errorLog("Unrecognized completion format:", JSON.stringify(completion));
        const error: any = new Error("Unrecognized response format from model");
        error.status = 500;
        throw error;
    }
}

async function processRequest(c: Context, requestData: any): Promise<Response> {
    return await handleRequest(c, requestData);
}

function prepareRequestParameters(requestParams: any): any {
    let isAudioModel = false;
    try {
        const serviceDef = getServiceDefinition(requestParams.model);
        isAudioModel = serviceDef?.outputModalities?.includes("audio") ?? false;
    } catch {
        // Model not in registry
    }

    log("Is audio model:", isAudioModel);

    const finalParams = {
        ...requestParams,
    };

    if (isAudioModel) {
        const voice =
            requestParams.voice || requestParams.audio?.voice || "amuch";
        log(
            "Adding audio parameters for model:",
            requestParams.model,
            "voice:",
            voice,
        );

        if (!finalParams.modalities) {
            finalParams.modalities = ["text", "audio"];
        }

        if (!finalParams.audio) {
            finalParams.audio = {
                voice,
                format: requestParams.stream ? "pcm16" : "mp3",
            };
        } else if (!finalParams.audio.format) {
            finalParams.audio.format = requestParams.stream ? "pcm16" : "mp3";
        }

        requestParams.modalities = finalParams.modalities;
        requestParams.audio = finalParams.audio;
    }

    return finalParams;
}

function createExpressLikeRequest(c: Context, body: any = null): any {
    const url = new URL(c.req.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
        query[key] = value;
    });

    const params: any = { ...c.req.param() };
    const wildcardPath = c.req.param("*") || c.req.path.slice(1);
    if (wildcardPath) params[0] = wildcardPath;

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

async function sendAsOpenAIStream(
    c: Context,
    completion: any,
): Promise<Response> {
    log("sendAsOpenAIStream:", {
        stream: completion.stream,
        hasResponseStream: !!completion.responseStream,
    });

    if (completion.error) {
        errorLog("Error detected in streaming request");
        return c.text("");
    }

    const responseStream = completion.responseStream;

    // Set headers BEFORE returning stream (headers set inside callback are ignored)
    c.header("Content-Type", "text/event-stream; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    return stream(c, async (stream) => {
        if (responseStream) {
            for await (const chunk of responseStream) {
                await stream.write(chunk);
            }
        } else {
            log("No responseStream available");
            await stream.write(
                `data: ${JSON.stringify({ choices: [{ delta: { content: "Streaming response could not be processed." }, finish_reason: "stop", index: 0 }] })}\n\n`,
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

export default app;
