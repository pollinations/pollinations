import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    createTestApiKey,
    test as workerTest,
} from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

/**
 * A stray `stream` field in an audio POST body fragments the cache identity.
 *
 * POST /v1/audio/speech has no body validator: prepareGenerationRequest uses
 * the raw body (minus the `key` credential) as generationCacheBody, while zod
 * (parseCreateSpeechRequest) silently strips `stream` from the parsed request —
 * the field never changes the generated audio. The result is one identity
 * spread across two cache entries, so the same request is regenerated and
 * rebilled, and identical concurrent requests do not single-flight.
 */

const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

const db = drizzle(env.DB);

afterEach(() => vi.restoreAllMocks());

/** Azure TTS upstream for openai/tts-1, optionally held slow. */
function mockAzureTts(
    hold: boolean,
    tinybird: ReturnType<typeof createMockTinybird>,
) {
    let executions = 0;
    let releaseGeneration: () => void = () => {};
    const inFlight = hold
        ? new Promise<void>((resolve) => {
              releaseGeneration = resolve;
          })
        : Promise.resolve();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "myceli-prod-swedencentral.openai.azure.com") {
            executions++;
            await inFlight;
            return new Response(MP3, {
                headers: { "content-type": "audio/mpeg" },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });
    return {
        get executions() {
            return executions;
        },
        release: releaseGeneration,
        async drain() {
            await vi.waitFor(() => {
                expect(
                    tinybird.state.events.some((event) => event.isBilledUsage),
                ).toBe(true);
            });
        },
    };
}

const speechRequest = (key: string, input: string, stream: boolean) =>
    new Request("https://gen.pollinations.ai/v1/audio/speech", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/tts-1",
            input,
            voice: "alloy",
            ...(stream ? { stream: true } : {}),
        }),
    });

workerTest(
    "shares the audio cache entry between plain and stream-flagged bodies",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        env.AZURE_MYCELI_PROD_SWEDEN_API_KEY = "workers-test-only";
        const tinybird = createMockTinybird();
        const provider = mockAzureTts(false, tinybird);
        const input = `wave6-audio-identity-${crypto.randomUUID()}`;

        const ctxPlain = createExecutionContext();
        const plain = await worker.fetch(
            speechRequest(owner.key, input, false),
            env,
            ctxPlain,
        );
        expect(plain.status).toBe(200);
        expect(provider.executions).toBe(1);
        expect((await plain.clone().arrayBuffer()).byteLength).toBeGreaterThan(
            0,
        );
        await waitOnExecutionContext(ctxPlain);
        await provider.drain();

        // The identical request with only a stray `stream` body field must
        // reuse the entry, not regenerate and rebill the same audio.
        const ctxStreamed = createExecutionContext();
        const streamed = await worker.fetch(
            speechRequest(owner.key, input, true),
            env,
            ctxStreamed,
        );
        await waitOnExecutionContext(ctxStreamed);
        expect(streamed.status).toBe(200);
        expect(
            (await streamed.clone().arrayBuffer()).byteLength,
        ).toBeGreaterThan(0);
        // Consume the R2-backed body before asserting so no storage handle
        // outlives a failing assertion either.
        expect(streamed.headers.get("x-cache")).toBe("HIT");
        expect(provider.executions).toBe(1);

        // And the payer was billed exactly one generation.
        const balance = await getUserBalance(db, owner.userId);
        expect(balance.packBalance).toBeLessThan(100);
    },
    30_000,
);

workerTest(
    "coordinates identical audio requests across the stray stream flag",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const joiner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        env.AZURE_MYCELI_PROD_SWEDEN_API_KEY = "workers-test-only";
        const tinybird = createMockTinybird();
        const provider = mockAzureTts(true, tinybird);
        const input = `wave6-audio-join-${crypto.randomUUID()}`;

        // Two identical requests racing while the provider is slow, one with a
        // stray `stream` body field: the coordinator must collapse them into
        // one upstream generation.
        const ctxA = createExecutionContext();
        const ctxB = createExecutionContext();
        const pending = [
            worker.fetch(speechRequest(owner.key, input, false), env, ctxA),
            worker.fetch(speechRequest(joiner.key, input, true), env, ctxB),
        ];
        try {
            await vi.waitFor(() =>
                expect(provider.executions).toBeGreaterThanOrEqual(1),
            );
        } finally {
            provider.release();
        }
        const [a, b] = await Promise.all(pending);
        await waitOnExecutionContext(ctxA);
        await waitOnExecutionContext(ctxB);

        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect((await a.clone().arrayBuffer()).byteLength).toBeGreaterThan(0);
        expect((await b.clone().arrayBuffer()).byteLength).toBeGreaterThan(0);
        // One identical generation: the joiner must not have started its own.
        expect(provider.executions).toBe(1);
        await provider.drain();
    },
    30_000,
);

const timestampsProviderResponse = {
    audio_base64: "SUQz",
    alignment: {
        characters: ["H", "i"],
        character_start_times_seconds: [0, 0.1],
        character_end_times_seconds: [0.1, 0.2],
    },
    normalized_alignment: {
        characters: ["H", "i"],
        character_start_times_seconds: [0, 0.1],
        character_end_times_seconds: [0.1, 0.2],
    },
};

workerTest(
    "shares the timestamped speech cache entry across the stray stream flag",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        let executions = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url = new URL(
                    input instanceof Request ? input.url : String(input),
                );
                if (url.host === "api.elevenlabs.io") {
                    executions++;
                    return Response.json(timestampsProviderResponse);
                }
                if (url.pathname === "/v0/pipes/public_model_stats.json") {
                    return Response.json({ data: [] });
                }
                const handler = tinybird.handlerMap[url.host];
                if (handler) return handler(new Request(input, init));
                throw new Error(
                    `Unexpected outbound request: ${url.host}${url.pathname}`,
                );
            },
        );
        // The DO isolate does not see per-test env overrides, so run the
        // coordinator inline with the ElevenLabs key attached.
        const bindings = withInlineGenerationCoordinator({
            ...env,
            ELEVENLABS_API_KEY: "workers-test-only",
        });
        const input = `wave6-timestamps-${crypto.randomUUID()}`;
        const timestampsRequest = (stream: boolean) =>
            new Request(
                "https://gen.pollinations.ai/v1/audio/speech/with-timestamps",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${owner.key}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "elevenlabs/eleven-flash-v2.5",
                        input,
                        voice: "nova",
                        ...(stream ? { stream: true } : {}),
                    }),
                },
            );

        const ctxPlain = createExecutionContext();
        const plain = await worker.fetch(
            timestampsRequest(false),
            bindings,
            ctxPlain,
        );
        await waitOnExecutionContext(ctxPlain);
        expect(plain.status).toBe(200);
        expect(executions).toBe(1);
        await expect(plain.clone().json()).resolves.toEqual(
            timestampsProviderResponse,
        );
        await vi.waitFor(() => {
            expect(
                tinybird.state.events.some((event) => event.isBilledUsage),
            ).toBe(true);
        });

        // The identical timestamped request with only a stray `stream` body
        // field must reuse the text cache entry, not rerun ElevenLabs.
        const ctxStreamed = createExecutionContext();
        const streamed = await worker.fetch(
            timestampsRequest(true),
            bindings,
            ctxStreamed,
        );
        await waitOnExecutionContext(ctxStreamed);
        expect(streamed.status).toBe(200);
        expect(streamed.headers.get("x-cache")).toBe("HIT");
        expect(executions).toBe(1);
        await expect(streamed.clone().json()).resolves.toEqual(
            timestampsProviderResponse,
        );
    },
    30_000,
);
