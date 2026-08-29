import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { ValidationError } from "@shared/http/validation-error.ts";
import { validator } from "@shared/middleware/validator.ts";
import { CreateImageRequestSchema } from "@shared/schemas/openai.ts";
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
    it("rejects native-only references before they can reach the POST cache", async () => {
        let originHits = 0;
        const app = new Hono<Env>();
        app.onError((error) => {
            if (error instanceof ValidationError) {
                return new Response(error.message, { status: 400 });
            }
            return new Response("unexpected error", { status: 500 });
        });
        app.post(
            "/v1/images/generations",
            validator("json", CreateImageRequestSchema),
            prepareOpenAIImageGeneration,
            imageCache,
            () => {
                originHits += 1;
                return new Response("origin");
            },
        );

        for (const field of [
            "reference_images",
            "reference_videos",
            "reference_audios",
        ] as const) {
            const response = await app.fetch(
                new Request(
                    "https://gen.pollinations.ai/v1/images/generations",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            prompt: "a paper boat",
                            model: "seedance-2.0",
                            [field]: [`https://media.example/${field}-one.bin`],
                        }),
                    },
                ),
                {} as CloudflareBindings,
            );

            expect(response.status, field).toBe(400);
        }

        expect(originHits).toBe(0);
    });

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
        expect(result.data[0]?.url).toBe(cacheUrl.toString());
        expect(result.usage.total_tokens).toBe(0);
    });
});
