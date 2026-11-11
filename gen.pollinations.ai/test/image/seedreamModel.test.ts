import { env } from "cloudflare:test";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/image/utils/imageDownload", () => {
    const buffer = Buffer.from("test", "utf8");
    const mimeType = "image/jpeg";
    return {
        downloadUserImage: async () => ({ buffer, mimeType }),
        toDataUri: async () =>
            `data:${mimeType};base64,${buffer.toString("base64")}`,
    };
});

import { syncImageEnvironment } from "../../src/image/handler.ts";
import { callSeedream5API } from "../../src/image/models/seedream5ReplicateModel.ts";
import {
    callSeedream5ProAPI,
    callSeedreamAPI,
} from "../../src/image/models/seedreamReplicateModel.ts";
import { callSeedream5ProVercelAPI } from "../../src/image/models/seedreamVercelModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

interface ReplicateRequest {
    url: string;
    body: Record<string, unknown>;
}

const REPLICATE_IMAGE_URL = "https://replicate.delivery/x/seedream-output.png";
const INPUT_IMAGE_URL = "https://example.com/ref.jpg";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);

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
            if (href === INPUT_IMAGE_URL) {
                return new Response(JPEG_BYTES, { status: 200 });
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
    model: "bytedance/seedream-4.0",
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
        AI_GATEWAY_API_KEY: "test-gateway-key",
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

        expect(result.trackingData?.actualModel).toBe("bytedance/seedream-4.0");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });
});

describe("seedreamReplicateModel - aspect ratio mapping", () => {
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
            image: [INPUT_IMAGE_URL],
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
            image: [INPUT_IMAGE_URL],
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
});

describe("seedreamReplicateModel - seedream5 5.0 Lite", () => {
    it("posts to bytedance/seedream-5-lite with size 2K at <=2048px and output_format png", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "bytedance/seedream-5.0-lite",
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
            model: "bytedance/seedream-5.0-lite",
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
            model: "bytedance/seedream-5.0-lite",
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

    it("returns seedream5 as actualModel", async () => {
        mockReplicateFetch([]);

        const params: ImageParams = {
            ...baseParams,
            model: "bytedance/seedream-5.0-lite",
        };
        const result = await callSeedream5API("test prompt", params);

        expect(result.trackingData?.actualModel).toBe(
            "bytedance/seedream-5.0-lite",
        );
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });
});

describe("seedreamReplicateModel - seedream5 5.0 Pro", () => {
    it("attributes the Replicate backup to its own route while retaining the Vercel quote", async () => {
        mockReplicateFetch([]);
        const model = "bytedance/seedream-5.0-pro:replicate";
        const result = await callSeedream5ProAPI("test", {
            ...baseParams,
            model,
        });
        expect(result.trackingData.actualModel).toBe(model);
        const billed = calculateUsageBilling({
            model: "bytedance/seedream-5.0-pro",
            usage: result.trackingData.usage,
            servedBy: IMAGE_SERVICES[model],
            quotedBy: IMAGE_SERVICES["bytedance/seedream-5.0-pro"],
        });
        expect(billed.cost.totalCost).toBe(0.09);
        expect(billed.price.totalPrice).toBe(0.035);
    });
    it("posts to bytedance/seedream-5-pro with paid pro tracking label", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "bytedance/seedream-5.0-pro",
            width: 2048,
            height: 2048,
        };
        const result = await callSeedream5ProAPI("test prompt", params);

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/bytedance/seedream-5-pro/predictions",
        );
        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.size).toBe("2K");
        expect(input.output_format).toBe("png");
        expect(input.sequential_image_generation).toBe("disabled");
        expect(input.max_images).toBe(1);
        expect(result.trackingData?.actualModel).toBe(
            "bytedance/seedream-5.0-pro",
        );
    });

    it("always requests the 2K tier that matches static registry pricing", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const params: ImageParams = {
            ...baseParams,
            model: "bytedance/seedream-5.0-pro",
            width: 1024,
            height: 1024,
        };
        await callSeedream5ProAPI("test prompt", params);

        const input = (requests[0].body as { input: Record<string, unknown> })
            .input;
        expect(input.size).toBe("2K");
    });
});

describe("Seedream 5 Pro via Vercel", () => {
    function mockGateway(cost: unknown = "0.035") {
        return vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                images: [Buffer.from(JPEG_BYTES).toString("base64")],
                providerMetadata: { gateway: { cost } },
            }),
        );
    }

    it.each([
        [undefined, 1024, 1024, "2000x2000"],
        [undefined, 1920, 1080, "2672x1504"],
        ["9:16", 1024, 1024, "1504x2672"],
    ] as const)(
        "preserves the 2K canvas for ratio %s and dimensions %sx%s",
        async (aspectRatio, width, height, size) => {
            const fetch = mockGateway();
            await callSeedream5ProVercelAPI("test", {
                ...baseParams,
                model: "bytedance/seedream-5.0-pro",
                aspectRatio,
                width,
                height,
            });
            const [url, init] = fetch.mock.calls[0];
            expect(url).toBe("https://ai-gateway.vercel.sh/v4/ai/image-model");
            expect(new Headers(init?.headers).get("ai-model-id")).toBe(
                "bytedance/seedream-5.0-pro",
            );
            expect(JSON.parse(init?.body as string)).toMatchObject({
                n: 1,
                size,
                providerOptions: {
                    gateway: { only: ["bytedance"] },
                    bytedance: { watermark: false },
                },
            });
            expect(JSON.parse(init?.body as string)).not.toHaveProperty(
                "aspectRatio",
            );
        },
    );

    it("preserves all ten references and matches the first image's aspect ratio", async () => {
        const fetch = mockGateway();
        const png = Buffer.alloc(24);
        png.set([137, 80, 78, 71, 13, 10, 26, 10]);
        png.writeUInt32BE(1024, 16);
        png.writeUInt32BE(512, 20);
        const reference = `data:image/png;base64,${png.toString("base64")}`;
        await callSeedream5ProVercelAPI("edit", {
            ...baseParams,
            model: "bytedance/seedream-5.0-pro",
            image: Array.from({ length: 10 }, () => reference),
            aspectRatio: "adaptive",
        });
        const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
        expect(body.files).toHaveLength(10);
        expect(body.files[0]).toMatchObject({
            type: "file",
            mediaType: "image/png",
        });
        expect(body.size).toBe("2832x1408");
    });

    it("settles the complete reported charge rather than reconstructing it from the quote", async () => {
        mockGateway("0.037");
        const model = "bytedance/seedream-5.0-pro";
        const result = await callSeedream5ProVercelAPI("test", {
            ...baseParams,
            model,
        });
        const billed = calculateUsageBilling({
            model,
            usage: result.trackingData.usage,
            servedBy: IMAGE_SERVICES[model],
            input: { providerBilling: result.trackingData.providerBilling },
        });
        expect(result.buffer).toEqual(Buffer.from(JPEG_BYTES));
        expect(billed.cost.totalCost).toBe(0.037);
        expect(billed.price.totalPrice).toBe(0.037);
    });

    it.each([null, "", "invalid", -1])(
        "rejects invalid billed cost %s",
        async (cost) => {
            mockGateway(cost);
            await expect(
                callSeedream5ProVercelAPI("test", {
                    ...baseParams,
                    model: "bytedance/seedream-5.0-pro",
                }),
            ).rejects.toThrow("valid billed cost");
        },
    );

    it("rejects an image with no provider receipt", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                images: [Buffer.from(JPEG_BYTES).toString("base64")],
            }),
        );
        await expect(
            callSeedream5ProVercelAPI("test", {
                ...baseParams,
                model: "bytedance/seedream-5.0-pro",
            }),
        ).rejects.toThrow("valid billed cost");
    });
});
