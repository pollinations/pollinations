import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0045_standardize-model-permissions.sql?raw";

const modelMappings = [
    ["openai", "openai/gpt-5.4-nano"],
    ["openai-fast", "openai/gpt-5-nano"],
    ["gpt-oss", "openai/gpt-oss-20b"],
    ["gpt-5.4", "openai/gpt-5.4"],
    ["gpt-5.4-mini", "openai/gpt-5.4-mini"],
    ["openai-large", "openai/gpt-5.5"],
    ["gpt-5.6-sol", "openai/gpt-5.6-sol"],
    ["gpt-5.6-terra", "openai/gpt-5.6-terra"],
    ["gpt-5.6-luna", "openai/gpt-5.6-luna"],
    ["mercury", "inception/mercury-2"],
    ["command-a-plus", "command-a-plus-05-2026"],
    ["qwen-coder", "qwen/qwen3-coder-30b-a3b-instruct"],
    ["mistral-small-3.2", "mistralai/mistral-small-3.2-24b-instruct"],
    ["mistral", "mistralai/mistral-small-2603"],
    ["openai-audio", "openai/gpt-audio-mini"],
    ["openai-audio-large", "openai/gpt-audio-1.5"],
    ["gemini-3-flash", "google/gemini-3-flash-preview"],
    ["gemini", "google/gemini-3.6-flash"],
    ["gemini-flash-lite-3.5", "google/gemini-3.5-flash-lite"],
    ["gemini-fast", "google/gemini-2.5-flash-lite"],
    ["deepseek", "deepseek/deepseek-v4-flash-0731"],
    ["gemma", "google/gemma-4-26b-a4b-it"],
    ["gemma-4-31b", "google/gemma-4-31b-it"],
    ["deepseek-pro", "deepseek/deepseek-v4-pro"],
    ["grok-large", "x-ai/grok-4.3"],
    ["grok-4.5", "x-ai/grok-4.5"],
    ["claude-fast", "anthropic/claude-haiku-4.5"],
    ["claude", "anthropic/claude-sonnet-4.6"],
    ["claude-sonnet-5", "anthropic/claude-sonnet-5"],
    ["claude-opus-4.6", "anthropic/claude-opus-4.6"],
    ["claude-opus-4.7", "anthropic/claude-opus-4.7"],
    ["claude-large", "anthropic/claude-opus-5"],
    ["claude-fable-5", "anthropic/claude-fable-5"],
    ["perplexity", "perplexity/sonar-pro"],
    ["perplexity-reasoning", "perplexity/sonar-reasoning-pro"],
    ["kimi", "moonshotai/kimi-k2.6"],
    ["kimi-code", "moonshotai/kimi-k2.7-code"],
    ["kimi-k3", "moonshotai/kimi-k3"],
    ["laguna", "poolside/laguna-s-2.1"],
    ["longcat", "meituan/longcat-2.0"],
    ["inkling", "thinkingmachines/inkling-small"],
    ["nemotron", "nvidia/nemotron-3-ultra-550b-a55b"],
    ["mimo-v2.5", "xiaomi/mimo-v2.5"],
    ["mimo-v2.5-pro", "xiaomi/mimo-v2.5-pro"],
    ["gemini-large", "google/gemini-3.1-pro-preview"],
    ["nova-fast", "amazon/nova-micro-v1"],
    ["nova", "amazon/nova-2-lite-v1"],
    ["glm", "z-ai/glm-5.2"],
    ["llama", "meta-llama/llama-3.3-70b-instruct"],
    ["llama-maverick", "meta-llama/llama-4-maverick"],
    ["llama-scout", "meta-llama/llama-4-scout"],
    ["minimax-m2.7", "minimax/minimax-m2.7"],
    ["minimax", "minimax/minimax-m3"],
    ["muse-spark-1.1", "meta/muse-spark-1.1"],
    ["mistral-large", "mistralai/mistral-large-2512"],
    ["qwen-coder-large", "qwen/qwen3-coder-next"],
    ["qwen-large", "qwen/qwen3.7-plus"],
    ["qwen3.7-max", "qwen/qwen3.7-max"],
    ["qwen3.8-max", "qwen/qwen3.8-max"],
    ["qwen3.7-flash", "qwen/qwen3.7-flash"],
    ["qwen-vision", "qwen/qwen3-vl-30b-a3b-instruct"],
    ["qwen-vision-pro", "qwen/qwen3-vl-235b-a22b-thinking"],
    ["step-flash", "stepfun/step-3.7-flash"],
    ["step-3.5-flash", "stepfun/step-3.5-flash"],
    ["qwen-safety", "qwen/qwen3guard-gen-8b"],
    ["krea", "krea/krea-2-medium"],
    ["kontext", "black-forest-labs/flux.1-kontext-pro"],
    ["nanobanana", "google/gemini-2.5-flash-image"],
    ["nanobanana-2", "google/gemini-3.1-flash-image"],
    ["nanobanana-2-lite", "google/gemini-3.1-flash-lite-image"],
    ["nanobanana-pro", "google/gemini-3-pro-image"],
    ["seedream5", "bytedance/seedream-5-lite"],
    ["seedream5-pro", "bytedance/seedream-5-pro"],
    ["seedream", "bytedance/seedream-4"],
    ["seedream-pro", "bytedance-seed/seedream-4.5"],
    ["ideogram-v4-turbo", "ideogram-ai/ideogram-v4-turbo"],
    ["ideogram-v4-balanced", "ideogram-ai/ideogram-v4-balanced"],
    ["ideogram-v4-quality", "ideogram-ai/ideogram-v4-quality"],
    ["gptimage", "openai/gpt-image-1-mini"],
    ["gptimage-large", "openai/gpt-image-1.5"],
    ["gpt-image-2", "openai/gpt-image-2"],
    ["flux", "black-forest-labs/FLUX.1-schnell"],
    ["zimage", "Tongyi-MAI/Z-Image-Turbo"],
    ["veo", "google/veo-3.1-fast"],
    ["seedance-pro", "bytedance/seedance-1-pro-fast"],
    ["seedance-2.0", "bytedance/seedance-2.0"],
    ["wan", "alibaba/wan-2.6"],
    ["wan-fast", "wan-video/wan-2.2-fast"],
    ["wan-pro", "alibaba/wan-2.7"],
    ["wan-image", "wan-video/wan-2.7-image"],
    ["wan-image-pro", "wan-video/wan-2.7-image-pro"],
    ["qwen-image", "qwen/qwen-image"],
    ["grok-imagine", "x-ai/grok-imagine-image"],
    ["grok-imagine-pro", "x-ai/grok-imagine-image-quality"],
    ["recraft-v4.1-vector", "recraft/recraft-v4.1-vector"],
    ["grok-video-pro", "x-ai/grok-imagine-video"],
    ["grok-imagine-video-1.5", "x-ai/grok-imagine-video-1.5"],
    ["happyhorse-1.1", "alibaba/happyhorse-1.1"],
    ["klein", "black-forest-labs/flux.2-klein-4b"],
    ["p-image", "PrunaAI/p-image"],
    ["p-image-edit", "PrunaAI/p-image-Edit"],
    ["p-video", "prunaai/p-video"],
    ["nova-canvas", "amazon.nova-canvas-v1:0"],
    ["nova-reel", "amazon.nova-reel-v1:1"],
    ["elevenlabs", "elevenlabs/eleven-v3"],
    ["elevenflash", "elevenlabs/eleven-flash-v2.5"],
    ["eleven-multilingual-v2", "elevenlabs/eleven-multilingual-v2"],
    ["elevenmusic", "elevenlabs/music-v2"],
    ["lyria-3-clip", "google/lyria-3-clip-preview"],
    ["eleven-sfx", "elevenlabs/eleven-text-to-sound-v2"],
    ["whisper", "openai/whisper-large-v3"],
    ["scribe", "elevenlabs/scribe-v2"],
    ["universal-2", "assemblyai/universal-2"],
    ["universal-3.5-pro", "assemblyai/universal-3.5-pro"],
    ["stable-audio-3-medium", "fal-ai/stable-audio-3/medium"],
    ["stable-audio-3-large", "stable-audio-3"],
    ["qwen-tts", "qwen/qwen3-tts-flash"],
    ["qwen-tts-instruct", "qwen/qwen3-tts-instruct-flash"],
    ["csm-1b", "sesame/csm-1b"],
    ["kokoro", "hexgrad/kokoro-82m"],
    ["gemini-2", "google/gemini-embedding-2"],
    ["openai-3-small", "openai/text-embedding-3-small"],
    ["openai-3-large", "openai/text-embedding-3-large"],
    ["cohere-embed-v4", "embed-v4.0"],
    ["qwen3-embedding-8b", "qwen/qwen3-embedding-8b"],
    ["gpt-realtime-2.1", "openai/gpt-realtime-2.1"],
    ["gpt-realtime-2.1-mini", "openai/gpt-realtime-2.1-mini"],
    ["gpt-realtime-2", "openai/gpt-realtime-2"],
] as const;

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

describe("standardize model permissions migration", () => {
    it("bounds work and migrates every renamed canonical ID", async () => {
        expect(migrationSql).toContain("candidate_keys AS MATERIALIZED");
        expect(migrationSql).toContain("FROM candidate_keys");
        expect(migrationSql).toContain("UPDATE apikey");
        expect(migrationSql).toContain("FROM migrated");
        expect(migrationSql).not.toContain(
            "SELECT models FROM migrated WHERE migrated.id = apikey.id",
        );
        for (const [retiredId, canonicalId] of modelMappings) {
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

        const migrationForTest = migrationSql.replace(
            /\bapikey\b/g,
            "canonical_rename_apikey",
        );
        await env.DB.prepare(migrationForTest).run();

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
        await env.DB.prepare(migrationForTest).run();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM canonical_rename_apikey AS current
            JOIN canonical_rename_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
