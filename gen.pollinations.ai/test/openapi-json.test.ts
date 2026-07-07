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

function mockMediaSchema() {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
            JSON.stringify({ paths: {}, components: { schemas: {} } }),
            { headers: { "Content-Type": "application/json" } },
        ),
    );
}

function collectPropertySets(value: unknown): Record<string, unknown>[] {
    if (!value || typeof value !== "object") return [];

    const record = value as Record<string, unknown>;
    const properties =
        record.properties &&
        typeof record.properties === "object" &&
        !Array.isArray(record.properties)
            ? [record.properties as Record<string, unknown>]
            : [];

    return [
        ...properties,
        ...Object.values(record).flatMap((child) => collectPropertySets(child)),
    ];
}

const ENTER_SCHEMA = {
    openapi: "3.1.0",
    info: { title: "Enter", version: "0.0.0" },
    paths: { "/account/key": { get: { tags: ["Account"] } } },
};

describe("/openapi.json", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("serves the merged OpenAPI spec as JSON at a discoverable URL", async () => {
        const ctx = createExecutionContext();
        mockMediaSchema();

        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/openapi.json"),
            envWithEnterSchema(ENTER_SCHEMA),
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain(
            "application/json",
        );
        // Discoverable: the spec must stay indexable (no noindex robots tag).
        expect(response.headers.get("X-Robots-Tag")).toBeNull();
        const schema = (await response.json()) as {
            openapi: string;
            paths: Record<string, unknown>;
        };
        expect(schema.openapi).toBe("3.1.0");
        expect(Object.keys(schema.paths).length).toBeGreaterThan(0);
        // Gen-owned merged paths prove the real merge ran (not a stub/404).
        expect(schema.paths["/v1/chat/completions"]).toBeDefined();
        expect(schema.paths["/image/{prompt}"]).toBeDefined();
        expect(schema.paths["/account/key"]).toBeDefined();

        const chatRequestPropertySets = collectPropertySets(schema).filter(
            (properties) => "reasoning_effort" in properties,
        );
        expect(chatRequestPropertySets.length).toBeGreaterThan(0);
        for (const properties of chatRequestPropertySets) {
            expect(properties.thinking).toBeUndefined();
            expect(properties.thinking_budget).toBeUndefined();
        }
    });

    it("returns the same spec as /docs/open-api/generate-schema", async () => {
        const aliasCtx = createExecutionContext();
        mockMediaSchema();
        const aliasRes = await worker.fetch(
            new Request("https://gen.pollinations.ai/openapi.json"),
            envWithEnterSchema(ENTER_SCHEMA),
            aliasCtx,
        );
        await waitOnExecutionContext(aliasCtx);
        const aliasSchema = (await aliasRes.json()) as Record<string, unknown>;
        vi.restoreAllMocks();

        const canonicalCtx = createExecutionContext();
        mockMediaSchema();
        const canonicalRes = await worker.fetch(
            new Request(
                "https://gen.pollinations.ai/docs/open-api/generate-schema",
            ),
            envWithEnterSchema(ENTER_SCHEMA),
            canonicalCtx,
        );
        await waitOnExecutionContext(canonicalCtx);
        const canonicalSchema = (await canonicalRes.json()) as Record<
            string,
            unknown
        >;

        expect(Object.keys(aliasSchema).sort()).toEqual(
            Object.keys(canonicalSchema).sort(),
        );
        expect(aliasSchema).toEqual(canonicalSchema);
    });
});
