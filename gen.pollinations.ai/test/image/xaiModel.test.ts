import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callXaiImageAPI } from "../../src/image/models/xaiModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const XAI_GENERATE_URL = "https://api.x.ai/v1/images/generations";
const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";
const IMAGE_URL = "https://image.example.com/xai-output.png";
const CLEAN_JPEG_DATA_URI = "data:image/jpeg;base64,/9j/2gADAP/Z";
const CLEAN_JPEG_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
]);

interface XaiRequest {
    url: string;
    body: Record<string, unknown>;
}

const baseParams: ImageParams = {
    model: "x-ai/grok-imagine-image",
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

            if (href === "https://example.com/input.png") {
                return new Response(CLEAN_JPEG_BYTES, {
                    headers: { "Content-Type": "image/jpeg" },
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
            image: [CLEAN_JPEG_DATA_URI],
        });

        expect(requests[0].url).toBe(XAI_EDITS_URL);
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: 1,
            completionImageTokens: 1,
        });
    });

    it("downloads and sanitises remote reference image URLs before forwarding to xAI", async () => {
        syncImageEnv({ XAI_API_KEY: "xai-test-key" } as CloudflareBindings, [
            "XAI_API_KEY",
        ]);
        const requests: XaiRequest[] = [];
        mockXaiFetch(requests);

        await callXaiImageAPI("edit prompt", {
            ...baseParams,
            image: ["https://example.com/input.png"],
        });

        expect(requests[0].url).toBe(XAI_EDITS_URL);
        expect(requests[0].body.image).toEqual({
            url: CLEAN_JPEG_DATA_URI,
            detail: "auto",
        });
    });
});
