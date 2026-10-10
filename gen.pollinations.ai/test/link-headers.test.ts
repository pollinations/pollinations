import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env.ts";
import worker from "../src/index.ts";
import {
    AGENT_DISCOVERY_LINKS,
    agentDiscoveryLinks,
} from "../src/middleware/agent-discovery.ts";

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

function env(): CloudflareBindings {
    return {
        ENTER: {
            fetch: async () => new Response("enter"),
        } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
    } as CloudflareBindings;
}

async function fetchWorker(
    path: string,
    init: RequestInit = {},
    workerEnv: CloudflareBindings = env(),
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://staging.gen.pollinations.ai${path}`, init),
        workerEnv,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

const EXPECTED_LINKS = [
    '</openapi.json>; rel="service-desc"',
    '</docs/llm.txt>; rel="service-doc"',
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</.well-known/ai-catalog.json>; rel="describedby"',
];

describe("agent discovery Link headers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("advertises the machine entry points on the landing and docs pages", async () => {
        for (const path of ["/", "/docs"]) {
            const response = await fetchWorker(path);
            expect(response.status).toBe(200);
            const link = response.headers.get("Link");
            for (const expected of EXPECTED_LINKS) {
                expect(link).toContain(expected);
            }
        }
    });

    it("returns the same links on HEAD requests without a body", async () => {
        for (const path of ["/", "/docs"]) {
            const response = await fetchWorker(path, { method: "HEAD" });

            expect(response.status).toBe(200);
            const link = response.headers.get("Link");
            for (const expected of EXPECTED_LINKS) {
                expect(link).toContain(expected);
            }
            expect(await response.text()).toBe("");
        }
    });

    it("matches the discovery paths with query strings", async () => {
        const response = await fetchWorker("/docs?section=cli");

        expect(response.status).toBe(200);
        const link = response.headers.get("Link");
        for (const expected of EXPECTED_LINKS) {
            expect(link).toContain(expected);
        }
    });

    it("appends to an existing Link header instead of replacing it", async () => {
        const app = new Hono<Env>();
        app.use("*", agentDiscoveryLinks());
        app.get("/", (c) => {
            c.header("Link", '<https://example.com/hint>; rel="describedby"');
            return c.text("ok");
        });

        const response = await app.request(
            "https://staging.gen.pollinations.ai/",
        );

        expect(response.headers.get("Link")).toBe(
            `<https://example.com/hint>; rel="describedby", ${AGENT_DISCOVERY_LINKS}`,
        );
    });

    it("keeps machine endpoints and redirects free of the discovery set", async () => {
        for (const path of [
            "/llms.txt",
            "/docs/llm.txt",
            "/docs/polli-skill.md",
            "/robots.txt",
        ]) {
            const response = await fetchWorker(path);
            expect(response.status).toBe(200);
            expect(response.headers.get("Link")).toBeNull();
        }

        const redirect = await fetchWorker("/docs/");
        expect(redirect.status).toBe(301);
        expect(redirect.headers.get("Link")).toBeNull();
    });

    it("adds nothing to the OpenAPI schema endpoint", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ paths: {}, components: {} }), {
                headers: { "Content-Type": "application/json" },
            }),
        );

        const response = await fetchWorker(
            "/openapi.json",
            {},
            envWithEnterSchema({
                openapi: "3.1.0",
                info: { title: "Enter", version: "0.0.0" },
                paths: {},
                components: {},
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Link")).toBeNull();
    });

    it("does not advertise on non-GET/HEAD methods", async () => {
        const response = await fetchWorker("/", { method: "POST" });

        expect([404, 405]).toContain(response.status);
        expect(response.headers.get("Link")).toBeNull();
    });

    it("does not touch the API catalog self link", async () => {
        const response = await fetchWorker("/.well-known/api-catalog", {
            method: "HEAD",
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("Link")).toBe(
            '<https://staging.gen.pollinations.ai/.well-known/api-catalog>; rel="api-catalog"',
        );
    });
});
