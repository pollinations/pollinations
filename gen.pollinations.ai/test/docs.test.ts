import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    it("serves a gen-owned OpenAPI schema and merges public account paths only", async () => {
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
            tags: [{ name: "👤 Account" }, { name: "Customer" }],
            components: {
                schemas: {
                    EnterOnly: { type: "object" },
                },
            },
            paths: {
                "/account/key": { get: { tags: ["Account"] } },
                "/api/account/profile": { get: { tags: ["👤 Account"] } },
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
        expect(schema.paths["/image/{prompt}"]).toBeDefined();
        expect(schema.paths["/account/key"]).toBeDefined();
        expect(schema.paths["/account/profile"]).toBeDefined();
        expect(schema.paths["/api/account/key"]).toBeUndefined();
        expect(schema.paths["/api/account/profile"]).toBeUndefined();
        expect(schema.paths["/api/customer/portal"]).toBeUndefined();
        expect(schema.paths["/api-keys"]).toBeUndefined();
        expect(schema.paths["/generate/text/{prompt}"]).toBeUndefined();
        expect(schema.paths["/{hash}"]).toBeDefined();
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "🌸 Bring Your Own Pollen",
        );
        const byopTag = schema.tags.find(
            (tag) => tag.name === "🌸 Bring Your Own Pollen",
        );
        expect(byopTag?.description).toContain("Bring Your Own Pollen");
        expect(schema.tags.map((tag) => tag.name)).toContain(
            "📦 Media Storage",
        );
        expect(schema.tags.map((tag) => tag.name)).not.toContain("Customer");
        expect(schema.components.schemas.EnterOnly).toBeDefined();
        expect(schema.components.schemas.MediaOnly).toBeDefined();
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
    });
});
