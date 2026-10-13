import { DurableObject } from "cloudflare:workers";
import type {
    GenerationCacheIdentity,
    GenerationErrorSnapshot,
    GenerationJob,
    GenerationJobHead,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";

const JOB_KEY = "job";
const BODY_KEY_PREFIX = "body:";
const BODY_CHUNK_BYTES = 1_000_000;
const SUBMISSION_KEY = "submission";
const SUBMISSION_TTL_MS = 24 * 60 * 60 * 1000;

type PersistedJob = GenerationJobHead & {
    bodyChunks: number;
    started: boolean;
};

/** Written only for jobs submitted through the asynchronous API. */
type Submission = {
    cache: GenerationCacheIdentity;
    owners: string[];
    error?: GenerationErrorSnapshot;
};

export type JobStatus =
    | { state: "pending" }
    | { state: "succeeded"; cache: GenerationCacheIdentity }
    | { state: "failed"; error: GenerationErrorSnapshot };

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
        const { immediate, wait } = await this.register(job, body);
        return immediate ?? wait;
    }

    /**
     * Starts the job for `owner` and returns without waiting for it. The
     * result stays readable through {@link status} until the submission TTL.
     */
    async submit(
        job: GenerationJobHead,
        body: ReadableStream<Uint8Array> | undefined,
        owner: string,
    ): Promise<JobStatus> {
        const { immediate } = await this.register(job, body, async () => {
            const stored =
                await this.ctx.storage.get<Submission>(SUBMISSION_KEY);
            const owners = new Set(stored?.owners).add(owner);
            await this.ctx.storage.put(SUBMISSION_KEY, {
                cache: job.cache,
                owners: [...owners],
            } satisfies Submission);
            // A cached result clears the job alarm; still expire the record.
            if (!(await this.ctx.storage.get(JOB_KEY))) {
                await this.ctx.storage.setAlarm(Date.now() + SUBMISSION_TTL_MS);
            }
        });
        if (immediate) return { state: "succeeded", cache: job.cache };
        return { state: "pending" };
    }

    /** Null unless `owner` submitted this job and its record is still kept. */
    async status(owner: string): Promise<JobStatus | null> {
        const submission =
            await this.ctx.storage.get<Submission>(SUBMISSION_KEY);
        if (!submission?.owners.includes(owner)) return null;
        if (await this.ctx.storage.get(JOB_KEY)) return { state: "pending" };
        if (submission.error)
            return { state: "failed", error: submission.error };
        if (!(await cacheExists(this.env, submission.cache))) return null;
        return { state: "succeeded", cache: submission.cache };
    }

    private async register(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
        record?: () => Promise<void>,
    ): Promise<{
        immediate?: GenerationOutcome;
        wait: Promise<GenerationOutcome>;
    }> {
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
                await record?.();
                return;
            }

            if (stored) {
                // Joiners share the owner's persisted body.
                await body?.cancel();
            } else {
                await this.persist(job, body);
            }
            await record?.();

            wait = new Promise<GenerationOutcome>((resolve) => {
                this.waiters.add(resolve);
            });
        });

        if (!immediate && !wait) {
            throw new Error("Generation waiter was not registered");
        }
        return { immediate, wait: wait as Promise<GenerationOutcome> };
    }

    async alarm(): Promise<void> {
        let stored: PersistedJob | undefined;
        let interrupted: PersistedJob | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const job = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            if (!job) {
                // Submission-only expiry: the job finished and its record is
                // only kept for async callers to poll until the TTL.
                await this.ctx.storage.delete(SUBMISSION_KEY);
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
            const submission =
                await this.ctx.storage.get<Submission>(SUBMISSION_KEY);
            if (submission) {
                if (outcome.status === "failed") {
                    submission.error = outcome.error;
                    await this.ctx.storage.put(SUBMISSION_KEY, submission);
                }
                // Keep the record pollable, then expire it on its own alarm.
                await this.ctx.storage.setAlarm(Date.now() + SUBMISSION_TTL_MS);
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
