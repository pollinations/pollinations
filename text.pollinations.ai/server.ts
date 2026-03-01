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
import {
    getServiceDefinition,
    type ServiceId,
} from "../shared/registry/registry.ts";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
} from "../shared/registry/usage-headers.ts";
import { availableModels, findModelByName } from "./availableModels.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { type ExpressLikeRequest, getRequestData } from "./requestUtils.js";
import type { ChatCompletion, RequestData, ServiceError } from "./types.js";

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
        return c.json({ error: "Unauthorized" }, 401);
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

function setUsageHeaders(c: Context, completion: ChatCompletion): void {
    if (completion?.usage && completion?.model) {
        const usage = openaiUsageToUsage(
            completion.usage as unknown as Parameters<
                typeof openaiUsageToUsage
            >[0],
        );
        const usageHeaders = buildUsageHeaders(completion.model, usage);
        for (const [key, value] of Object.entries(usageHeaders)) {
            c.header(key, String(value));
        }
    }
}

function parseErrorDetails(error: ServiceError): unknown {
    if (error.details) return error.details;
    const data = error.response?.data;
    if (!data) return null;
    if (typeof data !== "string") return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

function createExpressLikeRequest(
    c: Context,
    body: Record<string, unknown> | null = null,
): ExpressLikeRequest {
    const wildcardPath = c.req.param("*") || c.req.path.slice(1);
    const params: Record<string, string> = { ...c.req.param() };
    if (wildcardPath) params[0] = wildcardPath;

    return {
        query: Object.fromEntries(new URL(c.req.url).searchParams),
        body: (body || {}) as Record<string, unknown>,
        path: c.req.path,
        params,
        method: c.req.method,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
    };
}

function prepareRequestParameters(requestParams: RequestData): RequestData {
    let isAudioModel = false;
    try {
        const serviceDef = getServiceDefinition(
            requestParams.model as ServiceId,
        );
        isAudioModel = serviceDef?.outputModalities?.includes("audio") ?? false;
    } catch {
        // Model not in registry
    }

    if (!isAudioModel) return requestParams;

    const voice = requestParams.voice || requestParams.audio?.voice || "amuch";
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

const ERROR_TYPES: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    429: "Too Many Requests",
};

function sendOpenAIResponse(c: Context, completion: ChatCompletion): Response {
    setUsageHeaders(c, completion);

    return c.json({
        ...completion,
        id: completion.id || generatePollinationsId(),
        object: completion.object || "chat.completion",
        created: completion.created || Date.now(),
    });
}

function sendContentResponse(c: Context, completion: ChatCompletion): Response {
    setUsageHeaders(c, completion);
    c.header("Cache-Control", "public, max-age=31536000, immutable");

    if (!completion.choices?.[0]) {
        errorLog("Unrecognized completion format:", JSON.stringify(completion));
        const error: ServiceError = new Error(
            "Unrecognized response format from model",
        ) as ServiceError;
        error.status = 500;
        throw error;
    }

    const message = completion.choices[0].message;

    if (typeof message !== "object" || !message) {
        return c.text(String(message));
    }

    const audio = message.audio as Record<string, unknown> | undefined;
    if (audio?.data) {
        c.header("Content-Type", "audio/mpeg");
        return c.body(Buffer.from(audio.data as string, "base64"));
    }

    if (message.content) {
        let content = String(message.content);
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
        return c.json(message);
    }

    return c.text("");
}

function sendErrorResponse(
    c: Context,
    error: ServiceError,
    requestData: RequestData | null,
    statusCode = 500,
): Response {
    const responseStatus = error.status || statusCode;
    const errorType = ERROR_TYPES[responseStatus] || "Internal Server Error";

    const errorDetails = error.details || error.response?.data;
    const errorResponse: Record<string, unknown> = {
        error: errorType,
        message: error.message || "An error occurred",
        requestId: Math.random().toString(36).substring(7),
        requestParameters: requestData || {},
    };
    if (errorDetails) errorResponse.details = errorDetails;

    const authResult =
        (c as unknown as { authResult?: Record<string, unknown> }).authResult ||
        {};

    errorLog(
        "Error: status=%d model=%s user=%s ip=%s message=%s",
        responseStatus,
        error.model || requestData?.model || "unknown",
        authResult.username || "anonymous",
        getIp(c.req.raw) || "unknown",
        error.message,
    );

    if (error.details) {
        errorLog("Error details: %O", error.details);
    }

    return c.json(errorResponse, responseStatus as 400);
}

async function sendAsOpenAIStream(
    c: Context,
    completion: ChatCompletion,
): Promise<Response> {
    log(
        "sendAsOpenAIStream: stream=%s, hasResponseStream=%s",
        completion.stream,
        !!completion.responseStream,
    );

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
                await stream.write(chunk as string);
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
    requestData: RequestData,
): Promise<Response> {
    log(
        "Request: model=%s referrer=%s",
        requestData.model,
        requestData.referrer,
    );
    log("Request data: %O", requestData);

    try {
        const requestId = generatePollinationsId();
        const authResult =
            (c as unknown as { authResult?: Record<string, unknown> })
                .authResult || {};
        const modelDef = findModelByName(requestData.model);

        log("Model lookup: model=%s, found=%s", requestData.model, !!modelDef);

        if (!modelDef) {
            const err = new Error(
                `Model not found: ${requestData.model}`,
            ) as ServiceError;
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

        log(
            "Using model: %s, stream: %s",
            requestWithUserInfo.model,
            !!requestWithUserInfo.stream,
        );

        let completion: ChatCompletion;
        try {
            completion = await generateTextPortkey(
                requestData.messages,
                requestWithUserInfo,
            );
        } catch (thrown: unknown) {
            const error = thrown as ServiceError;
            errorLog(
                "Generation failed: model=%s provider=%s error=%s",
                requestWithUserInfo.model,
                error.provider || "unknown",
                error.message,
            );

            if (requestWithUserInfo.stream) {
                completion = {
                    error: {
                        message:
                            error.message ||
                            "An error occurred during text generation",
                        status:
                            error.status ||
                            (typeof error.code === "number" ? error.code : 500),
                        details: parseErrorDetails(error),
                    },
                };
            } else {
                throw error;
            }
        }

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

            const err = new Error(
                errorObj.message || "An error occurred",
            ) as ServiceError;
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
    } catch (thrown: unknown) {
        const error = thrown as ServiceError;
        return sendErrorResponse(
            c,
            error,
            requestData,
            error.status || (typeof error.code === "number" ? error.code : 500),
        );
    }
}

// --- Route handlers ---

function buildAndHandle(
    c: Context,
    body: Record<string, unknown> | null,
    overrides: Partial<RequestData> = {},
    prepare = false,
): Promise<Response> | Response {
    const req = createExpressLikeRequest(c, body);
    const requestData = { ...getRequestData(req), ...overrides };
    return handleRequest(
        c,
        prepare ? prepareRequestParameters(requestData) : requestData,
    );
}

app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.messages || !Array.isArray(body.messages)) {
        return c.json({ error: "Invalid messages array" }, 400);
    }
    return buildAndHandle(c, body, {}, true);
});

app.get("/openai/models", (c) => {
    const models = availableModels.map((model) => ({
        id: model.name,
        object: "model",
        created: Date.now(),
    }));
    return c.json({ object: "list", data: models });
});

app.post("/openai*", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return buildAndHandle(c, body);
});

app.post("/v1/chat/completions", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return buildAndHandle(c, body, { isPrivate: true });
});

app.get("/*", async (c) => {
    return buildAndHandle(c, null, {}, true);
});

export default app;
