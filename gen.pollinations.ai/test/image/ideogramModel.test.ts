import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncImageEnvironment } from "../../src/image/handler.ts";
import {
    callIdeogramBalancedAPI,
    callIdeogramQualityAPI,
    callIdeogramTurboAPI,
} from "../../src/image/models/ideogramReplicateModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

interface ReplicateRequest {
    url: string;
    body: Record<string, unknown>;
}

const REPLICATE_IMAGE_URL = "https://replicate.delivery/x/ideogram-output.png";

// Ideogram v4 returns a SINGLE image-URL string (not an array).
function mockReplicateFetch(requests: ReplicateRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === REPLICATE_IMAGE_URL) {
                return new Response(
                    new TextEncoder().encode("png-bytes").buffer,
                    {
                        status: 200,
                    },
                );
            }
            const body = init?.body
                ? (JSON.parse(init.body as string) as Record<string, unknown>)
                : {};
            requests.push({ url: href, body });
            return new Response(
                JSON.stringify({
                    id: "pred_ideogram_test",
                    status: "succeeded",
                    output: REPLICATE_IMAGE_URL,
                    metrics: { predict_time: 5 },
                }),
                { status: 201 },
            );
        });
}

const baseParams: ImageParams = {
    model: "ideogram-v4-balanced",
    width: 2048,
    height: 2048,
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

function inputOf(req: ReplicateRequest): Record<string, unknown> {
    return (req.body as { input: Record<string, unknown> }).input;
}

beforeEach(() => {
    syncImageEnvironment({
        ...env,
        REPLICATE_API_TOKEN: "r8_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ideogramReplicateModel - routing & billing", () => {
    it("turbo posts to ideogram-ai/ideogram-v4-turbo and bills 1 image token", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        const result = await callIdeogramTurboAPI("a sign reading OPEN", {
            ...baseParams,
            model: "ideogram-v4-turbo",
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/ideogram-ai/ideogram-v4-turbo/predictions",
        );
        expect(inputOf(requests[0]).prompt).toBe("a sign reading OPEN");
        expect(result.trackingData?.actualModel).toBe("ideogram-v4-turbo");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(1);
    });

    it("balanced posts to ideogram-ai/ideogram-v4-balanced", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);
        await callIdeogramBalancedAPI("x", baseParams);
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/ideogram-ai/ideogram-v4-balanced/predictions",
        );
    });

    it("quality posts to ideogram-ai/ideogram-v4-quality", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);
        await callIdeogramQualityAPI("x", {
            ...baseParams,
            model: "ideogram-v4-quality",
        });
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/ideogram-ai/ideogram-v4-quality/predictions",
        );
    });
});

describe("ideogramReplicateModel - resolution mapping", () => {
    const cases: Array<[Partial<ImageParams>, string, string]> = [
        [{ aspectRatio: "1:1" }, "2048x2048", "1:1"],
        [{ aspectRatio: "16:9" }, "2560x1440", "16:9 landscape"],
        [{ aspectRatio: "9:16" }, "1440x2560", "9:16 portrait"],
        // No aspectRatio → falls back to width/height (1920×1080 ≈ 16:9).
        [
            { aspectRatio: undefined, width: 1920, height: 1080 },
            "2560x1440",
            "1920×1080 dims",
        ],
        // Default square dims, nothing specified.
        [
            { aspectRatio: undefined, width: 2048, height: 2048 },
            "2048x2048",
            "default square",
        ],
    ];

    for (const [override, expected, label] of cases) {
        it(`maps ${label} → ${expected}`, async () => {
            const requests: ReplicateRequest[] = [];
            mockReplicateFetch(requests);
            await callIdeogramBalancedAPI("x", { ...baseParams, ...override });
            expect(inputOf(requests[0]).resolution).toBe(expected);
        });
    }
});
