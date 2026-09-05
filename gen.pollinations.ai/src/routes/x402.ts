/** Anonymous x402 payment rail for bounded generation requests. */

import { handleError } from "@shared/error.ts";
import { requestId } from "@shared/middleware/request-id.ts";
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
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import {
    type PaymentResumeCandidate,
    WEFT_REQUEST_EXTENSION_KEY,
    WEFT_REQUEST_INFO_SCHEMA,
    weftPaymentMiddlewareHono,
} from "@weft-labs/sdk/facilitator/middleware";
import {
    decodePaymentSignatureHeader,
    SETTLEMENT_OVERRIDES_HEADER,
} from "@x402/core/http";
import { validatePaymentPayload } from "@x402/core/schemas";
import type { PaymentPayload } from "@x402/core/types";
import { isUptoPermit2Payload } from "@x402/evm";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import stableStringify from "fast-json-stable-stringify";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { prepareGenerationRequest } from "@/middleware/generation-cache.ts";
import { logger } from "@/middleware/logger.ts";
import { resolveModel } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import type { PaymentResponseSnapshot } from "../durable-objects/GenerationCoordinator.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import {
    collectX402Stream,
    MAX_X402_RESPONSE_BYTES,
    X402_STREAM_DONE,
    x402StreamReceipt,
} from "../utils/x402-stream.ts";
import { CreateSpeechRequestSchema, handleSpeech } from "./audio.ts";
import {
    generateChatCompletion,
    generateImageVideo,
    generateTextContent,
    textBodyLimit,
} from "./generation-handlers.ts";
import {
    formatOpenAIImageGeneration,
    handleImageGeneration,
    prepareOpenAIImageGeneration,
} from "./images.ts";

const ROUTE = "/v1/chat/completions";
const DEFAULT_FACILITATOR_URL = "https://x402.weft.network";
const DEFAULT_NETWORK = "eip155:84532";
const MIN_CHARGE_USD = 0.001;
const MAX_X402_OUTPUT_TOKENS = 4096;
const FINAL_RESPONSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// An alarm can run for 15 minutes. Never replace its owner while the previous
// invocation could still be generating or settling.
const OPERATION_LEASE_MS = 16 * 60 * 1000;
const AnonymousX402RequestSchema = CreateChatCompletionRequestSchema.strict();
export type X402Request = {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
};

export type X402Quote = {
    model: string;
    maximum: number;
    usage: Usage;
};
const X402_USAGE_TYPES = new Set<keyof Usage>([
    "promptTextTokens",
    "promptCachedTokens",
    "completionTextTokens",
]);
// completionAudioTokens means characters/UTF-8 bytes for these handlers,
// but means a whole generation or output tokens for other audio models.
const CHARACTER_BILLED_SPEECH = new Set([
    "elevenlabs",
    "elevenflash",
    "eleven-multilingual-v2",
    "eleven-dialogue",
    "grok-tts",
    "fish-audio-s2.1-pro",
    "qwen-tts",
    "qwen-tts-instruct",
    "csm-1b",
    "kokoro",
]);

function normalizedUsd(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Invalid x402 price");
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
    if (!entry) {
        throw new HTTPException(400, {
            message: `Invalid model: "${model}"`,
        });
    }
    return entry;
}

export async function quoteX402Request(
    env: CloudflareBindings,
    request: X402Request,
): Promise<X402Quote> {
    const entry = await modelEntry(env, request.body.model as string);
    const { definition } = entry;
    const unsupported = () => {
        throw new HTTPException(400, {
            message:
                "This request has no supported x402 spending ceiling; use a Pollinations API key.",
        });
    };
    if (
        entry.communityEndpoint ||
        definition.search ||
        definition.billing?.adjustments?.length
    )
        unsupported();
    let usage: Usage;
    if (entry.eventType === "generate.text") {
        const body = AnonymousX402RequestSchema.parse(request.body);
        validateChatShape(body);
        if (!supportsX402Rates(definition)) unsupported();
        usage = conservativeUsage(body);
    } else {
        // A usage bucket alone does not specify its unit. Only these existing
        // contracts are bounded here: one image and character-billed speech.
        // Variant-priced and duration/token-priced media need their own bounds.
        if (definition.costVariants || definition.selectCostVariant)
            unsupported();
        if (definition.category === "image") {
            if (request.body.response_format === "url") {
                throw new HTTPException(400, {
                    message:
                        "x402 images require response_format: b64_json; a public URL would require a separate request.",
                });
            }
            usage = { completionImageTokens: 1 };
        } else if (
            entry.eventType === "generate.audio" &&
            definition.outputModalities?.includes("audio") &&
            CHARACTER_BILLED_SPEECH.has(entry.id)
        ) {
            const body = CreateSpeechRequestSchema.strict().parse(request.body);
            if (
                body.reference_audio ||
                body.composition_plan ||
                body.conditioning_ref
            )
                unsupported();
            usage = {
                completionAudioTokens: new TextEncoder().encode(body.input)
                    .length,
            };
        } else {
            return unsupported();
        }
        const rates = Object.entries(definition.cost).filter(
            ([, rate]) => (rate ?? 0) > 0,
        );
        if (!rates.length || rates.some(([unit]) => !(unit in usage)))
            unsupported();
    }
    const maximumCost = { ...definition.cost };
    for (const variant of Object.values(definition.costVariants ?? {})) {
        for (const [unit, rate] of Object.entries(variant)) {
            const usageType = unit as keyof Usage;
            maximumCost[usageType] = Math.max(
                maximumCost[usageType] ?? 0,
                rate ?? 0,
            );
        }
    }
    const maximum = normalizedUsd(
        calculatePriceForModelDefinition(
            entry.id,
            usage,
            {
                ...definition,
                cost: maximumCost,
                costVariants: undefined,
                selectCostVariant: undefined,
            },
            undefined,
            undefined,
        ).totalPrice,
    );
    return { model: entry.id, maximum, usage };
}

function parseUsage(headers: Headers, quote: X402Quote): Usage {
    if (headers.get(USAGE_MISSING_HEADER) === "true") {
        throw new Error("Model usage headers are missing");
    }
    if (
        quote.usage.promptTextTokens !== undefined &&
        !headers.has(USAGE_TYPE_HEADERS.promptTextTokens) &&
        !headers.has(USAGE_TYPE_HEADERS.promptCachedTokens)
    ) {
        throw new Error("Missing prompt usage header");
    }
    for (const unit of Object.keys(quote.usage) as (keyof Usage)[]) {
        if (unit === "promptTextTokens") continue;
        if (!headers.has(USAGE_TYPE_HEADERS[unit])) {
            throw new Error(`Missing ${unit} usage header`);
        }
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
    quote: X402Quote,
    headers: Headers,
): Promise<number> {
    const usedModel = headers.get(MODEL_USED_HEADER);
    if (!usedModel) throw new Error("Model usage headers are missing");
    await modelEntry(env, usedModel);

    // Pollen prices fallbacks against the requested listing. Keep that same
    // quoted-model contract here; the served-model header is still required as
    // evidence that generation produced metered usage.
    const quoted = await modelEntry(env, quote.model);
    const actual = normalizedUsd(
        calculatePriceForModelDefinition(
            quoted.id,
            parseUsage(headers, quote),
            quoted.definition,
            undefined,
            undefined,
        ).totalPrice,
    );
    if (actual > quote.maximum) {
        throw new Error("Actual usage exceeds the authorized maximum");
    }
    return actual;
}

function validateChatShape(body: CreateChatCompletionRequest) {
    const reject = (message: string): never => {
        throw new HTTPException(400, { message });
    };
    if (!Number.isSafeInteger(body.max_tokens) || (body.max_tokens ?? 0) <= 0) {
        reject("x402 requires a positive max_tokens cap");
    }
    if ((body.max_tokens ?? 0) > MAX_X402_OUTPUT_TOKENS) {
        reject(`x402 max_tokens cannot exceed ${MAX_X402_OUTPUT_TOKENS}`);
    }
    if (
        body.messages.some(
            (message) => !message || Array.isArray(message.content),
        )
    ) {
        reject("Multimodal input is not supported with x402");
    }
    if (
        body.web_search_options ||
        body.modalities ||
        body.audio ||
        body.reasoning_effort
    ) {
        reject(
            "Search, audio, and explicit reasoning are not supported with x402",
        );
    }
}

function paymentFromHeader(value: string): PaymentPayload {
    let payment: PaymentPayload;
    try {
        payment = decodePaymentSignatureHeader(value);
        validatePaymentPayload(payment);
    } catch {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }
    return payment;
}

function parsePaymentIdentity(payment: PaymentPayload) {
    const payload = payment.payload;
    if (
        payment.x402Version !== 2 ||
        payment.accepted.scheme !== "upto" ||
        !isUptoPermit2Payload(payload)
    ) {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }

    const { network } = payment.accepted;
    const { from, nonce, spender } = payload.permit2Authorization;
    if (
        !/^[^:]+:[^:]+$/.test(network) ||
        !/^0x[0-9a-fA-F]{40}$/.test(from) ||
        !/^0x[0-9a-fA-F]{40}$/.test(spender)
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
    if (canonicalNonce < 0n || canonicalNonce >= 1n << 256n) {
        throw new HTTPException(400, {
            message: "Malformed x402 Permit2 authorization identity",
        });
    }
    return {
        permit2Authorization: payload.permit2Authorization,
        canonicalNonce,
    };
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
    const { permit2Authorization, canonicalNonce } =
        parsePaymentIdentity(payment);
    const { network } = payment.accepted;
    const { from, spender } = permit2Authorization;
    const payer = `${network.toLowerCase()}|${from.toLowerCase()}`;
    return {
        payer,
        identity: `${payer}|${spender.toLowerCase()}|${canonicalNonce}`,
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
    if (describeX402Request(c).body.stream) {
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

    if (c.var.auth) c.var.auth.paymentPayer = payment.payer;

    // Production requests run this inside a coordinator alarm. After an alarm
    // crash the lease prevents an overlapping provider call; it does not claim
    // strict at-most-once execution across a crash before the result is saved.
    await next();
    if (!c.res.ok) return;
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

export function createAnonymousX402Routes(
    env: CloudflareBindings,
    detached = false,
    onStream?: (headers: Headers) => (chunk: Uint8Array) => void,
) {
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
    // Capture the validated request once. The payment rail does not need to
    // know whether the handler returns chat JSON, image bytes, or audio bytes.
    const pay = createMiddleware<Env>(async (c, next) => {
        const request = describeX402Request(c);
        const quote = await quoteX402Request(c.env, request);
        return paymentMiddleware(
            {
                [`${request.method} *`]: {
                    accepts: [
                        {
                            scheme: "upto",
                            network,
                            payTo,
                            maxTimeoutSeconds: OPERATION_LEASE_MS / 1000,
                            price: usdPrice(quote.maximum),
                        },
                    ],
                    description:
                        "Pollinations generation, charged for actual usage up to the authorized ceiling.",
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
                schemes: [{ network, server: new UptoEvmScheme() }],
                resumeVerifiedPayment: async (_context, candidate) =>
                    resumeX402Operation(
                        env,
                        c.req.header("idempotency-key") ?? "",
                        request,
                        candidate,
                    ),
            },
        )(c, async () => {
            const response = await runX402Operation(c, async () => {
                await next();
                if (!c.res.ok) return;
                if (request.body.stream)
                    c.res = await collectX402Stream(c.res, onStream);
                c.header(
                    SETTLEMENT_OVERRIDES_HEADER,
                    JSON.stringify({
                        amount: usdPrice(
                            await priceActualUsage(c.env, quote, c.res.headers),
                        ),
                    }),
                );
            });
            if (response) c.res = response;
        });
    });

    const executeDurably = createMiddleware<Env>(async (c, next) => {
        const request = describeX402Request(c);
        await quoteX402Request(c.env, request);
        const signature =
            c.req.header("payment-signature") || c.req.header("x-payment");
        if (detached || !signature) return next();
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
            "accept",
            "user-agent",
            "referer",
            "cf-connecting-ip",
            "x-request-id",
            SAFETY_HEADER_NAME,
        ]) {
            const value = c.req.header(name);
            if (value !== undefined) headers.set(name, value);
        }
        if (request.method === "POST")
            headers.set("content-type", "application/json");
        return c.env.GENERATION_COORDINATOR.getByName(
            `x402-execution:${name}`,
        ).fetch(c.req.url, {
            method: request.method,
            headers,
            ...(request.method === "POST" && {
                body: JSON.stringify(request.body),
            }),
        });
    });

    for (const path of [
        ROUTE,
        "/text",
        "/image/*",
        "/v1/images/generations",
        "/v1/audio/speech",
    ]) {
        app.use(
            path,
            requestId(),
            logger,
            edgeRateLimit,
            textBodyLimit,
            anonymousAuth(),
        );
    }
    const payment = [
        requireX402Idempotency,
        executeDurably,
        finalX402Operation,
        pay,
    ] as const;
    app.post(
        ROUTE,
        validator("json", AnonymousX402RequestSchema),
        resolveModel("generate.text"),
        ...payment,
        track("generate.text"),
        generateChatCompletion,
    );
    app.post(
        "/text",
        validator("json", AnonymousX402RequestSchema),
        resolveModel("generate.text"),
        ...payment,
        track("generate.text"),
        generateTextContent,
    );
    app.get(
        "/image/:prompt{[\\s\\S]+}",
        validator("param", z.object({ prompt: z.string().min(1) })),
        validator("query", GenerateImageRequestQueryParamsSchema),
        resolveModel("generate.image"),
        ...payment,
        track("generate.image"),
        generateImageVideo,
    );
    app.use(
        "/v1/images/generations",
        validator("json", CreateImageRequestSchema.strict()),
        resolveModel("generate.image"),
        ...payment,
        track("generate.image"),
    );
    app.post(
        "/v1/images/generations",
        prepareOpenAIImageGeneration,
        formatOpenAIImageGeneration,
        prepareGenerationRequest,
        handleImageGeneration,
    );
    app.post(
        "/v1/audio/speech",
        validator("json", CreateSpeechRequestSchema.strict()),
        resolveModel("generate.audio", {
            supportedEndpoint: "/v1/audio/speech",
        }),
        ...payment,
        track("generate.audio"),
        handleSpeech,
    );
    return app;
}

let cached: { key: string; app: Hono<Env> } | undefined;

export function createX402Fallback(): MiddlewareHandler<Env> {
    return async (c, next) => {
        // Any presented Pollinations credential, valid or invalid, stays on the
        // existing auth and Pollen pipeline. Only truly anonymous calls fall
        // back to x402.
        const supported =
            c.req.method === "POST"
                ? [
                      ROUTE,
                      "/text",
                      "/v1/images/generations",
                      "/v1/audio/speech",
                  ].includes(c.req.path)
                : c.req.method === "GET" &&
                  c.req.path.startsWith("/image/") &&
                  c.req.path !== "/image/models";
        if (!supported) return next();
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

export const x402Routes = new Hono<Env>().use("*", createX402Fallback());
