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
import { syncImageEnv } from "../../src/image/env.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const INPUT_IMAGE_URL = "https://media.example.test/input.png";
const OUTPUT_IMAGE_URL = "https://media.example.test/output.png";
const OUTPUT_VIDEO_URL = "https://media.example.test/output.mp4";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type ReplicateCall = {
    model: string;
    input: Record<string, unknown>;
};

function createBillingVariantMocks() {
    const replicateState: { calls: ReplicateCall[] } = { calls: [] };
    const openRouterState: { calls: Record<string, unknown>[] } = { calls: [] };
    return createFetchMock({
        tinybird: createMockTinybird(),
        openrouter: {
            state: openRouterState,
            handlerMap: {
                "openrouter.ai": async (request: Request) => {
                    openRouterState.calls.push(
                        (await request.json()) as Record<string, unknown>,
                    );
                    return Response.json({
                        data: [
                            {
                                b64_json:
                                    Buffer.from(PNG_BYTES).toString("base64"),
                                media_type: "image/png",
                            },
                        ],
                        usage: { cost: 0.06 },
                    });
                },
            },
            reset: () => {
                openRouterState.calls = [];
            },
        },
        replicate: {
            state: replicateState,
            handlerMap: {
                "api.replicate.com": async (request: Request) => {
                    const match = new URL(request.url).pathname.match(
                        /^\/v1\/models\/(.+)\/predictions$/,
                    );
                    if (!match) {
                        return new Response("unexpected Replicate URL", {
                            status: 404,
                        });
                    }
                    const body = (await request.json()) as {
                        input: Record<string, unknown>;
                    };
                    replicateState.calls.push({
                        model: match[1],
                        input: body.input,
                    });
                    const isVideo = match[1] === "prunaai/p-video";
                    return Response.json({
                        id: `prediction-${replicateState.calls.length}`,
                        status: "succeeded",
                        output: isVideo ? OUTPUT_VIDEO_URL : [OUTPUT_IMAGE_URL],
                        metrics: isVideo
                            ? {
                                  predict_time: 1,
                                  video_output_duration_seconds: 5,
                              }
                            : { predict_time: 1 },
                    });
                },
            },
            reset: () => {
                replicateState.calls = [];
            },
        },
        media: {
            state: {},
            handlerMap: {
                "media.example.test": async (request: Request) => {
                    const pathname = new URL(request.url).pathname;
                    if (pathname.endsWith(".png")) {
                        return new Response(PNG_BYTES, {
                            headers: { "content-type": "image/png" },
                        });
                    }
                    if (pathname.endsWith(".mp4")) {
                        return new Response(new Uint8Array([0, 0, 0, 24]), {
                            headers: { "content-type": "video/mp4" },
                        });
                    }
                    return new Response("unexpected media URL", {
                        status: 404,
                    });
                },
            },
            reset: () => {},
        },
    });
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createBillingVariantMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        syncImageEnv(
            { REPLICATE_API_TOKEN: "replicate-test-key" } as CloudflareBindings,
            ["REPLICATE_API_TOKEN"],
        );
        await use(createBillingVariantMocks());
    },
});

afterEach(async () => {
    await teardownFetchMock();
});

async function generate(path: string, apiKey: string, init?: RequestInit) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, {
            ...init,
            headers: {
                ...init?.headers,
                authorization: `Bearer ${apiKey}`,
            },
        }),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    const failureBody =
        response.status === 200 ? "" : await response.clone().text();
    expect(response.status, failureBody).toBe(200);
    await response.arrayBuffer();
    await waitOnExecutionContext(ctx);
}

test("qwen-image selects text-to-image and edit billing from the real handler input", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "replicate", "media");

    await generate(
        "/image/billing-qwen-t2i?model=qwen-image&seed=101",
        paidApiKey,
    );
    await generate(
        `/image/billing-qwen-edit?model=qwen-image&seed=102&image=${encodeURIComponent(INPUT_IMAGE_URL)}`,
        paidApiKey,
    );

    expect(mocks.replicate.state.calls.map(({ model }) => model)).toEqual([
        "qwen/qwen-image",
        "qwen/qwen-image-edit-plus",
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    const [textToImage, edit] = mocks.tinybird.state.events;
    expect(textToImage).toMatchObject({
        modelRequested: "qwen-image",
        modelUsed: "qwen-image",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.025,
        totalCost: 0.025,
        totalPrice: 0.025,
    });
    expect(textToImage.costVariant).toBeUndefined();
    expect(edit).toMatchObject({
        modelRequested: "qwen-image",
        modelUsed: "qwen-image-edit",
        costVariant: "edit",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.03,
        totalCost: 0.03,
        totalPrice: 0.03,
    });
});

test("p-video sends the selected resolution upstream and bills its variant", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "replicate", "media");

    await generate(
        "/image/billing-pvideo?model=p-video&resolution=1080p&duration=5&seed=103",
        paidApiKey,
    );

    expect(mocks.replicate.state.calls).toHaveLength(1);
    expect(mocks.replicate.state.calls[0]).toMatchObject({
        model: "prunaai/p-video",
        input: { resolution: "1080p", duration: 5 },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "p-video",
        modelUsed: "p-video",
        costVariant: "1080p",
        tokenCountCompletionVideoSeconds: 5,
        tokenPriceCompletionVideoSeconds: 0.04,
        totalCost: 0.2,
        totalPrice: 0.2,
    });
});

test("Grok Imagine Image 2.0 forwards and bills its quality-resolution tier", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "openrouter");
    syncImageEnv(
        { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
        ["OPENROUTER_API_KEY"],
    );

    await generate("/v1/images/edits", paidApiKey, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "grok-imagine-image-2.0",
            prompt: "billing-grok-image-2",
            image: INPUT_IMAGE_URL,
            quality: "low",
            resolution: "2k",
            seed: 104,
        }),
    });

    expect(mocks.openrouter.state.calls).toEqual([
        expect.objectContaining({
            model: "x-ai/grok-imagine-image-2.0",
            quality: "low",
            resolution: "2K",
            provider: { only: ["xai"], allow_fallbacks: false },
            input_references: [
                {
                    type: "image_url",
                    image_url: { url: INPUT_IMAGE_URL },
                },
            ],
        }),
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "grok-imagine-image-2.0",
        modelUsed: "grok-imagine-image-2.0",
        costVariant: "low_2k",
        tokenCountPromptImage: 1,
        tokenPricePromptImage: 0.01,
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.06,
        totalCost: expect.closeTo(0.07, 8),
        totalPrice: 0.07,
    });
});
