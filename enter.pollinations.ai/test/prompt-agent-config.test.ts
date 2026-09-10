import { PromptAgentConfigSchema } from "@shared/community-endpoints.ts";
import { MCP_SERVER_IDS } from "@shared/registry/mcp.ts";
import { describe, expect, it } from "vitest";
import { PromptAgentInputSchema } from "../src/services/prompt-agent.ts";

describe("prompt-agent config", () => {
    const config = {
        systemPrompt: "You are a test agent.",
        baseModel: "openai",
        mcpServers: [],
    };

    it("rejects custom MCP configuration on write", () => {
        expect(
            PromptAgentInputSchema.safeParse({
                ...config,
                mcpServers: [{ name: "docs", url: "https://mcp.example.com" }],
            }).success,
        ).toBe(false);
    });

    it("accepts MCP servers from the built-in registry", () => {
        expect(
            PromptAgentConfigSchema.parse({
                ...config,
                mcpServers: MCP_SERVER_IDS,
            }),
        ).toEqual({ ...config, mcpServers: MCP_SERVER_IDS });
    });

    it("rejects duplicate built-in MCP servers", () => {
        const result = PromptAgentInputSchema.safeParse({
            ...config,
            mcpServers: ["pollinations", "pollinations"],
        });

        expect(result.error?.issues).toContainEqual(
            expect.objectContaining({
                message: "Duplicate MCP servers are not allowed",
            }),
        );
    });
});
