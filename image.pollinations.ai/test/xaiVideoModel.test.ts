import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture fetch calls
let lastFetchUrl = "";
let lastFetchBody: Record<string, unknown> = {};

process.env.XAI_API_KEY = "test-xai-key";

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (
        typeof url === "string" &&
        url.includes("/videos/") &&
        !url.includes("/generations")
    ) {
        // Poll status endpoint — return succeeded immediately
        return {
            ok: true,
            json: async () => ({
                id: "vid_test123",
                status: "succeeded",
                video: { url: "https://example.com/video.mp4" },
            }),
        } as Response;
    }

    if (typeof url === "string" && new URL(url).hostname === "example.com") {
        // Simulate downloading the video buffer
        return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(32),
        } as Response;
    }

    lastFetchUrl = url;
    lastFetchBody = JSON.parse((init?.body as string) ?? "{}");
    return {
        ok: true,
        json: async () => ({
            id: "vid_test123",
            request_id: "vid_test123",
        }),
    } as Response;
});

import { callXaiVideoAPI } from "../src/models/xaiVideoModel.ts";
import type { ImageParams } from "../src/params.ts";

const makeProgress = () => ({
    updateBar: vi.fn(),
    finishBar: vi.fn(),
    removeBar: vi.fn(),
});

const baseParams: ImageParams = {
    model: "grok-video-pro",
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

describe("xaiVideoModel - grok-video-pro", () => {
    beforeEach(() => {
        lastFetchUrl = "";
        lastFetchBody = {};
    });

    it("calls the correct xAI video endpoint", async () => {
        await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-1",
        );
        expect(lastFetchUrl).toBe("https://api.x.ai/v1/videos/generations");
    });

    it("sends the correct model ID", async () => {
        await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-2",
        );
        expect(lastFetchBody.model).toBe("grok-imagine-video");
    });

    it("sends 720p resolution for 1280x720", async () => {
        await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-3",
        );
        expect(lastFetchBody.resolution).toBe("720p");
    });

    it("sends 480p resolution for small dimensions", async () => {
        const params: ImageParams = { ...baseParams, width: 480, height: 270 };
        await callXaiVideoAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-4",
        );
        expect(lastFetchBody.resolution).toBe("480p");
    });

    it("returns a buffer from the video URL", async () => {
        const result = await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-5",
        );
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("returns correct durationSeconds", async () => {
        const result = await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-6",
        );
        expect(result.durationSeconds).toBe(5);
    });

    it("uses custom duration from params", async () => {
        const params: ImageParams = { ...baseParams, duration: 8 };
        const result = await callXaiVideoAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-7",
        );
        expect(result.durationSeconds).toBe(8);
    });

    it("sets completionVideoSeconds in trackingData", async () => {
        const result = await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-8",
        );
        expect(result.trackingData?.usage?.completionVideoSeconds).toBe(5);
    });

    it("returns mimeType video/mp4", async () => {
        const result = await callXaiVideoAPI(
            "test prompt",
            baseParams,
            makeProgress() as any,
            "req-9",
        );
        expect(result.mimeType).toBe("video/mp4");
    });
});
