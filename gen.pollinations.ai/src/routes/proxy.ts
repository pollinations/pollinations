import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { resolver as baseResolver, describeRoute } from "hono-openapi";
import {
    generateEmbeddings,
    getEmbeddingProviderModelId,
} from "@/embeddings/handler.ts";
import type { Env } from "@/env.ts";
import { handleImagePrompt, handleRegisterServer } from "@/image/handler.ts";
import { auth } from "@/middleware/auth.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import {
    audioCache,
    imageCache,
    model3dCache,
} from "@/middleware/media-cache.ts";
import { resolveModel } from "@/middleware/model.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import { handleImageEdit, handleImageGeneration } from "./images.ts";

// Wrapper for resolver that enables schema deduplication via $ref
// Schemas with .meta({ $id: "Name" }) will be extracted to components/schemas
const resolver = <T extends Parameters<typeof baseResolver>[0]>(schema: T) =>
    baseResolver(schema, { reused: "ref" });

import { UpstreamError } from "@shared/error.ts";
import { validator } from "@shared/middleware/validator.ts";
import { AUDIO_VOICES } from "@shared/registry/audio.ts";
import {
    DEFAULT_IMAGE_MODEL,
    getImageModelIds,
    getVideoModelIds,
} from "@shared/registry/image.ts";
import {
    DEFAULT_3D_MODEL,
    getModel3dModelIds,
} from "@shared/registry/model3d.ts";
import {
    DEFAULT_REALTIME_MODEL,
    REALTIME_MODEL_NAMES,
} from "@shared/registry/realtime.ts";
import {
    type CreateChatCompletionRequest,
    CreateChatCompletionRequestSchema,
    type CreateChatCompletionResponse,
    CreateChatCompletionResponseSchema,
    CreateImageRequestSchema,
    CreateImageResponseSchema,
    GetModelsResponseSchema,
} from "@shared/schemas/openai.ts";
import { SafeSchema, type SafeValue } from "@shared/schemas/safety.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { createFactory } from "hono/factory";
import { z } from "zod";
import {
    applySafety,
    applySafetyToChatRequest,
    applySafetyToTexts,
    withSafetyHeaders,
} from "@/middleware/safety.ts";
import { handle3dPrompt } from "@/model3d/handler.ts";
import {
    CreateEmbeddingRequestSchema,
    CreateEmbeddingResponseSchema,
} from "@/schemas/embeddings.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { Generate3dRequestQueryParamsSchema } from "@/schemas/model3d.ts";
import { RealtimeRequestQueryParamsSchema } from "@/schemas/realtime.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import {
    handleChatCompletionLocal,
    handleSimpleTextLocal,
    handleTextContentLocal,
} from "@/text/handler.ts";
import { generationAccess } from "@/utils/generation-access.ts";
import {
    type GenerationModelEntry,
    getGenerationModelRegistry,
} from "../model-registry.ts";
import { handleSimpleAudio } from "./audio.ts";
import { handleRealtimeWebSocket } from "./realtime.ts";

// Build dynamic model lists from registry for use in API descriptions
const imageModelNames = getImageModelIds()
    .map((id) => `\`${id}\``)
    .join(", ");

const videoModelNames = getVideoModelIds()
    .map((id) => `\`${id}\``)
    .join(", ");

const model3dModelNames = getModel3dModelIds()
    .map((id) => `\`${id}\``)
    .join(", ");

const factory = createFactory<Env>();
const textBodyLimit = bodyLimit({
    maxSize: 20 * 1024 * 1024,
});
// Shared handler for image and video generation (used by both /image/ and /video/ routes)
const imageVideoHandlers = factory.createHandlers(
    resolveModel("generate.image"),
    track("generate.image"),
    imageCache,
    generationAccess,
    async (c) => {
        const query = c.req.valid("query" as never) as { safe?: SafeValue };
        const prompt = await applySafety(
            c,
            c.req.param("prompt") || "",
            query.safe,
        );
        return withSafetyHeaders(c, await handleImagePrompt(c, prompt));
    },
);

// Handler for 3D model generation (reuses the "generate.image" EventType,
// same as video, to avoid touching Tinybird/EventType consumers).
const model3dHandlers = factory.createHandlers(
    resolveModel("generate.image", { defaultModel: DEFAULT_3D_MODEL }),
    track("generate.image"),
    model3dCache,
    generationAccess,
    async (c) => {
        const query = c.req.valid("query" as never) as { safe?: SafeValue };
        const prompt = await applySafety(
            c,
            c.req.param("prompt") || "",
            query.safe,
        );
        return withSafetyHeaders(c, await handle3dPrompt(c, prompt));
    },
);

// Shared handler for OpenAI-compatible chat completions
const chatCompletionHandlers = factory.createHandlers(
    textBodyLimit,
    validator("json", CreateChatCompletionRequestSchema),
    resolveModel("generate.text"),
    track("generate.text"),
    textCache,
    generationAccess,
    async (c) => {
        // Use resolved model from middleware for the backend request
        const requestBody = await applySafetyToChatRequest(c, {
            ...(c.req.valid("json" as never) as CreateChatCompletionRequest),
            model: c.var.model.resolved,
        });

        const response = await handleChatCompletionLocal(c, requestBody);

        assertStreamContentType(c, response);

        // add content filter headers if not streaming
        let contentFilterHeaders = {};
        if (!c.var.track.streamRequested) {
            const responseText = await response.clone().text();
            try {
                const parsedResponse = CreateChatCompletionResponseSchema.parse(
                    JSON.parse(responseText),
                    { reportInput: true },
                );
                contentFilterHeaders =
                    contentFilterResultsToHeaders(parsedResponse);
            } catch (parseError) {
                throw new UpstreamError(502, {
                    message: `Upstream returned response that failed schema validation: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                    requestUrl: new URL(c.req.url),
                    upstreamStatus: response.status,
                    responseBody: responseText,
                    cause: parseError,
                });
            }
        }

        return withSafetyHeaders(
            c,
            new Response(response.body, {
                headers: {
                    ...Object.fromEntries(response.headers),
                    ...contentFilterHeaders,
                },
            }),
        );
    },
);

// Validate streaming responses: if client requested stream but upstream
// returned non-SSE, throw rather than forwarding broken data.
function assertStreamContentType(c: Context<Env>, response: Response): void {
    if (c.var.track.streamRequested) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
            throw new UpstreamError(502, {
                message: `Stream requested for model ${c.var.model.resolved} but upstream returned content-type: ${contentType}`,
                requestUrl: new URL(c.req.url),
                upstreamStatus: response.status,
                responseBody: contentType,
            });
        }
    }
}

// Helper to filter models by API key permissions and paid balance.
function filterEntriesByPermissions(
    entries: GenerationModelEntry[],
    allowedModels: string[] | undefined,
    hasPaidBalance?: boolean,
): GenerationModelEntry[] {
    return entries.filter((entry) => {
        if (allowedModels && !allowedModels.includes(entry.id)) return false;
        if (entry.info.paid_only && hasPaidBalance === false) return false;
        return true;
    });
}

// Check if authenticated user has paid balance (pack > 0)
// Auth middleware already fetches the full user row (SELECT *), so no extra DB query needed.
// Returns undefined if no user (unauthenticated), true/false otherwise.
// biome-ignore lint/suspicious/noExplicitAny: User type doesn't include balance fields from SELECT *
function hasPaidBalance(c: any): boolean | undefined {
    const user = c.var?.auth?.user;
    if (!user) return undefined;
    return (user.packBalance ?? 0) > 0;
}

// Factory for model-list endpoints: filters the given models by API key
// permissions and paid balance, then returns them as JSON.
const modelsListHandler =
    (
        getEntries: (
            c: Context<Env>,
        ) => GenerationModelEntry[] | Promise<GenerationModelEntry[]>,
    ) =>
    async (c: Context<Env>) => {
        const allowedModels = c.var.auth?.apiKey?.permissions?.models;
        const paidBalance = hasPaidBalance(c);
        return c.json(
            filterEntriesByPermissions(
                await getEntries(c),
                allowedModels,
                paidBalance,
            ).map((entry) => entry.info),
        );
    };

async function getVisibleModelEntries(c: Context<Env>) {
    return (await getGenerationModelRegistry(c.env)).visibleEntries(
        c.var.auth?.user?.id,
    );
}

async function getVisibleModelEntriesForEventType(
    c: Context<Env>,
    eventType: GenerationModelEntry["eventType"],
) {
    return (await getGenerationModelRegistry(c.env))
        .visibleEntries(c.var.auth?.user?.id)
        .filter((entry) => entry.eventType === eventType);
}

// "3d" models share the "generate.image" EventType with image/video models
// (see model-registry.ts's eventTypeForCategory), so /3d/models and
// /image/models must additionally split on category.
async function getVisibleModel3dEntries(c: Context<Env>) {
    return (
        await getVisibleModelEntriesForEventType(c, "generate.image")
    ).filter((entry) => entry.definition.category === "3d");
}

async function getVisibleImageAndVideoEntries(c: Context<Env>) {
    return (
        await getVisibleModelEntriesForEventType(c, "generate.image")
    ).filter((entry) => entry.definition.category !== "3d");
}

// Video models share the "generate.image" event type with image models, so
// filter by category to return a video-only list for /video/models.
async function getVisibleVideoModelEntries(c: Context<Env>) {
    return (
        await getVisibleModelEntriesForEventType(c, "generate.image")
    ).filter((entry) => entry.definition.category === "video");
}

async function getOrderedVisibleModelEntries(c: Context<Env>) {
    const entries = await getVisibleModelEntries(c);
    return [
        ...entries.filter(
            (entry) =>
                entry.eventType === "generate.text" && !entry.communityEndpoint,
        ),
        ...entries.filter(
            (entry) =>
                entry.eventType === "generate.text" && entry.communityEndpoint,
        ),
        ...entries.filter((entry) => entry.eventType === "generate.image"),
        ...entries.filter((entry) => entry.eventType === "generate.realtime"),
        ...entries.filter((entry) => entry.eventType === "generate.audio"),
        ...entries.filter((entry) => entry.eventType === "generate.embedding"),
    ];
}

export const proxyRoutes = new Hono<Env>()
    // Edge rate limiter: first line of defense (10 req/s per IP)
    .use("*", edgeRateLimit)
    // Optional auth for models endpoints - doesn't require auth but uses it if provided
    .use("/v1/models", auth())
    .use("/image/models", auth())
    .use("/3d/models", auth())
    .use("/video/models", auth())
    .use("/text/models", auth())
    .use("/audio/models", auth())
    .use("/embeddings/models", auth())
    .use("/models", auth())
    .get(
        "/v1/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Models (OpenAI-compatible)",
            description:
                "Returns available models (text, community text/image, image, realtime, audio, embeddings) in the OpenAI-compatible format (`{object: \"list\", data: [...]}`). Use this endpoint if you're using an OpenAI SDK. For richer metadata including pricing and capabilities, use `/models`, `/text/models`, `/image/models`, `/audio/models`, or `/embeddings/models` instead. When authenticated: the owner's private community models are included, models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
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
            const modelEntries = filterEntriesByPermissions(
                await getOrderedVisibleModelEntries(c),
                allowedModels,
                paidBalance,
            );
            const now = Date.now();

            const toModelEntry = (entry: GenerationModelEntry) => ({
                id: entry.info.name,
                object: "model" as const,
                created: now,
                input_modalities: entry.info.input_modalities,
                output_modalities: entry.info.output_modalities,
                supported_endpoints: entry.supportedEndpoints,
                ...(entry.info.tools && { tools: entry.info.tools }),
                ...(entry.info.reasoning && {
                    reasoning: entry.info.reasoning,
                }),
                ...(entry.info.context_length && {
                    context_length: entry.info.context_length,
                }),
            });

            return c.json({
                object: "list" as const,
                data: modelEntries.map(toModelEntry),
            });
        },
    )
    .get(
        "/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Models",
            description:
                "Returns all available text, community text/image, image, video, 3D, realtime, audio, and embedding models with pricing, capabilities, and metadata. When authenticated: the owner's private community models are included, models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
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
        modelsListHandler(getOrderedVisibleModelEntries),
    )
    .get(
        "/3d/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List 3D Models",
            description:
                "Returns all available 3D model generation models with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
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
        modelsListHandler(getVisibleModel3dEntries),
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
        modelsListHandler(getVisibleImageAndVideoEntries),
    )
    .get(
        "/video/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Video Models",
            description:
                "Returns all available video generation models with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
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
        modelsListHandler(getVisibleVideoModelEntries),
    )
    .get(
        "/text/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Text Models (Detailed)",
            description:
                "Returns all available text generation and community text models with pricing, capabilities, and metadata including context window size, supported modalities, and tool support. When authenticated: the owner's private community models are included, models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
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
        modelsListHandler((c) =>
            getVisibleModelEntriesForEventType(c, "generate.text"),
        ),
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
        modelsListHandler((c) =>
            getVisibleModelEntriesForEventType(c, "generate.audio"),
        ),
    )
    .get(
        "/embeddings/models",
        describeRoute({
            tags: ["🔢 Embeddings"],
            summary: "List Embedding Models",
            description:
                "Returns available embedding models with pricing, capabilities, and supported input modalities. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.array(z.any()).meta({
                                    description:
                                        "List of embedding models with pricing and metadata",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(500),
            },
        }),
        modelsListHandler((c) =>
            getVisibleModelEntriesForEventType(c, "generate.embedding"),
        ),
    )
    .post("/register", handleRegisterServer)
    .get("/register", handleRegisterServer)
    // Auth required for all endpoints below (API key only - no session cookies)
    .use(auth())
    .use(frontendKeyRateLimit)
    .use(balance)
    .get(
        "/v1/realtime",
        describeRoute({
            tags: ["🎙️ Realtime"],
            summary: "Realtime WebSocket",
            description: [
                "OpenAI-compatible Realtime WebSocket proxy.",
                "",
                `Connect with \`wss://gen.pollinations.ai/v1/realtime?model=${DEFAULT_REALTIME_MODEL}\` and send/receive Realtime JSON events over the socket.`,
                "Server clients can authenticate with `Authorization: Bearer <key>`. Browser WebSocket clients can use `?key=pk_...` because they cannot set custom authorization headers.",
                "",
                `**Models:** ${REALTIME_MODEL_NAMES.map((model) => `\`${model}\``).join(", ")}.`,
                "",
                "**Billing:** requires a positive balance. Gen proxies the WebSocket, aggregates observed `response.done` usage, and deducts one session total when the socket closes. Input transcription sessions are not supported yet.",
            ].join("\n"),
            responses: {
                101: {
                    description: "WebSocket connection established",
                },
                ...errorResponseDescriptions(
                    400,
                    401,
                    402,
                    403,
                    426,
                    429,
                    500,
                    503,
                ),
            },
        }),
        validator("query", RealtimeRequestQueryParamsSchema),
        resolveModel("generate.realtime"),
        handleRealtimeWebSocket,
    )
    .post(
        "/v1/chat/completions",
        describeRoute({
            tags: ["✍️ Text"],
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
    .post(
        "/v1/embeddings",
        describeRoute({
            tags: ["🔢 Embeddings"],
            summary: "Create Embeddings",
            description: [
                "Generate vector embeddings with an OpenAI-compatible response format.",
                "",
                "**Models:** `gemini-2` supports text, image, audio, and video. `cohere-embed-v4` supports text and one image. OpenAI and Qwen embedding models are text-only.",
                "",
                "**Input:** Pass a string, an array of up to 32 strings, or supported multimodal content parts (`text`, `image_url`, `input_audio`, `video_url`) in the `input` field.",
                "",
                "**Retrieval roles:** Use `task_type` with Gemini text input; it is converted to the model's recommended prompt instruction. Use `input_type` (`query` or `document`) with Cohere.",
                "",
                "**Billing:** Gemini task instructions count toward prompt token usage. Cohere image requests expose one combined usage count, so text accompanying an image is billed at the image-input rate.",
                "",
                "**Gemini migration:** `gemini-2` uses the GA embedding space. Do not mix preview-era and GA vectors; re-embed stored `gemini-2` data before comparing it with new results.",
                "",
                "**Dimensions:** Defaults are model-specific. Qwen supports up to 4096; Gemini and OpenAI large up to 3072; OpenAI small up to 1536; Cohere supports 256, 512, 1024, or 1536.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(CreateEmbeddingResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        textBodyLimit,
        validator("json", CreateEmbeddingRequestSchema),
        resolveModel("generate.embedding"),
        track("generate.embedding"),
        generationAccess,
        async (c) => {
            const requestBody = c.req.valid("json" as never) as z.infer<
                typeof CreateEmbeddingRequestSchema
            >;
            const serviceDef = c.var.model.definition;
            return generateEmbeddings(
                c.env,
                {
                    ...requestBody,
                    model: getEmbeddingProviderModelId(c.var.model.resolved),
                },
                serviceDef,
                c.var.model.resolved,
            );
        },
    )
    .post(
        "/text",
        describeRoute({
            tags: ["✍️ Text"],
            summary: "Text Generation With Messages",
            description: [
                "Generate text from an OpenAI-style messages array and return the assistant content directly.",
                "",
                "Use `/v1/chat/completions` when you need the full OpenAI-compatible JSON response.",
            ].join("\n"),
            responses: {
                200: {
                    description:
                        "Generated text response, audio bytes, JSON message object, or SSE when stream=true",
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500),
            },
        }),
        textBodyLimit,
        validator("json", CreateChatCompletionRequestSchema),
        resolveModel("generate.text"),
        track("generate.text"),
        textCache,
        generationAccess,
        async (c) => {
            const requestBody = await applySafetyToChatRequest(c, {
                ...(c.req.valid(
                    "json" as never,
                ) as CreateChatCompletionRequest),
                model: c.var.model.resolved,
            });

            const response = await handleTextContentLocal(c, requestBody);
            assertStreamContentType(c, response);
            return withSafetyHeaders(c, response);
        },
    )
    .get(
        "/text/:prompt{[\\s\\S]+}",
        describeRoute({
            tags: ["✍️ Text"],
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
        textCache,
        generationAccess,
        async (c) => {
            // Use resolved model from middleware
            const model = c.var.model.resolved;

            const query = c.req.valid("query" as never) as {
                safe?: SafeValue;
                system?: string;
            };
            const textInputs =
                typeof query.system === "string"
                    ? [c.req.param("prompt"), query.system]
                    : [c.req.param("prompt")];
            const [prompt, system] = await applySafetyToTexts(
                c,
                textInputs,
                query.safe,
            );

            return withSafetyHeaders(
                c,
                await handleSimpleTextLocal(
                    c,
                    prompt,
                    model,
                    system ? { system } : undefined,
                ),
            );
        },
    )
    .get(
        // Use :prompt{[\\s\\S]+} regex to capture everything including slashes AND newlines
        // .+ doesn't match newlines, but [\s\S]+ matches any character including \n
        // This creates a named param for OpenAPI docs while matching any characters
        "/image/:prompt{[\\s\\S]+}",
        describeRoute({
            tags: ["🖼️ Image"],
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
        describeRoute({
            tags: ["🎬 Video"],
            summary: "Generate Video",
            description: [
                "Generate a video from a text prompt. Returns MP4.",
                "",
                `**Available models:** ${videoModelNames}.`,
                "",
                "Use `duration` to set video length, `aspectRatio` for orientation, and `audio` where the selected model supports audio output.",
                "",
                "You can pass reference images via the `image` parameter: `image[0]` is the start frame, and `image[1]` is the end frame for models with `end_frame` in `video_capabilities`.",
                "",
                "Browse all available models and their `video_capabilities` at [`/image/models`](https://gen.pollinations.ai/image/models).",
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
        "/3d/:prompt{[\\s\\S]+}",
        describeRoute({
            tags: ["🧊 3D"],
            summary: "Generate 3D Model",
            description: [
                "Generate a 3D model from a text prompt or reference image(s). Returns GLB by default.",
                "",
                `**Available models:** ${model3dModelNames}. \`${DEFAULT_3D_MODEL}\` is the default.`,
                "",
                "Pass reference image URL(s) via the `image` parameter for image-to-3D models (`trellis-2-*`). Separate multiple URLs with `|` or `,`. `hyper3d-rodin` accepts both images and a text prompt.",
                "",
                "Browse all available models and their input requirements at [`/3d/models`](https://gen.pollinations.ai/3d/models).",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success - Returns the generated 3D model",
                    content: {
                        "model/gltf-binary": {
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
                    description:
                        "Text description of the 3D model to generate (required for text-to-3D models; ignored by image-only models)",
                    example: "a low-poly treasure chest",
                }),
            }),
        ),
        validator("query", Generate3dRequestQueryParamsSchema),
        ...model3dHandlers,
    )
    .get(
        "/audio/:text",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Generate Audio",
            description: [
                "Generate speech or music from text via a simple GET request.",
                "",
                "**Text-to-speech (default):** Returns spoken audio in the selected voice and format.",
                "",
                `**Available voices:** ${AUDIO_VOICES.join(", ")}`,
                "",
                "**Output formats:** mp3 (default), opus, aac, flac, wav, pcm",
                "",
                "**Music generation:** Set `model=elevenmusic`, `stable-audio-3-medium`, or `stable-audio-3-large` to generate music instead of speech. `elevenmusic` supports `duration` (3-300 seconds) and `instrumental` mode; `stable-audio-3-medium`/`stable-audio-3-large` support `seconds` (1-380), `steps`, `seed`, and `negative_prompt`. Use `POST /v1/audio/speech` with multipart `reference_audio` for style transfer (medium/large), or `POST /v1/audio/music/upload` to register a source track for inpainting.",
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
                    .enum(AUDIO_VOICES as unknown as [string, ...string[]])
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
                        description:
                            "Audio output format (TTS only). CSM supports mp3, opus, flac, wav, and pcm; Qwen TTS currently returns WAV regardless of this setting; eleven-sfx supports mp3 only.",
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
                    .pipe(z.number().min(0.5).max(300).optional())
                    .meta({
                        description:
                            "Music duration in seconds, 3-300 (elevenmusic only)",
                        example: "30",
                    }),
                seconds: z.coerce.number().min(1).max(380).optional().meta({
                    description:
                        "Audio duration in seconds for stable-audio-3-medium/large, 1-380",
                    example: "30",
                }),
                steps: z.coerce.number().int().min(1).max(100).optional().meta({
                    description:
                        "Sampling steps (stable-audio-3-medium 1-100, stable-audio-3-large 4-8)",
                    example: "8",
                }),
                negative_prompt: z.string().optional().meta({
                    description: "Negative prompt for stable-audio-3-large",
                    example: "distortion, vocals",
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
                instruct: z.string().optional().meta({
                    description:
                        "Emotion/style instruction (qwen-tts-instruct only)",
                    example: "speak softly and warmly",
                }),
                loop: z
                    .enum(["true", "false"])
                    .optional()
                    .transform((v) =>
                        v === undefined ? undefined : v === "true",
                    )
                    .meta({
                        description:
                            "Loop the generated sound effect (eleven-sfx only)",
                        example: "false",
                    }),
                prompt_influence: z
                    .string()
                    .optional()
                    .transform((v) => (v ? Number.parseFloat(v) : undefined))
                    .pipe(z.number().min(0).max(1).optional())
                    .meta({
                        description:
                            "How strictly to follow the prompt, 0-1 (eleven-sfx only)",
                        example: "0.3",
                    }),
                seed: z.coerce
                    .number()
                    .int()
                    .min(-1)
                    .max(4294967295)
                    .optional()
                    .meta({
                        description:
                            "Seed for deterministic output (0-4294967295). Same seed + params = best-effort return of the same cached result. Omit for random.",
                        example: "42",
                    }),
                key: z.string().optional().meta({
                    description:
                        "API key (alternative to Authorization header)",
                }),
                safe: SafeSchema,
            }),
        ),
        resolveModel("generate.audio"),
        track("generate.audio"),
        audioCache,
        generationAccess,
        handleSimpleAudio,
    )
    .post(
        "/v1/images/generations",
        describeRoute({
            tags: ["🖼️ Image"],
            summary: "Generate Image (OpenAI-compatible)",
            description: [
                "OpenAI-compatible image generation endpoint.",
                "",
                'Generate images from text prompts. Supports `response_format: "url"` (returns a pollinations.ai URL) or `"b64_json"` (returns base64-encoded image data, default). Community image models are text-to-image only and support `"b64_json"` only.',
                "",
                "**Authentication:** Include your API key as `Authorization: Bearer YOUR_API_KEY`.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(CreateImageResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        validator("json", CreateImageRequestSchema),
        resolveModel("generate.image"),
        track("generate.image"),
        handleImageGeneration,
    )
    .post(
        "/v1/images/edits",
        describeRoute({
            tags: ["🖼️ Image"],
            summary: "Edit Image (OpenAI-compatible)",
            description: [
                "OpenAI-compatible image editing endpoint.",
                "",
                "Edit images using a text prompt and one or more source images.",
                "Accepts JSON with image URLs or multipart/form-data with file uploads.",
                "Community image models do not support edits yet.",
                "",
                "**Authentication:** Include your API key as `Authorization: Bearer YOUR_API_KEY`.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(CreateImageResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.image"),
        track("generate.image"),
        handleImageEdit,
    );

/**
 * Build an in-process subset of Gen's generation routes for the hosted MCP
 * gateway. The caller supplies the already-validated MCP auth context, so the
 * inbound OAuth token never becomes an upstream Gen bearer credential.
 */
export function createMcpGenerationRoutes(
    authContext: AuthVariables["auth"],
    parent: Context<Env>,
): Hono<Env> {
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("auth", {
                ...authContext,
                requireModelAccess: () => {
                    const allowed = authContext.apiKey?.permissions?.models;
                    const model = c.var.model;
                    if (allowed && model && !allowed.includes(model.resolved)) {
                        throw new HTTPException(403, {
                            message: `Model '${model.requested}' is not allowed for this API key`,
                        });
                    }
                },
            });
            c.set("log", parent.var.log);
            c.set("requestStartedAt", parent.var.requestStartedAt);
            await next();
        })
        .use("*", balance)
        .post("/v1/chat/completions", ...chatCompletionHandlers)
        .get(
            "/image/:prompt{[\\s\\S]+}",
            validator("param", z.object({ prompt: z.string().min(1) })),
            validator("query", GenerateImageRequestQueryParamsSchema),
            ...imageVideoHandlers,
        )
        .get(
            "/video/:prompt{[\\s\\S]+}",
            validator("param", z.object({ prompt: z.string().min(1) })),
            validator("query", GenerateImageRequestQueryParamsSchema),
            ...imageVideoHandlers,
        );
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
