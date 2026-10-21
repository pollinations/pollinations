import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse as yamlParse } from "yaml";
import {
    buildCurl,
    fetchOpenApiSpec,
    renderEndpoint,
    type Spec,
} from "../scripts/generate-apidocs.ts";
import { requestExampleErrors } from "../scripts/validate-request-examples.ts";
import { authenticateDocsRequest } from "../src/docs-client/request-auth.ts";
import worker from "../src/index.ts";
import { E2B_PATH, e2bRoutes } from "../src/routes/e2b.ts";

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
    it("adds the connected key only to outbound Pollinations requests", () => {
        for (const host of ["gen", "enter", "media"]) {
            const request = new Request(
                `https://${host}.pollinations.ai/account/key`,
                {
                    headers: { Authorization: "Bearer YOUR_API_KEY" },
                },
            );
            authenticateDocsRequest(request, "test-connected-credential");
            expect(request.headers.get("Authorization")).toBe(
                "Bearer test-connected-credential",
            );
        }
        const foreignRequest = new Request(
            "https://gen.pollinations.ai.example.com/account/key",
            {
                headers: { Authorization: "Bearer YOUR_API_KEY" },
            },
        );
        expect(() =>
            authenticateDocsRequest(
                foreignRequest,
                "test-connected-credential",
            ),
        ).toThrow();
        expect(foreignRequest.headers.get("Authorization")).toBe(
            "Bearer YOUR_API_KEY",
        );
    });

    it("preserves manual authentication and unauthenticated requests", () => {
        for (const authorization of [null, "Bearer manually-entered-key"]) {
            const request = new Request(
                "https://gen.pollinations.ai/account/key",
                {
                    headers: authorization
                        ? { Authorization: authorization }
                        : {},
                },
            );
            authenticateDocsRequest(request, "test-connected-credential");
            expect(request.headers.get("Authorization")).toBe(authorization);
        }
        const disconnectedRequest = new Request(
            "https://gen.pollinations.ai/account/key",
            {
                headers: { Authorization: "Bearer YOUR_API_KEY" },
            },
        );
        authenticateDocsRequest(disconnectedRequest, null);
        expect(disconnectedRequest.headers.get("Authorization")).toBe(
            "Bearer YOUR_API_KEY",
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("redirects the alternate docs hostname to the registered sign-in host", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.myceli.ai/docs?view=reference"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe(
            "https://gen.pollinations.ai/docs?view=reference",
        );
    });

    it("generates valid request examples from the checked-out Gen schema", async () => {
        // Enter and Media validate their own source schemas in their own suites.
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ paths: {} }),
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/open-api/generate-schema",
            ),
            envWithEnterSchema({
                paths: { "/api/customer/portal": { get: {} } },
            }),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(response.status).toBe(200);
        const schema = (await response.json()) as Spec;
        expect(schema["x-schema-sources"]).toEqual({
            gen: true,
            enter: false,
            media: false,
        });
        const text = schema.paths["/text/{prompt}"]?.get;
        expect(text).toBeDefined();
        expect(buildCurl(schema, "get", "/text/{prompt}", text)).not.toContain(
            "seed=:seed",
        );
        expect(requestExampleErrors(schema)).toEqual([]);
    });

    it("lists every sandbox route in the API reference, linking E2B for fields", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ paths: {} }),
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/open-api/generate-schema",
            ),
            envWithEnterSchema({ paths: {} }),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        const schema = (await response.json()) as Spec;
        const routes = e2bRoutes.routes.filter(
            ({ method }) => method !== "ALL",
        );
        expect(routes.length).toBeGreaterThan(0);
        for (const { method, path } of routes) {
            const docPath = `${E2B_PATH}${path.replace(":id", "{id}")}`;
            const operation = schema.paths[docPath]?.[method.toLowerCase()];
            expect(operation, `${method} ${docPath}`).toMatchObject({
                tags: ["Sandboxes API"],
            });
            if (path !== "/pricing") {
                expect(operation.description).toContain(
                    "https://docs.e2b.dev/api-reference/sandboxes/",
                );
            }
        }
        expect(schema.paths[`${E2B_PATH}/pricing`].get.security).toEqual([]);
        expect(schema.paths[`${E2B_PATH}/sandboxes`].post.deprecated).toBe(
            true,
        );
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
                "/x402/keys": {
                    get: { tags: ["👤 Account"] },
                },
                "/x402/keys/{packKey}": {
                    get: { tags: ["👤 Account"] },
                    post: { tags: ["👤 Account"] },
                },
                "/api/account/quests/rewards": {
                    get: { tags: ["👤 Account"] },
                },
                // Drifted enter tag literals must still land in gen's groups.
                "/api/account/integrations": {
                    get: { tags: ["🔗 Account"] },
                },
                "/api/account/my-models/endpoint-agents": {
                    post: { tags: ["Community Agents "] },
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
        const schema = (await response.json()) as Spec & {
            "x-tagGroups": { name: string; tags: string[] }[];
            tags: { name: string; description?: string }[];
        };

        expect(schema["x-schema-sources"]).toEqual({
            gen: true,
            enter: true,
            media: true,
        });

        expect(schema.servers).toEqual([
            { url: "https://gen.pollinations.ai" },
        ]);
        expect(schema.paths["/v1/chat/completions"]).toBeDefined();
        expect(schema.paths["/realtime"]).toBeDefined();
        expect(schema.paths["/v1/realtime"]).toBeDefined();
        expect(schema).toHaveProperty([
            "paths",
            "/v1/systemone",
            "post",
            "requestBody",
            "content",
            "application/json",
            "schema",
        ]);
        const jobStatusGet = (
            schema.paths["/v1/jobs/{id}"] as Record<string, unknown>
        )?.get as { tags?: string[] } | undefined;
        expect(jobStatusGet?.tags).toEqual(["Jobs"]);
        expect(
            schema["x-tagGroups"].find((group) => group.name === "Generation")
                ?.tags,
        ).toContain("Jobs");
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
        expect(schema.paths["/account/quests/rewards"]).toBeDefined();
        expect(schema.paths["/account/my-models"]).toBeDefined();
        expect(schema.paths["/account/my-models/{id}/update"]).toBeDefined();
        expect(schema.paths["/account/agents"]).toBeDefined();
        expect(schema.paths["/account/agents/{id}"]).toBeDefined();
        expect(schema.paths["/quests/catalog"]).toBeDefined();
        expect(schema.paths["/api/x402/keys"]).toBeDefined();
        expect(schema.paths["/api/x402/keys/{packKey}"]).toBeDefined();
        expect(schema.paths["/x402/keys/{packKey}"]).toBeUndefined();
        expect(schema.paths["/api/account/key"]).toBeUndefined();
        expect(schema.paths["/api/account/profile"]).toBeUndefined();
        expect(schema.paths["/api/account/quests"]).toBeUndefined();
        expect(schema.paths["/api/account/quests/rewards"]).toBeUndefined();
        expect(schema.paths["/api/account/my-models"]).toBeUndefined();
        expect(schema.paths["/api/account/agents"]).toBeUndefined();
        expect(schema.paths["/api/quests/catalog"]).toBeUndefined();
        expect(schema.paths["/api/customer/portal"]).toBeUndefined();
        expect(schema.paths["/api-keys"]).toBeUndefined();
        expect(schema.paths["/generate/text/{prompt}"]).toBeUndefined();
        expect(schema.paths["/{id}"]).toBeDefined();
        expect(schema.paths["/{id}/metadata"]).toBeDefined();
        expect(schema.paths["/media"]).toBeDefined();
        expect(schema.paths["/media/{id}"]).toBeDefined();
        const guides = schema["x-tagGroups"].find(
            (group) => group.name === "Guides",
        );
        const getStarted = schema["x-tagGroups"].find(
            (group) => group.name === "Get Started",
        );
        const resources = schema["x-tagGroups"].find(
            (group) => group.name === "Resources",
        );
        expect(getStarted?.tags).not.toContain("x402 Prepaid Keys");
        expect(guides?.tags).not.toContain("x402 Prepaid Keys");
        expect(resources?.tags).toContain("x402 Prepaid Keys");
        expect(guides?.tags).toContain("Publish a Model");
        expect(guides?.tags).not.toContain("Community Models");
        expect(resources?.tags).toContain("Community Models");
        expect(resources?.tags).not.toContain("Publish a Model");
        expect(guides?.tags).toContain("Publish an Agent");
        expect(guides?.tags).toContain("Coding Harnesses");
        expect(guides?.tags).not.toContain("Community Agents");
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
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "x402 Prepaid Keys",
        );
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
        expect(
            renderEndpoint(schema, "get", "/v1/realtime", realtimeGet ?? {}),
        ).toContain("`101` — WebSocket connection established");

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

        const integrationsGet = (
            schema.paths["/account/integrations"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(integrationsGet?.tags).toEqual(["Account"]);

        const endpointAgentsPost = (
            schema.paths["/account/my-models/endpoint-agents"] as Record<
                string,
                unknown
            >
        )?.post as Record<string, unknown> | undefined;
        expect(endpointAgentsPost?.tags).toEqual(["Community Agents"]);

        // Every operation tag must be one gen declares, or Scalar shows an
        // extra, undescribed sidebar group.
        const declaredTags = new Set(schema.tags.map((tag) => tag.name));
        const undeclared = Object.entries(schema.paths).flatMap(
            ([path, pathItem]) =>
                Object.entries(pathItem as Record<string, unknown>).flatMap(
                    ([method, operation]) =>
                        (
                            ((operation as { tags?: unknown })?.tags ??
                                []) as string[]
                        )
                            .filter((tag) => !declaredTags.has(tag))
                            .map((tag) => `${method} ${path}: ${tag}`),
                ),
        );
        expect(undeclared).toEqual([]);
        expect(new Set(schema.tags.map((tag) => tag.name)).size).toBe(
            schema.tags.length,
        );

        // The catalog is unauthenticated → marked public (security: []).
        const questsCatalogGet = (
            schema.paths["/quests/catalog"] as Record<string, unknown>
        )?.get as Record<string, unknown> | undefined;
        expect(questsCatalogGet?.security).toEqual([]);

        const purchase = schema.paths[
            "/api/x402/keys/{packKey}"
        ] as unknown as {
            servers: { url: string }[];
            get: { tags: string[]; security: unknown[] };
            post: { tags: string[]; security: unknown[] };
        };
        expect(purchase.servers).toEqual([
            { url: "https://enter.pollinations.ai" },
        ]);
        for (const operation of [purchase.get, purchase.post]) {
            expect(operation.tags).toEqual(["x402 Prepaid Keys"]);
            expect(operation.security).toEqual([]);
        }
        const amountList = schema.paths["/api/x402/keys"] as unknown as {
            servers: { url: string }[];
            get: { tags: string[]; security: unknown[] };
        };
        expect(amountList.servers).toEqual(purchase.servers);
        expect(amountList.get.tags).toEqual(["x402 Prepaid Keys"]);
        expect(amountList.get.security).toEqual([]);

        vi.mocked(fetch).mockResolvedValue(Response.json(schema));
        await expect(
            fetchOpenApiSpec("https://gen.pollinations.ai/openapi.json"),
        ).resolves.toEqual(schema);
    });

    it.each(["http failure", "network failure", "no operations"])(
        "keeps live docs available but blocks publication after Media %s",
        async (failure) => {
            const mediaFetch = vi.spyOn(globalThis, "fetch");
            if (failure === "network failure") {
                mediaFetch.mockRejectedValue(new Error("connection refused"));
            } else {
                mediaFetch.mockResolvedValue(
                    failure === "http failure"
                        ? new Response("unavailable", { status: 503 })
                        : Response.json({
                              paths: { "/media": { servers: [{ url: "/" }] } },
                          }),
                );
            }
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request("https://gen.pollinations.ai/openapi.json"),
                envWithEnterSchema({
                    paths: { "/account/profile": { get: {} } },
                }),
                ctx,
            );
            await waitOnExecutionContext(ctx);
            expect(response.status).toBe(200);
            mediaFetch.mockResolvedValue(response);
            await expect(
                fetchOpenApiSpec("https://gen.pollinations.ai/openapi.json"),
            ).rejects.toThrow("from: media");
        },
    );

    it("rejects a failed schema fetch before trying to parse its body", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("not JSON", { status: 503 }),
        );
        await expect(
            fetchOpenApiSpec("https://gen.pollinations.ai/openapi.json"),
        ).rejects.toThrow("HTTP 503");
    });

    it.each(["gen", "enter", "media"])(
        "requires positive completeness metadata for %s",
        async (source) => {
            const sources: Record<string, boolean> = {
                gen: true,
                enter: true,
                media: true,
            };
            delete sources[source];
            vi.spyOn(globalThis, "fetch").mockResolvedValue(
                Response.json({ "x-schema-sources": sources }),
            );
            await expect(
                fetchOpenApiSpec("https://gen.pollinations.ai/openapi.json"),
            ).rejects.toThrow(`from: ${source}`);
        },
    );

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
        expect(html).toContain(
            '<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.74.0/dist/browser/standalone.js" integrity="sha384-VXnKAz61Xwc3tbw1P+KKrUP7YbcsSl1Ik4is5UnogJyw9XEYZ5Ay/T1i0zPYtSZH" crossorigin="anonymous">',
        );
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

    it("adds the pinned sign-in button without rendering credentials", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs", {
                headers: {
                    Authorization: "Bearer example-private-credential",
                },
            }),
            {
                ...envWithEnterSchema({}),
                DOCS_APP_KEY: "pk_docs_test",
            } as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        const html = await response.text();
        expect(response.status).toBe(200);
        expect(html).toContain(
            '<polli-connect app-key="pk_docs_test" budget="5" expiry="7" hide-buy-pollen',
        );
        let menuLinks: string | null = null;
        await new HTMLRewriter()
            .on("polli-connect", {
                element(element) {
                    menuLinks = element.getAttribute("menu-links");
                },
            })
            .transform(new Response(html))
            .text();
        // HTMLRewriter exposes raw entities; decode as a browser attribute does.
        const decodedLinks = (menuLinks ?? "")
            .replaceAll("&quot;", '"')
            .replaceAll("&amp;", "&");
        expect(JSON.parse(decodedLinks)).toEqual([
            {
                href: "https://discord.com/channels/885844321461485618/889573359111774329",
                label: "Need help?",
                icon: "discord",
            },
            {
                href: "https://github.com/pollinations/pollinations/issues",
                label: "Found a bug?",
                icon: "bug",
            },
        ]);
        expect(html).toMatch(
            /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@pollinations\/ui@[^"]+\/dist\/connect\.js" integrity="sha384-[^"]+" crossorigin="anonymous">/,
        );
        // The page runs the tested helper's own source.
        expect(html).toContain(String(authenticateDocsRequest));
        expect(html).toContain(
            "window.pollinationsDocsReference = Scalar.createApiReference(",
        );
        expect(html).not.toContain("example-private-credential");
    });

    it("omits sign-in when no docs App Key is configured", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);
        const html = await response.text();
        expect(html).not.toContain("<polli-connect");
        expect(html).not.toContain("connect.js");
    });

    it("keeps support links in the drawer without an app key, but omits Dashboard", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs"),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        const html = await response.text();
        for (const href of [
            "https://discord.com/channels/885844321461485618/889573359111774329",
            "https://github.com/pollinations/pollinations/issues",
        ]) {
            expect(html).toContain(`href=\\"${href}\\"`);
        }
        expect(html).not.toContain('href=\\"https://enter.pollinations.ai\\"');
    });

    it("serves the guide as Markdown when an agent prefers it", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs", {
                headers: { Accept: "text/markdown" },
            }),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(
            "text/markdown; charset=utf-8",
        );
        expect(response.headers.get("Vary")).toBe("Accept");
        expect(response.headers.get("Cache-Control")).toBe(
            "private, max-age=3600",
        );
        const markdown = await response.text();
        expect(markdown).toContain("Base URL:");
        expect(markdown).toContain("POST /v1/embeddings");
        expect(markdown).not.toContain("<html");
    });

    it("keeps the HTML reference for clients that do not ask for Markdown", async () => {
        const ctx = createExecutionContext();
        // curl and generic clients send */*.
        const generic = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs", {
                headers: { Accept: "*/*" },
            }),
            envWithEnterSchema({}),
            ctx,
        );
        expect(generic.headers.get("Content-Type")).toContain("text/html");

        // Section endpoints are plain text and are not negotiated.
        const section = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/llm.txt?section=cli",
                {
                    headers: { Accept: "text/markdown" },
                },
            ),
            envWithEnterSchema({}),
            ctx,
        );
        expect(section.headers.get("Content-Type")).toContain("text/plain");
        await waitOnExecutionContext(ctx);
    });

    it("keeps the HTML reference for browser-style Accept headers", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs", {
                headers: {
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
            }),
            envWithEnterSchema({}),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/html");
        expect(response.headers.get("Vary")).toBe("Accept");
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
        expect(realtimeSection).toContain("elevenlabs/scribe-v2-realtime");
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
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/ask-jev");
        expect(mcpBody).toContain("`jev_decide`");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/ffmpeg");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/exa");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/composio");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/computer");
        expect(mcpBody).toContain("https://gen.pollinations.ai/mcp/machines");
        expect(mcpBody).toContain("### Pollinations MCP");
        expect(mcpBody).toContain("### FFmpeg MCP");
        expect(mcpBody).toContain("### Exa Search MCP");
        expect(mcpBody).toContain("### Connectors MCP");
        expect(mcpBody).toContain("### Computer MCP");
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
