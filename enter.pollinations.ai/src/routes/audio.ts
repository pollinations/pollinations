import { ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
    getDefaultErrorMessage,
    remapUpstreamStatus,
    UpstreamError,
} from "@/error.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { resolveModel } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import type { Env } from "../env.ts";
import {
    generateMusic,
    generateSpeech,
    transcribeWithElevenLabs,
} from "./audio/elevenlabs.ts";
import { generateSunoMusic } from "./audio/suno.ts";

// Re-export for proxy.ts
export { generateMusic, generateSpeech };

const CreateSpeechRequestSchema = z
    .object({
        model: z.string().optional(),
        input: z.string().min(1).max(4096).meta({
            description:
                "The text to generate audio for. Maximum 4096 characters.",
            example: "Hello, welcome to Pollinations!",
        }),
        voice: z
            .string()
            .default("alloy")
            .meta({
                description: `The voice to use. Can be any preset name (${ELEVENLABS_VOICES.join(", ")}) OR a custom ElevenLabs voice ID (UUID from your dashboard).`,
                example: "rachel",
            }),
        response_format: z
            .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
            .default("mp3")
            .meta({
                description: "The audio format for the output.",
                example: "mp3",
            }),
        speed: z.number().min(0.25).max(4.0).default(1.0).meta({
            description:
                "The speed of the generated audio. 0.25 to 4.0, default 1.0.",
            example: 1.0,
        }),
        duration: z.number().min(3).max(300).optional().meta({
            description: "Music duration in seconds, 3-300 (elevenmusic only)",
            example: 30,
        }),
        instrumental: z.boolean().optional().meta({
            description:
                "If true, guarantees instrumental output (elevenmusic only)",
            example: false,
        }),
    })
    .meta({ $id: "CreateSpeechRequest" });

type CreateSpeechRequest = z.infer<typeof CreateSpeechRequestSchema>;

function extractWhisperDuration(responseBody: string): number {
    const duration = JSON.parse(responseBody).usage?.duration;
    if (typeof duration !== "number" || duration <= 0) {
        throw new Error(`Whisper response missing usage.duration`);
    }
    return duration;
}

export const audioRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth({ allowApiKey: true, allowSessionCookie: false }), balance)
    .post(
        "/speech",
        describeRoute({
            tags: ["🔊 Audio Generation"],
            summary: "Text to Speech (OpenAI-compatible)",
            description: [
                "Generate speech or music from text. Compatible with the OpenAI TTS API — use any OpenAI SDK.",
                "",
                "Set `model` to `elevenmusic` to generate music instead of speech.",
                "",
                `**Available voices:** ${ELEVENLABS_VOICES.join(", ")}`,
                "",
                "**Output formats:** mp3 (default), opus, aac, flac, wav, pcm",
            ].join("\n"),
            responses: {
                200: {
                    description: "Success - Returns audio data",
                    content: {
                        "audio/mpeg": {
                            schema: { type: "string", format: "binary" },
                        },
                        "audio/opus": {
                            schema: { type: "string", format: "binary" },
                        },
                        "audio/aac": {
                            schema: { type: "string", format: "binary" },
                        },
                        "audio/flac": {
                            schema: { type: "string", format: "binary" },
                        },
                        "audio/wav": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        validator("json", CreateSpeechRequestSchema),
        resolveModel("generate.audio"),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("tts");
            await c.var.auth.requireAuthorization();
            if (c.var.auth.user?.id) {
                await c.var.balance.requirePositiveBalance(
                    c.var.auth.user.id,
                    "Insufficient pollen balance for audio generation",
                );
            }

            const { input, voice, response_format, duration, instrumental } =
                c.req.valid("json" as never) as CreateSpeechRequest;
            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;

            if (c.var.model.resolved === "suno") {
                const airforceApiKey = (
                    c.env as unknown as { AIRFORCE_API_KEY: string }
                ).AIRFORCE_API_KEY;
                return generateSunoMusic({
                    prompt: input,
                    apiKey: airforceApiKey,
                    log,
                });
            }

            if (c.var.model.resolved === "elevenmusic") {
                return generateMusic({
                    prompt: input,
                    durationSeconds: duration,
                    forceInstrumental: instrumental,
                    apiKey,
                    log,
                });
            }

            return generateSpeech({
                text: input,
                voice,
                responseFormat: response_format,
                apiKey,
                log,
            });
        },
    )
    .post(
        "/transcriptions",
        describeRoute({
            tags: ["🔊 Audio Generation"],
            summary: "Transcribe Audio",
            description: [
                "Transcribe audio files to text. Compatible with the OpenAI Whisper API.",
                "",
                "**Supported audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm",
                "",
                "**Models:**",
                "- `whisper-large-v3` (default) — OpenAI Whisper via OVHcloud",
                "- `whisper-1` — Alias for whisper-large-v3",
                "- `scribe` — ElevenLabs Scribe (90+ languages, word-level timestamps)",
            ].join("\n"),
            requestBody: {
                required: true,
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            required: ["file"],
                            properties: {
                                file: {
                                    type: "string",
                                    format: "binary",
                                    description:
                                        "The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm.",
                                },
                                model: {
                                    type: "string",
                                    default: "whisper-large-v3",
                                    description:
                                        "The model to use. Options: `whisper-large-v3`, `whisper-1`, `scribe`.",
                                },
                                language: {
                                    type: "string",
                                    description:
                                        "Language of the audio in ISO-639-1 format (e.g. `en`, `fr`). Improves accuracy.",
                                },
                                prompt: {
                                    type: "string",
                                    description:
                                        "Optional text to guide the model's style or continue a previous segment.",
                                },
                                response_format: {
                                    type: "string",
                                    enum: [
                                        "json",
                                        "text",
                                        "srt",
                                        "verbose_json",
                                        "vtt",
                                    ],
                                    default: "json",
                                    description:
                                        "The format of the transcript output.",
                                },
                                temperature: {
                                    type: "number",
                                    description:
                                        "Sampling temperature between 0 and 1. Lower is more deterministic.",
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Success - Returns transcription",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    text: { type: "string" },
                                },
                            },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio"),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("transcription");
            await c.var.auth.requireAuthorization();
            if (c.var.auth.user?.id) {
                await c.var.balance.requirePositiveBalance(
                    c.var.auth.user.id,
                    "Insufficient pollen balance for transcription",
                );
            }

            const formData = c.get("formData") || (await c.req.formData());

            const file = formData.get("file") as File;
            const language = formData.get("language") as string | null;
            const responseFormat = formData.get("response_format") as
                | string
                | null;

            if (!file) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Missing required field: file",
                });
            }

            if (c.var.model.resolved === "scribe") {
                const elevenLabsApiKey = (
                    c.env as unknown as { ELEVENLABS_API_KEY: string }
                ).ELEVENLABS_API_KEY;
                const response = await transcribeWithElevenLabs({
                    file,
                    language: language || undefined,
                    responseFormat: responseFormat || undefined,
                    apiKey: elevenLabsApiKey,
                    log,
                });

                c.var.track.overrideResponseTracking(response.clone());
                return response;
            }

            const ovhApiKey = c.env.OVHCLOUD_API_KEY;
            if (!ovhApiKey) {
                throw new UpstreamError(500 as ContentfulStatusCode, {
                    message:
                        "Transcription service is not configured (missing API key)",
                });
            }

            const whisperFormData = new FormData();
            whisperFormData.append("file", file);
            if (language) whisperFormData.append("language", language);
            if (responseFormat)
                whisperFormData.append("response_format", responseFormat);
            whisperFormData.append("model", "whisper-large-v3");

            const response = await fetch(
                "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${ovhApiKey}`,
                    },
                    body: whisperFormData,
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                log.warn("Transcription error {status}: {body}", {
                    status: response.status,
                    body: errorText,
                });
                throw new UpstreamError(remapUpstreamStatus(response.status), {
                    message:
                        errorText || getDefaultErrorMessage(response.status),
                });
            }

            const responseBody = await response.text();
            const duration = extractWhisperDuration(responseBody);
            const usageHeaders = buildUsageHeaders(
                c.var.model.resolved,
                createAudioSecondsUsage(duration),
            );

            const headers = {
                ...Object.fromEntries(response.headers),
                ...usageHeaders,
            };
            const result = new Response(responseBody, { headers });
            c.var.track.overrideResponseTracking(result.clone());

            return result;
        },
    );
