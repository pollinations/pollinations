import { DurableObject } from "cloudflare:workers";
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

type PersistedJob = Omit<GenerationJob, "request"> & {
    request: Omit<GenerationRequestSnapshot, "body">;
    bodyChunks: number;
};

type ActiveJob = {
    status: "queued" | "running";
    job: PersistedJob;
};

type UnknownJob = {
    status: "unknown";
    cache: GenerationCacheIdentity;
};

type StoredJob = ActiveJob | UnknownJob;

async function cacheExists(
    env: CloudflareBindings,
    cache: GenerationCacheIdentity,
): Promise<boolean> {
    const bucket =
        cache.storage === "media" ? env.IMAGE_BUCKET : env.TEXT_BUCKET;
    return (await bucket.head(cache.key)) !== null;
}

export class GenerationCoordinator extends DurableObject<CloudflareBindings> {
    private readonly waiters = new Set<(outcome: GenerationOutcome) => void>();

    async startAndWait(job: GenerationJob): Promise<{
        role: "owner" | "joiner";
        outcome: GenerationOutcome;
    }> {
        let role: "owner" | "joiner" = "joiner";
        let immediate: GenerationOutcome | undefined;
        let wait: Promise<GenerationOutcome> | undefined;

        await this.ctx.blockConcurrencyWhile(async () => {
            const stored = await this.ctx.storage.get<StoredJob>(JOB_KEY);

            if (stored?.status === "unknown") {
                if (await cacheExists(this.env, stored.cache)) {
                    await this.clear();
                    immediate = { status: "cached" };
                    return;
                }
                immediate = { status: "unknown" };
                return;
            }

            if (!stored) {
                if (await cacheExists(this.env, job.cache)) {
                    immediate = { status: "cached" };
                    return;
                }
                await this.persist(job);
                role = "owner";
            } else if ((await this.ctx.storage.getAlarm()) === null) {
                await this.ctx.storage.setAlarm(Date.now());
            }

            wait = new Promise<GenerationOutcome>((resolve) => {
                this.waiters.add(resolve);
            });
        });

        if (immediate) return { role, outcome: immediate };
        if (!wait) throw new Error("Generation waiter was not registered");
        return { role, outcome: await wait };
    }

    async alarm(): Promise<void> {
        const stored = await this.ctx.storage.get<StoredJob>(JOB_KEY);
        if (!stored) return;

        if (stored.status === "unknown") {
            if (await cacheExists(this.env, stored.cache)) {
                await this.finish({ status: "cached" });
            }
            return;
        }

        if (stored.status === "running") {
            if (await cacheExists(this.env, stored.job.cache)) {
                await this.finish({ status: "cached" });
            } else {
                await this.markUnknown(stored);
            }
            return;
        }

        // A previous request may have filled R2 between the caller's MISS and
        // this alarm. Recheck immediately before generation begins.
        if (await cacheExists(this.env, stored.job.cache)) {
            await this.finish({ status: "cached" });
            return;
        }

        const running: ActiveJob = { ...stored, status: "running" };
        await this.ctx.storage.put<StoredJob>(JOB_KEY, running);

        try {
            const job = await this.restore(running.job);
            const result = await executeGeneration(
                new Request(job.request.url, {
                    method: job.request.method,
                    headers: job.request.headers,
                    body: job.request.body,
                }),
                job.auth,
                this.env,
            );

            if (result.status === "failed") {
                await this.finish(result);
                return;
            }
            if (
                result.status === "cached" &&
                (await cacheExists(this.env, job.cache))
            ) {
                await this.finish({ status: "cached" });
                return;
            }
            await this.markUnknown(running);
        } catch (error) {
            // Provider acceptance can be ambiguous after an interruption. Do
            // not clear this tombstone and risk submitting the same job again.
            console.error("Detached generation failed ambiguously", error);
            await this.markUnknown(running);
        }
    }

    private async persist(job: GenerationJob): Promise<void> {
        const body = job.request.body;
        const chunks: Uint8Array[] = [];
        if (body !== undefined) {
            const bytes = new TextEncoder().encode(body);
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
        const stored: ActiveJob = {
            status: "queued",
            job: {
                cache: job.cache,
                auth: job.auth,
                request,
                bodyChunks: chunks.length,
            },
        };
        const entries: Record<string, unknown> = { [JOB_KEY]: stored };
        for (const [index, chunk] of chunks.entries()) {
            entries[`${BODY_KEY_PREFIX}${index}`] = chunk;
        }
        await this.ctx.storage.put(entries);
        await this.ctx.storage.setAlarm(Date.now());
    }

    private async restore(job: PersistedJob): Promise<GenerationJob> {
        let body: string | undefined;
        if (job.bodyChunks > 0) {
            const chunks = await Promise.all(
                Array.from({ length: job.bodyChunks }, (_, index) =>
                    this.ctx.storage.get<Uint8Array>(
                        `${BODY_KEY_PREFIX}${index}`,
                    ),
                ),
            );
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
            body = new TextDecoder().decode(bytes);
        }
        return {
            cache: job.cache,
            auth: job.auth,
            request: { ...job.request, ...(body !== undefined && { body }) },
        };
    }

    private async markUnknown(job: ActiveJob): Promise<void> {
        await this.ctx.storage.put<StoredJob>(JOB_KEY, {
            status: "unknown",
            cache: job.job.cache,
        });
        await this.ctx.storage.deleteAlarm();
        if (job.job.bodyChunks > 0) {
            await this.ctx.storage.delete(
                Array.from(
                    { length: job.job.bodyChunks },
                    (_, index) => `${BODY_KEY_PREFIX}${index}`,
                ),
            );
        }
        this.resolveWaiters({ status: "unknown" });
    }

    private async finish(outcome: GenerationOutcome): Promise<void> {
        await this.clear();
        this.resolveWaiters(outcome);
    }

    private async clear(): Promise<void> {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
    }

    private resolveWaiters(outcome: GenerationOutcome): void {
        for (const resolve of this.waiters) resolve(outcome);
        this.waiters.clear();
    }
}
