import { describe, expect, it } from "vitest";
import worker from "./index.ts";

const executionContext = {
    waitUntil() {},
    passThroughOnException() {},
} as unknown as ExecutionContext;

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

function fetchWorker(path: string, env = envWithEnter()): Promise<Response> {
    return Promise.resolve(
        worker.fetch(
            new Request(`https://staging.gen.pollinations.ai${path}`),
            env,
            executionContext,
        ),
    );
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

    it("routes public generation paths through the generation app", async () => {
        const response = await fetchWorker("/models", envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as unknown[];
        expect(models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: expect.any(String) }),
            ]),
        );
    });
});
