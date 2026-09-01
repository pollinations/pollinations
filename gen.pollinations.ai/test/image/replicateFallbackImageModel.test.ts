import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callReplicateFallbackImage } from "../../src/image/models/replicateFallbackImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const OUTPUT_URL = "https://replicate.delivery/output.png";
const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZRXcAAAAASUVORK5CYII=";

function params(
    model: ImageParams["model"],
    image: string[] = [],
): ImageParams {
    return {
        model,
        width: 1024,
        height: 1024,
        dimensionsExplicit: true,
        seed: 42,
        safe: false,
        quality: "medium",
        image,
        transparent: false,
        reasoning: "balanced",
        audio: false,
    };
}

function mockPrediction() {
    return vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
            Response.json({
                id: "prediction_1",
                status: "succeeded",
                output: OUTPUT_URL,
                metrics: { predict_time: 1 },
            }),
        )
        .mockResolvedValueOnce(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "image/png" },
            }),
        );
}

beforeEach(() => {
    syncImageEnv(
        { REPLICATE_API_TOKEN: "test-replicate-key" } as CloudflareBindings,
        ["REPLICATE_API_TOKEN"],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callReplicateFallbackImage", () => {
    it("maps Qwen Image 3 generation to the exact Replicate model", async () => {
        const fetchSpy = mockPrediction();

        const result = await callReplicateFallbackImage(
            "a red apple",
            params("qwen-image-3-replicate"),
        );

        expect(fetchSpy.mock.calls[0][0]).toBe(
            "https://api.replicate.com/v1/models/alibaba/qwen-image-3/predictions",
        );
        const body = JSON.parse(
            (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(body.input).toMatchObject({
            prompt: "a red apple",
            aspect_ratio: "1:1",
            enable_prompt_expansion: false,
            seed: 42,
        });
        expect(result.trackingData).toEqual({
            actualModel: "qwen-image-3-replicate",
            usage: { completionImageTokens: 1 },
        });
    });

    it("uses the first reference when Replicate supports fewer than the public route", async () => {
        const fetchSpy = mockPrediction();

        await callReplicateFallbackImage(
            "make it blue",
            params("qwen-image-3-replicate", [PNG, PNG]),
        );

        const body = JSON.parse(
            (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(body.input.image).toBe(PNG);
    });

    it("passes all supported p-image-edit references", async () => {
        const fetchSpy = mockPrediction();

        await callReplicateFallbackImage(
            "make it blue",
            params("p-image-edit-replicate", [PNG, PNG]),
        );

        expect(fetchSpy.mock.calls[0][0]).toBe(
            "https://api.replicate.com/v1/models/prunaai/p-image-edit/predictions",
        );
        const body = JSON.parse(
            (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(body.input.images).toEqual([PNG, PNG]);
    });
});
