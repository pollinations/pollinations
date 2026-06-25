import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse as yamlParse } from "yaml";
import worker from "../src/index.ts";

function envWithEnterSchema(schema: unknown): CloudflareBindings {
    return {
        ENTER: {
            fetch: async () =>
                new Response(JSON.stringify(schema), {
                    headers: { "Content-Type": "application/json" },
                }),
        } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
    } as CloudflareBindings;
}

describe("docs routes", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("serves a gen-owned OpenAPI schema and merges public Enter paths only", async () => {
        const ctx = createExecutionContext();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    paths: {
                        "/{hash}": {
                            get: {
                                tags: ["media.pollinations.ai"],
                            },
                        },
                    },
                    components: {
                        schemas: {
                            MediaOnly: { type: "object" },
                        },
                    },
                }),
                { headers: { "Content-Type": "application/json" } },
            ),
        );

        const enterSchema = {
            openapi: "3.1.0",
            info: { title: "Enter", version: "0.0.0" },
            tags: [
                { name: "👤 Account" },
                { name: "✨ Quests" },
                { name: "Customer" },
            ],
            components: {
                schemas: {
                    EnterOnly: { type: "object" },
                },
            },
            paths: {
                "/account/key": { get: { tags: ["Account"] } },
                "/api/account/profile": { get: { tags: ["👤 Account"] } },
                "/api/quests/catalog": {
                    get: { tags: ["✨ Quests"], security: [] },
                },
                "/api/quests/check": {
                    post: { tags: ["✨ Quests"], security: [{ session: [] }] },
                },
                "/api/quests/rewards": {
                    get: { tags: ["✨ Quests"], security: [{ session: [] }] },
                },
                "/api/quests/rewards/{rewardId}/claim": {
                    post: { tags: ["✨ Quests"], security: [{ session: [] }] },
                },
                "/api/customer/portal": { get: { tags: ["Customer"] } },
                "/api-keys": { get: { tags: ["Customer"] } },
                "/generate/text/{prompt}": { get: { tags: ["Old"] } },
            },
        };

        const response = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/open-api/generate-schema",
            ),
            envWithEnterSchema(enterSchema),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const schema = (await response.json()) as {
            info: { description: string };
            paths: Record<string, unknown>;
            servers: { url: string }[];
            tags: { name: string; description?: string }[];
            components: { schemas: Record<string, unknown> };
        };

        expect(schema.servers).toEqual([
            { url: "https://gen.pollinations.ai" },
        ]);
        expect(schema.paths["/v1/chat/completions"]).toBeDefined();
        expect(schema.paths["/v1/realtime"]).toBeDefined();
        expect(schema.paths["/image/{prompt}"]).toBeDefined();
        expect(schema.paths["/account/key"]).toBeDefined();
        expect(schema.paths["/account/profile"]).toBeDefined();
        expect(schema.paths["/quests/catalog"]).toBeDefined();
        expect(schema.paths["/api/account/key"]).toBeUndefined();
        expect(schema.paths["/api/account/profile"]).toBeUndefined();
        expect(schema.paths["/api/quests/catalog"]).toBeUndefined();
        expect(schema.paths["/quests/check"]).toBeUndefined();
        expect(schema.paths["/quests/rewards"]).toBeUndefined();
        expect(
            schema.paths["/quests/rewards/{rewardId}/claim"],
        ).toBeUndefined();
        expect(schema.paths["/api/quests/check"]).toBeUndefined();
        expect(schema.paths["/api/quests/rewards"]).toBeUndefined();
        expect(
            schema.paths["/api/quests/rewards/{rewardId}/claim"],
        ).toBeUndefined();
        expect(schema.paths["/api/customer/portal"]).toBeUndefined();
        expect(schema.paths["/api-keys"]).toBeUndefined();
        expect(schema.paths["/generate/text/{prompt}"]).toBeUndefined();
        expect(schema.paths["/{hash}"]).toBeDefined();
        // BYOP, CLI, MCP are surfaced as plain tags in the Integrations group;
        // the drawer icons are presentation, not part of the OpenAPI names.
        expect(schema.tags.map((tag) => tag.name)).toContain("BYOP");
        expect(schema.tags.map((tag) => tag.name)).toContain("CLI");
        expect(schema.tags.map((tag) => tag.name)).toContain("MCP Server");
        expect(schema.tags.map((tag) => tag.name)).toContain("Quests");
        expect(schema.tags.map((tag) => tag.name)).toContain("Media Storage");
        expect(schema.tags.map((tag) => tag.name)).toContain("Account");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("🌸 BYOP");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("👤 Account");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("✨ Quests");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("Customer");
        expect(schema.components.schemas.EnterOnly).toBeDefined();
        expect(schema.components.schemas.MediaOnly).toBeDefined();

        // Code samples are injected post-merge on both gen-owned and
        // enter-owned paths.
        const chatPost = (
            schema.paths["/v1/chat/completions"] as Record<string, unknown>
        )?.post as Record<string, unknown> | undefined;
        expect(chatPost?.["x-codeSamples"]).toBeDefined();

        const realtimeGet = (
            schema.paths["/v1/realtime"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        const realtimeResponses = realtimeGet?.responses as
            | Record<string, unknown>
            | undefined;
        expect(realtimeResponses?.["426"]).toBeDefined();
        expect(realtimeResponses?.["503"]).toBeDefined();

        const accountKeyGet = (
            schema.paths["/account/key"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(accountKeyGet?.["x-codeSamples"]).toBeDefined();

        // The catalog is unauthenticated → marked public (security: []).
        const questsCatalogGet = (
            schema.paths["/quests/catalog"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(questsCatalogGet?.security).toEqual([]);
    });

    it("does not add noindex to docs responses at the worker boundary", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/llm.txt"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Robots-Tag")).toBeNull();
        const body = await response.text();
        expect(body).toContain("Base URL:");
        expect(body).toContain("POST /v1/embeddings");
    });

    it("serves markdown table overflow styles in the API reference", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain(".scalar-app .markdown table");
        expect(html).toContain("overflow-x: auto");
        expect(html).toContain("ph-doc-nav-item");
        expect(html).toContain("ph-doc-icon");
        expect(html).toContain("ph-doc-nav-icon");
        expect(html).toContain("normalizeScalarNavLabel");
        expect(html).toContain("Open|Close");
        expect(html).toContain(
            'property="og:title" content="Docs | pollinations.ai"',
        );
        expect(html).toContain(
            'property="og:image" content="https://gen.pollinations.ai/og-image.png"',
        );
        expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    });

    it("serves the OpenAPI schema as YAML when ?format=yaml", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/open-api/generate-schema?format=yaml",
            ),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain(
            "application/yaml",
        );
        const body = await response.text();
        const parsed = yamlParse(body) as { paths: Record<string, unknown> };
        expect(parsed.paths["/v1/chat/completions"]).toBeDefined();
    });

    it("serves the guides index and individual guide pages", async () => {
        const ctx = createExecutionContext();

        const indexRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides"),
            envWithEnterSchema({}),
            ctx,
        );
        expect(indexRes.status).toBe(200);
        const indexHtml = await indexRes.text();
        expect(indexHtml).toContain("guide-card");
        expect(indexHtml).toContain("ph-doc-icon");
        expect(indexHtml).toContain("/docs/guides/byop");
        expect(indexHtml).toContain("/docs/guides/cli");
        expect(indexHtml).toContain("/docs/guides/mcp");

        const byopRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides/byop"),
            envWithEnterSchema({}),
            ctx,
        );
        expect(byopRes.status).toBe(200);
        expect(await byopRes.text()).toContain("BYOP");

        const missingRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides/notexist"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(missingRes.status).toBe(404);
    });

    it("filters /docs/llm.txt by section", async () => {
        const ctx = createExecutionContext();

        const apiRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/llm.txt?section=api"),
            envWithEnterSchema({}),
            ctx,
        );
        expect(apiRes.status).toBe(200);
        const apiBody = await apiRes.text();
        expect(apiBody).toContain("Base URL:");
        // Stable heading marker proves the realtime modality is composed into
        // the api section, without pinning volatile mid-prose wording.
        expect(apiBody).toContain("## Realtime Voice");
        expect(apiBody).not.toContain("## BYOP");

        const byopRes = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/llm.txt?section=byop",
            ),
            envWithEnterSchema({}),
            ctx,
        );
        expect(byopRes.status).toBe(200);
        expect(await byopRes.text()).toContain("## BYOP");

        const badRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/llm.txt?section=bad"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(badRes.status).toBe(404);
    });
});
