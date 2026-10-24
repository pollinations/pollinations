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
    it("sends Krea's requested aspect ratio like the primary route", async () => {
        const fetchSpy = mockPrediction();

        await callReplicateFallbackImage("a lighthouse", {
            ...params("krea/krea-2-medium:replicate"),
            aspectRatio: "16:9",
        });

        const body = JSON.parse(
            (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(body.input.aspect_ratio).toBe("16:9");
    });

    it("maps FLUX.2 Max generation to the exact Replicate model", async () => {
        const fetchSpy = mockPrediction();

        const result = await callReplicateFallbackImage(
            "a red apple",
            params("black-forest-labs/flux.2-max"),
        );

        expect(fetchSpy.mock.calls[0][0]).toBe(
            "https://api.replicate.com/v1/models/black-forest-labs/flux-2-max/predictions",
        );
        const body = JSON.parse(
            (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(body.input).toMatchObject({
            prompt: "a red apple",
            aspect_ratio: "custom",
            width: 1024,
            height: 1024,
            output_format: "png",
            seed: 42,
        });
        expect(result.trackingData).toEqual({
            actualModel: "black-forest-labs/flux.2-max",
            usage: { completionImageTokens: 1.048576 },
        });
    });

    it("bills FLUX.2 from Replicate's whole-megapixel counts", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    id: "prediction_1",
                    status: "succeeded",
                    output: OUTPUT_URL,
                    metrics: {
                        predict_time: 1,
                        image_input_megapixel_count: 0,
                        image_output_megapixel_count: 2,
                    },
                }),
            )
            .mockResolvedValueOnce(
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "content-type": "image/png" },
                }),
            );

        const result = await callReplicateFallbackImage("a red apple", {
            ...params("black-forest-labs/flux.2-max"),
            width: 1280,
        });

        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 2,
        });
    });

    it("passes all supported p-image-edit references", async () => {
        const fetchSpy = mockPrediction();

        await callReplicateFallbackImage(
            "make it blue",
            params("prunaai/p-image-edit:replicate", [PNG, PNG]),
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
