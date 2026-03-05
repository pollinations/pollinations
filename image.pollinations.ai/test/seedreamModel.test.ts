import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture fetch calls
let lastFetchUrl = "";
let lastFetchBody: Record<string, unknown> = {};

// Mock downloadImageAsBase64 before importing the module
vi.mock("../src/utils/imageDownload.ts", () => ({
    downloadImageAsBase64: async () => ({
        base64: "dGVzdA==",
        mimeType: "image/jpeg",
    }),
}));

// Mock fetch: API call returns image URL, image download returns buffer
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && new URL(url).hostname === "example.com") {
        return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        } as Response;
    }
    lastFetchUrl = url;
    lastFetchBody = JSON.parse((init?.body as string) ?? "{}");
    return {
        ok: true,
        json: async () => ({
            model: lastFetchBody.model,
            created: Date.now(),
            data: [{ url: "https://example.com/image.png", size: "1024x1024" }],
            usage: { generated_images: 1, output_tokens: 1, total_tokens: 1 },
        }),
    } as Response;
});

process.env.BYTEDANCE_API_KEY = "test-key";

import {
    callSeedream5API,
    callSeedreamAPI,
    callSeedreamProAPI,
} from "../src/models/seedreamModel.ts";
import type { ImageParams } from "../src/params.ts";

const makeProgress = () => ({
    updateBar: vi.fn(),
    finishBar: vi.fn(),
    removeBar: vi.fn(),
});

const baseParams: ImageParams = {
    model: "seedream5",
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
    audio: false,
    duration: 0,
};

describe("seedreamModel - Seedream 5.0 Lite", () => {
    beforeEach(() => {
        lastFetchUrl = "";
        lastFetchBody = {};
    });

    it("sends correct model version for seedream5", async () => {
        await callSeedream5API(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-1",
        );

        expect(lastFetchUrl).toBe(
            "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
        );
        expect(lastFetchBody.model).toBe("seedream-5-0-260128");
        expect(lastFetchBody.prompt).toBe("test prompt");
        expect(lastFetchBody.size).toBe("1920x1920"); // scaled up to meet 3686400 minPixels
        expect(lastFetchBody.seed).toBe(42);
    });

    it("sends correct model version for legacy seedream (4.0)", async () => {
        const params = { ...baseParams, model: "seedream" as any };
        await callSeedreamAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-2",
        );

        expect(lastFetchBody.model).toBe("seedream-4-0-250828");
    });

    it("sends correct model version for legacy seedream-pro (4.5)", async () => {
        const params = { ...baseParams, model: "seedream-pro" as any };
        await callSeedreamProAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-3",
        );

        expect(lastFetchBody.model).toBe("seedream-4-5-251128");
    });

    it("passes image references for image-to-image", async () => {
        const params: ImageParams = {
            ...baseParams,
            image: ["https://example.com/ref1.jpg"],
        };

        await callSeedream5API(
            "edit this",
            params,
            makeProgress() as any,
            "req-4",
        );

        expect(lastFetchBody.image).toBe("data:image/jpeg;base64,dGVzdA==");
    });

    it("does not send image field when no images provided", async () => {
        await callSeedream5API(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-5",
        );

        expect(lastFetchBody.image).toBeUndefined();
    });

    it("returns correct tracking data with actualModel", async () => {
        const result = await callSeedream5API(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-6",
        );

        expect(result.trackingData?.actualModel).toBe("seedream5");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });

    it("returns seedream as actualModel for legacy 4.0", async () => {
        const params = { ...baseParams, model: "seedream" as any };
        const result = await callSeedreamAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-7",
        );

        expect(result.trackingData?.actualModel).toBe("seedream");
    });
});
