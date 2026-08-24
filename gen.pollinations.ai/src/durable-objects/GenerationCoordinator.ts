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

type PersistedJob = Omit<GenerationJob, "request" | "billingRequest"> & {
    request: Omit<GenerationRequestSnapshot, "body">;
    billingAuthorizationId: string;
    bodyChunks: number;
    started: boolean;
};

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
    const bucket =
        cache.storage === "media" ? env.IMAGE_BUCKET : env.TEXT_BUCKET;
    return (await bucket.head(cache.key)) !== null;
}

async function deleteCache(
    env: CloudflareBindings,
    cache: GenerationCacheIdentity,
): Promise<void> {
    const bucket =
        cache.storage === "media" ? env.IMAGE_BUCKET : env.TEXT_BUCKET;
    await bucket.delete(cache.key);
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

function authorizationDenied(error: string): GenerationOutcome {
    const status =
        error === "invalid_api_key"
            ? 401
            : error === "insufficient_balance_or_budget"
              ? 402
              : error === "forbidden" || error === "model_not_allowed"
                ? 403
                : error === "authorization_conflict" ||
                    error === "authorization_closed"
                  ? 409
                  : 500;
    return {
        status: "failed",
        error: {
            httpStatus: status,
            headers: [["content-type", "text/plain; charset=UTF-8"]],
            body: new TextEncoder().encode(
                status === 402
                    ? "Insufficient balance or API key budget for this request"
                    : status === 401
                      ? "A valid API key is required"
                      : status === 403
                        ? "This API key cannot use the requested model"
                        : "Unable to authorize billing for this request",
            ),
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

            if (!stored && cachePresent) {
                immediate = { status: "cached" };
                return;
            }

            if (!stored) {
                const authorization = await this.env.ENTER_BILLING.authorize(
                    job.billingRequest.token,
                    job.billingRequest.authorization,
                );
                if (!authorization.ok) {
                    immediate = authorizationDenied(authorization.error);
                    return;
                }
                try {
                    await this.persist(job, authorization.grant.id);
                } catch (error) {
                    await this.env.ENTER_BILLING.cancel(authorization.grant.id);
                    throw error;
                }
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
            await deleteCache(this.env, interrupted.cache);
            await this.env.ENTER_BILLING.cancel(
                interrupted.billingAuthorizationId,
            );
            await this.finish(
                unavailable("Detached generation was interrupted"),
                interrupted.bodyChunks,
            );
            return;
        }
        if (!stored) return;

        try {
            if (await cacheExists(this.env, stored.cache)) {
                await this.env.ENTER_BILLING.cancel(
                    stored.billingAuthorizationId,
                );
                await this.finish({ status: "cached" }, stored.bodyChunks);
                return;
            }

            const request = await this.restoreRequest(stored);
            const execution = await executeGeneration(
                new Request(request.url, {
                    method: request.method,
                    headers: request.headers,
                    body: request.body?.slice().buffer,
                }),
                stored.auth,
                stored.requestId,
                stored.balanceCheckResult,
                stored.billingAuthorizationId,
                this.env,
            );
            await execution.settlement;
            if (execution.result.status === "failed") {
                await this.env.ENTER_BILLING.cancel(
                    stored.billingAuthorizationId,
                );
            }
            await this.finish(execution.result, stored.bodyChunks);
        } catch (error) {
            console.error("Detached generation failed", error);
            await deleteCache(this.env, stored.cache);
            await this.env.ENTER_BILLING.cancel(stored.billingAuthorizationId);
            await this.finish(
                unavailable("Detached generation failed"),
                stored.bodyChunks,
            );
        }
    }

    private async persist(
        job: GenerationJob,
        billingAuthorizationId: string,
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
            billingAuthorizationId,
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

    private async restoreRequest(
        job: PersistedJob,
    ): Promise<GenerationRequestSnapshot> {
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
        return { ...job.request, ...(body !== undefined && { body }) };
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
