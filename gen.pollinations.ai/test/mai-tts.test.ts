import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { AUDIO_SERVICES, MAI_VOICE_21_VOICES } from "@shared/registry/audio.ts";
import {
    type ModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import {
    generateMaiSpeech,
    resolveMaiSpeechVoice,
} from "../src/routes/audio.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

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

describe("MAI caller choices", () => {
    afterEach(() => vi.restoreAllMocks());

    workerTest.for([
        ["microsoft/mai-voice-2.1", "microsoft/mai-voice-2.1-flash"],
        ["microsoft/mai-voice-2.1-flash", "microsoft/mai-voice-2.1"],
    ])(
        "uses the chosen Azure voice suffix for %s then %s",
        async ([primary, alternate], { paidApiKey }) => {
            const realFetch = globalThis.fetch.bind(globalThis);
            const ssml: string[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (input, init) => {
                    const url =
                        input instanceof Request ? input.url : input.toString();
                    if (
                        url ===
                        "https://swedencentral.tts.speech.microsoft.com/cognitiveservices/v1"
                    ) {
                        ssml.push(await new Request(input, init).text());
                        if (ssml.length === 1) {
                            return new Response("temporarily unavailable", {
                                status: 503,
                            });
                        }
                        return new Response(new Uint8Array([73, 68, 51, 4]), {
                            headers: { "content-type": "audio/mpeg" },
                        });
                    }
                    if (
                        url.startsWith(
                            "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json",
                        ) ||
                        url.startsWith("http://localhost:7181/")
                    ) {
                        return Response.json({ data: [] });
                    }
                    return realFetch(input, init);
                },
            );
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request("https://gen.pollinations.ai/v1/audio/speech", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${paidApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: `${primary},${alternate}`,
                        input: `MAI variant choices ${crypto.randomUUID()}`,
                        safe: false,
                    }),
                }),
                withInlineGenerationCoordinator({
                    ...env,
                    AZURE_MYCELI_PROD_SWEDEN_API_KEY: "test-azure-key",
                } as unknown as CloudflareBindings),
                ctx,
            );

            expect(response.status).toBe(200);
            const suffix = (model: string) =>
                model.endsWith("-flash")
                    ? "MAI-Voice-2.1-Flash"
                    : "MAI-Voice-2.1";
            expect(ssml).toHaveLength(2);
            expect(ssml[0]).toContain(`name="en-US-Harper:${suffix(primary)}"`);
            expect(ssml[1]).toContain(
                `name="en-US-Harper:${suffix(alternate)}"`,
            );
            expect(response.headers.get("x-tts-voice")).toBe(
                `en-US-Harper:${suffix(alternate)}`,
            );
            expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(
                0,
            );
            await waitOnExecutionContext(ctx);
        },
    );
});
