import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/image/utils/imageDownload", () => ({
    downloadUserImage: async () => ({
        buffer: Buffer.from("test", "utf8"),
        mimeType: "image/jpeg",
    }),
}));

import { syncImageEnvironment } from "../../src/image/handler.ts";
import {
    callSeedreamAPI,
    callSeedreamProAPI,
} from "../../src/image/models/seedreamReplicateModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import type { ProgressManager } from "../../src/image/progressBar.ts";

const asProgress = (m: ReturnType<typeof makeProgress>) =>
    m as unknown as ProgressManager;

interface ReplicateRequest {
    url: string;
    body: Record<string, unknown>;
}

const REPLICATE_IMAGE_URL = "https://replicate.delivery/x/seedream-output.png";

function mockReplicateFetch(requests: ReplicateRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === REPLICATE_IMAGE_URL) {
                return new Response(
                    new TextEncoder().encode("png-bytes").buffer,
                    { status: 200 },
                );
            }
            const body = init?.body
                ? (JSON.parse(init.body as string) as Record<string, unknown>)
                : {};
            requests.push({ url: href, body });
            return new Response(
                JSON.stringify({
                    id: "pred_seedream_test",
                    status: "succeeded",
                    output: [REPLICATE_IMAGE_URL],
                    metrics: { predict_time: 5 },
                }),
                { status: 201 },
            );
        });
}

const makeProgress = () => ({
    updateBar: vi.fn(),
    finishBar: vi.fn(),
    removeBar: vi.fn(),
});

const baseParams: ImageParams = {
    model: "seedream",
    width: 1024,
    height: 1024,
    seed: 42,
    enhance: false,
    negative_prompt: "",
    nofeed: false,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 0,
};

beforeEach(() => {
    syncImageEnvironment({
        ...env,
        REPLICATE_API_TOKEN: "r8_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("seedreamReplicateModel - seedream 4.0", () => {
    it("posts to bytedance/seedream-4 with size resolved from dimensions", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        await callSeedreamAPI(
            "test prompt",
            baseParams,
            asProgress(makeProgress()),
            "req-seedream-1",
        );

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/bytedance/seedream-4/predictions",
        );
        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.prompt).toBe("test prompt");
        // 1024px → "1K" bucket on seedream-4
        expect(input.size).toBe("1K");
        expect(input.aspect_ratio).toBe("1:1");
        expect(input.image_input).toEqual([]);
        expect(input.sequential_image_generation).toBe("disabled");
        expect(input.max_images).toBe(1);
        // seed must NOT be sent — Replicate seedream-4 silently drops it,
        // seedream-4.5 strict-rejects unknown fields.
        expect(input.seed).toBeUndefined();
    });

    it("returns seedream as actualModel", async () => {
        mockReplicateFetch([]);

        const result = await callSeedreamAPI(
            "test prompt",
            baseParams,
            asProgress(makeProgress()),
            "req-seedream-2",
        );

        expect(result.trackingData?.actualModel).toBe("seedream");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });

    it("rejects more than 10 reference images", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = {
            ...baseParams,
            image: Array.from(
                { length: 11 },
                (_, i) => `https://example.com/${i}.jpg`,
            ),
        };

        await expect(
            callSeedreamAPI(
                "test",
                params,
                asProgress(makeProgress()),
                "req-seedream-overflow",
            ),
        ).rejects.toMatchObject({ status: 400 });
    });
});

describe("seedreamReplicateModel - seedream-pro 4.5", () => {
    it("posts to bytedance/seedream-4.5 with size resolved from dimensions", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream-pro",
            width: 2048,
            height: 2048,
        };
        await callSeedreamProAPI(
            "test prompt",
            params,
            asProgress(makeProgress()),
            "req-seedream-pro-1",
        );

        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/bytedance/seedream-4.5/predictions",
        );
        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        // 2048px → "2K" bucket on seedream-4.5
        expect(input.size).toBe("2K");
    });

    it("routes reference images as data URIs in image_input", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream-pro",
            image: ["https://example.com/ref.jpg"],
        };
        await callSeedreamProAPI(
            "test prompt",
            params,
            asProgress(makeProgress()),
            "req-seedream-pro-i2i",
        );

        // The Replicate POST is the request with a JSON body; example.com may
        // be fetched first by downloadUserImage. Find the Replicate POST.
        const post = requests.find((r) =>
            r.url.includes(
                "api.replicate.com/v1/models/bytedance/seedream-4.5",
            ),
        );
        if (!post) throw new Error("Replicate POST not captured");
        const input = (post.body as { input: Record<string, unknown> }).input;
        expect(Array.isArray(input.image_input)).toBe(true);
        expect((input.image_input as string[])[0]).toMatch(
            /^data:image\/jpeg;base64,/,
        );
        // aspect_ratio defaults to match_input_image when an image is provided
        expect(input.aspect_ratio).toBe("match_input_image");
    });

    it("returns seedream-pro as actualModel", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = { ...baseParams, model: "seedream-pro" };
        const result = await callSeedreamProAPI(
            "test prompt",
            params,
            asProgress(makeProgress()),
            "req-seedream-pro-2",
        );

        expect(result.trackingData?.actualModel).toBe("seedream-pro");
    });
});

describe("seedreamReplicateModel - aspect ratio mapping", () => {
    it("rejects unsupported aspect ratio 9:21 with 400", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = {
            ...baseParams,
            aspectRatio: "9:21",
        } as ImageParams;

        await expect(
            callSeedreamAPI(
                "test",
                params,
                asProgress(makeProgress()),
                "req-aspect-bad",
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("maps 'adaptive' to match_input_image", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            aspectRatio: "adaptive",
        } as ImageParams;
        await callSeedreamAPI(
            "test",
            params,
            asProgress(makeProgress()),
            "req-aspect-adaptive",
        );

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.aspect_ratio).toBe("match_input_image");
    });
});
