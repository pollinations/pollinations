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
const PAYMENT_OPERATION_KEY = "payment-operation";
const PAYMENT_BODY_PREFIX = "payment-body:";

export type PaymentResponseSnapshot = {
    status: number;
    statusText: string;
    headers: [string, string][];
    body: Uint8Array;
};

function paymentResponsesEqual(
    left: PaymentResponseSnapshot,
    right: PaymentResponseSnapshot,
): boolean {
    return (
        left.status === right.status &&
        left.statusText === right.statusText &&
        left.headers.length === right.headers.length &&
        left.headers.every(
            ([name, value], index) =>
                name === right.headers[index]?.[0] &&
                value === right.headers[index]?.[1],
        ) &&
        left.body.byteLength === right.body.byteLength &&
        left.body.every((byte, index) => byte === right.body[index])
    );
}

type PaymentOperation = {
    fingerprint: string;
    paymentIdentity: string;
    paymentProof: string;
    state: "running" | "generated" | "final";
    claimId?: string;
    leaseUntil?: number;
    response?: Omit<PaymentResponseSnapshot, "body"> & { bodyChunks: number };
    expiresAt?: number;
};

export type PaymentOperationStart =
    | { status: "owner" }
    | { status: "running" }
    | { status: "fingerprint-conflict" }
    | { status: "payment-conflict" }
    | { status: "generated"; response: PaymentResponseSnapshot };

export type FinalPaymentOperation =
    | { status: "absent" | "non-final" }
    | { status: "fingerprint-conflict" | "payment-conflict" }
    | { status: "final"; response: PaymentResponseSnapshot };

export type GeneratedPaymentOperation =
    | { status: "absent" | "not-generated" }
    | { status: "fingerprint-conflict" | "payment-conflict" }
    | { status: "generated" };

type PersistedJob = Omit<GenerationJob, "request"> & {
    request: Omit<GenerationRequestSnapshot, "body">;
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

    async getFinalPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
    ): Promise<FinalPaymentOperation> {
        let result: FinalPaymentOperation = { status: "absent" };
        await this.ctx.blockConcurrencyWhile(async () => {
            const operation = await this.ctx.storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (!operation) return;
            if (operation.fingerprint !== fingerprint) {
                result = { status: "fingerprint-conflict" };
                return;
            }
            if (
                operation.paymentIdentity !== paymentIdentity ||
                operation.paymentProof !== paymentProof
            ) {
                result = { status: "payment-conflict" };
                return;
            }
            if (operation.state !== "final" || !operation.response) {
                result = { status: "non-final" };
                return;
            }
            result = {
                status: "final",
                response: await this.restorePaymentResponse(operation.response),
            };
        });
        return result;
    }

    async getGeneratedPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
    ): Promise<GeneratedPaymentOperation> {
        const operation = await this.ctx.storage.get<PaymentOperation>(
            PAYMENT_OPERATION_KEY,
        );
        if (!operation) return { status: "absent" };
        if (operation.fingerprint !== fingerprint) {
            return { status: "fingerprint-conflict" };
        }
        if (
            operation.paymentIdentity !== paymentIdentity ||
            operation.paymentProof !== paymentProof
        ) {
            return { status: "payment-conflict" };
        }
        return operation.state === "generated"
            ? { status: "generated" }
            : { status: "not-generated" };
    }

    async startPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
        claimId: string,
        leaseUntil: number,
    ): Promise<PaymentOperationStart> {
        let result: PaymentOperationStart = { status: "running" };
        await this.ctx.blockConcurrencyWhile(async () => {
            const operation = await this.ctx.storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (operation && operation.fingerprint !== fingerprint) {
                result = { status: "fingerprint-conflict" };
                return;
            }
            if (
                operation &&
                (operation.paymentIdentity !== paymentIdentity ||
                    operation.paymentProof !== paymentProof)
            ) {
                result = { status: "payment-conflict" };
                return;
            }
            if (
                operation &&
                (operation.state === "generated" ||
                    operation.state === "final") &&
                operation.response
            ) {
                result = {
                    status: "generated",
                    response: await this.restorePaymentResponse(
                        operation.response,
                    ),
                };
                return;
            }
            if (
                operation?.state === "running" &&
                (operation.leaseUntil ?? 0) > Date.now()
            ) {
                result = { status: "running" };
                return;
            }
            await this.ctx.storage.put(PAYMENT_OPERATION_KEY, {
                fingerprint,
                paymentIdentity,
                paymentProof,
                state: "running",
                claimId,
                leaseUntil,
            } satisfies PaymentOperation);
            result = { status: "owner" };
        });
        return result;
    }

    async completePaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
        claimId: string,
        response: PaymentResponseSnapshot,
        expiresAt: number,
    ): Promise<boolean> {
        let completed = false;
        await this.ctx.blockConcurrencyWhile(async () => {
            const operation = await this.ctx.storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (
                operation?.state !== "running" ||
                operation.fingerprint !== fingerprint ||
                operation.paymentIdentity !== paymentIdentity ||
                operation.paymentProof !== paymentProof ||
                operation.claimId !== claimId
            ) {
                return;
            }
            await this.storePaymentResponse(response, {
                fingerprint,
                paymentIdentity,
                paymentProof,
                state: "generated",
                expiresAt,
            });
            await this.ctx.storage.setAlarm(expiresAt);
            completed = true;
        });
        return completed;
    }

    async completeFinalPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
        response: PaymentResponseSnapshot,
        expiresAt: number,
    ): Promise<boolean> {
        let completed = false;
        await this.ctx.blockConcurrencyWhile(async () => {
            const operation = await this.ctx.storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (
                !operation ||
                operation.fingerprint !== fingerprint ||
                operation.paymentIdentity !== paymentIdentity ||
                operation.paymentProof !== paymentProof
            ) {
                return;
            }
            if (operation.state === "final") {
                if (operation.response) {
                    completed = paymentResponsesEqual(
                        await this.restorePaymentResponse(operation.response),
                        response,
                    );
                }
                return;
            }
            if (operation.state !== "generated") return;
            await this.storePaymentResponse(response, {
                fingerprint,
                paymentIdentity,
                paymentProof,
                state: "final",
                expiresAt,
            });
            await this.ctx.storage.setAlarm(expiresAt);
            completed = true;
        });
        return completed;
    }

    private async storePaymentResponse(
        response: PaymentResponseSnapshot,
        operation: Omit<PaymentOperation, "response">,
    ): Promise<void> {
        const chunks: Uint8Array[] = [];
        for (let offset = 0; offset < response.body.byteLength; ) {
            const end = Math.min(
                offset + BODY_CHUNK_BYTES,
                response.body.byteLength,
            );
            chunks.push(response.body.slice(offset, end));
            offset = end;
        }
        const entries: Record<string, unknown> = {};
        for (const [index, chunk] of chunks.entries()) {
            entries[`${PAYMENT_BODY_PREFIX}${index}`] = chunk;
        }
        entries[PAYMENT_OPERATION_KEY] = {
            ...operation,
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                bodyChunks: chunks.length,
            },
        } satisfies PaymentOperation;
        await this.ctx.storage.put(entries);
    }

    private async restorePaymentResponse(
        response: NonNullable<PaymentOperation["response"]>,
    ): Promise<PaymentResponseSnapshot> {
        const keys = Array.from(
            { length: response.bodyChunks },
            (_, index) => `${PAYMENT_BODY_PREFIX}${index}`,
        );
        const stored = await this.ctx.storage.get<Uint8Array>(keys);
        const chunks = keys.map((key) => stored.get(key));
        if (chunks.some((chunk) => chunk === undefined)) {
            throw new Error("Persisted payment response is incomplete");
        }
        const size = chunks.reduce(
            (total, chunk) => total + (chunk?.byteLength ?? 0),
            0,
        );
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            if (!chunk)
                throw new Error("Persisted payment response is incomplete");
            body.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body,
        };
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
        const payment = await this.ctx.storage.get<PaymentOperation>(
            PAYMENT_OPERATION_KEY,
        );
        if (payment?.state === "generated" || payment?.state === "final") {
            if ((payment.expiresAt ?? 0) > Date.now()) {
                await this.ctx.storage.setAlarm(payment.expiresAt as number);
                return;
            }
            await this.ctx.storage.deleteAlarm();
            await this.ctx.storage.delete([
                PAYMENT_OPERATION_KEY,
                ...Array.from(
                    { length: payment.response?.bodyChunks ?? 0 },
                    (_, index) => `${PAYMENT_BODY_PREFIX}${index}`,
                ),
            ]);
            return;
        }

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
            const execution = await executeGeneration(
                new Request(job.request.url, {
                    method: job.request.method,
                    headers: job.request.headers,
                    body: job.request.body?.slice().buffer,
                }),
                job.auth,
                job.requestId,
                job.balanceCheckResult,
                job.apiKeyBudgetEstimate,
                this.env,
            );
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
            apiKeyBudgetEstimate: job.apiKeyBudgetEstimate,
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
