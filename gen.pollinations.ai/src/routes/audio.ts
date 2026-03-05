/**
 * Audio generation functions for gen.pollinations.ai
 *
 * Pure functions that call external APIs (ElevenLabs, Airforce, OVH).
 * Moved from enter.pollinations.ai/src/routes/audio.ts
 */

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

const DEFAULT_ELEVENLABS_MODEL = "eleven_v3";

/**
 * Parse MP4/M4A container to extract exact duration from the `mvhd` atom.
 * Returns duration in seconds, or null if the atom isn't found.
 */
function parseMp4Duration(buffer: ArrayBuffer): number | null {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    const mvhd = [0x6d, 0x76, 0x68, 0x64]; // "mvhd"
    let offset = -1;
    for (let i = 0; i < bytes.length - 28; i++) {
        if (
            bytes[i] === mvhd[0] &&
            bytes[i + 1] === mvhd[1] &&
            bytes[i + 2] === mvhd[2] &&
            bytes[i + 3] === mvhd[3]
        ) {
            offset = i;
            break;
        }
    }
    if (offset === -1) return null;

    const version = bytes[offset + 4];
    let timescale: number;
    let duration: number;

    if (version === 0) {
        timescale = view.getUint32(offset + 16);
        duration = view.getUint32(offset + 20);
    } else {
        timescale = view.getUint32(offset + 24);
        duration = Number(view.getBigUint64(offset + 28));
    }

    if (timescale === 0) return null;
    return duration / timescale;
}

function mapOutputFormat(format: string): string {
    const formatMap: Record<string, string> = {
        mp3: "mp3_44100_128",
        opus: "opus_48000_128",
        aac: "m4a_aac_44100_128",
        flac: "pcm_44100",
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
}): Promise<Response> {
    const { text, voice, responseFormat, apiKey } = opts;

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "TTS service is not configured (missing API key)" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    if (text.length > 4096) {
        return new Response(
            JSON.stringify({ error: `Input text too long: ${text.length} characters. Maximum is 4096.` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    const voiceId = resolveElevenLabsVoiceId(voice);
    if (!voiceId || voiceId.length < 8) {
        return new Response(
            JSON.stringify({ error: `Invalid voice: ${voice}. Use a preset name or valid ElevenLabs voice ID.` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    const outputFormat = mapOutputFormat(responseFormat);
    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const response = await fetch(elevenLabsUrl, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify({
            text,
            model_id: DEFAULT_ELEVENLABS_MODEL,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        return new Response(
            JSON.stringify({ error: errorText || "ElevenLabs TTS error" }),
            { status: response.status >= 500 ? 502 : response.status, headers: { "Content-Type": "application/json" } },
        );
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const usageHeaders = buildUsageHeaders("elevenlabs", createAudioTokenUsage(text.length));

    return new Response(response.body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "x-tts-voice": voice,
            ...usageHeaders,
        },
    });
}

export async function generateMusic(opts: {
    prompt: string;
    durationSeconds?: number;
    forceInstrumental?: boolean;
    apiKey: string;
}): Promise<Response> {
    const { prompt, durationSeconds, forceInstrumental, apiKey } = opts;

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "Music service is not configured (missing API key)" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    if (prompt.length > 10000) {
        return new Response(
            JSON.stringify({ error: `Prompt too long: ${prompt.length} characters. Maximum is 10000.` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

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

    const response = await fetch("https://api.elevenlabs.io/v1/music", {
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
        return new Response(
            JSON.stringify({ error: errorText || "ElevenLabs Music error" }),
            { status: response.status >= 500 ? 502 : response.status, headers: { "Content-Type": "application/json" } },
        );
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = await response.arrayBuffer();
    const estimatedDuration =
        parseMp4Duration(audioBuffer) ?? audioBuffer.byteLength / 16000;

    const usageHeaders = buildUsageHeaders(
        "elevenmusic",
        createCompletionAudioSecondsUsage(estimatedDuration),
    );

    return new Response(audioBuffer, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...usageHeaders,
        },
    });
}

/**
 * Generate music via Suno (api.airforce).
 * Falls back to suno-v4.5 if suno-v5 fails.
 */
export async function generateSunoMusic(opts: {
    prompt: string;
    apiKey: string;
}): Promise<Response> {
    const { prompt, apiKey } = opts;

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "Suno music service is not configured (missing API key)" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    if (prompt.length > 10000) {
        return new Response(
            JSON.stringify({ error: `Prompt too long: ${prompt.length} characters. Maximum is 10000.` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    const models = ["suno-v5", "suno-v4.5"];

    for (const model of models) {
        try {
            const response = await fetch(
                "https://api.airforce/v1/images/generations",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        prompt,
                        n: 1,
                        sse: true,
                        response_format: "url",
                    }),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                if (model !== models[models.length - 1]) continue;
                return new Response(
                    JSON.stringify({ error: errorText || "Suno error" }),
                    { status: response.status >= 500 ? 502 : response.status, headers: { "Content-Type": "application/json" } },
                );
            }

            // Parse SSE response to find the result URL
            const text = await response.text();
            let resultUrl: string | undefined;

            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (
                    !trimmed.startsWith("data: ") ||
                    trimmed === "data: [DONE]" ||
                    trimmed === "data: : keepalive"
                ) {
                    continue;
                }
                try {
                    const parsed = JSON.parse(trimmed.slice(6)) as {
                        data?: Array<{ url?: string }>;
                        error?: string;
                    };
                    if (parsed.error) {
                        throw new Error(parsed.error);
                    }
                    const url = parsed.data?.[0]?.url;
                    if (url) resultUrl = url;
                } catch (e) {
                    // Skip unparseable SSE lines
                    if ((e as Error).message && !(e instanceof SyntaxError)) throw e;
                }
            }

            if (!resultUrl) {
                if (model !== models[models.length - 1]) continue;
                return new Response(
                    JSON.stringify({ error: "Suno returned no result URL" }),
                    { status: 502, headers: { "Content-Type": "application/json" } },
                );
            }

            // Download the MP4 result
            const downloadResponse = await fetch(resultUrl);
            if (!downloadResponse.ok) {
                return new Response(
                    JSON.stringify({ error: `Failed to download Suno result: ${downloadResponse.status}` }),
                    { status: 502, headers: { "Content-Type": "application/json" } },
                );
            }

            const audioBuffer = await downloadResponse.arrayBuffer();
            const estimatedDuration =
                parseMp4Duration(audioBuffer) ?? audioBuffer.byteLength / 46000;

            const usageHeaders = buildUsageHeaders(
                "suno",
                createCompletionAudioSecondsUsage(estimatedDuration),
            );

            return new Response(audioBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "audio/mpeg",
                    ...usageHeaders,
                },
            });
        } catch (e) {
            if (model === models[models.length - 1]) {
                return new Response(
                    JSON.stringify({ error: `Suno music generation failed: ${(e as Error).message}` }),
                    { status: 502, headers: { "Content-Type": "application/json" } },
                );
            }
        }
    }

    return new Response(
        JSON.stringify({ error: "Suno music generation failed" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
    );
}

export async function transcribeAudio(opts: {
    formData: FormData;
    model: string;
    elevenLabsApiKey: string;
    ovhApiKey: string;
}): Promise<Response> {
    const { formData, model, elevenLabsApiKey, ovhApiKey } = opts;

    const file = formData.get("file") as unknown as File;
    if (!file) {
        return new Response(
            JSON.stringify({ error: "Missing required field: file" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    const language = formData.get("language") as string | null;
    const responseFormat = (formData.get("response_format") as string) || "json";

    // Route to ElevenLabs Scribe
    if (model === "scribe") {
        if (!elevenLabsApiKey) {
            return new Response(
                JSON.stringify({ error: "Transcription service is not configured (missing API key)" }),
                { status: 500, headers: { "Content-Type": "application/json" } },
            );
        }

        if (responseFormat && !["json", "text", "verbose_json"].includes(responseFormat)) {
            return new Response(
                JSON.stringify({ error: `Unsupported response_format for scribe model: ${responseFormat}. Supported: json, text, verbose_json` }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        const scribeFormData = new FormData();
        scribeFormData.append("file", file);
        scribeFormData.append("model_id", "scribe_v2");
        if (language) scribeFormData.append("language_code", language);

        const response = await fetch(
            "https://api.elevenlabs.io/v1/speech-to-text",
            {
                method: "POST",
                headers: { "xi-api-key": elevenLabsApiKey },
                body: scribeFormData,
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(
                JSON.stringify({ error: errorText || "ElevenLabs transcription error" }),
                { status: response.status >= 500 ? 502 : response.status, headers: { "Content-Type": "application/json" } },
            );
        }

        const elevenLabsData = (await response.json()) as {
            text: string;
            language_code?: string;
            words?: { text: string; start: number; end: number }[];
        };

        if (!elevenLabsData.words?.length) {
            return new Response(
                JSON.stringify({ error: "ElevenLabs response missing word timestamps (required for billing)" }),
                { status: 502, headers: { "Content-Type": "application/json" } },
            );
        }
        const duration = elevenLabsData.words[elevenLabsData.words.length - 1].end;
        const usageHeaders = buildUsageHeaders("scribe", createAudioSecondsUsage(duration));

        if (responseFormat === "text") {
            return new Response(elevenLabsData.text, {
                headers: { "Content-Type": "text/plain; charset=utf-8", ...usageHeaders },
            });
        }

        if (responseFormat === "verbose_json") {
            return Response.json(
                {
                    text: elevenLabsData.text,
                    task: "transcribe",
                    language: elevenLabsData.language_code || "unknown",
                    duration,
                    words: elevenLabsData.words?.map((w) => ({
                        word: w.text,
                        start: w.start,
                        end: w.end,
                    })),
                    segments: [{ id: 0, start: 0, end: duration, text: elevenLabsData.text }],
                },
                { headers: usageHeaders },
            );
        }

        return Response.json({ text: elevenLabsData.text }, { headers: usageHeaders });
    }

    // Default: Whisper (OVHcloud)
    if (!ovhApiKey) {
        return new Response(
            JSON.stringify({ error: "Transcription service is not configured (missing API key)" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    const whisperFormData = new FormData();
    whisperFormData.append("file", file);
    if (language) whisperFormData.append("language", language);
    if (responseFormat) whisperFormData.append("response_format", responseFormat);
    whisperFormData.append("model", "whisper-large-v3");

    const response = await fetch(
        "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/audio/transcriptions",
        {
            method: "POST",
            headers: { Authorization: `Bearer ${ovhApiKey}` },
            body: whisperFormData,
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        return new Response(
            JSON.stringify({ error: errorText || "Transcription error" }),
            { status: response.status >= 500 ? 502 : response.status, headers: { "Content-Type": "application/json" } },
        );
    }

    const responseBody = await response.text();
    const json = JSON.parse(responseBody);
    const duration = json.usage?.duration;
    if (typeof duration !== "number" || duration <= 0) {
        // Can't bill without duration, but still return the result
        return new Response(responseBody, {
            headers: { ...Object.fromEntries(response.headers) },
        });
    }

    const usageHeaders = buildUsageHeaders(
        "whisper-large-v3",
        createAudioSecondsUsage(duration),
    );

    return new Response(responseBody, {
        headers: { ...Object.fromEntries(response.headers), ...usageHeaders },
    });
}
