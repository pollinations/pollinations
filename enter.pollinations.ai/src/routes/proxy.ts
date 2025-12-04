import { type Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth, AuthVariables } from "@/middleware/auth.ts";
import { polar, PolarVariables } from "@/middleware/polar.ts";
import type { Env } from "../env.ts";
import { track, type TrackEnv } from "@/middleware/track.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { imageCache } from "@/middleware/image-cache.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "@/middleware/validator.ts";
import {
    CreateChatCompletionResponseSchema,
    CreateChatCompletionRequestSchema,
    type CreateChatCompletionResponse,
    GetModelsResponseSchema,
} from "@/schemas/openai.ts";
import {
    createErrorResponseSchema,
    type ErrorStatusCode,
    getDefaultErrorMessage,
    KNOWN_ERROR_STATUS_CODES,
    UpstreamError,
} from "@/error.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import { resolveServiceId } from "@shared/registry/registry.ts";
import {
    ModelInfoSchema,
    getImageModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import { createFactory } from "hono/factory";

const factory = createFactory<Env>();

// Shared handler for OpenAI-compatible chat completions
const chatCompletionHandlers = factory.createHandlers(
    track("generate.text"),
    validator("json", CreateChatCompletionRequestSchema),
    async (c) => {
        const log = c.get("log");
        await c.var.auth.requireAuthorization();

        await checkBalance(c.var);

        const textServiceUrl =
            c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
        const targetUrl = proxyUrl(c, `${textServiceUrl}/openai`);
        const requestBody = await c.req.json();

        // Resolve model alias to service ID before proxying
        if (requestBody.model) {
            try {
                const resolvedServiceId = resolveServiceId(
                    requestBody.model,
                    "generate.text",
                );
                requestBody.model = resolvedServiceId;
            } catch (error) {
                log.warn("[PROXY] Failed to resolve model alias: {model}", {
                    model: requestBody.model,
                    error: String(error),
                });
                // Let it pass through - backend will handle invalid model error
            }
        }
        const response = await proxy(targetUrl, {
            method: c.req.method,
            headers: proxyHeaders(c),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            // Read upstream error and throw UpstreamError to get structured error response
            // This preserves the status code while providing consistent error format
            const responseText = await response.text();
            log.warn("[PROXY] Chat completions error {status}: {body}", {
                status: response.status,
                body: responseText,
            });
            throw new UpstreamError(response.status as ContentfulStatusCode, {
                message:
                    responseText || getDefaultErrorMessage(response.status),
                requestUrl: targetUrl,
            });
        }

        // add content filter headers if not streaming
        let contentFilterHeaders = {};
        if (!c.var.track.streamRequested) {
            const responseJson = await response.clone().json();
            const parsedResponse = CreateChatCompletionResponseSchema.parse(
                responseJson,
                { reportInput: true },
            );
            contentFilterHeaders =
                contentFilterResultsToHeaders(parsedResponse);
        }

        return new Response(response.body, {
            headers: {
                ...Object.fromEntries(response.headers),
                ...contentFilterHeaders,
            },
        });
    },
);

const errorResponseDescriptions = Object.fromEntries(
    KNOWN_ERROR_STATUS_CODES.map((status) => [
        status,
        {
            description: getDefaultErrorMessage(status),
            content: {
                "application/json": {
                    schema: resolver(createErrorResponseSchema(status)),
                },
            },
        },
    ]),
);

function errorResponses(...codes: ErrorStatusCode[]) {
    return Object.fromEntries(
        Object.entries(errorResponseDescriptions).filter(([status, _]) => {
            return codes.includes(Number(status) as ErrorStatusCode);
        }),
    );
}

export const proxyRoutes = new Hono<Env>()
    // Edge rate limiter: first line of defense (10 req/s per IP)
    .use("*", edgeRateLimit)
    .get(
        "/v1/models",
        describeRoute({
            tags: ["Text Generation"],
            description: "Get available text models (OpenAI-compatible).",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(GetModelsResponseSchema),
                        },
                    },
                },
                ...errorResponses(500),
            },
        }),
        async (c) => {
            return await proxy(`${c.env.TEXT_SERVICE_URL}/openai/models`, {
                headers: proxyHeaders(c),
            });
        },
    )
    .get(
        "/image/models",
        describeRoute({
            tags: ["Image Generation"],
            description:
                "Get a list of available image generation models with pricing, capabilities, and metadata. Use this endpoint to discover which models are available and their costs before making generation requests. Response includes `aliases` (alternative names you can use), pricing per image, and supported modalities.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(ModelInfoSchema).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(500),
            },
        }),
        async (c) => {
            try {
                const models = getImageModelsInfo();
                return c.json(models);
            } catch (error) {
                throw new HTTPException(500, {
                    message: "Failed to load image models",
                    cause: error,
                });
            }
        },
    )
    .get(
        "/text/models",
        describeRoute({
            tags: ["Text Generation"],
            description:
                "Get a list of available text generation models with pricing, capabilities, and metadata. Use this endpoint to discover which models are available and their costs before making generation requests. Response includes `aliases` (alternative names you can use), token pricing, supported modalities (text, image, audio), and capabilities (tools, reasoning).",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(ModelInfoSchema).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(500),
            },
        }),
        async (c) => {
            try {
                const models = getTextModelsInfo();
                return c.json(models);
            } catch (error) {
                throw new HTTPException(500, {
                    message: "Failed to load text models",
                    cause: error,
                });
            }
        },
    )
    // Auth required for all endpoints below (API key only - no session cookies)
    .use(auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(frontendKeyRateLimit)
    .use(polar)
    .post(
        "/v1/chat/completions",
        describeRoute({
            tags: ["Text Generation"],
            description: [
                "OpenAI-compatible chat completions endpoint.",
                "",
                "**Legacy endpoint:** `/openai` (deprecated, use `/v1/chat/completions` instead)",
                "",
                "**Authentication (Secret Keys Only):**",
                "",
                "Include your API key in the `Authorization` header as a Bearer token:",
                "",
                "`Authorization: Bearer YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
                "Secret keys provide the best rate limits and can spend Pollen.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CreateChatCompletionResponseSchema,
                            ),
                        },
                    },
                },
                ...errorResponses(400, 401, 500),
            },
        }),
        ...chatCompletionHandlers,
    )
    // Undocumented /openai alias for backward compatibility (deprecated)
    .post(
        "/openai",
        describeRoute({
            hide: true, // Hide from OpenAPI docs completely
        }),
        ...chatCompletionHandlers,
    )
    .get(
        "/text/:prompt",
        describeRoute({
            tags: ["Text Generation"],
            description: [
                "Generates text from text prompts.",
                "",
                "**Authentication:**",
                "",
                "Include your API key either:",
                "- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`",
                "- As a query parameter: `?key=YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
        }),
        track("generate.text"),
        async (c) => {
            const log = c.get("log");
            await c.var.auth.requireAuthorization();
            await checkBalance(c.var);

            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";

            // Build URL with prompt in path and model as query param
            const model = c.req.query("model") || DEFAULT_TEXT_MODEL;
            const prompt = c.req.param("prompt");
            const targetUrl = proxyUrl(
                c,
                `${textServiceUrl}/${encodeURIComponent(prompt)}`,
            );
            // Add model param after proxyUrl() to ensure it's always present
            targetUrl.searchParams.set("model", model);

            const response = await fetch(targetUrl, {
                method: "GET",
                headers: proxyHeaders(c),
            });

            if (!response.ok) {
                // Read upstream error and throw UpstreamError to get structured error response
                // This preserves the status code while providing consistent error format
                const responseText = await response.text();
                log.warn("[PROXY] Text service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            responseText ||
                            getDefaultErrorMessage(response.status),
                        requestUrl: targetUrl,
                    },
                );
            }

            // Backend returns plain text for text models and raw audio for audio models
            // No JSON parsing needed for GET endpoint - just pass through the response
            return response;
        },
    )
    .get(
        // Use :prompt{[\\s\\S]+} regex to capture everything including slashes AND newlines
        // .+ doesn't match newlines, but [\s\S]+ matches any character including \n
        // This creates a named param for OpenAPI docs while matching any characters
        "/image/:prompt{[\\s\\S]+}",
        track("generate.image"),
        imageCache,
        describeRoute({
            tags: ["Image Generation"],
            description: [
                "Generate an image or video from a text prompt.",
                "",
                "**Image Models:** `flux` (default), `turbo`, `gptimage`, `kontext`, `seedream`, `nanobanana`, `nanobanana-pro`",
                "",
                "**Video Models:** `veo`, `seedance`",
                "- `veo`: Text-to-video only (4-8 seconds)",
                "- `seedance`: Text-to-video and image-to-video (2-10 seconds)",
                "",
                "**Authentication:**",
                "",
                "Include your API key either:",
                "- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`",
                "- As a query parameter: `?key=YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
            responses: {
                200: {
                    description:
                        "Success - Returns the generated image or video",
                    content: {
                        "image/jpeg": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                        "image/png": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                        "video/mp4": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                    },
                },
                ...errorResponses(400, 401, 500),
            },
        }),
        validator(
            "param",
            z.object({
                prompt: z.string().min(1).meta({
                    description:
                        "Text description of the image or video to generate",
                    example: "a beautiful sunset over mountains",
                }),
            }),
        ),
        validator("query", GenerateImageRequestQueryParamsSchema),
        async (c) => {
            const log = c.get("log");
            await c.var.auth.requireAuthorization();
            await checkBalance(c.var);

            // Get prompt from validated param (using :prompt{.+} regex pattern)
            const promptParam = c.req.param("prompt") || "";

            log.debug("[PROXY] Extracted prompt param: {prompt}", {
                prompt: promptParam,
                length: promptParam.length,
            });

            const targetUrl = proxyUrl(c, `${c.env.IMAGE_SERVICE_URL}/prompt`);
            targetUrl.pathname = joinPaths(targetUrl.pathname, promptParam);

            log.debug("[PROXY] Proxying to: {url}", {
                url: targetUrl.toString(),
            });

            const response = await proxy(targetUrl.toString(), {
                method: c.req.method,
                headers: proxyHeaders(c),
                body: c.req.raw.body,
            });

            if (!response.ok) {
                // Read upstream error and throw UpstreamError to get structured error response
                // This preserves the status code while providing consistent error format
                const responseText = await response.text();
                log.warn("[PROXY] Image service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            responseText ||
                            getDefaultErrorMessage(response.status),
                        requestUrl: targetUrl,
                    },
                );
            }

            return response;
        },
    );

function proxyHeaders(c: Context): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    const headers = { ...c.req.header() };

    // Remove Authorization header - we use x-enter-token for backend auth instead
    delete headers.authorization;
    delete headers.Authorization;

    return {
        ...headers,
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
        "x-enter-token": c.env.ENTER_TOKEN,
    };
}

function proxyUrl(
    c: Context,
    targetBaseUrl: string,
    targetPort: string = "",
): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);
    // Only override port if explicitly provided
    if (targetPort) {
        targetUrl.port = targetPort;
    }
    // Copy query parameters but exclude the 'key' parameter (used for enter.pollinations.ai auth only)
    const searchParams = new URLSearchParams(incomingUrl.search);
    searchParams.delete("key");
    targetUrl.search = searchParams.toString();
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export function contentFilterResultsToHeaders(
    response: CreateChatCompletionResponse,
): Record<string, string> {
    const promptFilterResults =
        response.prompt_filter_results?.[0]?.content_filter_results;
    const completionFilterResults =
        response.choices?.[0]?.content_filter_results;
    const mapToString = (value: unknown) => (value ? String(value) : undefined);
    const headers = {
        "x-moderation-prompt-hate-severity": mapToString(
            promptFilterResults?.hate?.severity,
        ),
        "x-moderation-prompt-self-harm-severity": mapToString(
            promptFilterResults?.self_harm?.severity,
        ),
        "x-moderation-prompt-sexual-severity": mapToString(
            promptFilterResults?.sexual?.severity,
        ),
        "x-moderation-prompt-violence-severity": mapToString(
            promptFilterResults?.violence?.severity,
        ),
        "x-moderation-prompt-jailbreak-detected": mapToString(
            promptFilterResults?.jailbreak?.detected,
        ),
        "x-moderation-completion-hate-severity": mapToString(
            completionFilterResults?.hate?.severity,
        ),
        "x-moderation-completion-self-harm-severity": mapToString(
            completionFilterResults?.self_harm?.severity,
        ),
        "x-moderation-completion-sexual-severity": mapToString(
            completionFilterResults?.sexual?.severity,
        ),
        "x-moderation-completion-violence-severity": mapToString(
            completionFilterResults?.violence?.severity,
        ),
        "x-moderation-completion-protected-material-text-detected": mapToString(
            completionFilterResults?.protected_material_text?.detected,
        ),
        "x-moderation-completion-protected-material-code-detected": mapToString(
            completionFilterResults?.protected_material_code?.detected,
        ),
    };
    // Filter out undefined values
    return Object.fromEntries(
        Object.entries(headers).filter(([_, value]) => value !== undefined),
    ) as Record<string, string>;
}

async function checkBalance({ auth, polar }: AuthVariables & PolarVariables) {
    if (auth.user?.id) {
        await polar.requirePositiveBalance(
            auth.user.id,
            "Insufficient pollen balance to use this model",
        );
    }
}
