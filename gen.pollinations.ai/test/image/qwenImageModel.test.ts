import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/image/utils/imageDownload", () => ({
    downloadUserImage: async () => ({
        buffer: Buffer.from("test", "utf8"),
        mimeType: "image/jpeg",
    }),
}));

import { syncImageEnvironment } from "../../src/image/handler.ts";
import { callQwenImageAPI } from "../../src/image/models/qwenImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const OUTPUT_URL = "https://replicate.delivery/x/qwen-output.png";

const baseParams: ImageParams = {
    model: "qwen/qwen-image",
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

function mockReplicateFetch(requestUrls: string[]) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const href = typeof url === "string" ? url : url.toString();
        requestUrls.push(href);
        if (href === OUTPUT_URL) {
            return new Response(new TextEncoder().encode("png-bytes"), {
                status: 200,
            });
        }
        return Response.json(
            {
                id: "pred_qwen_test",
                status: "succeeded",
                output: [OUTPUT_URL],
                metrics: { predict_time: 1 },
            },
            { status: 201 },
        );
    });
}

describe("qwenImageModel tracking", () => {
    it("reports qwen-image for text-to-image", async () => {
        const requestUrls: string[] = [];
        mockReplicateFetch(requestUrls);

        const result = await callQwenImageAPI("test prompt", baseParams);

        expect(requestUrls[0]).toContain("/models/qwen/qwen-image/predictions");
        expect(result.trackingData?.actualModel).toBe("qwen/qwen-image");
    });

    it("reports qwen-image-edit-plus for editing", async () => {
        const requestUrls: string[] = [];
        mockReplicateFetch(requestUrls);

        const result = await callQwenImageAPI("test prompt", {
            ...baseParams,
            image: ["https://example.com/reference.jpg"],
        });

        expect(
            requestUrls.find(
                (url) => new URL(url).hostname === "api.replicate.com",
            ),
        ).toContain("/models/qwen/qwen-image-edit-plus/predictions");
        expect(result.trackingData?.actualModel).toBe("qwen-image-edit-plus");
    });
});
