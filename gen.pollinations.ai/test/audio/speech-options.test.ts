import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { describe, expect, it } from "vitest";
import {
    resolveAudioDuration,
    resolveSpeechOptions,
} from "../../src/routes/audio.ts";

function resolve(
    model: keyof typeof AUDIO_SERVICES,
    voice: string,
    responseFormat?: string,
) {
    return resolveSpeechOptions(
        model,
        AUDIO_SERVICES[model],
        voice,
        responseFormat,
    );
}

describe("resolveSpeechOptions", () => {
    it.each([
        ["x-ai/grok-tts", "eve", "mp3"],
        ["google/gemini-3.8-flash-tts", "Kore", "wav"],
        ["sesame/csm-1b", "conversational_a", "mp3"],
        ["hexgrad/kokoro-82m", "af_alloy", "mp3"],
        ["openai/tts-1", "alloy", "mp3"],
    ] as const)("defaults %s to its first voice and format", (model, voice, responseFormat) => {
        expect(resolve(model, "alloy")).toEqual({ voice, responseFormat });
    });

    it("keeps an explicit voice and format the model lists", () => {
        expect(resolve("x-ai/grok-tts", "leo", "pcm")).toEqual({
            voice: "leo",
            responseFormat: "pcm",
        });
    });

    it.each([
        ["google/gemini-3.8-flash-tts", "mp3"],
        ["fish-audio/s2.1-pro", "wav"],
        ["elevenlabs/eleven-v3", "flac"],
        ["elevenlabs/eleven-multilingual-sts-v2", "flac"],
        ["elevenlabs/eleven-text-to-sound-v2", "wav"],
    ] as const)("rejects %s with %s before any provider request", (model, responseFormat) => {
        expect(() => resolve(model, "alloy", responseFormat)).toThrow(
            `Unsupported response_format for ${model}`,
        );
    });

    it("passes the request through for models without a format list", () => {
        expect(resolve("qwen/qwen3-tts-flash", "alloy", "opus")).toEqual({
            voice: "alloy",
            responseFormat: "opus",
        });
    });
});

describe("resolveAudioDuration", () => {
    it("accepts Stable Audio's full 380-second range", () => {
        const model = "stability-ai/stable-audio-3";
        expect(resolveAudioDuration(model, AUDIO_SERVICES[model], 350)).toBe(
            350,
        );
    });

    it.each([
        ["elevenlabs/music-v2", 2],
        ["google/lyria-3-clip-preview", 20],
    ] as const)("rejects %s with %s seconds", (model, duration) => {
        expect(() =>
            resolveAudioDuration(model, AUDIO_SERVICES[model], duration),
        ).toThrow(`Unsupported duration for ${model}`);
    });
});
