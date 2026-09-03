import { communityAudioSpeechUrl } from "@shared/community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointRuntime,
    communityEndpointPriceFieldsForModality,
    communityEndpointPrices,
    communityModelDefinition,
    communityPriceDefinition,
} from "@shared/community-endpoints.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    USAGE_TYPE_HEADERS,
} from "@shared/registry/usage-headers.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callCommunitySpeechEndpoint } from "../src/audio/communityEndpoint.ts";

describe("community speech modality", () => {
    it("derives the OpenAI-compatible audio speech URL", () => {
        expect(communityAudioSpeechUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/audio/speech",
        );
        expect(
            communityAudioSpeechUrl("https://api.example.com/v1/audio/speech"),
        ).toBe("https://api.example.com/v1/audio/speech");
    });

    it("builds community speech models billed per synthesized character", () => {
        const modelId = "voodoohop/tts";
        const definition = communityModelDefinition({
            modelId,
            title: "Community TTS",
            description: "Community speech model",
            modality: "speech",
            ...communityEndpointPrices({ completionAudioPrice: 0.00001 }),
        });

        expect(definition).toMatchObject({
            category: "audio",
            inputModalities: ["text"],
            outputModalities: ["audio"],
            supportedEndpoints: ["/v1/audio/speech", "/audio/{text}"],
            cost: { completionAudioTokens: 0.00001 },
        });
        expect(definition.cost).not.toHaveProperty("promptTextTokens");
        expect(
            calculateUsageBilling({
                model: modelId,
                usage: { completionAudioTokens: 1000 },
                servedBy: definition,
            }).price.totalPrice,
        ).toBeCloseTo(0.00001 * 1000, 10);
    });

    it("keeps the speech price as the only billed bucket for its modality", () => {
        const definition = communityPriceDefinition(
            communityEndpointPrices({ completionAudioPrice: 0.00002 }),
            "speech",
        );
        expect(definition).toEqual({ completionAudioTokens: 0.00002 });
    });

    it("meters speech on characters with the completion audio usage type", () => {
        const [field] = communityEndpointPriceFieldsForModality("speech");
        expect(field).toMatchObject({
            key: "completionAudioPrice",
            usageType: "completionAudioTokens",
            priceUnit: "million",
            rawUsagePaths: ["characters"],
        });
        // The speech price column ships in the shared price field set, so the
        // dashboard and Account API accept it without another migration.
        expect(
            COMMUNITY_ENDPOINT_PRICE_FIELDS.some(
                (existing) => existing.key === field.key,
            ),
        ).toBe(true);
    });
});

describe("community speech endpoint billing", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const secret = "test-secret";

    async function speechEndpoint(): Promise<CommunityEndpointRuntime> {
        return {
            type: "proxy",
            id: "community-endpoint-id",
            ownerUserId: "owner-id",
            modelId: "voodoohop/tts",
            name: "tts",
            title: "TTS",
            description: null,
            modality: "speech",
            imagePricing: "request",
            inputModalities: ["text"],
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "tts-1",
            visibility: "public",
            paidOnly: false,
            perUserRpm: null,
            fallbacks: [],
            hiddenAt: null,
            hiddenReason: null,
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                secret,
            ),
            ...communityEndpointPrices({ completionAudioPrice: 0.00001 }),
        };
    }

    const speechOptions = {
        input: "Hello world",
        voice: "alloy",
        responseFormat: "mp3",
    };

    it("forwards the OpenAI speech request and bills the input characters", async () => {
        const audioBytes = new Uint8Array([1, 2, 3, 4]);
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe("https://api.example.com/v1/audio/speech");
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            expect(await request.json()).toEqual({
                model: "tts-1",
                input: "Hello world",
                voice: "alloy",
                response_format: "mp3",
            });
            return new Response(audioBytes, {
                status: 200,
                headers: { "content-type": "audio/mpeg" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await callCommunitySpeechEndpoint(
            await speechEndpoint(),
            speechOptions,
            secret,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("audio/mpeg");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            audioBytes,
        );
        expect(response.headers.get(MODEL_USED_HEADER)).toBe("voodoohop/tts");
        expect(
            response.headers.get(USAGE_TYPE_HEADERS.completionAudioTokens),
        ).toBe(String("Hello world".length));
    });

    it("rejects a managed agent endpoint", async () => {
        const endpoint = {
            ...(await speechEndpoint()),
            type: "prompt_agent",
        } as CommunityEndpointRuntime;

        await expect(
            callCommunitySpeechEndpoint(endpoint, speechOptions, secret),
        ).rejects.toThrow("managed agent");
    });

    it("fails when the upstream errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json(
                    { error: { message: "upstream exploded" } },
                    { status: 500 },
                ),
            ),
        );

        await expect(
            callCommunitySpeechEndpoint(
                await speechEndpoint(),
                speechOptions,
                secret,
            ),
        ).rejects.toThrow("upstream exploded");
    });

    it("reports a connection failure as a 502", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("connect ECONNREFUSED");
            }),
        );

        const call = callCommunitySpeechEndpoint(
            await speechEndpoint(),
            speechOptions,
            secret,
        );
        await expect(call).rejects.toThrow("timed out or could not connect");
        await expect(call).rejects.toMatchObject({ status: 502 });
    });
});
