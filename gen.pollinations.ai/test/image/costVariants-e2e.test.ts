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
import { afterEach, expect, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const bedrockMocks = vi.hoisted(() => ({
    calls: [] as Record<string, unknown>[],
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
    BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
        send: vi.fn().mockImplementation(async (command) => {
            bedrockMocks.calls.push(JSON.parse(command.body));
            return {
                body: new TextEncoder().encode(
                    JSON.stringify({ images: ["iVBORw0KGgo="] }),
                ),
            };
        }),
    })),
    InvokeModelCommand: vi.fn().mockImplementation((input) => input),
}));

vi.mock("@smithy/fetch-http-handler", () => ({
    FetchHttpHandler: vi.fn(),
}));

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
    const falState = { submissions: 0 };
    return createFetchMock({
        fal: {
            state: falState,
            handlerMap: {
                "api.fal.ai": async (request: Request) =>
                    Response.json({
                        prices: [
                            {
                                endpoint_id: new URL(
                                    request.url,
                                ).searchParams.get("endpoint_id"),
                                unit: "seconds",
                                currency: "USD",
                                unit_price: 0.05,
                            },
                        ],
                    }),
                "queue.fal.run": async (request: Request) => {
                    if (request.method === "POST") {
                        falState.submissions++;
                        return Response.json({
                            status_url: "https://queue.fal.run/test/status",
                            response_url: "https://queue.fal.run/test/result",
                        });
                    }
                    if (request.url.endsWith("/status"))
                        return Response.json({ status: "COMPLETED" });
                    return Response.json(
                        { video: { url: OUTPUT_VIDEO_URL } },
                        { headers: { "x-fal-billable-units": "21.28" } },
                    );
                },
            },
            reset: () => {
                falState.submissions = 0;
            },
        },
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
            {
                REPLICATE_API_TOKEN: "replicate-test-key",
                FAL_KEY: "fal-test-key",
            } as CloudflareBindings,
            ["REPLICATE_API_TOKEN", "FAL_KEY"],
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
    return response;
}

test("qwen-image selects text-to-image and edit billing from the real handler input", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "replicate", "media");

    await generate(
        "/image/billing-qwen-t2i?model=qwen/qwen-image&seed=101",
        paidApiKey,
    );
    await generate(
        `/image/billing-qwen-edit?model=qwen/qwen-image&seed=102&image=${encodeURIComponent(INPUT_IMAGE_URL)}`,
        paidApiKey,
    );

    expect(mocks.replicate.state.calls.map(({ model }) => model)).toEqual([
        "qwen/qwen-image",
        "qwen/qwen-image-edit-plus",
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    const [textToImage, edit] = mocks.tinybird.state.events;
    expect(textToImage).toMatchObject({
        modelRequested: "qwen/qwen-image",
        modelUsed: "qwen/qwen-image",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.025,
        totalCost: 0.025,
        totalPrice: 0.025,
    });
    expect(textToImage.costVariant).toBeUndefined();
    expect(edit).toMatchObject({
        modelRequested: "qwen/qwen-image",
        modelUsed: "qwen/qwen-image",
        costVariant: "edit",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.03,
        totalCost: 0.03,
        totalPrice: 0.03,
    });
});

test("nova-canvas bills the final dimensions sent to Bedrock", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    bedrockMocks.calls = [];

    await generate(
        "/image/billing-nova-low?model=nova-canvas&width=1025&height=1024&seed=105",
        paidApiKey,
    );
    await generate(
        "/image/billing-nova-high?model=nova-canvas&width=1008&height=1040&seed=106",
        paidApiKey,
    );

    expect(
        bedrockMocks.calls.map((call) => call.imageGenerationConfig),
    ).toEqual([
        expect.objectContaining({ width: 1024, height: 1024 }),
        expect.objectContaining({ width: 1008, height: 1040 }),
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "nova-canvas",
        modelUsed: "amazon/nova-canvas-v1",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.04,
        totalCost: 0.04,
        totalPrice: 0.04,
    });
    expect(mocks.tinybird.state.events[0].costVariant).toBeUndefined();
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        modelRequested: "nova-canvas",
        modelUsed: "amazon/nova-canvas-v1",
        costVariant: "2048",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.06,
        totalCost: 0.06,
        totalPrice: 0.06,
    });
});

test("p-video sends the selected resolution upstream and bills its variant", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "replicate", "media");

    await generate(
        "/image/billing-pvideo?model=prunaai/p-video&resolution=1080p&duration=5&seed=103",
        paidApiKey,
    );

    expect(mocks.replicate.state.calls).toHaveLength(1);
    expect(mocks.replicate.state.calls[0]).toMatchObject({
        model: "prunaai/p-video",
        input: { resolution: "1080p", duration: 5 },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "prunaai/p-video",
        modelUsed: "prunaai/p-video",
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
        modelUsed: "x-ai/grok-imagine-image-2.0",
        costVariant: "low_2k",
        tokenCountPromptImage: 1,
        tokenPricePromptImage: 0.01 * 1.055,
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.06 * 1.055,
        totalCost: expect.closeTo(0.07 * 1.055, 8),
        totalPrice: 0.07385,
    });
});

test("H3 Max bills reference provider units without inflating video duration", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "fal", "media");
    const response = await generate(
        `/image/h3-max-reference-billing?model=minimax/minimax-h3-max&seed=15392&duration=5&resolution=768p&reference_videos=${encodeURIComponent(OUTPUT_VIDEO_URL)}`,
        paidApiKey,
    );
    expect(response.headers.get("x-usage-provider-billable-units")).toBe(
        "21.28",
    );
    expect(response.headers.get("x-usage-provider-unit-cost")).toBe("0.05");
    expect(mocks.fal.state.submissions).toBe(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelUsed: "minimax/minimax-h3-max",
        costVariant: "768p",
        tokenCountCompletionVideoSeconds: 5,
        totalCost: 1.064,
        totalPrice: 1.064,
        adjustmentCosts: { "fal.minimax_h3_max.provider_units.v1": 1.064 },
        adjustmentUnits: { "fal.minimax_h3_max.provider_units.v1": 21.28 },
        isBilledUsage: true,
    });
});
