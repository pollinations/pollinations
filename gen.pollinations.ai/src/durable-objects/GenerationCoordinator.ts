import { DurableObject } from "cloudflare:workers";
import type {
    AsyncJobRecord,
    AsyncJobStatus,
    GenerationCacheIdentity,
    GenerationJob,
    GenerationJobHead,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";

const JOB_KEY = "job";
const ASYNC_KEY = "async";
const BODY_KEY_PREFIX = "body:";
const BODY_CHUNK_BYTES = 1_000_000;
// Job state stays readable for a day after submission (or completion), then
// disappears; the generated file itself lives on the media cache TTL.
const ASYNC_RECORD_TTL_MS = 24 * 60 * 60 * 1_000;

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

    /**
     * Registers a job the caller will not wait for. The alarm started by
     * `persist` executes it exactly like a disconnected synchronous request, so
     * a submit that joins an in-flight job shares its single execution and
     * charge.
     */
    async submit(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
    ): Promise<AsyncJobStatus> {
        let status: AsyncJobStatus = "pending";
        await this.ctx.blockConcurrencyWhile(async () => {
            const cachePresent = await cacheExists(this.env, job.cache);
            const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            const record = await this.readRecord();

            if (cachePresent) {
                // The generation already finished (a resend of a job whose
                // result is cached); nothing is left to run or charge.
                await body?.cancel();
                if (stored) await this.clear(stored.bodyChunks, true);
                await this.putRecord({
                    userId: job.auth.user.id,
                    cache: job.cache,
                    status: "succeeded",
                    createdAt: record?.createdAt ?? Date.now(),
                    completedAt: Date.now(),
                });
                status = "succeeded";
                return;
            }

            const joined = stored !== undefined;
            await this.putRecord({
                userId: job.auth.user.id,
                cache: job.cache,
                status: "pending",
                createdAt:
                    joined && record?.userId === job.auth.user.id
                        ? record.createdAt
                        : Date.now(),
            });
            if (joined) {
                // Joiners share the owner's persisted body.
                await body?.cancel();
            } else {
                await this.persist(job, body);
            }
        });
        return status;
    }

    /** Job state for its submitting account; other accounts see no job. */
    async status(userId: string): Promise<AsyncJobRecord | null> {
        const record = await this.readRecord();
        if (!record || record.userId !== userId) return null;
        return record;
    }

    /** Reads the job record, dropping it once it is older than the TTL. */
    private async readRecord(): Promise<AsyncJobRecord | null> {
        const record = await this.ctx.storage.get<AsyncJobRecord>(ASYNC_KEY);
        if (!record) return null;
        const anchor = record.completedAt ?? record.createdAt;
        if (Date.now() - anchor > ASYNC_RECORD_TTL_MS) {
            await this.ctx.storage.delete(ASYNC_KEY);
            return null;
        }
        return record;
    }

    private async putRecord(record: AsyncJobRecord): Promise<void> {
        await this.ctx.storage.put(ASYNC_KEY, record);
    }

    async alarm(): Promise<void> {
        let stored: PersistedJob | undefined;
        let interrupted: PersistedJob | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const job = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            if (!job) return;

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
                await this.putRecord({
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
            }
            for (const resolve of this.waiters) resolve(outcome);
            this.waiters.clear();
        });
    }

    private async clear(
        bodyChunks: number,
        cancelAlarm = false,
    ): Promise<void> {
        if (cancelAlarm) await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.delete([JOB_KEY, ...bodyChunkKeys(bodyChunks)]);
    }
}
