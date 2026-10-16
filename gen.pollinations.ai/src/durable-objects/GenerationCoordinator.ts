import { DurableObject } from "cloudflare:workers";
import type {
    AsyncJobRecord,
    GenerationCacheIdentity,
    GenerationJob,
    GenerationJobHead,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import {
    executeGeneration,
    GENERATION_HANDOFF_HEADER,
    GENERATION_HANDOFF_PATH,
    readHandoffResponse,
} from "@/utils/execute-generation.ts";

const JOB_KEY = "job";
const ASYNC_KEY = "async";
const ASYNC_TTL_MS = 24 * 60 * 60 * 1_000;
const BODY_KEY_PREFIX = "body:";
const BODY_CHUNK_BYTES = 1_000_000;

type PersistedJob = GenerationJobHead & {
    bodyChunks: number;
    started: boolean;
};

/** Splits a streamed request body into storage-sized values. */
async function readBodyChunks(
    body: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> {
    const chunks: Uint8Array[] = [];
    let chunk = new Uint8Array(BODY_CHUNK_BYTES);
    let filled = 0;
    const reader = body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.byteLength; ) {
            const size = Math.min(
                value.byteLength - offset,
                BODY_CHUNK_BYTES - filled,
            );
            chunk.set(value.subarray(offset, offset + size), filled);
            filled += size;
            offset += size;
            if (filled === BODY_CHUNK_BYTES) {
                chunks.push(chunk);
                chunk = new Uint8Array(BODY_CHUNK_BYTES);
                filled = 0;
            }
        }
    }
    // Copy the tail so storage does not serialize the unused buffer.
    if (filled > 0) chunks.push(chunk.slice(0, filled));
    return chunks;
}

function bodyChunkKeys(count: number): string[] {
    return Array.from(
        { length: count },
        (_, index) => `${BODY_KEY_PREFIX}${index}`,
    );
}

async function cacheExists(
    env: CloudflareBindings,
    cache: GenerationCacheIdentity,
): Promise<boolean> {
    return cache.storage === "media"
        ? env.MEDIA.has(cache.key)
        : (await env.TEXT_BUCKET.head(cache.key)) !== null;
}

function unavailable(message: string): GenerationOutcome {
    return {
        status: "failed",
        error: {
            httpStatus: 503,
            headers: [["content-type", "text/plain; charset=UTF-8"]],
            body: new TextEncoder().encode(message),
        },
    };
}

export class GenerationCoordinator extends DurableObject<CloudflareBindings> {
    private readonly waiters = new Set<(outcome: GenerationOutcome) => void>();
    private handoff?: { nonce: string; job: GenerationJobHead };

    /**
     * The body arrives as a stream: RPC streams it with flow control, while
     * serialized arguments are capped at 32 MiB.
     */
    async startAndWait(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
    ): Promise<GenerationOutcome> {
        let immediate: GenerationOutcome | undefined;
        let wait: Promise<GenerationOutcome> | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const cachePresent = await cacheExists(this.env, job.cache);
            const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);

            if (cachePresent) {
                await body?.cancel();
                if (stored) {
                    await this.clear(stored.bodyChunks, true);
                    // The alarm cancelled above may have died after writing
                    // the cache, so settle its pending async record here.
                    await this.settleCacheHitRecord();
                }
                immediate = { status: "cached" };
                return;
            }

            if (stored) {
                // Joiners share the owner's persisted body.
                await body?.cancel();
            } else {
                await this.persist(job, body);
            }

            wait = new Promise<GenerationOutcome>((resolve) => {
                this.waiters.add(resolve);
            });
        });

        if (immediate) return immediate;
        if (!wait) throw new Error("Generation waiter was not registered");
        return wait;
    }

    /** Submit without waiting. The existing alarm owns execution and billing. */
    async submit(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
    ): Promise<AsyncJobRecord["status"]> {
        let status: AsyncJobRecord["status"] = "pending";
        await this.ctx.blockConcurrencyWhile(async () => {
            const cachePresent = await cacheExists(this.env, job.cache);
            const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            const previous = await this.readRecord();
            const sameRun = stored && previous?.status === "pending";
            // Every account that submitted this identical request keeps
            // reading the shared record, including when a new run replaces
            // a terminal one.
            const ownerIds = [
                ...new Set([...(previous?.ownerIds ?? []), job.auth.user.id]),
            ];
            status = cachePresent ? "succeeded" : "pending";
            if (cachePresent) {
                await body?.cancel();
                if (stored) await this.clear(stored.bodyChunks, true);
            } else if (stored) {
                await body?.cancel();
            } else {
                await this.persist(job, body);
            }
            await this.ctx.storage.put<AsyncJobRecord>(ASYNC_KEY, {
                ownerIds,
                cache: job.cache,
                status,
                createdAt: sameRun ? previous.createdAt : Date.now(),
                ...(cachePresent && { completedAt: Date.now() }),
            });
            if (cachePresent) {
                await this.ctx.storage.setAlarm(Date.now() + ASYNC_TTL_MS);
            }
        });
        return status;
    }

    /** Other accounts see a 404, even if they can guess the request hash. */
    async status(userId: string): Promise<AsyncJobRecord | null> {
        const record = await this.readRecord();
        return record?.ownerIds.includes(userId) ? record : null;
    }

    private async readRecord(): Promise<AsyncJobRecord | null> {
        const record = await this.ctx.storage.get<AsyncJobRecord>(ASYNC_KEY);
        if (!record) return null;
        if (
            Date.now() - (record.completedAt ?? record.createdAt) >=
            ASYNC_TTL_MS
        ) {
            await this.ctx.storage.delete(ASYNC_KEY);
            return null;
        }
        return record;
    }

    /** The public execution route claims the job this alarm handed off. */
    async takeHandoff(nonce: string): Promise<GenerationJobHead | null> {
        if (!this.handoff || this.handoff.nonce !== nonce) return null;
        const { job } = this.handoff;
        this.handoff = undefined;
        return job;
    }

    async alarm(): Promise<void> {
        let stored: PersistedJob | undefined;
        let interrupted: PersistedJob | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const job = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            if (!job) {
                await this.readRecord();
                return;
            }

            // The alarm provides an independent timeout, not retry semantics.
            // Claim before the provider call so a restarted alarm fails closed.
            if (job.started) {
                interrupted = job;
                return;
            }

            stored = { ...job, started: true };
            await this.ctx.storage.put(JOB_KEY, stored);
        });

        if (interrupted) {
            await this.finish(
                unavailable("Detached generation was interrupted"),
                interrupted.bodyChunks,
            );
            return;
        }
        if (!stored) return;

        let settlement: Promise<void> | undefined;
        try {
            if (await cacheExists(this.env, stored.cache)) {
                await this.finish({ status: "cached" }, stored.bodyChunks);
                return;
            }

            const job = await this.restore(stored);
            const origin = this.env.GENERATION_EXECUTION_ORIGIN;
            if (origin) {
                await this.finish(
                    await this.executeAtOrigin(origin, job),
                    stored.bodyChunks,
                );
                return;
            }
            const execution = await executeGeneration(job, this.env);
            settlement = execution.settlement;
            await this.finish(execution.result, stored.bodyChunks);
        } catch (error) {
            console.error("Detached generation failed", error);
            await this.finish(
                unavailable("Detached generation failed"),
                stored.bodyChunks,
            );
        } finally {
            if (settlement) await settlement;
        }
    }

    /**
     * Fetches made by a Durable Object get Cloudflare's default 125 s proxy
     * read timeout, whatever the zone sets. Running the job behind the public
     * origin gives provider fetches the zone's timeout instead; the
     * global_fetch_strictly_public flag is what sends this fetch through the
     * zone. The nonce proves the request came from this alarm; the job itself
     * never leaves the Durable Object except through takeHandoff.
     */
    private async executeAtOrigin(
        origin: string,
        job: GenerationJob,
    ): Promise<GenerationOutcome> {
        const { body, ...request } = job.request;
        const nonce = crypto.randomUUID();
        this.handoff = { nonce, job: { ...job, request } };
        try {
            return await readHandoffResponse(
                await fetch(
                    `${origin}${GENERATION_HANDOFF_PATH}/${this.ctx.id}`,
                    {
                        method: "POST",
                        headers: { [GENERATION_HANDOFF_HEADER]: nonce },
                        body: body as Uint8Array<ArrayBuffer> | undefined,
                    },
                ),
            );
        } finally {
            this.handoff = undefined;
        }
    }

    private async persist(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
    ): Promise<void> {
        const chunks = body ? await readBodyChunks(body) : [];
        const stored: PersistedJob = {
            cache: job.cache,
            auth: job.auth,
            requestId: job.requestId,
            balanceCheckResult: job.balanceCheckResult,
            apiKeyBudgetEstimate: job.apiKeyBudgetEstimate,
            request: job.request,
            bodyChunks: chunks.length,
            started: false,
        };
        const entries: Record<string, unknown> = { [JOB_KEY]: stored };
        for (const [index, chunk] of chunks.entries()) {
            entries[`${BODY_KEY_PREFIX}${index}`] = chunk;
        }
        await this.ctx.storage.put(entries);
        await this.ctx.storage.setAlarm(Date.now());
    }

    private async restore(job: PersistedJob): Promise<GenerationJob> {
        let body: Uint8Array | undefined;
        if (job.bodyChunks > 0) {
            const keys = bodyChunkKeys(job.bodyChunks);
            const storedChunks = await this.ctx.storage.get<Uint8Array>(keys);
            const chunks = keys.map((key) => storedChunks.get(key));
            if (chunks.some((chunk) => chunk === undefined)) {
                throw new Error("Persisted generation request is incomplete");
            }
            const size = chunks.reduce(
                (total, chunk) => total + (chunk?.byteLength ?? 0),
                0,
            );
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                if (!chunk) {
                    throw new Error(
                        "Persisted generation request is incomplete",
                    );
                }
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
            body = bytes;
        }
        return {
            cache: job.cache,
            auth: job.auth,
            requestId: job.requestId,
            balanceCheckResult: job.balanceCheckResult,
            apiKeyBudgetEstimate: job.apiKeyBudgetEstimate,
            request: { ...job.request, ...(body !== undefined && { body }) },
        };
    }

    private async finish(
        outcome: GenerationOutcome,
        bodyChunks: number,
    ): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            await this.clear(bodyChunks);
            const record = await this.readRecord();
            if (record?.status === "pending") {
                await this.ctx.storage.put<AsyncJobRecord>(ASYNC_KEY, {
                    ...record,
                    status:
                        outcome.status === "failed" ? "failed" : "succeeded",
                    completedAt: Date.now(),
                    ...(outcome.status === "failed" && {
                        error: {
                            httpStatus: outcome.error.httpStatus,
                            message: new TextDecoder()
                                .decode(outcome.error.body)
                                .slice(0, 500),
                        },
                    }),
                });
                await this.ctx.storage.setAlarm(Date.now() + ASYNC_TTL_MS);
            }
            for (const resolve of this.waiters) resolve(outcome);
            this.waiters.clear();
        });
    }

    /** A cache-hit join settles the pending record when the alarm cannot. */
    private async settleCacheHitRecord(): Promise<void> {
        const record = await this.readRecord();
        if (record?.status !== "pending") return;
        await this.ctx.storage.put<AsyncJobRecord>(ASYNC_KEY, {
            ...record,
            status: "succeeded",
            completedAt: Date.now(),
        });
        await this.ctx.storage.setAlarm(Date.now() + ASYNC_TTL_MS);
    }

    private async clear(
        bodyChunks: number,
        cancelAlarm = false,
    ): Promise<void> {
        if (cancelAlarm) await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.delete([JOB_KEY, ...bodyChunkKeys(bodyChunks)]);
    }
}
