/** Anonymous x402 fallback for the existing OpenAI chat-completions route. */

import { handleError } from "@shared/error.ts";
import { validator } from "@shared/middleware/validator.ts";
import {
    calculatePriceForModelDefinition,
    type ModelDefinition,
    type Usage,
} from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    USAGE_MISSING_HEADER,
    USAGE_TYPE_HEADERS,
} from "@shared/registry/usage-headers.ts";
import {
    type CreateChatCompletionRequest,
    CreateChatCompletionRequestSchema,
} from "@shared/schemas/openai.ts";
import {
    WEFT_REQUEST_EXTENSION_KEY,
    WEFT_REQUEST_INFO_SCHEMA,
    weftPaymentMiddlewareHono,
} from "@weft-labs/sdk/facilitator/middleware";
import {
    decodePaymentSignatureHeader,
    type HTTPRequestContext,
    SETTLEMENT_OVERRIDES_HEADER,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import stableStringify from "fast-json-stable-stringify";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { resolveModel } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import type { PaymentResponseSnapshot } from "../durable-objects/GenerationCoordinator.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import {
    generateChatCompletion,
    textBodyLimit,
} from "./generation-handlers.ts";

const ROUTE = "/v1/chat/completions";
const DEFAULT_FACILITATOR_URL = "https://x402.weft.network";
const DEFAULT_NETWORK = "eip155:84532";
const MIN_CHARGE_USD = 0.001;
const MAX_X402_OUTPUT_TOKENS = 4096;
const MAX_STORED_RESPONSE_BYTES = 20 * 1024 * 1024;
const FINAL_RESPONSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Exceeds the public 300-second generation lifetime. A crashed owner cannot be
// replaced while provider work may still be running.
const OPERATION_LEASE_MS = 6 * 60 * 1000;
const AnonymousX402RequestSchema = CreateChatCompletionRequestSchema.strict();
const X402_USAGE_TYPES = new Set<keyof Usage>([
    "promptTextTokens",
    "promptCachedTokens",
    "completionTextTokens",
]);

function normalizedUsd(amount: number): number {
    return Math.max(
        MIN_CHARGE_USD,
        Math.ceil((amount - Number.EPSILON) * 1_000_000) / 1_000_000,
    );
}

function usdPrice(amount: number): string {
    return `$${normalizedUsd(amount).toFixed(6)}`;
}

function conservativeUsage(body: CreateChatCompletionRequest): Usage {
    // A token cannot contain less than one UTF-8 byte. Request bytes are a
    // conservative upper bound for the supported prompt-text bucket.
    const promptBytes = new TextEncoder().encode(JSON.stringify(body)).length;
    const outputCap = body.max_tokens as number;
    return {
        promptTextTokens: promptBytes,
        completionTextTokens: outputCap,
    };
}

function supportsX402Rates(definition: ModelDefinition): boolean {
    const sheets = [
        definition.cost,
        ...Object.values(definition.costVariants ?? {}).map((variant) => ({
            ...definition.cost,
            ...variant,
        })),
    ];
    return sheets.every((rates) => {
        const promptRate = rates.promptTextTokens ?? 0;
        return (
            promptRate > 0 &&
            (rates.completionTextTokens ?? 0) > 0 &&
            (rates.promptCachedTokens ?? 0) <= promptRate &&
            Object.entries(rates).every(
                ([usageType, rate]) =>
                    (rate ?? 0) <= 0 ||
                    X402_USAGE_TYPES.has(usageType as keyof Usage),
            )
        );
    });
}

async function modelEntry(env: CloudflareBindings, model: string) {
    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(model);
    if (!entry || entry.eventType !== "generate.text") {
        throw new HTTPException(400, {
            message: `Invalid text model: "${model}"`,
        });
    }
    return entry;
}

async function maximumPrice(
    env: CloudflareBindings,
    body: CreateChatCompletionRequest,
): Promise<number> {
    const entry = await modelEntry(env, body.model);
    return normalizedUsd(
        calculatePriceForModelDefinition(
            entry.id,
            conservativeUsage(body),
            entry.definition,
            undefined,
            undefined,
        ).totalPrice,
    );
}

function parseUsage(headers: Headers): Usage {
    if (headers.get(USAGE_MISSING_HEADER) === "true") {
        throw new Error("Model usage headers are missing");
    }
    if (
        !headers.has(USAGE_TYPE_HEADERS.promptTextTokens) &&
        !headers.has(USAGE_TYPE_HEADERS.promptCachedTokens)
    ) {
        throw new Error("Missing prompt usage header");
    }
    if (!headers.has(USAGE_TYPE_HEADERS.completionTextTokens)) {
        throw new Error("Missing completion usage header");
    }

    const usage: Usage = {};
    let found = false;
    for (const [usageType, header] of Object.entries(USAGE_TYPE_HEADERS)) {
        const raw = headers.get(header);
        if (raw === null) continue;
        found = true;
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Invalid usage header: ${header}`);
        }
        usage[usageType as keyof Usage] = value;
    }
    if (!found) throw new Error("Model usage headers are missing");
    return usage;
}

export async function priceActualUsage(
    env: CloudflareBindings,
    body: CreateChatCompletionRequest,
    headers: Headers,
): Promise<number> {
    const usedModel = headers.get(MODEL_USED_HEADER);
    if (!usedModel) throw new Error("Model usage headers are missing");
    await modelEntry(env, usedModel);

    // Pollen prices fallbacks against the requested listing. Keep that same
    // quoted-model contract here; the served-model header is still required as
    // evidence that generation produced metered usage.
    const quoted = await modelEntry(env, body.model);
    if (!supportsX402Rates(quoted.definition)) {
        throw new Error("Model uses unsupported x402 billing buckets");
    }
    const actual = normalizedUsd(
        calculatePriceForModelDefinition(
            quoted.id,
            parseUsage(headers),
            quoted.definition,
            undefined,
            undefined,
        ).totalPrice,
    );
    if (actual > (await maximumPrice(env, body))) {
        throw new Error("Actual usage exceeds the authorized maximum");
    }
    return actual;
}

const validateAnonymousShape = createMiddleware<Env>(async (c, next) => {
    const body = c.req.valid("json" as never) as CreateChatCompletionRequest;
    if (!Number.isSafeInteger(body.max_tokens) || (body.max_tokens ?? 0) <= 0) {
        return c.json(
            { error: "x402 requires a positive max_tokens cap" },
            400,
        );
    }
    if ((body.max_tokens ?? 0) > MAX_X402_OUTPUT_TOKENS) {
        return c.json(
            {
                error: `x402 max_tokens cannot exceed ${MAX_X402_OUTPUT_TOKENS}`,
            },
            400,
        );
    }
    if (body.stream) {
        return c.json({ error: "Streaming is not supported with x402" }, 400);
    }
    if (
        body.messages.some(
            (message) => !message || Array.isArray(message.content),
        )
    ) {
        return c.json(
            { error: "Multimodal input is not supported with x402" },
            400,
        );
    }
    if (
        body.web_search_options ||
        body.modalities ||
        body.audio ||
        body.reasoning_effort
    ) {
        return c.json(
            {
                error: "Search, audio, and explicit reasoning are not supported with x402",
            },
            400,
        );
    }
    const entry = await modelEntry(c.env, body.model);
    if (
        entry.definition.search ||
        entry.definition.billing?.adjustments?.length ||
        !supportsX402Rates(entry.definition)
    ) {
        return c.json(
            {
                error: "Models with unsupported billing buckets are not supported with x402",
            },
            400,
        );
    }
    await next();
});

type ResumablePaymentPayload = PaymentPayload & {
    x402Version: 2;
    accepted: PaymentRequirements & { network: string };
    payload: Record<string, unknown> & {
        permit2Authorization: {
            from: string;
            nonce: string;
            spender: string;
        };
    };
    extensions?: Record<string, unknown>;
};

function decodePayment(value: string): ResumablePaymentPayload {
    let payment: PaymentPayload;
    try {
        payment = decodePaymentSignatureHeader(value);
    } catch {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }
    const envelope = payment as PaymentPayload & {
        x402Version?: unknown;
        accepted?: { scheme?: unknown; network?: unknown };
        payload?: {
            permit2Authorization?: {
                from?: unknown;
                nonce?: unknown;
                spender?: unknown;
            };
        };
    };
    const network = envelope.accepted?.network;
    const from = envelope.payload?.permit2Authorization?.from;
    const nonce = envelope.payload?.permit2Authorization?.nonce;
    const spender = envelope.payload?.permit2Authorization?.spender;
    if (
        envelope.x402Version !== 2 ||
        envelope.accepted?.scheme !== "upto" ||
        typeof network !== "string" ||
        !/^[^:]+:[^:]+$/.test(network) ||
        typeof from !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(from) ||
        typeof spender !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(spender) ||
        typeof nonce !== "string" ||
        !/^\d+$/.test(nonce)
    ) {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }
    let canonicalNonce: bigint;
    try {
        canonicalNonce = BigInt(nonce);
    } catch {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }
    if (canonicalNonce >= 1n << 256n) {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }
    return payment as ResumablePaymentPayload;
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
    const payment = decodePayment(value);
    const { network } = payment.accepted;
    const { from, nonce, spender } = payment.payload.permit2Authorization;
    const payer = `${network.toLowerCase()}|${from.toLowerCase()}`;
    return {
        payment,
        payer,
        identity: `${payer}|${spender.toLowerCase()}|${BigInt(nonce)}`,
        proof: await sha256(stableStringify(payment)),
    };
}

async function operationContextFor(
    env: CloudflareBindings,
    keyValue: string | undefined,
    body: CreateChatCompletionRequest,
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
    const fingerprint = await sha256(stableStringify(body));
    const operationName = await sha256(`${ROUTE}|${payer}|${key}`);
    return {
        fingerprint,
        stub: env.GENERATION_COORDINATOR.getByName(
            `x402-operation:${operationName}`,
        ),
    };
}

async function operationContext(c: Context<Env>, payer: string) {
    return operationContextFor(
        c.env,
        c.req.header("idempotency-key"),
        c.req.valid("json" as never) as CreateChatCompletionRequest,
        payer,
    );
}

export async function resumeX402Operation(
    env: CloudflareBindings,
    key: string,
    body: unknown,
    authorization: string,
) {
    const validated = AnonymousX402RequestSchema.parse(body);
    const payment = await paymentDetails(authorization);
    const { fingerprint, stub } = await operationContextFor(
        env,
        key,
        validated,
        payment.payer,
    );
    const operation = await stub.getGeneratedPaymentOperation(
        fingerprint,
        payment.identity,
        payment.proof,
    );
    if (operation.status !== "generated") return undefined;
    return {
        paymentPayload: payment.payment,
        paymentRequirements: payment.payment.accepted,
        declaredExtensions: requestDeclaration(validated),
    };
}

function requestInfo(body: CreateChatCompletionRequest) {
    return { model: body.model, max_tokens: body.max_tokens };
}

function requestDeclaration(body: CreateChatCompletionRequest) {
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
    const body = new Uint8Array(await c.res.clone().arrayBuffer());
    if (body.byteLength > MAX_STORED_RESPONSE_BYTES) return;
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

export const runX402Operation = createMiddleware<Env>(async (c, next) => {
    const authorization =
        c.req.header("payment-signature") || c.req.header("x-payment");
    if (!authorization) {
        return c.text("Malformed x402 Permit2 authorization identity", 400);
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

    // The provider call still runs in this Worker request, not inside the DO.
    // A Worker crash can leave upstream work running; after the lease exceeds
    // the public generation lifetime, a retry may repeat that rare operation.
    // This is durable resume, not a claim of strict at-most-once execution.
    await next();
    if (!c.res.ok) return;
    const body = new Uint8Array(await c.res.clone().arrayBuffer());
    if (body.byteLength > MAX_STORED_RESPONSE_BYTES) {
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
        ))
    ) {
        return c.text("Payment operation ownership expired", 503);
    }
});

function anonymousAuth(): MiddlewareHandler<Env> {
    return async (c, next) => {
        c.set("auth", {
            requireUser: () => {
                throw new HTTPException(401, {
                    message:
                        "This model requires a Pollinations account and is not available with x402.",
                });
            },
            requireModelAccess: () => {},
        });
        await next();
    };
}

export function createAnonymousX402Routes(env: CloudflareBindings) {
    const app = new Hono<Env>();
    app.onError(handleError);
    const payTo = env.WEFT_PAY_TO;
    if (!payTo) return app;

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
    const validatedBody = async (context: HTTPRequestContext) =>
        AnonymousX402RequestSchema.parse(await context.adapter.getBody?.());

    app.use(ROUTE, edgeRateLimit);
    app.use(ROUTE, textBodyLimit);
    app.use(ROUTE, validator("json", AnonymousX402RequestSchema));
    app.use(ROUTE, anonymousAuth());
    app.use(ROUTE, resolveModel("generate.text"));
    app.use(ROUTE, validateAnonymousShape);
    app.use(ROUTE, requireX402Idempotency);
    app.use(ROUTE, finalX402Operation);
    app.use(
        ROUTE,
        paymentMiddleware(
            {
                [`POST ${ROUTE}`]: {
                    accepts: [
                        {
                            scheme: "upto",
                            network,
                            payTo,
                            maxTimeoutSeconds: 360,
                            price: async (context) =>
                                usdPrice(
                                    await maximumPrice(
                                        env,
                                        await validatedBody(context),
                                    ),
                                ),
                        },
                    ],
                    description:
                        "OpenAI-compatible chat completions, priced per token.",
                    extensions: {
                        [WEFT_REQUEST_EXTENSION_KEY]: async (
                            context: HTTPRequestContext,
                        ) => requestInfo(await validatedBody(context)),
                    },
                },
            },
            {
                apiKey: env.WEFT_SELLER_API_KEY,
                facilitator: {
                    url: env.WEFT_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
                },
                name: "Pollinations Text Generation",
                type: "api",
                tags: ["ai", "llm", "inference"],
                schemes: [{ network, server: new UptoEvmScheme() }],
                resumeVerifiedPayment: async (context) =>
                    resumeX402Operation(
                        env,
                        context.adapter.getHeader("idempotency-key") ?? "",
                        await context.adapter.getBody?.(),
                        context.paymentHeader as string,
                    ),
            },
        ),
    );
    app.use(ROUTE, runX402Operation);
    app.use(ROUTE, async (c, next) => {
        await next();
        if (!c.res.ok) return;
        const body = c.req.valid(
            "json" as never,
        ) as CreateChatCompletionRequest;
        c.header(
            SETTLEMENT_OVERRIDES_HEADER,
            JSON.stringify({
                amount: usdPrice(
                    await priceActualUsage(c.env, body, c.res.headers),
                ),
            }),
        );
    });
    app.use(ROUTE, track("generate.text"));
    app.post(ROUTE, generateChatCompletion);
    return app;
}

let cached: { key: string; app: Hono<Env> } | undefined;

export function createX402Fallback(): MiddlewareHandler<Env> {
    return async (c, next) => {
        // Any presented Pollinations credential, valid or invalid, stays on the
        // existing auth and Pollen pipeline. Only truly anonymous calls fall
        // back to x402.
        if (c.req.method !== "POST") return next();
        const url = new URL(c.req.url);
        if (
            c.req.header("authorization") !== undefined ||
            url.searchParams.has("key")
        ) {
            return next();
        }
        if (!c.env.WEFT_PAY_TO) return next();

        const key = [
            c.env.WEFT_PAY_TO,
            c.env.WEFT_NETWORK,
            c.env.WEFT_FACILITATOR_URL,
            c.env.WEFT_SELLER_API_KEY ? "keyed" : "anon",
        ].join("|");
        if (!cached || cached.key !== key) {
            cached = { key, app: createAnonymousX402Routes(c.env) };
        }
        return cached.app.fetch(c.req.raw, c.env, c.executionCtx);
    };
}

export const x402Routes = new Hono<Env>().use(ROUTE, createX402Fallback());
