import { env } from "cloudflare:test";
import {
    getModels,
    getRegistryModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0046_standardize-model-permissions.sql?raw";

const modelMappings = getModels().flatMap((canonical) =>
    getRegistryModelDefinition(canonical).aliases.map(
        (alias) => [alias, canonical] as const,
    ),
);

const retiredIds = modelMappings.map(([retired]) => retired);
const retiredSqlLiterals = retiredIds
    .map((modelId) => `'${modelId.replaceAll("'", "''")}'`)
    .join(", ");
const countRetiredSql = `
    SELECT count(DISTINCT api_key.id) AS count
    FROM canonical_rename_apikey AS api_key
    JOIN json_each(
        CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
        '$.models'
    ) AS model
    WHERE json_type(
        CASE WHEN json_valid(api_key.permissions) THEN api_key.permissions END,
        '$.models'
    ) = 'array'
      AND model.type = 'text'
      AND model.value IN (${retiredSqlLiterals})
`;

async function insertInChunks(
    statements: D1PreparedStatement[],
): Promise<void> {
    for (let index = 0; index < statements.length; index += 50) {
        await env.DB.batch(statements.slice(index, index + 50));
    }
}

async function runMigrationForTest(): Promise<void> {
    for (const statement of migrationSql.split("--> statement-breakpoint")) {
        const sql = statement
            .trim()
            .replace(/\bapikey\b/g, "canonical_rename_apikey");
        if (sql) await env.DB.prepare(sql).run();
    }
}

describe("standardize model permissions migration", () => {
    it("bounds work and migrates every known model alias", async () => {
        expect(modelMappings).toHaveLength(424);
        expect(new Set(modelMappings.map(([alias]) => alias)).size).toBe(424);
        expect(migrationSql).toContain("candidate_keys AS MATERIALIZED");
        expect(migrationSql).toContain("FROM candidate_keys");
        expect(migrationSql).toContain("UPDATE apikey");
        expect(migrationSql).toContain("FROM migrated");
        expect(migrationSql).not.toContain(
            "SELECT models FROM migrated WHERE migrated.id = apikey.id",
        );
        for (const [retiredId, canonicalId] of modelMappings) {
            expect(resolveModelName(retiredId)).toBe(canonicalId);
            expect(migrationSql).toContain(
                `('${retiredId}', '${canonicalId}')`,
            );
            expect(migrationSql).toContain(
                `instr(permissions, '"${retiredId}"')`,
            );
        }

        await env.DB.prepare(`
            CREATE TABLE canonical_rename_apikey (
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
            INSERT INTO canonical_rename_apikey
            SELECT
                printf('unaffected-%06d', x),
                json_object('models', json_array('trellis-2', 'gemini-search'), 'role', 'keep')
            FROM seq
        `).run();

        await insertInChunks(
            modelMappings.map(([retiredId], index) =>
                env.DB.prepare(
                    `INSERT INTO canonical_rename_apikey
                         VALUES (?, json_object('models', json_array(?), 'note', 'keep'))`,
                ).bind(`retired-${String(index).padStart(3, "0")}`, retiredId),
            ),
        );

        const [firstOld, firstCanonical] = modelMappings[0];
        const edgeRows = new Map<string, string | null>([
            [
                "old-and-new",
                JSON.stringify({
                    models: [
                        "unknown-model",
                        firstOld,
                        "owner/community-model",
                        firstCanonical,
                        "trellis-2",
                    ],
                    account: ["profile"],
                }),
            ],
            [
                "retired-elsewhere",
                JSON.stringify({ models: ["trellis-2"], note: firstOld }),
            ],
            ["missing-models", JSON.stringify({ note: retiredIds[1] })],
            ["non-array", JSON.stringify({ models: retiredIds[2] })],
            ["invalid-json", `{"models":["${retiredIds[3]}"]`],
            ["unrestricted", null],
        ]);
        await insertInChunks(
            [...edgeRows].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO canonical_rename_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const affectedBefore = await env.DB.prepare(countRetiredSql).first<{
            count: number;
        }>();
        expect(affectedBefore?.count).toBe(modelMappings.length + 1);

        await runMigrationForTest();

        const retiredRows = await env.DB.prepare(`
            SELECT id, permissions
            FROM canonical_rename_apikey
            WHERE id GLOB 'retired-[0-9][0-9][0-9]'
            ORDER BY id
        `).all<{ id: string; permissions: string }>();
        expect(retiredRows.results).toHaveLength(modelMappings.length);
        for (const [index, [, canonicalId]] of modelMappings.entries()) {
            expect(JSON.parse(retiredRows.results[index].permissions)).toEqual({
                models: [canonicalId],
                note: "keep",
            });
        }

        const migratedEdges = await env.DB.prepare(`
            SELECT id, permissions
            FROM canonical_rename_apikey
            WHERE id NOT LIKE 'unaffected-%'
              AND id NOT GLOB 'retired-[0-9][0-9][0-9]'
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const edges = Object.fromEntries(
            migratedEdges.results.map((row) => [row.id, row.permissions]),
        );
        expect(JSON.parse(edges["old-and-new"] as string)).toEqual({
            models: [
                "unknown-model",
                firstCanonical,
                "owner/community-model",
                "trellis-2",
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

        const affectedAfter = await env.DB.prepare(countRetiredSql).first<{
            count: number;
        }>();
        expect(affectedAfter?.count).toBe(0);

        const changedUnaffectedKeys = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM canonical_rename_apikey
            WHERE id LIKE 'unaffected-%'
              AND permissions != json_object(
                    'models', json_array('trellis-2', 'gemini-search'),
                    'role', 'keep'
              )
        `).first<{ count: number }>();
        expect(changedUnaffectedKeys?.count).toBe(0);

        await env.DB.prepare(`
            CREATE TABLE canonical_rename_snapshot AS
            SELECT id, permissions FROM canonical_rename_apikey
        `).run();
        await runMigrationForTest();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM canonical_rename_apikey AS current
            JOIN canonical_rename_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
