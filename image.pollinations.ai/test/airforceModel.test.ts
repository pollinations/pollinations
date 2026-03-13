import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture fetch calls
let lastFetchBody: Record<string, unknown> = {};

vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    lastFetchBody = JSON.parse((init?.body as string) ?? "{}");
    // Return a minimal SSE response with a video URL
    return {
        ok: true,
        text: async () =>
            'data: {"data":[{"url":"https://example.com/video.mp4"}]}\ndata: [DONE]\n',
    } as Response;
});

// Mock AIRFORCE_API_KEY
process.env.AIRFORCE_API_KEY = "test-key";

// Mock download
vi.mock("node-fetch", () => ({}));

// We also need to mock the progress bar and video/image download
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("example.com")) {
        // HEAD requests for redirect resolution — return the same URL
        if (init?.method === "HEAD") {
            return { ok: true, url } as Response;
        }
        // Simulate downloading the result buffer
        return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        } as Response;
    }
    lastFetchBody = JSON.parse((init?.body as string) ?? "{}");
    // Check if this is a video model request (has sse field) or image model request
    if (lastFetchBody.sse) {
        return {
            ok: true,
            text: async () =>
                'data: {"data":[{"url":"https://example.com/video.mp4"}]}\ndata: [DONE]\n',
        } as Response;
    }
    // Image model response (JSON with b64_json)
    return {
        ok: true,
        json: async () => ({
            data: [{ b64_json: Buffer.from("fake-image").toString("base64") }],
        }),
    } as Response;
});

import {
    callAirforceImageAPI,
    callAirforceVideoAPI,
} from "../src/models/airforceModel.ts";
import type { ImageParams } from "../src/params.ts";

const makeProgress = () => ({
    updateBar: vi.fn(),
    finishBar: vi.fn(),
    removeBar: vi.fn(),
});

const baseParams: ImageParams = {
    model: "grok-video",
    width: 1280,
    height: 720,
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

describe("airforceModel - grok-imagine-video", () => {
    beforeEach(() => {
        lastFetchBody = {};
    });

    it("sends image_urls array when image param is provided", async () => {
        const params: ImageParams = {
            ...baseParams,
            image: [
                "https://example.com/ref1.jpg",
                "https://example.com/ref2.jpg",
            ],
        };

        await callAirforceVideoAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-1",
            "grok-imagine-video",
        );

        expect(lastFetchBody.image_urls).toEqual([
            "https://example.com/ref1.jpg",
            "https://example.com/ref2.jpg",
        ]);
    });

    it("does not send image_urls when no image provided", async () => {
        await callAirforceVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-2",
            "grok-imagine-video",
        );

        expect(lastFetchBody.image_urls).toBeUndefined();
    });

    it("sends single image as array in image_urls", async () => {
        const params: ImageParams = {
            ...baseParams,
            image: ["https://example.com/single.jpg"],
        };

        await callAirforceVideoAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-3",
            "grok-imagine-video",
        );

        expect(lastFetchBody.image_urls).toEqual([
            "https://example.com/single.jpg",
        ]);
    });
});

describe("airforceModel - flux-2-dev size snapping", () => {
    const imageParams: ImageParams = {
        ...baseParams,
        model: "flux-2-dev",
    };

    beforeEach(() => {
        lastFetchBody = {};
    });

    it("snaps landscape dimensions to 1792x1024 with SSE + aspectRatio", async () => {
        const params: ImageParams = {
            ...imageParams,
            width: 1920,
            height: 1080,
        };

        await callAirforceImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-img-1",
            "flux-2-dev",
        );

        expect(lastFetchBody.size).toBe("1792x1024");
        expect(lastFetchBody.aspectRatio).toBe("1792:1024");
        expect(lastFetchBody.sse).toBe(true);
        expect(lastFetchBody.response_format).toBe("url");
    });

    it("snaps portrait dimensions to 1024x1792 with SSE + aspectRatio", async () => {
        const params: ImageParams = {
            ...imageParams,
            width: 768,
            height: 1344,
        };

        await callAirforceImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-img-2",
            "flux-2-dev",
        );

        expect(lastFetchBody.size).toBe("1024x1792");
        expect(lastFetchBody.aspectRatio).toBe("1024:1792");
    });

    it("snaps square dimensions to 1024x1024 with SSE + aspectRatio", async () => {
        const params: ImageParams = {
            ...imageParams,
            width: 512,
            height: 512,
        };

        await callAirforceImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-img-3",
            "flux-2-dev",
        );

        expect(lastFetchBody.size).toBe("1024x1024");
        expect(lastFetchBody.aspectRatio).toBe("1024:1024");
    });

    it("still sends image_urls for image-to-image", async () => {
        const params: ImageParams = {
            ...imageParams,
            width: 1024,
            height: 1024,
            image: ["https://example.com/input.jpg"],
        };

        await callAirforceImageAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-img-4",
            "flux-2-dev",
        );

        expect(lastFetchBody.size).toBe("1024x1024");
        expect(lastFetchBody.aspectRatio).toBe("1024:1024");
        expect(lastFetchBody.image_urls).toEqual([
            "https://example.com/input.jpg",
        ]);
    });
});
