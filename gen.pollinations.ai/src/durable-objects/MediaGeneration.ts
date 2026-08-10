import { DurableObject } from "cloudflare:workers";
import { UpstreamError } from "@shared/error.ts";
import { R2_LIFECYCLE_TTL_MS } from "@shared/r2-storage.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { generateDurableMediaResponse } from "@/image/handler.ts";
import type { ImageParams } from "@/image/params.ts";
import { putMediaResponse } from "@/utils/media-cache.ts";

const STATE_KEY = "generation";

export type MediaGenerationJob = {
    cacheKey: string;
    prompt: string;
    params: ImageParams;
    requestId: string;
    responseHeaders: Record<string, string>;
};

type GenerationError = {
    status: ContentfulStatusCode;
    message: string;
    errorCode?: string;
};

export type MediaGenerationStatus =
    | { state: "queued" }
    | { state: "running" }
    | { state: "cached" }
    | { state: "failed"; error: GenerationError };

type StoredGeneration = MediaGenerationStatus & {
    job?: MediaGenerationJob;
    expiresAt?: number;
};

function expirationTime(): number {
    // Successful state is redundant once R2 expires; failed state is a
    // same-length tombstone that prevents an ambiguous resubmission.
    return Date.now() + R2_LIFECYCLE_TTL_MS;
}

function publicStatus(generation: StoredGeneration): MediaGenerationStatus {
    return generation.state === "failed"
        ? { state: "failed", error: generation.error }
        : { state: generation.state };
}

function generationError(error: unknown): GenerationError {
    if (error instanceof UpstreamError) {
        return {
            status: error.status,
            message: error.message,
            ...(error.errorCode && { errorCode: error.errorCode }),
        };
    }
    return {
        status: 500,
        message: error instanceof Error ? error.message : String(error),
    };
}

export class MediaGeneration extends DurableObject<CloudflareBindings> {
    async ensure(job: MediaGenerationJob): Promise<{
        leader: boolean;
        status: MediaGenerationStatus;
    }> {
        if (await this.env.IMAGE_BUCKET.head(job.cacheKey)) {
            const status = { state: "cached" } as const;
            const expiresAt = expirationTime();
            await this.ctx.storage.put(STATE_KEY, { ...status, expiresAt });
            await this.ctx.storage.setAlarm(expiresAt);
            return { leader: false, status };
        }

        const current = await this.ctx.storage.get<StoredGeneration>(STATE_KEY);
        if (!current || current.state === "cached") {
            const queued: StoredGeneration = { state: "queued", job };
            await this.ctx.storage.put(STATE_KEY, queued);
            await this.ctx.storage.setAlarm(Date.now());
            return { leader: true, status: { state: "queued" } };
        }

        return { leader: false, status: publicStatus(current) };
    }

    async getStatus(): Promise<MediaGenerationStatus | undefined> {
        const current = await this.ctx.storage.get<StoredGeneration>(STATE_KEY);
        return current ? publicStatus(current) : undefined;
    }

    async alarm(): Promise<void> {
        const current = await this.ctx.storage.get<StoredGeneration>(STATE_KEY);
        if (!current) return;

        if (current.state === "cached" || current.state === "failed") {
            if (!current.expiresAt || current.expiresAt <= Date.now()) {
                await this.ctx.storage.deleteAll();
            } else {
                await this.ctx.storage.setAlarm(current.expiresAt);
            }
            return;
        }

        if (current.state === "running") {
            const expiresAt = expirationTime();
            await this.ctx.storage.put(STATE_KEY, {
                state: "failed",
                expiresAt,
                error: {
                    status: 500,
                    message: "Generation was interrupted before completion",
                },
            } satisfies StoredGeneration);
            await this.ctx.storage.setAlarm(expiresAt);
            return;
        }
        if (current.state !== "queued" || !current.job) return;

        await this.ctx.storage.put(STATE_KEY, {
            state: "running",
            job: current.job,
        } satisfies StoredGeneration);

        try {
            const response = await generateDurableMediaResponse(
                this.env,
                current.job,
            );
            const stored = await putMediaResponse(
                this.env.IMAGE_BUCKET,
                current.job.cacheKey,
                "video/mp4",
                response,
            );
            if (!stored) throw new Error("Generated media response was empty");
            const expiresAt = expirationTime();
            await this.ctx.storage.put(STATE_KEY, {
                state: "cached",
                expiresAt,
            } satisfies StoredGeneration);
            await this.ctx.storage.setAlarm(expiresAt);
        } catch (error) {
            const expiresAt = expirationTime();
            await this.ctx.storage.put(STATE_KEY, {
                state: "failed",
                expiresAt,
                error: generationError(error),
            } satisfies StoredGeneration);
            await this.ctx.storage.setAlarm(expiresAt);
        }
    }
}
