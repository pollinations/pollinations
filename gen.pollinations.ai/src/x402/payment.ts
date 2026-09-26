/** Anonymous x402 payment rail for bounded generation requests. */

import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import {
    type PaymentResumeCandidate,
    WEFT_REQUEST_EXTENSION_KEY,
    WEFT_REQUEST_INFO_SCHEMA,
    weftPaymentMiddlewareHono,
} from "@weftlabs/sdk/facilitator/middleware";
import {
    decodePaymentSignatureHeader,
    type PaymentOption,
    SETTLEMENT_OVERRIDES_HEADER,
} from "@x402/core/http";
import { validatePaymentPayload } from "@x402/core/schemas";
import type { PaymentPayload } from "@x402/core/types";
import {
    type ExactEvmPayloadV2,
    isEIP3009Payload,
    isPermit2Payload,
    isUptoPermit2Payload,
} from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import stableStringify from "fast-json-stable-stringify";
import type { Context, MiddlewareHandler } from "hono";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { createX402Event } from "./accounting.ts";
import type { PaymentResponseSnapshot } from "./coordinator.ts";
import {
    quoteX402Request,
    usdPrice,
    type X402Quote,
    type X402Request,
} from "./pricing.ts";
import {
    collectX402Stream,
    MAX_X402_RESPONSE_BYTES,
    X402_STREAM_DONE,
    x402StreamReceipt,
} from "./stream.ts";

// Default to testnet; production explicitly sets its facilitator and network.
const DEFAULT_FACILITATOR_URL = "https://x402.staging.weft.network";
const DEFAULT_NETWORK = "eip155:84532";
const FINAL_RESPONSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// An alarm can run for 15 minutes. Never replace its owner while the previous
// invocation could still be generating or settling.
const OPERATION_LEASE_MS = 16 * 60 * 1000;

function malformedPaymentIdentity() {
    return new HTTPException(400, {
        message: "Malformed x402 payment identity",
    });
}

function paymentFromHeader(value: string): PaymentPayload {
    let payment: PaymentPayload;
    try {
        payment = decodePaymentSignatureHeader(value);
        validatePaymentPayload(payment);
    } catch {
        throw malformedPaymentIdentity();
    }
    return payment;
}

function parsePaymentIdentity(payment: PaymentPayload) {
    const payload = payment.payload;
    if (payment.x402Version !== 2) {
        throw malformedPaymentIdentity();
    }

    const { network } = payment.accepted;
    let from: string;
    let counterparty: string;
    let nonce: string;
    if (payment.accepted.scheme === "upto" && isUptoPermit2Payload(payload)) {
        ({ from, nonce, spender: counterparty } = payload.permit2Authorization);
    } else if (payment.accepted.scheme === "exact") {
        const exact = payload as ExactEvmPayloadV2;
        if (isPermit2Payload(exact)) {
            ({
                from,
                nonce,
                spender: counterparty,
            } = exact.permit2Authorization);
        } else if (isEIP3009Payload(exact)) {
            ({ from, nonce, to: counterparty } = exact.authorization);
        } else {
            throw malformedPaymentIdentity();
        }
    } else {
        throw malformedPaymentIdentity();
    }
    if (
        !/^[^:]+:[^:]+$/.test(network) ||
        !/^0x[0-9a-fA-F]{40}$/.test(from) ||
        !/^0x[0-9a-fA-F]{40}$/.test(counterparty)
    ) {
        throw malformedPaymentIdentity();
    }

    let canonicalNonce: bigint;
    try {
        canonicalNonce = BigInt(nonce);
    } catch {
        throw malformedPaymentIdentity();
    }
    if (canonicalNonce < 0n || canonicalNonce >= 1n << 256n) {
        throw malformedPaymentIdentity();
    }
    return { from, counterparty, canonicalNonce };
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

async function paymentDetails(value: string) {
    const payment = paymentFromHeader(value);
    return paymentDetailsFromPayload(payment);
}

async function paymentDetailsFromPayload(payment: PaymentPayload) {
    const { from, counterparty, canonicalNonce } =
        parsePaymentIdentity(payment);
    const { network } = payment.accepted;
    const payer = `${network.toLowerCase()}|${from.toLowerCase()}`;
    return {
        payer,
        identity: `${payer}|${counterparty.toLowerCase()}|${canonicalNonce}`,
        proof: await sha256(stableStringify(payment)),
    };
}

async function operationContextFor(
    env: CloudflareBindings,
    keyValue: string | undefined,
    request: X402Request,
    payer: string,
) {
    const key = keyValue?.trim();
    if (!key) {
        throw new HTTPException(400, {
            message: "A non-empty Idempotency-Key is required for x402",
        });
    }
    if (!env.GENERATION_COORDINATOR) {
        throw new HTTPException(503, {
            message: "Payment operation coordination is unavailable",
        });
    }
    const fingerprint = await sha256(stableStringify(request));
    const operationName = await sha256(`${payer}|${key}`);
    return {
        fingerprint,
        stub: env.GENERATION_COORDINATOR.getByName(
            `x402-operation:${operationName}`,
        ),
    };
}

export function describeX402Request(c: Context<Env>): X402Request {
    if (c.var.x402Request) return c.var.x402Request;
    const url = new URL(c.req.url);
    url.searchParams.sort();
    const body =
        c.req.method === "GET"
            ? c.req.valid("query" as never)
            : c.req.valid("json" as never);
    return {
        method: c.req.method,
        path: url.pathname + url.search,
        headers:
            c.req.header(SAFETY_HEADER_NAME) === undefined
                ? {}
                : {
                      [SAFETY_HEADER_NAME]: c.req.header(
                          SAFETY_HEADER_NAME,
                      ) as string,
                  },
        body: {
            ...(body as Record<string, unknown>),
            ...(c.var.model && { model: c.var.model.resolved }),
        },
    };
}

async function operationContext(c: Context<Env>, payer: string) {
    return operationContextFor(
        c.env,
        c.req.header("idempotency-key"),
        describeX402Request(c),
        payer,
    );
}

export async function resumeX402Operation(
    env: CloudflareBindings,
    key: string,
    request: X402Request,
    candidate: PaymentResumeCandidate,
) {
    const payment = await paymentDetailsFromPayload(candidate.paymentPayload);
    const { fingerprint, stub } = await operationContextFor(
        env,
        key,
        request,
        payment.payer,
    );
    const operation = await stub.getGeneratedPaymentOperation(
        fingerprint,
        payment.identity,
        payment.proof,
    );
    if (operation.status !== "generated") return undefined;
    return {
        paymentPayload: candidate.paymentPayload,
        paymentRequirements: candidate.paymentRequirements,
        declaredExtensions: requestDeclaration(request.body),
    };
}

function requestInfo(body: Record<string, unknown>) {
    return {
        model: body.model,
        ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
    };
}

function requestDeclaration(body: Record<string, unknown>) {
    return {
        [WEFT_REQUEST_EXTENSION_KEY]: {
            info: requestInfo(body),
            schema: WEFT_REQUEST_INFO_SCHEMA,
        },
    };
}

export const requireX402Idempotency = createMiddleware<Env>(async (c, next) => {
    if (!c.req.header("idempotency-key")?.trim()) {
        throw new HTTPException(400, {
            message: "A non-empty Idempotency-Key is required for x402",
        });
    }
    await next();
});

function restoredResponse(response: {
    status: number;
    statusText: string;
    headers: string[][];
    body: Uint8Array;
}): Response {
    return new Response(response.body.slice().buffer as ArrayBuffer, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers.map(
            ([name = "", value = ""]) => [name, value] as [string, string],
        ),
    });
}

export const finalX402Operation = createMiddleware<Env>(async (c, next) => {
    const authorization =
        c.req.header("payment-signature") || c.req.header("x-payment");
    if (!authorization) {
        await next();
        return;
    }
    const payment = await paymentDetails(authorization);
    const { fingerprint, stub } = await operationContext(c, payment.payer);
    const existing = await stub.getFinalPaymentOperation(
        fingerprint,
        payment.identity,
        payment.proof,
    );
    if (existing.status === "fingerprint-conflict") {
        return c.text(
            "Idempotency-Key was already used for another request",
            409,
        );
    }
    if (existing.status === "payment-conflict") {
        return c.text(
            "Idempotency-Key was already used with another payment",
            409,
        );
    }
    if (existing.status === "final") return restoredResponse(existing.response);

    await next();
    if (!c.res.ok || !c.res.headers.has("PAYMENT-RESPONSE")) return;
    if (c.res.headers.get("content-type")?.includes("text/event-stream")) {
        const generated = await c.res.arrayBuffer();
        c.res = new Response(
            new Blob([
                generated.slice(0, -X402_STREAM_DONE.length),
                x402StreamReceipt(
                    c.res.headers.get("PAYMENT-RESPONSE") as string,
                ),
            ]),
            c.res,
        );
    }
    const body = new Uint8Array(await c.res.clone().arrayBuffer());
    const saved = await stub.completeFinalPaymentOperation(
        fingerprint,
        payment.identity,
        payment.proof,
        {
            status: c.res.status,
            statusText: c.res.statusText,
            headers: Array.from(c.res.headers.entries()),
            body,
        },
        Date.now() + FINAL_RESPONSE_TTL_MS,
    );
    if (!saved) {
        throw new Error("Settled x402 response could not be persisted");
    }
});

export const runX402Operation = (quote?: X402Quote) =>
    createMiddleware<Env>(async (c, next) => {
        const startTime = new Date();
        const authorization =
            c.req.header("payment-signature") || c.req.header("x-payment");
        if (!authorization) {
            return c.text("Malformed x402 payment identity", 400);
        }
        const payment = await paymentDetails(authorization);
        const { fingerprint, stub } = await operationContext(c, payment.payer);
        const claimId = crypto.randomUUID();
        const start = await stub.startPaymentOperation(
            fingerprint,
            payment.identity,
            payment.proof,
            claimId,
            Date.now() + OPERATION_LEASE_MS,
        );
        if (start.status === "fingerprint-conflict") {
            return c.text(
                "Idempotency-Key was already used for another request",
                409,
            );
        }
        if (start.status === "payment-conflict") {
            return c.text(
                "Idempotency-Key was already used with another payment",
                409,
            );
        }
        if (start.status === "running") {
            return c.text("The idempotent operation is still running", 409);
        }
        if (start.status === "generated") {
            return restoredResponse(start.response);
        }
        if (!quote)
            throw new Error("Verified generated response is unavailable");

        if (c.var.auth) c.var.auth.paymentPayer = payment.payer;

        // Production requests run this inside a coordinator alarm. After an alarm
        // crash the lease prevents an overlapping provider call; it does not claim
        // strict at-most-once execution across a crash before the result is saved.
        await next();
        if (!c.res.ok) return;
        const accounting = await createX402Event(
            c.env,
            describeX402Request(c),
            quote,
            c.res,
            claimId,
            startTime,
        );
        if (quote.scheme === "upto") {
            c.header(
                SETTLEMENT_OVERRIDES_HEADER,
                JSON.stringify({ amount: usdPrice(accounting.totalPrice) }),
            );
        }
        const body = new Uint8Array(await c.res.clone().arrayBuffer());
        if (body.byteLength > MAX_X402_RESPONSE_BYTES) {
            return c.text(
                "Generated response is too large for durable resume",
                502,
            );
        }
        const response: PaymentResponseSnapshot = {
            status: c.res.status,
            statusText: c.res.statusText,
            headers: Array.from(c.res.headers.entries()),
            body,
        };
        if (
            !(await stub.completePaymentOperation(
                fingerprint,
                payment.identity,
                payment.proof,
                claimId,
                response,
                Date.now() + FINAL_RESPONSE_TTL_MS,
                accounting,
            ))
        ) {
            return c.text("Payment operation ownership expired", 503);
        }
    });

function paymentMiddlewareFor(env: CloudflareBindings) {
    const payTo = env.WEFT_PAY_TO as string;
    const configured = env.WEFT_NETWORK || DEFAULT_NETWORK;
    if (!/^[^:]+:[^:]+$/.test(configured)) {
        throw new Error(
            `WEFT_NETWORK must be CAIP-2 (e.g. eip155:8453), got: ${configured}`,
        );
    }
    const network = configured as `${string}:${string}`;
    const paymentMiddleware = weftPaymentMiddlewareHono as unknown as (
        routes: Parameters<typeof weftPaymentMiddlewareHono>[0],
        config: Parameters<typeof weftPaymentMiddlewareHono>[1],
    ) => MiddlewareHandler<Env>;
    // Capture the validated request once. The payment rail does not need to
    // know whether the handler returns chat JSON, image bytes, or audio bytes.
    const pay = createMiddleware<Env>(async (c, next) => {
        const request = describeX402Request(c);
        const signature =
            c.req.header("payment-signature") || c.req.header("x-payment");
        const paymentPayload = signature
            ? paymentFromHeader(signature)
            : undefined;
        // The existing proof binding lets a generated retry reuse its signed
        // terms without consulting history again or storing a separate quote.
        const resumed =
            paymentPayload &&
            (await resumeX402Operation(
                env,
                c.req.header("idempotency-key") ?? "",
                request,
                {
                    paymentPayload,
                    paymentRequirements: paymentPayload.accepted,
                },
            ));
        let quote: X402Quote | undefined;
        let accepts: PaymentOption;
        if (resumed) {
            const terms = resumed.paymentRequirements;
            accepts = {
                ...terms,
                price: {
                    amount: terms.amount,
                    asset: terms.asset,
                    extra: terms.extra,
                },
            };
        } else {
            quote = await quoteX402Request(c.env, request);
            accepts = {
                scheme: quote.scheme,
                network,
                payTo,
                maxTimeoutSeconds: OPERATION_LEASE_MS / 1000,
                price: usdPrice(quote.maximum),
            };
        }
        return paymentMiddleware(
            {
                [`${request.method} *`]: {
                    accepts: [accepts],
                    description:
                        accepts.scheme === "exact"
                            ? "Pollinations generation at the advertised fixed price."
                            : "Pollinations generation, charged for actual usage up to the authorized ceiling.",
                    extensions: {
                        [WEFT_REQUEST_EXTENSION_KEY]: () =>
                            requestInfo(request.body),
                    },
                },
            },
            {
                apiKey: env.WEFT_SELLER_API_KEY,
                facilitator: {
                    url: env.WEFT_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
                },
                name: "Pollinations Generation",
                type: "api",
                tags: ["ai", "inference"],
                schemes: [
                    { network, server: new ExactEvmScheme() },
                    { network, server: new UptoEvmScheme() },
                ],
                resumeVerifiedPayment: async () => resumed || undefined,
            },
        )(c, async () => {
            const response = await runX402Operation(quote)(c, async () => {
                await next();
                if (!c.res.ok) return;
                if (
                    c.res.headers
                        .get("content-type")
                        ?.includes("text/event-stream")
                )
                    c.res = await collectX402Stream(
                        c.res,
                        c.var.x402Execution?.onStream,
                    );
            });
            if (response) c.res = response;
        });
    });

    return pay;
}

const executeDurably = createMiddleware<Env>(async (c, next) => {
    const request = describeX402Request(c);
    const signature =
        c.req.header("payment-signature") || c.req.header("x-payment");
    if (c.var.x402Execution || !signature) return next();
    const payment = await paymentDetails(signature);
    // Different proofs or requests must never join another buyer's waiter.
    const name = await sha256(
        stableStringify({
            request,
            proof: payment.proof,
            key: c.req.header("idempotency-key"),
        }),
    );
    const headers = new Headers({
        "payment-signature": signature,
        "idempotency-key": c.req.header("idempotency-key") as string,
    });
    for (const name of [
        "content-type",
        "accept",
        "user-agent",
        "referer",
        "cf-connecting-ip",
        "x-forwarded-host",
        "x-original-client-ip",
        "x-request-id",
        SAFETY_HEADER_NAME,
    ]) {
        const value = c.req.header(name);
        if (value !== undefined) headers.set(name, value);
    }
    let body: ArrayBuffer | undefined;
    if (request.method === "POST") {
        // Parsing multipart consumes its original boundary. Re-encode the same
        // form with its matching content type before handing it to the alarm.
        if (c.var.formData) {
            const encoded = new Response(c.var.formData);
            headers.set(
                "content-type",
                encoded.headers.get("content-type") as string,
            );
            body = await encoded.arrayBuffer();
        } else {
            body = await c.req.arrayBuffer();
        }
        if (body.byteLength > MAX_X402_RESPONSE_BYTES) {
            throw new HTTPException(413, {
                message: "Request is too large for durable payment execution",
            });
        }
    }
    return c.env.GENERATION_COORDINATOR.getByName(
        `x402-execution:${name}`,
    ).fetch(c.req.url, {
        method: request.method,
        headers,
        body,
    });
});

export type X402Variables = {
    x402Request?: X402Request;
    /** Set internally by the payment coordinator, never by request headers. */
    x402Execution?: {
        onStream: (headers: Headers) => (chunk: Uint8Array) => void;
    };
};

/** Called at the normal cache-miss authorization boundary. */
export const authorizeX402 = createMiddleware<Env>(async (c, next) => {
    if (c.var.auth.paymentPayer) return next();
    return every(requireX402Idempotency, paymentMiddlewareFor(c.env))(c, next);
});

/** Wrap the existing route after its validation/model resolution, before caching. */
export function x402Payment(
    readBody?: (c: Context<Env>) => Promise<Record<string, unknown>>,
): MiddlewareHandler<Env> {
    return async (c, next) => {
        // Presented credentials, including invalid ones, stay on the Pollen rail.
        if (
            !c.env.WEFT_PAY_TO ||
            (c.req.method !== "GET" && c.req.method !== "POST") ||
            c.req.header("authorization") !== undefined ||
            new URL(c.req.url).searchParams.has("key")
        )
            return next();

        const request = describeX402Request(c);
        if (readBody)
            request.body = {
                ...(await readBody(c)),
                model: c.var.model.resolved,
            };
        // Image preparation adds a random seed. Fingerprints must describe the
        // caller's request, not that later, mutable generation state.
        c.set("x402Request", structuredClone(request));
        if (!c.req.header("payment-signature") && !c.req.header("x-payment")) {
            // Public cache hits stay free; a miss calls authorizeX402 instead of Pollen.
            return next();
        }
        // A signed retry checks its private receipt before the public cache.
        await every(
            requireX402Idempotency,
            executeDurably,
            finalX402Operation,
            paymentMiddlewareFor(c.env),
        )(c, next);
        // The generated content is public-cacheable, but a buyer's receipt is not.
        c.header("Cache-Control", "private, no-store");
    };
}
