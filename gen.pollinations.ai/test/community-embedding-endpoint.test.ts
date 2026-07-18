import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
} from "@shared/community-endpoints.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCommunityEmbeddings } from "@/embeddings/communityEndpoint.ts";

const SECRET = "test-secret";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("community embedding endpoint", () => {
    it("uses fixed request billing when upstream usage is absent", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);
                expect(request.headers.get("authorization")).toBe(
                    "Bearer sk_upstream",
                );
                return Response.json({
                    object: "list",
                    data: [
                        {
                            object: "embedding",
                            embedding: [0.1, 0.2],
                            index: 0,
                        },
                    ],
                });
            }),
        );

        const response = await generateCommunityEmbeddings(
            await endpoint({ completionTextPrice: 0.02 }),
            {
                model: "owner/model",
                input: "hello",
                encoding_format: "float",
            },
            "owner/model",
            SECRET,
        );

        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "1",
        );
        await expect(response.json()).resolves.toMatchObject({
            model: "owner/model",
            usage: { prompt_tokens: 0, total_tokens: 0 },
        });
    });

    it("requires usage from token-priced endpoints", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    object: "list",
                    data: [
                        {
                            object: "embedding",
                            embedding: [0.1, 0.2],
                            index: 0,
                        },
                    ],
                }),
            ),
        );

        await expect(
            generateCommunityEmbeddings(
                await endpoint({ promptTextPrice: 0.000002 }),
                {
                    model: "owner/model",
                    input: "hello",
                    encoding_format: "float",
                },
                "owner/model",
                SECRET,
            ),
        ).rejects.toThrow("token usage required by its pricing");
    });
});

async function endpoint(
    prices: Parameters<typeof communityEndpointPrices>[0],
): Promise<CommunityEndpointRuntime> {
    return {
        id: "endpoint-id",
        ownerUserId: "owner-id",
        modelId: "owner/model",
        name: "model",
        description: null,
        modality: "embedding",
        baseUrl: "https://api.example.com/v1",
        upstreamModel: "upstream-model",
        bearerTokenCiphertext: await encryptSecret("sk_upstream", SECRET),
        visibility: "public",
        disabledAt: null,
        disabledReason: null,
        ...communityEndpointPrices(prices),
    };
}
