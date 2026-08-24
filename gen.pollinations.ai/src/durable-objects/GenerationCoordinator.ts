import { DurableObject } from "cloudflare:workers";
import { BILLING_SERVICE } from "@/middleware/billing.ts";
import { generationCacheBucket } from "@/middleware/generation-cache.ts";
import type {
    GenerationCacheIdentity,
    GenerationJob,
    GenerationOutcome,
    GenerationRequestSnapshot,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";

const JOB_KEY = "job";
const BODY_KEY_PREFIX = "body:";
const BODY_CHUNK_BYTES = 1_000_000;

/** The job at rest: the Enter authorization id stands in for the credential. */
type PersistedJob = Omit<GenerationJob, "request" | "authorize"> & {
    request: Omit<GenerationRequestSnapshot, "body">;
    authorizationId: string;
    bodyChunks: number;
    started: boolean;
};

type RestoredJob = Omit<GenerationJob, "authorize">;

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
    const bucket = generationCacheBucket(env, cache.storage);
    return (await bucket.head(cache.key)) !== null;
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

    async startAndWait(job: GenerationJob): Promise<GenerationOutcome> {
        let immediate: GenerationOutcome | undefined;
        let wait: Promise<GenerationOutcome> | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const cachePresent = await cacheExists(this.env, job.cache);
            const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);

            if (cachePresent) {
                if (stored) {
                    await this.clear(stored.bodyChunks, true);
                }
                immediate = { status: "cached" };
                return;
            }

            if (!stored) {
                // The execution owner authorizes once, under the lock, so
                // every later caller joins without a second reservation.
                const authorization = await this.env.ENTER_GATEWAY.authorize({
                    ...job.authorize,
                    service: BILLING_SERVICE,
                    requestId: job.requestId,
                });
                if (!authorization.ok) {
                    immediate = {
                        status: "denied",
                        denial: authorization.denial,
                    };
                    return;
                }
                await this.persist(job, authorization.authorizationId);
            }

            wait = new Promise<GenerationOutcome>((resolve) => {
                this.waiters.add(resolve);
            });
        });

        if (immediate) return immediate;
        if (!wait) throw new Error("Generation waiter was not registered");
        return wait;
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
            await this.cancel(interrupted.authorizationId);
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
                await this.cancel(stored.authorizationId);
                await this.finish({ status: "cached" }, stored.bodyChunks);
                return;
            }

            const job = await this.restore(stored);
            const execution = await executeGeneration(
                new Request(job.request.url, {
                    method: job.request.method,
                    headers: job.request.headers,
                    body: job.request.body?.slice().buffer,
                }),
                job.auth,
                job.requestId,
                job.balanceCheckResult,
                stored.authorizationId,
                this.env,
            );
            settlement = execution.settlement;
            await this.finish(execution.result, stored.bodyChunks);
        } catch (error) {
            console.error("Detached generation failed", error);
            await this.cancel(stored.authorizationId);
            await this.finish(
                unavailable("Detached generation failed"),
                stored.bodyChunks,
            );
        } finally {
            if (settlement) await settlement;
        }
    }

    /** Release the authorization of work that never reached settlement. */
    private async cancel(authorizationId: string): Promise<void> {
        try {
            await this.env.ENTER_GATEWAY.cancel(authorizationId);
        } catch (error) {
            console.error("Generation authorization cancel failed", error);
        }
    }

    private async persist(
        job: GenerationJob,
        authorizationId: string,
    ): Promise<void> {
        const body = job.request.body;
        const chunks: Uint8Array[] = [];
        if (body !== undefined) {
            const bytes = body;
            for (let offset = 0; offset < bytes.byteLength; ) {
                const end = Math.min(
                    offset + BODY_CHUNK_BYTES,
                    bytes.byteLength,
                );
                chunks.push(bytes.slice(offset, end));
                offset = end;
            }
        }

        const { body: _body, ...request } = job.request;
        const stored: PersistedJob = {
            cache: job.cache,
            auth: job.auth,
            requestId: job.requestId,
            balanceCheckResult: job.balanceCheckResult,
            authorizationId,
            request,
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

    private async restore(job: PersistedJob): Promise<RestoredJob> {
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
            request: { ...job.request, ...(body !== undefined && { body }) },
        };
    }

    private async finish(
        outcome: GenerationOutcome,
        bodyChunks: number,
    ): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            await this.clear(bodyChunks);
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
