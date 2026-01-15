import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { getDefaultErrorMessage, UpstreamError } from "@/error.ts";
import { auth } from "@/middleware/auth.ts";
import { resolveModel } from "@/middleware/model.ts";
import { polar } from "@/middleware/polar.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import type { Env } from "../env.ts";

// Usage tracking helper - inline to avoid import path issues with Vite
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

// Voice name → ElevenLabs voice_id mapping
// Includes OpenAI-compatible names and native ElevenLabs voices
const VOICE_MAPPING: Record<string, string> = {
    // OpenAI-compatible voice names (mapped to similar ElevenLabs voices)
    alloy: "21m00Tcm4TlvDq8ikWAM", // Rachel
    echo: "29vD33N1CtxCmqQRPOHJ", // Drew
    fable: "EXAVITQu4vr4xnSDxMaL", // Bella
    onyx: "ErXwobaYiN019PkySvjV", // Antoni
    nova: "MF3mGyEYCl7XYWbV9V6O", // Elli
    shimmer: "ThT5KcBeYPX3keUQqHPh", // Dorothy

    // ElevenLabs Default Voices - Female
    rachel: "21m00Tcm4TlvDq8ikWAM", // Calm, conversational
    domi: "AZnzlk1XvdvUeBnXmlld", // Strong, confident
    bella: "EXAVITQu4vr4xnSDxMaL", // Soft, gentle
    elli: "MF3mGyEYCl7XYWbV9V6O", // Young, bright
    charlotte: "XB0fDUnXU5powFXDhCwa", // Sophisticated, seductive
    dorothy: "ThT5KcBeYPX3keUQqHPh", // Pleasant, British
    sarah: "EXAVITQu4vr4xnSDxMaL", // Soft, news anchor
    emily: "LcfcDJNUP1GQjkzn1xUU", // Calm, gentle
    lily: "pFZP5JQG7iQjIQuC4Bku", // Warm, British narrator

    // ElevenLabs Default Voices - Male
    adam: "pNInz6obpgDQGcFmaJgB", // Deep, natural
    antoni: "ErXwobaYiN019PkySvjV", // Well-rounded, calm
    arnold: "VR6AewLTigWG4xSOukaG", // Crisp, deep
    josh: "TxGEqnHWrfWFTfGW9XjX", // Deep, young American
    sam: "yoZ06aMxZJJ28mfd3POQ", // Raspy, young American
    daniel: "onwK4e9ZLuTAKqWW03F9", // Deep, British
    charlie: "IKne3meq5aSn9XLyUdCD", // Casual Australian
    james: "ZQe5CZNOzWyzPSCn5a3c", // Calm, old British
    fin: "D38z5RcWu1voky8WS1ja", // Sailor, Irish
    callum: "N2lVS1w4EtoT3dr4eOWO", // Intense, transatlantic
    liam: "TX3LPaxmHKxFdv7VOQHJ", // Articulate, neutral
    george: "JBFqnCBsd6RMkjVDRZzb", // Warm, British
    brian: "nPczCjzI2devNBz1zQrb", // Deep, American narrator
    bill: "pqHfZKP75CvOlQylNhV4", // Trustworthy, American
    matilda: "XrExE9yKIg1WjnnlVkGX", // Warm, friendly
};

// Default ElevenLabs model
const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";

// OpenAI TTS request schema
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
            .string()
            .default("alloy")
            .meta({
                description:
                    "The voice to use. OpenAI voices: alloy, echo, fable, onyx, nova, shimmer. " +
                    "ElevenLabs voices: rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, " +
                    "adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill, matilda.",
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

// Map OpenAI response_format to ElevenLabs output_format
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

// Map OpenAI speed to ElevenLabs stability (inverse relationship)
// Higher speed = lower stability for faster, more dynamic speech
function mapSpeedToStability(speed: number): number {
    // OpenAI speed 0.25-4.0 → ElevenLabs stability 0.0-1.0
    // Slower speed = higher stability, faster = lower stability
    return Math.max(0, Math.min(1, 1.5 - speed * 0.5));
}

export const audioRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth({ allowApiKey: true, allowSessionCookie: false }), polar)
    .post(
        "/speech",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description: [
                "Generate speech audio from text using ElevenLabs.",
                "",
                "This endpoint is OpenAI TTS API compatible.",
                "",
                "**Available Voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse",
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
        async (c) => {
            const log = c.get("log").getChild("tts");
            await c.var.auth.requireAuthorization();

            // Check pollen balance
            if (c.var.auth.user?.id) {
                await c.var.polar.requirePositiveBalance(
                    c.var.auth.user.id,
                    "Insufficient pollen balance for text-to-speech",
                );
            }

            const body: CreateSpeechRequest = await c.req.json();
            const { input, voice, response_format, speed } = body;

            // Map OpenAI voice to ElevenLabs voice_id
            const voiceId = VOICE_MAPPING[voice] || VOICE_MAPPING.alloy;
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

            // Build ElevenLabs request
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

            // Get content type from ElevenLabs response
            const contentType =
                response.headers.get("content-type") || "audio/mpeg";

            // Build usage headers for billing (character count as audio tokens)
            const usageHeaders = {
                ...buildAudioUsageHeaders("elevenlabs", input.length),
                "x-tts-voice": voice,
                "x-usage-characters": String(input.length), // Keep for backward compatibility
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
