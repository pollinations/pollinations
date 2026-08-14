import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, expect } from "vitest";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const imageBackendHost = "zimage-backend.test";
const falHost = "fal.run";
const falMediaHost = "fal.media";
const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";

afterEach(async () => {
    await teardownFetchMock();
});

function createZImageFallbackMocks() {
    const state = { falRequests: [] as Record<string, unknown>[] };
    return createFetchMock({
        tinybird: createMockTinybird(),
        zimageBackend: {
            state: {},
            handlerMap: {
                [imageBackendHost]: async () =>
                    new Response("queue full", { status: 503 }),
            },
            reset: () => {},
        },
        fal: {
            state,
            handlerMap: {
                [falHost]: async (request: Request) => {
                    state.falRequests.push(
                        (await request.json()) as Record<string, unknown>,
                    );
                    return Response.json({
                        images: [
                            {
                                url: `https://${falMediaHost}/output.png`,
                                content_type: "image/png",
                                width: 1024,
                                height: 1024,
                            },
                        ],
                        seed: 42,
                        has_nsfw_concepts: [false],
                    });
                },
                [falMediaHost]: async () =>
                    new Response(Buffer.from(png1x1Base64, "base64"), {
                        headers: { "content-type": "image/png" },
                    }),
            },
            reset: () => {
                state.falRequests = [];
            },
        },
    });
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createZImageFallbackMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        env.FAL_KEY = "fal-test-key";
        const mocks = createZImageFallbackMocks();
        await use(mocks);
    },
});

async function fetchWorker(path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    return { response, wait: () => waitOnExecutionContext(ctx) };
}

test("uses Fal only after the Vast Z-Image pool exhausts its 503s", async ({
    paidApiKey,
    mocks,
}) => {
    const existing = await env.KV.list({ prefix: "image:server:test:zimage:" });
    await Promise.all(existing.keys.map((key) => env.KV.delete(key.name)));

    const { response: registerResponse } = await fetchWorker("/register", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.PLN_GPU_TOKEN}`,
        },
        body: JSON.stringify({
            url: `https://${imageBackendHost}`,
            type: "zimage",
        }),
    });
    expect(registerResponse.status).toBe(200);
    await mocks.enable("tinybird", "zimageBackend", "fal");

    const { response, wait } = await fetchWorker(
        "/image/a%20red%20apple?model=zimage&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    const failureBody =
        response.status === 200 ? "" : await response.clone().text();
    expect(response.status, failureBody).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("zimage-fal");
    expect(response.headers.get("x-fallback-target")).toBe("config.targets[1]");
    await response.arrayBuffer();
    expect(mocks.fal.state.falRequests).toEqual([
        {
            prompt: "a red apple",
            image_size: { width: 1024, height: 1024 },
            num_inference_steps: 4,
            seed: 42,
            num_images: 1,
            output_format: "jpeg",
            enable_prompt_expansion: false,
        },
    ]);
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "zimage",
        modelUsed: "Tongyi-MAI/Z-Image-Turbo",
        modelProviderUsed: "vast",
        responseStatus: 503,
        isFinal: false,
        isBilledUsage: false,
    });
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        modelRequested: "zimage",
        modelUsed: "zimage-fal",
        modelProviderUsed: "fal",
        responseStatus: 200,
        fallbackUsed: true,
        totalPrice: 0.004,
        isFinal: true,
        isBilledUsage: true,
    });
    expect(mocks.tinybird.state.events[1].totalCost).toBeCloseTo(
        1.048576 * 0.005,
        10,
    );
});
