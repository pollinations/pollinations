import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture fetch calls
let lastFetchUrl = "";
let lastFetchBody: Record<string, unknown> = {};

// Mock downloadUserImage before importing the module
vi.mock("../../src/image/utils/imageDownload.ts", () => ({
    downloadUserImage: async () => ({
        buffer: Buffer.from("test", "utf8"),
        mimeType: "image/jpeg",
    }),
}));

// Mock fetch: API call returns image URL, image download returns buffer
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && new URL(url).hostname === "example.com") {
        return {
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode("test").buffer,
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

import { syncImageEnvironment } from "../../src/image/handler.ts";
import {
    callSeedreamAPI,
    callSeedreamProAPI,
} from "../../src/image/models/seedreamModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

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

// Note: seedream5 now routes through Replicate via seedream5ReplicateModel.ts.
// These tests cover only the BytePlus-backed legacy models (seedream 4.0 and
// seedream-pro 4.5) that still live in seedreamModel.ts.
describe("seedreamModel - legacy BytePlus variants", () => {
    beforeEach(() => {
        syncImageEnvironment({
            ...env,
            BYTEDANCE_API_KEY: "test-key",
        } as CloudflareBindings);
        lastFetchUrl = "";
        lastFetchBody = {};
    });

    it("sends correct model version for legacy seedream (4.0)", async () => {
        const params = { ...baseParams, model: "seedream" as any };
        await callSeedreamAPI(
            "test prompt",
            params,
            makeProgress() as any,
            "req-2",
        );

        expect(lastFetchUrl).toBe(
            "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
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
