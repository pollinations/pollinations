import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0050_canonicalize-zimage-fal-permissions.sql?raw";

describe("canonicalize Z-Image Fal permissions migration", () => {
    it("replaces zimage-fal with zimage without changing unrelated permissions", async () => {
        await env.DB.prepare(`
            CREATE TABLE zimage_route_migration_apikey (
                id TEXT PRIMARY KEY,
                permissions TEXT
            )
        `).run();
        await env.DB.prepare(`
            WITH RECURSIVE seq(x) AS (
                VALUES(1)
                UNION ALL
                SELECT x + 1 FROM seq WHERE x < 10000
            )
            INSERT INTO zimage_route_migration_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('flux', 'openai'), 'role', 'keep')
            FROM seq
        `).run();
        const rows = new Map<string, string | null>([
            [
                "alias-only",
                JSON.stringify({ models: ["zimage-fal"], note: "keep" }),
            ],
            [
                "old-and-new",
                JSON.stringify({
                    models: [
                        "unknown-model",
                        "zimage-fal",
                        "owner/community-model",
                        "zimage",
                    ],
                    account: ["profile"],
                }),
            ],
            ["alias-elsewhere", JSON.stringify({ note: "zimage-fal" })],
            ["missing-models", JSON.stringify({ note: "keep" })],
            ["non-array", JSON.stringify({ models: "zimage-fal" })],
            ["invalid-json", '{"models":["zimage-fal"]'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...rows].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO zimage_route_migration_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const statement = migrationSql.replace(
            /\bapikey\b/g,
            "zimage_route_migration_apikey",
        );
        await env.DB.prepare(statement).run();

        const migrated = await env.DB.prepare(`
            SELECT id, permissions
            FROM zimage_route_migration_apikey
            WHERE id NOT LIKE 'unaffected-%'
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const result = Object.fromEntries(
            migrated.results.map((row) => [row.id, row.permissions]),
        );
        expect(JSON.parse(result["alias-only"] as string)).toEqual({
            models: ["zimage"],
            note: "keep",
        });
        expect(JSON.parse(result["old-and-new"] as string)).toEqual({
            models: ["unknown-model", "zimage", "owner/community-model"],
            account: ["profile"],
        });
        for (const id of [
            "alias-elsewhere",
            "missing-models",
            "non-array",
            "invalid-json",
            "unrestricted",
        ]) {
            expect(result[id]).toBe(rows.get(id));
        }

        const changedUnaffectedKeys = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM zimage_route_migration_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object(
                  'models', json_array('flux', 'openai'), 'role', 'keep'
              )
        `).first<{ count: number }>();
        expect(changedUnaffectedKeys?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE zimage_route_migration_snapshot AS
            SELECT id, permissions FROM zimage_route_migration_apikey
        `).run();
        await env.DB.prepare(statement).run();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM zimage_route_migration_apikey AS current
            JOIN zimage_route_migration_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
