import { AUDIO_SERVICES, MAI_VOICE_21_VOICES } from "@shared/registry/audio.ts";
import {
    type ModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    generateMaiSpeech,
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
            expect(def.provider).toBe("azure");
            expect(def.aliases).toEqual([]);
            expect(def.priceMultiplier).toBe(0.75);
            expect(def.paidOnly).toBe(false);
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
    ])("rejects unapproved alias %s", (alias) => {
        expect(() => resolveModelName(alias)).toThrow(/Invalid model or alias/);
    });
});

describe("MAI Gateway billing", () => {
    afterEach(() => vi.restoreAllMocks());
    it("preserves the provider receipt and reported character count", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    audio: "AQID",
                    usage: { inputCharacters: 7 },
                    providerMetadata: { gateway: { cost: "0.000154001" } },
                }),
            ),
        );
        const response = await generateMaiSpeech({
            modelName: "microsoft/mai-voice-2.1",
            routeId: "microsoft/mai-voice-2.1:vercel",
            provider: "vercel",
            text: "hello",
            voice: "alloy",
            responseFormat: "mp3",
            apiKey: "test-gateway-key",
            log,
        });
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "7",
        );
        expect(response.headers.get("x-usage-provider-billable-units")).toBe(
            "0.000154001",
        );
        expect(response.headers.get("x-usage-provider-unit-cost")).toBe("1");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([1, 2, 3]),
        );
    });
    it("rejects audio without a valid provider cost receipt", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ audio: "AQID" })),
        );
        await expect(
            generateMaiSpeech({
                modelName: "microsoft/mai-voice-2.1",
                routeId: "microsoft/mai-voice-2.1:vercel",
                provider: "vercel",
                text: "hello",
                voice: "alloy",
                responseFormat: "mp3",
                apiKey: "test-gateway-key",
                log,
            }),
        ).rejects.toThrow(/invalid audio/);
    });
});

describe("MAI Azure SSML", () => {
    afterEach(() => vi.restoreAllMocks());
    it("sends UTF-8 SSML and escapes caller text without billing the XML", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
        const text = 'Café 😀 & <hello> "quotes"';
        const response = await generateMaiSpeech({
            modelName: "microsoft/mai-voice-2.1",
            routeId: "microsoft/mai-voice-2.1",
            provider: "azure",
            text,
            voice: "alloy",
            responseFormat: "pcm",
            apiKey: "test-azure-key",
            log,
        });
        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.headers.get("Content-Type")).toBe(
            "application/ssml+xml; charset=utf-8",
        );
        expect(request.headers.get("X-Microsoft-OutputFormat")).toBe(
            "raw-24khz-16bit-mono-pcm",
        );
        expect(await request.text()).toContain(
            "Café 😀 &amp; &lt;hello&gt; &quot;quotes&quot;",
        );
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            String(text.length),
        );
    });
});
