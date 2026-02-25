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

// We also need to mock the progress bar and video download
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("example.com")) {
        // Simulate downloading the video buffer
        return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        } as Response;
    }
    lastFetchBody = JSON.parse((init?.body as string) ?? "{}");
    return {
        ok: true,
        text: async () =>
            'data: {"data":[{"url":"https://example.com/video.mp4"}]}\ndata: [DONE]\n',
    } as Response;
});

import { callAirforceVideoAPI } from "../src/models/airforceModel.ts";
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
