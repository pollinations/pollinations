import {
    env,
    runDurableObjectAlarm,
    runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
    MediaGeneration,
    MediaGenerationJob,
} from "@/durable-objects/MediaGeneration.ts";
import { ImageParamsSchema } from "@/image/params.ts";

function createJob(cacheKey: string): MediaGenerationJob {
    return {
        cacheKey,
        prompt: "a bee flying over flowers",
        params: ImageParamsSchema.parse({ model: "wan-fast" }),
        requestId: "test-request",
        responseHeaders: {},
    };
}

describe("MediaGeneration", () => {
    it("elects one leader and makes identical requests join it", async () => {
        const job = createJob("single-flight");
        const stub = env.MEDIA_GENERATION.getByName(job.cacheKey);

        await expect(stub.ensure(job)).resolves.toEqual({
            leader: true,
            status: { state: "queued" },
        });
        await expect(stub.ensure(job)).resolves.toEqual({
            leader: false,
            status: { state: "queued" },
        });

        await runInDurableObject(
            stub,
            async (_instance: MediaGeneration, state) => {
                expect(await state.storage.getAlarm()).not.toBeNull();
                await state.storage.deleteAlarm();
            },
        );
    });

    it("rechecks R2 before claiming a generation", async () => {
        const job = createJob("already-cached");
        await env.IMAGE_BUCKET.put(job.cacheKey, "video");
        const stub = env.MEDIA_GENERATION.getByName(job.cacheKey);

        await expect(stub.ensure(job)).resolves.toEqual({
            leader: false,
            status: { state: "cached" },
        });
        await runInDurableObject(
            stub,
            async (_instance: MediaGeneration, state) => {
                expect(await state.storage.getAlarm()).not.toBeNull();
                await state.storage.deleteAlarm();
            },
        );
    });

    it("fails closed instead of resubmitting an interrupted job", async () => {
        const job = createJob("interrupted");
        const stub = env.MEDIA_GENERATION.getByName(job.cacheKey);
        await stub.ensure(job);
        await runInDurableObject(
            stub,
            async (_instance: MediaGeneration, state) => {
                await state.storage.put("generation", {
                    state: "running",
                    job,
                });
            },
        );

        await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
        await expect(stub.getStatus()).resolves.toEqual({
            state: "failed",
            error: {
                status: 500,
                message: "Generation was interrupted before completion",
            },
        });
        expect(await env.IMAGE_BUCKET.head(job.cacheKey)).toBeNull();
    });
});
