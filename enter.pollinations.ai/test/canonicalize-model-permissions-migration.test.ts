import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0043_canonicalize-model-permissions.sql?raw";

describe("canonicalize model permissions migration", () => {
    it("limits JSON processing to candidate keys and preserves permission data", async () => {
        expect(migrationSql).toContain("candidate_keys AS MATERIALIZED");
        expect(migrationSql).toContain("FROM candidate_keys");

        await env.DB.prepare(`
            CREATE TABLE migration_apikey (
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
            INSERT INTO migration_apikey
            SELECT
                printf('key-%06d', x),
                json_object('models', json_array('flux', 'openai'), 'role', 'keep')
            FROM seq
        `).run();
        await env.DB.prepare(`
            INSERT INTO migration_apikey VALUES
                ('veo', json_object('models', json_array('veo-1080p', 'flux'), 'note', 'keep')),
                ('p-video', json_object('models', json_array('p-video-720p', 'flux', 'p-video-1080p', 'p-video'), 'note', 'keep')),
                ('unrelated', json_object('models', json_array('flux'), 'note', 'veo-1080p'))
        `).run();

        await env.DB.prepare(
            migrationSql.replace(/\bapikey\b/g, "migration_apikey"),
        ).run();

        const rows = await env.DB.prepare(
            "SELECT id, permissions FROM migration_apikey WHERE id IN ('veo', 'p-video', 'unrelated') ORDER BY id",
        ).all<{ id: string; permissions: string }>();

        const permissions = Object.fromEntries(
            rows.results.map((row) => [row.id, JSON.parse(row.permissions)]),
        );

        expect(permissions.veo).toEqual({
            models: ["veo", "flux"],
            note: "keep",
        });
        expect(permissions["p-video"]).toEqual({
            models: ["p-video", "flux"],
            note: "keep",
        });
        expect(permissions.unrelated).toEqual({
            models: ["flux"],
            note: "veo-1080p",
        });

        const changedUnaffectedKeys = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM migration_apikey
            WHERE id LIKE 'key-%'
              AND permissions != json_object('models', json_array('flux', 'openai'), 'role', 'keep')
        `).first<{ count: number }>();

        expect(changedUnaffectedKeys?.count).toBe(0);
    });
});
