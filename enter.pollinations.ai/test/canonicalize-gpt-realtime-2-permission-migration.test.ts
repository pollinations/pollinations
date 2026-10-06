import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0056_canonicalize_gpt_realtime_2_permission.sql?raw";

describe("canonicalize GPT Realtime 2 permission migration", () => {
    it("replaces the retired ID without changing unrelated permissions", async () => {
        await env.DB.prepare(`
            CREATE TABLE gpt_realtime_2_permission_apikey (
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
            INSERT INTO gpt_realtime_2_permission_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('flux'), 'note', 'keep')
            FROM seq
        `).run();
        const edgeRows = new Map<string, string | null>([
            [
                "retired-only",
                JSON.stringify({
                    models: ["gpt-realtime-2", "flux"],
                    note: "keep",
                }),
            ],
            [
                "retired-before-canonical",
                JSON.stringify({
                    models: [
                        "unknown-model",
                        "gpt-realtime-2",
                        "owner/community-model",
                        "gpt-realtime-2.1",
                    ],
                    account: ["profile"],
                }),
            ],
            [
                "canonical-before-retired",
                JSON.stringify({
                    models: ["gpt-realtime-2.1", "flux", "gpt-realtime-2"],
                }),
            ],
            [
                "repeated-retired",
                JSON.stringify({
                    models: ["gpt-realtime-2", "gpt-realtime-2", "openai"],
                }),
            ],
            [
                "unrelated-duplicates",
                JSON.stringify({
                    models: ["gpt-realtime-2", "flux", "flux"],
                }),
            ],
            [
                "alias-elsewhere",
                JSON.stringify({ models: ["flux"], note: "gpt-realtime-2" }),
            ],
            ["missing-models", JSON.stringify({ note: "gpt-realtime-2" })],
            ["non-array", JSON.stringify({ models: "gpt-realtime-2" })],
            ["invalid-json", '{"models":["gpt-realtime-2"]'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...edgeRows].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO gpt_realtime_2_permission_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const statement = migrationSql.replace(
            /\bapikey\b/g,
            "gpt_realtime_2_permission_apikey",
        );
        const runMigration = () => env.DB.prepare(statement).run();
        await runMigration();

        const rows = await env.DB.prepare(`
            SELECT id, permissions
            FROM gpt_realtime_2_permission_apikey
            WHERE id NOT LIKE 'unaffected-%'
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const permissions = Object.fromEntries(
            rows.results.map((row) => [row.id, row.permissions]),
        );

        expect(JSON.parse(permissions["retired-only"] as string)).toEqual({
            models: ["gpt-realtime-2.1", "flux"],
            note: "keep",
        });
        expect(
            JSON.parse(permissions["retired-before-canonical"] as string),
        ).toEqual({
            models: [
                "unknown-model",
                "gpt-realtime-2.1",
                "owner/community-model",
            ],
            account: ["profile"],
        });
        expect(
            JSON.parse(permissions["canonical-before-retired"] as string),
        ).toEqual({ models: ["gpt-realtime-2.1", "flux"] });
        expect(JSON.parse(permissions["repeated-retired"] as string)).toEqual({
            models: ["gpt-realtime-2.1", "openai"],
        });
        expect(
            JSON.parse(permissions["unrelated-duplicates"] as string),
        ).toEqual({ models: ["gpt-realtime-2.1", "flux", "flux"] });
        for (const id of [
            "alias-elsewhere",
            "missing-models",
            "non-array",
            "invalid-json",
            "unrestricted",
        ]) {
            expect(permissions[id]).toBe(edgeRows.get(id));
        }

        const retiredAfter = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM gpt_realtime_2_permission_apikey AS api_key
            JOIN json_each(
                CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
                '$.models'
            ) AS model
            WHERE json_type(
                CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
                '$.models'
            ) = 'array'
              AND model.type = 'text'
              AND model.value = 'gpt-realtime-2'
        `).first<{ count: number }>();
        expect(retiredAfter?.count).toBe(0);

        const changedUnaffected = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM gpt_realtime_2_permission_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object(
                  'models', json_array('flux'), 'note', 'keep'
              )
        `).first<{ count: number }>();
        expect(changedUnaffected?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE gpt_realtime_2_permission_snapshot AS
            SELECT id, permissions FROM gpt_realtime_2_permission_apikey
        `).run();
        await runMigration();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM gpt_realtime_2_permission_apikey AS current
            JOIN gpt_realtime_2_permission_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
