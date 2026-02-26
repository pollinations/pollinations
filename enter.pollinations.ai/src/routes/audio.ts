import type { Logger } from "@logtape/logtape";
import {
    ELEVENLABS_VOICES,
    resolveElevenLabsVoiceId,
} from "@shared/registry/audio.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
    createCompletionAudioSecondsUsage,
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
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Input text too long: ${text.length} characters. Maximum is 4096.`,
        });
    }

    const voiceId = resolveElevenLabsVoiceId(voice);

    // Basic sanity check (custom voice IDs are long strings/UUIDs)
    if (!voiceId || voiceId.length < 8) {
        log.warn("Invalid voice requested: {voice}", { voice });
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Invalid voice: ${voice}. Use a preset name or valid ElevenLabs voice ID.`,
        });
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
        throw new UpstreamError(remapUpstreamStatus(response.status), {
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

interface ElevenLabsTranscriptionResponse {
    text: string;
    language_code?: string;
    words?: {
        text: string;
        start: number;
        end: number;
    }[];
}

export async function transcribeWithElevenLabs(opts: {
    file: File;
    language?: string;
    responseFormat?: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { file, language, responseFormat = "json", apiKey, log } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Transcription service is not configured (missing API key)",
        });
    }

    // Validate response format
    if (
        responseFormat &&
        !["json", "text", "verbose_json"].includes(responseFormat)
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for scribe model: ${responseFormat}. Supported: json, text, verbose_json`,
        });
    }

    log.info("ElevenLabs transcription: format={format}, size={size}", {
        format: responseFormat,
        size: file.size,
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model_id", "scribe_v2");
    if (language) {
        formData.append("language_code", language);
    }

    const response = await fetch(
        "https://api.elevenlabs.io/v1/speech-to-text",
        {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
            },
            body: formData,
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        log.warn("ElevenLabs transcription error {status}: {body}", {
            status: response.status,
            body: errorText,
        });
        throw new UpstreamError(remapUpstreamStatus(response.status), {
            message: errorText || getDefaultErrorMessage(response.status),
        });
    }

    const elevenLabsData: ElevenLabsTranscriptionResponse =
        await response.json();

    // Get duration from word timestamps (Scribe v2 always returns words)
    if (!elevenLabsData.words?.length) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "ElevenLabs response missing word timestamps (required for billing)",
        });
    }
    const duration = elevenLabsData.words[elevenLabsData.words.length - 1].end;

    const usageHeaders = buildUsageHeaders(
        "scribe",
        createAudioSecondsUsage(duration),
    );

    log.info("ElevenLabs transcription success: {chars} chars, {duration}s", {
        chars: elevenLabsData.text.length,
        duration: Math.round(duration * 10) / 10,
    });

    // Return response based on format
    if (responseFormat === "text") {
        return new Response(elevenLabsData.text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "verbose_json") {
        // OpenAI verbose format with word-level timestamps and segments
        const verboseResponse = {
            text: elevenLabsData.text,
            task: "transcribe",
            language: elevenLabsData.language_code || "unknown",
            duration,
            words: elevenLabsData.words?.map((w) => ({
                word: w.text,
                start: w.start,
                end: w.end,
            })),
            segments: [
                {
                    id: 0,
                    start: 0,
                    end: duration,
                    text: elevenLabsData.text,
                },
            ],
        };
        return Response.json(verboseResponse, { headers: usageHeaders });
    }

    // Default: json format
    return Response.json(
        { text: elevenLabsData.text },
        { headers: usageHeaders },
    );
}

export async function generateMusic(opts: {
    prompt: string;
    durationSeconds?: number;
    forceInstrumental?: boolean;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { prompt, durationSeconds, forceInstrumental, apiKey, log } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Music service is not configured (missing API key)",
        });
    }

    if (prompt.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Prompt too long: ${prompt.length} characters. Maximum is 10000.`,
        });
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

    const elevenLabsBody: Record<string, unknown> = {
        prompt,
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
        throw new UpstreamError(remapUpstreamStatus(response.status), {
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

            const { input, voice, response_format } = c.req.valid(
                "json" as never,
            ) as CreateSpeechRequest;
            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;

            if (c.var.model.resolved === "elevenmusic") {
                const { duration, instrumental } = c.req.valid(
                    "json" as never,
                ) as CreateSpeechRequest;
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

            // Get formData from middleware or parse it
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

            // Route to ElevenLabs Scribe or Whisper based on model
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

                // Override tracking with final response
                c.var.track.overrideResponseTracking(response.clone());
                return response;
            }

            // Default: Whisper (OVHcloud)
            const ovhApiKey = c.env.OVHCLOUD_API_KEY;
            if (!ovhApiKey) {
                throw new UpstreamError(500 as ContentfulStatusCode, {
                    message:
                        "Transcription service is not configured (missing API key)",
                });
            }

            // Re-build formData for Whisper (Hono consumed the original body stream)
            const whisperFormData = new FormData();
            whisperFormData.append("file", file);
            if (language) whisperFormData.append("language", language);
            if (responseFormat)
                whisperFormData.append("response_format", responseFormat);
            whisperFormData.append("model", "whisper-large-v3");

            // Thin proxy to OVHcloud Whisper
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
