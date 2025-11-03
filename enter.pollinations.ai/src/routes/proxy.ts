import { Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import { auth } from "@/middleware/auth.ts";
import type { User } from "@/auth.ts";
import { polar } from "@/middleware/polar.ts";
import type { Env } from "../env.ts";
import { track, TrackEnv } from "@/middleware/track.ts";
import { removeUnset } from "@/util.ts";
import { frontendKeyRateLimit } from "@/middleware/rateLimit.durable.ts";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "@/middleware/validator.ts";
import {
    CreateChatCompletionResponseSchema,
    CreateChatCompletionRequestSchema,
    CreateChatCompletionResponse,
    GetModelsResponseSchema,
} from "@/schemas/openai.ts";
import {
    createErrorResponseSchema,
    ErrorStatusCode,
    getDefaultErrorMessage,
    KNOWN_ERROR_STATUS_CODES,
    UpstreamError,
} from "@/error.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { ContentfulStatusCode } from "hono/utils/http-status";

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
            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
            return await proxy(`${textServiceUrl}/openai/models`, {
                ...c.req,
                headers: proxyHeaders(c),
            });
        },
    )
    .get(
        "/image/models",
        describeRoute({
            tags: ["Image Generation"],
            description: "Get available image models.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.string()).meta({
                                    description: "List of available models",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(500),
            },
        }),
        async (c) => {
            return await proxy(`${c.env.IMAGE_SERVICE_URL}/models`);
        },
    )
    // Auth required for all endpoints below
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .use(frontendKeyRateLimit)
    .use(polar)
    .post(
        "/v1/chat/completions",
        track("generate.text"),
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
        validator("json", CreateChatCompletionRequestSchema),
        async (c) => handleChatCompletions(c),
    )
    // Undocumented /openai alias for backward compatibility (deprecated)
    .post(
        "/openai",
        track("generate.text"),
        describeRoute({
            hide: true, // Hide from OpenAPI docs completely
        }),
        validator("json", CreateChatCompletionRequestSchema),
        async (c) => handleChatCompletions(c),
    )
    .get(
        "/text/models",
        describeRoute({
            tags: ["Text Generation"],
            description: "Get available text models.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.string()).meta({
                                    description: "List of available models",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(500),
            },
        }),
        async (c) => {
            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
            return await proxy(`${textServiceUrl}/models`);
        },
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
            await c.var.auth.requireAuthorization({
                allowAnonymous:
                    c.var.track.freeModelRequested &&
                    c.env.ALLOW_ANONYMOUS_USAGE,
            });

            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";

            // Build URL with prompt in path and model as query param
            const model = c.req.query("model") || "openai";
            const prompt = c.req.param("prompt");
            const targetUrl = proxyUrl(
                c,
                `${textServiceUrl}/${encodeURIComponent(prompt)}?model=${model}`,
            );

            const response = await fetch(targetUrl, {
                method: "GET",
                headers: {
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
                },
            });

            // return response as is if streaming
            if (c.var.track.streamRequested) {
                return response;
            }

            // Backend returns plain text for text models and raw audio for audio models
            // No JSON parsing needed for GET endpoint - just pass through the response
            return response;
        },
    )
    .get(
        "/image/:prompt",
        track("generate.image"),
        describeRoute({
            tags: ["Image Generation"],
            description: [
                "Generate an image from a text prompt.",
                "",
                "**Authentication (Secret Keys Only):**",
                "",
                "Include your API key either:",
                "- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`",
                "- As a query parameter: `?key=YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
            ].join("\n"),
        }),
        validator("query", GenerateImageRequestQueryParamsSchema),
        async (c) => {
            const log = c.get("log");
            await c.var.auth.requireAuthorization({
                allowAnonymous:
                    c.var.track.freeModelRequested &&
                    c.env.ALLOW_ANONYMOUS_USAGE,
            });
            await checkBalanceForPaidModel(c);

            const targetUrl = proxyUrl(c, `${c.env.IMAGE_SERVICE_URL}/prompt`);
            targetUrl.pathname = joinPaths(
                targetUrl.pathname,
                c.req.param("prompt"),
            );

            log.debug("[PROXY] Proxying to: {url}", {
                url: targetUrl.toString(),
            });

            const genHeaders = generationHeaders(
                c.env.ENTER_TOKEN,
                c.var.auth.user,
            );

            log.debug("[PROXY] Image generation headers: {headers}", {
                headers: genHeaders,
            });

            const proxyRequestHeaders = {
                ...proxyHeaders(c),
                ...genHeaders,
            };

            c.get("log")?.debug("[PROXY] Image generation headers: {headers}", {
                headers: genHeaders,
            });
            c.get("log")?.debug("[PROXY] Proxying to: {url}", {
                url: targetUrl.toString(),
            });

            const response = await proxy(targetUrl.toString(), {
                method: c.req.method,
                headers: proxyRequestHeaders,
                body: c.req.raw.body,
            });

            if (!response.ok) {
                const responseText = await response.text();
                log.warn("[PROXY] Error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                // Return the response with the body we just read
                return new Response(responseText, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }

            return response;
        },
    );

function generationHeaders(
    enterToken: string,
    user?: User,
): Record<string, string> {
    return removeUnset({
        "x-enter-token": enterToken,
        "x-github-id": `${user?.githubId}`,
        "x-user-tier": user?.tier,
    });
}

function proxyHeaders(c: Context): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    return {
        ...c.req.header(),
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
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
    return removeUnset({
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
    });
}

async function checkBalanceForPaidModel(c: Context<Env & TrackEnv>) {
    if (!c.var.track.freeModelRequested && c.var.auth.user?.id) {
        await c.var.polar.requirePositiveBalance(
            c.var.auth.user.id,
            "Insufficient pollen balance to use this model",
        );
    }
}

// Shared handler for OpenAI-compatible chat completions
async function handleChatCompletions(c: Context<Env & TrackEnv>) {
    await c.var.auth.requireAuthorization({
        allowAnonymous:
            c.var.track.freeModelRequested && c.env.ALLOW_ANONYMOUS_USAGE,
    });

    await checkBalanceForPaidModel(c);

    const textServiceUrl =
        c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
    const targetUrl = proxyUrl(c, `${textServiceUrl}/openai`);
    const requestBody = await c.req.json();
    const response = await proxy(targetUrl, {
        method: c.req.method,
        headers: {
            ...proxyHeaders(c),
            ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok || !response.body) {
        throw new HTTPException(response.status as ContentfulStatusCode);
    }

    // add content filter headers if not streaming
    let contentFilterHeaders = {};
    if (!c.var.track.streamRequested) {
        const responseJson = await response.clone().json();
        const parsedResponse =
            CreateChatCompletionResponseSchema.parse(responseJson);
        contentFilterHeaders = contentFilterResultsToHeaders(parsedResponse);
    }

    return new Response(response.body, {
        headers: {
            ...Object.fromEntries(response.headers),
            ...contentFilterHeaders,
        },
    });
}
