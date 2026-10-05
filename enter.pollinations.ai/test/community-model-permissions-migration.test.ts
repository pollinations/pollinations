import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0065_community-model-permissions.sql?raw";
import officialAgentMigrationSql from "../drizzle/deferred/official-agent-permissions.sql?raw";
import officialAgentTransferSql from "../drizzle/deferred/official-agent-transfer.sql?raw";

describe("community model permission migration", () => {
    it("renames only existing community IDs without widening access and is safe to retry", async () => {
        await env.DB.batch([
            env.DB.prepare(
                "CREATE TABLE prefix_apikey (id TEXT PRIMARY KEY, permissions TEXT)",
            ),
            env.DB.prepare(
                "CREATE TABLE prefix_user (id TEXT PRIMARY KEY, github_username TEXT)",
            ),
            env.DB.prepare(
                "CREATE TABLE prefix_endpoint (owner_user_id TEXT, name TEXT, visibility TEXT, hidden_at INTEGER, type TEXT)",
            ),
            env.DB.prepare(
                "INSERT INTO prefix_user VALUES ('owner', 'Alice'), ('no-username', NULL)",
            ),
            env.DB.prepare(`INSERT INTO prefix_endpoint VALUES
                ('owner', 'text-model', 'public', NULL, 'proxy'),
                ('owner', 'upstream/image', 'private', 123, 'proxy'),
                ('owner', 'agent', 'public', NULL, 'agent'),
                ('no-username', 'unknown', 'public', NULL, 'proxy')`),
        ]);
        const original = new Map<string, string | null>([
            [
                "mixed",
                JSON.stringify({
                    models: [
                        "openai/gpt-5-nano",
                        "Alice/text-model",
                        "community/Alice/text-model",
                        "Alice/upstream/image",
                        "Alice/agent",
                        "unknown/model",
                    ],
                    account: ["profile", "usage"],
                    note: "Alice/text-model",
                }),
            ],
            [
                "canonical-first",
                JSON.stringify({
                    models: ["community/Alice/text-model", "Alice/text-model"],
                }),
            ],
            ["empty", '{"models":[],"account":["profile"]}'],
            ["null-models", '{"models":null}'],
            ["no-models", '{"account":["profile"]}'],
            ["invalid-json", '{"models":["Alice/text-model"]'],
            ["invalid-array", '{"models":["Alice/text-model",null]}'],
            ["not-array", '{"models":"Alice/text-model"}'],
            [
                "unknown",
                '{"models":["Alice/retired-model","google/gemini-3.7-flash"]}',
            ],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...original].map(([id, permissions]) =>
                env.DB.prepare("INSERT INTO prefix_apikey VALUES (?, ?)").bind(
                    id,
                    permissions,
                ),
            ),
        );
        // Exercise the single scan with many unrelated keys.
        await env.DB.prepare(`WITH RECURSIVE seq(x) AS (
            VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < 10000
        ) INSERT INTO prefix_apikey SELECT 'unrelated-' || x, '{"models":["openai/gpt-5-nano"]}' FROM seq`).run();
        const sql = migrationSql
            .replace(/\bapikey\b/g, "prefix_apikey")
            .replace(/\bcommunity_endpoint\b/g, "prefix_endpoint")
            .replace(/\buser\b/g, "prefix_user");
        expect((await env.DB.prepare(sql).run()).meta.changes).toBe(2);
        const { results } = await env.DB.prepare(
            "SELECT id, permissions FROM prefix_apikey WHERE id NOT LIKE 'unrelated-%'",
        ).all<{ id: string; permissions: string | null }>();
        const after = new Map(results.map((row) => [row.id, row.permissions]));
        expect(JSON.parse(after.get("mixed") as string)).toEqual({
            models: [
                "openai/gpt-5-nano",
                "community/Alice/text-model",
                "community/Alice/upstream/image",
                "community/Alice/agent",
                "unknown/model",
            ],
            account: ["profile", "usage"],
            note: "Alice/text-model",
        });
        expect(JSON.parse(after.get("canonical-first") as string)).toEqual({
            models: ["community/Alice/text-model"],
        });
        for (const [id, value] of original) {
            if (!["mixed", "canonical-first"].includes(id))
                expect(after.get(id)).toBe(value);
        }
        expect((await env.DB.prepare(sql).run()).meta.changes).toBe(0);
    });
});

describe("official agent permission transfer", () => {
    it("renames exact scopes, preserves other fields and order, and is safe to retry", async () => {
        await env.DB.prepare(
            "CREATE TABLE official_agent_keys (id TEXT PRIMARY KEY, permissions TEXT)",
        ).run();
        const oldPolli = "community/pollinations-router/polli";
        const newPolli = "community/pollinations-ai/polli";
        const oldFloret = "community/pollinations-router/floret";
        const newFloret = "community/pollinations-ai/floret";
        const oldMidi = "community/pollinations-router/midijourney";
        const newMidi = "community/pollinations-ai/midijourney";
        const original = new Map<string, string | null>([
            [
                "mixed",
                JSON.stringify({
                    models: [
                        oldPolli,
                        newPolli,
                        "openai/gpt-6-luna",
                        oldFloret,
                        oldMidi,
                    ],
                    account: ["profile"],
                    note: oldPolli,
                }),
            ],
            ["old-only", JSON.stringify({ models: [oldPolli] })],
            ["empty", JSON.stringify({ models: [] })],
            ["invalid", '{"models":["community/pollinations-router/polli"]'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...original].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO official_agent_keys VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );
        await env.DB.prepare(`WITH RECURSIVE seq(x) AS (
            VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < 10000
        ) INSERT INTO official_agent_keys SELECT 'unrelated-' || x, '{"models":["openai/gpt-6-luna"]}' FROM seq`).run();
        const statements = officialAgentMigrationSql
            .replace(/\bapikey\b/g, "official_agent_keys")
            .split(";")
            .map((statement) => statement.trim())
            .filter(Boolean);
        expect(statements).toHaveLength(3);
        const run = async () => {
            let changes = 0;
            for (const statement of statements) {
                changes += (await env.DB.prepare(statement).run()).meta.changes;
            }
            return changes;
        };
        expect(await run()).toBe(4);
        const { results } = await env.DB.prepare(
            "SELECT id, permissions FROM official_agent_keys WHERE id NOT LIKE 'unrelated-%'",
        ).all<{ id: string; permissions: string | null }>();
        const after = new Map(results.map((row) => [row.id, row.permissions]));
        expect(JSON.parse(after.get("mixed") as string)).toEqual({
            models: [newPolli, "openai/gpt-6-luna", newFloret, newMidi],
            account: ["profile"],
            note: oldPolli,
        });
        expect(JSON.parse(after.get("old-only") as string)).toEqual({
            models: [newPolli],
        });
        for (const id of ["empty", "invalid", "unrestricted"]) {
            expect(after.get(id)).toBe(original.get(id));
        }
        expect(await run()).toBe(0);
    });
});

describe("official agent ownership transfer", () => {
    it("moves only the three existing listings and preserves their IDs and routes", async () => {
        const source = "ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh";
        const destination = "LJVtOPiUl0C4uRku8kL8prpp95m8jLnt";
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO user
                (id, name, email, github_id, github_username, community_provider_name, community_provider_url)
                VALUES (?, 'Source', 'source@test.local', 240205932, 'pollinations-router', 'Pollinations', 'https://pollinations.ai/')`).bind(
                source,
            ),
            env.DB.prepare(`INSERT INTO user
                (id, name, email, github_id, github_username)
                VALUES (?, 'Destination', 'destination@test.local', 314960022, 'pollinations-ai')`).bind(
                destination,
            ),
        ]);
        const listingIds = [
            ["e1363e66-54b8-49c3-a897-08d99629885f", "floret"],
            ["9a0db868-29cb-4e78-9d44-ba2be6551337", "midijourney"],
            ["3ba66897-e040-41b5-8cf5-7c561ee5c52f", "polli"],
            ["unrelated-listing", "unrelated"],
        ] as const;
        await env.DB.batch(
            listingIds.map(([id, name]) =>
                env.DB.prepare(`INSERT INTO community_endpoint
                    (id, owner_user_id, name, title, base_url, upstream_model, visibility)
                    VALUES (?, ?, ?, ?, ?, ?, 'public')`).bind(
                    id,
                    source,
                    name,
                    name,
                    `https://${name}.example.com/v1`,
                    name,
                ),
            ),
        );
        const statements = officialAgentTransferSql
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
        expect(await run()).toEqual([1, 3]);
        const { results } =
            await env.DB.prepare(`SELECT id, owner_user_id, name,
            base_url, upstream_model FROM community_endpoint ORDER BY id`).all<{
                id: string;
                owner_user_id: string;
                name: string;
                base_url: string;
                upstream_model: string;
            }>();
        for (const row of results) {
            expect(row.owner_user_id).toBe(
                row.id === "unrelated-listing" ? source : destination,
            );
            expect(row.base_url).toBe(`https://${row.name}.example.com/v1`);
            expect(row.upstream_model).toBe(row.name);
        }
        expect(results.map((row) => row.id).sort()).toEqual(
            listingIds.map(([id]) => id).sort(),
        );
        const profile = await env.DB.prepare(`SELECT community_provider_name,
            community_provider_url FROM user WHERE id = ?`)
            .bind(destination)
            .first<{
                community_provider_name: string;
                community_provider_url: string;
            }>();
        expect(profile).toEqual({
            community_provider_name: "Pollinations",
            community_provider_url: "https://pollinations.ai/",
        });
        expect(await run()).toEqual([0, 0]);
    });
});
