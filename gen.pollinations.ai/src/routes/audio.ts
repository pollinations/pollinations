import type { Logger } from "@logtape/logtape";
import {
    type AudioModelName,
    ELEVENLABS_VOICES,
    resolveElevenLabsVoiceId,
} from "@shared/registry/audio.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
    createCompletionAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import type { SafeValue } from "@shared/schemas/safety.ts";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { ensureUpstreamOk, UpstreamError } from "@/error.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { resolveModel } from "@/middleware/model.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { applySafety, withSafetyHeaders } from "@/middleware/safety.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import { requireGenerationAccess } from "@/utils/generation-access.ts";
import { transcribeWithAssemblyAi } from "./assemblyai-transcription.ts";

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
                description:
                    "The audio format for the output. Qwen TTS currently returns WAV regardless of this setting.",
                example: "mp3",
            }),
        speed: z.number().min(0.25).max(4.0).default(1.0).meta({
            description:
                "The speed of the generated audio. 0.25 to 4.0, default 1.0.",
            example: 1.0,
        }),
        duration: z.number().min(3).max(300).optional().meta({
            description:
                "Music duration in seconds, 3-300 (elevenmusic/acestep)",
            example: 30,
        }),
        instrumental: z.boolean().optional().meta({
            description:
                "If true, guarantees instrumental output (elevenmusic only)",
            example: false,
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
    style?: string;
    instrumental?: boolean;
    seed?: number;
    voice: string;
    response_format: string;
    instruct?: string;
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

export async function generateSpeech(opts: {
    text: string;
    voice: string;
    responseFormat: string;
    seed?: number;
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

    const elevenLabsBody: Record<string, unknown> = {
        text,
        model_id: DEFAULT_ELEVENLABS_MODEL,
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
            words:
                elevenLabsData.words?.map((w) => ({
                    word: w.text,
                    start: w.start,
                    end: w.end,
                })) ?? [],
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
    seed?: number;
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

    // Buffer response and extract duration
    const audioBuffer = await response.arrayBuffer();
    // MP3 only — parseMp4Duration falsely matches random bytes in compressed audio
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

    if (c.var.model.resolved === "acestep") {
        return withSafetyHeaders(
            c,
            await generateAceStepMusic({
                prompt: text,
                style: query.style,
                durationSeconds: query.duration,
                serviceUrl: c.env.MUSIC_SERVICE_URL,
                serviceToken: c.env.PLN_GPU_TOKEN,
                log,
            }),
        );
    }

    if (c.var.model.resolved === "elevenmusic") {
        return withSafetyHeaders(
            c,
            await generateMusic({
                prompt: text,
                durationSeconds: query.duration,
                forceInstrumental: query.instrumental,
                seed: query.seed === -1 ? undefined : query.seed,
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
                voice: query.voice || "alloy",
                instruct: query.instruct,
                apiKey: c.env.DASHSCOPE_API_KEY,
                log,
            }),
        );
    }

    return withSafetyHeaders(
        c,
        await generateSpeech({
            text,
            voice: query.voice || "alloy",
            responseFormat: query.response_format || "mp3",
            seed: query.seed === -1 ? undefined : query.seed,
            apiKey,
            log,
        }),
    );
}

export const audioRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth(), frontendKeyRateLimit, balance)
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
            await requireGenerationAccess(c.var, c.env);

            const { input, voice, response_format } = c.req.valid(
                "json" as never,
            ) as CreateSpeechRequest;
            const apiKey = (c.env as unknown as { ELEVENLABS_API_KEY: string })
                .ELEVENLABS_API_KEY;

            if (c.var.model.resolved === "acestep") {
                const { duration, style } = c.req.valid(
                    "json" as never,
                ) as CreateSpeechRequest;
                return generateAceStepMusic({
                    prompt: input,
                    style,
                    durationSeconds: duration,
                    serviceUrl: c.env.MUSIC_SERVICE_URL,
                    serviceToken: c.env.PLN_GPU_TOKEN,
                    log,
                });
            }

            if (c.var.model.resolved === "elevenmusic") {
                const { duration, instrumental, seed } = c.req.valid(
                    "json" as never,
                ) as CreateSpeechRequest;
                return generateMusic({
                    prompt: input,
                    durationSeconds: duration,
                    forceInstrumental: instrumental,
                    seed,
                    apiKey,
                    log,
                });
            }

            const { seed } = c.req.valid(
                "json" as never,
            ) as CreateSpeechRequest;
            if (isQwenTtsModel(c.var.model.resolved)) {
                const { instruct } = c.req.valid(
                    "json" as never,
                ) as CreateSpeechRequest;
                return generateQwenTts({
                    modelName: c.var.model.resolved,
                    text: input,
                    voice,
                    instruct,
                    apiKey: c.env.DASHSCOPE_API_KEY,
                    log,
                });
            }

            return generateSpeech({
                text: input,
                voice,
                responseFormat: response_format,
                seed,
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
        resolveModel("generate.audio", {
            defaultModel: "whisper-large-v3",
        }),
        track("generate.audio"),
        async (c) => {
            const log = c.get("log").getChild("transcription");
            await requireGenerationAccess(c.var, c.env);

            // Get formData from middleware or parse it
            const formData = c.get("formData") || (await c.req.formData());

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

            // Re-build formData for Whisper (Hono consumed the original body stream)
            const whisperFormData = new FormData();
            whisperFormData.append("file", file);
            if (language) whisperFormData.append("language", language);
            if (responseFormat)
                whisperFormData.append("response_format", responseFormat);
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
