import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import { callAzureFluxKontext } from "../../src/image/models/azureFluxKontextModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com/providers/blackforestlabs/v1/flux-kontext-pro?api-version=preview";
const INPUT_IMAGE_URL = "https://example.com/reference.jpg";
const INPUT_IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
const OUTPUT_IMAGE = Buffer.from("kontext-output");
const USER_INFO = {} as AuthResult;

const baseParams: ImageParams = {
    model: "kontext",
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
    syncImageEnv(
        { AZURE_MYCELI_PROD_API_KEY: "test-azure-key" } as CloudflareBindings,
        ["AZURE_MYCELI_PROD_API_KEY"],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callAzureFluxKontext", () => {
    it("generates through the Azure BFL route with the requested aspect ratio", async () => {
        let requestBody: Record<string, unknown> | undefined;
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                expect(url.toString()).toBe(ENDPOINT);
                expect(init?.headers).toMatchObject({
                    Authorization: "Bearer test-azure-key",
                    "Content-Type": "application/json",
                });
                requestBody = JSON.parse(init?.body as string);
                return Response.json({
                    data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
                });
            });

        const result = await callAzureFluxKontext(
            "wide landscape",
            { ...baseParams, width: 1792, height: 1024 },
            USER_INFO,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(requestBody).toEqual({
            prompt: "wide landscape",
            model: "FLUX.1-Kontext-pro",
            output_format: "png",
            num_images: 1,
            aspect_ratio: "7:4",
        });
        expect(result.buffer.equals(OUTPUT_IMAGE)).toBe(true);
        expect(result.trackingData).toMatchObject({
            actualModel: "kontext",
            usage: { completionImageTokens: 1 },
        });
    });

    it("edits through the same route with the safety-checked image as base64", async () => {
        let requestBody: Record<string, unknown> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (url.toString() === INPUT_IMAGE_URL) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/jpeg" },
                });
            }
            expect(url.toString()).toBe(ENDPOINT);
            requestBody = JSON.parse(init?.body as string);
            return Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
            });
        });

        await callAzureFluxKontext(
            "make it red",
            { ...baseParams, image: [INPUT_IMAGE_URL] },
            USER_INFO,
        );

        expect(requestBody).toEqual({
            prompt: "make it red",
            model: "FLUX.1-Kontext-pro",
            output_format: "png",
            num_images: 1,
            input_image: INPUT_IMAGE.toString("base64"),
        });
    });

    it("preserves upstream client errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                { error: { message: "aspect ratio is out of range" } },
                { status: 400 },
            ),
        );

        await expect(
            callAzureFluxKontext("bad ratio", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 400,
            upstreamUrl: ENDPOINT,
        });
    });
});
