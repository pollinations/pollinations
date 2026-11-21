import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callRecraftV4VectorFalAPI } from "../../src/image/models/recraftV4VectorFalModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const baseParams: ImageParams = {
    model: "recraft/recraft-v4-vector",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
};
afterEach(() => vi.restoreAllMocks());

describe("Recraft V4 Vector fal route", () => {
    it("uses the correct endpoint, returns SVG, and reports fal billable units", async () => {
        syncImageEnv({ FAL_KEY: "fal-test-key" } as CloudflareBindings, ["FAL_KEY"]);
        const requests: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (String(url) === "https://fal.run/fal-ai/recraft/v4/text-to-vector") {
                expect(new Headers(init?.headers).get("Authorization")).toBe("Key fal-test-key");
                requests.push(JSON.parse(String(init?.body)));
                return Response.json({
                    images: [{ url: "https://fal.example/vector.svg", content_type: "image/svg+xml" }],
                }, { headers: { "x-fal-billable-units": "1" } });
            }
            return new Response("<svg xmlns=\"http://www.w3.org/2000/svg\"/>", {
                headers: { "content-type": "image/svg+xml" },
            });
        });
        const result = await callRecraftV4VectorFalAPI("poster with orderly multiline labels", baseParams);
        expect(requests[0]).toMatchObject({
            prompt: "poster with orderly multiline labels",
            image_size: "landscape_16_9",
            enable_safety_checker: true,
        });
        expect(result.mimeType).toBe("image/svg+xml");
        expect(result.trackingData).toEqual({
            actualModel: "recraft/recraft-v4-vector",
            usage: { completionImageTokens: 1 },
        });
    });
    it("rejects reference images because fal endpoint only accepts text", async () => {
        syncImageEnv({ FAL_KEY: "fal-test-key" } as CloudflareBindings, ["FAL_KEY"]);
        await expect(callRecraftV4VectorFalAPI("edit", { ...baseParams, image: ["https://example.com/ref.png"] }))
            .rejects.toThrow("does not accept reference images");
    });
});
