import type { Logger } from "@logtape/logtape";
import { ELEVENLABS_VOICES, VOICE_MAPPING } from "@shared/registry/audio.ts";
import type { ServiceId } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
    createCompletionAudioSecondsUsage,
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
import { resolveModel } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import type { Env } from "../env.ts";

const DEFAULT_ELEVENLABS_MODEL = "eleven_v3";

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
                description: `The voice to use for TTS. Available voices: ${ELEVENLABS_VOICES.join(", ")}.`,
                example: "rachel",
            }),
        style: z.string().max(200).optional().meta({
            description:
                "Music style/genre descriptors for music models (heartmula, elevenmusic). Comma-separated tags, e.g. 'pop, female vocal, upbeat'.",
            example: "pop, female vocal, upbeat",
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
            description: "Music duration in seconds, 3-300 (music models only)",
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

export async function generateMusic(opts: {
    prompt: string;
    style?: string;
    durationSeconds?: number;
    forceInstrumental?: boolean;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { prompt, style, durationSeconds, forceInstrumental, apiKey, log } =
        opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Music service is not configured (missing API key)",
        });
    }

    if (prompt.length > 10000) {
        return Response.json(
            {
                error: "invalid_request_error",
                message: `Prompt too long: ${prompt.length} characters. Maximum is 10000.`,
            },
            { status: 400 },
        );
    }

    log.info(
        "Music request: chars={chars}, duration={duration}, instrumental={instrumental}",
        {
            chars: prompt.length,
            duration: durationSeconds || "auto",
            instrumental: forceInstrumental || false,
        },
    );

    const elevenLabsUrl = "https://api.elevenlabs.io/v1/music";

    const combinedPrompt = [style, prompt].filter(Boolean).join("\n\n");

    const elevenLabsBody: Record<string, unknown> = {
        prompt: combinedPrompt,
        model_id: "music_v1",
    };
    if (durationSeconds !== undefined) {
        elevenLabsBody.music_length_ms = Math.round(durationSeconds * 1000);
    }
    if (forceInstrumental) {
        elevenLabsBody.force_instrumental = true;
    }

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
        log.warn("ElevenLabs Music error {status}: {body}", {
            status: response.status,
            body: errorText,
        });
        throw new UpstreamError(response.status as ContentfulStatusCode, {
            message: errorText || getDefaultErrorMessage(response.status),
        });
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";

    // Buffer response to estimate duration from MP3 byte size
    // MP3 at 128kbps ≈ 16000 bytes/second (±20% for VBR or different bitrates)
    const audioBuffer = await response.arrayBuffer();
    const estimatedDuration = audioBuffer.byteLength / 16000;

    const usageHeaders = buildUsageHeaders(
        "elevenmusic",
        createCompletionAudioSecondsUsage(estimatedDuration),
    );

    log.info("Music success: {bytes} bytes, ~{duration}s", {
        bytes: audioBuffer.byteLength,
        duration: Math.round(estimatedDuration),
    });

    return new Response(audioBuffer, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...usageHeaders,
        },
    });
}

export async function generateHeartMuLaMusic(opts: {
    prompt: string;
    style?: string;
    durationSeconds?: number;
    serviceUrl: string;
    backendToken?: string;
    log: Logger;
}): Promise<Response> {
    const { prompt, style, durationSeconds, serviceUrl, backendToken, log } =
        opts;

    if (!serviceUrl) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Music generation service is not configured (missing MUSIC_SERVICE_URL)",
        });
    }

    log.info("HeartMuLa request: chars={chars}, duration={duration}", {
        chars: prompt.length,
        duration: durationSeconds || "auto",
    });

    const maxLengthMs = durationSeconds
        ? Math.round(durationSeconds * 1000)
        : 60000;

    const heartMuLaBody = {
        lyrics: prompt,
        tags: style || "",
        max_length_ms: Math.min(maxLengthMs, 240000),
        temperature: 1.0,
        topk: 50,
        cfg_scale: 1.5,
    };

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (backendToken) {
        headers["x-backend-token"] = backendToken;
    }

    const response = await fetch(`${serviceUrl}/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify(heartMuLaBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        log.warn("HeartMuLa error {status}: {body}", {
            status: response.status,
            body: errorText,
        });
        throw new UpstreamError(response.status as ContentfulStatusCode, {
            message: errorText || getDefaultErrorMessage(response.status),
        });
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const generationTime = response.headers.get("x-generation-time") || "";

    const audioBuffer = await response.arrayBuffer();
    // MP3 at 128kbps ≈ 16000 bytes/second
    const estimatedDuration = audioBuffer.byteLength / 16000;

    const usageHeaders = buildUsageHeaders(
        "heartmula",
        createCompletionAudioSecondsUsage(estimatedDuration),
    );

    log.info(
        "HeartMuLa success: {bytes} bytes, ~{duration}s, gen_time={genTime}",
        {
            bytes: audioBuffer.byteLength,
            duration: Math.round(estimatedDuration),
            genTime: generationTime,
        },
    );

    return new Response(audioBuffer, {
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
                "Generate audio from text — speech (TTS) or music.",
                "",
                "This endpoint is OpenAI TTS API compatible.",
                "Set `model` to `elevenmusic` (or alias `music`) to generate music instead of speech.",
                "",
                `**TTS Voices:** ${ELEVENLABS_VOICES.join(", ")}`,
                "",
                "**Output Formats (TTS only):** mp3, opus, aac, flac, wav, pcm",
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

            const {
                input,
                voice,
                response_format,
                duration,
                instrumental,
                style,
            } = c.req.valid("json" as never) as CreateSpeechRequest;
            const apiKey = c.env.ELEVENLABS_API_KEY;

            if (c.var.model.resolved === "heartmula") {
                return generateHeartMuLaMusic({
                    prompt: input,
                    style,
                    durationSeconds: duration,
                    serviceUrl: c.env.MUSIC_SERVICE_URL,
                    backendToken: c.env.PLN_IMAGE_BACKEND_TOKEN,
                    log,
                });
            }

            if (c.var.model.resolved === "elevenmusic") {
                return generateMusic({
                    prompt: input,
                    style,
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
