import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callAzureFlux2,
    callAzureFluxKontext,
} from "../../src/image/models/azureFluxKontextModel.ts";
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
                {
                    status: 400,
                    headers: { "x-ms-request-id": "azure-request-400" },
                },
            ),
        );

        await expect(
            callAzureFluxKontext("bad ratio", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 400,
            upstreamStatus: 400,
            requestUrl: new URL(ENDPOINT),
            upstreamHeaders: { "x-ms-request-id": "azure-request-400" },
        });
    });

    it("maps moderation-worded upstream client errors to content policy", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                { error: { message: "Request blocked by content filter" } },
                {
                    status: 400,
                    headers: {
                        "x-ms-request-id": "azure-request-filtered-400",
                    },
                },
            ),
        );

        await expect(
            callAzureFluxKontext("blocked output", baseParams, USER_INFO),
        ).rejects.toMatchObject({
            status: 422,
            upstreamStatus: 400,
            errorCode: "content_policy_violation",
            requestUrl: new URL(ENDPOINT),
            upstreamHeaders: {
                "x-ms-request-id": "azure-request-filtered-400",
            },
        });
    });

    it("maps a filtered successful response without removing provider diagnostics", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    prompt: "private prompt must not be logged",
                    data: [
                        {
                            finish_reason: "content_filter",
                            content_filter_results: {
                                sexual: { filtered: true, severity: "high" },
                            },
                            revised_prompt: "private rewritten prompt",
                        },
                    ],
                },
                { headers: { "x-ms-request-id": "azure-request-filtered" } },
            ),
        );

        const error = await callAzureFluxKontext(
            "filtered request",
            baseParams,
            USER_INFO,
        ).catch((caught) => caught);

        expect(error).toMatchObject({
            status: 422,
            upstreamStatus: 200,
            errorCode: "content_policy_violation",
            requestUrl: new URL(ENDPOINT),
            upstreamHeaders: {
                "x-ms-request-id": "azure-request-filtered",
            },
        });
        expect(JSON.parse(error.responseBody)).toMatchObject({
            data: [
                {
                    finish_reason: "content_filter",
                    content_filter_results: {
                        sexual: { filtered: true, severity: "high" },
                    },
                    revised_prompt: "private rewritten prompt",
                },
            ],
            prompt: "private prompt must not be logged",
        });
    });

    it("preserves the complete response when Azure returns no image", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    data: [
                        {
                            source_url: "https://private.example/source.png",
                            unexpected: "metadata only",
                        },
                    ],
                    message: "generation completed without an image",
                },
                { headers: { "x-ms-request-id": "azure-request-empty" } },
            ),
        );

        const error = await callAzureFluxKontext(
            "unexpected response",
            baseParams,
            USER_INFO,
        ).catch((caught) => caught);

        expect(error).toMatchObject({
            status: 502,
            message: "Azure Flux Kontext returned no image",
            upstreamStatus: 200,
            requestUrl: new URL(ENDPOINT),
            upstreamHeaders: { "x-ms-request-id": "azure-request-empty" },
        });
        expect(JSON.parse(error.responseBody)).toMatchObject({
            data: [
                {
                    source_url: "https://private.example/source.png",
                    unexpected: "metadata only",
                },
            ],
            message: "generation completed without an image",
        });
    });
});

describe("callAzureFlux2", () => {
    it.each([
        ["flux-2-pro", "FLUX.2-pro", "flux-2-pro"],
        ["flux-2-flex", "FLUX.2-flex", "flux-2-flex"],
    ] as const)("routes %s with exact dimensions and provider-reported megapixels", async (model, upstreamModel, modelPath) => {
        let requestBody: Record<string, unknown> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            expect(url.toString()).toBe(
                `https://myceli-prod-eastus.cognitiveservices.azure.com/providers/blackforestlabs/v1/${modelPath}?api-version=preview`,
            );
            requestBody = JSON.parse(init?.body as string);
            return Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
                request_meta: {
                    cost: model === "flux-2-pro" ? 4.5 : 10,
                    input_mp: 0,
                    output_mp: 1.5,
                },
            });
        });

        const result = await callAzureFlux2(
            "wide landscape",
            {
                ...baseParams,
                model,
                width: 1008,
                height: 752,
                guidance_scale: 4.5,
            },
            USER_INFO,
        );

        expect(requestBody).toEqual({
            prompt: "wide landscape",
            model: upstreamModel,
            width: 1008,
            height: 752,
            seed: 42,
            guidance: 4.5,
            output_format: "png",
            num_images: 1,
        });
        expect(result.buffer.equals(OUTPUT_IMAGE)).toBe(true);
        expect(result.trackingData).toEqual({
            actualModel: model,
            usage: { completionImageTokens: 2 },
        });
    });

    it("forwards multiple references and bills Azure's rounded input units", async () => {
        const secondInputUrl = "https://example.com/reference-2.jpg";
        let requestBody: Record<string, unknown> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if ([INPUT_IMAGE_URL, secondInputUrl].includes(url.toString())) {
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/jpeg" },
                });
            }
            requestBody = JSON.parse(init?.body as string);
            return Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
                request_meta: { cost: 6, input_mp: 2, output_mp: 1 },
            });
        });

        const result = await callAzureFlux2(
            "combine them",
            {
                ...baseParams,
                model: "flux-2-pro",
                image: [INPUT_IMAGE_URL, secondInputUrl],
            },
            USER_INFO,
        );

        expect(requestBody).toMatchObject({
            input_image: INPUT_IMAGE.toString("base64"),
            input_image_2: INPUT_IMAGE.toString("base64"),
        });
        expect(result.trackingData.usage).toEqual({
            promptImageTokens: 2,
            completionImageTokens: 1,
        });
    });

    it.each([
        [{ width: 255, height: 1024 }, "at least 256px"],
        [{ width: 1000, height: 750 }, "multiples of 16px"],
        [{ width: 4112, height: 1024 }, "at most 4,194,304 pixels"],
    ])("rejects unsupported dimensions", async (dimensions, message) => {
        await expect(
            callAzureFlux2(
                "invalid size",
                {
                    ...baseParams,
                    ...dimensions,
                    model: "flux-2-pro",
                },
                USER_INFO,
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining(message),
        });
    });

    it("rejects references beyond the selected route limit", async () => {
        await expect(
            callAzureFlux2(
                "too many references",
                {
                    ...baseParams,
                    model: "flux-2-pro",
                    image: Array(9).fill(INPUT_IMAGE_URL),
                },
                USER_INFO,
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "FLUX.2 Pro supports at most 8 reference images",
        });
    });

    it("fails safely when Azure omits billing metadata", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                data: [{ b64_json: OUTPUT_IMAGE.toString("base64") }],
            }),
        );

        await expect(
            callAzureFlux2(
                "missing usage",
                { ...baseParams, model: "flux-2-flex" },
                USER_INFO,
            ),
        ).rejects.toMatchObject({
            status: 502,
            message: "Azure FLUX.2 Flex returned no billing metadata",
        });
    });

    it("maps a filtered response to a content policy error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                data: [
                    {
                        finish_reason: "content_filter",
                        content_filter_results: {
                            violence: { filtered: true, severity: "high" },
                        },
                    },
                ],
            }),
        );

        await expect(
            callAzureFlux2(
                "filtered request",
                { ...baseParams, model: "flux-2-pro" },
                USER_INFO,
            ),
        ).rejects.toMatchObject({
            status: 422,
            upstreamStatus: 200,
            errorCode: "content_policy_violation",
        });
    });
});
