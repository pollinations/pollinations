import {
    env,
    listDurableObjectIds,
    runInDurableObject,
    SELF,
} from "cloudflare:test";
import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import {
    createTestApiKey,
    test as workerTest,
} from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe.each(["elevenlabs/eleven-v4"] as const)("%s", (model) => {
    workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
        "serves v4 through authenticated speech, simple audio, and timestamps",
        async ({ apiKey }) => {
            const budgetedApiKey = await createTestApiKey({
                user: { packBalance: 100 },
            });
            const paidApiKey = budgetedApiKey.key;
            const input = `Hello 😀 from Pollinations ${crypto.randomUUID()}.`;
            let billedRequests = 0;
            for (const endpoint of [
                "/v1/audio/speech",
                "/v1/audio/speech/with-timestamps",
                "/audio/",
            ]) {
                const simple = endpoint === "/audio/";
                const url = simple
                    ? `https://gen.pollinations.ai/audio/${encodeURIComponent(input)}?model=${model}&voice=george`
                    : `https://gen.pollinations.ai${endpoint}`;
                const init = {
                    method: simple ? "GET" : "POST",
                    headers: {
                        Authorization: `Bearer ${paidApiKey}`,
                        "Content-Type": "application/json",
                    },
                    ...(simple
                        ? {}
                        : {
                              body: JSON.stringify({
                                  model,
                                  input,
                                  voice: "george",
                              }),
                          }),
                };
                const denied = await SELF.fetch(url, {
                    ...init,
                    headers: {
                        ...init.headers,
                        Authorization: `Bearer ${apiKey}`,
                    },
                });
                expect(denied.status).toBe(402);
                await denied.arrayBuffer();
                const response = await SELF.fetch(url, init);
                expect(response.status).toBe(200);
                expect(
                    response.headers.get("x-usage-completion-audio-tokens"),
                ).toBe(String([...input].length));
                const bytes = new Uint8Array(await response.arrayBuffer());
                expect(bytes.byteLength).toBeGreaterThan(1000);
                const cached = await SELF.fetch(url, init);
                expect(cached.status).toBe(200);
                expect(new Uint8Array(await cached.arrayBuffer())).toEqual(
                    bytes,
                );
                billedRequests++;
                const balance = await env.DB.prepare(
                    "SELECT pack_balance FROM user WHERE id = ?",
                )
                    .bind(budgetedApiKey.userId)
                    .first<{ pack_balance: number }>();
                expect(balance?.pack_balance).toBeCloseTo(
                    100 -
                        billedRequests *
                            [...input].length *
                            AUDIO_SERVICES[model].cost.completionAudioTokens,
                    8,
                );
            }
            for (const voice of AUDIO_SERVICES[model].voices) {
                const response = await SELF.fetch(
                    "https://gen.pollinations.ai/v1/audio/speech",
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${paidApiKey}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            model,
                            input: "Hello there.",
                            voice,
                        }),
                    },
                );
                expect(response.status, voice).toBe(200);
                expect(
                    (await response.arrayBuffer()).byteLength,
                ).toBeGreaterThan(1000);
            }
            for (const format of ["mp3", "opus", "aac", "wav", "pcm", "flac"]) {
                for (const endpoint of [
                    "/v1/audio/speech",
                    "/v1/audio/speech/with-timestamps",
                    "/audio/",
                ]) {
                    const simple = endpoint === "/audio/";
                    const url = simple
                        ? `https://gen.pollinations.ai/audio/Hello?model=${model}&voice=george&response_format=${format}`
                        : `https://gen.pollinations.ai${endpoint}`;
                    const response = await SELF.fetch(url, {
                        method: simple ? "GET" : "POST",
                        headers: {
                            Authorization: `Bearer ${paidApiKey}`,
                            "Content-Type": "application/json",
                        },
                        ...(simple
                            ? {}
                            : {
                                  body: JSON.stringify({
                                      model,
                                      input: "Hello",
                                      voice: "george",
                                      response_format: format,
                                  }),
                              }),
                    });
                    expect(response.status, `${endpoint} ${format}`).toBe(
                        format === "flac" ? 400 : 200,
                    );
                    const bytes = await response.arrayBuffer();
                    if (format !== "flac")
                        expect(bytes.byteLength).toBeGreaterThan(1000);
                }
            }
        },
        300000,
    );

    workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
        "rejoins disconnected v4 speech with one wallet debit and completed R2 output",
        async () => {
            const { key, userId } = await createTestApiKey({
                user: { packBalance: 100 },
            });
            const input =
                "This is a durable speech generation check. ".repeat(20) +
                crypto.randomUUID();
            const init = {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ model, input, voice: "george" }),
            };
            const url = "https://gen.pollinations.ai/v1/audio/speech";
            const previous = new Set(
                (await listDurableObjectIds(env.GENERATION_COORDINATOR)).map(
                    String,
                ),
            );
            const abort = new AbortController();
            const first = SELF.fetch(url, {
                ...init,
                signal: abort.signal,
            }).catch((error: Error) => error);
            let job:
                | { cache: { key: string; storage: string }; started: boolean }
                | undefined;
            await vi.waitFor(
                async () => {
                    const ids = await listDurableObjectIds(
                        env.GENERATION_COORDINATOR,
                    );
                    const id = ids.find((id) => !previous.has(String(id)));
                    if (!id) throw new Error("Generation job has not started");
                    job = await runInDurableObject(
                        env.GENERATION_COORDINATOR.get(id),
                        async (_instance, state) => state.storage.get("job"),
                    );
                    expect(job?.started).toBe(true);
                },
                { timeout: 10000, interval: 10 },
            );
            abort.abort();
            expect(await first).toHaveProperty("name", "AbortError");
            const joined = await SELF.fetch(url, init);
            expect(joined.status).toBe(200);
            const bytes = new Uint8Array(await joined.arrayBuffer());
            expect(bytes.byteLength).toBeGreaterThan(1000);
            const cached = await SELF.fetch(url, init);
            expect(cached.status).toBe(200);
            expect(cached.headers.get("x-cache")).toBe("HIT");
            expect(new Uint8Array(await cached.arrayBuffer())).toEqual(bytes);
            expect(job?.cache.storage).toBe("media");
            if (!job) throw new Error("Generation job was not observed");
            expect(await env.MEDIA.has(job.cache.key)).toBe(true);
            const storedAudio = await env.MEDIA.get(job.cache.key);
            if (!storedAudio) throw new Error("Completed R2 audio is missing");
            expect(new Uint8Array(await storedAudio.arrayBuffer())).toEqual(
                bytes,
            );
            const price =
                [...input].length *
                AUDIO_SERVICES[model].cost.completionAudioTokens;
            await vi.waitFor(async () => {
                const balance = await env.DB.prepare(
                    "SELECT pack_balance FROM user WHERE id = ?",
                )
                    .bind(userId)
                    .first<{ pack_balance: number }>();
                expect(balance?.pack_balance).toBeCloseTo(100 - price, 8);
            });
            console.info(
                JSON.stringify({
                    probe: "v4-rejoin",
                    model,
                    userId,
                    characters: [...input].length,
                    price,
                }),
            );
        },
        120000,
    );

    workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
        "validates v4 catalog, errors, and concurrent requests",
        async ({ paidApiKey, restrictedApiKey }) => {
            const headers = {
                Authorization: `Bearer ${paidApiKey}`,
                "Content-Type": "application/json",
            };
            const catalog = await SELF.fetch(
                "https://gen.pollinations.ai/audio/models?community=false",
                { headers },
            );
            expect(catalog.status).toBe(200);
            const models =
                await catalog.json<
                    Array<{
                        name: string;
                        aliases: string[];
                        paid_only: boolean;
                        publisher: string;
                        pricing: Record<string, string>;
                    }>
                >();
            const entry = models.find((entry) => entry.name === model);
            expect(entry).toMatchObject({
                aliases: [],
                paid_only: true,
                publisher: "ElevenLabs",
            });
            expect(Number(entry?.pricing.completionAudioTokens)).toBe(
                AUDIO_SERVICES[model].cost.completionAudioTokens,
            );
            const url = "https://gen.pollinations.ai/v1/audio/speech";
            for (const body of [
                "{",
                JSON.stringify({ model, input: "x".repeat(10001) }),
                JSON.stringify({ model, input: "Hello", voice: "x" }),
            ]) {
                const response = await SELF.fetch(url, {
                    method: "POST",
                    headers,
                    body,
                });
                expect(response.status).toBe(400);
                await response.arrayBuffer();
            }
            const denied = await SELF.fetch(url, {
                method: "POST",
                headers: {
                    ...headers,
                    Authorization: `Bearer ${restrictedApiKey}`,
                },
                body: JSON.stringify({
                    model,
                    input: "Hello",
                    voice: "george",
                }),
            });
            expect(denied.status).toBe(403);
            await denied.arrayBuffer();
            // Exercise three simultaneous cache misses.
            await Promise.all(
                Array.from({ length: 3 }, async (_, i) => {
                    const response = await SELF.fetch(url, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            model,
                            input: `Concurrent speech ${i} ${crypto.randomUUID()}`,
                            voice: "george",
                        }),
                    });
                    expect(response.status).toBe(200);
                    expect(
                        (await response.arrayBuffer()).byteLength,
                    ).toBeGreaterThan(1000);
                }),
            );
        },
        60000,
    );
});
