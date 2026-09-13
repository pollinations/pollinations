import { communityEndpointPrices } from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";
import { savedEndpointPriceKeys } from "../frontend/src/components/community-endpoints/price-table.tsx";
import {
    agentToForm,
    emptyAgentForm,
    emptyForm,
    endpointToForm,
    isValidPerUserRpm,
    type ProxyCommunityEndpoint,
    publicCommunityFallbackOptions,
    toAgentPayload,
    toAgentUpdatePayload,
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

    it.each([
        "responses",
        "chat_completions",
    ] as const)("serializes one exact %s text target", (api) => {
        const payload = toEndpointPayload({
            ...emptyForm,
            api,
            url: " https://example.com/endpoint?version=1 ",
        });
        expect(payload).toMatchObject({
            modality: "text",
            api,
            url: "https://example.com/endpoint?version=1",
        });
        expect(payload).not.toHaveProperty("baseUrl");
        expect(payload).not.toHaveProperty("responsesUrl");
    });

    it("keeps media on the base URL contract without a text API choice", () => {
        const payload = toEndpointPayload({
            ...emptyForm,
            modality: "image",
            api: "responses",
            url: "https://example.com/v1",
        });
        expect(payload).toMatchObject({
            modality: "image",
            baseUrl: "https://example.com/v1",
        });
        expect(payload).not.toHaveProperty("api");
        expect(payload).not.toHaveProperty("url");
    });

    it("serializes prompt-agent configuration and listing fields together", () => {
        expect(
            toAgentPayload({
                ...emptyAgentForm,
                name: " researcher ",
                title: " Researcher ",
                visibility: "public",
                systemPrompt: " Help ",
                baseModel: " openai ",
                mcpServers: ["pollinations"],
            }),
        ).toEqual({
            name: "researcher",
            title: "Researcher",
            description: "",
            visibility: "public",
            systemPrompt: "Help",
            baseModel: "openai",
            requiredSafetyFeatures: [],
            mcpServers: ["pollinations"],
        });
    });

    it("edits queued publication values instead of the current private values", () => {
        const endpoint: ProxyCommunityEndpoint = {
            id: "endpoint-id",
            modelId: "owner/model",
            name: "model",
            title: "Model",
            description: null,
            type: "proxy",
            modality: "text",
            imagePricing: "request",
            inputModalities: ["text"],
            advertised: {},
            perUserRpm: null,
            paidOnly: false,
            fallbacks: [],
            api: "responses",
            url: "https://example.com/v1/responses",
            upstreamModel: "model",
            requiredSafetyFeatures: [],
            visibility: "private",
            pending: {
                effectiveAt: "2026-08-28T12:00:00.000Z",
                visibility: "public",
                paidOnly: true,
                promptTextPrice: 0.000002,
                promptCachedPrice: 0.000001,
            },
            hidden: false,
            hiddenReason: null,
            hiddenAt: null,
            ...communityEndpointPrices({}),
        };
        const form = endpointToForm(endpoint);

        expect(form).toMatchObject({
            visibility: "public",
            paidOnly: true,
            promptTextPrice: "2",
            api: "responses",
            url: "https://example.com/v1/responses",
        });
        expect(savedEndpointPriceKeys(endpoint)).toContain("promptCachedPrice");
    });

    it("does not offer agent listings as fallback models", () => {
        expect(
            publicCommunityFallbackOptions([
                { name: "owner/model", type: "text", community: true },
                { name: "owner/video", type: "video", community: true },
                {
                    name: "owner/agent",
                    type: "text",
                    community: true,
                    agent: true,
                },
            ]),
        ).toEqual([
            { modelId: "owner/model", modality: "text" },
            { modelId: "owner/video", modality: "video" },
        ]);
    });

    it("keeps a public code agent public when editing its safety policy", () => {
        const form = agentToForm({
            id: "code-agent-id",
            type: "code_agent",
            name: "repo-agent",
            title: "Repo Agent",
            description: "From GitHub",
            visibility: "public",
            requiredSafetyFeatures: [],
            repository: "https://github.com/example/repo-agent",
            deployedCommitSha: "a".repeat(40),
            createdAt: "2026-09-01T00:00:00Z",
            updatedAt: "2026-09-01T00:00:00Z",
        });

        expect(
            toAgentUpdatePayload({
                ...form,
                requiredSafetyFeatures: ["violence"],
            }),
        ).toEqual({
            visibility: "public",
            requiredSafetyFeatures: ["violence"],
        });
    });

    it("creates code agents without editable listing identity or prompt configuration", () => {
        expect(
            toAgentPayload({
                ...emptyAgentForm,
                type: "code_agent",
                repository: " https://github.com/example/agent ",
                name: "unused-prompt-agent-name",
                title: "Unused title",
                description: "Unused description",
                systemPrompt: "Unused prompt",
            }),
        ).toEqual({
            type: "code_agent",
            repository: "https://github.com/example/agent",
            visibility: "private",
            requiredSafetyFeatures: [],
        });
    });
});
