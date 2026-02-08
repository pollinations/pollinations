import type { Logger } from "@logtape/logtape";
import { ELEVENLABS_VOICES, VOICE_MAPPING } from "@shared/registry/audio.ts";
import type { ServiceId } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
} from "@shared/registry/usage-headers.ts";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { getDefaultErrorMessage, UpstreamError } from "@/error.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import type { Env } from "../env.ts";

const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";

const CreateSpeechRequestSchema = z
    .object({
        model: z.string().optional(),
        input: z.string().min(1).max(4096).meta({
            description:
                "The text to generate audio for. Maximum 4096 characters.",
            example: "Hello, welcome to Pollinations!",
        }),
        voice: z
            .enum(ELEVENLABS_VOICES as unknown as [string, ...string[]])
            .default("alloy")
            .meta({
                description: `The voice to use. Available voices: ${ELEVENLABS_VOICES.join(", ")}.`,
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
    })
    .meta({ $id: "CreateSpeechRequest" });

type CreateSpeechRequest = z.infer<typeof CreateSpeechRequestSchema>;

function mapOutputFormat(format: string): string {
    const formatMap: Record<string, string> = {
        mp3: "mp3_44100_128",
        opus: "opus_48000_128",
        aac: "m4a_aac_44100_128",
        flac: "pcm_44100", // ElevenLabs doesn't support flac, use pcm
        wav: "wav_44100",
        pcm: "pcm_44100",
    };
    return formatMap[format] || "mp3_44100_128";
}

export async function generateSpeech(opts: {
    text: string;
    voice: string;
    responseFormat: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { text, voice, responseFormat, apiKey, log } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "TTS service is not configured (missing API key)",
        });
    }

    if (text.length > 4096) {
        return Response.json(
            {
                error: "invalid_request_error",
                message: `Input text too long: ${text.length} characters. Maximum is 4096.`,
            },
            { status: 400 },
        );
    }

    const voiceId = VOICE_MAPPING[voice];
    if (!voiceId) {
        log.warn("Invalid voice requested: {voice}", { voice });
        return Response.json(
            {
                error: "invalid_request_error",
                message: `Invalid voice: ${voice}. Available voices: ${Object.keys(VOICE_MAPPING).join(", ")}.`,
            },
            { status: 400 },
        );
    }

    const outputFormat = mapOutputFormat(responseFormat);

    log.info("TTS request: voice={voice}, format={format}, chars={chars}", {
        voice,
        format: responseFormat,
        chars: text.length,
    });

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const elevenLabsBody = {
        text,
        model_id: DEFAULT_ELEVENLABS_MODEL,
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
        },
    };

    const response = await fetch(elevenLabsUrl, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify(elevenLabsBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        log.warn("ElevenLabs error {status}: {body}", {
            status: response.status,
            body: errorText,
        });
        throw new UpstreamError(response.status as ContentfulStatusCode, {
            message: errorText || getDefaultErrorMessage(response.status),
        });
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";

    const usageHeaders = {
        ...buildUsageHeaders("elevenlabs", createAudioTokenUsage(text.length)),
        "x-tts-voice": voice,
    };

    log.info("TTS success: {chars} characters", { chars: text.length });

    return new Response(response.body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...usageHeaders,
        },
    });
}

/** Set model for tracking — audio routes have fixed providers, no model resolution needed */
const fixedModel = (serviceId: ServiceId) =>
    createMiddleware<{ Variables: ModelVariables }>(async (c, next) => {
        c.set("model", { requested: serviceId, resolved: serviceId });
        await next();
    });

export const audioRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth({ allowApiKey: true, allowSessionCookie: false }), balance)
    .post(
        "/speech",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "Generate speech audio from text using ElevenLabs.",
                "",
                "This endpoint is OpenAI TTS API compatible.",
                "",
                `**Available Voices:** ${ELEVENLABS_VOICES.join(", ")}`,
                "",
                "**Output Formats:** mp3, opus, aac, flac, wav, pcm",
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
                ...errorResponseDescriptions(400, 401, 500),
            },
        }),
        validator("json", CreateSpeechRequestSchema),
        fixedModel("elevenlabs" as ServiceId),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("tts");
            await c.var.auth.requireAuthorization();
            if (c.var.auth.user?.id) {
                await c.var.balance.requirePositiveBalance(
                    c.var.auth.user.id,
                    "Insufficient pollen balance for text-to-speech",
                );
            }

            const { input, voice, response_format } = c.req.valid(
                "json" as never,
            ) as CreateSpeechRequest;

            return generateSpeech({
                text: input,
                voice,
                responseFormat: response_format,
                apiKey: (c.env as unknown as { ELEVENLABS_API_KEY: string })
                    .ELEVENLABS_API_KEY,
                log,
            });
        },
    )
    .post(
        "/transcriptions",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "Transcribe audio to text using Whisper.",
                "",
                "This endpoint is OpenAI Whisper API compatible.",
                "",
                "**Supported formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm",
                "",
                "**Models:** `whisper-large-v3` (default), `whisper-1`",
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
                                        "The model to use. Options: `whisper-large-v3`, `whisper-1`.",
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
                ...errorResponseDescriptions(400, 401, 500),
            },
        }),
        fixedModel("whisper" as ServiceId),
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

            const ovhApiKey = c.env.OVHCLOUD_API_KEY;
            if (!ovhApiKey) {
                throw new UpstreamError(500 as ContentfulStatusCode, {
                    message:
                        "Transcription service is not configured (missing API key)",
                });
            }

            // Parse multipart form and re-send to OVH (Hono consumes the body stream)
            const formData = await c.req.formData();

            // Thin proxy to OVHcloud Whisper
            const response = await fetch(
                "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${ovhApiKey}`,
                    },
                    body: formData,
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                log.warn("Transcription error {status}: {body}", {
                    status: response.status,
                    body: errorText,
                });
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            errorText ||
                            getDefaultErrorMessage(response.status),
                    },
                );
            }

            // Read body to extract duration for usage billing
            const responseBody = await response.text();
            const duration = extractWhisperUsage(responseBody, log);
            const usageHeaders = buildUsageHeaders(
                c.var.model.resolved,
                createAudioSecondsUsage(duration),
            );

            // Build final response with usage headers
            const headers = {
                ...Object.fromEntries(response.headers),
                ...usageHeaders,
            };
            const result = new Response(responseBody, { headers });
            c.var.track.overrideResponseTracking(result.clone());

            return result;
        },
    );

/**
 * Extract usage from Whisper response body and build tracking headers.
 * OVH returns: {"usage": {"type": "duration", "duration": 21.0}, ...}
 */
function extractWhisperUsage(responseBody: string, log: Logger): number {
    const json = JSON.parse(responseBody);
    const duration = json.usage?.duration;
    if (typeof duration !== "number" || duration <= 0) {
        throw new Error(
            `Whisper response missing usage.duration: ${JSON.stringify(json.usage)}`,
        );
    }
    log.debug("Whisper usage: {duration}s", { duration });
    return duration;
}
