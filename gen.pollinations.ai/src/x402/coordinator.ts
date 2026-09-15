import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";
import type { GenerationRequestSnapshot } from "@/middleware/generation-deduplication.ts";
import {
    bodyChunkKeys,
    type PersistedGenerationRequest,
    persistRequest,
    restoreRequest,
} from "../utils/generation-request-storage.ts";
import { sendX402Event } from "./accounting.ts";
import { executeX402Request } from "./execution.ts";
import { X402LiveStream } from "./stream.ts";

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
    accounting?: TinybirdEvent;
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

type PersistedPaymentRequest = PersistedGenerationRequest & {
    started: boolean;
};

/** Payment-only state in separately named instances of the existing coordinator.
 * Keep its storage keys and RPC contracts stable so in-flight retries survive deploys.
 */
export function createX402Coordinator(
    ctx: DurableObjectState,
    env: CloudflareBindings,
) {
    const storage = ctx.storage;
    const paymentWaiters = new Set<(response: Response) => void>();
    let paymentStream: X402LiveStream | undefined;

    // HTTP keeps stream cancellation out of RPC (workers-sdk issue #11071).
    async function fetch(request: Request): Promise<Response> {
        return startPaymentRequestAndWait({
            url: request.url,
            method: request.method,
            headers: [...request.headers.entries()],
            ...(request.body && {
                body: new Uint8Array(await request.arrayBuffer()),
            }),
        });
    }

    function openPaymentStream(headers: Headers): (chunk: Uint8Array) => void {
        const stream = new X402LiveStream(headers);
        paymentStream = stream;
        for (const resolve of paymentWaiters) resolve(stream.response());
        paymentWaiters.clear();
        return (chunk) => stream.write(chunk);
    }

    // The alarm owns generation and settlement, independently of callers.
    async function startPaymentRequestAndWait(
        request: GenerationRequestSnapshot,
    ): Promise<Response> {
        let wait: Promise<Response> | undefined;
        await ctx.blockConcurrencyWhile(async () => {
            if (!(await storage.get(PAYMENT_REQUEST_KEY))) {
                const stored = await persistRequest(storage, request);
                await storage.put(PAYMENT_REQUEST_KEY, {
                    ...stored,
                    started: false,
                });
                await storage.setAlarm(Date.now());
            }
            wait = paymentStream
                ? Promise.resolve(paymentStream.response())
                : new Promise((resolve) => paymentWaiters.add(resolve));
        });
        if (!wait) throw new Error("Payment waiter was not registered");
        return wait;
    }

    async function executePaymentRequest(
        stored: PersistedPaymentRequest,
    ): Promise<void> {
        let response = new Response(
            "Detached payment execution was interrupted; retry with the same Idempotency-Key and payment.",
            { status: 503 },
        );
        try {
            if (!stored.started) {
                await storage.put(PAYMENT_REQUEST_KEY, {
                    ...stored,
                    started: true,
                });
                const request = await restoreRequest(storage, stored);
                const pending: Promise<unknown>[] = [];
                response = await executeX402Request(
                    new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: request.body?.slice().buffer,
                    }),
                    env,
                    {
                        waitUntil: (promise: Promise<unknown>) => {
                            pending.push(promise);
                        },
                        passThroughOnException: () => {},
                        props: {},
                    } as ExecutionContext,
                    { onStream: (headers) => openPaymentStream(headers) },
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
        await ctx.blockConcurrencyWhile(async () => {
            await storage.delete([
                PAYMENT_REQUEST_KEY,
                ...bodyChunkKeys(stored.bodyChunks),
            ]);
            paymentStream?.finish(response);
            paymentStream = undefined;
            for (const resolve of paymentWaiters) {
                resolve(new Response(body.slice(0), response));
            }
            paymentWaiters.clear();
        });
    }

    async function getFinalPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
    ): Promise<FinalPaymentOperation> {
        return ctx.blockConcurrencyWhile(async () => {
            const operation = await storage.get<PaymentOperation>(
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
            if (operation.state !== "final" || !operation.response) {
                return { status: "non-final" };
            }
            return {
                status: "final",
                response: await restorePaymentResponse(operation.response),
            };
        });
    }

    async function getGeneratedPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
    ): Promise<GeneratedPaymentOperation> {
        const operation = await storage.get<PaymentOperation>(
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

    async function startPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
        claimId: string,
        leaseUntil: number,
    ): Promise<PaymentOperationStart> {
        return ctx.blockConcurrencyWhile(async () => {
            const operation = await storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (operation && operation.fingerprint !== fingerprint) {
                return { status: "fingerprint-conflict" };
            }
            if (
                operation &&
                (operation.paymentIdentity !== paymentIdentity ||
                    operation.paymentProof !== paymentProof)
            ) {
                return { status: "payment-conflict" };
            }
            if (
                operation &&
                (operation.state === "generated" ||
                    operation.state === "final") &&
                operation.response
            ) {
                return {
                    status: "generated",
                    response: await restorePaymentResponse(operation.response),
                };
            }
            if (
                operation?.state === "running" &&
                (operation.leaseUntil ?? 0) > Date.now()
            ) {
                return { status: "running" };
            }
            await storage.put(PAYMENT_OPERATION_KEY, {
                fingerprint,
                paymentIdentity,
                paymentProof,
                state: "running",
                claimId,
                leaseUntil,
            } satisfies PaymentOperation);
            return { status: "owner" };
        });
    }

    async function completePaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
        claimId: string,
        response: PaymentResponseSnapshot,
        expiresAt: number,
        accounting?: TinybirdEvent,
    ): Promise<boolean> {
        return ctx.blockConcurrencyWhile(async () => {
            const operation = await storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (
                operation?.state !== "running" ||
                operation.fingerprint !== fingerprint ||
                operation.paymentIdentity !== paymentIdentity ||
                operation.paymentProof !== paymentProof ||
                operation.claimId !== claimId
            ) {
                return false;
            }
            await storePaymentResponse(response, {
                fingerprint,
                paymentIdentity,
                paymentProof,
                state: "generated",
                expiresAt,
                accounting,
            });
            await storage.setAlarm(expiresAt);
            return true;
        });
    }

    async function completeFinalPaymentOperation(
        fingerprint: string,
        paymentIdentity: string,
        paymentProof: string,
        response: PaymentResponseSnapshot,
        expiresAt: number,
    ): Promise<boolean> {
        return ctx.blockConcurrencyWhile(async () => {
            const operation = await storage.get<PaymentOperation>(
                PAYMENT_OPERATION_KEY,
            );
            if (
                !operation ||
                operation.fingerprint !== fingerprint ||
                operation.paymentIdentity !== paymentIdentity ||
                operation.paymentProof !== paymentProof
            ) {
                return false;
            }
            if (operation.state === "final") {
                return (
                    !!operation.response &&
                    paymentResponsesEqual(
                        await restorePaymentResponse(operation.response),
                        response,
                    )
                );
            }
            if (operation.state !== "generated") return false;
            await storePaymentResponse(response, {
                fingerprint,
                paymentIdentity,
                paymentProof,
                state: "final",
                expiresAt,
                accounting: operation.accounting,
            });
            await storage.setAlarm(expiresAt);
            // Only the first generated -> final transition emits revenue.
            // Retain the event with the receipt for reconciliation if ingestion fails.
            if (operation.accounting)
                ctx.waitUntil(sendX402Event(operation.accounting, env));
            return true;
        });
    }

    async function storePaymentResponse(
        response: PaymentResponseSnapshot,
        operation: Omit<PaymentOperation, "response">,
    ): Promise<void> {
        const bodyKey = `x402/${ctx.id.toString()}/response`;
        // Payment replays stay private, outside the public media service.
        await env.TEXT_BUCKET.put(bodyKey, response.body);
        await storage.put(PAYMENT_OPERATION_KEY, {
            ...operation,
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                bodyKey,
            },
        } satisfies PaymentOperation);
    }

    async function restorePaymentResponse(
        response: NonNullable<PaymentOperation["response"]>,
    ): Promise<PaymentResponseSnapshot> {
        const object = await env.TEXT_BUCKET.get(response.bodyKey);
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

    async function alarm(): Promise<boolean> {
        const paymentRequest =
            await storage.get<PersistedPaymentRequest>(PAYMENT_REQUEST_KEY);
        if (paymentRequest) {
            await executePaymentRequest(paymentRequest);
            return true;
        }
        const payment = await storage.get<PaymentOperation>(
            PAYMENT_OPERATION_KEY,
        );
        if (payment?.state === "generated" || payment?.state === "final") {
            if ((payment.expiresAt ?? 0) > Date.now()) {
                await storage.setAlarm(payment.expiresAt as number);
                return true;
            }
            await storage.deleteAlarm();
            if (payment.response?.bodyKey)
                await env.TEXT_BUCKET.delete(payment.response.bodyKey);
            // Payment operations occupy their own named coordinator. This
            // also clears expired chunks from the earlier staging prototype.
            await storage.deleteAll();
            return true;
        }

        return false;
    }

    return {
        fetch,
        alarm,
        getFinalPaymentOperation,
        getGeneratedPaymentOperation,
        startPaymentOperation,
        completePaymentOperation,
        completeFinalPaymentOperation,
    };
}

export type X402Coordinator = ReturnType<typeof createX402Coordinator>;
