import crypto from "node:crypto";
import debug from "debug";
import dotenv from "dotenv";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { getIp } from "../shared/extractFromRequest.js";
import { logIp } from "../shared/ipLogger.js";
import { getServiceDefinition } from "../shared/registry/registry.ts";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
} from "../shared/registry/usage-headers.ts";
import { availableModels, findModelByName } from "./availableModels.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { getRequestData } from "./requestUtils.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = new Hono();

const log = debug("pollinations:server");
const errorLog = debug("pollinations:error");
const authLog = debug("pollinations:auth");

// --- Middleware ---

app.use("*", cors());

app.use(
    "*",
    bodyLimit({
        maxSize: 20 * 1024 * 1024,
    }),
);

app.use("*", async (c, next) => {
    const ip = getIp(c.req.raw);
    const model = new URL(c.req.url).searchParams.get("model") || "unknown";
    logIp(ip, "text", `path=${c.req.path} model=${model}`);
    await next();
});

app.use("*", async (c, next) => {
    const token = c.req.header("x-enter-token");
    const expectedToken = process.env.PLN_ENTER_TOKEN;

    if (!expectedToken) {
        authLog("PLN_ENTER_TOKEN not configured - allowing request");
        await next();
        return;
    }

    if (token !== expectedToken) {
        authLog(
            "Invalid or missing PLN_ENTER_TOKEN from IP:",
            getIp(c.req.raw),
        );
        return c.json({ error: "Unauthorized" }, 403);
    }

    authLog("Valid PLN_ENTER_TOKEN from IP:", getIp(c.req.raw));
    await next();
});

// --- Static routes ---

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

// --- Helper functions ---

function generatePollinationsId(): string {
    const hash = crypto.randomBytes(16).toString("hex");
    return `pllns_${hash}`;
}

function setUsageHeaders(c: Context, completion: any): void {
    if (completion?.usage && completion?.model) {
        const usage = openaiUsageToUsage(completion.usage);
        const usageHeaders = buildUsageHeaders(completion.model, usage);
        for (const [key, value] of Object.entries(usageHeaders)) {
            c.header(key, String(value));
        }
    }
}

function summarizeMessages(messages: any[], maxLen = 50): any[] {
    return messages.map((m: any) => ({
        role: m.role,
        content:
            typeof m.content === "string"
                ? `${m.content.substring(0, maxLen)}${m.content.length > maxLen ? "..." : ""}`
                : "[non-string content]",
    }));
}

function parseErrorDetails(error: any): any {
    if (error.details) return error.details;
    if (!error.response?.data) return null;
    if (typeof error.response.data !== "string") return error.response.data;
    try {
        return JSON.parse(error.response.data);
    } catch {
        return error.response.data;
    }
}

function createExpressLikeRequest(c: Context, body: any = null): any {
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const wildcardPath = c.req.param("*") || c.req.path.slice(1);
    const params: any = { ...c.req.param() };
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

function prepareRequestParameters(requestParams: any): any {
    let isAudioModel = false;
    try {
        const serviceDef = getServiceDefinition(requestParams.model);
        isAudioModel =
            serviceDef?.outputModalities?.includes("audio") ?? false;
    } catch {
        // Model not in registry
    }

    if (!isAudioModel) {
        return { ...requestParams };
    }

    const voice =
        requestParams.voice || requestParams.audio?.voice || "amuch";
    const audioFormat = requestParams.stream ? "pcm16" : "mp3";

    log(
        "Adding audio parameters for model: %s, voice: %s",
        requestParams.model,
        voice,
    );

    return {
        ...requestParams,
        modalities: requestParams.modalities || ["text", "audio"],
        audio: requestParams.audio
            ? {
                  ...requestParams.audio,
                  format: requestParams.audio.format || audioFormat,
              }
            : { voice, format: audioFormat },
    };
}

// --- Response senders ---

export function sendOpenAIResponse(c: Context, completion: any): Response {
    c.header("Content-Type", "application/json; charset=utf-8");
    setUsageHeaders(c, completion);

    const response = {
        ...completion,
        id: completion.id || generatePollinationsId(),
        object: completion.object || "chat.completion",
        created: completion.created || Date.now(),
    };

    return c.json(response);
}

export function sendContentResponse(c: Context, completion: any): Response {
    setUsageHeaders(c, completion);
    c.header("Cache-Control", "public, max-age=31536000, immutable");

    if (typeof completion === "string") {
        c.header("Content-Type", "text/plain; charset=utf-8");
        return c.text(completion);
    }

    if (!completion.choices?.[0]) {
        errorLog(
            "Unrecognized completion format:",
            JSON.stringify(completion),
        );
        const error: any = new Error(
            "Unrecognized response format from model",
        );
        error.status = 500;
        throw error;
    }

    const message = completion.choices[0].message;

    if (typeof message !== "object" || !message) {
        c.header("Content-Type", "text/plain; charset=utf-8");
        return c.text(String(message));
    }

    if (message.audio?.data) {
        c.header("Content-Type", "audio/mpeg");
        return c.body(Buffer.from(message.audio.data, "base64"));
    }

    if (message.content) {
        c.header("Content-Type", "text/plain; charset=utf-8");
        let content = message.content;
        if (completion.citations?.length > 0) {
            content += "\n\n---\nSources:\n";
            content += completion.citations
                .map((url: string, i: number) => `[${i + 1}] ${url}`)
                .join("\n");
            content += "\n";
        }
        return c.text(content);
    }

    if (Object.keys(message).length > 0) {
        c.header("Content-Type", "application/json; charset=utf-8");
        return c.json(message);
    }

    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.text("");
}

export function sendErrorResponse(
    c: Context,
    error: any,
    requestData: any,
    statusCode = 500,
): Response {
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

    const messages = requestData?.messages;
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
              messageCount: messages?.length ?? 0,
              totalMessageLength:
                  messages?.reduce?.(
                      (total: number, msg: any) =>
                          total +
                          (typeof msg?.content === "string"
                              ? msg.content.length
                              : 0),
                      0,
                  ) ?? 0,
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
        const userLabel = authResult.username
            ? `User ${authResult.username} (${authResult.userId})`
            : "Anonymous user";
        errorLog(
            "RATE LIMIT: %s exceeded limits - IP: %s, tier: %s, model: %s",
            userLabel,
            clientInfo.ip,
            authResult.tier || "none",
            requestData?.model || "unknown",
        );
    }

    return c.json(errorResponse, responseStatus);
}

async function sendAsOpenAIStream(
    c: Context,
    completion: any,
): Promise<Response> {
    log("sendAsOpenAIStream: stream=%s, hasResponseStream=%s",
        completion.stream, !!completion.responseStream);

    if (completion.error) {
        errorLog("Error detected in streaming request");
        return c.text("");
    }

    const responseStream = completion.responseStream;

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

// --- Core request handler ---

async function handleRequest(
    c: Context,
    requestData: any,
): Promise<Response> {
    log(
        "Request: model=%s referrer=%s",
        requestData.model,
        requestData.referrer,
    );
    log("Request data: %O", requestData);

    try {
        const requestId = generatePollinationsId();
        const authResult = (c as any).authResult || {};
        const modelDef = findModelByName(requestData.model);

        log("Model lookup: model=%s, found=%s", requestData.model, !!modelDef);

        if (!modelDef) {
            const err: any = new Error(
                `Model not found: ${requestData.model}`,
            );
            err.status = 404;
            return sendErrorResponse(c, err, requestData, 404);
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

            const err: any = new Error(
                errorObj.message || "An error occurred",
            );
            if (errorObj.details) err.response = { data: errorObj.details };

            return sendErrorResponse(
                c,
                err,
                requestData,
                errorObj.status || 500,
            );
        }

        log(
            "Generated response: %s",
            completion.stream
                ? "Streaming"
                : (completion.choices?.[0]?.message?.content || ""),
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
        return sendErrorResponse(
            c,
            error,
            requestData,
            error.status || error.code || 500,
        );
    }
}

async function generateTextBasedOnModel(
    messages: any[],
    options: any,
): Promise<any> {
    if (!options.model) {
        throw new Error("Model parameter is required");
    }

    log("Using model: %s, stream: %s", options.model, !!options.stream);
    log("Messages: %j", summarizeMessages(messages));

    try {
        return await generateTextPortkey(messages, options);
    } catch (error: any) {
        errorLog("Error in generateTextBasedOnModel: %j", {
            error: error.message,
            model: options.model,
            provider: error.provider || "unknown",
            messages: summarizeMessages(messages, 100),
            errorDetails: error.response?.data || null,
        });

        if (options.stream) {
            return {
                error: {
                    message:
                        error.message ||
                        "An error occurred during text generation",
                    status: error.status || error.code || 500,
                    details: parseErrorDetails(error),
                },
            };
        }

        throw error;
    }
}

// --- Route handlers ---

app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.messages || !Array.isArray(body.messages)) {
        return c.json({ error: "Invalid messages array" }, 400);
    }

    const req = createExpressLikeRequest(c, body);
    const requestParams = prepareRequestParameters(
        getRequestData(req as any),
    );
    return handleRequest(c, requestParams);
});

app.get("/openai/models", (c) => {
    const models = availableModels.map((model: any) => ({
        id: model.name,
        object: "model",
        created: Date.now(),
    }));
    return c.json({ object: "list", data: models });
});

app.post("/openai*", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const req = createExpressLikeRequest(c, body);
    const requestParams = {
        ...getRequestData(req as any),
        isPrivate: true,
        private: true,
    };
    return handleRequest(c, requestParams);
});

app.post("/v1/chat/completions", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const req = createExpressLikeRequest(c, body);
    const requestParams = {
        ...getRequestData(req as any),
        isPrivate: true,
    };
    return handleRequest(c, requestParams);
});

app.get("/*", async (c) => {
    const req = createExpressLikeRequest(c);
    const requestParams = prepareRequestParameters(
        getRequestData(req as any),
    );
    return handleRequest(c, requestParams);
});

export default app;
