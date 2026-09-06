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

function envWithFailedEnterSchema(): CloudflareBindings {
    return {
        ENTER: {
            fetch: async () => new Response("unavailable", { status: 503 }),
        } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
        TINYBIRD_INGEST_URL:
            "https://tinybird.test/v0/events?name=request_event",
        TINYBIRD_INGEST_TOKEN: "test-token",
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
                        "/{id}": {
                            get: {
                                tags: ["media.pollinations.ai"],
                            },
                        },
                        "/{id}/metadata": {
                            get: {
                                tags: ["media.pollinations.ai"],
                            },
                        },
                        "/media": {
                            get: {
                                tags: ["media.pollinations.ai"],
                            },
                        },
                        "/media/{id}": {
                            delete: {
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
                { name: "🧩 Community Models" },
                { name: "🤖 Community Agents" },
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
                "/api/account/quests": {
                    get: {
                        tags: ["👤 Account"],
                        description:
                            "Returns quest status. API keys require `account:usage`.",
                    },
                },
                "/api/account/my-models": {
                    get: {
                        tags: ["🧩 Community Models"],
                        description:
                            "List invite-only community text models. API keys require `account:keys`.",
                    },
                },
                "/api/account/my-models/{id}/update": {
                    post: { tags: ["🧩 Community Models"] },
                },
                "/api/account/agents": {
                    get: {
                        tags: ["🤖 Community Agents"],
                        description:
                            "List managed agents. API keys require `account:keys`.",
                    },
                },
                "/api/account/agents/{id}": {
                    patch: { tags: ["🤖 Community Agents"] },
                },
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
            "x-tagGroups": { name: string; tags: string[] }[];
            tags: { name: string; description?: string }[];
            components: { schemas: Record<string, unknown> };
        };

        expect(schema.servers).toEqual([
            { url: "https://gen.pollinations.ai" },
        ]);
        expect(schema.paths["/v1/chat/completions"]).toBeDefined();
        expect(schema.paths["/realtime"]).toBeDefined();
        expect(schema.paths["/v1/realtime"]).toBeDefined();
        expect(
            schema.paths["/v1/audio/transcriptions/realtime"],
        ).toBeUndefined();
        expect(schema.paths["/image/{prompt}"]).toBeDefined();
        const model3dPost = (
            schema.paths["/3d/{prompt}"] as Record<string, unknown>
        )?.post as Record<string, unknown>;
        expect(model3dPost).toBeDefined();
        const model3dRequestBody = model3dPost.requestBody as {
            content: {
                "application/json": {
                    schema: {
                        additionalProperties?: boolean;
                        properties: Record<string, unknown>;
                    };
                };
            };
        };
        const model3dBodySchema =
            model3dRequestBody.content["application/json"].schema;
        expect(Object.keys(model3dBodySchema.properties)).toHaveLength(4);
        expect(Object.keys(model3dBodySchema.properties)).toEqual(
            expect.arrayContaining(["model", "image", "resolution", "seed"]),
        );
        expect(model3dBodySchema.properties.safe).toBeUndefined();
        expect(
            (model3dBodySchema.properties.resolution as { default?: string })
                .default,
        ).toBe("low");
        expect(model3dBodySchema.additionalProperties).toBe(false);
        expect(schema.paths["/account/key"]).toBeDefined();
        expect(schema.paths["/account/profile"]).toBeDefined();
        expect(schema.paths["/account/quests"]).toBeDefined();
        expect(schema.paths["/account/my-models"]).toBeDefined();
        expect(schema.paths["/account/my-models/{id}/update"]).toBeDefined();
        expect(schema.paths["/account/agents"]).toBeDefined();
        expect(schema.paths["/account/agents/{id}"]).toBeDefined();
        expect(schema.paths["/quests/catalog"]).toBeDefined();
        expect(schema.paths["/api/account/key"]).toBeUndefined();
        expect(schema.paths["/api/account/profile"]).toBeUndefined();
        expect(schema.paths["/api/account/quests"]).toBeUndefined();
        expect(schema.paths["/api/account/my-models"]).toBeUndefined();
        expect(schema.paths["/api/account/agents"]).toBeUndefined();
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
        expect(schema.paths["/{id}"]).toBeDefined();
        expect(schema.paths["/{id}/metadata"]).toBeDefined();
        expect(schema.paths["/media"]).toBeDefined();
        expect(schema.paths["/media/{id}"]).toBeDefined();
        const integrations = schema["x-tagGroups"].find(
            (group) => group.name === "Integrations",
        );
        const resources = schema["x-tagGroups"].find(
            (group) => group.name === "Resources",
        );
        expect(integrations?.tags).toContain("Publish a Model");
        expect(integrations?.tags).not.toContain("Community Models");
        expect(resources?.tags).toContain("Community Models");
        expect(resources?.tags).not.toContain("Publish a Model");
        expect(integrations?.tags).toContain("Publish an Agent");
        expect(integrations?.tags).toContain("Coding Harnesses");
        expect(integrations?.tags).not.toContain("Community Agents");
        expect(resources?.tags).toContain("Community Agents");
        expect(resources?.tags).not.toContain("Publish an Agent");
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "Connect User Wallets",
        );
        expect(schema.tags.map((tag) => tag.name)).toContain("Publish a Model");
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "Community Models",
        );
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "Publish an Agent",
        );
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "Community Agents",
        );
        expect(schema.tags.map((tag) => tag.name)).toContain("CLI");
        expect(
            schema.tags.find((tag) => tag.name === "Coding Harnesses")
                ?.description,
        ).toContain("polli harness dsh on");
        expect(schema.tags.map((tag) => tag.name)).toContain("MCP Servers");
        expect(schema.tags.map((tag) => tag.name)).toContain("Quests");
        expect(schema.tags.map((tag) => tag.name)).toContain("Media Storage");
        expect(schema.tags.map((tag) => tag.name)).toContain("Account");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("🌸 BYOP");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("BYOP");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("👤 Account");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("✨ Quests");
        expect(schema.tags.map((tag) => tag.name)).not.toContain("Customer");
        expect(schema.components.schemas.EnterOnly).toBeDefined();
        expect(schema.components.schemas.MediaOnly).toBeDefined();

        const mediaGet = (schema.paths["/{id}"] as Record<string, unknown>)
            ?.get as Record<string, unknown> | undefined;
        expect(mediaGet?.security).toEqual([]);

        const mediaGalleryGet = (
            schema.paths["/media"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(mediaGalleryGet?.security).toEqual([]);

        // Code samples are injected post-merge on both gen-owned and
        // enter-owned paths.
        const chatPost = (
            schema.paths["/v1/chat/completions"] as Record<string, unknown>
        )?.post as Record<string, unknown> | undefined;
        expect(chatPost?.["x-codeSamples"]).toBeDefined();
        const responsesPost = (
            schema.paths["/v1/responses"] as Record<string, unknown>
        )?.post as Record<string, unknown> | undefined;
        expect(responsesPost?.["x-codeSamples"]).toEqual([
            expect.objectContaining({ label: "cURL" }),
            expect.objectContaining({ label: "Streaming" }),
            expect.objectContaining({ label: "Python" }),
            expect.objectContaining({ label: "JavaScript" }),
        ]);

        const realtimeGet = (
            schema.paths["/v1/realtime"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        const realtimeResponses = realtimeGet?.responses as
            | Record<string, unknown>
            | undefined;
        expect(realtimeResponses?.["426"]).toBeDefined();
        expect(realtimeResponses?.["503"]).toBeDefined();

        const nativeRealtimeGet = (
            schema.paths["/realtime"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        const nativeRealtimeResponses = nativeRealtimeGet?.responses as
            | Record<string, unknown>
            | undefined;
        expect(nativeRealtimeResponses?.["426"]).toBeDefined();
        expect(nativeRealtimeResponses?.["503"]).toBeDefined();

        const accountKeyGet = (
            schema.paths["/account/key"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(accountKeyGet?.["x-codeSamples"]).toBeDefined();

        const accountQuestsGet = (
            schema.paths["/account/quests"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(accountQuestsGet?.description).toContain("account:usage");

        const myModelsGet = (
            schema.paths["/account/my-models"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(myModelsGet?.description).toContain("account:keys");
        expect(myModelsGet?.tags).toEqual(["Community Models"]);

        const agentsGet = (
            schema.paths["/account/agents"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(agentsGet?.description).toContain("account:keys");
        expect(agentsGet?.tags).toEqual(["Community Agents"]);

        // The catalog is unauthenticated → marked public (security: []).
        const questsCatalogGet = (
            schema.paths["/quests/catalog"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(questsCatalogGet?.security).toEqual([]);
    });

    it("does not publish a partial schema when the account schema fails", async () => {
        const ctx = createExecutionContext();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ paths: {}, components: {} }), {
                headers: { "Content-Type": "application/json" },
            }),
        );

        const response = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/open-api/generate-schema",
            ),
            envWithFailedEnterSchema(),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(500);
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
        expect(html).toContain(
            'property="og:title" content="Docs | pollinations.ai"',
        );
        expect(html).toContain(
            'property="og:image" content="https://gen.pollinations.ai/og-image.png"',
        );
        expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
        expect(html).toContain("window.location.hash === '#tag/byop'");
        expect(html).toContain("#tag/connect-user-wallets");
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

    it("redirects retired guide URLs to Scalar tag anchors", async () => {
        const ctx = createExecutionContext();

        const indexRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides", {
                redirect: "manual",
            }),
            envWithEnterSchema({}),
            ctx,
        );
        expect(indexRes.status).toBe(301);
        expect(indexRes.headers.get("Location")).toBe("/docs");

        const mcpRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides/mcp", {
                redirect: "manual",
            }),
            envWithEnterSchema({}),
            ctx,
        );
        expect(mcpRes.status).toBe(301);
        expect(mcpRes.headers.get("Location")).toBe("/docs#tag/mcp-servers");

        const agentsRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides/agents", {
                redirect: "manual",
            }),
            envWithEnterSchema({}),
            ctx,
        );
        expect(agentsRes.status).toBe(301);
        expect(agentsRes.headers.get("Location")).toBe(
            "/docs#tag/publish-an-agent",
        );

        const modelsRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides/models", {
                redirect: "manual",
            }),
            envWithEnterSchema({}),
            ctx,
        );
        expect(modelsRes.status).toBe(301);
        expect(modelsRes.headers.get("Location")).toBe(
            "/docs#tag/publish-a-model",
        );

        const walletRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/guides/byop", {
                redirect: "manual",
            }),
            envWithEnterSchema({}),
            ctx,
        );
        expect(walletRes.status).toBe(301);
        expect(walletRes.headers.get("Location")).toBe(
            "/docs#tag/connect-user-wallets",
        );

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
        expect(apiBody).toContain("## Realtime");
        const realtimeSection = apiBody.slice(
            apiBody.indexOf("## Realtime"),
            apiBody.indexOf("## 3D Generation"),
        );
        expect(realtimeSection).toContain("scribe-realtime");
        expect(realtimeSection).toContain("`GET /realtime`");
        expect(realtimeSection).toContain("`GET /v1/realtime`");
        expect(apiBody).not.toContain("/v1/audio/transcriptions/realtime");
        expect(apiBody).not.toContain("## Connect User Wallets");

        const byopRes = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/llm.txt?section=byop",
            ),
            envWithEnterSchema({}),
            ctx,
        );
        expect(byopRes.status).toBe(200);
        expect(await byopRes.text()).toContain("## Connect User Wallets");

        const modelsRes = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/llm.txt?section=publish-a-model",
            ),
            envWithEnterSchema({}),
            ctx,
        );
        expect(modelsRes.status).toBe(200);
        const modelsBody = await modelsRes.text();
        expect(modelsBody).toContain("## Publish a Model");
        expect(modelsBody).toContain("/account/my-models");

        const agentsRes = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/llm.txt?section=publish-an-agent",
            ),
            envWithEnterSchema({}),
            ctx,
        );
        expect(agentsRes.status).toBe(200);
        const agentsBody = await agentsRes.text();
        expect(agentsBody).toContain("## Publish an Agent");
        expect(agentsBody).toContain("/account/agents");

        const mcpRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/llm.txt?section=mcp"),
            envWithEnterSchema({}),
            ctx,
        );
        expect(mcpRes.status).toBe(200);
        const mcpBody = await mcpRes.text();
        expect(mcpBody).toContain("## MCP Servers");
        expect(mcpBody).toContain(
            "https://gen.pollinations.ai/mcp/pollinations",
        );
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/ffmpeg");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/exa");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/composio");
        expect(mcpBody).toContain("### Pollinations MCP");
        expect(mcpBody).toContain("### FFmpeg MCP");
        expect(mcpBody).toContain("### Exa Search MCP");
        expect(mcpBody).toContain("### Composio MCP");
        expect(mcpBody).toContain("https://enter.pollinations.ai/my-models");
        expect(mcpBody).not.toContain("## Other built-in MCPs");
        expect(mcpBody).toContain("`generateImage`");
        expect(mcpBody).toContain("`runFfmpeg`");
        expect(mcpBody).toContain("`web_search_exa`");
        expect(mcpBody).not.toContain("mcp.pollinations.ai");
        expect(mcpBody).toContain("Streamable HTTP");
        expect(mcpBody).not.toContain("stdio");
        expect(mcpBody).not.toContain("npx @pollinations/mcp");
        expect(mcpBody).not.toContain("## Text");

        const harnessRes = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/llm.txt?section=coding-harnesses",
            ),
            envWithEnterSchema({}),
            ctx,
        );
        expect(harnessRes.status).toBe(200);
        const harnessBody = await harnessRes.text();
        expect(harnessBody).toContain("## Coding Harnesses");
        expect(harnessBody).toContain("polli harness dsh on");

        const badRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/llm.txt?section=bad"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(badRes.status).toBe(404);
    });
});
