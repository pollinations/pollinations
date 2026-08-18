import { describe, expect, it } from "vitest";
import {
    agentListingToForm,
    emptyAgentForm,
    emptyForm,
    isValidPerUserRpm,
    publicCommunityFallbackOptions,
    toAgentListingPayload,
    toAgentPayload,
    toEndpointPayload,
} from "../frontend/src/components/community-endpoints/types.ts";

describe("community endpoint per-user RPM input", () => {
    it("serializes an exact limit or no limit", () => {
        expect(
            toEndpointPayload({ ...emptyForm, perUserRpm: "12" }).perUserRpm,
        ).toBe(12);
        expect(toEndpointPayload(emptyForm).perUserRpm).toBeNull();
    });

    it("accepts positive whole and fractional rates", () => {
        expect(isValidPerUserRpm("1")).toBe(true);
        expect(isValidPerUserRpm("0.5")).toBe(true);
        expect(isValidPerUserRpm("0")).toBe(false);
    });

    it("serializes the prompt-agent fields", () => {
        expect(
            toAgentPayload({
                ...emptyAgentForm,
                systemPrompt: " Help ",
                baseModel: " openai ",
                mcpServers: ["pollinations"],
            }),
        ).toEqual({
            systemPrompt: "Help",
            baseModel: "openai",
            mcpServers: ["pollinations"],
        });
    });

    it("does not offer agent listings as fallback models", () => {
        expect(
            publicCommunityFallbackOptions([
                { name: "owner/model", type: "text", community: true },
                {
                    name: "owner/agent",
                    type: "text",
                    community: true,
                    agent: true,
                },
            ]),
        ).toEqual([{ modelId: "owner/model", modality: "text" }]);
    });

    it("serializes agent listings without prices or fallbacks", () => {
        const payload = toAgentListingPayload(
            {
                ...agentListingToForm(),
                name: "researcher",
                title: "Researcher",
                visibility: "public",
                perUserRpm: "12",
            },
            ["text", "image"],
        );
        expect(payload).toMatchObject({
            modality: "text",
            inputModalities: ["text", "image"],
            perUserRpm: null,
        });
        expect(payload).not.toHaveProperty("agentId");
        expect(payload).not.toHaveProperty("baseUrl");
        expect(payload).not.toHaveProperty("fallbackModelIds");
        expect(payload).not.toHaveProperty("promptTextPrice");
    });
});
