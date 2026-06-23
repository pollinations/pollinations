import type { Logger } from "@logtape/logtape";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    AUDIO_SERVICES,
    type AudioModelName,
    ELEVENLABS_VOICES,
    resolveElevenLabsVoiceId,
} from "@shared/registry/audio.ts";
import {
    getModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
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
import { applySafety, withSafetyHeaders } from "@/middleware/safety.ts";
import { track } from "@/middleware/track.ts";
import { arrayBufferToBase64 } from "@/util.ts";
import { requireGenerationAccess } from "@/utils/generation-access.ts";
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
                description: `The voice to use. Can be any preset name (${ELEVENLABS_VOICES.join(", ")}) OR a custom ElevenLabs voice ID (UUID from your dashboard).`,
                example: "rachel",
            }),
        response_format: z
            .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
            .default("mp3")
            .meta({
                description:
                    "The audio format for the output. Qwen TTS currently returns WAV regardless of this setting; eleven-sfx supports mp3 only (other values are rejected).",
                example: "mp3",
            }),
        duration: z.number().min(0.5).max(300).optional().meta({
            description:
                "Output duration in seconds (elevenmusic/acestep 3-300; eleven-sfx 0.5-30)",
            example: 30,
        }),
        seconds: z.number().min(1).max(380).optional().meta({
            description:
                "Audio duration in seconds for stable-audio-3-medium, 1-380.",
            example: 30,
        }),
        steps: z.number().int().min(1).max(100).optional().meta({
            description: "Sampling steps for stable-audio-3-medium, 1-100.",
            example: 8,
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
        style: z.string().optional().meta({
            description:
                "Style/genre tags for music generation (acestep only). If omitted, style is auto-detected from the input text.",
            example: "brazilian berimbau instrumental",
        }),
        instruct: z.string().optional().meta({
            description:
                "Emotion/style instruction (qwen-tts-instruct only). e.g. 'excited and cheerful'.",
            example: "speak softly and warmly",
        }),
    })
    .meta({ $id: "CreateSpeechRequest" });

type CreateSpeechRequest = z.infer<typeof CreateSpeechRequestSchema>;
type AudioContext = Context<Env>;
type SimpleAudioQuery = {
    safe?: SafeValue;
    duration?: number;
    seconds?: number;
    steps?: number;
    style?: string;
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

export async function generateSpeech(opts: {
    modelName?: AudioModelName;
    text: string;
    voice: string;
    responseFormat: string;
    seed?: number;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { modelName, text, voice, responseFormat, apiKey, log } = opts;
    const resolvedModelName: AudioModelName = modelName ?? "elevenlabs";
    const elevenLabsModelId = getModelDefinition(resolvedModelName).modelId;

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

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const elevenLabsBody: Record<string, unknown> = {
        text,
        model_id: elevenLabsModelId,
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
        },
    };
    if (opts.seed !== undefined) {
        elevenLabsBody.seed = opts.seed;
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

    const usageHeaders = {
        ...buildUsageHeaders(
            resolvedModelName,
            createAudioTokenUsage(text.length),
        ),
        "x-tts-voice": voice,
    };

    log.info("TTS success: {chars} characters", { chars: text.length });

    // WAV needs its RIFF header repaired (ElevenLabs ships a placeholder length),
    // which requires buffering the body. Audio is small (input capped at 10000
    // chars) so this is cheap; all other formats keep streaming.
    if (responseFormat === "wav") {
        const audioBuffer = fixWavHeader(await response.arrayBuffer());
        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(audioBuffer.byteLength),
                ...usageHeaders,
            },
        });
    }

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

    const modelId = AUDIO_SERVICES.elevenmusic.modelId;
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

    const modelId = AUDIO_SERVICES["eleven-sfx"].modelId;
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

const QWEN_TTS_MODELS = [
    "qwen-tts",
    "qwen-tts-instruct",
] as const satisfies readonly AudioModelName[];

type QwenTtsModelName = (typeof QWEN_TTS_MODELS)[number];

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

export function isQwenTtsModel(model: string): model is QwenTtsModelName {
    return QWEN_TTS_MODELS.includes(model as QwenTtsModelName);
}

function requireTextToAudioModel(model: ModelName): void {
    const definition = getModelDefinition(model);
    const acceptsText = definition.inputModalities?.includes("text");
    const returnsAudio = definition.outputModalities?.includes("audio");

    if (acceptsText && returnsAudio) return;

    throw new UpstreamError(400 as ContentfulStatusCode, {
        message: `Model '${model}' is not supported on text-to-audio endpoints. Use /v1/audio/transcriptions for speech-to-text models.`,
    });
}

function requireElevenMusicOptions(
    model: ModelName,
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

    // stable-audio-3-medium accepts reference_audio (fal audio-to-audio) but
    // not the ElevenLabs composition/conditioning options.
    if (model === "stable-audio-3-medium") {
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
            "reference_audio, conditioning_ref, composition_plan, store_for_inpainting, and extract_composition_plan are only supported with model=elevenmusic (stable-audio-3-medium also accepts reference_audio).",
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
            style: (formData.get("style") as string | null) || undefined,
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

    const model = getModelDefinition(modelName).modelId;
    const qwenVoice = resolveQwenVoice(voice);

    log.info("Qwen TTS request: model={model}, voice={voice}, chars={chars}", {
        model,
        voice: qwenVoice,
        chars: text.length,
    });

    const body: Record<string, unknown> = {
        model,
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

export async function generateAceStepMusic(opts: {
    prompt: string;
    style?: string;
    durationSeconds?: number;
    serviceUrl: string;
    serviceToken: string;
    log: Logger;
}): Promise<Response> {
    const { prompt, style, serviceUrl, serviceToken, log } = opts;
    const duration = opts.durationSeconds ?? 15;

    if (prompt.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Prompt too long: ${prompt.length} characters. Maximum is 10000.`,
        });
    }

    log.info(
        "ACE-Step request: chars={chars}, duration={duration}, style={style}",
        { chars: prompt.length, duration, style: style ?? "(auto)" },
    );

    const authHeaders = { Authorization: `Bearer ${serviceToken}` };

    const submitUrl = `${serviceUrl}/release_task`;
    const rawSubmitResponse = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
            prompt: style ?? "",
            lyrics: prompt,
            audio_duration: duration,
            batch_size: 1,
            thinking: true,
            audio_format: "mp3",
        }),
    });
    const submitResponse = await ensureUpstreamOk(rawSubmitResponse, submitUrl);

    const submitData = (await submitResponse.json()) as {
        data?: { task_id?: string };
    };
    const taskId = submitData?.data?.task_id;
    if (!taskId) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "ACE-Step did not return a task_id",
        });
    }

    // Poll until done (status 1=success, 2=failed)
    // CF Workers have wall-clock limits; cap at 120s (typical gen is 8-12s)
    const maxPollTime = 120_000;
    const pollInterval = 2_000;
    const startTime = Date.now();
    let audioPath: string | undefined;
    let consecutiveErrors = 0;

    while (Date.now() - startTime < maxPollTime) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const pollResponse = await fetch(`${serviceUrl}/query_result`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ task_id_list: [taskId] }),
        });

        if (!pollResponse.ok) {
            if (++consecutiveErrors >= 3) {
                const errorText = await pollResponse.text();
                throw new UpstreamError(502 as ContentfulStatusCode, {
                    message:
                        errorText ||
                        `ACE-Step polling failed: ${pollResponse.status}`,
                    upstreamStatus: pollResponse.status,
                    responseBody: errorText,
                });
            }
            continue;
        }
        consecutiveErrors = 0;

        const pollData = (await pollResponse.json()) as {
            data?: Array<{ task_id: string; status: number; result?: string }>;
        };
        const task = pollData?.data?.[0];
        if (!task) continue;

        if (task.status === 2) {
            throw new UpstreamError(500 as ContentfulStatusCode, {
                message: "ACE-Step generation failed",
            });
        }

        if (task.status === 1 && task.result) {
            const results = JSON.parse(task.result) as Array<{
                file?: string;
            }>;
            if (results?.[0]?.file) {
                audioPath = results[0].file;
                break;
            }
        }
    }

    if (!audioPath) {
        throw new UpstreamError(504 as ContentfulStatusCode, {
            message: "ACE-Step generation timed out",
        });
    }

    const audioUrl = `${serviceUrl}${audioPath}`;
    const audioResponse = await ensureUpstreamOk(
        await fetch(audioUrl, { headers: authHeaders }),
        audioUrl,
    );
    const audioBuffer = await audioResponse.arrayBuffer();

    // Use requested duration for billing (more accurate than byte-size heuristic)
    const usageHeaders = buildUsageHeaders(
        "acestep",
        createCompletionAudioSecondsUsage(duration),
    );

    log.info("ACE-Step success: {bytes} bytes, {duration}s", {
        bytes: audioBuffer.byteLength,
        duration,
    });

    return new Response(audioBuffer, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
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

// Flat per-generation fees encoded at $0.0001/unit (see registry cost block) so
// each path bills fal's exact rate: text-to-audio $0.0376, audio-to-audio $0.0417.
const SA3M_TEXT_TO_AUDIO_UNITS = 376;
const SA3M_AUDIO_TO_AUDIO_UNITS = 417;

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

    // Flat per-generation fee; the unit count encodes fal's exact price for the
    // chosen endpoint (see registry cost block, billed at $0.0001/unit).
    const usageHeaders = buildUsageHeaders("stable-audio-3-medium", {
        completionAudioTokens: isAudioToAudio
            ? SA3M_AUDIO_TO_AUDIO_UNITS
            : SA3M_TEXT_TO_AUDIO_UNITS,
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

async function dispatchAudioGeneration(
    c: AudioContext,
    opts: {
        text: string;
        voice: string;
        responseFormat: string;
        seed?: number;
        duration?: number;
        seconds?: number;
        steps?: number;
        style?: string;
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
        falKey?: string;
        env: Env["Bindings"];
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
        style,
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
        falKey,
        env,
        log,
    } = opts;

    if (c.var.model.resolved === "acestep") {
        return withSafetyHeaders(
            c,
            await generateAceStepMusic({
                prompt: text,
                style,
                durationSeconds: duration,
                serviceUrl: env.MUSIC_SERVICE_URL,
                serviceToken: env.PLN_GPU_TOKEN,
                log,
            }),
        );
    }

    if (c.var.model.resolved === "elevenmusic") {
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

    if (c.var.model.resolved === "stable-audio-3-medium") {
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

    if (c.var.model.resolved === "eleven-sfx") {
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

    if (isQwenTtsModel(c.var.model.resolved)) {
        return withSafetyHeaders(
            c,
            await generateQwenTts({
                modelName: c.var.model.resolved,
                text,
                voice,
                instruct,
                apiKey: dashScopeApiKey,
                log,
            }),
        );
    }

    return withSafetyHeaders(
        c,
        await generateSpeech({
            modelName: c.var.model.resolved as AudioModelName,
            text,
            voice,
            responseFormat,
            seed,
            apiKey,
            log,
        }),
    );
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
    requireTextToAudioModel(c.var.model.resolved);
    text = await applySafety(c, text, query.safe);

    const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
        .ELEVENLABS_API_KEY;

    // Only the GET query schema permits the -1 "random seed" sentinel; map it to
    // undefined here so the generators only ever see a real seed or none.
    return dispatchAudioGeneration(c, {
        text,
        voice: query.voice,
        responseFormat: query.response_format,
        seed: query.seed === -1 ? undefined : query.seed,
        duration: query.duration,
        seconds: query.seconds,
        steps: query.steps,
        style: query.style,
        instrumental: query.instrumental,
        instruct: query.instruct,
        loop: query.loop,
        promptInfluence: query.prompt_influence,
        apiKey,
        dashScopeApiKey: c.env.DASHSCOPE_API_KEY,
        falKey: c.env.FAL_KEY,
        env: c.env,
        log,
    });
}

export const audioRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth(), frontendKeyRateLimit, balance)
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
                "Set `model` to `elevenmusic`, `acestep`, or `stable-audio-3-medium` to generate music. Send multipart/form-data with `reference_audio` plus `input` to run fal audio-to-audio (style transfer) on `stable-audio-3-medium`, or reference-audio conditioning on `elevenmusic`; for ElevenLabs inpainting, pass a `composition_plan`.",
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
        resolveModel("generate.audio"),
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
                instrumental,
                store_for_inpainting,
                extract_composition_plan,
                conditioning_ref,
                composition_plan,
                reference_audio,
                seed,
                style,
                instruct,
                loop,
                prompt_influence,
            } = await parseSpeechRequest(c);
            requireTextToAudioModel(c.var.model.resolved);
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
            return dispatchAudioGeneration(c, {
                text: safeInput,
                voice,
                responseFormat: response_format,
                seed,
                duration,
                seconds,
                steps,
                style,
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
                falKey: c.env.FAL_KEY,
                env: c.env,
                log,
            });
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
                "- `universal-3-pro` — AssemblyAI Universal-3 Pro (highest accuracy, prompting)",
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
                                        "The model to use. Options: `whisper-large-v3`, `whisper-1`, `scribe`, `universal-2`, `universal-3-pro`.",
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
                    numSpeakers: speakersExpected,
                });

                // Override tracking with final response
                c.var.track.overrideResponseTracking(response.clone());
                return response;
            }

            if (
                c.var.model.resolved === "universal-2" ||
                c.var.model.resolved === "universal-3-pro"
            ) {
                const assemblyAiApiKey = (
                    c.env as unknown as { ASSEMBLYAI_API_KEY: string }
                ).ASSEMBLYAI_API_KEY;
                const response = await transcribeWithAssemblyAi({
                    file,
                    language: language || undefined,
                    prompt: prompt || undefined,
                    responseFormat: responseFormat || undefined,
                    temperature,
                    model: c.var.model.resolved,
                    apiKey: assemblyAiApiKey,
                    log,
                    speakersExpected,
                });

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
            validateWhisperResponseFormat(responseFormat);

            // Re-build formData for Whisper (Hono consumed the original body stream).
            // Preserve filename — OVH needs the extension to detect format/duration.
            const whisperFormData = new FormData();
            const filename =
                file.name && file.name !== "blob" ? file.name : "audio.mp3";
            whisperFormData.append("file", file, filename);
            if (language) whisperFormData.append("language", language);
            // Always request verbose_json from OVH so usage.seconds (billing) and
            // segments (srt/vtt) are present; reformat locally to the caller's
            // requested response_format below. Forwarding e.g. `text` upstream
            // would return a plain-text body and lose the usage object.
            whisperFormData.append("response_format", "verbose_json");
            whisperFormData.append("model", "whisper-large-v3");
            whisperFormData.append("timestamp_granularities[]", "word");

            // Thin proxy to OVHcloud Whisper
            const whisperUrl =
                "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/audio/transcriptions";
            const rawResponse = await fetch(whisperUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${ovhApiKey}`,
                },
                body: whisperFormData,
            });
            const response = await ensureUpstreamOk(rawResponse, whisperUrl);

            // OVH always returns verbose_json now; parse once, bill from it, then
            // reformat to the caller's requested format.
            const responseBody = await response.text();
            let whisper: WhisperVerboseJson;
            try {
                whisper = JSON.parse(responseBody);
            } catch {
                throw new UpstreamError(502 as ContentfulStatusCode, {
                    message:
                        "Whisper returned an unexpected (non-JSON) response",
                });
            }
            const duration = extractWhisperUsage(whisper, log);
            const usageHeaders = buildUsageHeaders(
                c.var.model.resolved,
                createAudioSecondsUsage(duration),
            );

            const result = formatWhisperResponse(
                whisper,
                responseFormat,
                usageHeaders,
            );
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
