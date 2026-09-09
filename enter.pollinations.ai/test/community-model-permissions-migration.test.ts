import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0064_community-model-permissions.sql?raw";

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
