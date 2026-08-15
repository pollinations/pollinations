import { describe, expect, it } from "vitest";
import {
    agentListingToForm,
    emptyAgentForm,
    emptyForm,
    isValidMcpRow,
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

    it("validates and normalizes agent MCP servers", () => {
        expect(
            isValidMcpRow({
                id: "1",
                name: "docs",
                url: "https://mcp.example.com/rpc/",
                headers: [],
            }),
        ).toBe(true);
        expect(
            isValidMcpRow({
                id: "2",
                name: "docs",
                url: "ftp://mcp.example.com/rpc",
                headers: [],
            }),
        ).toBe(false);
        expect(
            toAgentPayload({
                ...emptyAgentForm,
                systemPrompt: "Help",
                baseModel: "openai",
                mcpServers: [
                    {
                        id: "3",
                        name: "docs",
                        url: "https://mcp.example.com/rpc/",
                        headers: [
                            {
                                id: "header-1",
                                name: "Authorization",
                                value: "Bearer secret",
                                saved: false,
                            },
                            {
                                id: "header-2",
                                name: "X-Saved",
                                value: "",
                                saved: true,
                            },
                        ],
                    },
                ],
            }).mcpServers,
        ).toEqual([
            {
                name: "docs",
                url: "https://mcp.example.com/rpc",
                headers: {
                    Authorization: "Bearer secret",
                    "X-Saved": null,
                },
            },
        ]);
    });

    it("rejects duplicate agent MCP names", () => {
        expect(() =>
            toAgentPayload({
                ...emptyAgentForm,
                systemPrompt: "Help",
                baseModel: "openai",
                mcpServers: [
                    {
                        id: "1",
                        name: "docs",
                        url: "https://one.example.com/mcp",
                        headers: [],
                    },
                    {
                        id: "2",
                        name: "docs",
                        url: "https://two.example.com/mcp",
                        headers: [],
                    },
                ],
            }),
        ).toThrow('MCP server name "docs" is already in use');
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
        const payload = toAgentListingPayload({
            ...agentListingToForm(),
            name: "researcher",
            title: "Researcher",
            visibility: "public",
        });
        expect(payload).toMatchObject({
            modality: "text",
        });
        expect(payload).not.toHaveProperty("agentId");
        expect(payload).not.toHaveProperty("baseUrl");
        expect(payload).not.toHaveProperty("fallbackModelIds");
        expect(payload).not.toHaveProperty("promptTextPrice");
    });
});
