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

const INPUT_IMAGE_URL = "https://media.example.test/input.png";
const OUTPUT_IMAGE_URL = "https://media.example.test/output.png";
const OUTPUT_VIDEO_URL = "https://media.example.test/output.mp4";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MP4_BYTES = new Uint8Array([
    0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115,
    111, 109,
]);

type ReplicateCall = {
    model: string;
    input: Record<string, unknown>;
};

function createBillingVariantMocks() {
    const replicateState: { calls: ReplicateCall[] } = { calls: [] };
    return createFetchMock({
        tinybird: createMockTinybird(),
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
                    const isQwenImage = match[1].startsWith("qwen/");
                    return Response.json({
                        id: `prediction-${replicateState.calls.length}`,
                        status: "succeeded",
                        output: isQwenImage
                            ? [OUTPUT_IMAGE_URL]
                            : OUTPUT_VIDEO_URL,
                        metrics: isQwenImage
                            ? { predict_time: 1 }
                            : {
                                  predict_time: 1,
                                  video_output_duration_seconds: 5,
                              },
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
                        return new Response(MP4_BYTES, {
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

async function generate(path: string, apiKey: string) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, {
            headers: { authorization: `Bearer ${apiKey}` },
        }),
        env,
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

test("wan-pro-1080p selects text-to-video and image-to-video billing from the real handler input", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "replicate", "media");

    await generate(
        "/image/billing-wan-t2v?model=wan-pro-1080p&duration=5&seed=201",
        paidApiKey,
    );
    await generate(
        `/image/billing-wan-i2v?model=wan-pro-1080p&duration=5&seed=202&image=${encodeURIComponent(INPUT_IMAGE_URL)}`,
        paidApiKey,
    );

    expect(mocks.replicate.state.calls.map(({ model }) => model)).toEqual([
        "wan-video/wan-2.7-t2v",
        "wan-video/wan-2.7-i2v",
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    const [textToVideo, imageToVideo] = mocks.tinybird.state.events;
    expect(textToVideo).toMatchObject({
        modelRequested: "wan-pro-1080p",
        modelUsed: "wan-pro-1080p",
        tokenCountCompletionVideoSeconds: 5,
        tokenPriceCompletionVideoSeconds: 0.1,
        totalCost: 0.5,
        totalPrice: 0.5,
    });
    expect(textToVideo.costVariant).toBeUndefined();
    expect(imageToVideo).toMatchObject({
        modelRequested: "wan-pro-1080p",
        modelUsed: "wan-pro-1080p",
        costVariant: "image_to_video",
        tokenCountCompletionVideoSeconds: 5,
        tokenPriceCompletionVideoSeconds: 0.15,
        totalCost: 0.75,
        totalPrice: 0.75,
    });
});
