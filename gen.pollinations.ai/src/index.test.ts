import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "./index.ts";

function envWithEnter(
    fetch: Fetcher["fetch"] = async () => new Response("enter"),
): CloudflareBindings {
    return {
        ENTER: { fetch } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
    } as CloudflareBindings;
}

async function fetchWorker(
    path: string,
    env = envWithEnter(),
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://staging.gen.pollinations.ai${path}`),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

async function optionsWorker(
    path: string,
    headers: Record<string, string>,
    env = envWithEnter(),
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://staging.gen.pollinations.ai${path}`, {
            method: "OPTIONS",
            headers,
        }),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("gen worker routing", () => {
    it("redirects root to docs", async () => {
        const response = await fetchWorker("/");

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/docs",
        );
    });

    it("accepts docs with a trailing slash", async () => {
        const response = await fetchWorker("/docs/");

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/docs",
        );
    });

    it("redirects legacy /api/docs paths to gen docs", async () => {
        const response = await fetchWorker(
            "/api/docs/open-api/generate-schema?format=json",
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/docs/open-api/generate-schema?format=json",
        );
    });

    it("does not treat /api/docssomething as a docs alias", async () => {
        const response = await fetchWorker("/api/docssomething");

        expect(response.status).toBe(404);
        expect(response.headers.get("Location")).toBeNull();
    });

    it("allows permissive CORS preflights for public API routes", async () => {
        const response = await optionsWorker("/v1/chat/completions", {
            Origin: "https://example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers":
                "Authorization, Content-Type, X-Pollinations-Test",
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
            "PATCH",
        );
        expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
            "Authorization,Content-Type,X-Pollinations-Test",
        );
        expect(response.headers.get("Access-Control-Expose-Headers")).toBe("*");
    });

    it("serves robots.txt locally", async () => {
        const response = await fetchWorker("/robots.txt");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/plain");
        await expect(response.text()).resolves.toContain("Disallow: /api/");
    });

    it("does not expose /api routes on gen", async () => {
        const response = await fetchWorker("/api/generate/v1/chat/completions");

        expect(response.status).toBe(404);
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("proxies public account api routes to enter", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return new Response("account");
        });

        const response = await fetchWorker("/account/keys?limit=10", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe(
            "https://staging.gen.pollinations.ai/api/account/keys?limit=10",
        );
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("forwards account root to enter unchanged", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return new Response("account-ui");
        });

        const response = await fetchWorker("/account", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe("https://staging.gen.pollinations.ai/account");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("forwards account root with a trailing slash to enter unchanged", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return new Response("account-ui");
        });

        const response = await fetchWorker("/account/", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe("https://staging.gen.pollinations.ai/account/");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("routes docs through the generation app without noindex", async () => {
        const response = await fetchWorker("/docs/llm.txt", envWithEnter());

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Robots-Tag")).toBeNull();
    });

    it.each([
        "/models",
        "/text/models",
        "/image/models",
        "/audio/models",
    ] as const)("routes public model path %s through gen", async (path) => {
        const response = await fetchWorker(path, envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as unknown[];
        expect(models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: expect.any(String) }),
            ]),
        );
    });

    it("serves OpenAI-compatible models without auth", async () => {
        const response = await fetchWorker("/v1/models", envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as {
            object: string;
            data: {
                id: string;
                supported_endpoints?: string[];
            }[];
        };
        expect(models.object).toBe("list");
        expect(models.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: expect.any(String),
                    supported_endpoints: expect.arrayContaining([
                        "/v1/chat/completions",
                    ]),
                }),
            ]),
        );
    });
});
