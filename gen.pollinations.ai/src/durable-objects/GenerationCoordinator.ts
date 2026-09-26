import { DurableObject } from "cloudflare:workers";
import type {
    GenerationCacheIdentity,
    GenerationJob,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";
import {
    bodyChunkKeys,
    type PersistedGenerationRequest,
    persistRequest,
    restoreRequest,
} from "../utils/generation-request-storage.ts";
import {
    createX402Coordinator,
    type X402Coordinator,
} from "../x402/coordinator.ts";

const JOB_KEY = "job";

type PersistedJob = Omit<GenerationJob, "request"> &
    PersistedGenerationRequest & { started: boolean };

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

    private readonly x402 = createX402Coordinator(this.ctx, this.env);

    override fetch(request: Request): Promise<Response> {
        return this.x402.fetch(request);
    }

    getFinalPaymentOperation(
        ...args: Parameters<X402Coordinator["getFinalPaymentOperation"]>
    ) {
        return this.x402.getFinalPaymentOperation(...args);
    }

    getGeneratedPaymentOperation(
        ...args: Parameters<X402Coordinator["getGeneratedPaymentOperation"]>
    ) {
        return this.x402.getGeneratedPaymentOperation(...args);
    }

    startPaymentOperation(
        ...args: Parameters<X402Coordinator["startPaymentOperation"]>
    ) {
        return this.x402.startPaymentOperation(...args);
    }

    completePaymentOperation(
        ...args: Parameters<X402Coordinator["completePaymentOperation"]>
    ) {
        return this.x402.completePaymentOperation(...args);
    }

    completeFinalPaymentOperation(
        ...args: Parameters<X402Coordinator["completeFinalPaymentOperation"]>
    ) {
        return this.x402.completeFinalPaymentOperation(...args);
    }

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
        if (await this.x402.alarm()) return;

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

    private async persist(job: GenerationJob): Promise<void> {
        const stored: PersistedJob = {
            ...job,
            ...(await persistRequest(this.ctx.storage, job.request)),
            started: false,
        };
        await this.ctx.storage.put(JOB_KEY, stored);
        await this.ctx.storage.setAlarm(Date.now());
    }

    private async restore(job: PersistedJob): Promise<GenerationJob> {
        return { ...job, request: await restoreRequest(this.ctx.storage, job) };
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
