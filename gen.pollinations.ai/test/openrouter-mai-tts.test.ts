import { AUDIO_SERVICES, MAI_VOICE_21_VOICES } from "@shared/registry/audio.ts";
import {
    type ModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    generateOpenRouterMaiSpeech,
    resolveMaiSpeechVoice,
} from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("resolveMaiSpeechVoice", () => {
    it("defaults the schema fallback voice to en-US-Harper", () => {
        expect(resolveMaiSpeechVoice("microsoft/mai-voice-2.1", "alloy")).toBe(
            "en-US-Harper:MAI-Voice-2.1",
        );
    });

    it("accepts a short voice id case-insensitively", () => {
        expect(
            resolveMaiSpeechVoice(
                "microsoft/mai-voice-2.1-flash",
                "RU-ru-masha",
            ),
        ).toBe("ru-RU-Masha:MAI-Voice-2.1-Flash");
    });

    it("accepts a full voice id with the matching suffix", () => {
        expect(
            resolveMaiSpeechVoice(
                "microsoft/mai-voice-2.1",
                "en-GB-Harry:MAI-Voice-2.1",
            ),
        ).toBe("en-GB-Harry:MAI-Voice-2.1");
    });

    it("rejects the other variant's suffix", () => {
        expect(() =>
            resolveMaiSpeechVoice(
                "microsoft/mai-voice-2.1",
                "en-US-Harper:MAI-Voice-2.1-Flash",
            ),
        ).toThrow(/Invalid voice for microsoft\/mai-voice-2\.1/);
        expect(() =>
            resolveMaiSpeechVoice(
                "microsoft/mai-voice-2.1-flash",
                "en-US-Harper:MAI-Voice-2.1",
            ),
        ).toThrow(/Invalid voice for microsoft\/mai-voice-2\.1-flash/);
    });

    it("rejects unknown voices and names the model", () => {
        expect(() =>
            resolveMaiSpeechVoice("microsoft/mai-voice-2.1", "nova"),
        ).toThrow(/Invalid voice for microsoft\/mai-voice-2\.1: nova/);
    });
});

describe("MAI registry entries", () => {
    it("registers both variants with the full 97-voice catalog", () => {
        for (const id of [
            "microsoft/mai-voice-2.1",
            "microsoft/mai-voice-2.1-flash",
        ]) {
            const def = AUDIO_SERVICES[
                id as keyof typeof AUDIO_SERVICES
            ] as ModelDefinition;
            expect(def.provider).toBe("openrouter");
            expect(def.voices).toHaveLength(97);
            expect(def.voices).toEqual([...MAI_VOICE_21_VOICES]);
        }
    });

    it.each([
        ["mai-voice", "microsoft/mai-voice-2.1"],
        ["mai-voice-2.1", "microsoft/mai-voice-2.1"],
        ["mai-tts", "microsoft/mai-voice-2.1"],
        ["mai-voice-flash", "microsoft/mai-voice-2.1-flash"],
        ["mai-voice-2.1-flash", "microsoft/mai-voice-2.1-flash"],
        ["mai-tts-flash", "microsoft/mai-voice-2.1-flash"],
    ])("resolves alias %s to %s", (alias, canonical) => {
        expect(resolveModelName(alias)).toBe(canonical);
    });
});

describe("generateOpenRouterMaiSpeech", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ["microsoft/mai-voice-2.1", "MAI-Voice-2.1"],
        ["microsoft/mai-voice-2.1-flash", "MAI-Voice-2.1-Flash"],
    ] as const)("pins Azure, suffixes the voice for %s, and bills characters", async (modelName, suffix) => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "content-type": "audio/mpeg",
                    "x-generation-id": "gen-mai-test",
                },
            }),
        );
        const text = "Café 你好.";

        const response = await generateOpenRouterMaiSpeech({
            modelName,
            text,
            voice: "alloy",
            responseFormat: "mp3",
            apiKey: "test-openrouter-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.url).toBe("https://openrouter.ai/api/v1/audio/speech");
        await expect(request.json()).resolves.toEqual({
            model: modelName,
            input: text,
            voice: `en-US-Harper:${suffix}`,
            response_format: "mp3",
            provider: {
                only: ["Azure"],
                allow_fallbacks: false,
            },
        });
        expect(response.headers.get("content-type")).toBe("audio/mpeg");
        expect(response.headers.get("x-generation-id")).toBe("gen-mai-test");
        expect(response.headers.get("x-tts-voice")).toBe(
            `en-US-Harper:${suffix}`,
        );
        // "Café 你好." is 8 code points; the upstream is character-priced.
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            String([...text].length),
        );
        expect([...text].length).toBe(8);
    });

    it("forwards pcm and falls back to an audio/pcm content type", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1]), { headers: {} }),
        );
        const response = await generateOpenRouterMaiSpeech({
            modelName: "microsoft/mai-voice-2.1",
            text: "hi",
            voice: "fr-FR-Soleil",
            responseFormat: "pcm",
            apiKey: "test-openrouter-key",
            log,
        });
        expect(response.headers.get("content-type")).toBe("audio/pcm");
        expect(response.headers.get("x-tts-voice")).toBe(
            "fr-FR-Soleil:MAI-Voice-2.1",
        );
    });

    it("rejects unsupported formats before any upstream call", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        await expect(
            generateOpenRouterMaiSpeech({
                modelName: "microsoft/mai-voice-2.1",
                text: "hi",
                voice: "en-US-Harper",
                responseFormat: "wav",
                apiKey: "test-openrouter-key",
                log,
            }),
        ).rejects.toThrow(/Unsupported response_format/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
