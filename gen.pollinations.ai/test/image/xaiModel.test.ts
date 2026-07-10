import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callXaiImageAPI } from "../../src/image/models/xaiModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const XAI_GENERATE_URL = "https://api.x.ai/v1/images/generations";
const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";
const IMAGE_URL = "https://image.example.com/xai-output.png";

interface XaiRequest {
    url: string;
    body: Record<string, unknown>;
}

const baseParams: ImageParams = {
    model: "grok-imagine",
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

function mockXaiFetch(requests: XaiRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === XAI_GENERATE_URL || href === XAI_EDITS_URL) {
                const body = JSON.parse(init?.body as string) as Record<
                    string,
                    unknown
                >;
                requests.push({ url: href, body });
                return new Response(
                    JSON.stringify({ data: [{ url: IMAGE_URL }] }),
                    { status: 200 },
                );
            }

            if (href === IMAGE_URL) {
                return new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("xaiModel usage accounting", () => {
    it("tracks only output image usage for text-to-image generations", async () => {
        syncImageEnv({ XAI_API_KEY: "xai-test-key" } as CloudflareBindings, [
            "XAI_API_KEY",
        ]);
        const requests: XaiRequest[] = [];
        mockXaiFetch(requests);

        const result = await callXaiImageAPI("test prompt", baseParams);

        expect(requests[0].url).toBe(XAI_GENERATE_URL);
        expect(result.trackingData?.usage).toEqual({
            completionImageTokens: 1,
        });
    });

    it("tracks the xAI image input fee for edits", async () => {
        syncImageEnv({ XAI_API_KEY: "xai-test-key" } as CloudflareBindings, [
            "XAI_API_KEY",
        ]);
        const requests: XaiRequest[] = [];
        mockXaiFetch(requests);

        const result = await callXaiImageAPI("test prompt", {
            ...baseParams,
            image: ["https://example.com/input.png"],
        });

        expect(requests[0].url).toBe(XAI_EDITS_URL);
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: 1,
            completionImageTokens: 1,
        });
    });

    it("uses the 1K default output tier for Grok Imagine Pro", async () => {
        syncImageEnv({ XAI_API_KEY: "xai-test-key" } as CloudflareBindings, [
            "XAI_API_KEY",
        ]);
        const requests: XaiRequest[] = [];
        mockXaiFetch(requests);

        const result = await callXaiImageAPI(
            "test prompt",
            { ...baseParams, model: "grok-imagine-pro" },
            "grok-imagine-image-quality",
        );

        expect(requests[0].url).toBe(XAI_GENERATE_URL);
        expect(requests[0].body).toMatchObject({
            model: "grok-imagine-image-quality",
            prompt: "test prompt",
            n: 1,
            response_format: "url",
        });
        expect(requests[0].body).not.toHaveProperty("resolution");
        expect(result.trackingData?.actualModel).toBe("grok-imagine-pro");
        expect(result.trackingData?.usage).toEqual({
            completionImageTokens: 1,
        });
    });
});
