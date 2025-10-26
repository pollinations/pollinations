import { Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import { cors } from "hono/cors";
import { auth } from "@/middleware/auth.ts";
import type { User } from "@/auth.ts";
import { polar } from "@/middleware/polar.ts";
import type { Env } from "../env.ts";
import { track } from "@/middleware/track.ts";
import { removeUnset } from "@/util.ts";
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
            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
            return await proxy(`${textServiceUrl}/openai/models`, {
                ...c.req,
                headers: proxyHeaders(c),
            });
        },
    )
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .use(polar)
    // .use(alias({ "/openai/chat/completions": "/openai" }))
    .post(
        "/openai",
        track("generate.text"),
        describeRoute({
            description: [
                "OpenAI compatible endpoint for text generation.",
                "Also available under `/openai/chat/completions`.",
                "",
                "**Authentication (Server-to-Server Only):**",
                "",
                "Include your API key in the `Authorization` header as a Bearer token:",
                "",
                "`Authorization: Bearer YOUR_API_KEY`",
                "",
                "API keys can be created from your dashboard at enter.pollinations.ai.",
                "Server-to-Server keys provide the best rate limits and access to spend Pollen on premium models.",
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
            description: "Generates text from text prompts.",
        }),
        track("generate.text"),
        async (c) => {
            await c.var.auth.requireAuthorization({
                allowAnonymous: true,
            });
            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
            const targetUrl = proxyUrl(c, `${textServiceUrl}/openai`);
            const requestBody = {
                model: c.req.query("model") || "openai",
                messages: [{ role: "user", content: c.req.param("prompt") }],
            };
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
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
            const imageServiceUrl =
                c.env.IMAGE_SERVICE_URL || "https://image.pollinations.ai";
            return await proxy(`${imageServiceUrl}/models`);
        },
    )
    .get(
        "/image/:prompt",
        track("generate.image"),
        describeRoute({
            description: [
                "Generate an image from a text prompt.",
                "",
                "**Authentication (Server-to-Server Only):**",
                "",
                "Include your API key in the `Authorization` header as a Bearer token:",
                "",
                "`Authorization: Bearer YOUR_API_KEY`",
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
            const imageServiceUrl =
                c.env.IMAGE_SERVICE_URL || "https://image.pollinations.ai";
            const targetUrl = proxyUrl(c, `${imageServiceUrl}/prompt`);
            targetUrl.pathname = joinPaths(
                targetUrl.pathname,
                c.req.param("prompt"),
            );
            return await proxy(targetUrl.toString(), {
                ...c.req,
                headers: {
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
                },
            });
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
    targetUrl.search = incomingUrl.search;
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
