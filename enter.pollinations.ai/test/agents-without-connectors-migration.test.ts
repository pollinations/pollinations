import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0079_agents-without-connectors.sql?raw";

describe("agents without Connectors migration", () => {
    it("drops Connectors from saved prompt agents and leaves everything else", async () => {
        await env.DB.prepare(`
            CREATE TABLE connectors_migration_community_endpoint (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT NOT NULL
            )
        `).run();
        const prompt = { systemPrompt: "Answer briefly.", baseModel: "openai" };
        const rows = new Map<string, [string, string]>([
            [
                "only-connectors",
                [
                    "prompt_agent",
                    JSON.stringify({ ...prompt, mcpServers: ["composio"] }),
                ],
            ],
            [
                "connectors-among-others",
                [
                    "prompt_agent",
                    JSON.stringify({
                        ...prompt,
                        mcpServers: ["computer", "composio", "exa"],
                    }),
                ],
            ],
            [
                "no-connectors",
                [
                    "prompt_agent",
                    JSON.stringify({ ...prompt, mcpServers: ["computer"] }),
                ],
            ],
            [
                "mentions-connectors",
                [
                    "prompt_agent",
                    JSON.stringify({
                        systemPrompt: "Never call composio.",
                        baseModel: "openai",
                        mcpServers: ["exa"],
                    }),
                ],
            ],
            ["missing-servers", ["prompt_agent", JSON.stringify(prompt)]],
            ["invalid-json", ["prompt_agent", '{"mcpServers":["composio"]']],
            [
                "code-agent",
                [
                    "code_agent",
                    JSON.stringify({
                        repository: "owner/agent",
                        mcpServers: ["composio"],
                    }),
                ],
            ],
        ]);
        await env.DB.batch(
            [...rows].map(([id, [type, payload]]) =>
                env.DB.prepare(
                    "INSERT INTO connectors_migration_community_endpoint VALUES (?, ?, ?)",
                ).bind(id, type, payload),
            ),
        );

        const statement = migrationSql.replace(
            /\bcommunity_endpoint\b/g,
            "connectors_migration_community_endpoint",
        );
        const readPayloads = async () => {
            const result = await env.DB.prepare(
                "SELECT id, payload FROM connectors_migration_community_endpoint",
            ).all<{ id: string; payload: string }>();
            return Object.fromEntries(
                result.results.map((row) => [row.id, row.payload]),
            );
        };
        await env.DB.prepare(statement).run();
        const payloads = await readPayloads();

        expect(JSON.parse(payloads["only-connectors"])).toEqual({
            ...prompt,
            mcpServers: [],
        });
        expect(JSON.parse(payloads["connectors-among-others"])).toEqual({
            ...prompt,
            mcpServers: ["computer", "exa"],
        });
        for (const id of [
            "no-connectors",
            "mentions-connectors",
            "missing-servers",
            "invalid-json",
            "code-agent",
        ]) {
            expect(payloads[id]).toBe(rows.get(id)?.[1]);
        }

        await env.DB.prepare(statement).run();
        expect(await readPayloads()).toEqual(payloads);
    });
});
