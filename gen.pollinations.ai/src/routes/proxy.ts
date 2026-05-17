import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { resolver as baseResolver, describeRoute } from "hono-openapi";
import { generateEmbeddings } from "@/embeddings/handler.ts";
import type { Env } from "@/env.ts";
import { handleImagePrompt, handleRegisterServer } from "@/image/handler.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { audioCache, imageCache } from "@/middleware/media-cache.ts";
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

import { extractRequestShape } from "@shared/observability/request-shape.ts";
import { ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    getAudioModelsInfo,
    getEmbeddingModelsInfo,
    getImageModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
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
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { UpstreamError } from "@/error.ts";
import {
    applySafety,
    applySafetyToChatRequest,
    applySafetyToTexts,
    withSafetyHeaders,
} from "@/middleware/safety.ts";
import { validator } from "@/middleware/validator.ts";
import {
    CreateEmbeddingRequestSchema,
    CreateEmbeddingResponseSchema,
} from "@/schemas/embeddings.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import {
    handleChatCompletionLocal,
    handleSimpleTextLocal,
    handleTextContentLocal,
} from "@/text/handler.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import { checkBalance, generationAccess } from "@/utils/generation-access.ts";
import { handleSimpleAudio } from "./audio.ts";

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
        const rawRequestBody = {
            ...(c.req.valid("json" as never) as CreateChatCompletionRequest),
            model: c.var.model.resolved,
        };
        c.set("requestShape", extractRequestShape(rawRequestBody));
        const requestBody = await applySafetyToChatRequest(c, rawRequestBody);

        const response = await handleChatCompletionLocal(c, requestBody);

        // Validate streaming responses: if client requested stream but upstream
        // returned non-SSE, throw rather than forwarding broken data.
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

// Check if authenticated user has paid balance (pack > 0)
// Auth middleware already fetches the full user row (SELECT *), so no extra DB query needed.
// Returns undefined if no user (unauthenticated), true/false otherwise.
// biome-ignore lint/suspicious/noExplicitAny: User type doesn't include balance fields from SELECT *
function hasPaidBalance(c: any): boolean | undefined {
    const user = c.var?.auth?.user;
    if (!user) return undefined;
    return (user.packBalance ?? 0) > 0;
}

export const proxyRoutes = new Hono<Env>()
    // Edge rate limiter: first line of defense (10 req/s per IP)
    .use("*", edgeRateLimit)
    // Optional auth for models endpoints - doesn't require auth but uses it if provided
    .use("/v1/models", auth())
    .use("/image/models", auth())
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
                'Returns available models (text, image, audio, embeddings) in the OpenAI-compatible format (`{object: "list", data: [...]}`). Use this endpoint if you\'re using an OpenAI SDK. For richer metadata including pricing and capabilities, use `/text/models`, `/image/models`, `/audio/models`, or `/embeddings/models` instead. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.',
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
            const textModels = filterModelsByPermissions(
                getTextModelsInfo(),
                allowedModels,
                paidBalance,
            );
            const imageModels = filterModelsByPermissions(
                getImageModelsInfo(),
                allowedModels,
                paidBalance,
            );
            const audioModels = filterModelsByPermissions(
                getAudioModelsInfo(),
                allowedModels,
                paidBalance,
            );
            const embeddingModels = filterModelsByPermissions(
                getEmbeddingModelsInfo(),
                allowedModels,
                paidBalance,
            );
            const now = Date.now();

            const toModelEntry = (
                m: (typeof textModels)[number],
                supportedEndpoints: string[],
            ) => ({
                id: m.name,
                object: "model" as const,
                created: now,
                input_modalities: m.input_modalities,
                output_modalities: m.output_modalities,
                supported_endpoints: supportedEndpoints,
                ...(m.tools && { tools: m.tools }),
                ...(m.reasoning && { reasoning: m.reasoning }),
                ...(m.context_length && {
                    context_length: m.context_length,
                }),
            });

            return c.json({
                object: "list" as const,
                data: [
                    ...textModels.map((m) =>
                        toModelEntry(m, [
                            "/v1/chat/completions",
                            "/text",
                            "/text/{prompt}",
                        ]),
                    ),
                    ...imageModels.map((m) =>
                        toModelEntry(m, [
                            "/v1/images/generations",
                            "/v1/images/edits",
                            "/image/{prompt}",
                        ]),
                    ),
                    ...audioModels.map((m) =>
                        toModelEntry(m, ["/audio/{text}"]),
                    ),
                    ...embeddingModels.map((m) =>
                        toModelEntry(m, ["/v1/embeddings"]),
                    ),
                ],
            });
        },
    )
    .get(
        "/models",
        describeRoute({
            tags: ["🤖 Models"],
            summary: "List Models",
            description:
                "Returns all available text, image, video, audio, and embedding models with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.",
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
                [
                    ...getTextModelsInfo(),
                    ...getImageModelsInfo(),
                    ...getAudioModelsInfo(),
                    ...getEmbeddingModelsInfo(),
                ],
                allowedModels,
                paidBalance,
            );
            return c.json(models);
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
        async (c) => {
            const allowedModels = c.var.auth?.apiKey?.permissions?.models;
            const paidBalance = hasPaidBalance(c);
            const models = filterModelsByPermissions(
                getEmbeddingModelsInfo(),
                allowedModels,
                paidBalance,
            );
            return c.json(models);
        },
    )
    .post("/register", handleRegisterServer)
    .get("/register", handleRegisterServer)
    // Auth required for all endpoints below (API key only - no session cookies)
    .use(auth())
    .use(frontendKeyRateLimit)
    .use(balance)
    .post(
        "/v1/chat/completions",
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
    .post(
        "/v1/embeddings",
        describeRoute({
            tags: ["🔢 Embeddings"],
            summary: "Create Embeddings",
            description: [
                "Generate vector embeddings with an OpenAI-compatible response format.",
                "",
                "**Models:** `gemini-2` supports text, image, audio, and video inputs. `openai-3-small` and `openai-3-large` are text-only models.",
                "",
                "**Input:** Pass a string, an array of up to 32 strings, or Gemini multimodal content parts (`text`, `image_url`, `input_audio`, `video_url`) in the `input` field.",
                "",
                "**Task types:** `task_type` is Gemini-only. For example, use `RETRIEVAL_QUERY` or `CLASSIFICATION` with `gemini-2`.",
                "",
                "**Dimensions:** Defaults are model-specific. `gemini-2` and `openai-3-large` support up to 3072 dimensions; `openai-3-small` supports up to 1536.",
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
            const serviceDef = getModelDefinition(c.var.model.resolved);
            return generateEmbeddings(
                c.env,
                { ...requestBody, model: serviceDef.modelId },
                serviceDef,
                c.var.model.resolved,
            );
        },
    )
    .post(
        "/text",
        describeRoute({
            tags: ["✍️ Text Generation"],
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
            const rawRequestBody = {
                ...(c.req.valid(
                    "json" as never,
                ) as CreateChatCompletionRequest),
                model: c.var.model.resolved,
            };
            c.set("requestShape", extractRequestShape(rawRequestBody));
            const requestBody = await applySafetyToChatRequest(
                c,
                rawRequestBody,
            );

            const response = await handleTextContentLocal(c, requestBody);
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
            return withSafetyHeaders(c, response);
        },
    )
    .get(
        "/text/:prompt{[\\s\\S]+}",
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
        describeRoute({
            tags: ["🎬 Video Generation"],
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
                        description:
                            "Audio output format (TTS only). Qwen TTS currently returns WAV regardless of this setting.",
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
                style: z.string().optional().meta({
                    description:
                        "Style/genre tags for music generation (acestep only)",
                    example: "brazilian berimbau instrumental",
                }),
                instruct: z.string().optional().meta({
                    description:
                        "Emotion/style instruction (qwen-tts-instruct only)",
                    example: "speak softly and warmly",
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
            tags: ["🖼️ Image Generation"],
            summary: "Generate Image (OpenAI-compatible)",
            description: [
                "OpenAI-compatible image generation endpoint.",
                "",
                'Generate images from text prompts. Supports `response_format: "url"` (returns a pollinations.ai URL) or `"b64_json"` (returns base64-encoded image data, default).',
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
        handleImageGeneration(checkBalance),
    )
    .post(
        "/v1/images/edits",
        describeRoute({
            tags: ["🖼️ Image Generation"],
            summary: "Edit Image (OpenAI-compatible)",
            description: [
                "OpenAI-compatible image editing endpoint.",
                "",
                "Edit images using a text prompt and one or more source images.",
                "Accepts JSON with image URLs or multipart/form-data with file uploads.",
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
        handleImageEdit(checkBalance),
    );

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
