import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type AuthResult,
    callGPTImage,
} from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import type { HttpError } from "../../src/image/httpError.ts";
import type { ImageParams } from "../../src/image/params.ts";

const AZURE_KEY_ENV = {
    AZURE_MYCELI_PROD_IMG_2_SWEDEN_API_KEY: "img-2-sweden-key",
    AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY: "img-2-eastus2-key",
} as const;

const AZURE_KEY_NAMES = Object.keys(
    AZURE_KEY_ENV,
) as (keyof typeof AZURE_KEY_ENV)[];

const EXPECTED_HOSTS = new Set([
    "myceli-prod-img-2-swedencentral.cognitiveservices.azure.com",
    "myceli-prod-img-2-eastus2.cognitiveservices.azure.com",
]);

const params: ImageParams = {
    model: "openai/gpt-image-2",
    width: 1024,
    height: 1024,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "low",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
};

const userInfo: AuthResult = {
    tokenAuth: true,
    userId: "test-user",
};

function successResponse(): Response {
    return Response.json({
        data: [{ b64_json: "AQID" }],
        usage: {
            input_tokens: 10,
            output_tokens: 20,
            input_tokens_details: { text_tokens: 10, image_tokens: 0 },
        },
    });
}

/** Client error, rate limit, and a timeout that may already have been billed. */
const UPSTREAM_FAILURES = [400, 429, 524];

syncImageEnv(AZURE_KEY_ENV as CloudflareBindings, AZURE_KEY_NAMES);

afterEach(() => {
    vi.restoreAllMocks();
});

describe("openai/gpt-image-2 Azure routing", () => {
    it("round robins across all Azure endpoints", async () => {
        const urls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            urls.push(String(input));
            return successResponse();
        });

        for (let index = 0; index < EXPECTED_HOSTS.size; index++) {
            await callGPTImage("test", params, userInfo, "openai/gpt-image-2");
        }

        expect(new Set(urls.map((url) => new URL(url).host))).toEqual(
            EXPECTED_HOSTS,
        );
        expect(urls.every((url) => url.includes("api-version="))).toBe(true);
    });

    // A second region would pay Azure for a second image, and a timeout is
    // exactly the case where the first one may already have been generated.
    for (const status of UPSTREAM_FAILURES) {
        it(`fails a ${status} to the caller instead of trying another region`, async () => {
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockResolvedValue(
                    new Response("upstream said no", { status }),
                );

            await expect(
                callGPTImage("test", params, userInfo, "openai/gpt-image-2"),
            ).rejects.toMatchObject({ status } satisfies Partial<HttpError>);
            expect(fetchMock).toHaveBeenCalledOnce();
        });
    }
});
