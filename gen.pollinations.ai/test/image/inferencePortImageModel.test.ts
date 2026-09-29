import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import { callInferencePortImage } from "../../src/image/models/inferencePortImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const GENERATIONS_ENDPOINT =
    "https://api.inferenceport.ai/v1/images/generations";
const INPUT_IMAGE_URL = "https://example.com/reference.png";
const INPUT_IMAGE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const OUTPUT_IMAGE = Buffer.from("inferenceport-output");
const USER_INFO = {} as AuthResult;

const baseParams: ImageParams = {
    model: "inferenceport-ai/lightning-image-turbo",
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
    guidance_scale: 3,
};

function successResponse(): Response {
    return Response.json({
        data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
        usage: { image_count: 1, payg_credits_charged: 0.02 },
    });
}

beforeEach(() => {
    syncImageEnv(
        { INFERENCEPORT_API_KEY: "test-ip-key" } as CloudflareBindings,
        ["INFERENCEPORT_API_KEY"],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callInferencePortImage", () => {
    it("generates through the generations endpoint with Bearer auth", async () => {
        let requestBody: Record<string, unknown> | undefined;
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                expect(url.toString()).toBe(GENERATIONS_ENDPOINT);
                expect(init?.headers).toMatchObject({
                    Authorization: "Bearer test-ip-key",
                    "Content-Type": "application/json",
                });
                requestBody = JSON.parse(init?.body as string);
                return successResponse();
            });

        const result = await callInferencePortImage(
            "a red bicycle",
            baseParams,
            USER_INFO,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(requestBody).toEqual({
            model: "lightning-image-turbo",
            prompt: "a red bicycle",
            n: 1,
        });
        expect(result.buffer.equals(OUTPUT_IMAGE)).toBe(true);
        expect(result.trackingData).toEqual({
            actualModel: "inferenceport-ai/lightning-image-turbo",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        });
    });

    it("conditions generation on a safety-checked reference image", async () => {
        let editInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (url.toString() === INPUT_IMAGE_URL) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            expect(url.toString()).toBe(GENERATIONS_ENDPOINT);
            editInit = init;
            return successResponse();
        });

        const result = await callInferencePortImage(
            "make the bicycle blue",
            { ...baseParams, image: [INPUT_IMAGE_URL] },
            USER_INFO,
        );

        expect(editInit?.headers).toMatchObject({
            Authorization: "Bearer test-ip-key",
        });
        expect(JSON.parse(editInit?.body as string)).toEqual({
            model: "lightning-image-turbo",
            prompt: "make the bicycle blue",
            n: 1,
            image_urls: [
                `data:image/png;base64,${INPUT_IMAGE.toString("base64")}`,
            ],
        });
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 1,
            totalTokenCount: 1,
        });
    });

    it("sends both reference images", async () => {
        const urls = ["https://example.com/a.png", "https://example.com/b.png"];
        let editInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (urls.includes(url.toString())) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            expect(url.toString()).toBe(GENERATIONS_ENDPOINT);
            editInit = init;
            return successResponse();
        });

        const result = await callInferencePortImage(
            "combine these",
            { ...baseParams, image: urls },
            USER_INFO,
        );

        const body = JSON.parse(editInit?.body as string);
        expect(body.image_urls).toEqual(
            urls.map(
                () => `data:image/png;base64,${INPUT_IMAGE.toString("base64")}`,
            ),
        );
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 1,
            totalTokenCount: 1,
        });
    });

    it("rejects more than two reference images before calling upstream", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callInferencePortImage(
                "combine these",
                {
                    ...baseParams,
                    image: [
                        "https://example.com/a.png",
                        "https://example.com/b.png",
                        "https://example.com/c.png",
                        "https://example.com/d.png",
                        "https://example.com/e.png",
                    ],
                },
                USER_INFO,
            ),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects unsupported dimensions before calling upstream", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callInferencePortImage(
                "a lighthouse",
                { ...baseParams, dimensionsExplicit: true, width: 512 },
                USER_INFO,
            ),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects transparent backgrounds before calling upstream", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callInferencePortImage(
                "a logo",
                { ...baseParams, transparent: true },
                USER_INFO,
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining("Transparent"),
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fails clearly when upstream returns no image", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ data: [] }),
        );

        await expect(
            callInferencePortImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({ status: 502 });
    });

    it.each([
        undefined,
        0,
        -1,
        1.5,
    ])("rejects invalid reported image usage %s", async (imageCount) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
                usage: { image_count: imageCount },
            }),
        );
        await expect(
            callInferencePortImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("bills the image count reported by the provider", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
                usage: { image_count: 2, payg_credits_charged: 0.04 },
            }),
        );
        const result = await callInferencePortImage(
            "a lighthouse",
            baseParams,
            USER_INFO,
        );
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 2,
            totalTokenCount: 2,
        });
    });

    it("preserves upstream 4xx errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                { error: { message: "Invalid model parameter" } },
                { status: 400 },
            ),
        );

        await expect(
            callInferencePortImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 400,
            upstreamStatus: 400,
        });
    });

    it("preserves upstream 5xx errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                { error: { message: "Internal server error" } },
                { status: 500 },
            ),
        );

        await expect(
            callInferencePortImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 500,
            upstreamStatus: 500,
        });
    });

    it("downloads and uses image from URL when b64_json is absent", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
            if (url.toString() === GENERATIONS_ENDPOINT) {
                return Response.json({
                    data: [{ url: INPUT_IMAGE_URL }],
                    usage: { image_count: 1, payg_credits_charged: 0.02 },
                });
            }
            if (url.toString() === INPUT_IMAGE_URL) {
                return new Response(OUTPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            return new Response("Not found", { status: 404 });
        });

        const result = await callInferencePortImage(
            "a lighthouse",
            baseParams,
            USER_INFO,
        );

        expect(result.buffer.equals(OUTPUT_IMAGE)).toBe(true);
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 1,
            totalTokenCount: 1,
        });
    });
});
