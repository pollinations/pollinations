import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import { callAzureMaiImage } from "../../src/image/models/azureMaiImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const GENERATIONS_ENDPOINT =
    "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images/generations";
const EDITS_ENDPOINT =
    "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images/edits";
const INPUT_IMAGE_URL = "https://example.com/reference.png";
const INPUT_IMAGE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const OUTPUT_IMAGE = Buffer.from("mai-output");
const USER_INFO = {} as AuthResult;

const baseParams: ImageParams = {
    model: "microsoft/mai-image-2.5-flash",
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

function successResponse(usage: Record<string, number>): Response {
    return Response.json({
        created: 1788561305,
        data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
        model: "MAI-Image-2.5-Flash",
        size: "1024x1024",
        usage,
    });
}

beforeEach(() => {
    syncImageEnv(
        { AZURE_MYCELI_PROD_API_KEY: "test-azure-key" } as CloudflareBindings,
        ["AZURE_MYCELI_PROD_API_KEY"],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callAzureMaiImage", () => {
    it("generates through the MAI route forwarding only the supported fields", async () => {
        let requestBody: Record<string, unknown> | undefined;
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                expect(url.toString()).toBe(GENERATIONS_ENDPOINT);
                expect(init?.headers).toMatchObject({
                    "api-key": "test-azure-key",
                    "Content-Type": "application/json",
                });
                requestBody = JSON.parse(init?.body as string);
                return successResponse({
                    num_output_tokens: 960,
                    num_input_text_tokens: 24,
                    num_input_image_tokens: 0,
                });
            });

        const result = await callAzureMaiImage(
            "a red bicycle",
            { ...baseParams, width: 1280, height: 768 },
            USER_INFO,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(requestBody).toEqual({
            model: "MAI-Image-2.5-Flash",
            prompt: "a red bicycle",
            width: 1280,
            height: 768,
        });
        expect(result.buffer.equals(OUTPUT_IMAGE)).toBe(true);
        expect(result.trackingData).toEqual({
            actualModel: "microsoft/mai-image-2.5-flash",
            usage: {
                promptTextTokens: 24,
                completionImageTokens: 960,
            },
        });
    });

    it("edits one safety-checked reference image through multipart form data", async () => {
        let editInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (url.toString() === INPUT_IMAGE_URL) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            expect(url.toString()).toBe(EDITS_ENDPOINT);
            editInit = init;
            return successResponse({
                num_output_tokens: 1024,
                num_input_text_tokens: 0,
                num_input_image_tokens: 1024,
            });
        });

        const result = await callAzureMaiImage(
            "make the bicycle blue",
            {
                ...baseParams,
                width: 512,
                height: 512,
                image: [INPUT_IMAGE_URL],
            },
            USER_INFO,
        );

        expect(editInit?.headers).toMatchObject({
            "api-key": "test-azure-key",
        });
        expect(editInit?.headers).not.toHaveProperty("Content-Type");
        const formData = editInit?.body as FormData;
        expect(formData).toBeInstanceOf(FormData);
        expect(formData.get("model")).toBe("MAI-Image-2.5-Flash");
        expect(formData.get("prompt")).toBe("make the bicycle blue");
        expect(formData.has("width")).toBe(false);
        expect(formData.has("height")).toBe(false);
        const image = formData.get("image");
        expect(image).toBeInstanceOf(Blob);
        expect((image as Blob).type).toBe("image/png");
        expect(Buffer.from(await (image as Blob).arrayBuffer())).toEqual(
            INPUT_IMAGE,
        );
        expect(result.trackingData.usage).toEqual({
            promptImageTokens: 1024,
            completionImageTokens: 1024,
        });
    });

    it("rejects more than one reference image before calling Azure", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callAzureMaiImage(
                "combine these",
                {
                    ...baseParams,
                    image: [INPUT_IMAGE_URL, "https://example.com/two.png"],
                },
                USER_INFO,
            ),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        [700, 1024, "at least 768px"],
        [1000, 1000, "multiples of 16px"],
        [1088, 1024, "1,048,576 pixels"],
    ])("rejects %ix%i generation dimensions before calling Azure", async (width, height, fragment) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callAzureMaiImage(
                "a lighthouse",
                { ...baseParams, width, height },
                USER_INFO,
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining(fragment),
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects transparent backgrounds before calling Azure", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callAzureMaiImage(
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

    it("maps Azure content safety rejections to a content policy error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    error: {
                        code: "content_safety_violation",
                        message:
                            "Response content blocked by label 'MultiSeverity_ViolenceScore'.",
                        details:
                            "Response content blocked by label 'MultiSeverity_ViolenceScore'.",
                    },
                },
                {
                    status: 400,
                    headers: { "x-ms-request-id": "azure-request-blocked" },
                },
            ),
        );

        await expect(
            callAzureMaiImage("blocked prompt", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 422,
            upstreamStatus: 400,
            errorCode: "content_policy_violation",
            message: expect.stringContaining("content_safety_violation"),
            requestUrl: new URL(GENERATIONS_ENDPOINT),
            upstreamHeaders: { "x-ms-request-id": "azure-request-blocked" },
        });
    });

    it("preserves other upstream client errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    error: {
                        code: "unsupported_request_value",
                        message: "'width' must be at least 768 pixels.",
                    },
                },
                { status: 400 },
            ),
        );

        await expect(
            callAzureMaiImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 400,
            upstreamStatus: 400,
            message: "'width' must be at least 768 pixels.",
        });
    });

    it("fails clearly when Azure returns no image", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ data: [] }),
        );

        await expect(
            callAzureMaiImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({ status: 502, upstreamStatus: 200 });
    });

    it("fails clearly when Azure returns an image without billable usage", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
            }),
        );

        await expect(
            callAzureMaiImage("a lighthouse", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 502,
            message: expect.stringContaining("billing"),
        });
    });
});
