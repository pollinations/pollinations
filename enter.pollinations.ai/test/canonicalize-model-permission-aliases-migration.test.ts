import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0046_canonicalize-model-permission-aliases.sql?raw";

const aliasMappings = [
    ["gemini-flash-lite-3.1", "gemini-flash-lite-3.5"],
    ["universal-3-pro", "universal-3.5-pro"],
    ["sana", "dreamshaper"],
    ["grok-reasoning", "grok-large"],
    ["kimi-k2.7-code", "kimi-code"],
    ["nova-micro", "nova-fast"],
    ["kimi-k2.6", "kimi"],
    ["gemini-3.5-flash", "gemini"],
    ["qwen3-tts", "qwen-tts"],
    ["gpt-5.5", "openai-large"],
    ["mistral-4", "mistral"],
    ["stable-audio-2.5", "stable-audio-3-medium"],
    ["grok-4.3", "grok-large"],
    ["claude-opus-4.8", "claude-large"],
    ["minimax-m3", "minimax"],
    ["nanobanana2", "nanobanana-2"],
    ["deepseek-v4-pro", "deepseek-pro"],
    ["nemotron-3-ultra", "nemotron"],
    ["trellis-2-high", "trellis-2"],
    ["trellis-2-low", "trellis-2"],
    ["trellis-2-medium", "trellis-2"],
    ["muse-spark-1.1", "muse-spark-1.2"],
    ["grok-4.5", "grok-4.6"],
] as const;

const aliases = aliasMappings.map(([alias]) => alias);
const placeholders = aliases.map(() => "?").join(", ");
const countAliasesSql = `
    SELECT count(*) AS count
    FROM model_alias_migration_apikey AS api_key
    JOIN json_each(
        CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
        '$.models'
    ) AS model
    WHERE json_type(
        CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
        '$.models'
    ) = 'array'
      AND model.type = 'text'
      AND model.value IN (${placeholders})
`;

describe("canonicalize model permission aliases migration", () => {
    it("migrates every audited alias and preserves permission data", async () => {
        expect(migrationSql).toContain("candidate_keys AS MATERIALIZED");
        for (const alias of aliases) {
            expect(migrationSql).toContain(`instr(permissions, '"${alias}"')`);
        }

        await env.DB.prepare(`
            CREATE TABLE model_alias_migration_apikey (
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
            INSERT INTO model_alias_migration_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('flux', 'openai'), 'role', 'keep')
            FROM seq
        `).run();
        await env.DB.batch(
            aliasMappings.map(([alias], index) =>
                env.DB.prepare(`
                    INSERT INTO model_alias_migration_apikey
                    VALUES (?, json_object('models', json_array(?), 'note', 'keep'))
                `).bind(`alias-${String(index).padStart(2, "0")}`, alias),
            ),
        );

        const edgeRows = new Map<string, string | null>([
            [
                "many-to-one",
                JSON.stringify({
                    models: ["grok-reasoning", "flux", "grok-4.3"],
                    note: "keep",
                }),
            ],
            [
                "old-and-new",
                JSON.stringify({
                    models: [
                        "unknown-model",
                        "trellis-2-high",
                        "owner/community-model",
                        "trellis-2",
                    ],
                    account: ["profile"],
                }),
            ],
            [
                "alias-elsewhere",
                JSON.stringify({
                    models: ["flux"],
                    note: "gemini-flash-lite-3.1",
                }),
            ],
            ["missing-models", JSON.stringify({ note: "universal-3-pro" })],
            ["non-array", JSON.stringify({ models: "sana" })],
            ["invalid-json", '{"models":["grok-reasoning"]'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...edgeRows].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO model_alias_migration_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const aliasesBefore = await env.DB.prepare(countAliasesSql)
            .bind(...aliases)
            .first<{ count: number }>();
        expect(aliasesBefore?.count).toBe(aliasMappings.length + 3);

        const migrationForTest = migrationSql.replace(
            /\bapikey\b/g,
            "model_alias_migration_apikey",
        );
        await env.DB.prepare(migrationForTest).run();

        const migratedRows = await env.DB.prepare(`
            SELECT id, permissions
            FROM model_alias_migration_apikey
            WHERE id GLOB 'alias-[0-9][0-9]'
            ORDER BY id
        `).all<{ id: string; permissions: string }>();
        expect(migratedRows.results).toHaveLength(aliasMappings.length);
        for (const [index, [, canonical]] of aliasMappings.entries()) {
            expect(JSON.parse(migratedRows.results[index].permissions)).toEqual(
                {
                    models: [canonical],
                    note: "keep",
                },
            );
        }

        const migratedEdges = await env.DB.prepare(`
            SELECT id, permissions
            FROM model_alias_migration_apikey
            WHERE id NOT LIKE 'unaffected-%'
              AND id NOT GLOB 'alias-[0-9][0-9]'
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const edges = Object.fromEntries(
            migratedEdges.results.map((row) => [row.id, row.permissions]),
        );
        expect(JSON.parse(edges["many-to-one"] as string)).toEqual({
            models: ["grok-large", "flux"],
            note: "keep",
        });
        expect(JSON.parse(edges["old-and-new"] as string)).toEqual({
            models: ["unknown-model", "trellis-2", "owner/community-model"],
            account: ["profile"],
        });
        for (const id of [
            "alias-elsewhere",
            "missing-models",
            "non-array",
            "invalid-json",
            "unrestricted",
        ]) {
            expect(edges[id]).toBe(edgeRows.get(id));
        }

        const aliasesAfter = await env.DB.prepare(countAliasesSql)
            .bind(...aliases)
            .first<{ count: number }>();
        expect(aliasesAfter?.count).toBe(0);

        const changedUnaffectedKeys = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM model_alias_migration_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object(
                  'models', json_array('flux', 'openai'), 'role', 'keep'
              )
        `).first<{ count: number }>();
        expect(changedUnaffectedKeys?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE model_alias_migration_snapshot AS
            SELECT id, permissions FROM model_alias_migration_apikey
        `).run();
        await env.DB.prepare(migrationForTest).run();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM model_alias_migration_apikey AS current
            JOIN model_alias_migration_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
