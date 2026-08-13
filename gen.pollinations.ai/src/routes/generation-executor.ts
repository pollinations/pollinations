import { validator } from "@shared/middleware/validator.ts";
import { DEFAULT_3D_MODEL } from "@shared/registry/model3d.ts";
import {
    CreateChatCompletionRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { z } from "zod";
import type { Env } from "@/env.ts";
import {
    audioExecutionCache,
    imageExecutionCache,
    model3dExecutionCache,
} from "@/middleware/media-cache.ts";
import { resolveModel } from "@/middleware/model.ts";
import { textExecutionCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import {
    GenerateImageRequestQueryParamsSchema,
    GenerateVideoRequestQueryParamsSchema,
} from "@/schemas/image.ts";
import { Generate3dRequestQueryParamsSchema } from "@/schemas/model3d.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import { handleSimpleAudio } from "./audio.ts";
import {
    generateChatCompletion,
    generateImageVideo,
    generateModel3d,
    generateSimpleText,
    generateTextContent,
    simpleAudioQuerySchema,
    textBodyLimit,
} from "./generation-handlers.ts";
import {
    formatOpenAIImageGeneration,
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
    imageExecutionCache,
    handleImageGeneration,
);
