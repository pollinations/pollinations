import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import { callInferencePortImage } from "../../src/image/models/inferencePortImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const GENERATIONS_ENDPOINT =
    "https://api.inferenceport.ai/v1/images/generations";
const EDITS_ENDPOINT = "https://api.inferenceport.ai/v1/images/edits";
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

    it("edits with one safety-checked reference image through multipart form data", async () => {
        let editInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (url.toString() === INPUT_IMAGE_URL) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            expect(url.toString()).toBe(EDITS_ENDPOINT);
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
        expect(editInit?.headers).not.toHaveProperty("Content-Type");
        const formData = editInit?.body as FormData;
        expect(formData).toBeInstanceOf(FormData);
        expect(formData.get("model")).toBe("lightning-image-turbo");
        expect(formData.get("prompt")).toBe("make the bicycle blue");
        expect(formData.get("n")).toBe("1");
        const image = formData.get("image");
        expect(image).toBeInstanceOf(Blob);
        expect((image as Blob).type).toBe("image/png");
        expect(Buffer.from(await (image as Blob).arrayBuffer())).toEqual(
            INPUT_IMAGE,
        );
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 1,
            totalTokenCount: 1,
        });
    });

    it("edits with four reference images", async () => {
        const urls = [
            "https://example.com/a.png",
            "https://example.com/b.png",
            "https://example.com/c.png",
            "https://example.com/d.png",
        ];
        let editInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (urls.includes(url.toString())) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            expect(url.toString()).toBe(EDITS_ENDPOINT);
            editInit = init;
            return successResponse();
        });

        const result = await callInferencePortImage(
            "combine these",
            { ...baseParams, image: urls },
            USER_INFO,
        );

        const formData = editInit?.body as FormData;
        expect(formData).toBeInstanceOf(FormData);
        expect(formData.get("model")).toBe("lightning-image-turbo");
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 1,
            totalTokenCount: 1,
        });
    });

    it("rejects more than four reference images before calling upstream", async () => {
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

    it("fails clearly when API key is missing", async () => {
        syncImageEnv({} as CloudflareBindings, []);

        await expect(
            callInferencePortImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toThrow("INFERENCEPORT_API_KEY");
    });
});
