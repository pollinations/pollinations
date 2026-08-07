import type { Logger } from "@logtape/logtape";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    AUDIO_VOICES,
    type AudioModelName,
    CSM_VOICES,
    KOKORO_VOICES,
    resolveElevenLabsVoiceId,
} from "@shared/registry/audio.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
    createCompletionAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import { SafeSchema, type SafeValue } from "@shared/schemas/safety.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { resolveModel } from "@/middleware/model.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import {
    applySafety,
    applySafetyToTexts,
    withSafetyHeaders,
} from "@/middleware/safety.ts";
import { track } from "@/middleware/track.ts";
import googleCloudAuth from "@/text/auth/googleCloudAuth.ts";
import { arrayBufferToBase64 } from "@/util.ts";
import { requireGenerationAccess } from "@/utils/generation-access.ts";
import {
    type FallbackCandidate,
    withModelFallbackResponse,
} from "../fallback.ts";
import { transcribeWithAssemblyAi } from "./assemblyai-transcription.ts";
import { buildTranscriptionResponse } from "./transcription-response.ts";

const CreateSpeechRequestSchema = z
    .object({
        model: z.string().optional(),
        input: z.string().min(1).max(10000).meta({
            description:
                "The text to generate audio for. Maximum 10000 characters.",
            example: "Hello, welcome to Pollinations!",
        }),
        safe: SafeSchema,
        voice: z
            .string()
            .default("alloy")
            .meta({
                description: `The voice to use. Model-specific presets include ${AUDIO_VOICES.join(", ")}; ElevenLabs models also accept a custom voice ID.`,
                example: "rachel",
            }),
        response_format: z
            .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
            .default("mp3")
            .meta({
                description:
                    "The audio format for the output. CSM and Kokoro support mp3, opus, flac, wav, and pcm; Qwen TTS currently returns WAV regardless of this setting; lyria-3-clip and eleven-sfx support mp3 only.",
                example: "mp3",
            }),
        duration: z.number().min(0.5).max(300).optional().meta({
            description:
                "Output duration in seconds (elevenmusic 3-300; lyria-3-clip fixed at 30; eleven-sfx 0.5-30)",
            example: 30,
        }),
        seconds: z.number().min(1).max(380).optional().meta({
            description:
                "Audio duration in seconds for stable-audio-3-medium/large, 1-380.",
            example: 30,
        }),
        steps: z.number().int().min(1).max(100).optional().meta({
            description:
                "Sampling steps (stable-audio-3-medium 1-100, stable-audio-3-large 4-8).",
            example: 8,
        }),
        negative_prompt: z.string().max(10000).optional().meta({
            description: "Negative prompt for stable-audio-3-large.",
            example: "distortion, vocals",
        }),
        loop: z.boolean().optional().meta({
            description: "Loop the generated sound effect (eleven-sfx only)",
            example: false,
        }),
        prompt_influence: z.number().min(0).max(1).optional().meta({
            description:
                "How strictly to follow the prompt, 0-1 (eleven-sfx only)",
            example: 0.3,
        }),
        instrumental: z.boolean().optional().meta({
            description:
                "If true, guarantees instrumental output (elevenmusic only)",
            example: false,
        }),
        store_for_inpainting: z.boolean().optional().meta({
            description:
                "If true, stores the generated elevenmusic song and returns its song ID for later inpainting.",
            example: false,
        }),
        extract_composition_plan: z.boolean().optional().meta({
            description:
                "If true with reference audio, uploads it and asks ElevenLabs to derive a music_v2 composition plan.",
            example: false,
        }),
        conditioning_ref: z.unknown().optional().meta({
            description:
                "ElevenLabs music_v2 AudioRefChunk to apply to the generated chunk. Multipart reference_audio can create this automatically.",
        }),
        composition_plan: z.unknown().optional().meta({
            description:
                "ElevenLabs composition_plan for music generation/inpainting. Cannot be combined with a plain prompt upstream.",
        }),
        seed: z.number().int().min(0).max(4294967295).optional().meta({
            description:
                "Seed for deterministic output. Same seed + params = best-effort return of the same cached result. Omit for random.",
            example: 42,
        }),
        instruct: z.string().optional().meta({
            description:
                "Emotion/style instruction (qwen-tts-instruct only). e.g. 'excited and cheerful'.",
            example: "speak softly and warmly",
        }),
    })
    .meta({ $id: "CreateSpeechRequest" });

type CreateSpeechRequest = z.infer<typeof CreateSpeechRequestSchema>;
const CreateDialogueRequestSchema = z
    .object({
        model: z.string().optional(),
        inputs: z
            .array(
                z.object({
                    text: z.string().min(1).max(2000),
                    voice: z.string().min(1),
                }),
            )
            .min(1)
            .max(25),
        response_format: z
            .enum(["mp3", "opus", "aac", "wav", "pcm"])
            .default("mp3"),
        seed: z.number().int().min(0).max(4294967295).optional(),
        safe: SafeSchema,
    })
    .refine(
        ({ inputs }) =>
            inputs.reduce((total, input) => total + input.text.length, 0) <=
            2000,
        {
            path: ["inputs"],
            message: "Dialogue input is limited to 2000 total text characters.",
        },
    )
    .meta({ $id: "CreateDialogueRequest" });

type AudioContext = Context<Env>;

async function withAudioFallback(
    c: AudioContext,
    attempt: (candidate: FallbackCandidate) => Promise<Response>,
): Promise<Response> {
    const { response, servedEntry } = await withModelFallbackResponse(
        c.var.model,
        attempt,
        c.var.track?.failedCalls,
    );
    if (servedEntry) c.set("servedModelEntry", servedEntry);
    return response;
}
type SimpleAudioQuery = {
    safe?: SafeValue;
    duration?: number;
    seconds?: number;
    steps?: number;
    negative_prompt?: string;
    instrumental?: boolean;
    seed?: number;
    voice: string;
    response_format: string;
    instruct?: string;
    loop?: boolean;
    prompt_influence?: number;
};

type AudioRefChunk = {
    song_id: string;
    range: {
        start_ms: number;
        end_ms: number;
    };
};

type GenerateMusicOptions = {
    prompt: string;
    durationSeconds?: number;
    forceInstrumental?: boolean;
    seed?: number;
    storeForInpainting?: boolean;
    extractCompositionPlan?: boolean;
    conditioningRef?: unknown;
    compositionPlan?: unknown;
    referenceAudio?: File;
    apiKey: string;
    log: Logger;
};

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

/**
 * ElevenLabs streams WAV with a placeholder length in the RIFF header (the
 * data-chunk size and the overall RIFF size are written as 0x7FFFFFFF and never
 * back-patched once the real length is known). Tools that trust the header
 * (Python `wave`, ffmpeg) then crash or truncate. Rewrite both size fields to
 * the real byte counts. No-op if the header is already correct or not RIFF/WAVE.
 */
export function fixWavHeader(buffer: ArrayBuffer): ArrayBuffer {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 44) return buffer; // too short to be a valid WAV header
    const view = new DataView(buffer);
    const tag = (offset: number) =>
        String.fromCharCode(
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        );
    if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return buffer;

    // Walk the chunk list (offset 12 onward) to find the `data` sub-chunk,
    // honouring declared sizes rather than scanning bytes (which could match
    // "data" inside the PCM payload).
    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const chunkId = tag(offset);
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === "data") {
            const actualDataSize = bytes.length - (offset + 8);
            if (chunkSize === actualDataSize) return buffer; // already correct
            view.setUint32(offset + 4, actualDataSize, true); // data chunk size
            view.setUint32(4, bytes.length - 8, true); // RIFF chunk size
            return buffer;
        }
        offset += 8 + chunkSize;
    }
    return buffer; // no data chunk found
}

async function buildElevenLabsAudioResponse(
    response: Response,
    responseFormat: string,
    headers: Record<string, string>,
): Promise<Response> {
    const contentType = response.headers.get("content-type") || "audio/mpeg";

    // ElevenLabs streams WAV with placeholder RIFF sizes, so WAV must be
    // buffered and repaired. Other formats keep streaming from upstream.
    if (responseFormat === "wav") {
        const audioBuffer = fixWavHeader(await response.arrayBuffer());
        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(audioBuffer.byteLength),
                ...headers,
            },
        });
    }

    return new Response(response.body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...headers,
        },
    });
}

const ELEVENLABS_TTS_MODEL_IDS = {
    elevenlabs: "eleven_v3",
    elevenflash: "eleven_flash_v2_5",
    "eleven-multilingual-v2": "eleven_multilingual_v2",
} as const satisfies Partial<Record<AudioModelName, string>>;

const ELEVENLABS_TTS_VOICE_SETTINGS = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
} as const;

type ElevenLabsTtsModelName = keyof typeof ELEVENLABS_TTS_MODEL_IDS;

export async function generateElevenLabsSpeech(opts: {
    modelName: ElevenLabsTtsModelName;
    text: string;
    voice: string;
    responseFormat: string;
    seed?: number;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { modelName, text, voice, responseFormat, apiKey, log } = opts;
    const modelId = ELEVENLABS_TTS_MODEL_IDS[modelName];

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "TTS service is not configured (missing API key)",
        });
    }

    if (text.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Input text too long: ${text.length} characters. Maximum is 10000.`,
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

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`;

    const elevenLabsBody = {
        text,
        model_id: modelId,
        voice_settings: ELEVENLABS_TTS_VOICE_SETTINGS,
        ...(opts.seed === undefined ? {} : { seed: opts.seed }),
    };

    const rawResponse = await fetch(elevenLabsUrl, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify(elevenLabsBody),
    });
    const response = await ensureUpstreamOk(rawResponse, elevenLabsUrl);

    const usageHeaders = {
        ...buildUsageHeaders(modelName, createAudioTokenUsage(text.length)),
        "x-tts-voice": voice,
    };

    log.info("TTS success: {chars} characters", { chars: text.length });

    return buildElevenLabsAudioResponse(response, responseFormat, usageHeaders);
}

export async function generateElevenLabsSpeechWithTimestamps(opts: {
    modelName: ElevenLabsTtsModelName;
    text: string;
    voice: string;
    responseFormat: string;
    seed?: number;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { modelName, text, voice, responseFormat, seed, apiKey, log } = opts;
    const modelId = ELEVENLABS_TTS_MODEL_IDS[modelName];

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "TTS service is not configured (missing API key)",
        });
    }
    if (text.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Input text too long: ${text.length} characters. Maximum is 10000.`,
        });
    }

    const voiceId = resolveElevenLabsVoiceId(voice);
    if (!voiceId || voiceId.length < 8) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Invalid voice: ${voice}. Use a preset name or valid ElevenLabs voice ID.`,
        });
    }

    const outputFormat = mapOutputFormat(responseFormat);
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${outputFormat}`;
    const body = {
        text,
        model_id: modelId,
        voice_settings: ELEVENLABS_TTS_VOICE_SETTINGS,
        ...(seed === undefined ? {} : { seed }),
    };

    log.info(
        "Timestamped TTS request: voice={voice}, format={format}, chars={chars}",
        {
            voice,
            format: responseFormat,
            chars: text.length,
        },
    );

    const response = await ensureUpstreamOk(
        await fetch(endpoint, {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(body),
        }),
        endpoint,
    );
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("application/json")) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: "ElevenLabs returned an invalid timestamp response.",
        });
    }

    log.info("Timestamped TTS success: {chars} characters", {
        chars: text.length,
    });

    return new Response(response.body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...buildUsageHeaders(modelName, createAudioTokenUsage(text.length)),
            "x-tts-voice": voice,
            "x-pollinations-response-format": "audio-with-timestamps",
        },
    });
}

export async function generateElevenLabsDialogue(opts: {
    inputs: { text: string; voice: string }[];
    responseFormat: string;
    seed?: number;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { inputs, responseFormat, seed, apiKey, log } = opts;
    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Dialogue service is not configured (missing API key)",
        });
    }

    const characterCount = inputs.reduce(
        (total, input) => total + input.text.length,
        0,
    );
    if (characterCount > 2000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Dialogue input too long: ${characterCount} characters. Maximum is 2000.`,
        });
    }

    const resolvedInputs = inputs.map((input) => ({
        text: input.text,
        voice_id: resolveElevenLabsVoiceId(input.voice),
    }));
    const uniqueVoices = new Set(resolvedInputs.map((input) => input.voice_id));
    if (uniqueVoices.size > 10) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "Dialogue supports at most 10 unique voices per request.",
        });
    }
    if (resolvedInputs.some((input) => input.voice_id.length < 8)) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message:
                "Each dialogue voice must be a preset name or valid ElevenLabs voice ID.",
        });
    }

    const outputFormat = mapOutputFormat(responseFormat);
    const endpoint = `https://api.elevenlabs.io/v1/text-to-dialogue?output_format=${outputFormat}`;
    const body: Record<string, unknown> = {
        inputs: resolvedInputs,
        model_id: "eleven_v3",
    };
    if (seed !== undefined) body.seed = seed;

    log.info(
        "Dialogue request: turns={turns}, voices={voices}, chars={chars}, format={format}",
        {
            turns: inputs.length,
            voices: uniqueVoices.size,
            chars: characterCount,
            format: responseFormat,
        },
    );

    const response = await ensureUpstreamOk(
        await fetch(endpoint, {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
            },
            body: JSON.stringify(body),
        }),
        endpoint,
    );
    const usageHeaders = buildUsageHeaders(
        "eleven-dialogue",
        createAudioTokenUsage(characterCount),
    );
    return buildElevenLabsAudioResponse(response, responseFormat, usageHeaders);
}

const ELEVENLABS_AUDIO_CREDITS_PER_SECOND = 12;

export function getElevenLabsMeteredInputSeconds(
    response: Response,
    log: Logger,
): number {
    // The provider's `character-cost` header is its metering source for these
    // audio-input APIs. Direct 1s and 61s probes returned 12 and 734 units for
    // both Voice Changer and Voice Isolator, confirming approximately 12
    // metering units per input second with no one-minute minimum. At the
    // ElevenLabs Scale-plan rate of $0.166 per 1K credits, that reconciles to
    // approximately $0.12 per input minute.
    const characterCost = Number(response.headers.get("character-cost"));
    if (!Number.isFinite(characterCost) || characterCost <= 0) {
        log.error(
            "ElevenLabs response missing valid character-cost metering: {characterCost}",
            {
                characterCost: response.headers.get("character-cost"),
            },
        );
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message:
                "ElevenLabs response did not include valid input-duration metering.",
        });
    }
    return characterCost / ELEVENLABS_AUDIO_CREDITS_PER_SECOND;
}

export async function changeVoiceWithElevenLabs(opts: {
    audio: File;
    voice: string;
    responseFormat: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { audio, voice, responseFormat, apiKey, log } = opts;
    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Voice Changer service is not configured (missing API key)",
        });
    }
    if (audio.size > 50 * 1024 * 1024) {
        throw new UpstreamError(413 as ContentfulStatusCode, {
            message: "Voice Changer audio must be 50 MB or smaller.",
        });
    }
    if (audio.type && !audio.type.startsWith("audio/")) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "Voice Changer requires an audio file.",
        });
    }

    const voiceId = resolveElevenLabsVoiceId(voice);
    if (!voiceId || voiceId.length < 8) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Invalid voice: ${voice}. Use a preset name or valid ElevenLabs voice ID.`,
        });
    }

    const outputFormat = mapOutputFormat(responseFormat);
    const endpoint = `https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`;
    const formData = new FormData();
    formData.append("audio", audio, audio.name || "audio");
    formData.append("model_id", "eleven_multilingual_sts_v2");

    log.info(
        "Voice Changer request: voice={voice}, format={format}, bytes={bytes}",
        {
            voice,
            format: responseFormat,
            bytes: audio.size,
        },
    );

    const response = await ensureUpstreamOk(
        await fetch(endpoint, {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                Accept: "audio/*",
            },
            body: formData,
        }),
        endpoint,
    );
    const inputSeconds = getElevenLabsMeteredInputSeconds(response, log);
    const usageHeaders = {
        ...buildUsageHeaders(
            "eleven-voice-changer",
            createAudioSecondsUsage(inputSeconds),
        ),
        "x-voice-changer-voice": voice,
    };
    log.info("Voice Changer success: inputSeconds={seconds}", {
        seconds: inputSeconds,
    });

    return buildElevenLabsAudioResponse(response, responseFormat, usageHeaders);
}

export async function isolateVoiceWithElevenLabs(opts: {
    audio: File;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { audio, apiKey, log } = opts;
    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Voice Isolator service is not configured (missing API key)",
        });
    }
    if (audio.size > 50 * 1024 * 1024) {
        throw new UpstreamError(413 as ContentfulStatusCode, {
            message: "Voice Isolator input must be 50 MB or smaller.",
        });
    }
    if (
        audio.type &&
        !audio.type.startsWith("audio/") &&
        !audio.type.startsWith("video/")
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "Voice Isolator requires an audio or video file.",
        });
    }

    const endpoint = "https://api.elevenlabs.io/v1/audio-isolation";
    const formData = new FormData();
    formData.append("audio", audio, audio.name || "audio");

    log.info("Voice Isolator request: type={type}, bytes={bytes}", {
        type: audio.type,
        bytes: audio.size,
    });

    const response = await ensureUpstreamOk(
        await fetch(endpoint, {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                Accept: "audio/mpeg",
            },
            body: formData,
        }),
        endpoint,
    );
    const inputSeconds = getElevenLabsMeteredInputSeconds(response, log);

    log.info("Voice Isolator success: inputSeconds={seconds}", {
        seconds: inputSeconds,
    });

    return new Response(response.body, {
        headers: {
            "Content-Type":
                response.headers.get("content-type") || "audio/mpeg",
            ...buildUsageHeaders(
                "eleven-voice-isolator",
                createAudioSecondsUsage(inputSeconds),
            ),
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
        speaker_id?: string | null;
        type?: string;
    }[];
}

export async function transcribeWithElevenLabs(opts: {
    file: File;
    language?: string;
    responseFormat?: string;
    apiKey: string;
    log: Logger;
    numSpeakers?: number;
}): Promise<Response> {
    const {
        file,
        language,
        responseFormat = "json",
        apiKey,
        log,
        numSpeakers,
    } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Transcription service is not configured (missing API key)",
        });
    }

    // Validate response format
    if (
        responseFormat &&
        !["json", "text", "verbose_json", "diarized_json"].includes(
            responseFormat,
        )
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for scribe model: ${responseFormat}. Supported: json, text, verbose_json, diarized_json`,
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
    const wantsDiarizedJson = responseFormat === "diarized_json";

    if (wantsDiarizedJson) {
        formData.append("diarize", "true");
        if (numSpeakers !== undefined) {
            formData.append("num_speakers", String(numSpeakers));
        }
    }

    const elevenLabsUrl = "https://api.elevenlabs.io/v1/speech-to-text";
    const rawResponse = await fetch(elevenLabsUrl, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
        },
        body: formData,
    });
    const response = await ensureUpstreamOk(rawResponse, elevenLabsUrl);

    const elevenLabsData: ElevenLabsTranscriptionResponse =
        await response.json();

    // Scribe usually returns word-level timestamps; for silent audio or audio
    // with no detectable speech, the words array can be empty. Treat that as
    // a successful empty transcription rather than a server error.
    const lastWord = elevenLabsData.words?.at(-1);
    const duration = lastWord?.end ?? 0;
    if (!lastWord) {
        log.warn(
            "ElevenLabs scribe returned no word timestamps; billing 0s (file size={size})",
            { size: file.size },
        );
    }

    const usageHeaders = buildUsageHeaders(
        "scribe",
        createAudioSecondsUsage(duration),
    );

    log.info("ElevenLabs transcription success: {chars} chars, {duration}s", {
        chars: elevenLabsData.text.length,
        duration: Math.round(duration * 10) / 10,
    });

    // Scribe word/utterance values are already in seconds — normalize and
    // hand off to the shared OpenAI-compatible response formatter.
    return buildTranscriptionResponse({
        normalized: {
            text: elevenLabsData.text,
            language: elevenLabsData.language_code,
            duration,
            words:
                elevenLabsData.words?.map((w) => ({
                    word: w.text,
                    start: w.start,
                    end: w.end,
                })) ?? [],
            diarizedSegments: groupScribeUtterances(elevenLabsData.words),
        },
        responseFormat,
        usageHeaders,
    });
}

function groupScribeUtterances(
    words:
        | {
              text: string;
              start: number;
              end: number;
              speaker_id?: string | null;
              type?: string;
          }[]
        | undefined,
): { speaker: string | null; text: string; start: number; end: number }[] {
    if (!words || words.length === 0) return [];

    const utterances: {
        speaker: string | null;
        text: string;
        start: number;
        end: number;
    }[] = [];
    let current: {
        speaker: string | null;
        words: typeof words;
    } | null = null;

    for (const w of words) {
        const speaker: string | null =
            w.type === "spacing" && current
                ? current.speaker
                : (w.speaker_id ?? null);
        if (current && current.speaker === speaker) {
            current.words.push(w);
        } else {
            if (current) utterances.push(finalizeScribeUtterance(current));
            current = { speaker, words: [w] };
        }
    }
    if (current) utterances.push(finalizeScribeUtterance(current));

    return utterances;
}

function finalizeScribeUtterance(group: {
    speaker: string | null;
    words: {
        text: string;
        start: number;
        end: number;
        type?: string;
    }[];
}): { speaker: string | null; text: string; start: number; end: number } {
    const first = group.words[0];
    const last = group.words[group.words.length - 1];
    const text = group.words
        .map((w) => w.text)
        .join("")
        .trim();
    return {
        speaker: group.speaker,
        text,
        start: first?.start ?? 0,
        end: last?.end ?? first?.start ?? 0,
    };
}

function parseJsonObject(value: string, fieldName: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `${fieldName} must be valid JSON`,
        });
    }
}

function createConditionedCompositionPlan(opts: {
    prompt: string;
    durationSeconds?: number;
    conditioningRef: unknown;
}): { chunks: unknown[] } {
    return {
        chunks: [
            {
                text: opts.prompt,
                duration_ms: Math.round((opts.durationSeconds ?? 30) * 1000),
                positive_styles: ["great production quality"],
                conditioning_ref: opts.conditioningRef,
                condition_strength: "high",
            },
        ],
    };
}

async function uploadMusicReference(opts: {
    file: File;
    extractCompositionPlan?: boolean;
    apiKey: string;
    log: Logger;
}): Promise<{
    song_id?: string;
    composition_plan?: unknown;
}> {
    const uploadUrl = "https://api.elevenlabs.io/v1/music/upload";
    const formData = new FormData();
    const filename =
        opts.file.name && opts.file.name !== "blob"
            ? opts.file.name
            : "reference.mp3";
    formData.append("file", opts.file, filename);
    if (opts.extractCompositionPlan) {
        formData.append("extract_composition_plan", "music_v2");
    }

    opts.log.info(
        "ElevenLabs music upload: filename={filename}, size={size}, extractPlan={extractPlan}",
        {
            filename,
            size: opts.file.size,
            extractPlan: opts.extractCompositionPlan || false,
        },
    );

    const rawResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "xi-api-key": opts.apiKey },
        body: formData,
    });
    const response = await ensureUpstreamOk(rawResponse, uploadUrl);
    return (await response.json()) as {
        song_id?: string;
        composition_plan?: unknown;
    };
}

export async function generateMusic(
    opts: GenerateMusicOptions,
): Promise<Response> {
    const {
        prompt,
        durationSeconds,
        forceInstrumental,
        apiKey,
        log,
        referenceAudio,
    } = opts;

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

    const modelId = "music_v2";
    let uploadedSongId: string | undefined;
    let compositionPlan = opts.compositionPlan;
    let conditioningRef = opts.conditioningRef;

    if (referenceAudio) {
        const upload = await uploadMusicReference({
            file: referenceAudio,
            extractCompositionPlan: opts.extractCompositionPlan,
            apiKey,
            log,
        });
        uploadedSongId = upload.song_id;
        if (!uploadedSongId) {
            throw new UpstreamError(502 as ContentfulStatusCode, {
                message: "ElevenLabs music upload response missing song_id",
            });
        }
        if (compositionPlan === undefined && opts.extractCompositionPlan) {
            compositionPlan = upload.composition_plan;
        }
        if (conditioningRef === undefined) {
            conditioningRef = {
                song_id: uploadedSongId,
                range: {
                    start_ms: 0,
                    end_ms: Math.min(
                        Math.round((durationSeconds ?? 30) * 1000),
                        30_000,
                    ),
                },
            } satisfies AudioRefChunk;
        }
    }

    if (compositionPlan === undefined && conditioningRef !== undefined) {
        compositionPlan = createConditionedCompositionPlan({
            prompt,
            durationSeconds,
            conditioningRef,
        });
    }

    log.info(
        "Music request: model={model}, chars={chars}, duration={duration}, instrumental={instrumental}, reference={reference}, plan={plan}",
        {
            model: modelId,
            chars: prompt.length,
            duration: durationSeconds || "auto",
            instrumental: forceInstrumental || false,
            reference: Boolean(conditioningRef),
            plan: Boolean(compositionPlan),
        },
    );

    const elevenLabsUrl = "https://api.elevenlabs.io/v1/music";

    const elevenLabsBody: Record<string, unknown> = {
        model_id: modelId,
    };
    if (compositionPlan !== undefined) {
        elevenLabsBody.composition_plan = compositionPlan;
    } else {
        elevenLabsBody.prompt = prompt;
    }
    if (durationSeconds !== undefined && compositionPlan === undefined) {
        elevenLabsBody.music_length_ms = Math.round(durationSeconds * 1000);
    }
    if (forceInstrumental && compositionPlan === undefined) {
        elevenLabsBody.force_instrumental = true;
    }
    if (opts.seed !== undefined && compositionPlan === undefined) {
        elevenLabsBody.seed = opts.seed;
    }
    if (opts.storeForInpainting) {
        elevenLabsBody.store_for_inpainting = true;
    }

    const rawResponse = await fetch(elevenLabsUrl, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify(elevenLabsBody),
    });
    const response = await ensureUpstreamOk(rawResponse, elevenLabsUrl);

    const contentType = response.headers.get("content-type") || "audio/mpeg";

    // Buffer response and extract duration
    const audioBuffer = await response.arrayBuffer();
    // ElevenLabs Music v2 returns 192 kbps CBR MP3 (= 24 kB/s, ffprobe-verified
    // across 10s/30s clips). Estimate duration from byte size rather than parsing
    // the container. NOTE: must match the real output bitrate or billing skews —
    // the previous 16 kB/s (128 kbps) constant over-counted seconds by 1.5x.
    const MUSIC_MP3_BYTES_PER_SECOND = 24000;
    const estimatedDuration =
        audioBuffer.byteLength / MUSIC_MP3_BYTES_PER_SECOND;

    const usageHeaders = buildUsageHeaders(
        "elevenmusic",
        createCompletionAudioSecondsUsage(estimatedDuration),
    );
    const responseHeaders: Record<string, string> = {
        "Content-Type": contentType,
        ...usageHeaders,
    };
    const generatedSongId = response.headers.get("song-id");
    if (generatedSongId) {
        responseHeaders["song-id"] = generatedSongId;
        responseHeaders["x-elevenlabs-song-id"] = generatedSongId;
    }
    if (uploadedSongId) {
        responseHeaders["x-elevenlabs-reference-song-id"] = uploadedSongId;
    }

    log.info("Music success: {bytes} bytes, ~{duration}s", {
        bytes: audioBuffer.byteLength,
        duration: Math.round(estimatedDuration),
    });

    return new Response(audioBuffer, {
        status: 200,
        headers: responseHeaders,
    });
}

/**
 * Calls ElevenLabs Sound Effects (text -> sound effect) via /v1/sound-generation.
 * Billed per second of output audio (see registry `eleven-sfx` cost block).
 */
export async function generateSoundEffect(opts: {
    prompt: string;
    durationSeconds?: number;
    loop?: boolean;
    promptInfluence?: number;
    responseFormat?: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const {
        prompt,
        durationSeconds,
        loop,
        promptInfluence,
        responseFormat,
        apiKey,
        log,
    } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Sound effects service is not configured (missing API key)",
        });
    }
    // SFX always returns 128 kbps MP3. The per-second price is derived from the
    // MP3 byte rate, so honoring other formats would need per-format billing
    // math — reject instead of silently downgrading (default "mp3" passes).
    if (responseFormat && responseFormat !== "mp3") {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `eleven-sfx only supports mp3 output; response_format=${responseFormat} is not available.`,
        });
    }
    if (prompt.length > 1000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Prompt too long: ${prompt.length} characters. Maximum is 1000.`,
        });
    }

    const modelId = "eleven_text_to_sound_v2";
    const elevenLabsUrl = "https://api.elevenlabs.io/v1/sound-generation";

    const body: Record<string, unknown> = { text: prompt, model_id: modelId };
    // ElevenLabs SFX supports 0.5-30s; omit to let the model decide the length.
    if (durationSeconds !== undefined) {
        body.duration_seconds = Math.min(Math.max(durationSeconds, 0.5), 30);
    }
    if (loop !== undefined) body.loop = loop;
    if (promptInfluence !== undefined) body.prompt_influence = promptInfluence;

    log.info("Sound effect request: chars={chars}, duration={duration}", {
        chars: prompt.length,
        duration: durationSeconds ?? "auto",
    });

    const rawResponse = await fetch(elevenLabsUrl, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const response = await ensureUpstreamOk(rawResponse, elevenLabsUrl);

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = await response.arrayBuffer();
    // ElevenLabs Sound Effects returns 128 kbps CBR MP3 (= 16 kB/s, ffprobe-verified).
    const SFX_MP3_BYTES_PER_SECOND = 16000;
    const estimatedDuration = audioBuffer.byteLength / SFX_MP3_BYTES_PER_SECOND;

    const usageHeaders = buildUsageHeaders(
        "eleven-sfx",
        createCompletionAudioSecondsUsage(estimatedDuration),
    );

    log.info("Sound effect success: {bytes} bytes, ~{duration}s", {
        bytes: audioBuffer.byteLength,
        duration: Math.round(estimatedDuration),
    });

    return new Response(audioBuffer, {
        status: 200,
        headers: { "Content-Type": contentType, ...usageHeaders },
    });
}

const QWEN_TTS_ENDPOINT =
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

const DEEPINFRA_TTS_ENDPOINT =
    "https://api.deepinfra.com/v1/openai/audio/speech";
const LYRIA_3_CLIP_MODEL_ID = "lyria-3-clip-preview";
const DEEPINFRA_AUDIO_FORMATS = ["mp3", "opus", "flac", "wav", "pcm"] as const;
const DEEPINFRA_TTS_CONFIGS = {
    "csm-1b": {
        modelId: "sesame/csm-1b",
        voices: CSM_VOICES,
        defaultVoice: "conversational_a",
        maxCharacters: 200,
    },
    kokoro: {
        modelId: "hexgrad/Kokoro-82M",
        voices: KOKORO_VOICES,
        defaultVoice: "af_alloy",
        maxCharacters: 10_000,
    },
} as const satisfies Partial<
    Record<
        AudioModelName,
        {
            modelId: string;
            voices: readonly string[];
            defaultVoice: string;
            maxCharacters: number;
        }
    >
>;

type DeepInfraTtsModelName = keyof typeof DEEPINFRA_TTS_CONFIGS;

const QWEN_TTS_MODEL_IDS = {
    "qwen-tts": "qwen3-tts-flash",
    "qwen-tts-instruct": "qwen3-tts-instruct-flash",
} as const satisfies Partial<Record<AudioModelName, string>>;

type QwenTtsModelName = keyof typeof QWEN_TTS_MODEL_IDS;

type LyriaInteractionResponse = {
    status?: string;
    outputs?: Array<{
        type?: string;
        mime_type?: string;
        data?: string;
    }>;
};

const QWEN_TTS_OPENAI_VOICE_MAP: Record<string, string> = {
    alloy: "Chelsie",
    echo: "Ethan",
    fable: "Cherry",
    onyx: "Ryan",
    nova: "Serena",
    shimmer: "Jada",
    coral: "Cherry",
    verse: "Ethan",
    ballad: "Ryan",
    ash: "Ethan",
    sage: "Serena",
};

function resolveQwenVoice(voice: string): string {
    return QWEN_TTS_OPENAI_VOICE_MAP[voice] ?? voice;
}

export async function generateLyria3Clip(opts: {
    prompt: string;
    durationSeconds?: number;
    responseFormat: string;
    projectId: string;
    accessToken: string;
    log: Logger;
}): Promise<Response> {
    const {
        prompt,
        durationSeconds,
        responseFormat,
        projectId,
        accessToken,
        log,
    } = opts;

    if (responseFormat !== "mp3") {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `lyria-3-clip only supports mp3 output; response_format=${responseFormat} is not available.`,
        });
    }
    if (durationSeconds !== undefined && durationSeconds !== 30) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message:
                "lyria-3-clip generates fixed 30-second clips; duration must be 30 or omitted.",
        });
    }
    if (!projectId || !accessToken) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Lyria service is not configured",
        });
    }

    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/interactions`;
    const rawResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            model: LYRIA_3_CLIP_MODEL_ID,
            input: [{ type: "text", text: prompt }],
        }),
    });
    const response = await ensureUpstreamOk(rawResponse, endpoint);
    const result = (await response.json()) as LyriaInteractionResponse;
    const audio = result.outputs?.find(
        (output) =>
            output.type === "audio" &&
            output.mime_type === "audio/mpeg" &&
            typeof output.data === "string",
    );

    if (result.status !== "completed" || !audio?.data) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: "Lyria returned no completed MP3 audio output",
        });
    }

    const binary = atob(audio.data);
    const audioBytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        audioBytes[index] = binary.charCodeAt(index);
    }

    log.info("Lyria success: {bytes} bytes", {
        bytes: audioBytes.byteLength,
    });

    return new Response(audioBytes, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
            ...buildUsageHeaders("lyria-3-clip", {
                // Vertex charges one fixed-price unit per generated clip.
                completionAudioTokens: 1,
            }),
        },
    });
}

function requireElevenMusicOptions(
    model: string,
    opts: {
        referenceAudio?: File;
        compositionPlan?: unknown;
        conditioningRef?: unknown;
        storeForInpainting?: boolean;
        extractCompositionPlan?: boolean;
    },
): void {
    // elevenmusic supports every conditioning option.
    if (model === "elevenmusic") return;

    // ElevenLabs-only options (everything except a plain reference clip).
    const usesElevenOnlyOptions =
        opts.compositionPlan !== undefined ||
        opts.conditioningRef !== undefined ||
        opts.storeForInpainting === true ||
        opts.extractCompositionPlan === true;

    // stable-audio-3-medium (fal) and stable-audio-3-large (Stability direct)
    // accept reference_audio for audio-to-audio, but not the ElevenLabs
    // composition/conditioning options.
    if (model === "stable-audio-3-medium" || model === "stable-audio-3-large") {
        if (usesElevenOnlyOptions) {
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message:
                    "conditioning_ref, composition_plan, store_for_inpainting, and extract_composition_plan are only supported with model=elevenmusic.",
            });
        }
        return;
    }

    // Any other model: none of these options are supported.
    if (!opts.referenceAudio && !usesElevenOnlyOptions) return;

    throw new UpstreamError(400 as ContentfulStatusCode, {
        message:
            "reference_audio, conditioning_ref, composition_plan, store_for_inpainting, and extract_composition_plan are only supported with model=elevenmusic (stable-audio-3-medium and stable-audio-3-large also accept reference_audio).",
    });
}

function parseOptionalNumber(
    value: FormDataEntryValue | null,
    fieldName: string,
): number | undefined {
    if (value === null || value === "") return undefined;
    if (typeof value !== "string") {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `${fieldName} must be a number`,
        });
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `${fieldName} must be a number`,
        });
    }
    return parsed;
}

function parseOptionalBoolean(
    value: FormDataEntryValue | null,
    fieldName: string,
): boolean | undefined {
    if (value === null || value === "") return undefined;
    if (typeof value !== "string") {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `${fieldName} must be a boolean`,
        });
    }
    if (value === "true") return true;
    if (value === "false") return false;
    throw new UpstreamError(400 as ContentfulStatusCode, {
        message: `${fieldName} must be true or false`,
    });
}

function parseCreateSpeechRequest(
    value: unknown,
): CreateSpeechRequest & { reference_audio?: File } {
    const parsed = CreateSpeechRequestSchema.extend({
        reference_audio: z.instanceof(File).optional(),
    }).safeParse(value);
    if (parsed.success) return parsed.data;

    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path.join(".") || "body";
    throw new UpstreamError(400 as ContentfulStatusCode, {
        message: `${path}: ${firstIssue?.message || "Invalid request body"}`,
    });
}

async function parseSpeechRequest(c: AudioContext): Promise<
    CreateSpeechRequest & {
        reference_audio?: File;
    }
> {
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
        let formData: FormData;
        try {
            formData = c.get("formData") || (await c.req.formData());
        } catch {
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message: "Invalid multipart form data",
            });
        }

        const input = formData.get("input");
        const referenceAudio =
            (formData.get("reference_audio") as File | null) ||
            (formData.get("file") as File | null) ||
            undefined;
        const rawCompositionPlan = formData.get("composition_plan");
        const rawConditioningRef = formData.get("conditioning_ref");
        const parsed: CreateSpeechRequest & { reference_audio?: File } = {
            model: (formData.get("model") as string | null) || undefined,
            input: typeof input === "string" ? input : "",
            safe: (formData.get("safe") as string | undefined) || undefined,
            voice: (formData.get("voice") as string | null) || "alloy",
            response_format:
                (formData.get("response_format") as
                    | "wav"
                    | "mp3"
                    | "flac"
                    | "opus"
                    | "aac"
                    | "pcm") || "mp3",
            duration: parseOptionalNumber(formData.get("duration"), "duration"),
            // stable-audio-3-medium controls (also used on the audio-to-audio
            // multipart path, which is the only way to send reference_audio).
            seconds: parseOptionalNumber(formData.get("seconds"), "seconds"),
            steps: parseOptionalNumber(formData.get("steps"), "steps"),
            negative_prompt:
                (formData.get("negative_prompt") as string | null) || undefined,
            instrumental: parseOptionalBoolean(
                formData.get("instrumental"),
                "instrumental",
            ),
            store_for_inpainting: parseOptionalBoolean(
                formData.get("store_for_inpainting"),
                "store_for_inpainting",
            ),
            extract_composition_plan: parseOptionalBoolean(
                formData.get("extract_composition_plan"),
                "extract_composition_plan",
            ),
            seed: parseOptionalNumber(formData.get("seed"), "seed"),
            instruct: (formData.get("instruct") as string | null) || undefined,
            loop: parseOptionalBoolean(formData.get("loop"), "loop"),
            prompt_influence: parseOptionalNumber(
                formData.get("prompt_influence"),
                "prompt_influence",
            ),
            conditioning_ref:
                typeof rawConditioningRef === "string"
                    ? parseJsonObject(rawConditioningRef, "conditioning_ref")
                    : undefined,
            composition_plan:
                typeof rawCompositionPlan === "string"
                    ? parseJsonObject(rawCompositionPlan, "composition_plan")
                    : undefined,
            reference_audio: referenceAudio,
        };

        return parseCreateSpeechRequest(parsed);
    }

    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "Invalid JSON body",
        });
    }
    return parseCreateSpeechRequest(body);
}

export async function generateQwenTts(opts: {
    modelName: QwenTtsModelName;
    text: string;
    voice: string;
    instruct?: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { modelName, text, voice, instruct, apiKey, log } = opts;
    const modelId = QWEN_TTS_MODEL_IDS[modelName];

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Qwen TTS is not configured (missing DASHSCOPE_API_KEY)",
        });
    }

    if (instruct && modelName !== "qwen-tts-instruct") {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message:
                "The instruct parameter is only supported by qwen-tts-instruct",
        });
    }

    const qwenVoice = resolveQwenVoice(voice);

    log.info("Qwen TTS request: model={model}, voice={voice}, chars={chars}", {
        model: modelId,
        voice: qwenVoice,
        chars: text.length,
    });

    const body: Record<string, unknown> = {
        model: modelId,
        input: { text, voice: qwenVoice },
        parameters:
            modelName === "qwen-tts-instruct" && instruct ? { instruct } : {},
    };

    const rawResponse = await fetch(QWEN_TTS_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    const response = await ensureUpstreamOk(rawResponse, QWEN_TTS_ENDPOINT);

    const data = (await response.json()) as {
        output?: { audio?: { url?: string } };
        usage?: { characters?: number };
    };
    const audioUrl = data.output?.audio?.url;
    if (!audioUrl) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: "Qwen TTS response missing audio URL",
        });
    }

    const audioResponse = await ensureUpstreamOk(
        await fetch(audioUrl),
        audioUrl,
    );
    const audioBuffer = await audioResponse.arrayBuffer();

    const usageHeaders = {
        ...buildUsageHeaders(
            modelName,
            createAudioTokenUsage(data.usage?.characters ?? text.length),
        ),
        "x-tts-voice": qwenVoice,
    };

    log.info("Qwen TTS success: {bytes} bytes, {chars} chars", {
        bytes: audioBuffer.byteLength,
        chars: data.usage?.characters ?? text.length,
    });

    return new Response(audioBuffer, {
        status: 200,
        headers: { "Content-Type": "audio/wav", ...usageHeaders },
    });
}

export async function generateDeepInfraSpeech(opts: {
    modelName: DeepInfraTtsModelName;
    text: string;
    voice: string;
    responseFormat: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { modelName, text, responseFormat, apiKey, log } = opts;
    const config = DEEPINFRA_TTS_CONFIGS[modelName];
    const inputCharacters = [...text].length;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: `${modelName} speech is not configured (missing DEEPINFRA_API_KEY)`,
        });
    }

    if (inputCharacters > config.maxCharacters) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Input text too long: ${inputCharacters} characters. Maximum is ${config.maxCharacters}.`,
        });
    }

    const voice = opts.voice === "alloy" ? config.defaultVoice : opts.voice;
    if (!(config.voices as readonly string[]).includes(voice)) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Invalid voice for ${modelName}: ${opts.voice}. Supported voices: ${config.voices.join(", ")}.`,
        });
    }

    if (
        !DEEPINFRA_AUDIO_FORMATS.includes(
            responseFormat as (typeof DEEPINFRA_AUDIO_FORMATS)[number],
        )
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for ${modelName}: ${responseFormat}. Supported formats: ${DEEPINFRA_AUDIO_FORMATS.join(", ")}.`,
        });
    }

    log.info(
        "DeepInfra TTS request: model={model}, voice={voice}, format={format}, chars={chars}",
        {
            model: config.modelId,
            voice,
            format: responseFormat,
            chars: inputCharacters,
        },
    );

    const response = await ensureUpstreamOk(
        await fetch(DEEPINFRA_TTS_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: config.modelId,
                input: text,
                voice,
                response_format: responseFormat,
            }),
        }),
        DEEPINFRA_TTS_ENDPOINT,
    );

    const usageHeaders = {
        ...buildUsageHeaders(modelName, createAudioTokenUsage(inputCharacters)),
        "x-tts-voice": voice,
    };

    log.info("DeepInfra TTS success: model={model}, chars={chars}", {
        model: config.modelId,
        chars: inputCharacters,
    });

    return new Response(response.body, {
        status: 200,
        headers: {
            "Content-Type":
                response.headers.get("content-type") || "audio/mpeg",
            ...usageHeaders,
        },
    });
}

/**
 * Dispatches the resolved text-to-audio model and wraps the result in safety
 * headers. Shared by the GET /audio/:text and POST /v1/audio/speech handlers.
 * Callers normalize their inputs first (GET maps seed=-1 -> undefined since
 * only its schema permits the sentinel).
 */
// fal synchronous inference endpoint. Stable Audio 3 Medium generates quickly,
// so the blocking `fal.run` route returns inline without needing the queue/poll
// API.
const STABLE_AUDIO_3_MEDIUM_ENDPOINT =
    "https://fal.run/fal-ai/stable-audio-3/medium/text-to-audio";
// A reference clip switches fal to audio-to-audio (style transfer) — a separate
// endpoint with its own flat fee.
const STABLE_AUDIO_3_MEDIUM_A2A_ENDPOINT =
    "https://fal.run/fal-ai/stable-audio-3/medium/audio-to-audio";

// Stable Audio 3 Large runs on Stability's direct API, which is asynchronous:
// the POST returns 202 + { id } and the rendered audio is retrieved by polling
// /v2beta/results/{id}.
const STABLE_AUDIO_3_LARGE_ENDPOINT =
    "https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio";
// A reference clip switches Large to audio-to-audio (style transfer) — a
// separate endpoint that takes the clip in an `audio` field. Stability bills it
// the same flat 26 credits/$0.26 as text-to-audio.
const STABLE_AUDIO_3_LARGE_A2A_ENDPOINT =
    "https://api.stability.ai/v2beta/audio/stable-audio/audio-to-audio";
const STABILITY_RESULTS_ENDPOINT = "https://api.stability.ai/v2beta/results";

// fal returns the generated file as a URL (or {url}) on a fal.media CDN, not
// inline bytes — we fetch it and stream the bytes back to the caller.
type FalAudioOutput = {
    audio?: string | { url?: string; content_type?: string };
    seed?: number;
};

export async function generateStableAudio3Medium(opts: {
    prompt: string;
    seconds?: number;
    steps?: number;
    seed?: number;
    referenceAudio?: File;
    falKey?: string;
    log: Logger;
}): Promise<Response> {
    const { prompt, seconds, steps, seed, referenceAudio, falKey, log } = opts;

    if (!falKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Stable Audio 3 Medium is not configured (missing FAL_KEY)",
        });
    }

    if (prompt.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Prompt too long: ${prompt.length} characters. Maximum is 10000.`,
        });
    }

    // A reference clip switches fal from text-to-audio to audio-to-audio
    // (style transfer) — a different endpoint, body field, and flat fee.
    const isAudioToAudio = referenceAudio !== undefined;
    const duration = Math.min(380, Math.max(1, seconds ?? 30));
    const input: Record<string, unknown> = {
        prompt,
        duration,
    };
    if (steps !== undefined) input.num_inference_steps = steps;
    if (seed !== undefined) input.seed = seed;
    if (isAudioToAudio) {
        // fal a2a takes the reference clip as a data-URI `audio_url`.
        const mime = referenceAudio.type || "audio/wav";
        input.audio_url = `data:${mime};base64,${arrayBufferToBase64(
            await referenceAudio.arrayBuffer(),
        )}`;
    }

    const endpoint = isAudioToAudio
        ? STABLE_AUDIO_3_MEDIUM_A2A_ENDPOINT
        : STABLE_AUDIO_3_MEDIUM_ENDPOINT;

    log.info(
        "Stable Audio 3 Medium {mode} request: chars={chars}, duration={duration}, steps={steps}",
        {
            mode: isAudioToAudio ? "audio-to-audio" : "text-to-audio",
            chars: prompt.length,
            duration,
            steps: steps ?? "(default)",
        },
    );

    const rawResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
            // fal uses `Authorization: Key <id:secret>`, NOT `Bearer`.
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
    const response = await ensureUpstreamOk(rawResponse, endpoint);
    const result = (await response.json()) as FalAudioOutput;
    const audioUrl =
        typeof result.audio === "string" ? result.audio : result.audio?.url;
    if (!audioUrl) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: "Stable Audio 3 Medium returned no audio URL",
        });
    }

    const fileResponse = await ensureUpstreamOk(
        await fetch(audioUrl),
        audioUrl,
    );
    const audioBuffer = await fileResponse.arrayBuffer();
    // fal SA3 Medium defaults to MP3 output, but its CDN serves the file as
    // application/octet-stream — only trust the header when it's a real audio/*
    // type, otherwise label it audio/mpeg so clients play it correctly.
    const headerContentType = fileResponse.headers.get("content-type");
    const contentType = headerContentType?.startsWith("audio/")
        ? headerContentType
        : "audio/mpeg";

    // Flat per-generation fee: always one output audio unit, plus one input
    // audio unit when a reference clip switches fal to audio-to-audio. The
    // registry prices the base + audio-input surcharge (see its cost block).
    const usageHeaders = buildUsageHeaders("stable-audio-3-medium", {
        completionAudioTokens: 1,
        promptAudioTokens: isAudioToAudio ? 1 : 0,
    });

    log.info("Stable Audio 3 Medium success: {bytes} bytes", {
        bytes: audioBuffer.byteLength,
    });

    return new Response(audioBuffer, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...usageHeaders,
        },
    });
}

export async function generateStableAudio3Large(opts: {
    prompt: string;
    seconds?: number;
    steps?: number;
    seed?: number;
    negativePrompt?: string;
    referenceAudio?: File;
    responseFormat: string;
    apiKey?: string;
    log: Logger;
}): Promise<Response> {
    const {
        prompt,
        seconds = 190,
        steps,
        seed,
        negativePrompt,
        referenceAudio,
        responseFormat,
        apiKey,
        log,
    } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "Stable Audio 3 Large is not configured (missing STABILITY_API_KEY)",
        });
    }

    if (prompt.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Prompt too long: ${prompt.length} characters. Maximum is 10000.`,
        });
    }

    if (!["mp3", "wav"].includes(responseFormat)) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message:
                "stable-audio-3-large supports response_format values: mp3, wav",
        });
    }

    // A reference clip switches Large to audio-to-audio (style transfer): a
    // different endpoint that takes the clip in `audio` (which defines the
    // output length) instead of `duration`. Both modes bill the same flat fee.
    const isAudioToAudio = referenceAudio !== undefined;
    const endpoint = isAudioToAudio
        ? STABLE_AUDIO_3_LARGE_A2A_ENDPOINT
        : STABLE_AUDIO_3_LARGE_ENDPOINT;
    const duration = Math.min(380, Math.max(1, seconds));

    const formData = new FormData();
    formData.append("prompt", prompt);
    // The direct API's only accepted `model` value is "stable-audio-3" (our
    // registry key is stable-audio-3-large).
    formData.append("model", "stable-audio-3");
    formData.append("output_format", responseFormat);
    if (isAudioToAudio) {
        formData.append("audio", referenceAudio);
    } else {
        formData.append("duration", String(duration));
    }
    if (steps !== undefined) formData.append("steps", String(steps));
    if (seed !== undefined) formData.append("seed", String(seed));
    if (negativePrompt) formData.append("negative_prompt", negativePrompt);

    log.info(
        "Stable Audio 3 Large {mode} request: chars={chars}, duration={duration}, steps={steps}, hasNegativePrompt={hasNegativePrompt}",
        {
            mode: isAudioToAudio ? "audio-to-audio" : "text-to-audio",
            chars: prompt.length,
            duration: isAudioToAudio ? "(from reference)" : duration,
            steps: steps ?? "(default)",
            hasNegativePrompt: Boolean(negativePrompt),
        },
    );

    // Submit returns 202 + { id }. Note the two endpoints want different Accept
    // values — submit requires `audio/*`, while the results endpoint rejects
    // `audio/*` and expects `*/*` (binary) or `application/json`.
    const submitResponse = await ensureUpstreamOk(
        await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "audio/*",
            },
            body: formData,
        }),
        endpoint,
    );

    const { id } = (await submitResponse.json()) as { id?: string };
    if (!id) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Stable Audio 3 Large did not return a generation id",
        });
    }

    // Poll until done (202 = still rendering, 200 = audio ready). CF Workers
    // have wall-clock limits; cap at 180s (long-form renders run longer than
    // the ~seconds a short clip takes).
    const resultUrl = `${STABILITY_RESULTS_ENDPOINT}/${id}`;
    const maxPollTime = 180_000;
    const pollInterval = 2_000;
    const startTime = Date.now();
    let consecutiveErrors = 0;

    while (Date.now() - startTime < maxPollTime) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const pollResponse = await fetch(resultUrl, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "*/*",
            },
        });

        if (pollResponse.status === 202) {
            consecutiveErrors = 0;
            continue;
        }

        if (!pollResponse.ok) {
            if (++consecutiveErrors >= 3) {
                const errorText = await pollResponse.text();
                throw new UpstreamError(502 as ContentfulStatusCode, {
                    message:
                        errorText ||
                        `Stable Audio 3 Large polling failed: ${pollResponse.status}`,
                    upstreamStatus: pollResponse.status,
                    responseBody: errorText,
                });
            }
            continue;
        }

        const audioBuffer = await pollResponse.arrayBuffer();
        const usageHeaders = buildUsageHeaders("stable-audio-3-large", {
            completionAudioTokens: 1,
        });

        log.info("Stable Audio 3 Large success: {bytes} bytes", {
            bytes: audioBuffer.byteLength,
        });

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type":
                    pollResponse.headers.get("content-type") ||
                    (responseFormat === "wav" ? "audio/wav" : "audio/mpeg"),
                ...usageHeaders,
            },
        });
    }

    throw new UpstreamError(504 as ContentfulStatusCode, {
        message: "Stable Audio 3 Large generation timed out",
    });
}

async function dispatchAudioGeneration(
    c: AudioContext,
    model: string,
    opts: {
        text: string;
        voice: string;
        responseFormat: string;
        seed?: number;
        duration?: number;
        seconds?: number;
        steps?: number;
        negativePrompt?: string;
        instrumental?: boolean;
        storeForInpainting?: boolean;
        extractCompositionPlan?: boolean;
        conditioningRef?: unknown;
        compositionPlan?: unknown;
        referenceAudio?: File;
        instruct?: string;
        loop?: boolean;
        promptInfluence?: number;
        apiKey: string;
        dashScopeApiKey: string;
        deepInfraApiKey: string;
        falKey?: string;
        stabilityApiKey?: string;
        log: Logger;
    },
): Promise<Response> {
    const {
        text,
        voice,
        responseFormat,
        seed,
        duration,
        seconds,
        steps,
        negativePrompt,
        instrumental,
        storeForInpainting,
        extractCompositionPlan,
        conditioningRef,
        compositionPlan,
        referenceAudio,
        instruct,
        loop,
        promptInfluence,
        apiKey,
        dashScopeApiKey,
        deepInfraApiKey,
        falKey,
        stabilityApiKey,
        log,
    } = opts;

    if (model === "elevenmusic") {
        return withSafetyHeaders(
            c,
            await generateMusic({
                prompt: text,
                durationSeconds: duration,
                forceInstrumental: instrumental,
                seed,
                storeForInpainting,
                extractCompositionPlan,
                conditioningRef,
                compositionPlan,
                referenceAudio,
                apiKey,
                log,
            }),
        );
    }

    if (model === "lyria-3-clip") {
        const googleEnvKeys = [
            "GOOGLE_PRIVATE_KEY",
            "GOOGLE_PRIVATE_KEY_ID",
            "GOOGLE_CLIENT_EMAIL",
        ] as const;
        for (const key of googleEnvKeys) {
            const value = c.env[key];
            if (typeof value === "string") process.env[key] = value;
        }
        const accessToken = await googleCloudAuth.getAccessToken();

        return withSafetyHeaders(
            c,
            await generateLyria3Clip({
                prompt: text,
                durationSeconds: duration,
                responseFormat,
                projectId: c.env.GOOGLE_PROJECT_ID,
                accessToken: accessToken ?? "",
                log,
            }),
        );
    }

    if (model === "stable-audio-3-medium") {
        return withSafetyHeaders(
            c,
            await generateStableAudio3Medium({
                prompt: text,
                seconds: seconds ?? duration,
                steps,
                seed,
                referenceAudio,
                falKey,
                log,
            }),
        );
    }

    if (model === "stable-audio-3-large") {
        return withSafetyHeaders(
            c,
            await generateStableAudio3Large({
                prompt: text,
                seconds: seconds ?? duration,
                steps,
                seed,
                negativePrompt,
                referenceAudio,
                responseFormat,
                apiKey: stabilityApiKey,
                log,
            }),
        );
    }

    if (model === "eleven-sfx") {
        return withSafetyHeaders(
            c,
            await generateSoundEffect({
                prompt: text,
                durationSeconds: duration,
                loop,
                promptInfluence,
                responseFormat,
                apiKey,
                log,
            }),
        );
    }

    switch (model) {
        case "elevenlabs":
        case "elevenflash":
        case "eleven-multilingual-v2":
            return withSafetyHeaders(
                c,
                await generateElevenLabsSpeech({
                    modelName: model,
                    text,
                    voice,
                    responseFormat,
                    seed,
                    apiKey,
                    log,
                }),
            );
        case "qwen-tts":
        case "qwen-tts-instruct":
            return withSafetyHeaders(
                c,
                await generateQwenTts({
                    modelName: model,
                    text,
                    voice,
                    instruct,
                    apiKey: dashScopeApiKey,
                    log,
                }),
            );
        case "csm-1b":
        case "kokoro":
            return withSafetyHeaders(
                c,
                await generateDeepInfraSpeech({
                    modelName: model,
                    text,
                    voice,
                    responseFormat,
                    apiKey: deepInfraApiKey,
                    log,
                }),
            );
        default:
            throw new UpstreamError(500 as ContentfulStatusCode, {
                message: `No audio provider route configured for model: ${model}`,
            });
    }
}

export async function handleSimpleAudio(c: AudioContext): Promise<Response> {
    const log = c.get("log").getChild("generate");

    const rawText = c.req.param("text");
    let text: string;
    try {
        text = decodeURIComponent(rawText);
    } catch {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message:
                "Invalid percent-encoding in URL path. Make sure the text is properly URL-encoded (e.g. with encodeURIComponent), and that any literal '%' characters are written as '%25'.",
        });
    }

    const query = c.req.valid("query" as never) as SimpleAudioQuery;
    text = await applySafety(c, text, query.safe);

    const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
        .ELEVENLABS_API_KEY;

    // Only the GET query schema permits the -1 "random seed" sentinel; map it to
    // undefined here so the generators only ever see a real seed or none.
    return withAudioFallback(c, (candidate) =>
        dispatchAudioGeneration(c, candidate.id, {
            text,
            voice: query.voice,
            responseFormat: query.response_format,
            seed: query.seed === -1 ? undefined : query.seed,
            duration: query.duration,
            seconds: query.seconds,
            steps: query.steps,
            negativePrompt: query.negative_prompt,
            instrumental: query.instrumental,
            instruct: query.instruct,
            loop: query.loop,
            promptInfluence: query.prompt_influence,
            apiKey,
            dashScopeApiKey: c.env.DASHSCOPE_API_KEY,
            deepInfraApiKey: c.env.DEEPINFRA_API_KEY,
            falKey: c.env.FAL_KEY,
            stabilityApiKey: c.env.STABILITY_API_KEY,
            log,
        }),
    );
}

export const audioRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth(), frontendKeyRateLimit, balance)
    .post(
        "/dialogue",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Generate Multi-Speaker Dialogue",
            description:
                "Generate one audio track from ordered text and voice pairs. Supports preset voice names and custom ElevenLabs voice IDs, with up to 10 unique voices and 2,000 total characters.",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: ["inputs"],
                            properties: {
                                model: {
                                    type: "string",
                                    default: "eleven-dialogue",
                                },
                                inputs: {
                                    type: "array",
                                    minItems: 1,
                                    items: {
                                        type: "object",
                                        required: ["text", "voice"],
                                        properties: {
                                            text: { type: "string" },
                                            voice: {
                                                type: "string",
                                                description:
                                                    "Preset voice name or custom ElevenLabs voice ID.",
                                            },
                                        },
                                    },
                                },
                                response_format: {
                                    type: "string",
                                    enum: ["mp3", "opus", "aac", "wav", "pcm"],
                                    default: "mp3",
                                },
                                seed: {
                                    type: "integer",
                                    minimum: 0,
                                    maximum: 4294967295,
                                },
                                safe: { type: "boolean" },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Success - Returns dialogue audio",
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
                        "audio/wav": {
                            schema: { type: "string", format: "binary" },
                        },
                        "audio/pcm": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", {
            defaultModel: "eleven-dialogue",
            supportedEndpoint: "/v1/audio/dialogue",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("dialogue");
            await requireGenerationAccess(c.var, c.env);

            let request: z.infer<typeof CreateDialogueRequestSchema>;
            try {
                request = CreateDialogueRequestSchema.parse(await c.req.json());
            } catch (error) {
                if (error instanceof z.ZodError) {
                    throw new UpstreamError(400 as ContentfulStatusCode, {
                        message:
                            error.issues[0]?.message || "Invalid request body",
                    });
                }
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Invalid JSON body",
                });
            }

            const safeTexts = await applySafetyToTexts(
                c,
                request.inputs.map((input) => input.text),
                request.safe,
            );
            const inputs = request.inputs.map((input, index) => ({
                ...input,
                text: safeTexts[index],
            }));
            const response = await generateElevenLabsDialogue({
                inputs,
                responseFormat: request.response_format,
                seed: request.seed,
                apiKey: c.env.ELEVENLABS_API_KEY,
                log,
            });
            return withSafetyHeaders(c, response);
        },
    )
    .post(
        "/voice-changer",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Transform a Voice",
            description:
                "Transform the speaker identity in an audio file while preserving its words, timing, emotion, and delivery. Accepts preset voice names or custom ElevenLabs voice IDs.",
            requestBody: {
                required: true,
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            required: ["audio"],
                            properties: {
                                model: {
                                    type: "string",
                                    default: "eleven-voice-changer",
                                },
                                audio: {
                                    type: "string",
                                    format: "binary",
                                    description:
                                        "Source audio, up to 50 MB. ElevenLabs supports clips up to five minutes.",
                                },
                                voice: {
                                    type: "string",
                                    default: "alloy",
                                    description:
                                        "Target preset voice name or custom ElevenLabs voice ID.",
                                },
                                response_format: {
                                    type: "string",
                                    enum: ["mp3", "opus", "aac", "wav", "pcm"],
                                    default: "mp3",
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Success - Returns transformed speech",
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
                        "audio/wav": {
                            schema: { type: "string", format: "binary" },
                        },
                        "audio/pcm": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", {
            defaultModel: "eleven-voice-changer",
            supportedEndpoint: "/v1/audio/voice-changer",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("voice-changer");
            await requireGenerationAccess(c.var, c.env);

            let formData: FormData;
            try {
                formData = c.get("formData") || (await c.req.formData());
            } catch {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Invalid multipart form data",
                });
            }

            const audio = formData.get("audio");
            if (!(audio instanceof File)) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Missing required audio file.",
                });
            }
            const voice = formData.get("voice");
            const responseFormat = formData.get("response_format");
            const resolvedFormat =
                typeof responseFormat === "string" && responseFormat !== ""
                    ? responseFormat
                    : "mp3";
            if (
                !["mp3", "opus", "aac", "wav", "pcm"].includes(resolvedFormat)
            ) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message:
                        "response_format must be mp3, opus, aac, wav, or pcm.",
                });
            }

            return changeVoiceWithElevenLabs({
                audio,
                voice:
                    typeof voice === "string" && voice !== "" ? voice : "alloy",
                responseFormat: resolvedFormat,
                apiKey: c.env.ELEVENLABS_API_KEY,
                log,
            });
        },
    )
    .post(
        "/voice-isolator",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Isolate Speech",
            description:
                "Remove music, ambient sound, and other background noise from an audio or video file while preserving spoken audio.",
            requestBody: {
                required: true,
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            required: ["audio"],
                            properties: {
                                model: {
                                    type: "string",
                                    default: "eleven-voice-isolator",
                                },
                                audio: {
                                    type: "string",
                                    format: "binary",
                                    description:
                                        "Source audio or video, up to 50 MB and at least 4.6 seconds long.",
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description:
                        "Success - Returns isolated speech as MP3 audio",
                    content: {
                        "audio/mpeg": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", {
            defaultModel: "eleven-voice-isolator",
            supportedEndpoint: "/v1/audio/voice-isolator",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("voice-isolator");
            await requireGenerationAccess(c.var, c.env);

            let formData: FormData;
            try {
                formData = c.get("formData") || (await c.req.formData());
            } catch {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Invalid multipart form data",
                });
            }

            const audio = formData.get("audio");
            if (!(audio instanceof File)) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Missing required audio file.",
                });
            }

            return isolateVoiceWithElevenLabs({
                audio,
                apiKey: c.env.ELEVENLABS_API_KEY,
                log,
            });
        },
    )
    .post(
        "/music/upload",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Upload Music Reference",
            description:
                "Upload an audio file to ElevenLabs Music and receive a `song_id` for reference conditioning or inpainting. Set `extract_composition_plan=true` to return a music_v2 composition plan derived from the track.",
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
                                    description: "Music file to upload.",
                                },
                                extract_composition_plan: {
                                    type: "boolean",
                                    default: false,
                                    description:
                                        "Return a music_v2 composition plan extracted from the uploaded track.",
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description:
                        "Success - Returns ElevenLabs song_id and optional composition_plan",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    song_id: { type: "string" },
                                    composition_plan: { type: "object" },
                                },
                            },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", { defaultModel: "elevenmusic" }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("music-upload");
            await requireGenerationAccess(c.var, c.env);

            if (c.var.model.resolved !== "elevenmusic") {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Music upload only supports model=elevenmusic",
                });
            }

            let formData: FormData;
            try {
                formData = c.get("formData") || (await c.req.formData());
            } catch {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Invalid multipart form data",
                });
            }

            const file = formData.get("file") as File | null;
            if (!file) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Missing required field: file",
                });
            }

            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;
            const upload = await uploadMusicReference({
                file,
                extractCompositionPlan:
                    parseOptionalBoolean(
                        formData.get("extract_composition_plan"),
                        "extract_composition_plan",
                    ) || false,
                apiKey,
                log,
            });
            const usageHeaders = buildUsageHeaders(
                "elevenmusic",
                createCompletionAudioSecondsUsage(file.size / 16000),
            );

            return Response.json(upload, {
                headers: {
                    ...usageHeaders,
                    ...(upload.song_id
                        ? { "x-elevenlabs-song-id": upload.song_id }
                        : {}),
                },
            });
        },
    )
    .post(
        "/speech",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Text to Speech (OpenAI-compatible)",
            description: [
                "Generate speech or music from text. Compatible with the OpenAI TTS API for JSON requests.",
                "",
                "Set `model` to `elevenmusic`, `lyria-3-clip`, `stable-audio-3-medium`, or `stable-audio-3-large` to generate music. Lyria returns one fixed 30-second MP3 clip. Send multipart/form-data with `reference_audio` plus `input` to run audio-to-audio (style transfer) on `stable-audio-3-medium` or `stable-audio-3-large`, or reference-audio conditioning on `elevenmusic`; for ElevenLabs inpainting, pass a `composition_plan`.",
                "",
                `**Available voices:** ${AUDIO_VOICES.join(", ")}`,
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
                        "audio/pcm": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", {
            supportedEndpoint: "/v1/audio/speech",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("tts");
            await requireGenerationAccess(c.var, c.env);

            const {
                input,
                safe,
                voice,
                response_format,
                duration,
                seconds,
                steps,
                negative_prompt,
                instrumental,
                store_for_inpainting,
                extract_composition_plan,
                conditioning_ref,
                composition_plan,
                reference_audio,
                seed,
                instruct,
                loop,
                prompt_influence,
            } = await parseSpeechRequest(c);
            requireElevenMusicOptions(c.var.model.resolved, {
                referenceAudio: reference_audio,
                compositionPlan: composition_plan,
                conditioningRef: conditioning_ref,
                storeForInpainting: store_for_inpainting,
                extractCompositionPlan: extract_composition_plan,
            });
            const safeInput = await applySafety(c, input, safe);

            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;

            // POST schema forbids seed=-1 (.min(0)), so no sentinel mapping here.
            return withAudioFallback(c, (candidate) =>
                dispatchAudioGeneration(c, candidate.id, {
                    text: safeInput,
                    voice,
                    responseFormat: response_format,
                    seed,
                    duration,
                    seconds,
                    steps,
                    negativePrompt: negative_prompt,
                    instrumental,
                    storeForInpainting: store_for_inpainting,
                    extractCompositionPlan: extract_composition_plan,
                    conditioningRef: conditioning_ref,
                    compositionPlan: composition_plan,
                    referenceAudio: reference_audio,
                    instruct,
                    loop,
                    promptInfluence: prompt_influence,
                    apiKey,
                    dashScopeApiKey: c.env.DASHSCOPE_API_KEY,
                    deepInfraApiKey: c.env.DEEPINFRA_API_KEY,
                    falKey: c.env.FAL_KEY,
                    stabilityApiKey: c.env.STABILITY_API_KEY,
                    log,
                }),
            );
        },
    )
    .post(
        "/speech/with-timestamps",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Generate Speech with Timestamps",
            description:
                "Generate base64-encoded speech with character-level timing for the original and normalized text. Supports the elevenlabs, elevenflash, and eleven-multilingual-v2 models.",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: ["input"],
                            properties: {
                                model: {
                                    type: "string",
                                    default: "elevenlabs",
                                    enum: [
                                        "elevenlabs",
                                        "elevenflash",
                                        "eleven-multilingual-v2",
                                    ],
                                },
                                input: {
                                    type: "string",
                                    maxLength: 10000,
                                    description:
                                        "Text to synthesize and align.",
                                },
                                voice: {
                                    type: "string",
                                    default: "alloy",
                                    description:
                                        "Preset voice name or custom ElevenLabs voice ID.",
                                },
                                response_format: {
                                    type: "string",
                                    enum: ["mp3", "opus", "aac", "wav", "pcm"],
                                    default: "mp3",
                                    description:
                                        "Encoding used for audio_base64.",
                                },
                                seed: {
                                    type: "integer",
                                    minimum: 0,
                                    maximum: 4294967295,
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description:
                        "Success - Returns base64 audio and character timings",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: [
                                    "audio_base64",
                                    "alignment",
                                    "normalized_alignment",
                                ],
                                properties: {
                                    audio_base64: { type: "string" },
                                    alignment: {
                                        type: "object",
                                        properties: {
                                            characters: {
                                                type: "array",
                                                items: { type: "string" },
                                            },
                                            character_start_times_seconds: {
                                                type: "array",
                                                items: { type: "number" },
                                            },
                                            character_end_times_seconds: {
                                                type: "array",
                                                items: { type: "number" },
                                            },
                                        },
                                    },
                                    normalized_alignment: {
                                        type: "object",
                                        properties: {
                                            characters: {
                                                type: "array",
                                                items: { type: "string" },
                                            },
                                            character_start_times_seconds: {
                                                type: "array",
                                                items: { type: "number" },
                                            },
                                            character_end_times_seconds: {
                                                type: "array",
                                                items: { type: "number" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", {
            defaultModel: "elevenlabs",
            supportedEndpoint: "/v1/audio/speech/with-timestamps",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("tts-timestamps");
            await requireGenerationAccess(c.var, c.env);

            const { input, safe, voice, response_format, seed } =
                await parseSpeechRequest(c);
            const modelName = c.var.model.resolved;
            if (!(modelName in ELEVENLABS_TTS_MODEL_IDS)) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message:
                        "Timestamped speech supports elevenlabs, elevenflash, and eleven-multilingual-v2.",
                });
            }
            if (response_format === "flac") {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message:
                        "Timestamped speech supports mp3, opus, aac, wav, and pcm output.",
                });
            }
            const safeInput = await applySafety(c, input, safe);

            return withAudioFallback(c, (candidate) =>
                generateElevenLabsSpeechWithTimestamps({
                    modelName: candidate.id as ElevenLabsTtsModelName,
                    text: safeInput,
                    voice,
                    responseFormat: response_format,
                    seed,
                    apiKey: c.env.ELEVENLABS_API_KEY,
                    log,
                }),
            );
        },
    )
    .post(
        "/transcriptions",
        describeRoute({
            tags: ["🔊 Audio"],
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
                "- `universal-2` — AssemblyAI Universal-2 (99 languages)",
                "- `universal-3.5-pro` — AssemblyAI Universal-3.5 Pro (18 languages, code switching, prompting)",
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
                                        "The model to use. Options: `whisper-large-v3`, `whisper-1`, `scribe`, `universal-2`, `universal-3.5-pro`.",
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
                                        "diarized_json",
                                    ],
                                    default: "json",
                                    description:
                                        "The format of the transcript output. Use `diarized_json` for OpenAI-compatible speaker segments on diarization-capable models.",
                                },
                                temperature: {
                                    type: "number",
                                    description:
                                        "Sampling temperature between 0 and 1. Lower is more deterministic.",
                                },
                                speakers_expected: {
                                    type: "integer",
                                    minimum: 1,
                                    description:
                                        "Optional provider hint for the number of speakers. Only honored with `response_format=diarized_json`.",
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
                                    segments: {
                                        type: "array",
                                        description:
                                            "OpenAI-compatible diarized segments. Present when `response_format=diarized_json`.",
                                        items: {
                                            type: "object",
                                            properties: {
                                                type: {
                                                    type: "string",
                                                    enum: [
                                                        "transcript.text.segment",
                                                    ],
                                                },
                                                id: { type: "string" },
                                                speaker: { type: "string" },
                                                text: { type: "string" },
                                                start: { type: "number" },
                                                end: { type: "number" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 500),
            },
        }),
        resolveModel("generate.audio", {
            defaultModel: "whisper-large-v3",
            supportedEndpoint: "/v1/audio/transcriptions",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("transcription");
            await requireGenerationAccess(c.var, c.env);

            // Get formData from middleware or parse it
            let formData: FormData;
            try {
                formData = c.get("formData") || (await c.req.formData());
            } catch (error) {
                log.warn("Invalid multipart form data: {message}", {
                    message:
                        error instanceof Error ? error.message : String(error),
                });
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Invalid multipart form data",
                });
            }

            const file = formData.get("file") as File;
            const language = formData.get("language") as string | null;
            const prompt = formData.get("prompt") as string | null;
            const responseFormat = formData.get("response_format") as
                | string
                | null;
            const temperatureRaw = formData.get("temperature") as string | null;
            const temperature =
                temperatureRaw !== null && temperatureRaw !== ""
                    ? Number(temperatureRaw)
                    : undefined;
            const speakersExpected = parsePositiveInt(
                formData.get("speakers_expected"),
                "speakers_expected",
            );
            const wantsDiarizedJson = responseFormat === "diarized_json";

            if (!file) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message: "Missing required field: file",
                });
            }

            if (speakersExpected !== undefined && !wantsDiarizedJson) {
                throw new UpstreamError(400 as ContentfulStatusCode, {
                    message:
                        "speakers_expected requires response_format=diarized_json",
                });
            }

            const result = await withAudioFallback(c, async (candidate) => {
                if (candidate.id === "scribe") {
                    return transcribeWithElevenLabs({
                        file,
                        language: language || undefined,
                        responseFormat: responseFormat || undefined,
                        apiKey: c.env.ELEVENLABS_API_KEY,
                        log,
                        numSpeakers: speakersExpected,
                    });
                }

                if (
                    candidate.id === "universal-2" ||
                    candidate.id === "universal-3.5-pro"
                ) {
                    return transcribeWithAssemblyAi({
                        file,
                        language: language || undefined,
                        prompt: prompt || undefined,
                        responseFormat: responseFormat || undefined,
                        temperature,
                        model: candidate.id,
                        apiKey: (
                            c.env as unknown as {
                                ASSEMBLYAI_API_KEY: string;
                            }
                        ).ASSEMBLYAI_API_KEY,
                        log,
                        speakersExpected,
                    });
                }

                const ovhApiKey = c.env.OVHCLOUD_API_KEY;
                if (!ovhApiKey) {
                    throw new UpstreamError(500 as ContentfulStatusCode, {
                        message:
                            "Transcription service is not configured (missing API key)",
                    });
                }
                validateWhisperResponseFormat(responseFormat);

                // Rebuild the consumed multipart body for each upstream attempt.
                const whisperFormData = new FormData();
                const filename =
                    file.name && file.name !== "blob" ? file.name : "audio.mp3";
                whisperFormData.append("file", file, filename);
                if (language) whisperFormData.append("language", language);
                whisperFormData.append("response_format", "verbose_json");
                whisperFormData.append("model", "whisper-large-v3");
                whisperFormData.append("timestamp_granularities[]", "word");

                const whisperUrl =
                    "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/audio/transcriptions";
                const response = await ensureUpstreamOk(
                    await fetch(whisperUrl, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${ovhApiKey}` },
                        body: whisperFormData,
                    }),
                    whisperUrl,
                );

                let whisper: WhisperVerboseJson;
                try {
                    whisper = JSON.parse(await response.text());
                } catch {
                    throw new UpstreamError(502 as ContentfulStatusCode, {
                        message:
                            "Whisper returned an unexpected (non-JSON) response",
                    });
                }
                const usageHeaders = buildUsageHeaders(
                    candidate.id,
                    createAudioSecondsUsage(extractWhisperUsage(whisper, log)),
                );
                return formatWhisperResponse(
                    whisper,
                    responseFormat,
                    usageHeaders,
                );
            });
            c.var.track.overrideResponseTracking(result.clone());
            return result;
        },
    );

export function parsePositiveInt(
    value: FormDataEntryValue | null,
    field: string,
): number | undefined {
    if (value === null) return undefined;
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `${field} must be a positive integer`,
        });
    }
    return n;
}

interface WhisperSegment {
    start: number;
    end: number;
    text: string;
}

interface WhisperVerboseJson {
    text: string;
    usage?: { seconds?: number };
    segments?: WhisperSegment[];
}

const WHISPER_RESPONSE_FORMATS = [
    "json",
    "text",
    "verbose_json",
    "srt",
    "vtt",
] as const;

type WhisperResponseFormat = (typeof WHISPER_RESPONSE_FORMATS)[number];

function validateWhisperResponseFormat(responseFormat: string | null): void {
    if (
        responseFormat &&
        !WHISPER_RESPONSE_FORMATS.includes(
            responseFormat as WhisperResponseFormat,
        )
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for whisper model: ${responseFormat}. Supported: ${WHISPER_RESPONSE_FORMATS.join(", ")}`,
        });
    }
}

function extractWhisperUsage(json: WhisperVerboseJson, log: Logger): number {
    const seconds = json.usage?.seconds;
    if (typeof seconds !== "number" || seconds <= 0) {
        throw new Error(
            `Whisper response missing usage.seconds: ${JSON.stringify(json.usage)}`,
        );
    }
    log.debug("Whisper usage: {seconds}s", { seconds });
    return seconds;
}

/** Format SRT/VTT timestamps from seconds. SRT uses a comma, VTT a dot. */
function formatTimestamp(seconds: number, sep: "," | "."): string {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
    const msPart = String(ms % 1000).padStart(3, "0");
    return `${h}:${m}:${s}${sep}${msPart}`;
}

function toSubtitles(segments: WhisperSegment[], kind: "srt" | "vtt"): string {
    const sep = kind === "srt" ? "," : ".";
    const cues = segments.map((seg, i) => {
        const time = `${formatTimestamp(seg.start, sep)} --> ${formatTimestamp(seg.end, sep)}`;
        const head = kind === "srt" ? `${i + 1}\n` : "";
        return `${head}${time}\n${seg.text.trim()}`;
    });
    return kind === "vtt"
        ? `WEBVTT\n\n${cues.join("\n\n")}\n`
        : `${cues.join("\n\n")}\n`;
}

/**
 * Reformat OVH's verbose_json into the caller's requested response_format.
 * Mirrors the ElevenLabs scribe path so behaviour is consistent across backends.
 */
export function formatWhisperResponse(
    json: WhisperVerboseJson,
    responseFormat: string | null,
    usageHeaders: Record<string, string>,
): Response {
    validateWhisperResponseFormat(responseFormat);

    if (responseFormat === "text") {
        return new Response(json.text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "srt" || responseFormat === "vtt") {
        return new Response(toSubtitles(json.segments ?? [], responseFormat), {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "verbose_json") {
        const { usage: _usage, ...rest } = json;
        return Response.json(rest, { headers: usageHeaders });
    }

    // Default: json
    return Response.json({ text: json.text }, { headers: usageHeaders });
}
