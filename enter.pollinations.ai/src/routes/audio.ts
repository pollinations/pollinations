import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { getDefaultErrorMessage, UpstreamError } from "@/error.ts";
import { auth } from "@/middleware/auth.ts";
import { resolveModel } from "@/middleware/model.ts";
import { balance } from "@/middleware/balance.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import type { Env } from "../env.ts";
import { VOICE_MAPPING, ELEVENLABS_VOICES } from "@shared/registry/audio.ts";

function buildAudioUsageHeaders(
    modelUsed: string,
    completionAudioTokens: number,
): Record<string, string> {
    return {
        "x-model-used": modelUsed,
        "x-usage-completion-audio-tokens": String(completionAudioTokens),
        "x-usage-total-tokens": String(completionAudioTokens),
    };
}

const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";

const CreateSpeechRequestSchema = z
    .object({
        model: z.string().default("tts-1").meta({
            description:
                "TTS model to use. Currently maps to ElevenLabs models.",
            example: "tts-1",
        }),
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
        opus: "opus_16000",
        aac: "aac_44100",
        flac: "flac_44100",
        wav: "pcm_44100",
        pcm: "pcm_44100",
    };
    return formatMap[format] || "mp3_44100_128";
}

function mapSpeedToStability(speed: number): number {
    return Math.max(0, Math.min(1, 1.5 - speed * 0.5));
}

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
        resolveModel("generate.audio"),
        track("generate.audio"),
        async (c: Context<Env>) => {
            const log = c.get("log").getChild("tts");
            await c.var.auth.requireAuthorization();

            if (c.var.auth.user?.id) {
                await c.var.balance.requirePositiveBalance(
                    c.var.auth.user.id,
                    "Insufficient pollen balance for text-to-speech",
                );
            }

            const body: CreateSpeechRequest = await c.req.json();
            const { input, voice, response_format, speed } = body;

            const voiceId = VOICE_MAPPING[voice];
            if (!voiceId) {
                log.warn("Invalid voice requested: {voice}", { voice });
                return c.json(
                    {
                        error: "invalid_request_error",
                        message: `Invalid voice: ${voice}. Available voices: ${Object.keys(VOICE_MAPPING).join(", ")}.`,
                    },
                    400,
                );
            }

            const outputFormat = mapOutputFormat(response_format);
            const stability = mapSpeedToStability(speed);

            log.info(
                "TTS request: voice={voice}, format={format}, chars={chars}",
                {
                    voice,
                    format: response_format,
                    chars: input.length,
                },
            );

            const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

            const elevenLabsBody = {
                text: input,
                model_id: DEFAULT_ELEVENLABS_MODEL,
                voice_settings: {
                    stability: stability,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                },
            };

            const response = await fetch(elevenLabsUrl, {
                method: "POST",
                headers: {
                    "xi-api-key": (
                        c.env as unknown as { ELEVENLABS_API_KEY: string }
                    ).ELEVENLABS_API_KEY,
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
                throw new UpstreamError(
                    response.status as ContentfulStatusCode,
                    {
                        message:
                            errorText ||
                            getDefaultErrorMessage(response.status),
                    },
                );
            }

            const contentType =
                response.headers.get("content-type") || "audio/mpeg";

            const usageHeaders = {
                ...buildAudioUsageHeaders("elevenlabs", input.length),
                "x-tts-voice": voice,
                "x-usage-characters": String(input.length),
            };

            log.info("TTS success: {chars} characters", {
                chars: input.length,
            });

            return new Response(response.body, {
                status: 200,
                headers: {
                    "Content-Type": contentType,
                    ...usageHeaders,
                },
            });
        },
    );
