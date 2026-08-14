import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0046_canonicalize-gemini-flash-lite-permissions.sql?raw";

describe("canonicalize Gemini Flash Lite permissions migration", () => {
    it("migrates only the retired canonical ID and preserves permission data", async () => {
        expect(migrationSql).toContain("candidate_keys AS MATERIALIZED");

        await env.DB.prepare(`
            CREATE TABLE gemini_permission_migration_apikey (
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
            INSERT INTO gemini_permission_migration_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('flux', 'openai'), 'role', 'keep')
            FROM seq
        `).run();
        await env.DB.prepare(`
            INSERT INTO gemini_permission_migration_apikey VALUES
                ('old-only', json_object(
                    'models', json_array('gemini-flash-lite-3.1', 'flux'),
                    'note', 'keep'
                )),
                ('old-and-new', json_object(
                    'models', json_array(
                        'unknown-model',
                        'gemini-flash-lite-3.1',
                        'gemini-flash-lite-3.5',
                        'owner/community-model'
                    ),
                    'account', json_array('profile')
                )),
                ('retired-elsewhere', json_object(
                    'models', json_array('flux'),
                    'note', 'gemini-flash-lite-3.1'
                )),
                ('missing-models', json_object(
                    'note', 'gemini-flash-lite-3.1'
                )),
                ('non-array', json_object(
                    'models', 'gemini-flash-lite-3.1'
                )),
                ('invalid-json', '{"models":["gemini-flash-lite-3.1"]'),
                ('unrestricted', NULL)
        `).run();

        const countRetiredPermissions = () =>
            env.DB.prepare(`
                SELECT count(DISTINCT api_key.id) AS count
                FROM gemini_permission_migration_apikey AS api_key
                JOIN json_each(
                    CASE WHEN json_valid(api_key.permissions)
                        THEN api_key.permissions END,
                    '$.models'
                ) AS model
                WHERE json_type(
                    CASE WHEN json_valid(api_key.permissions)
                        THEN api_key.permissions END,
                    '$.models'
                ) = 'array'
                  AND model.type = 'text'
                  AND model.value = 'gemini-flash-lite-3.1'
            `).first<{ count: number }>();
        expect((await countRetiredPermissions())?.count).toBe(2);

        const migrationForTest = migrationSql.replace(
            /\bapikey\b/g,
            "gemini_permission_migration_apikey",
        );
        await env.DB.prepare(migrationForTest).run();

        const rows = await env.DB.prepare(`
            SELECT id, permissions
            FROM gemini_permission_migration_apikey
            WHERE id NOT LIKE 'unaffected-%'
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const permissions = Object.fromEntries(
            rows.results.map((row) => [row.id, row.permissions]),
        );

        expect(JSON.parse(permissions["old-only"] as string)).toEqual({
            models: ["gemini-flash-lite-3.5", "flux"],
            note: "keep",
        });
        expect(JSON.parse(permissions["old-and-new"] as string)).toEqual({
            models: [
                "unknown-model",
                "gemini-flash-lite-3.5",
                "owner/community-model",
            ],
            account: ["profile"],
        });
        expect(JSON.parse(permissions["retired-elsewhere"] as string)).toEqual({
            models: ["flux"],
            note: "gemini-flash-lite-3.1",
        });
        expect(JSON.parse(permissions["missing-models"] as string)).toEqual({
            note: "gemini-flash-lite-3.1",
        });
        expect(JSON.parse(permissions["non-array"] as string)).toEqual({
            models: "gemini-flash-lite-3.1",
        });
        expect(permissions["invalid-json"]).toBe(
            '{"models":["gemini-flash-lite-3.1"]',
        );
        expect(permissions.unrestricted).toBeNull();
        expect((await countRetiredPermissions())?.count).toBe(0);

        const changedUnaffectedKeys = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM gemini_permission_migration_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object(
                  'models', json_array('flux', 'openai'), 'role', 'keep'
              )
        `).first<{ count: number }>();
        expect(changedUnaffectedKeys?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE gemini_permission_migration_snapshot AS
            SELECT id, permissions FROM gemini_permission_migration_apikey
        `).run();
        await env.DB.prepare(migrationForTest).run();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM gemini_permission_migration_apikey AS current
            JOIN gemini_permission_migration_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
