import { validator } from "@shared/middleware/validator.ts";
import { DEFAULT_3D_MODEL } from "@shared/registry/model3d.ts";
import {
    CreateChatCompletionRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { SafeSchema } from "@shared/schemas/safety.ts";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { prepareGenerationRequest } from "@/middleware/generation-cache.ts";
import {
    audioExecutionCache,
    imageExecutionCache,
    model3dExecutionCache,
} from "@/middleware/media-cache.ts";
import { resolveModel } from "@/middleware/model.ts";
import { textExecutionCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import { CreateEmbeddingRequestSchema } from "@/schemas/embeddings.ts";
import {
    GenerateImageRequestQueryParamsSchema,
    GenerateVideoRequestQueryParamsSchema,
} from "@/schemas/image.ts";
import {
    Generate3dRequestBodySchema,
    Generate3dRequestQueryParamsSchema,
} from "@/schemas/model3d.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import {
    handleDialogue,
    handleSimpleAudio,
    handleSpeech,
    handleSpeechWithTimestamps,
    handleTranscription,
    handleVoiceChanger,
    handleVoiceIsolator,
} from "./audio.ts";
import {
    generateChatCompletion,
    generateEmbeddingsResponse,
    generateImageVideo,
    generateModel3d,
    generateSimpleText,
    generateTextContent,
    simpleAudioQuerySchema,
    textBodyLimit,
} from "./generation-handlers.ts";
import {
    formatOpenAIImageGeneration,
    handleImageEdit,
    handleImageGeneration,
    prepareOpenAIImageGeneration,
} from "./images.ts";

const factory = createFactory<Env>();

const imageVideoHandlers = factory.createHandlers(
    track("generate.image"),
    imageExecutionCache,
    generateImageVideo,
);

const model3dHandlers = factory.createHandlers(
    resolveModel("generate.image", { defaultModel: DEFAULT_3D_MODEL }),
    track("generate.image"),
    model3dExecutionCache,
    generateModel3d,
);

export const generationExecutorRoutes = new Hono<Env>();

generationExecutorRoutes.post(
    "/v1/chat/completions",
    textBodyLimit,
    validator("json", CreateChatCompletionRequestSchema),
    resolveModel("generate.text"),
    track("generate.text"),
    textExecutionCache,
    generateChatCompletion,
);

generationExecutorRoutes.post(
    "/v1/embeddings",
    textBodyLimit,
    validator("json", CreateEmbeddingRequestSchema),
    resolveModel("generate.embedding"),
    track("generate.embedding"),
    prepareGenerationRequest,
    textExecutionCache,
    generateEmbeddingsResponse,
);

generationExecutorRoutes.post(
    "/text",
    textBodyLimit,
    validator("json", CreateChatCompletionRequestSchema),
    resolveModel("generate.text"),
    track("generate.text"),
    textExecutionCache,
    generateTextContent,
);

generationExecutorRoutes.get(
    "/text/:prompt{[\\s\\S]+}",
    validator("param", z.object({ prompt: z.string().min(1) })),
    validator("query", GenerateTextRequestQueryParamsSchema),
    resolveModel("generate.text"),
    track("generate.text"),
    textExecutionCache,
    generateSimpleText,
);

generationExecutorRoutes.post(
    "/3d/:prompt{[\\s\\S]+}",
    validator("param", z.object({ prompt: z.string().min(1) })),
    validator(
        "query",
        z.object({ key: z.string().optional(), safe: SafeSchema }).strict(),
    ),
    validator("json", Generate3dRequestBodySchema),
    resolveModel("generate.image", { defaultModel: DEFAULT_3D_MODEL }),
    track("generate.image"),
    prepareGenerationRequest,
    model3dExecutionCache,
    generateModel3d,
);

generationExecutorRoutes.get(
    "/image/:prompt{[\\s\\S]+}",
    validator("param", z.object({ prompt: z.string().min(1) })),
    validator("query", GenerateImageRequestQueryParamsSchema),
    resolveModel("generate.image"),
    ...imageVideoHandlers,
);

generationExecutorRoutes.get(
    "/video/:prompt{[\\s\\S]+}",
    validator("param", z.object({ prompt: z.string().min(1) })),
    validator("query", GenerateVideoRequestQueryParamsSchema),
    resolveModel("generate.image", { defaultModel: "veo" }),
    ...imageVideoHandlers,
);

generationExecutorRoutes.get(
    "/3d/:prompt{[\\s\\S]+}",
    validator("param", z.object({ prompt: z.string().min(1) })),
    validator("query", Generate3dRequestQueryParamsSchema),
    ...model3dHandlers,
);

generationExecutorRoutes.get(
    "/audio/:text",
    validator("param", z.object({ text: z.string().min(1) })),
    validator("query", simpleAudioQuerySchema),
    resolveModel("generate.audio", {
        supportedEndpoint: "/audio/{text}",
    }),
    track("generate.audio"),
    audioExecutionCache,
    handleSimpleAudio,
);

generationExecutorRoutes.post(
    "/v1/images/generations",
    validator("json", CreateImageRequestSchema),
    resolveModel("generate.image"),
    track("generate.image"),
    prepareOpenAIImageGeneration,
    formatOpenAIImageGeneration,
    prepareGenerationRequest,
    imageExecutionCache,
    handleImageGeneration,
);

generationExecutorRoutes.post(
    "/v1/images/edits",
    resolveModel("generate.image", { defaultModel: "flux" }),
    track("generate.image"),
    prepareGenerationRequest,
    textExecutionCache,
    handleImageEdit,
);

generationExecutorRoutes.post(
    "/v1/audio/dialogue",
    resolveModel("generate.audio", {
        defaultModel: "eleven-dialogue",
        supportedEndpoint: "/v1/audio/dialogue",
    }),
    track("generate.audio"),
    prepareGenerationRequest,
    audioExecutionCache,
    handleDialogue,
);

generationExecutorRoutes.post(
    "/v1/audio/voice-changer",
    resolveModel("generate.audio", {
        defaultModel: "eleven-voice-changer",
        supportedEndpoint: "/v1/audio/voice-changer",
    }),
    track("generate.audio"),
    prepareGenerationRequest,
    audioExecutionCache,
    handleVoiceChanger,
);

generationExecutorRoutes.post(
    "/v1/audio/voice-isolator",
    resolveModel("generate.audio", {
        defaultModel: "eleven-voice-isolator",
        supportedEndpoint: "/v1/audio/voice-isolator",
    }),
    track("generate.audio"),
    prepareGenerationRequest,
    audioExecutionCache,
    handleVoiceIsolator,
);

generationExecutorRoutes.post(
    "/v1/audio/speech",
    resolveModel("generate.audio", {
        supportedEndpoint: "/v1/audio/speech",
    }),
    track("generate.audio"),
    prepareGenerationRequest,
    audioExecutionCache,
    handleSpeech,
);

generationExecutorRoutes.post(
    "/v1/audio/speech/with-timestamps",
    resolveModel("generate.audio", {
        defaultModel: "elevenlabs",
        supportedEndpoint: "/v1/audio/speech/with-timestamps",
    }),
    track("generate.audio"),
    prepareGenerationRequest,
    textExecutionCache,
    handleSpeechWithTimestamps,
);

generationExecutorRoutes.post(
    "/v1/audio/transcriptions",
    resolveModel("generate.audio", {
        defaultModel: "whisper-large-v3",
        supportedEndpoint: "/v1/audio/transcriptions",
    }),
    track("generate.audio"),
    prepareGenerationRequest,
    textExecutionCache,
    handleTranscription,
);
