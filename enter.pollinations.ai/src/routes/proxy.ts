import { Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import { cors } from "hono/cors";
import { authenticateAPI } from "@/middleware/authenticate";
import { polar } from "@/middleware/polar.ts";
import type { Env } from "../env.ts";
import { track, type TrackVariables } from "@/middleware/track.ts";
import type { AuthVariables } from "@/middleware/authenticate.ts";
import type { PolarVariables } from "@/middleware/polar.ts";
import { removeUnset } from "@/util.ts";
import type { Session } from "@/auth.ts";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "@/middleware/validator.ts";
import { alias } from "@/middleware/alias.ts";
import {
    CreateChatCompletionResponseSchema,
    CreateChatCompletionRequestSchema,
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
            return await proxy("https://text.pollinations.ai/openai/models", {
                ...c.req,
                headers: proxyHeaders(c),
            });
        },
    )
    .use(authenticateAPI)
    .use(polar)
    .use(alias({ "/openai/chat/completions": "/openai" }))
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
            await authorizeRequest(c.var, {
                allowAnonymous: c.env.ALLOW_ANONYMOUS_USAGE,
            });
            const targetUrl = proxyUrl(
                c,
                "https://text.pollinations.ai/openai",
            );
            const response = await proxy(targetUrl, {
                method: c.req.method,
                headers: {
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
                },
                body: JSON.stringify(await c.req.json()),
            });
            return response;
        },
    )
    // TODO: fix usage tracking for /generate/text
    //
    // .get(
    //     "/text/:prompt",
    //     describeRoute({
    //         description: "Generates text from text prompts.",
    //     }),
    //     track("generate.text"),
    //     async (c) => {
    //         await authorizeRequest(c.var);
    //         const targetUrl =
    //             "https://text.pollinations.ai/openai/chat/completions";
    //         const requestBody = {
    //             model: c.req.query("model") || "openai",
    //             messages: [{ role: "user", content: c.req.param("prompt") }],
    //         };
    //         const response = await fetch(targetUrl, {
    //             method: "POST",
    //             headers: {
    //                 ...proxyHeaders(c),
    //                 ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
    //             },
    //             body: JSON.stringify(requestBody),
    //         });
    //         console.log(response);
    //         const parsedResponse = openaiResponseSchema.parse(
    //             await response.json(),
    //         );
    //         return c.text(
    //             parsedResponse.choices[0].message?.content || "",
    //             200,
    //         );
    //     },
    // )
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
        async () => {
            return await proxy("https://image.pollinations.ai/models");
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
            await authorizeRequest(c.var, {
                allowAnonymous: c.env.ALLOW_ANONYMOUS_USAGE,
            });
            const targetUrl = proxyUrl(
                c,
                "https://image.pollinations.ai/prompt",
            );
            targetUrl.pathname = joinPaths(
                targetUrl.pathname,
                c.req.param("prompt"),
            );
            const response = await proxy(targetUrl, {
                ...c.req,
                headers: {
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
                },
            });
            return response;
        },
    );

async function authorizeRequest(
    { auth, polar, track }: AuthVariables & PolarVariables & TrackVariables,
    options: { allowAnonymous: boolean },
) {
    if (track.isFreeUsage) {
        if (!options.allowAnonymous)
            auth.requireActiveSession("Anonymous usage is currently disabled.");
    } else {
        const { user } = auth.requireActiveSession(
            "You need to be signed-in to use this model.",
        );
        await polar.requirePositiveBalance(user.id);
    }
}

function generationHeaders(
    enterToken: string,
    user?: Session["user"],
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
    targetUrl.port = targetPort;
    targetUrl.search = incomingUrl.search;
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
