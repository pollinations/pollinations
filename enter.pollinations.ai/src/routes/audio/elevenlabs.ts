import type { Logger } from "@logtape/logtape";
import { resolveElevenLabsVoiceId } from "@shared/registry/audio.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
    createCompletionAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    getDefaultErrorMessage,
    remapUpstreamStatus,
    UpstreamError,
} from "@/error.ts";
import { parseMp4Duration } from "./mp4-duration.ts";

const DEFAULT_ELEVENLABS_MODEL = "eleven_v3";

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

    const audioBuffer = await response.arrayBuffer();
    const estimatedDuration =
        parseMp4Duration(audioBuffer) ?? audioBuffer.byteLength / 16000;

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

    if (!["json", "text", "verbose_json"].includes(responseFormat)) {
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

    if (responseFormat === "text") {
        return new Response(elevenLabsData.text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "verbose_json") {
        const verboseResponse = {
            text: elevenLabsData.text,
            task: "transcribe",
            language: elevenLabsData.language_code || "unknown",
            duration,
            words: elevenLabsData.words.map((w) => ({
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

    return Response.json(
        { text: elevenLabsData.text },
        { headers: usageHeaders },
    );
}
