import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, expect, it, vi } from "vitest";
import worker from "../src/index.ts";

afterEach(() => vi.restoreAllMocks());

const OUTPUT = Uint8Array.from(
    atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
);

/** Full provider stack: seedream-4.0 over Replicate, optionally held slow. */
function mockReplicate(
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
        if (url.host === "api.replicate.com") {
            executions++;
            await inFlight;
            return Response.json(
                {
                    id: "wave5-stream-test",
                    status: "succeeded",
                    output: ["https://replicate.delivery/wave5.png"],
                },
                { status: 201 },
            );
        }
        if (url.host === "replicate.delivery") {
            return new Response(OUTPUT, {
                headers: { "content-type": "image/png" },
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
            // Let detached settlement (DO alarms, waitUntil billing) finish so
            // no storage is touched after the test ends.
            await vi.waitFor(() => {
                expect(
                    tinybird.state.events.some((event) => event.isBilledUsage),
                ).toBe(true);
            });
        },
    };
}

const imageRequest = (key: string, prompt: string, stream: boolean) =>
    new Request(
        `https://gen.pollinations.ai/image/${prompt}?model=bytedance/seedream-4.0&width=1024&height=1024&seed=1${stream ? "&stream=true" : ""}`,
        { headers: { authorization: `Bearer ${key}` } },
    );

it("coordinates identical media requests that carry a stray stream flag", async () => {
    const owner = await createTestApiKey({ user: { packBalance: 100 } });
    const joiner = await createTestApiKey({ user: { packBalance: 100 } });
    env.REPLICATE_API_TOKEN = "workers-test-only";
    const tinybird = createMockTinybird();
    const provider = mockReplicate(true, tinybird);
    const prompt = `wave5-join-${crypto.randomUUID()}`;

    // Two identical ?stream=true requests racing while the provider is slow:
    // the coordinator must collapse them into one upstream generation.
    const ctxA = createExecutionContext();
    const ctxB = createExecutionContext();
    const pending = [
        worker.fetch(imageRequest(owner.key, prompt, true), env, ctxA),
        worker.fetch(imageRequest(joiner.key, prompt, true), env, ctxB),
    ];
    try {
        await vi.waitFor(() => expect(provider.executions).toBe(1));
    } finally {
        provider.release();
    }
    const [a, b] = await Promise.all(pending);
    await waitOnExecutionContext(ctxA);
    await waitOnExecutionContext(ctxB);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // One identical generation: the joiner must not have started its own.
    expect(provider.executions).toBe(1);
    // Consume the R2-backed bodies so no storage handle outlives the test.
    expect((await a.clone().arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await b.clone().arrayBuffer()).byteLength).toBeGreaterThan(0);
    await provider.drain();
}, 30_000);
