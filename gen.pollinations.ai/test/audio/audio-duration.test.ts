import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { describe, expect, it } from "vitest";
import { resolveAudioDuration } from "../../src/routes/audio.ts";

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
