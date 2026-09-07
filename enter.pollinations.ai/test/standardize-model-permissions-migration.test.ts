import { env } from "cloudflare:test";
import {
    getRegistryModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0062_standardize-model-permissions.sql?raw";

const modelMappings = [
    ...migrationSql.matchAll(
        /WHEN model\.type = 'text' AND model\.value = '([^']+)'\s+THEN '([^']+)'/g,
    ),
].map((match) => [match[1], match[2]] as const);

// Public canonical IDs immediately before this release. Keep this fixture
// independent of the SQL so omitting a migration statement fails the test.
const retiredPublicIds = [
    "claude",
    "flux-2-pro",
    "flux-2-flex",
    "gpt-live-transcribe",
    "wan-3.0",
    "claude-fable-5",
    "claude-fast",
    "claude-large",
    "claude-opus-4.6",
    "claude-opus-4.7",
    "claude-sonnet-5",
    "cohere-embed-v4",
    "command-a-plus",
    "csm-1b",
    "deepseek",
    "deepseek-pro",
    "dreamshaper",
    "eleven-dialogue",
    "eleven-multilingual-v2",
    "eleven-sfx",
    "eleven-voice-changer",
    "eleven-voice-isolator",
    "elevenflash",
    "elevenlabs",
    "elevenmusic",
    "flux",
    "gemini",
    "gemini-2",
    "gemini-3-flash",
    "gemini-fast",
    "gemini-flash-lite-3.5",
    "gemini-large",
    "gemini-search",
    "gemma",
    "gemma-4-31b",
    "glm",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-image-2",
    "gpt-oss",
    "gpt-realtime-2.1",
    "gpt-realtime-2.1-mini",
    "gpt-transcribe",
    "gptimage",
    "gptimage-large",
    "grok",
    "grok-4.6",
    "grok-imagine",
    "grok-imagine-image-2.0",
    "grok-imagine-pro",
    "grok-imagine-video-1.5",
    "grok-large",
    "grok-transcribe",
    "grok-video-pro",
    "happyhorse-1.1",
    "hyper3d-rodin",
    "ideogram-v4-balanced",
    "ideogram-v4-quality",
    "ideogram-v4-turbo",
    "inkling",
    "kimi",
    "kimi-code",
    "kimi-k3",
    "klein",
    "kokoro",
    "kontext",
    "krea",
    "laguna",
    "llama",
    "llama-maverick",
    "llama-scout",
    "longcat",
    "lyria-3-clip",
    "mercury",
    "midijourney",
    "midijourney-large",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "minimax",
    "minimax-h3",
    "minimax-m2.7",
    "mistral",
    "mistral-large",
    "mistral-small-3.2",
    "muse-glimmer",
    "muse-spark-1.2",
    "nanobanana",
    "nanobanana-2",
    "nanobanana-2-lite",
    "nanobanana-pro",
    "nemotron",
    "nova",
    "nova-canvas",
    "nova-fast",
    "nova-reel",
    "openai",
    "openai-3-large",
    "openai-3-small",
    "openai-audio",
    "openai-audio-large",
    "openai-fast",
    "openai-large",
    "p-image",
    "p-image-edit",
    "p-video",
    "perplexity",
    "perplexity-fast",
    "perplexity-reasoning",
    "qwen-coder",
    "qwen-coder-large",
    "qwen-image",
    "qwen-image-3",
    "qwen-large",
    "qwen-safety",
    "qwen-tts",
    "qwen-tts-instruct",
    "qwen-vision",
    "qwen-vision-pro",
    "qwen3-embedding-8b",
    "qwen3.7-flash",
    "qwen3.7-max",
    "qwen3.8-2.4t-a95b",
    "qwen3.8-max",
    "recraft-v4.1-vector",
    "scribe",
    "scribe-realtime",
    "seedance-2.0",
    "seedance-2.0-fast",
    "seedance-2.0-mini",
    "seedance-2.5",
    "seedance-pro",
    "seedream",
    "seedream-pro",
    "seedream5",
    "seedream5-pro",
    "stable-audio-3-large",
    "stable-audio-3-medium",
    "step-3.5-flash",
    "step-flash",
    "trellis-2",
    "universal-2",
    "universal-3.5-pro",
    "veo",
    "wan",
    "wan-fast",
    "wan-image",
    "wan-image-pro",
    "wan-pro",
    "whisper",
    "zimage",
    "fish-audio-s2.1-pro",
    "glm-5.3",
    "grok-tts",
    "nemotron-3.5-lightning",
    "qwen3.8-27b",
] as const;
const publishedMappings = retiredPublicIds.map(
    (id) => [id, resolveModelName(id)] as const,
);

const hiddenMappings = [["zimage-fal", "tongyi-mai/z-image-turbo"]] as const;

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
    for (const statement of migrationSql.split(";")) {
        const sql = statement
            .trim()
            .replace(/\bapikey\b/g, "canonical_rename_apikey");
        const hasSql = sql
            .split("\n")
            .map((line) => line.trim())
            .some((line) => line !== "" && !line.startsWith("--"));
        if (hasSql) await env.DB.prepare(sql).run();
    }
}

describe("standardize model permissions migration", () => {
    it("migrates every promoted canonical ID with bounded statements", async () => {
        expect(publishedMappings).toHaveLength(158);
        expect(new Map(modelMappings)).toEqual(
            new Map([...publishedMappings, ...hiddenMappings]),
        );
        expect(modelMappings).toHaveLength(159);
        expect(new Set(modelMappings.map(([retired]) => retired)).size).toBe(
            159,
        );
        expect(
            new Set(modelMappings.map(([, canonical]) => canonical)).size,
        ).toBe(158);
        expect(
            modelMappings.filter(
                ([, canonical]) => canonical === "tongyi-mai/z-image-turbo",
            ),
        ).toEqual([
            ["zimage", "tongyi-mai/z-image-turbo"],
            ["zimage-fal", "tongyi-mai/z-image-turbo"],
        ]);
        expect(migrationSql.match(/UPDATE apikey/g)).toHaveLength(159);
        for (const [retiredId, canonicalId] of modelMappings) {
            if (retiredId !== "zimage-fal") {
                expect(resolveModelName(retiredId)).toBe(canonicalId);
                expect(
                    getRegistryModelDefinition(canonicalId).aliases,
                ).toContain(retiredId);
            }
            expect(migrationSql).toContain(`model.value = '${retiredId}'`);
            expect(migrationSql).toContain(`THEN '${canonicalId}'`);
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
                json_object('models', json_array('unknown-model', 'owner/community-model'), 'role', 'keep')
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
                        "owner/another-model",
                    ],
                    account: ["profile"],
                }),
            ],
            [
                "retired-elsewhere",
                JSON.stringify({ models: ["unknown-model"], note: firstOld }),
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
                "owner/another-model",
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
                    'models', json_array('unknown-model', 'owner/community-model'),
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
