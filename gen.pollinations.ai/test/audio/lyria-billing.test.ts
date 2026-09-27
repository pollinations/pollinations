import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect } from "vitest";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

afterEach(teardownFetchMock);

test.for([
    ["google", "GET"],
    ["google", "POST"],
    ["fal", "GET"],
    ["fal", "POST"],
])(
    "Lyria via %s %s settles the Google quote once, including cache retrieval",
    { timeout: 15000 },
    async ([provider, method]) => {
        let submissions = 0;
        const mocks = createFetchMock({
            tinybird: createMockTinybird(),
            lyria: {
                state: {},
                reset: () => {},
                handlerMap: {
                    "generativelanguage.googleapis.com": async () => {
                        if (provider === "fal")
                            return Response.json(
                                { error: { message: "Busy" } },
                                { status: 429 },
                            );
                        submissions++;
                        return Response.json({
                            status: "completed",
                            steps: [
                                {
                                    content: [
                                        {
                                            type: "audio",
                                            mime_type: "audio/mpeg",
                                            data: btoa("ID3test-song"),
                                        },
                                    ],
                                },
                            ],
                        });
                    },
                    "queue.fal.run": async (request: Request) => {
                        if (request.method === "POST") {
                            submissions++;
                            return Response.json({
                                status_url: "https://queue.fal.run/status",
                                response_url: "https://queue.fal.run/result",
                            });
                        }
                        if (new URL(request.url).pathname === "/status")
                            return Response.json({ status: "COMPLETED" });
                        return Response.json(
                            { audio: { url: "https://fal.media/song.mp3" } },
                            { headers: { "x-fal-billable-units": "1" } },
                        );
                    },
                    "fal.media": async () => new Response("ID3test-song"),
                },
            },
        });
        await mocks.enable("tinybird", "lyria");
        const caller = await createTestApiKey({ user: { packBalance: 100 } });
        const db = drizzle(env.DB);
        const before = await getUserBalance(db, caller.userId);
        const input = `Original folk song ${provider} ${method}`;
        const url =
            method === "GET"
                ? `https://gen.pollinations.ai/audio/${encodeURIComponent(input)}?model=google%2Flyria-3.5`
                : "https://gen.pollinations.ai/v1/audio/speech";
        const init = {
            method,
            headers: {
                authorization: `Bearer ${caller.key}`,
                "content-type": "application/json",
            },
            ...(method === "POST"
                ? { body: JSON.stringify({ model: "google/lyria-3.5", input }) }
                : {}),
        };
        const bindings = withInlineGenerationCoordinator({
            ...env,
            GEMINI_API_KEY: "test-gemini",
            FAL_KEY: "test-fal",
        });
        for (let requestIndex = 0; requestIndex < 2; requestIndex++) {
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(url, init),
                bindings,
                ctx,
            );
            const audio = new TextDecoder().decode(
                await response.arrayBuffer(),
            );
            await waitOnExecutionContext(ctx);
            expect(response.status).toBe(200);
            // The coordinator also delivers the original result from durable cache.
            expect(response.headers.get("x-cache")).toBe("HIT");
            expect(audio).toBe("ID3test-song");
            expect(submissions).toBe(1);
        }
        expect(submissions).toBe(1);
        const billed = mocks.tinybird.state.events.filter(
            (event) => event.isBilledUsage,
        );
        expect(billed).toHaveLength(1);
        expect(billed[0]).toMatchObject({
            resolvedModelRequested: "google/lyria-3.5",
            modelProviderUsed: provider,
            tokenCountCompletionAudio: 1,
            tokenPriceCompletionAudio: 0.08,
            totalCost: provider === "fal" ? 0.1 : 0.08,
            totalPrice: 0.08,
        });
        const after = await getUserBalance(db, caller.userId);
        expect(before.packBalance - after.packBalance).toBeCloseTo(0.08, 10);
    },
);

test("Lyria rejects unpaid and model-restricted callers before provider work", async ({
    apiKey,
    restrictedApiKey,
}) => {
    const mocks = createFetchMock({ tinybird: createMockTinybird() });
    await mocks.enable("tinybird");
    for (const [key, status] of [
        [apiKey, 402],
        [restrictedApiKey, 403],
    ] as const) {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    model: "google/lyria-3.5",
                    input: "Original folk song",
                }),
            }),
            env,
            ctx,
        );
        expect(response.status).toBe(status);
        await response.arrayBuffer();
        await waitOnExecutionContext(ctx);
    }
    expect(
        mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
    ).toHaveLength(0);
});
