import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "@/env.ts";
import { imageCache } from "@/middleware/media-cache.ts";
import { generateCacheKey } from "@/utils/media-cache.ts";
import {
    formatOpenAIImageGeneration,
    prepareOpenAIImageGeneration,
} from "../src/routes/images.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

describe("OpenAI image cache", () => {
    it("serves objects cached before model metadata was stored", async () => {
        const bucket = createTestR2Bucket();
        const cacheUrl = new URL(
            "https://gen.pollinations.ai/image/a%20cat?model=flux&width=1024&height=1024&quality=medium&seed=7",
        );
        await bucket.put(
            generateCacheKey(cacheUrl),
            new TextEncoder().encode("legacy-image"),
            { httpMetadata: { contentType: "image/jpeg" } },
        );

        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "test-request");
                c.set("model", {
                    requested: "flux",
                    resolved: "flux",
                    definition: {} as Env["Variables"]["model"]["definition"],
                });
                c.req.addValidatedData("json", await c.req.json());
                await next();
            })
            .post(
                "/v1/images/generations",
                prepareOpenAIImageGeneration,
                formatOpenAIImageGeneration,
                imageCache,
                () => new Response("origin should not run", { status: 500 }),
            );
        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "a cat",
                    model: "flux",
                    size: "1024x1024",
                    quality: "standard",
                    seed: 7,
                    response_format: "url",
                }),
            }),
            { IMAGE_BUCKET: bucket } as unknown as CloudflareBindings,
            ctx,
        );
        const result = await response.json<{
            data: Array<{ url: string }>;
            usage: { total_tokens: number };
        }>();
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("x-cache")).toBe("HIT");
        expect(response.headers.get("x-model-used")).toBe("flux");
        expect(response.headers.get("content-location")).toMatch(
            /^https:\/\/gen\.pollinations\.ai\/media\/[A-Za-z0-9_-]+$/,
        );
        expect(result.data[0]?.url).toBe(
            "https://gen.pollinations.ai/image/a%20cat?model=flux&width=1024&height=1024&quality=medium&seed=7",
        );
        expect(result.usage.total_tokens).toBe(0);
    });
});
