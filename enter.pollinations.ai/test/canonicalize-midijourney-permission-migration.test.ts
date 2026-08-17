import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0050_canonicalize_midijourney_permission.sql?raw";

describe("canonicalize MIDIjourney permission migration", () => {
    it("adds the canonical ID, preserves existing values, and is idempotent", async () => {
        await env.DB.prepare(`
            CREATE TABLE midijourney_permission_apikey (
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
            INSERT INTO midijourney_permission_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('flux'), 'note', 'keep')
            FROM seq
        `).run();
        await env.DB.batch([
            env.DB.prepare(`
                INSERT INTO midijourney_permission_apikey VALUES
                    ('alias-only', json_object(
                        'models', json_array('midijourney-large', 'flux'),
                        'note', 'keep'
                    ))
            `),
            env.DB.prepare(`
                INSERT INTO midijourney_permission_apikey VALUES
                    ('duplicate', json_object(
                        'models', json_array('midijourney', 'midijourney-large', 'openai')
                    ))
            `),
            env.DB.prepare(`
                INSERT INTO midijourney_permission_apikey VALUES
                    ('unrelated-duplicates', json_object(
                        'models', json_array('midijourney-large', 'flux', 'flux')
                    ))
            `),
            env.DB.prepare(`
                INSERT INTO midijourney_permission_apikey VALUES
                    ('unrelated', json_object('models', json_array('flux')))
            `),
            env.DB.prepare(`
                INSERT INTO midijourney_permission_apikey VALUES
                    ('invalid', '{"models":["midijourney-large"]')
            `),
        ]);

        const statement = migrationSql.replace(
            /\bapikey\b/g,
            "midijourney_permission_apikey",
        );
        const runMigration = () => env.DB.prepare(statement).run();
        await runMigration();

        const rows = await env.DB.prepare(`
            SELECT id, permissions
            FROM midijourney_permission_apikey
            WHERE id IN (
                'alias-only',
                'duplicate',
                'unrelated-duplicates',
                'unrelated',
                'invalid'
            )
            ORDER BY id
        `).all<{ id: string; permissions: string }>();
        const permissions = Object.fromEntries(
            rows.results.map((row) => [row.id, row.permissions]),
        );

        expect(JSON.parse(permissions["alias-only"])).toEqual({
            models: ["midijourney-large", "midijourney", "flux"],
            note: "keep",
        });
        expect(JSON.parse(permissions.duplicate)).toEqual({
            models: ["midijourney", "midijourney-large", "openai"],
        });
        expect(JSON.parse(permissions["unrelated-duplicates"])).toEqual({
            models: ["midijourney-large", "midijourney", "flux", "flux"],
        });
        expect(JSON.parse(permissions.unrelated)).toEqual({ models: ["flux"] });
        expect(permissions.invalid).toBe('{"models":["midijourney-large"]');

        const changedUnaffected = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM midijourney_permission_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object(
                  'models', json_array('flux'), 'note', 'keep'
              )
        `).first<{ count: number }>();
        expect(changedUnaffected?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE midijourney_permission_snapshot AS
            SELECT id, permissions FROM midijourney_permission_apikey
        `).run();
        await runMigration();
        const changed = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM midijourney_permission_apikey AS current
            JOIN midijourney_permission_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changed?.count).toBe(0);
    });
});
