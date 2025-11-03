import { Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import { cors } from "hono/cors";
import { genAuth } from "../middleware/auth.ts";
import { polar } from "../../../src/middleware/polar.ts";
import type { Env } from "../../../src/env.ts";
import { track } from "../middleware/track.ts";
import { frontendKeyRateLimit } from "../middleware/frontendRateLimit.ts";
import { generationHeaders } from "../utils/headers.ts";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../../../src/middleware/validator.ts";
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
} from "@/error.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import {
    parseUsageHeaders,
    USAGE_TYPE_HEADERS,
} from "../../../shared/registry/usage-headers.ts";
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
    .use(
        "*",
        cors({
            origin: "*",
            allowHeaders: ["authorization", "content-type"],
            allowMethods: ["GET", "POST", "OPTIONS"],
        }),
    )
    .get(
        "/openai/models",
        describeRoute({
            description: "Get available text models.",
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
                ...c.req,
                headers: buildProxyHeaders(c),
            });
        },
    )
    .use(genAuth)
    // TODO: Temporarily disabled due to timestamp issues with client tokens
    // .use(frontendKeyRateLimit)
    .use(polar)
    .post(
        "/v1/chat/completions",
        track("generate.text"),
        describeRoute({
            description: [
                "OpenAI compatible endpoint for text generation.",
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
        async (c) => {
            await c.var.auth.requireAuthorization({
                allowAnonymous:
                    c.var.track.isFreeUsage && c.env.ALLOW_ANONYMOUS_USAGE,
            });
            const targetUrl = proxyUrl(c, `${c.env.TEXT_SERVICE_URL}/openai`);
            const requestBody = await c.req.json();
            const response = await proxy(targetUrl, {
                method: c.req.method,
                headers: {
                    ...buildProxyHeaders(c),
                    ...generationHeaders(c.var.auth.user, c.env.ENTER_TOKEN),
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok || !response.body) {
                throw new HTTPException(
                    response.status as ContentfulStatusCode,
                );
            }
            const responseJson = await response.clone().json();
            const parsedResponse =
                CreateChatCompletionResponseSchema.parse(responseJson);
            const contentFilterHeaders =
                contentFilterResultsToHeaders(parsedResponse);
            return new Response(response.body, {
                headers: {
                    ...Object.fromEntries(response.headers),
                    ...contentFilterHeaders,
                },
            });
        },
    )
    .get(
        "/text/:prompt",
        describeRoute({
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
                allowAnonymous: true,
            });
            const targetUrl = proxyUrl(c, `${c.env.TEXT_SERVICE_URL}/openai`);
            const requestBody = {
                model: c.req.query("model") || "openai",
                messages: [{ role: "user", content: c.req.param("prompt") }],
            };
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...buildProxyHeaders(c),
                    ...generationHeaders(c.var.auth.user, c.env.ENTER_TOKEN),
                },
                body: JSON.stringify(requestBody),
            });
            const responseJson = await response.json();
            const parsedResponse =
                CreateChatCompletionResponseSchema.parse(responseJson);
            const contentFilterHeaders =
                contentFilterResultsToHeaders(parsedResponse);
            const message = parsedResponse.choices[0].message.content;
            if (!message) {
                throw new HTTPException(500, {
                    message: "Provider didn't return any messages",
                });
            }
            return c.text(
                parsedResponse.choices[0].message?.content || "",
                200,
                {
                    ...Object.fromEntries(response.headers),
                    ...contentFilterHeaders,
                },
            );
        },
    )
    .get(
        "/image/models",
        describeRoute({
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
                ...errorResponses(400, 401, 500),
            },
        }),
        async (c) => {
            return await proxy(`${c.env.IMAGE_SERVICE_URL}/models`);
        },
    )
    .get(
        "/image/:prompt",
        track("generate.image"),
        describeRoute({
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
            await c.var.auth.requireAuthorization({
                allowAnonymous:
                    c.var.track.isFreeUsage && c.env.ALLOW_ANONYMOUS_USAGE,
            });
            const targetUrl = proxyUrl(c, `${c.env.IMAGE_SERVICE_URL}/prompt`);
            targetUrl.pathname = joinPaths(
                targetUrl.pathname,
                c.req.param("prompt"),
            );
            
            const proxyRequestHeaders = {
                ...buildProxyHeaders(c),
                ...generationHeaders(c.var.auth.user, c.env.ENTER_TOKEN),
            };
            
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
                c.get("log")?.warn("[PROXY] Error {status}: {body}", {
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

function buildProxyHeaders(c: Context): Record<string, string> {
    return {
        ...c.req.header(),
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": c.req.header("host") || "",
        "x-forwarded-for": c.req.header("cf-connecting-ip") || "",
        "x-real-ip": c.req.header("cf-connecting-ip") || "",
    };
}

function proxyUrl(
    c: Context,
    targetBaseUrl: string,
): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);
    // Copy query parameters but exclude the 'key' parameter (auth only)
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
    
    const headers: Record<string, string> = {};
    const addIfDefined = (key: string, value: string | undefined) => {
        if (value !== undefined) headers[key] = value;
    };
    
    addIfDefined("x-moderation-prompt-hate-severity", mapToString(promptFilterResults?.hate?.severity));
    addIfDefined("x-moderation-prompt-self-harm-severity", mapToString(promptFilterResults?.self_harm?.severity));
    addIfDefined("x-moderation-prompt-sexual-severity", mapToString(promptFilterResults?.sexual?.severity));
    addIfDefined("x-moderation-prompt-violence-severity", mapToString(promptFilterResults?.violence?.severity));
    addIfDefined("x-moderation-prompt-jailbreak-detected", mapToString(promptFilterResults?.jailbreak?.detected));
    addIfDefined("x-moderation-completion-hate-severity", mapToString(completionFilterResults?.hate?.severity));
    addIfDefined("x-moderation-completion-self-harm-severity", mapToString(completionFilterResults?.self_harm?.severity));
    addIfDefined("x-moderation-completion-sexual-severity", mapToString(completionFilterResults?.sexual?.severity));
    addIfDefined("x-moderation-completion-violence-severity", mapToString(completionFilterResults?.violence?.severity));
    addIfDefined("x-moderation-completion-protected-material-text-detected", mapToString(completionFilterResults?.protected_material_text?.detected));
    addIfDefined("x-moderation-completion-protected-material-code-detected", mapToString(completionFilterResults?.protected_material_code?.detected));
    
    return headers;
}
