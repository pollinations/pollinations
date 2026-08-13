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

async function cacheExists(
    env: CloudflareBindings,
    cache: GenerationCacheIdentity,
): Promise<boolean> {
    const bucket =
        cache.storage === "media" ? env.IMAGE_BUCKET : env.TEXT_BUCKET;
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
                if (stored) await this.clear();
                immediate = { status: "cached" };
                return;
            }

            if (!stored) {
                await this.persist(job);
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
        let settlement: Promise<void> | undefined;
        try {
            const stored = await this.ctx.storage.get<PersistedJob>(JOB_KEY);
            if (!stored) return;

            if (await cacheExists(this.env, stored.cache)) {
                await this.finish({ status: "cached" });
                return;
            }

            const job = await this.restore(stored);
            const execution = await executeGeneration(
                new Request(job.request.url, {
                    method: job.request.method,
                    headers: job.request.headers,
                    body: job.request.body,
                }),
                job.auth,
                this.env,
            );
            settlement = execution.settlement;
            await this.finish(execution.result);
        } catch (error) {
            console.error("Detached generation failed", error);
            await this.finish(unavailable("Detached generation failed"));
        } finally {
            if (settlement) await settlement;
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
        const stored: PersistedJob = {
            cache: job.cache,
            auth: job.auth,
            request,
            bodyChunks: chunks.length,
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
            const keys = Array.from(
                { length: job.bodyChunks },
                (_, index) => `${BODY_KEY_PREFIX}${index}`,
            );
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
            body = new TextDecoder().decode(bytes);
        }
        return {
            cache: job.cache,
            auth: job.auth,
            request: { ...job.request, ...(body !== undefined && { body }) },
        };
    }

    private async finish(outcome: GenerationOutcome): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            await this.clear();
            for (const resolve of this.waiters) resolve(outcome);
            this.waiters.clear();
        });
    }

    private async clear(): Promise<void> {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
    }
}
