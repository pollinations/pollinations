import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { validator } from "@/middleware/validator.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

type CachedObject = {
    body: Uint8Array;
    customMetadata?: Record<string, string>;
    uploaded: Date;
};

function createTextBucket(): R2Bucket {
    const objects = new Map<string, CachedObject>();

    return {
        get: async (key: string) => {
            const object = objects.get(key);
            if (!object) return null;
            return {
                ...object,
                body: object.body.slice(),
            };
        },
        put: async (key: string, value: BodyInit, options?: R2PutOptions) => {
            const body = new Uint8Array(
                await new Response(value).arrayBuffer(),
            );
            objects.set(key, {
                body,
                customMetadata: options?.customMetadata,
                uploaded: new Date(),
            });
            return null;
        },
    } as unknown as R2Bucket;
}

type TestEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

describe("text cache", () => {
    it("caches chat completions after JSON validation consumed the body", async () => {
        let originHits = 0;
        const app = new Hono<TestEnv>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "test-request");
                await next();
            })
            .post(
                "/v1/chat/completions",
                validator("json", CreateChatCompletionRequestSchema),
                textCache,
                async () => {
                    originHits += 1;
                    return new Response(JSON.stringify({ originHits }), {
                        headers: { "Content-Type": "application/json" },
                    });
                },
            );

        const env = {
            TEXT_BUCKET: createTextBucket(),
        } as CloudflareBindings;
        const body = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "cache me" }],
        });

        const firstCtx = createExecutionContext();
        const first = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            }),
            env,
            firstCtx,
        );
        expect(await first.json()).toEqual({ originHits: 1 });
        await waitOnExecutionContext(firstCtx);

        const secondCtx = createExecutionContext();
        const second = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            }),
            env,
            secondCtx,
        );
        await waitOnExecutionContext(secondCtx);

        expect(second.headers.get("X-Cache")).toBe("HIT");
        expect(await second.json()).toEqual({ originHits: 1 });
        expect(originHits).toBe(1);
    });
});
