import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentBody } from "./agents.js";

describe("agentBody", () => {
    it("combines prompt config with listing fields", () => {
        const directory = mkdtempSync(join(tmpdir(), "polli-agent-"));
        const config = join(directory, "agent.json");
        writeFileSync(
            config,
            JSON.stringify({
                systemPrompt: "Answer briefly.",
                baseModel: "openai-fast",
                mcpServers: ["pollinations"],
            }),
        );

        expect(
            agentBody(config, {
                name: "brief-agent",
                title: "Brief Agent",
                description: "Concise answers",
                visibility: "private",
            }),
        ).toEqual({
            systemPrompt: "Answer briefly.",
            baseModel: "openai-fast",
            mcpServers: ["pollinations"],
            name: "brief-agent",
            title: "Brief Agent",
            description: "Concise answers",
            visibility: "private",
        });
    });

    it("builds a public GitHub source request without reading a config file", () => {
        expect(
            agentBody(undefined, {
                repo: "https://github.com/example/research-agent",
                manifest: "agents/research.json",
                name: "research-agent",
                title: "Research Agent",
                visibility: "public",
            }),
        ).toEqual({
            source: {
                repositoryUrl: "https://github.com/example/research-agent",
                manifestPath: "agents/research.json",
            },
            name: "research-agent",
            title: "Research Agent",
            visibility: "public",
        });
    });
});
