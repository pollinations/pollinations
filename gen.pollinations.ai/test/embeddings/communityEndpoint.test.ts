import type {
    CommunityEndpointRuntime,
    ModelInputModality,
} from "@shared/community-endpoints.ts";
import {
    type CommunityEndpointModality,
    type CommunityEndpointVisibility,
    communityEndpointPrices,
} from "@shared/community-endpoints.ts";
import { MODEL_USED_HEADER } from "@shared/registry/usage-headers.ts";
import * as decryptSecretModule from "@shared/secret-encryption.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCommunityEmbeddings } from "../../src/embeddings/communityEndpoint.ts";

const SECRET = "test-better-auth-secret";

function buildRuntime(
    overrides: Partial<CommunityEndpointRuntime> = {},
): CommunityEndpointRuntime {
    return {
        id: "ep-1",
        ownerUserId: "user-1",
        modelId: "owner/bge",
        name: "bge",
        title: null,
        description: "Community embedding model",
        modality: "embedding" as CommunityEndpointModality,
        imagePricing: "request",
        inputModalities: ["text"] as ModelInputModality[],
        baseUrl: "https://example.com/v1",
        upstreamModel: "upstream-model",
        bearerTokenCiphertext: "ciphertext",
        visibility: "public" as CommunityEndpointVisibility,
        delegatesGeneration: false,
        fallbackModelIds: [],
        disabledAt: null,
        disabledReason: null,
        ...communityEndpointPrices({
            promptTextPrice: 0.00001,
            completionTextPrice: 0,
        }),
        ...overrides,
    } as CommunityEndpointRuntime;
}

function upstreamResponse(
    usage: { prompt_tokens: number; total_tokens: number } = {
        prompt_tokens: 5,
        total_tokens: 5,
    },
) {
    return new Response(
        JSON.stringify({
            object: "list",
            data: [
                { object: "embedding", embedding: [0.1, 0.2, 0.3], index: 0 },
            ],
            model: "upstream-model",
            usage,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
    );
}

describe("generateCommunityEmbeddings", () => {
    beforeEach(() => {
        vi.spyOn(decryptSecretModule, "decryptSecret").mockResolvedValue(
            "test-token",
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("forwards the request to the community embeddings endpoint", async () => {
        const endpoint = buildRuntime();
        const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
        vi.stubGlobal("fetch", fetchMock);

        const response = await generateCommunityEmbeddings(
            endpoint,
            { input: "hello" },
            "owner/bge",
            SECRET,
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://example.com/v1/embeddings");
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer test-token",
        );
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({
            model: "upstream-model",
            input: ["hello"],
        });
        expect(response.status).toBe(200);
    });

    it("emits prompt token usage headers for token-priced endpoints", async () => {
        const endpoint = buildRuntime();
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    upstreamResponse({ prompt_tokens: 7, total_tokens: 7 }),
                ),
        );

        const response = await generateCommunityEmbeddings(
            endpoint,
            { input: "hello" },
            "owner/bge",
            SECRET,
        );

        expect(response.headers.get(MODEL_USED_HEADER)).toBe("owner/bge");
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("7");
    });

    it("charges a flat per-request price for fixed-price endpoints", async () => {
        const endpoint = buildRuntime(
            communityEndpointPrices({
                promptTextPrice: 0,
                completionTextPrice: 0.02,
            }),
        );
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstreamResponse()));

        const response = await generateCommunityEmbeddings(
            endpoint,
            { input: "hello" },
            "owner/bge",
            SECRET,
        );

        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "1",
        );
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBeNull();
    });

    it("rejects task_type for community embedding models", async () => {
        const endpoint = buildRuntime();
        vi.stubGlobal("fetch", vi.fn());

        await expect(
            generateCommunityEmbeddings(
                endpoint,
                { input: "hello", task_type: "RETRIEVAL_QUERY" },
                "owner/bge",
                SECRET,
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("returns an empty list without calling upstream for empty input", async () => {
        const endpoint = buildRuntime();
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await generateCommunityEmbeddings(
            endpoint,
            { input: [] },
            "owner/bge",
            SECRET,
        );

        expect(fetchMock).not.toHaveBeenCalled();
        const body = (await response.json()) as {
            data: unknown[];
            usage: { prompt_tokens: number };
        };
        expect(body.data).toEqual([]);
        expect(body.usage.prompt_tokens).toBe(0);
    });

    it("requires token usage for token-priced endpoints", async () => {
        const endpoint = buildRuntime();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        object: "list",
                        data: [
                            {
                                object: "embedding",
                                embedding: [0.1, 0.2],
                                index: 0,
                            },
                        ],
                        model: "upstream-model",
                        usage: { prompt_tokens: 1, total_tokens: 2 },
                    }),
                    { status: 200 },
                ),
            ),
        );

        await expect(
            generateCommunityEmbeddings(
                endpoint,
                { input: "hello" },
                "owner/bge",
                SECRET,
            ),
        ).rejects.toMatchObject({ status: 502 });
    });
});
