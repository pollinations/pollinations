import {
    canManageCommunityEndpoints,
    capCommunityUsage,
    communityChatCompletionsUrl,
    communityModelId,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";

describe("community endpoint helpers", () => {
    it("keeps the MVP tier gate disabled", () => {
        expect(canManageCommunityEndpoints(null)).toBe(true);
        expect(canManageCommunityEndpoints("microbe")).toBe(true);
    });

    it("normalizes bearer tokens with or without the scheme", () => {
        expect(normalizeCommunityEndpointBearerToken("sk_test")).toBe(
            "sk_test",
        );
        expect(
            normalizeCommunityEndpointBearerToken("  Bearer sk_test  "),
        ).toBe("sk_test");
        expect(() => normalizeCommunityEndpointBearerToken("Bearer ")).toThrow(
            "API bearer token is required",
        );
    });

    it("round-trips community model ids", () => {
        const modelId = communityModelId(
            "voodoohop",
            "provider/path/model-name",
        );

        expect(modelId).toBe("community/voodoohop/provider/path/model-name");
        expect(parseCommunityModelId(modelId)).toEqual({
            ownerGithubUsername: "voodoohop",
            modelName: "provider/path/model-name",
        });
        expect(parseCommunityModelId("openai")).toBeNull();
    });

    it("normalizes OpenAI-compatible endpoint URLs", () => {
        expect(
            normalizeCommunityEndpointBaseUrl("https://api.example.com/v1/"),
        ).toBe("https://api.example.com/v1");
        expect(
            normalizeCommunityEndpointBaseUrl(
                "https://api.example.com/v1?ignored=1#section",
            ),
        ).toBe("https://api.example.com/v1");
        expect(communityChatCompletionsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/chat/completions",
        );
        expect(
            communityChatCompletionsUrl(
                "https://api.example.com/v1/chat/completions",
            ),
        ).toBe("https://api.example.com/v1/chat/completions");
        expect(() =>
            normalizeCommunityEndpointBaseUrl("http://api.example.com/v1"),
        ).toThrow("Endpoint URL must use https");
        expect(() =>
            normalizeCommunityEndpointBaseUrl("https://localhost/v1"),
        ).toThrow("Endpoint URL cannot target a private host");
    });

    it("caps reported usage to the request estimate", () => {
        expect(
            capCommunityUsage(
                { contextLength: null },
                {
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 3,
                },
                {
                    prompt_tokens: 100,
                    completion_tokens: 100,
                    total_tokens: 200,
                },
            ),
        ).toEqual({
            prompt_tokens: 9,
            completion_tokens: 3,
            total_tokens: 12,
        });
    });
});
