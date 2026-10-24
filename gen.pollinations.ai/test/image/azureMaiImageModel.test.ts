import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import { callAzureMaiImage } from "../../src/image/models/azureMaiImageModel.ts";
import { callMaiVercelImage } from "../../src/image/models/maiVercelModel.ts";
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
    model: "microsoft/mai-image-2.6-flash",
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
        model: "MAI-Image-2.6-Flash",
        size: "1024x1024",
        usage,
    });
}

beforeEach(() => {
    // The Workers env fills process.env as in production. These tests cover
    // the provider call alone, so Content Safety stays unconfigured.
    vi.stubEnv("AZURE_CONTENT_SAFETY_ENDPOINT", "");
    syncImageEnv(
        {
            AZURE_MYCELI_PROD_API_KEY: "test-azure-key",
            AI_GATEWAY_API_KEY: "test-gateway-key",
        } as CloudflareBindings,
        ["AZURE_MYCELI_PROD_API_KEY", "AI_GATEWAY_API_KEY"],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("callAzureMaiImage", () => {
    it.each([
        ["microsoft/mai-image-2.6-flash", "MAI-Image-2.6-Flash"],
        ["microsoft/mai-image-2.6", "MAI-Image-2.6"],
    ] as const)(
        "routes %s to its exact Azure deployment",
        async (model, deployment) => {
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (url, init) => {
                    expect(url.toString()).toBe(GENERATIONS_ENDPOINT);
                    expect(init?.headers).toMatchObject({
                        "api-key": "test-azure-key",
                    });
                    expect(JSON.parse(init?.body as string)).toEqual({
                        model: deployment,
                        prompt: "a red bicycle",
                        width: 1024,
                        height: 1024,
                    });
                    return successResponse({
                        num_output_tokens: 1024,
                        num_input_text_tokens: 24,
                        num_input_image_tokens: 0,
                    });
                },
            );

            const result = await callAzureMaiImage(
                "a red bicycle",
                { ...baseParams, model },
                USER_INFO,
            );
            expect(result.trackingData).toEqual({
                actualModel: model,
                usage: { promptTextTokens: 24, completionImageTokens: 1024 },
            });
        },
    );

    it("accepts the 2.6 maximum size", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            successResponse({
                num_output_tokens: 2304,
                num_input_text_tokens: 12,
                num_input_image_tokens: 0,
            }),
        );
        const params = {
            ...baseParams,
            model: "microsoft/mai-image-2.6-flash" as const,
            width: 1536,
            height: 1536,
        };

        await expect(
            callAzureMaiImage("a poster", params, USER_INFO),
        ).resolves.toMatchObject({
            trackingData: { usage: { completionImageTokens: 2304 } },
        });
        expect(fetchSpy).toHaveBeenCalledOnce();
    });

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
            model: "MAI-Image-2.6-Flash",
            prompt: "a red bicycle",
            width: 1280,
            height: 768,
        });
        expect(result.buffer.equals(OUTPUT_IMAGE)).toBe(true);
        expect(result.trackingData).toEqual({
            actualModel: "microsoft/mai-image-2.6-flash",
            usage: {
                promptTextTokens: 24,
                completionImageTokens: 960,
            },
        });
    });

    it("edits with every safety-checked reference image through multipart form data", async () => {
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
                image: [INPUT_IMAGE_URL, INPUT_IMAGE_URL],
            },
            USER_INFO,
        );

        expect(editInit?.headers).toMatchObject({
            "api-key": "test-azure-key",
        });
        expect(editInit?.headers).not.toHaveProperty("Content-Type");
        const formData = editInit?.body as FormData;
        expect(formData).toBeInstanceOf(FormData);
        expect(formData.get("model")).toBe("MAI-Image-2.6-Flash");
        expect(formData.get("prompt")).toBe("make the bicycle blue");
        expect(formData.has("width")).toBe(false);
        expect(formData.has("height")).toBe(false);
        const images = formData.getAll("image");
        expect(images).toHaveLength(2);
        for (const image of images) {
            expect(image).toBeInstanceOf(Blob);
            expect((image as Blob).type).toBe("image/png");
            expect(Buffer.from(await (image as Blob).arrayBuffer())).toEqual(
                INPUT_IMAGE,
            );
        }
        expect(result.trackingData.usage).toEqual({
            promptImageTokens: 1024,
            completionImageTokens: 1024,
        });
    });

    it.each([[1000, 1000, "multiples of 16px"]])(
        "rejects %ix%i generation dimensions before calling Azure",
        async (width, height, fragment) => {
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
        },
    );

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

describe("MAI Image 2.6 Vercel fallback", () => {
    const response = {
        images: [OUTPUT_IMAGE.toString("base64")],
        usage: { inputTokens: 5120, outputTokens: 1024, totalTokens: 6144 },
        providerMetadata: {
            azure: { images: [{ textTokens: 0, imageTokens: 5120 }] },
            gateway: { cost: "0.079872" },
        },
    };

    it.each([1024, 1536])(
        "preserves %i generation dimensions and the Azure-only pin",
        async (size) => {
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (url, init) => {
                    expect(url.toString()).toBe(
                        "https://ai-gateway.vercel.sh/v4/ai/image-model",
                    );
                    expect(new Headers(init?.headers).get("ai-model-id")).toBe(
                        "microsoft/mai-image-2.6",
                    );
                    const body = JSON.parse(init?.body as string);
                    expect(body).toMatchObject({
                        size: `${size}x${size}`,
                        n: 1,
                        providerOptions: { gateway: { only: ["azure"] } },
                    });
                    expect(body).not.toHaveProperty("seed");
                    return Response.json({
                        ...response,
                        usage: { inputTokens: 10, outputTokens: 1024 },
                        providerMetadata: {
                            azure: {
                                images: [{ textTokens: 10, imageTokens: 0 }],
                            },
                            gateway: { cost: "0.038962" },
                        },
                    });
                },
            );
            const result = await callMaiVercelImage(
                "a circle",
                {
                    ...baseParams,
                    model: "microsoft/mai-image-2.6:vercel",
                    width: size,
                    height: size,
                },
                USER_INFO,
            );
            expect(result.trackingData).toEqual({
                actualModel: "microsoft/mai-image-2.6:vercel",
                usage: {
                    promptTextTokens: 10,
                    promptImageTokens: 0,
                    completionImageTokens: 1024,
                },
                providerBilling: { units: 0.038962, unitCost: 1 },
            });
        },
    );

    it("sends all five references without edit dimensions and retains modality usage", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (url.toString() === INPUT_IMAGE_URL)
                return new Response(INPUT_IMAGE, {
                    headers: { "Content-Type": "image/png" },
                });
            const body = JSON.parse(init?.body as string);
            expect(body.files).toEqual(
                Array.from({ length: 5 }, () => ({
                    type: "file",
                    data: INPUT_IMAGE.toString("base64"),
                    mediaType: "image/png",
                })),
            );
            expect(body).not.toHaveProperty("size");
            return Response.json(response);
        });
        const result = await callMaiVercelImage(
            "make it blue",
            {
                ...baseParams,
                model: "microsoft/mai-image-2.6:vercel",
                image: Array(5).fill(INPUT_IMAGE_URL),
            },
            USER_INFO,
        );
        expect(result.buffer).toEqual(OUTPUT_IMAGE);
        expect(result.trackingData).toEqual({
            actualModel: "microsoft/mai-image-2.6:vercel",
            usage: {
                promptTextTokens: 0,
                promptImageTokens: 5120,
                completionImageTokens: 1024,
            },
            providerBilling: { units: 0.079872, unitCost: 1 },
        });
    });

    it.each([
        { ...response, providerMetadata: { gateway: { cost: "0.079872" } } },
        {
            ...response,
            providerMetadata: {
                ...response.providerMetadata,
                gateway: { cost: "invalid" },
            },
        },
        { ...response, usage: { outputTokens: 0 } },
    ])("rejects missing or invalid billing metadata", async (invalid) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(invalid));
        await expect(
            callMaiVercelImage(
                "a circle",
                { ...baseParams, model: "microsoft/mai-image-2.6:vercel" },
                USER_INFO,
            ),
        ).rejects.toMatchObject({ status: 502 });
    });
});
