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
import {
    hashGenerationCacheIdentity,
    normalizedJsonBody,
    prepareGenerationRequest,
} from "@/middleware/generation-cache.ts";
import { imageCache } from "@/middleware/media-cache.ts";
import { generateCacheKey } from "@/utils/media-cache.ts";
import { MediaUpload } from "../../media.pollinations.ai/src/media-upload.ts";
import {
    formatOpenAIImageResponse,
    prepareOpenAIImageEdit,
    prepareOpenAIImageEditReplay,
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
    it.each([
        "json",
        "multipart",
    ])("rejects an invalid %s edit response format", async (encoding) => {
        const app = new Hono<Env>().post(
            "/v1/images/edits",
            prepareOpenAIImageEdit,
            () => new Response("unexpected"),
        );
        const input = {
            prompt: "edit",
            image: "https://example.com/image.png",
            response_format: "invalid",
        };
        const form = new FormData();
        for (const [name, value] of Object.entries(input))
            form.set(name, value);
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                ...(encoding === "json"
                    ? {
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(input),
                      }
                    : { body: form }),
            }),
            {} as CloudflareBindings,
        );
        expect(response.status).toBe(400);
    });
    it.each([
        "json",
        "multipart",
    ])("keeps %s edit identity stable across response formats and executor replay", async (encoding) => {
        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("model", {
                    requested: "flux",
                    resolved: "flux",
                    definition: {} as Env["Variables"]["model"]["definition"],
                });
                await next();
            })
            .post(
                "/v1/images/edits",
                prepareOpenAIImageEdit,
                prepareGenerationRequest,
                (c) =>
                    c.json({
                        body: c.var.generationRequestBody,
                        identity: c.var.generationCacheBody,
                        contentType: c.var.generationRequestContentType,
                        input: c.req.valid("json" as never),
                    }),
            )
            .post(
                "/generation-executor/v1/images/edits",
                prepareOpenAIImageEditReplay,
                prepareGenerationRequest,
                (c) => c.json({ identity: c.var.generationCacheBody }),
            );
        const results = [];
        for (const response_format of ["b64_json", "url"]) {
            const form = new FormData();
            form.set("prompt", "make it blue");
            form.set("response_format", response_format);
            form.append(
                "image",
                new Blob(["first"], { type: "image/png" }),
                "one.png",
            );
            form.append(
                "image[]",
                new Blob(["second"], { type: "image/png" }),
                "two.png",
            );
            const request = new Request(
                "https://gen.pollinations.ai/v1/images/edits",
                {
                    method: "POST",
                    ...(encoding === "json"
                        ? {
                              headers: {
                                  "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                  prompt: "make it blue",
                                  image: [
                                      {
                                          image_url:
                                              "https://example.com/one.png",
                                      },
                                      {
                                          image_url:
                                              "https://example.com/two.png",
                                      },
                                  ],
                                  response_format,
                              }),
                          }
                        : { body: form }),
                },
            );
            const response = await app.fetch(request, {} as CloudflareBindings);
            expect(response.status).toBe(200);
            const result = await response.json<{
                body: string;
                identity: string;
                contentType: string;
                input: { image: string[]; response_format: string };
            }>();
            expect(result.input.response_format).toBe(response_format);
            expect(result.input.image).toHaveLength(2);
            expect(JSON.parse(result.body)).not.toHaveProperty("seed");
            expect(JSON.parse(result.body)).not.toHaveProperty(
                "response_format",
            );
            if (encoding === "multipart") {
                expect(result.input.image).toEqual([
                    `data:image/png;base64,${btoa("first")}`,
                    `data:image/png;base64,${btoa("second")}`,
                ]);
            }
            const replay = await app.fetch(
                new Request(
                    "https://gen.pollinations.ai/generation-executor/v1/images/edits",
                    {
                        method: "POST",
                        headers: { "Content-Type": result.contentType },
                        body: result.body,
                    },
                ),
                {} as CloudflareBindings,
            );
            expect(replay.status).toBe(200);
            expect((await replay.json<{ identity: string }>()).identity).toBe(
                result.identity,
            );
            results.push(result);
        }
        expect(results[0].identity).toBe(results[1].identity);
        const changedInput = JSON.parse(results[0].body);
        changedInput.image[0].image_url = "https://example.com/different.png";
        const changed = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(changedInput),
            }),
            {} as CloudflareBindings,
        );
        expect((await changed.json<{ identity: string }>()).identity).not.toBe(
            results[0].identity,
        );
    });
    it("does not apply safety again when replaying an image edit", async () => {
        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("model", {
                    requested: "flux",
                    resolved: "flux",
                    definition: {} as Env["Variables"]["model"]["definition"],
                });
                await next();
            })
            .post("/v1/images/edits", prepareOpenAIImageEditReplay, (c) =>
                c.json(c.req.valid("json" as never)),
            );

        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "already checked",
                    image: [{ image_url: "https://example.com/image.png" }],
                    safe: "true",
                }),
            }),
            {} as CloudflareBindings,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            prompt: "already checked",
            image: ["https://example.com/image.png"],
            safe: "true",
        });
    });
    it("labels base64 video responses with their media type", async () => {
        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("model", {
                    requested: "owner/video",
                    resolved: "owner/video",
                    definition: {} as Env["Variables"]["model"]["definition"],
                });
                c.req.addValidatedData("json", await c.req.json());
                await next();
            })
            .post(
                "/v1/images/generations",
                formatOpenAIImageResponse,
                () =>
                    new Response(new Uint8Array([0, 1, 2, 3]), {
                        headers: { "Content-Type": "video/mp4" },
                    }),
            );

        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "a paper boat",
                    model: "owner/video",
                    response_format: "b64_json",
                }),
            }),
            {} as CloudflareBindings,
        );
        const result = await response.json<{
            data: Array<{ b64_json: string; media_type?: string }>;
        }>();

        expect(response.status).toBe(200);
        expect(result.data[0]?.media_type).toBe("video/mp4");
    });

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

    it.each([
        "url",
        "b64_json",
    ])("serves %s and a file link for objects cached before model metadata was stored", async (response_format) => {
        const bucket = createTestR2Bucket();
        // The request identifies itself: its own path plus a hash of the
        // parameters that shape the file. Response format is not one of them.
        const cacheUrl = new URL(
            "https://gen.pollinations.ai/v1/images/generations",
        );
        cacheUrl.searchParams.set(
            "__request_body",
            await hashGenerationCacheIdentity(
                "media",
                normalizedJsonBody(
                    JSON.stringify({
                        prompt: "a cat",
                        model: "flux",
                        width: 1024,
                        height: 1024,
                        quality: "medium",
                        seed: 7,
                    }),
                ),
            ),
        );
        await bucket.put(
            await generateCacheKey(cacheUrl),
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
                formatOpenAIImageResponse,
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
                    response_format,
                }),
            }),
            {
                MEDIA: new MediaUpload(ctx, {
                    MEDIA_BUCKET: bucket,
                    MAX_FILE_SIZE: "104857600",
                }),
            } as unknown as CloudflareBindings,
            ctx,
        );
        const result = await response.json<{
            data: Array<{
                url?: string;
                b64_json?: string;
                media_type?: string;
            }>;
            usage: { total_tokens: number };
        }>();
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("x-cache")).toBe("HIT");
        expect(response.headers.get("x-model-used")).toBe("flux");
        const url = `https://media.pollinations.ai/${await generateCacheKey(cacheUrl)}`;
        expect(response.headers.get("Link")).toBe(`<${url}>; rel="enclosure"`);
        expect(response.headers.has("X-Media-URL")).toBe(false);
        if (response_format === "url") {
            expect(result.data[0]?.url).toBe(url);
            expect(result.data[0]?.media_type).toBe("image/jpeg");
        } else {
            expect(result.data[0]?.b64_json).toBe(btoa("legacy-image"));
            expect(result.data[0]?.url).toBeUndefined();
        }
        expect(result.usage.total_tokens).toBe(0);
    });
});
