import { UpstreamError } from "@shared/error.ts";
import { AUDIO_VOICES } from "@shared/registry/audio.ts";
import {
    type CreateChatCompletionRequest,
    type CreateChatCompletionResponse,
    CreateChatCompletionResponseSchema,
} from "@shared/schemas/openai.ts";
import { SafeSchema, type SafeValue } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
    generateEmbeddings,
    getEmbeddingProviderModelId,
} from "@/embeddings/handler.ts";
import type { Env } from "@/env.ts";
import { handleImagePrompt } from "@/image/handler.ts";
import {
    applySafety,
    applySafetyToChatRequest,
    applySafetyToTexts,
    withSafetyHeaders,
} from "@/middleware/safety.ts";
import { handle3dPrompt } from "@/model3d/handler.ts";
import type { CreateEmbeddingRequestSchema } from "@/schemas/embeddings.ts";
import {
    handleChatCompletionLocal,
    handleSimpleTextLocal,
    handleTextContentLocal,
} from "@/text/handler.ts";
import { withModelFallbackResponse } from "../fallback.ts";

export const textBodyLimit = bodyLimit({
    maxSize: 20 * 1024 * 1024,
});

export const simpleAudioQuerySchema = z.object({
    voice: z
        .enum(AUDIO_VOICES as unknown as [string, ...string[]])
        .default("alloy")
        .meta({
            description: "Voice to use for speech generation (TTS only)",
            example: "nova",
        }),
    response_format: z
        .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
        .default("mp3")
        .meta({
            description:
                "Audio output format. CSM and Kokoro support mp3, opus, flac, wav, and pcm; Qwen TTS currently returns WAV regardless of this setting; lyria-3-clip and eleven-sfx support mp3 only.",
            example: "mp3",
        }),
    model: z.string().optional().meta({
        description:
            "Audio model: TTS (default) or a music-generation model such as lyria-3-clip",
        example: "tts-1",
    }),
    duration: z
        .string()
        .optional()
        .transform((v) => (v ? parseFloat(v) : undefined))
        .pipe(z.number().min(0.5).max(300).optional())
        .meta({
            description:
                "Music duration in seconds (elevenmusic 3-300; lyria-3-clip fixed at 30)",
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
        description: "Emotion/style instruction (qwen-tts-instruct only)",
        example: "speak softly and warmly",
    }),
    loop: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true"))
        .meta({
            description: "Loop the generated sound effect (eleven-sfx only)",
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
    seed: z.coerce.number().int().min(-1).max(4294967295).optional().meta({
        description:
            "Seed passed to the model. Same seed + parameters return the same cached result while available.",
        example: "42",
    }),
    key: z.string().optional().meta({
        description: "API key (alternative to Authorization header)",
    }),
    safe: SafeSchema,
});

export async function generateImageVideo(c: Context<Env>): Promise<Response> {
    const query = c.req.valid("query" as never) as { safe?: SafeValue };
    const prompt = await applySafety(
        c,
        c.req.param("prompt") || "",
        query.safe,
    );
    return withSafetyHeaders(c, await handleImagePrompt(c, prompt));
}

export async function generateModel3d(c: Context<Env>): Promise<Response> {
    const query = c.req.valid("query" as never) as { safe?: SafeValue };
    const prompt = await applySafety(
        c,
        c.req.param("prompt") || "",
        query.safe,
    );
    return withSafetyHeaders(c, await handle3dPrompt(c, prompt));
}

export async function generateEmbeddingsResponse(
    c: Context<Env>,
): Promise<Response> {
    const requestBody = c.req.valid("json" as never) as z.infer<
        typeof CreateEmbeddingRequestSchema
    >;
    const { response, servedEntry } = await withModelFallbackResponse(
        c.var.model,
        (candidate) =>
            generateEmbeddings(
                c.env,
                {
                    ...requestBody,
                    model: getEmbeddingProviderModelId(candidate.id),
                },
                candidate.definition ?? c.var.model.definition,
                candidate.id,
            ),
        c.var.track?.failedCalls,
    );
    if (servedEntry) c.set("servedModelEntry", servedEntry);
    return response;
}

export async function generateChatCompletion(
    c: Context<Env>,
): Promise<Response> {
    const requestBody = await applySafetyToChatRequest(c, {
        ...(c.req.valid("json" as never) as CreateChatCompletionRequest),
        model: c.var.model.resolved,
    });

    const response = await handleChatCompletionLocal(c, requestBody);
    if (!response.ok) return response;

    assertStreamContentType(c, response, c.var.upstreamRequestUrl);

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
                requestUrl: c.var.upstreamRequestUrl,
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
}

export async function generateTextContent(c: Context<Env>): Promise<Response> {
    const requestBody = await applySafetyToChatRequest(c, {
        ...(c.req.valid("json" as never) as CreateChatCompletionRequest),
        model: c.var.model.resolved,
    });
    const response = await handleTextContentLocal(c, requestBody);
    assertStreamContentType(c, response, c.var.upstreamRequestUrl);
    return withSafetyHeaders(c, response);
}

export async function generateSimpleText(c: Context<Env>): Promise<Response> {
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
            c.var.model.resolved,
            system ? { system } : undefined,
        ),
    );
}

function assertStreamContentType(
    c: Context<Env>,
    response: Response,
    upstreamRequestUrl: URL | undefined,
): void {
    if (c.var.track.streamRequested) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
            throw new UpstreamError(502, {
                message: `Stream requested for model ${c.var.model.resolved} but upstream returned content-type: ${contentType}`,
                requestUrl: upstreamRequestUrl,
                responseBody: contentType,
            });
        }
    }
}

export function contentFilterResultsToHeaders(
    response: CreateChatCompletionResponse,
): Record<string, string> {
    const promptFilters =
        response.prompt_filter_results?.[0]?.content_filter_results;
    const completionFilters = response.choices?.[0]?.content_filter_results;
    const headerMappings: Array<[string, unknown]> = [
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

    const headers: Record<string, string> = {};
    for (const [key, value] of headerMappings) {
        if (value) headers[key] = String(value);
    }
    return headers;
}
