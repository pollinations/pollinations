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

/** Settled async jobs keep a small record for late collection, then expire. */
const FINAL_KEY = "final";
const FINAL_TTL_MS = 24 * 60 * 60 * 1000;

type PersistedJob = GenerationJobHead & {
    bodyChunks: number;
    started: boolean;
    /** Accounts that submitted this job through the async API. */
    owners?: string[];
};

type FinalJobRecord = {
    status: "succeeded" | "failed";
    owners: string[];
    cache: GenerationCacheIdentity;
    error?: GenerationErrorSnapshot;
    finishedAt: number;
};

export type GenerationJobStatus =
    | { status: "processing" }
    | { status: "succeeded"; cache: GenerationCacheIdentity }
    | { status: "failed"; error?: GenerationErrorSnapshot };

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
     * Registers (or joins) a job and returns immediately, without waiting for
     * the outcome. The generation still runs detached under the alarm; the
     * caller collects it later through the job endpoints.
     */
    async submit(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
    ): Promise<"queued" | "succeeded"> {
        const caller = job.auth.user.id;
        let result: "queued" | "succeeded" = "queued";

        await this.ctx.blockConcurrencyWhile(async () => {
            const cachePresent = await cacheExists(this.env, job.cache);
            const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            const final = await this.ctx.storage.get<FinalJobRecord>(FINAL_KEY);

            if (cachePresent) {
                await body?.cancel();
                if (stored) await this.clear(stored.bodyChunks, true);
                // The caller is joining a settled job (or the cache entry of a
                // completed one); let them collect it.
                const owners = [...new Set([...(final?.owners ?? []), caller])];
                const record: FinalJobRecord = {
                    status: "succeeded",
                    owners,
                    cache: job.cache,
                    finishedAt: final?.finishedAt ?? Date.now(),
                };
                await this.ctx.storage.put(FINAL_KEY, record);
                await this.ctx.storage.setAlarm(Date.now() + FINAL_TTL_MS);
                result = "succeeded";
                return;
            }

            if (stored) {
                // Join the run in flight; the outcome is collected by polling.
                await body?.cancel();
                stored.owners = [
                    ...new Set([...(stored.owners ?? []), caller]),
                ];
                await this.ctx.storage.put(JOB_KEY, stored);
                result = "queued";
                return;
            }

            // A settled record without a cache entry (expired result or a
            // failed run) is stale: start over rather than replay it.
            await this.persist(job, body, [caller]);
            result = "queued";
        });

        return result;
    }

    /**
     * Returns the job's state as seen by one account: `processing` while the
     * job is stored, the settled record after it finished, or null when the
     * account never submitted this job (or its record expired).
     */
    async jobStatus(caller: string): Promise<GenerationJobStatus | null> {
        const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
        if (stored?.owners?.includes(caller)) {
            return { status: "processing" };
        }
        const final = await this.ctx.storage.get<FinalJobRecord>(FINAL_KEY);
        if (final?.owners.includes(caller)) {
            return final.status === "failed"
                ? {
                      status: "failed",
                      ...(final.error && { error: final.error }),
                  }
                : { status: "succeeded", cache: final.cache };
        }
        return null;
    }

    async alarm(): Promise<void> {
        let stored: PersistedJob | undefined;
        let interrupted: PersistedJob | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const job = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            if (!job) {
                // An alarm without a pending job is the expiry of a settled
                // async job's collection record.
                await this.ctx.storage.delete(FINAL_KEY);
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
                interrupted,
            );
            return;
        }
        if (!stored) return;

        let settlement: Promise<void> | undefined;
        try {
            if (await cacheExists(this.env, stored.cache)) {
                await this.finish({ status: "cached" }, stored);
                return;
            }

            const job = await this.restore(stored);
            const execution = await executeGeneration(job, this.env);
            settlement = execution.settlement;
            await this.finish(execution.result, stored);
        } catch (error) {
            console.error("Detached generation failed", error);
            await this.finish(
                unavailable("Detached generation failed"),
                stored,
            );
        } finally {
            if (settlement) await settlement;
        }
    }

    private async persist(
        job: GenerationJobHead,
        body?: ReadableStream<Uint8Array>,
        owners?: string[],
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
            ...(owners && { owners }),
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
        job: PersistedJob,
    ): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            if (job.owners?.length) {
                // Async submitters collect the job after it settles; keep a
                // compact record for them, expiring via the alarm.
                const record: FinalJobRecord =
                    outcome.status === "failed"
                        ? {
                              status: "failed",
                              owners: job.owners,
                              cache: job.cache,
                              error: outcome.error,
                              finishedAt: Date.now(),
                          }
                        : {
                              status: "succeeded",
                              owners: job.owners,
                              cache: job.cache,
                              finishedAt: Date.now(),
                          };
                await this.ctx.storage.put(FINAL_KEY, record);
                await this.ctx.storage.setAlarm(Date.now() + FINAL_TTL_MS);
            }
            await this.clear(job.bodyChunks);
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
