import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0068_model-permission-categories.sql?raw";

describe("model permission categories migration", () => {
    it("widens model IDs to their categories and is safe to rerun", async () => {
        await env.DB.batch([
            env.DB.prepare(
                "CREATE TABLE categories_apikey (id TEXT PRIMARY KEY, permissions TEXT)",
            ),
            env.DB.prepare(
                "CREATE TABLE categories_user (id TEXT PRIMARY KEY, github_username TEXT)",
            ),
            env.DB.prepare(
                "CREATE TABLE categories_endpoint (owner_user_id TEXT, name TEXT, type TEXT, payload TEXT)",
            ),
            env.DB.prepare(
                "INSERT INTO categories_user VALUES ('owner', 'Alice'), ('no-username', NULL)",
            ),
            env.DB.prepare(`INSERT INTO categories_endpoint VALUES
                ('owner', 'painter', 'proxy', '{"modality":"image"}'),
                ('owner', 'listener', 'proxy', '{"modality":"transcription"}'),
                ('owner', 'helper', 'agent', '{}'),
                ('owner', 'broken', 'proxy', 'not json'),
                ('no-username', 'orphan', 'proxy', '{"modality":"video"}')`),
        ]);
        const original = new Map<string, string | null>([
            [
                "ids",
                JSON.stringify({
                    models: [
                        "black-forest-labs/flux.1-schnell",
                        "openai/gpt-5-nano",
                        "flux",
                    ],
                    account: ["profile"],
                }),
            ],
            // The aliases `video` and `embedding` read as their categories.
            ["category-aliases", '{"models":["video","embedding"]}'],
            [
                "community",
                JSON.stringify({
                    models: [
                        "community/Alice/painter",
                        "community/Alice/listener",
                        "community/Alice/helper",
                        "community/Alice/broken",
                    ],
                }),
            ],
            ["unknown", '{"models":["retired-model","Alice/painter"]}'],
            ["invalid-entry", '{"models":["flux",null]}'],
            ["converted", '{"models":["text","image"]}'],
            ["empty", '{"models":[],"account":["profile"]}'],
            ["no-models", '{"account":["profile"]}'],
            ["invalid-json", '{"models":["flux"]'],
            ["not-array", '{"models":"flux"}'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...original].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO categories_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );
        const sql = migrationSql
            .replace(/\bapikey\b/g, "categories_apikey")
            .replace(/\bcommunity_endpoint\b/g, "categories_endpoint")
            .replace(/\buser\b/g, "categories_user");

        expect((await env.DB.prepare(sql).run()).meta.changes).toBe(4);
        const { results } = await env.DB.prepare(
            "SELECT id, permissions FROM categories_apikey",
        ).all<{ id: string; permissions: string | null }>();
        const permissions = Object.fromEntries(
            results.map(({ id, permissions }) => [id, permissions]),
        );
        expect(JSON.parse(permissions.ids ?? "")).toEqual({
            models: ["text", "image"],
            account: ["profile"],
        });
        expect(JSON.parse(permissions.community ?? "")).toEqual({
            models: ["text", "image", "audio"],
        });
        expect(JSON.parse(permissions.unknown ?? "")).toEqual({ models: [] });
        expect(JSON.parse(permissions["invalid-entry"] ?? "")).toEqual({
            models: ["image"],
        });
        for (const id of [
            "category-aliases",
            "converted",
            "empty",
            "no-models",
            "invalid-json",
            "not-array",
            "unrestricted",
        ]) {
            expect(permissions[id], id).toBe(original.get(id));
        }

        expect((await env.DB.prepare(sql).run()).meta.changes).toBe(0);
    });
});
