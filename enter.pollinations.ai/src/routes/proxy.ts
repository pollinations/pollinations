import { type Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import { resolver as baseResolver, describeRoute } from "hono-openapi";
import { type AuthVariables, auth } from "@/middleware/auth.ts";
import { type BalanceVariables, balance } from "@/middleware/balance.ts";
import { imageCache } from "@/middleware/image-cache.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { resolveModel } from "@/middleware/model.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestDeduplication } from "@/middleware/requestDeduplication.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import type { Env } from "../env.ts";

// Wrapper for resolver that enables schema deduplication via $ref
// Schemas with .meta({ $id: "Name" }) will be extracted to components/schemas
const resolver = <T extends Parameters<typeof baseResolver>[0]>(schema: T) =>
    baseResolver(schema, { reused: "ref" });

import { ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    getAudioModelsInfo,
    getImageModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import { getServiceDefinition } from "@shared/registry/registry.ts";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
    getDefaultErrorMessage,
    remapUpstreamStatus,
    UpstreamError,
} from "@/error.ts";
import { validator } from "@/middleware/validator.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import {
    CreateChatCompletionRequestSchema,
    type CreateChatCompletionResponse,
    CreateChatCompletionResponseSchema,
    GetModelsResponseSchema,
} from "@/schemas/openai.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import { generateMusic, generateSpeech } from "./audio.ts";

// Build dynamic model lists from registry for use in API descriptions
const imageModelNames = Object.entries(IMAGE_SERVICES)
    .filter(
        ([, svc]) =>
            !(svc.outputModalities as string[] | undefined)?.includes("video"),
    )
    .map(([id]) => `\`${id}\``)
    .join(", ");

const videoModelNames = Object.entries(IMAGE_SERVICES)
    .filter(([, svc]) =>
        (svc.outputModalities as string[] | undefined)?.includes("video"),
    )
    .map(([id]) => `\`${id}\``)
    .join(", ");

const factory = createFactory<Env>();

// Shared handler for image and video generation (used by both /image/ and /video/ routes)
const imageVideoHandlers = factory.createHandlers(
    resolveModel("generate.image"),
    track("generate.image"),
    async (c) => {
        const log = c.get("log").getChild("generate");
        await c.var.auth.requireAuthorization();
        c.var.auth.requireModelAccess();
        c.var.auth.requireKeyBudget();
        await checkBalance(c.var);

        // Get prompt from validated param (using :prompt{[\\s\\S]+} regex pattern)
        const promptParam = c.req.param("prompt") || "";

        log.debug("Extracted prompt param: {prompt}", {
            prompt: promptParam,
            length: promptParam.length,
        });

        const targetUrl = proxyUrl(c, `${c.env.IMAGE_SERVICE_URL}/prompt`);
        targetUrl.pathname = joinPaths(targetUrl.pathname, promptParam);

        log.debug("Proxying to: {url}", {
            url: targetUrl.toString(),
        });

        const response = await proxy(targetUrl.toString(), {
            method: c.req.method,
            headers: proxyHeaders(c),
            body: c.req.raw.body,
        });

        if (!response.ok) {
            const responseText = await response.text();
            log.warn("Image service error {status}: {body}", {
                status: response.status,
                body: responseText,
            });
            throw new UpstreamError(remapUpstreamStatus(response.status), {
                message:
                    responseText || getDefaultErrorMessage(response.status),
                requestUrl: targetUrl,
            });
        }

        return response;
    },
);

// Shared handler for OpenAI-compatible chat completions
const chatCompletionHandlers = factory.createHandlers(
    validator("json", CreateChatCompletionRequestSchema),
    resolveModel("generate.text"),
    track("generate.text"),
    async (c) => {
        const log = c.get("log").getChild("generate");
        await c.var.auth.requireAuthorization();
        c.var.auth.requireModelAccess();
        c.var.auth.requireKeyBudget();

        // Use resolved model from middleware for the backend request
        const requestBody = await c.req.json();
        requestBody.model = c.var.model.resolved;
        await checkBalance(c.var);

        const textServiceUrl =
            c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
        const targetUrl = proxyUrl(c, `${textServiceUrl}/openai`);
        const response = await proxy(targetUrl, {
            method: c.req.method,
            headers: proxyHeaders(c),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const responseText = await response.text();
            log.warn("Chat completions error {status}: {body}", {
                status: response.status,
                body: responseText,
            });

            // Try to extract meaningful error message from upstream JSON
            let errorMessage =
                responseText || getDefaultErrorMessage(response.status);
            try {
                const parsed = JSON.parse(responseText);
                const extracted =
                    parsed?.details?.error?.message ||
                    parsed?.error?.message ||
                    parsed?.message ||
                    (typeof parsed?.error === "string" ? parsed.error : null);
                if (extracted) {
                    errorMessage = extracted;
                }
            } catch {
                // Not JSON or parse failed - use raw text as-is
            }

            throw new UpstreamError(remapUpstreamStatus(response.status), {
                message: errorMessage,
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

// Helper to filter models by API key permissions and paid balance
function filterModelsByPermissions<
    T extends { name: string; paid_only?: boolean },
>(
    models: T[],
    allowedModels: string[] | undefined,
    hasPaidBalance?: boolean,
): T[] {
    return models.filter((m) => {
        if (allowedModels?.length && !allowedModels.includes(m.name))
            return false;
        if (m.paid_only && hasPaidBalance === false) return false;
        return true;
    });
}

// Check if authenticated user has paid balance (pack or crypto > 0)
// Auth middleware already fetches the full user row (SELECT *), so no extra DB query needed.
// Returns undefined if no user (unauthenticated), true/false otherwise.
// biome-ignore lint/suspicious/noExplicitAny: User type doesn't include balance fields from SELECT *
function hasPaidBalance(c: any): boolean | undefined {
    const user = c.var?.auth?.user;
    if (!user) return undefined;
    return (user.packBalance ?? 0) > 0 || (user.cryptoBalance ?? 0) > 0;
}

export const proxyRoutes = new Hono<Env>()
    // Edge rate limiter: first line of defense (10 req/s per IP)
    .use("*", edgeRateLimit)
    // Optional auth for models endpoints - doesn't require auth but uses it if provided
    .use("/v1/models", auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(
        "/image/models",
        auth({ allowApiKey: true, allowSessionCookie: false }),
    )
    .use("/text/models", auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(
        "/audio/models",
        auth({ allowApiKey: true, allowSessionCookie: false }),
    )
    .get(
        "/v1/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Text Models (OpenAI-compatible)",
            description:
                'Returns available text models in the OpenAI-compatible format (`{object: "list", data: [...]}`). Use this endpoint if you\'re using an OpenAI SDK. For richer metadata including pricing and capabilities, use `/text/models` instead. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.',
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(GetModelsResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const paidBalance = hasPaidBalance(c);
            const models = filterModelsByPermissions(
                getTextModelsInfo(),
                allowedModels,
                paidBalance,
            );
            const now = Date.now();
            return c.json({
                object: "list" as const,
                data: models.map((m) => ({
                    id: m.name,
                    object: "model" as const,
                    created: now,
                })),
            });
        },
    )
    .get(
        "/image/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Image & Video Models",
            description:
                "Returns all available image and video generation models with pricing, capabilities, and metadata. Video models are included here — check the `outputModalities` field to distinguish image vs video models. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            try {
                const allowedModels = c.var.auth?.apiKey?.permissions?.models;
                const paidBalance = hasPaidBalance(c);
                const models = filterModelsByPermissions(
                    getImageModelsInfo(),
                    allowedModels,
                    paidBalance,
                );
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
            tags: ["🤖 Models"],
            summary: "List Text Models (Detailed)",
            description:
                "Returns all available text generation models with pricing, capabilities, and metadata including context window size, supported modalities, and tool support. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const paidBalance = hasPaidBalance(c);
            const models = filterModelsByPermissions(
                getTextModelsInfo(),
                allowedModels,
                paidBalance,
            );
            return c.json(models);
        },
    )
    .get(
        "/audio/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Audio Models",
            description:
                "Returns all available audio models (text-to-speech, music generation, and transcription) with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        async (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const paidBalance = hasPaidBalance(c);
            const models = filterModelsByPermissions(
                getAudioModelsInfo(),
                allowedModels,
                paidBalance,
            );
            return c.json(models);
        },
    )
    // Auth required for all endpoints below (API key only - no session cookies)
    .use(auth({ allowApiKey: true, allowSessionCookie: false }))
    .use(frontendKeyRateLimit)
    .use(balance)
    // Request deduplication: prevents duplicate concurrent requests by sharing promises
    .use(requestDeduplication)
    .post(
        "/v1/chat/completions",
        textCache,
        describeRoute({
            tags: ["✍️ Text Generation"],
            summary: "Chat Completions",
            description: [
                "Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by pointing it to `https://gen.pollinations.ai`.",
                "",
                "Supports streaming, function calling, vision (image input), structured outputs, and reasoning/thinking modes depending on the model.",
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
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        ...chatCompletionHandlers,
    )
    .get(
        "/text/:prompt",
        textCache,
        describeRoute({
            tags: ["✍️ Text Generation"],
            summary: "Simple Text Generation",
            description: [
                "Generate text from a prompt via a simple GET request. Returns plain text.",
                "",
                "This is a simplified alternative to the OpenAI-compatible `/v1/chat/completions` endpoint — ideal for quick prototyping or simple integrations.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Generated text response",
                    content: {
                        "text/plain": {
                            schema: { type: "string" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        validator(
            "param",
            z.object({
                prompt: z.string().min(1).meta({
                    description: "Text prompt for generation",
                    example: "Write a haiku about coding",
                }),
            }),
        ),
        validator("query", GenerateTextRequestQueryParamsSchema),
        resolveModel("generate.text"),
        track("generate.text"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            c.var.auth.requireModelAccess();
            c.var.auth.requireKeyBudget();
            await checkBalance(c.var);

            // Use resolved model from middleware
            const model = c.var.model.resolved;

            const textServiceUrl =
                c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
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
                const responseText = await response.text();
                log.warn("Text service error {status}: {body}", {
                    status: response.status,
                    body: responseText,
                });
                throw new UpstreamError(remapUpstreamStatus(response.status), {
                    message:
                        responseText || getDefaultErrorMessage(response.status),
                    requestUrl: targetUrl,
                });
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
        imageCache,
        describeRoute({
            tags: ["🖼️ Image Generation"],
            summary: "Generate Image",
            description: [
                "Generate an image from a text prompt. Returns JPEG or PNG.",
                "",
                `**Available models:** ${imageModelNames}. \`${DEFAULT_IMAGE_MODEL}\` is the default.`,
                "",
                "Browse all available models and their capabilities at [`/image/models`](https://gen.pollinations.ai/image/models).",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success - Returns the generated image",
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
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        validator(
            "param",
            z.object({
                prompt: z.string().min(1).meta({
                    description: "Text description of the image to generate",
                    example: "a beautiful sunset over mountains",
                }),
            }),
        ),
        validator("query", GenerateImageRequestQueryParamsSchema),
        ...imageVideoHandlers,
    )
    .get(
        "/video/:prompt{[\\s\\S]+}",
        imageCache,
        describeRoute({
            tags: ["🎬 Video Generation"],
            summary: "Generate Video",
            description: [
                "Generate a video from a text prompt. Returns MP4.",
                "",
                `**Available models:** ${videoModelNames}.`,
                "",
                "Use `duration` to set video length, `aspectRatio` for orientation, and `audio` to enable soundtrack generation.",
                "",
                "You can also pass reference images via the `image` parameter — for example, `veo` supports start and end frames for interpolation.",
                "",
                "Browse all available models at [`/image/models`](https://gen.pollinations.ai/image/models).",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success - Returns the generated video",
                    content: {
                        "video/mp4": {
                            schema: {
                                type: "string",
                                format: "binary",
                            },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        validator(
            "param",
            z.object({
                prompt: z.string().min(1).meta({
                    description: "Text description of the video to generate",
                    example: "a sunset timelapse over the ocean",
                }),
            }),
        ),
        validator("query", GenerateImageRequestQueryParamsSchema),
        ...imageVideoHandlers,
    )
    .get(
        "/audio/:text",
        describeRoute({
            tags: ["🔊 Audio Generation"],
            summary: "Generate Audio",
            description: [
                "Generate speech or music from text via a simple GET request.",
                "",
                "**Text-to-speech (default):** Returns spoken audio in the selected voice and format.",
                "",
                `**Available voices:** ${ELEVENLABS_VOICES.join(", ")}`,
                "",
                "**Output formats:** mp3 (default), opus, aac, flac, wav, pcm",
                "",
                "**Music generation:** Set `model=elevenmusic` to generate music instead of speech. Supports `duration` (3-300 seconds) and `instrumental` mode.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success - Returns audio data",
                    content: {
                        "audio/mpeg": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        validator(
            "param",
            z.object({
                text: z.string().min(1).meta({
                    description:
                        "Text to convert to speech, or a music description when model=elevenmusic",
                    example: "Hello, welcome to Pollinations!",
                }),
            }),
        ),
        validator(
            "query",
            z.object({
                voice: z
                    .enum(ELEVENLABS_VOICES as unknown as [string, ...string[]])
                    .default("alloy")
                    .meta({
                        description:
                            "Voice to use for speech generation (TTS only)",
                        example: "nova",
                    }),
                response_format: z
                    .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
                    .default("mp3")
                    .meta({
                        description: "Audio output format (TTS only)",
                        example: "mp3",
                    }),
                model: z.string().optional().meta({
                    description:
                        "Audio model: TTS (default) or elevenmusic for music generation",
                    example: "tts-1",
                }),
                duration: z
                    .string()
                    .optional()
                    .transform((v) => (v ? parseFloat(v) : undefined))
                    .meta({
                        description:
                            "Music duration in seconds, 3-300 (elevenmusic only)",
                        example: "30",
                    }),
                instrumental: z
                    .enum(["true", "false"])
                    .default("false")
                    .transform((v) => v === "true")
                    .meta({
                        description:
                            "If true, guarantees instrumental output (elevenmusic only)",
                        example: "false",
                    }),
                key: z.string().optional().meta({
                    description:
                        "API key (alternative to Authorization header)",
                }),
            }),
        ),
        resolveModel("generate.audio"),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("generate");
            await c.var.auth.requireAuthorization();
            await checkBalance(c.var);

            const text = decodeURIComponent(c.req.param("text"));
            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;

            if (c.var.model.resolved === "elevenmusic") {
                const { duration, instrumental } = c.req.valid(
                    "query" as never,
                ) as {
                    duration?: number;
                    instrumental?: boolean;
                };
                return generateMusic({
                    prompt: text,
                    durationSeconds: duration,
                    forceInstrumental: instrumental,
                    apiKey,
                    log,
                });
            }

            const { voice, response_format } = c.req.valid(
                "query" as never,
            ) as {
                voice: string;
                response_format: string;
            };

            return generateSpeech({
                text,
                voice: voice || "alloy",
                responseFormat: response_format || "mp3",
                apiKey,
                log,
            });
        },
    );

function proxyHeaders(c: Context): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    const userApiKey = c.var.auth?.apiKey?.rawKey || "";

    // Copy headers excluding Authorization
    const headers = { ...c.req.header() };
    delete headers.authorization;
    delete headers.Authorization;

    return {
        ...headers,
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
        "x-enter-token": c.env.PLN_ENTER_TOKEN,
        "x-user-api-key": userApiKey, // For community model billing passthrough
    };
}

function proxyUrl(c: Context, targetBaseUrl: string, targetPort = ""): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);

    if (targetPort) {
        targetUrl.port = targetPort;
    }

    // Copy query parameters excluding 'key' (auth only)
    const searchParams = new URLSearchParams(incomingUrl.search);
    searchParams.delete("key");

    // Replace model with resolved model (handles aliases)
    if (c.var.model?.resolved && searchParams.has("model")) {
        searchParams.set("model", c.var.model.resolved);
    }

    targetUrl.search = searchParams.toString();
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export function contentFilterResultsToHeaders(
    response: CreateChatCompletionResponse,
): Record<string, string> {
    const promptFilters =
        response.prompt_filter_results?.[0]?.content_filter_results;
    const completionFilters = response.choices?.[0]?.content_filter_results;

    const mapToString = (value: unknown): string | undefined =>
        value ? String(value) : undefined;

    // Build header mappings
    const headerMappings: Array<[string, unknown]> = [
        // Prompt filters
        ["x-moderation-prompt-hate-severity", promptFilters?.hate?.severity],
        [
            "x-moderation-prompt-self-harm-severity",
            promptFilters?.self_harm?.severity,
        ],
        [
            "x-moderation-prompt-sexual-severity",
            promptFilters?.sexual?.severity,
        ],
        [
            "x-moderation-prompt-violence-severity",
            promptFilters?.violence?.severity,
        ],
        [
            "x-moderation-prompt-jailbreak-detected",
            promptFilters?.jailbreak?.detected,
        ],
        // Completion filters
        [
            "x-moderation-completion-hate-severity",
            completionFilters?.hate?.severity,
        ],
        [
            "x-moderation-completion-self-harm-severity",
            completionFilters?.self_harm?.severity,
        ],
        [
            "x-moderation-completion-sexual-severity",
            completionFilters?.sexual?.severity,
        ],
        [
            "x-moderation-completion-violence-severity",
            completionFilters?.violence?.severity,
        ],
        [
            "x-moderation-completion-protected-material-text-detected",
            completionFilters?.protected_material_text?.detected,
        ],
        [
            "x-moderation-completion-protected-material-code-detected",
            completionFilters?.protected_material_code?.detected,
        ],
    ];

    // Convert to headers, filtering out undefined values
    const headers: Record<string, string> = {};
    for (const [key, value] of headerMappings) {
        const stringValue = mapToString(value);
        if (stringValue !== undefined) {
            headers[key] = stringValue;
        }
    }

    return headers;
}

async function checkBalance({
    auth,
    balance,
    model,
}: AuthVariables & BalanceVariables & ModelVariables): Promise<void> {
    if (!auth.user?.id) return;

    const serviceDefinition = getServiceDefinition(model.resolved);
    const isPaidOnly = serviceDefinition.paidOnly ?? false;

    if (isPaidOnly) {
        await balance.requirePaidBalance(
            auth.user.id,
            "This model requires a paid balance. Tier balance cannot be used.",
        );
    } else {
        await balance.requirePositiveBalance(
            auth.user.id,
            "Insufficient pollen balance to use this model",
        );
    }
}
