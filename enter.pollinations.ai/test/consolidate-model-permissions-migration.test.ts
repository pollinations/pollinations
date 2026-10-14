import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0044_consolidate-model-permissions.sql?raw";

const retiredModelMappings = [
    ["trellis-2-low", "trellis-2"],
    ["trellis-2-medium", "trellis-2"],
    ["trellis-2-high", "trellis-2"],
    ["sonar", "perplexity-fast"],
    ["perplexity-high", "perplexity-fast"],
    ["perplexity-deep", "perplexity-fast"],
    ["sonar-deep", "perplexity-fast"],
    ["grok-fast", "grok"],
    ["grok-4-1-fast", "grok"],
    ["grok-4-1-fast-non-reasoning", "grok"],
    ["grok-legacy", "grok"],
    ["grok-4", "grok"],
    ["grok-4-fast", "grok"],
    ["grok-4-20-non-reasoning", "grok"],
    ["grok-non-reasoning", "grok"],
    ["grok-4-20-reasoning", "grok"],
    ["grok-4-20", "grok"],
    ["grok-4-1-fast-reasoning", "grok"],
    ["gemini-search-fast", "gemini-search"],
    ["gemini-3.1-flash-lite-search", "gemini-search"],
    ["gemini-3.5-flash-lite-search", "gemini-search"],
    ["gemini-search-large", "gemini-search"],
    ["gemini-3.6-flash-search", "gemini-search"],
    ["gemini-3.5-flash-search", "gemini-search"],
] as const;

const retiredIds = retiredModelMappings.map(([retired]) => retired);
const retiredPlaceholders = retiredIds.map(() => "?").join(", ");
const countRetiredSql = `
    SELECT count(DISTINCT api_key.id) AS count
    FROM consolidation_migration_apikey AS api_key
    JOIN json_each(
        CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
        '$.models'
    ) AS model
    WHERE json_type(
        CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
        '$.models'
    ) = 'array'
      AND model.type = 'text'
      AND model.value IN (${retiredPlaceholders})
`;

describe("consolidate model permissions migration", () => {
    it("bounds work, migrates every retired ID, and preserves permission data", async () => {
        expect(migrationSql).toContain("candidate_keys AS MATERIALIZED");
        expect(migrationSql).toContain("FROM candidate_keys");
        for (const retiredId of retiredIds) {
            expect(migrationSql).toContain(
                `instr(permissions, '"${retiredId}"')`,
            );
        }

        await env.DB.prepare(`
            CREATE TABLE consolidation_migration_apikey (
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
            INSERT INTO consolidation_migration_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('flux', 'openai'), 'role', 'keep')
            FROM seq
        `).run();

        await env.DB.batch(
            retiredModelMappings.map(([retiredId], index) =>
                env.DB.prepare(
                    `INSERT INTO consolidation_migration_apikey
                         VALUES (?, json_object('models', json_array(?), 'note', 'keep'))`,
                ).bind(`retired-${String(index).padStart(2, "0")}`, retiredId),
            ),
        );

        const edgeRows = new Map<string, string | null>([
            [
                "many-to-one",
                JSON.stringify({
                    models: [
                        "grok-4-20-reasoning",
                        "flux",
                        "grok-non-reasoning",
                    ],
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
                        "openai",
                    ],
                    account: ["profile"],
                }),
            ],
            [
                "retired-elsewhere",
                JSON.stringify({
                    models: ["flux"],
                    note: "gemini-search-fast",
                }),
            ],
            ["missing-models", JSON.stringify({ note: "perplexity-high" })],
            ["non-array", JSON.stringify({ models: "grok-4" })],
            ["invalid-json", '{"models":["trellis-2-low"]'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...edgeRows].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO consolidation_migration_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const affectedBefore = await env.DB.prepare(countRetiredSql)
            .bind(...retiredIds)
            .first<{ count: number }>();
        expect(affectedBefore?.count).toBe(retiredModelMappings.length + 2);

        const migrationForTest = migrationSql.replace(
            /\bapikey\b/g,
            "consolidation_migration_apikey",
        );
        await env.DB.prepare(migrationForTest).run();

        const retiredRows = await env.DB.prepare(`
            SELECT id, permissions
            FROM consolidation_migration_apikey
            WHERE id GLOB 'retired-[0-9][0-9]'
            ORDER BY id
        `).all<{ id: string; permissions: string }>();
        expect(retiredRows.results).toHaveLength(retiredModelMappings.length);
        for (const [index, [, canonicalId]] of retiredModelMappings.entries()) {
            expect(JSON.parse(retiredRows.results[index].permissions)).toEqual({
                models: [canonicalId],
                note: "keep",
            });
        }

        const migratedEdges = await env.DB.prepare(`
            SELECT id, permissions
            FROM consolidation_migration_apikey
            WHERE id NOT LIKE 'unaffected-%'
              AND id NOT GLOB 'retired-[0-9][0-9]'
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const edges = Object.fromEntries(
            migratedEdges.results.map((row) => [row.id, row.permissions]),
        );
        expect(JSON.parse(edges["many-to-one"] as string)).toEqual({
            models: ["grok", "flux"],
            note: "keep",
        });
        expect(JSON.parse(edges["old-and-new"] as string)).toEqual({
            models: [
                "unknown-model",
                "trellis-2",
                "owner/community-model",
                "openai",
            ],
            account: ["profile"],
        });
        for (const id of [
            "retired-elsewhere",
            "missing-models",
            "non-array",
            "invalid-json",
            "unrestricted",
        ]) {
            expect(edges[id]).toBe(edgeRows.get(id));
        }

        const affectedAfter = await env.DB.prepare(countRetiredSql)
            .bind(...retiredIds)
            .first<{ count: number }>();
        expect(affectedAfter?.count).toBe(0);

        const changedUnaffectedKeys = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM consolidation_migration_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object('models', json_array('flux', 'openai'), 'role', 'keep')
        `).first<{ count: number }>();
        expect(changedUnaffectedKeys?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE consolidation_migration_snapshot AS
            SELECT id, permissions FROM consolidation_migration_apikey
        `).run();
        await env.DB.prepare(migrationForTest).run();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM consolidation_migration_apikey AS current
            JOIN consolidation_migration_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
