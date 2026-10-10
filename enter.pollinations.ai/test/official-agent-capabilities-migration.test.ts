import { env } from "cloudflare:test";
import {
    PROMPT_AGENT_BASE_URL_PLACEHOLDER,
    parseListingPayload,
} from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";
import officialAgentCapabilitiesSql from "../drizzle/deferred/official-agent-capabilities.sql?raw";

const FLORET = "e1363e66-54b8-49c3-a897-08d99629885f";
const POLLI = "3ba66897-e040-41b5-8cf5-7c561ee5c52f";
const MIDIJOURNEY = "9a0db868-29cb-4e78-9d44-ba2be6551337";
const OWNER = "LJVtOPiUl0C4uRku8kL8prpp95m8jLnt";

// Prompt agents are stored with the runtime placeholder URL and their own id
// as the upstream model; endpoint agents keep their real route.
const baseUrl = (name: string, type: string) =>
    type === "prompt_agent"
        ? PROMPT_AGENT_BASE_URL_PLACEHOLDER
        : `https://${name}.pollinations.ai/v1/chat/completions`;
const upstreamModel = (id: string, name: string, type: string) =>
    type === "prompt_agent" ? id : name;

describe("official agent capabilities repair", () => {
    it("declares Floret and Polli traits without touching modalities, routes or other listings", async () => {
        await env.DB.prepare(`INSERT INTO user
            (id, name, email, github_id, github_username)
            VALUES (?, 'Pollinations', 'agents@test.local', 314960022, 'pollinations-ai')`)
            .bind(OWNER)
            .run();
        const endpointAgentPayload = JSON.stringify({
            perUserRpm: null,
            api: "chat_completions",
        });
        const listings = [
            [FLORET, "floret", "endpoint_agent", endpointAgentPayload],
            [POLLI, "polli", "endpoint_agent", endpointAgentPayload],
            [
                MIDIJOURNEY,
                "midijourney",
                "prompt_agent",
                JSON.stringify({
                    systemPrompt: "Compose.",
                    baseModel: "openai",
                    mcpServers: [],
                }),
            ],
            // Same name as an official agent, different listing: left alone.
            [
                "other-floret",
                "floret-copy",
                "endpoint_agent",
                endpointAgentPayload,
            ],
        ] as const;
        await env.DB.batch(
            listings.map(([id, name, type, payload]) =>
                env.DB.prepare(`INSERT INTO community_endpoint
                    (id, owner_user_id, name, title, type, base_url, upstream_model, visibility, payload)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'public', ?)`).bind(
                    id,
                    OWNER,
                    name,
                    name,
                    type,
                    baseUrl(name, type),
                    upstreamModel(id, name, type),
                    payload,
                ),
            ),
        );
        const statements = officialAgentCapabilitiesSql
            .split(";")
            .map((statement) => statement.trim())
            .filter(Boolean);
        expect(statements).toHaveLength(2);
        const run = async () => {
            const changes = [];
            for (const statement of statements) {
                changes.push(
                    (await env.DB.prepare(statement).run()).meta.changes,
                );
            }
            return changes;
        };
        expect(await run()).toEqual([1, 1]);
        expect(await run()).toEqual([0, 0]);

        const { results } = await env.DB.prepare(
            "SELECT id, type, base_url, upstream_model, payload FROM community_endpoint ORDER BY id",
        ).all<{
            id: string;
            type: string;
            base_url: string;
            upstream_model: string;
            payload: string;
        }>();
        const byId = new Map(results.map((row) => [row.id, row]));
        expect(
            parseListingPayload("endpoint_agent", byId.get(FLORET)?.payload),
        ).toEqual({
            perUserRpm: null,
            api: "chat_completions",
            capabilities: [
                "web_search",
                "code_execution",
                "pollinations_models",
            ],
        });
        expect(
            parseListingPayload("endpoint_agent", byId.get(POLLI)?.payload),
        ).toEqual({
            perUserRpm: null,
            api: "chat_completions",
            capabilities: ["tool_calling", "web_search"],
        });
        expect(byId.get("other-floret")?.payload).toBe(endpointAgentPayload);
        expect(byId.get(MIDIJOURNEY)?.payload).toBe(listings[2][3]);
        for (const [id, name, type] of listings) {
            expect(byId.get(id)).toMatchObject({
                type,
                base_url: baseUrl(name, type),
                upstream_model: upstreamModel(id, name, type),
            });
        }
    });
});
