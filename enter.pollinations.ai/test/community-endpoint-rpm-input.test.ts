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

    // Exhaustive on purpose: an agent listing is identity and nothing else, so
    // anything the form still carries — a typed RPM here — has nowhere to go.
    it("serializes agent listings as identity only", () => {
        const payload = toAgentListingPayload({
            ...agentListingToForm(),
            name: "researcher",
            title: "Researcher",
            visibility: "public",
            perUserRpm: "12",
        });
        expect(payload).toEqual({
            type: "prompt_agent",
            name: "researcher",
            title: "Researcher",
            description: "",
            visibility: "public",
        });
    });
});
