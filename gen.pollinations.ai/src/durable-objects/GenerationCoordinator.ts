import { DurableObject } from "cloudflare:workers";
import type {
    GenerationCoordinatorStatus,
    GenerationExecutionProps,
    GenerationExecutionResult,
    GenerationJob,
} from "@/utils/idempotent-generation.ts";

const JOB_KEY = "job";

type ActiveJob = GenerationJob & {
    status: "queued" | "running";
};

type FailedJob = {
    status: "failed";
    response: GenerationExecutionResult;
};

type StoredJob = ActiveJob | FailedJob;

type GenerationExecutorBinding = (options: {
    props: GenerationExecutionProps;
}) => {
    execute(request: Request): Promise<GenerationExecutionResult>;
};

function internalFailure(message: string): GenerationExecutionResult {
    return {
        cached: false,
        retryable: false,
        status: 502,
        statusText: "Bad Gateway",
        contentType: "text/plain; charset=utf-8",
        body: message,
    };
}

export class GenerationCoordinator extends DurableObject<CloudflareBindings> {
    async start(job: GenerationJob): Promise<{ role: "owner" | "joiner" }> {
        const existing = await this.ctx.storage.get<StoredJob>(JOB_KEY);
        if (
            existing?.status === "queued" ||
            existing?.status === "running" ||
            (existing?.status === "failed" &&
                existing.response.retryable === false)
        ) {
            if (
                existing.status === "queued" &&
                (await this.ctx.storage.getAlarm()) === null
            ) {
                await this.ctx.storage.setAlarm(Date.now());
            }
            return { role: "joiner" };
        }

        await this.ctx.storage.put<StoredJob>(JOB_KEY, {
            ...job,
            status: "queued",
        });
        await this.ctx.storage.setAlarm(Date.now());
        return { role: "owner" };
    }

    async getStatus(): Promise<GenerationCoordinatorStatus> {
        const job = await this.ctx.storage.get<StoredJob>(JOB_KEY);
        if (!job) return { status: "idle" };
        if (job.status === "failed") {
            return { status: "failed", response: job.response };
        }
        return { status: job.status };
    }

    async alarm(): Promise<void> {
        const job = await this.ctx.storage.get<StoredJob>(JOB_KEY);
        if (!job || job.status === "failed") return;
        if (job.status === "running") {
            await this.fail(
                internalFailure(
                    "Generation outcome is unknown; refusing to submit it again",
                ),
            );
            return;
        }

        const running: ActiveJob = { ...job, status: "running" };
        await this.ctx.storage.put(JOB_KEY, running);

        try {
            const exports = (
                this.ctx as DurableObjectState & { exports: unknown }
            ).exports as {
                GenerationExecutor: GenerationExecutorBinding;
            };
            const executor = exports.GenerationExecutor({
                props: {
                    type: "generation-execution",
                    auth: job.auth,
                },
            });
            const result = await executor.execute(
                new Request(job.request.url, {
                    method: job.request.method,
                    headers: job.request.headers,
                    body: job.request.body,
                }),
            );
            if (result.cached) {
                await this.ctx.storage.deleteAll();
                return;
            }
            await this.fail(result);
        } catch (error) {
            await this.fail(
                internalFailure(
                    error instanceof Error ? error.message : String(error),
                ),
            );
        }
    }

    private async fail(response: GenerationExecutionResult): Promise<void> {
        await this.ctx.storage.put<StoredJob>(JOB_KEY, {
            status: "failed",
            response,
        });
    }
}
