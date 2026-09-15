import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentBody, agentsCommand } from "./agents.js";

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

    it("does not add listing fields or override config visibility through Commander defaults", () => {
        const directory = mkdtempSync(join(tmpdir(), "polli-code-agent-"));
        const config = join(directory, "code-agent.json");
        writeFileSync(
            config,
            JSON.stringify({
                type: "code_agent",
                repository: "https://github.com/example/agent",
                visibility: "public",
            }),
        );

        const create = agentsCommand.commands.find(
            (command) => command.name() === "create",
        );
        if (!create) throw new Error("Missing agents create command");
        create.parseOptions(["--config", config]);

        expect(agentBody(config, create.opts())).toEqual({
            type: "code_agent",
            repository: "https://github.com/example/agent",
            visibility: "public",
        });
    });
});
