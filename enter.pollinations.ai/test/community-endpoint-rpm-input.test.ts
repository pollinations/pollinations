import { communityEndpointPrices } from "@shared/community-endpoints.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PendingChangeNotice } from "../frontend/src/components/community-endpoints/community-endpoint-card.tsx";
import { savedEndpointPriceKeys } from "../frontend/src/components/community-endpoints/price-table.tsx";
import {
    agentListingToForm,
    emptyAgentForm,
    emptyForm,
    endpointToForm,
    isValidPerUserRpm,
    type ProxyCommunityEndpoint,
    publicCommunityFallbackOptions,
    toAgentListingPayload,
    toAgentPayload,
    toEndpointPayload,
    willCancelPendingChange,
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
            baseUrl: "https://example.com/v1",
            upstreamModel: "model",
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
        });
        expect(savedEndpointPriceKeys(endpoint)).toContain("promptCachedPrice");
        expect(willCancelPendingChange(endpoint, "private")).toBe(true);
        expect(willCancelPendingChange(endpoint, "public")).toBe(false);

        const notice = renderToStaticMarkup(
            createElement(PendingChangeNotice, { endpoint }),
        );
        expect(notice).toContain("Changes queued");
        expect(notice).toContain("Visibility:");
        expect(notice).toContain("Public");
        expect(notice).toContain("Paid Pollen only");
        expect(notice).toContain("Pricing:");
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

    // Create adds the type and agent id at the API call site; the reusable
    // listing form only emits fields that are also valid for updates.
    it("serializes agent listing details only", () => {
        const payload = toAgentListingPayload({
            ...agentListingToForm(),
            name: "researcher",
            title: "Researcher",
            visibility: "public",
            perUserRpm: "12",
        });
        expect(payload).toEqual({
            name: "researcher",
            title: "Researcher",
            description: "",
            visibility: "public",
        });
    });
});
