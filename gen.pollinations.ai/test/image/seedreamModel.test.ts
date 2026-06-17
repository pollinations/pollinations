import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/image/utils/imageDownload", () => ({
    downloadUserImage: async () => ({
        buffer: Buffer.from("test", "utf8"),
        mimeType: "image/jpeg",
    }),
}));

import { syncImageEnvironment } from "../../src/image/handler.ts";
import { callSeedream5API } from "../../src/image/models/seedream5ReplicateModel.ts";
import {
    callSeedreamAPI,
    callSeedreamProAPI,
} from "../../src/image/models/seedreamReplicateModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

interface ReplicateRequest {
    url: string;
    body: Record<string, unknown>;
}

const REPLICATE_IMAGE_URL = "https://replicate.delivery/x/seedream-output.png";
const REFERENCE_IMAGE_URL = "https://example.com/ref.jpg";

function mockReplicateFetch(requests: ReplicateRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === REFERENCE_IMAGE_URL) {
                return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
                    status: 200,
                    headers: { "content-type": "image/jpeg" },
                });
            }
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

const baseParams: ImageParams = {
    model: "seedream",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
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

        await callSeedreamAPI("test prompt", baseParams);

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
        // output_format is seedream5-only — must NOT leak into the 4.0 payload.
        expect(input.output_format).toBeUndefined();
    });

    it("returns seedream as actualModel", async () => {
        mockReplicateFetch([]);

        const result = await callSeedreamAPI("test prompt", baseParams);

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

        await expect(callSeedreamAPI("test", params)).rejects.toMatchObject({
            status: 400,
        });
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
        await callSeedreamProAPI("test prompt", params);

        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/bytedance/seedream-4.5/predictions",
        );
        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        // 2048px → "2K" bucket on seedream-4.5
        expect(input.size).toBe("2K");
        // 4.5 strict-rejects unknown fields — output_format must stay opt-in
        // (seedream5 only).
        expect(input.output_format).toBeUndefined();
    });

    it("routes reference images as data URIs in image_input", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream-pro",
            image: [REFERENCE_IMAGE_URL],
        };
        await callSeedreamProAPI("test prompt", params);

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
        const result = await callSeedreamProAPI("test prompt", params);

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

        await expect(callSeedreamAPI("test", params)).rejects.toMatchObject({
            status: 400,
        });
    });

    it("maps 'adaptive' to match_input_image", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            aspectRatio: "adaptive",
        } as ImageParams;
        await callSeedreamAPI("test", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.aspect_ratio).toBe("match_input_image");
    });

    it("derives aspect_ratio from width/height when not explicitly set", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        // 1792×1024 reaches us via OpenAI `size:"1792x1024"` with no
        // aspectRatio — must NOT silently default to 1:1.
        const params: ImageParams = {
            ...baseParams,
            width: 1792,
            height: 1024,
        };
        await callSeedreamAPI("test", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.aspect_ratio).toBe("16:9");
    });

    it("derives portrait aspect ratio from tall dimensions", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            width: 720,
            height: 1280,
        };
        await callSeedreamAPI("test", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.aspect_ratio).toBe("9:16");
    });
});

describe("seedreamReplicateModel - seedream 4.0 custom-size mode", () => {
    it("uses size:custom + width/height when dimensions are explicit (T2I)", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            width: 1792,
            height: 1024,
            dimensionsExplicit: true,
        };
        await callSeedreamAPI("test prompt", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.size).toBe("custom");
        expect(input.width).toBe(1792);
        expect(input.height).toBe(1024);
        // aspect_ratio must NOT be sent when size is "custom" — Replicate
        // ignores it in that mode and the discriminated union forbids both.
        expect(input.aspect_ratio).toBeUndefined();
    });

    it("uses size:custom for one-sided dimensions (width-only, height defaulted)", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        // Simulates `?width=1536` — schema fills height with model default
        // (1024) but dimensionsExplicit stays true because width was set.
        const params: ImageParams = {
            ...baseParams,
            width: 1536,
            height: 1024,
            dimensionsExplicit: true,
        };
        await callSeedreamAPI("test", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.size).toBe("custom");
        expect(input.width).toBe(1536);
        expect(input.height).toBe(1024);
    });

    it("uses size:custom for I2I when dimensions are explicit", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            width: 1792,
            height: 1024,
            dimensionsExplicit: true,
            image: [REFERENCE_IMAGE_URL],
        };
        await callSeedreamAPI("test", params);

        const post = requests.find((r) =>
            r.url.includes("api.replicate.com/v1/models/bytedance/seedream-4/"),
        );
        if (!post) throw new Error("Replicate POST not captured");
        const input = (post.body as { input: Record<string, unknown> }).input;
        expect(input.size).toBe("custom");
        expect(input.width).toBe(1792);
        expect(input.height).toBe(1024);
    });

    it("falls back to match_input_image for I2I without explicit dimensions", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            image: [REFERENCE_IMAGE_URL],
            // dimensionsExplicit defaults to false in baseParams
        };
        await callSeedreamAPI("test", params);

        const post = requests.find((r) =>
            r.url.includes("api.replicate.com/v1/models/bytedance/seedream-4/"),
        );
        if (!post) throw new Error("Replicate POST not captured");
        const input = (post.body as { input: Record<string, unknown> }).input;
        expect(input.size).not.toBe("custom");
        expect(input.aspect_ratio).toBe("match_input_image");
    });

    it("rejects out-of-range custom dimensions with 400", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = {
            ...baseParams,
            width: 800, // below 1024 minimum
            height: 1024,
            dimensionsExplicit: true,
        };

        await expect(callSeedreamAPI("test", params)).rejects.toMatchObject({
            status: 400,
        });
    });

    it("seedream-pro (4.5) ignores dimensionsExplicit — no custom mode", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream-pro",
            width: 1792,
            height: 1024,
            dimensionsExplicit: true,
        };
        await callSeedreamProAPI("test", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        // 4.5's size enum is only ["2K","4K"] — must stay on preset path
        // and derive aspect_ratio from the dimensions.
        expect(input.size).not.toBe("custom");
        expect(input.size).toBe("2K");
        expect(input.aspect_ratio).toBe("16:9");
        expect(input.width).toBeUndefined();
        expect(input.height).toBeUndefined();
    });
});

describe("seedreamReplicateModel - seedream5 5.0 Lite", () => {
    it("posts to bytedance/seedream-5-lite with size 2K at <=2048px and output_format png", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream5",
            width: 2048,
            height: 2048,
        };
        await callSeedream5API("test prompt", params);

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/bytedance/seedream-5-lite/predictions",
        );
        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        // 2048px is the boundary — stays in the "2K" bucket.
        expect(input.size).toBe("2K");
        expect(input.output_format).toBe("png");
        expect(input.sequential_image_generation).toBe("disabled");
        expect(input.max_images).toBe(1);
        // 5.0 has no custom-size mode — never sends size:"custom" or raw px.
        expect(input.size).not.toBe("custom");
        expect(input.width).toBeUndefined();
        expect(input.height).toBeUndefined();
    });

    it("resolves size 3K when the longer side exceeds 2048px", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream5",
            width: 4096,
            height: 2048,
        };
        await callSeedream5API("test prompt", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.size).toBe("3K");
    });

    it("ignores dimensionsExplicit — no custom-size branch for 5.0", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream5",
            width: 1792,
            height: 1024,
            dimensionsExplicit: true,
        };
        await callSeedream5API("test", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        // 5.0's size enum is only ["2K","3K"] — must stay on the preset path
        // and derive aspect_ratio from the dimensions.
        expect(input.size).not.toBe("custom");
        expect(input.size).toBe("2K");
        expect(input.aspect_ratio).toBe("16:9");
        expect(input.width).toBeUndefined();
        expect(input.height).toBeUndefined();
        expect(input.output_format).toBe("png");
    });

    it("rejects more than 14 reference images", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = {
            ...baseParams,
            model: "seedream5",
            image: Array.from(
                { length: 15 },
                (_, i) => `https://example.com/${i}.jpg`,
            ),
        };

        await expect(callSeedream5API("test", params)).rejects.toMatchObject({
            status: 400,
        });
    });

    it("returns seedream5 as actualModel", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = { ...baseParams, model: "seedream5" };
        const result = await callSeedream5API("test prompt", params);

        expect(result.trackingData?.actualModel).toBe("seedream5");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });
});
