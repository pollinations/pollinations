import { env } from "cloudflare:test";
import { createTestUser } from "@shared/test/fixtures/index.ts";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0053_listing_envelope.sql?raw";
import requiredTitleMigrationSql from "../drizzle/0057_require-community-titles.sql?raw";
import singleEndpointMigrationSql from "../drizzle/0061_single_text_endpoint.sql?raw";

type Row = {
    id: string;
    type: string;
    base_url: string;
    upstream_model: string;
    payload: string;
};

/**
 * The backfill decides what each existing row IS, and then keeps only the
 * fields that kind has. Both halves are asserted: a wrong `type` routes the
 * listing to the wrong credential, and a payload missing what its type
 * requires drops the listing out of the catalog entirely.
 */
describe("community endpoint envelope migration", () => {
    it("selects one exact text endpoint and preserves queued prices without restoring stale targets", async () => {
        await env.DB.prepare(`CREATE TABLE migration_single_text_endpoint (
            id TEXT PRIMARY KEY, type TEXT, base_url TEXT, payload TEXT, pending_payload TEXT
        )`).run();
        const rows = [
            {
                id: "responses",
                type: "proxy",
                baseUrl: "https://api.example.com/v1",
                payload: {
                    modality: "text",
                    responsesUrl:
                        "https://api.example.com/custom/infer?version=1",
                    bearerTokenCiphertext: "cipher",
                    prices: { promptTextPrice: 1 },
                },
                pending: {
                    modality: "text",
                    responsesUrl: "https://api.example.com/stale",
                    prices: { promptTextPrice: 2 },
                    paidOnly: true,
                },
            },
            {
                id: "chat",
                type: "proxy",
                baseUrl: "https://api.example.com/v1/?version=1",
                payload: { modality: "text", responsesUrl: null },
                pending: {
                    modality: "text",
                    responsesUrl: "https://api.example.com/stale",
                    prices: { promptTextPrice: 3 },
                },
            },
            {
                id: "chat-exact",
                type: "endpoint_agent",
                baseUrl:
                    "https://agent.example.com/v1/chat/completions/?version=1",
                payload: { perUserRpm: 5 },
                pending: null,
            },
            {
                id: "response-agent",
                type: "endpoint_agent",
                baseUrl: "https://agent.example.com/v1",
                payload: {
                    responsesUrl: "https://agent.example.com/run",
                    perUserRpm: 5,
                },
                pending: null,
            },
            {
                id: "media",
                type: "proxy",
                baseUrl: "https://media.example.com/generate?version=1",
                payload: { modality: "image", responsesUrl: null },
                pending: null,
            },
            {
                id: "prompt",
                type: "prompt_agent",
                baseUrl: "https://agent-runtime.invalid/api/agent-runtime/v1",
                payload: {
                    systemPrompt: "Help",
                    baseModel: "openai",
                    mcpServers: [],
                },
                pending: null,
            },
        ];
        for (const row of rows) {
            await env.DB.prepare(
                "INSERT INTO migration_single_text_endpoint VALUES (?, ?, ?, ?, ?)",
            )
                .bind(
                    row.id,
                    row.type,
                    row.baseUrl,
                    JSON.stringify(row.payload),
                    row.pending === null ? null : JSON.stringify(row.pending),
                )
                .run();
        }
        const migration = singleEndpointMigrationSql.replaceAll(
            "community_endpoint",
            "migration_single_text_endpoint",
        );
        await env.DB.prepare(migration).run();
        const read = async () =>
            (
                await env.DB.prepare(
                    "SELECT * FROM migration_single_text_endpoint ORDER BY id",
                ).all<{
                    id: string;
                    base_url: string;
                    payload: string;
                    pending_payload: string | null;
                }>()
            ).results;
        const first = await read();
        const byId = Object.fromEntries(
            first.map((row) => [
                row.id,
                {
                    url: row.base_url,
                    payload: JSON.parse(row.payload),
                    pending:
                        row.pending_payload && JSON.parse(row.pending_payload),
                },
            ]),
        );
        expect(byId.responses).toEqual({
            url: "https://api.example.com/custom/infer?version=1",
            payload: {
                modality: "text",
                api: "responses",
                bearerTokenCiphertext: "cipher",
                prices: { promptTextPrice: 1 },
            },
            pending: {
                modality: "text",
                api: "responses",
                prices: { promptTextPrice: 2 },
                paidOnly: true,
            },
        });
        expect(byId.chat).toEqual({
            url: "https://api.example.com/v1/chat/completions?version=1",
            payload: { modality: "text", api: "chat_completions" },
            pending: {
                modality: "text",
                api: "chat_completions",
                prices: { promptTextPrice: 3 },
            },
        });
        expect(byId["chat-exact"]).toEqual({
            url: rows[2].baseUrl,
            payload: { api: "chat_completions", perUserRpm: 5 },
            pending: null,
        });
        expect(byId["response-agent"]).toEqual({
            url: "https://agent.example.com/run",
            payload: { api: "responses", perUserRpm: 5 },
            pending: null,
        });
        expect(byId.media).toEqual({
            url: rows[4].baseUrl,
            payload: { modality: "image", api: null },
            pending: null,
        });
        expect(byId.prompt).toEqual({
            url: rows[5].baseUrl,
            payload: rows[5].payload,
            pending: null,
        });
        await env.DB.prepare(migration).run();
        expect(await read()).toEqual(first);
    });

    it("types every row and packs only that type's fields", async () => {
        await createTestUser({ id: "owner" });
        await env.DB.prepare(`
            CREATE TABLE migration_agent (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'owner',
                config TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT 0
            )
        `).run();
        await env.DB.prepare(`
            INSERT INTO migration_agent (id, config)
            VALUES
                ('agent-row-id', '{"systemPrompt":"Teach clearly.","baseModel":"openai-fast","mcpServers":[]}'),
                ('standalone-agent', '{"systemPrompt":"Work alone.","baseModel":"openai","mcpServers":[]}')
        `).run();
        await env.DB.prepare(`
            CREATE TABLE migration_community_endpoint (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'owner',
                name TEXT NOT NULL,
                title TEXT,
                description TEXT,
                agent_id TEXT,
                modality TEXT NOT NULL DEFAULT 'text',
                image_pricing TEXT NOT NULL DEFAULT 'request',
                input_modalities TEXT,
                base_url TEXT,
                upstream_model TEXT NOT NULL,
                bearer_token_ciphertext TEXT,
                per_user_rpm REAL,
                fallback_model_ids TEXT,
                delegates_generation INTEGER NOT NULL DEFAULT 0,
                prompt_text_price REAL NOT NULL DEFAULT 0,
                prompt_cached_price REAL NOT NULL DEFAULT 0,
                prompt_cache_write_price REAL NOT NULL DEFAULT 0,
                prompt_audio_price REAL NOT NULL DEFAULT 0,
                prompt_image_price REAL NOT NULL DEFAULT 0,
                completion_text_price REAL NOT NULL DEFAULT 0,
                completion_reasoning_price REAL NOT NULL DEFAULT 0,
                completion_audio_price REAL NOT NULL DEFAULT 0,
                completion_image_price REAL NOT NULL DEFAULT 0,
                visibility TEXT NOT NULL DEFAULT 'private',
                hidden_at INTEGER,
                hidden_reason TEXT,
                hidden_by TEXT,
                created_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT 0
            )
        `).run();
        await env.DB.prepare(`
            INSERT INTO migration_community_endpoint
                (id, name, agent_id, modality, image_pricing, input_modalities,
                 base_url, upstream_model, bearer_token_ciphertext,
                 per_user_rpm, fallback_model_ids, delegates_generation,
                 prompt_text_price, completion_text_price)
            VALUES
                ('prompt-agent', 'tutor', 'agent-row-id', 'text', 'request',
                 NULL, NULL, 'tutor', NULL, NULL, NULL, 0, 0, 0),
                ('delegating-text', 'weaver', NULL, 'text', 'request',
                 NULL, 'https://agent.example.com/v1', 'weaver', 'cipher',
                 30, NULL, 1, 0, 0),
                ('delegating-image', 'painter', NULL, 'image', 'request',
                 NULL, 'https://api.example.com/v1', 'sdxl', 'cipher',
                 NULL, NULL, 1, 0, 0),
                ('priced-proxy', 'openai', NULL, 'text', 'request',
                 '["text","image"]', 'https://api.example.com/v1', 'gpt-4.1',
                 'cipher', 12, '["owner/backup"]', 0, 0.5, 1.5),
                ('bare-proxy', 'flux', NULL, 'image', 'tokens',
                 NULL, 'https://api.example.com/v1', 'flux', 'cipher',
                 NULL, NULL, 0, 0, 0)
        `).run();

        for (const statement of migrationSql.split(
            "--> statement-breakpoint",
        )) {
            await env.DB.prepare(
                statement
                    .replaceAll(
                        "community_endpoint",
                        "migration_community_endpoint",
                    )
                    .replaceAll("`agent`", "`migration_agent`")
                    .replaceAll('"agent"', '"migration_agent"'),
            ).run();
        }

        const columns = await env.DB.prepare(
            "PRAGMA table_info(migration_community_endpoint)",
        ).all<{ name: string }>();
        expect(columns.results.map(({ name }) => name)).toEqual([
            "id",
            "owner_user_id",
            "name",
            "title",
            "description",
            "type",
            "base_url",
            "upstream_model",
            "payload",
            "visibility",
            "hidden_at",
            "hidden_reason",
            "hidden_by",
            "created_at",
            "updated_at",
        ]);

        const rows = await env.DB.prepare(
            "SELECT id, type, base_url, upstream_model, payload FROM migration_community_endpoint ORDER BY id",
        ).all<Row>();
        expect(rows.results).toHaveLength(6);
        const byId = Object.fromEntries(
            rows.results.map((row) => [
                row.id,
                {
                    type: row.type,
                    baseUrl: row.base_url,
                    upstreamModel: row.upstream_model,
                    payload: JSON.parse(row.payload),
                },
            ]),
        );

        // An agent Enter runs. Its existing agent id is preserved as the row
        // id/model sent to the shared runtime, while the old listing identity
        // and config move into that row.
        expect(byId["agent-row-id"]).toEqual({
            type: "prompt_agent",
            baseUrl: "https://agent-runtime.invalid/api/agent-runtime/v1",
            upstreamModel: "agent-row-id",
            payload: {
                systemPrompt: "Teach clearly.",
                baseModel: "openai-fast",
                mcpServers: [],
            },
        });
        expect(byId["prompt-agent"]).toBeUndefined();
        // Standalone agents were valid in the old API. They become private
        // rows with non-prompt metadata so the migration never deletes them.
        expect(byId["standalone-agent"]).toEqual({
            type: "prompt_agent",
            baseUrl: "https://agent-runtime.invalid/api/agent-runtime/v1",
            upstreamModel: "standalone-agent",
            payload: {
                systemPrompt: "Work alone.",
                baseModel: "openai",
                mcpServers: [],
            },
        });
        // An agent on the owner's own server keeps a target and nothing else —
        // notably not the credential it used to store, which it is never sent.
        expect(byId["delegating-text"]).toEqual({
            type: "endpoint_agent",
            baseUrl: "https://agent.example.com/v1",
            upstreamModel: "weaver",
            payload: { perUserRpm: 30 },
        });
        // Excluded on purpose: run tokens are only minted on the text path, so
        // the flag was inert here and promoting the row would start rejecting
        // a live endpoint.
        expect(byId["delegating-image"].type).toBe("proxy");
        expect(byId["priced-proxy"]).toEqual({
            type: "proxy",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1",
            payload: {
                bearerTokenCiphertext: "cipher",
                modality: "text",
                imagePricing: "request",
                inputModalities: ["text", "image"],
                perUserRpm: 12,
                fallbacks: ["owner/backup"],
                prices: {
                    promptTextPrice: 0.5,
                    promptCachedPrice: 0,
                    promptCacheWritePrice: 0,
                    promptAudioPrice: 0,
                    promptImagePrice: 0,
                    completionTextPrice: 1.5,
                    completionReasoningPrice: 0,
                    completionAudioPrice: 0,
                    completionImagePrice: 0,
                },
            },
        });
        // Nullable JSON columns become the shapes the reader expects rather
        // than a literal null it would have to re-normalize.
        expect(byId["bare-proxy"]).toMatchObject({
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "flux",
            payload: {
                modality: "image",
                imagePricing: "tokens",
                inputModalities: ["text"],
                perUserRpm: null,
                fallbacks: [],
            },
        });

        await expect(
            env.DB.prepare(
                "SELECT name, title, visibility FROM migration_community_endpoint WHERE id = 'standalone-agent'",
            ).first(),
        ).resolves.toEqual({
            name: "__migrated_agent__standalone-agent",
            title: "Agent standalo",
            visibility: "private",
        });
        await expect(
            env.DB.prepare(
                "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'migration_agent'",
            ).first(),
        ).resolves.toEqual({ count: 0 });

        const indexes = await env.DB.prepare(
            "PRAGMA index_list(migration_community_endpoint)",
        ).all<{ name: string }>();
        expect(indexes.results.map(({ name }) => name)).toEqual(
            expect.arrayContaining([
                "idx_migration_community_endpoint_owner_name",
                "idx_migration_community_endpoint_owner_user_id",
            ]),
        );
        const table = await env.DB.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'migration_community_endpoint'",
        ).first<{ sql: string }>();
        expect(table?.sql).toContain("community_endpoint_base_url");
        expect(table?.sql).toContain("community_endpoint_prompt_agent_model");
    });
});

describe("required community endpoint title migration", () => {
    it("backfills titles before making the column required", async () => {
        await createTestUser({ id: "title-owner" });
        await env.DB.prepare(`
            CREATE TABLE migration_title_endpoint (
                id TEXT PRIMARY KEY NOT NULL,
                owner_user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                title TEXT,
                description TEXT,
                type TEXT DEFAULT 'proxy' NOT NULL,
                base_url TEXT NOT NULL,
                upstream_model TEXT NOT NULL,
                payload TEXT DEFAULT '{}' NOT NULL,
                visibility TEXT DEFAULT 'private' NOT NULL,
                pending_payload TEXT,
                pending_visibility TEXT,
                pending_at INTEGER,
                hidden_at INTEGER,
                hidden_reason TEXT,
                hidden_by TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `).run();
        await env.DB.prepare(`
            INSERT INTO migration_title_endpoint (
                id, owner_user_id, name, title, description, base_url,
                upstream_model, created_at, updated_at
            ) VALUES
                ('description', 'title-owner', 'first', NULL,
                 ' Friendly description ', 'https://example.com', 'first', 1, 1),
                ('slug', 'title-owner', 'second', '   ', NULL,
                 'https://example.com', 'second', 1, 1),
                ('stored', 'title-owner', 'third', ' Stored title ', 'Ignored',
                 'https://example.com', 'third', 1, 1)
        `).run();

        for (const statement of requiredTitleMigrationSql.split(
            "--> statement-breakpoint",
        )) {
            await env.DB.prepare(
                statement.replaceAll(
                    "community_endpoint",
                    "migration_title_endpoint",
                ),
            ).run();
        }

        const titles = await env.DB.prepare(
            "SELECT id, title FROM migration_title_endpoint ORDER BY id",
        ).all<{ id: string; title: string }>();
        expect(titles.results).toEqual([
            { id: "description", title: "Friendly description" },
            { id: "slug", title: "second" },
            { id: "stored", title: "Stored title" },
        ]);
        const titleColumn = await env.DB.prepare(
            "SELECT `notnull` AS required FROM pragma_table_info('migration_title_endpoint') WHERE name = 'title'",
        ).first<{ required: number }>();
        expect(titleColumn?.required).toBe(1);
    });
});
