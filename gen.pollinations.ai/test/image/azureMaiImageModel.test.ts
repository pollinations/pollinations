import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import type { HttpError } from "../../src/image/httpError.ts";
import { callAzureMaiImage } from "../../src/image/models/azureMaiImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const IMAGE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

const userInfo: AuthResult = {
    tokenAuth: true,
    userId: "test-user",
    username: "test-user",
};

function params(overrides: Partial<ImageParams> = {}): ImageParams {
    return {
        model: "mai-image-2.5-flash",
        width: 1024,
        height: 1024,
        dimensionsExplicit: true,
        seed: 42,
        safe: false,
        quality: "medium",
        image: [],
        transparent: false,
        reasoning: "balanced",
        audio: false,
        ...overrides,
    };
}

function successResponse(usage: Record<string, number>): Response {
    return Response.json({
        data: [{ b64_json: IMAGE_PNG.toString("base64") }],
        usage,
    });
}

syncImageEnv(
    {
        AZURE_MYCELI_PROD_API_KEY: "azure-key",
        AZURE_CONTENT_SAFETY_API_KEY: "",
        AZURE_CONTENT_SAFETY_ENDPOINT: "",
    } as CloudflareBindings,
    [
        "AZURE_MYCELI_PROD_API_KEY",
        "AZURE_CONTENT_SAFETY_API_KEY",
        "AZURE_CONTENT_SAFETY_ENDPOINT",
    ],
);

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Azure MAI image model", () => {
    it("generates an image and maps every usage field", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            successResponse({
                num_input_text_tokens: 26,
                num_input_image_tokens: 0,
                num_output_tokens: 1024,
            }),
        );

        const result = await callAzureMaiImage(
            "A developer workstation",
            params(),
            userInfo,
        );

        expect(result.buffer).toEqual(IMAGE_PNG);
        expect(result.trackingData).toEqual({
            actualModel: "mai-image-2.5-flash",
            usage: {
                promptTextTokens: 26,
                promptImageTokens: 0,
                completionImageTokens: 1024,
                totalTokenCount: 1050,
            },
        });

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(
            "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images/generations",
        );
        expect(init?.headers).toMatchObject({
            "api-key": "azure-key",
            "Content-Type": "application/json",
        });
        expect(JSON.parse(String(init?.body))).toEqual({
            model: "MAI-Image-2.5-Flash",
            prompt: "A developer workstation",
            width: 1024,
            height: 1024,
        });
    });

    it("edits one PNG reference image through multipart form data", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                if (String(input) === "https://example.com/input.png") {
                    return new Response(IMAGE_PNG, {
                        headers: { "Content-Type": "image/png" },
                    });
                }
                return successResponse({
                    num_input_text_tokens: 0,
                    num_input_image_tokens: 1024,
                    num_output_tokens: 1024,
                });
            });

        const result = await callAzureMaiImage(
            "Change the flower to red",
            params({ image: ["https://example.com/input.png"] }),
            userInfo,
        );

        expect(result.trackingData.usage).toMatchObject({
            promptTextTokens: 0,
            promptImageTokens: 1024,
            completionImageTokens: 1024,
        });
        const [url, init] = fetchMock.mock.calls[1];
        expect(String(url)).toBe(
            "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images/edits",
        );
        expect(init?.body).toBeInstanceOf(FormData);
        const formData = init?.body as FormData;
        expect(formData.get("model")).toBe("MAI-Image-2.5-Flash");
        expect(formData.get("prompt")).toBe("Change the flower to red");
        expect(formData.get("image")).toBeInstanceOf(Blob);
    });

    it("rejects multiple reference images instead of dropping extras", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");

        await expect(
            callAzureMaiImage(
                "Edit this",
                params({
                    image: [
                        "https://example.com/one.png",
                        "https://example.com/two.png",
                    ],
                }),
                userInfo,
            ),
        ).rejects.toMatchObject({ status: 400 } satisfies Partial<HttpError>);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("preserves upstream error status without trying another route", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("rate limited", { status: 429 }));

        await expect(
            callAzureMaiImage("test", params(), userInfo),
        ).rejects.toMatchObject({ status: 429 } satisfies Partial<HttpError>);
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});
