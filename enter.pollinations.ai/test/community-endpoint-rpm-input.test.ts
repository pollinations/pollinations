import { describe, expect, it } from "vitest";
import {
    emptyAgentForm,
    emptyForm,
    isValidMcpRow,
    isValidPerUserRpm,
    publicCommunityFallbackOptions,
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
            }),
        ).toBe(true);
        expect(
            isValidMcpRow({
                id: "2",
                name: "docs",
                url: "ftp://mcp.example.com/rpc",
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
                    },
                ],
            }).mcpServers,
        ).toEqual([{ name: "docs", url: "https://mcp.example.com/rpc" }]);
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
                    },
                    {
                        id: "2",
                        name: "docs",
                        url: "https://two.example.com/mcp",
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
});
