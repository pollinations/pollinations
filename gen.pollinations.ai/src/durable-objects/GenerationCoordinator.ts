import { DurableObject } from "cloudflare:workers";
import type {
    GenerationCacheIdentity,
    GenerationJob,
    GenerationOutcome,
    GenerationRequestSnapshot,
} from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";
import { createAnonymousX402Routes } from "../routes/x402.ts";
import { X402LiveStream } from "../utils/x402-stream.ts";

const JOB_KEY = "job";
const BODY_KEY_PREFIX = "body:";
const BODY_CHUNK_BYTES = 1_000_000;
const PAYMENT_OPERATION_KEY = "payment-operation";
const PAYMENT_REQUEST_KEY = "payment-request";

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
    response?: Omit<PaymentResponseSnapshot, "body"> & { bodyKey: string };
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
type PersistedPaymentRequest = Pick<
    PersistedJob,
    "request" | "bodyChunks" | "started"
>;

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
    private readonly paymentWaiters = new Set<(response: Response) => void>();
    private paymentStream?: X402LiveStream;

    // Use the HTTP stream transport. Cancelling a body returned over DO RPC
    // currently leaves an unhandled rejection in workerd (workers-sdk#11071).
    override async fetch(request: Request): Promise<Response> {
        return this.startPaymentRequestAndWait({
            url: request.url,
            method: request.method,
            headers: [...request.headers.entries()],
            ...(request.body && {
                body: new Uint8Array(await request.arrayBuffer()),
            }),
        });
    }

    private openPaymentStream(headers: Headers): (chunk: Uint8Array) => void {
        const stream = new X402LiveStream(headers);
        this.paymentStream = stream;
        for (const resolve of this.paymentWaiters) resolve(stream.response());
        this.paymentWaiters.clear();
        return (chunk) => stream.write(chunk);
    }

    /** The alarm, not the client connection, owns generation and settlement. */
    private async startPaymentRequestAndWait(
        request: GenerationRequestSnapshot,
    ): Promise<Response> {
        let wait: Promise<Response> | undefined;
        await this.ctx.blockConcurrencyWhile(async () => {
            if (!(await this.ctx.storage.get(PAYMENT_REQUEST_KEY))) {
                const stored = await this.persistRequest(request);
                await this.ctx.storage.put(PAYMENT_REQUEST_KEY, {
                    ...stored,
                    started: false,
                });
                await this.ctx.storage.setAlarm(Date.now());
            }
            wait = this.paymentStream
                ? Promise.resolve(this.paymentStream.response())
                : new Promise((resolve) => this.paymentWaiters.add(resolve));
        });
        if (!wait) throw new Error("Payment waiter was not registered");
        return wait;
    }

    private async executePaymentRequest(
        stored: PersistedPaymentRequest,
    ): Promise<void> {
        let response = new Response(
            "Detached payment execution was interrupted; retry with the same Idempotency-Key and payment.",
            { status: 503 },
        );
        try {
            if (!stored.started) {
                await this.ctx.storage.put(PAYMENT_REQUEST_KEY, {
                    ...stored,
                    started: true,
                });
                const request = await this.restoreRequest(stored);
                const pending: Promise<unknown>[] = [];
                response = await createAnonymousX402Routes(
                    this.env,
                    true,
                    (headers) => this.openPaymentStream(headers),
                ).fetch(
                    new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: request.body?.slice().buffer,
                    }),
                    this.env,
                    {
                        waitUntil: (promise: Promise<unknown>) => {
                            pending.push(promise);
                        },
                        passThroughOnException: () => {},
                        props: {},
                    } as ExecutionContext,
                );
                await Promise.allSettled(pending);
            }
        } catch {
            response = new Response(
                "Detached payment execution failed; retry with the same Idempotency-Key and payment.",
                { status: 503 },
            );
        }
        const body = await response.arrayBuffer();
        await this.ctx.blockConcurrencyWhile(async () => {
            await this.ctx.storage.delete([
                PAYMENT_REQUEST_KEY,
                ...bodyChunkKeys(stored.bodyChunks),
            ]);
            this.paymentStream?.finish(response);
            this.paymentStream = undefined;
            for (const resolve of this.paymentWaiters) {
                resolve(new Response(body.slice(0), response));
            }
            this.paymentWaiters.clear();
        });
    }

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
        const bodyKey = `x402/${this.ctx.id.toString()}/response`;
        await this.env.IMAGE_BUCKET.put(bodyKey, response.body);
        await this.ctx.storage.put(PAYMENT_OPERATION_KEY, {
            ...operation,
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                bodyKey,
            },
        } satisfies PaymentOperation);
    }

    private async restorePaymentResponse(
        response: NonNullable<PaymentOperation["response"]>,
    ): Promise<PaymentResponseSnapshot> {
        const object = await this.env.IMAGE_BUCKET.get(response.bodyKey);
        if (!object) {
            throw new Error("Persisted payment response is incomplete");
        }
        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: new Uint8Array(await object.arrayBuffer()),
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
        const paymentRequest =
            await this.ctx.storage.get<PersistedPaymentRequest>(
                PAYMENT_REQUEST_KEY,
            );
        if (paymentRequest) {
            await this.executePaymentRequest(paymentRequest);
            return;
        }
        const payment = await this.ctx.storage.get<PaymentOperation>(
            PAYMENT_OPERATION_KEY,
        );
        if (payment?.state === "generated" || payment?.state === "final") {
            if ((payment.expiresAt ?? 0) > Date.now()) {
                await this.ctx.storage.setAlarm(payment.expiresAt as number);
                return;
            }
            await this.ctx.storage.deleteAlarm();
            if (payment.response?.bodyKey)
                await this.env.IMAGE_BUCKET.delete(payment.response.bodyKey);
            // Payment operations occupy their own named coordinator. This
            // also clears expired chunks from the earlier staging prototype.
            await this.ctx.storage.deleteAll();
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

    private async persistRequest(
        snapshot: GenerationRequestSnapshot,
    ): Promise<Omit<PersistedPaymentRequest, "started">> {
        const body = snapshot.body;
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

        const { body: _body, ...request } = snapshot;
        const entries: Record<string, unknown> = {};
        for (const [index, chunk] of chunks.entries()) {
            entries[`${BODY_KEY_PREFIX}${index}`] = chunk;
        }
        await this.ctx.storage.put(entries);
        return { request, bodyChunks: chunks.length };
    }

    private async persist(job: GenerationJob): Promise<void> {
        const stored: PersistedJob = {
            ...job,
            ...(await this.persistRequest(job.request)),
            started: false,
        };
        await this.ctx.storage.put(JOB_KEY, stored);
        await this.ctx.storage.setAlarm(Date.now());
    }

    private async restoreRequest(
        job: PersistedPaymentRequest,
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

    private async restore(job: PersistedJob): Promise<GenerationJob> {
        return { ...job, request: await this.restoreRequest(job) };
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
