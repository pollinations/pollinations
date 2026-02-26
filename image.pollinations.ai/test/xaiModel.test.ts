import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture fetch calls
let lastFetchUrl = "";
let lastFetchBody: Record<string, unknown> = {};

process.env.XAI_API_KEY = "test-xai-key";

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("example.com")) {
        // Simulate downloading the image buffer
        return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(16),
        } as Response;
    }
    lastFetchUrl = url;
    lastFetchBody = JSON.parse((init?.body as string) ?? "{}");
    return {
        ok: true,
        json: async () => ({
            data: [{ url: "https://example.com/image.jpg" }],
        }),
    } as Response;
});

import { callXaiImageAPI } from "../src/models/xaiModel.ts";
import type { ImageParams } from "../src/params.ts";

const makeProgress = () => ({
    updateBar: vi.fn(),
    finishBar: vi.fn(),
    removeBar: vi.fn(),
});

const baseParams: ImageParams = {
    model: "grok-imagine-pro",
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
    duration: 5,
};

describe("xaiModel - grok-imagine-pro", () => {
    beforeEach(() => {
        lastFetchUrl = "";
        lastFetchBody = {};
    });

    it("calls the correct xAI endpoint", async () => {
        await callXaiImageAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-1",
        );
        expect(lastFetchUrl).toBe("https://api.x.ai/v1/images/generations");
    });

    it("sends the correct model ID", async () => {
        await callXaiImageAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-2",
        );
        expect(lastFetchBody.model).toBe("grok-imagine-image");
    });

    it("sends aspect_ratio 1:1 for square dimensions", async () => {
        await callXaiImageAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-3",
        );
        expect(lastFetchBody.aspect_ratio).toBe("1:1");
    });

    it("sends aspect_ratio 16:9 for landscape dimensions", async () => {
        const params: ImageParams = { ...baseParams, width: 1280, height: 720 };
        await callXaiImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-4",
        );
        expect(lastFetchBody.aspect_ratio).toBe("16:9");
    });

    it("sends aspect_ratio 9:16 for portrait dimensions", async () => {
        const params: ImageParams = { ...baseParams, width: 720, height: 1280 };
        await callXaiImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-5",
        );
        expect(lastFetchBody.aspect_ratio).toBe("9:16");
    });

    it("does not send aspect_ratio when no dimensions provided", async () => {
        const params: ImageParams = {
            ...baseParams,
            width: undefined as any,
            height: undefined as any,
        };
        await callXaiImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-6",
        );
        expect(lastFetchBody.aspect_ratio).toBeUndefined();
    });

    it("returns a buffer from the image URL", async () => {
        const result = await callXaiImageAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-7",
        );
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("returns isMature and isChild as false", async () => {
        const result = await callXaiImageAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-8",
        );
        expect(result.isMature).toBe(false);
        expect(result.isChild).toBe(false);
    });

    it("sets completionImageTokens to 1 in trackingData", async () => {
        const result = await callXaiImageAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-9",
        );
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });
});
