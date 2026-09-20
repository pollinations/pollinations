import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import {
    calculateUsageBilling,
    getRegistryModelDefinition,
    type UsageType,
} from "@shared/registry/registry.ts";
import { calculateUsagePriceCeiling } from "@shared/registry/usage-ceiling.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { test } from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import {
    type PaymentResumeCandidate,
    WEFT_REQUEST_EXTENSION_KEY,
    WEFT_REQUEST_INFO_SCHEMA,
} from "@weftlabs/sdk/facilitator/middleware";
import type { PaymentPayload } from "@x402/core/types";
import { Hono } from "hono";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { app as generationRoutes } from "../src/index.ts";
import { getGenerationModelRegistry } from "../src/model-registry.ts";
import { quoteGenerationRequest } from "../src/utils/request-pricing.ts";
import {
    prepareMetadata,
    generateCacheKey as textCacheKey,
} from "../src/utils/text-cache.ts";
import { createX402Event } from "../src/x402/accounting.ts";
import { executeX402Request } from "../src/x402/execution.ts";
import {
    finalX402Operation,
    requireX402Idempotency,
    resumeX402Operation as resumeOperation,
    runX402Operation,
    x402Payment,
} from "../src/x402/payment.ts";
import {
    quoteX402Request,
    priceActualUsage as settleActualUsage,
} from "../src/x402/pricing.ts";
import { X402_STREAM_DONE } from "../src/x402/stream.ts";

const ROUTE = "/v1/chat/completions";
const PAY_TO = "0x000000000000000000000000000000000000dEaD";
const x402Env = { ...env, WEFT_PAY_TO: PAY_TO, WEFT_NETWORK: "eip155:84532" };
const tinybird = createMockTinybird();

beforeEach(() => {
    tinybird.reset();
    const fetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        const handler = tinybird.handlerMap[url.host];
        return handler ? handler(new Request(input, init)) : fetch(input, init);
    });
});
afterEach(() => vi.restoreAllMocks());

const generationApp = {
    async request(
        path: string,
        init: RequestInit = {},
        bindings: CloudflareBindings = x402Env,
    ) {
        const ctx = createExecutionContext();
        const response = await generationRoutes.request(
            path,
            init,
            bindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        return response;
    },
};

const chatRequest = (body: unknown) => ({
    method: "POST",
    path: ROUTE,
    headers: {},
    body: CreateChatCompletionRequestSchema.parse(body),
});
const priceActualUsage = async (
    bindings: CloudflareBindings,
    body: CreateChatCompletionRequest,
    headers: Headers,
) =>
    await settleActualUsage(
        bindings,
        await quoteX402Request(bindings, chatRequest(body)),
        headers,
    );
const resumeX402Operation = (
    bindings: CloudflareBindings,
    key: string,
    body: unknown,
    candidate: PaymentResumeCandidate,
) => resumeOperation(bindings, key, chatRequest(body), candidate);

async function challenge(
    body: unknown,
    bindings: CloudflareBindings = x402Env,
) {
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(body),
        },
        bindings,
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toContain("application/json");
    const header = response.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    return JSON.parse(atob(header as string));
}

const usd = (accepts: { amount: string }) => Number(accepts.amount) / 1e6;

test.each([
    ["promptTextTokens", 100],
    ["completionImageTokens", 2],
    ["completionAudioTokens", 100],
    ["promptAudioSeconds", 2.5],
    ["completionAudioSeconds", 3.5],
    ["completionVideoSeconds", 4.5],
] satisfies [
    UsageType,
    number,
][])("the shared price ceiling handles %s without an endpoint or payment rail", (unit, maximum) => {
    const definition = {
        ...getRegistryModelDefinition("black-forest-labs/flux.1-schnell"),
        cost: { [unit]: 0.01 },
        priceMultiplier: 1.5,
    };
    const ceiling = calculateUsagePriceCeiling("test-model", definition, [
        { units: [unit], maximum },
    ]);
    expect(ceiling).toBeCloseTo(maximum * 0.01 * 1.5, 8);
    for (const amount of [0, maximum / 2, maximum]) {
        const actual = calculateUsageBilling({
            model: "test-model",
            servedBy: definition,
            usage: { [unit]: amount },
        }).price.totalPrice;
        expect(actual).toBeLessThanOrEqual(ceiling as number);
    }
});

test("a shared prompt cap covers cached usage and every rate variant without double-counting", () => {
    const definition = {
        ...getRegistryModelDefinition("black-forest-labs/flux.1-schnell"),
        cost: {
            promptTextTokens: 0.01,
            promptCachedTokens: 0.002,
            completionTextTokens: 0.02,
        },
        costVariants: {
            expensive: { promptCachedTokens: 0.03, completionTextTokens: 0.04 },
        },
        selectCostVariant: () => "expensive",
        priceMultiplier: 1.5,
    };
    const ceiling = calculateUsagePriceCeiling("test-model", definition, [
        { units: ["promptTextTokens", "promptCachedTokens"], maximum: 100 },
        { units: ["completionTextTokens"], maximum: 10 },
    ]);
    expect(ceiling).toBeCloseTo((100 * 0.03 + 10 * 0.04) * 1.5, 8);
    for (const cached of [0, 40, 100]) {
        const billing = calculateUsageBilling({
            model: "test-model",
            servedBy: definition,
            usage: {
                promptTextTokens: 100 - cached,
                promptCachedTokens: cached,
                completionTextTokens: 10,
            },
        });
        expect(billing.price.totalPrice).toBeLessThanOrEqual(ceiling as number);
    }
});

test("the shared ceiling refuses an unbounded rate, including one introduced by a variant", () => {
    const definition = getRegistryModelDefinition(
        "black-forest-labs/flux.1-schnell",
    );
    for (const rates of [
        { cost: { ...definition.cost, promptImageTokens: 0.01 } },
        { costVariants: { edit: { promptImageTokens: 0.01 } } },
    ]) {
        expect(
            calculateUsagePriceCeiling("flux", { ...definition, ...rates }, [
                { units: ["completionImageTokens"], maximum: 1 },
            ]),
        ).toBeNull();
    }
});

test("output-derived fees cannot be quoted from bounded usage alone", () => {
    expect(
        calculateUsagePriceCeiling(
            "test-model",
            {
                ...getRegistryModelDefinition(
                    "black-forest-labs/flux.1-schnell",
                ),
                billing: {
                    adjustments: [
                        {
                            id: "search",
                            description: "Search",
                            kind: "search",
                            unit: "request",
                            unitCost: 0.01,
                            publicPricing: {
                                label: "Search",
                                quantity: 1,
                                unit: "request",
                            },
                            countUnits: () => {
                                throw new Error("Must not infer future output");
                            },
                        },
                    ],
                },
            },
            [{ units: ["completionImageTokens"], maximum: 1 }],
        ),
    ).toBeNull();
});

test.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
])("the shared ceiling rejects invalid rates and bounds: %s", (value) => {
    const definition = getRegistryModelDefinition(
        "black-forest-labs/flux.1-schnell",
    );
    expect(
        calculateUsagePriceCeiling("flux", definition, [
            { units: ["completionImageTokens"], maximum: value },
        ]),
    ).toBeNull();
    expect(
        calculateUsagePriceCeiling(
            "flux",
            { ...definition, cost: { completionImageTokens: value } },
            [{ units: ["completionImageTokens"], maximum: 1 }],
        ),
    ).toBeNull();
});

test("only x402 adds its payment minimum to a shared generation quote", async () => {
    const registry = await getGenerationModelRegistry(
        x402Env as CloudflareBindings,
    );
    const body = { model: "flux" };
    const entry = registry.resolve("flux");
    if (!entry) throw new Error("Missing image model");
    const cheap = quoteGenerationRequest(
        {
            ...entry,
            definition: {
                ...entry.definition,
                cost: { completionImageTokens: 0.0001 },
                priceMultiplier: 1,
            },
        },
        body,
    );
    expect(cheap?.maximum).toBe(0.0001);
    const generation = quoteGenerationRequest(entry, body);
    if (!generation) throw new Error("Missing image quote");
    const payment = await quoteX402Request(x402Env as CloudflareBindings, {
        method: "GET",
        path: "/image/flower",
        headers: {},
        body,
    });
    expect(payment.maximum).toBe(
        Math.max(
            0.001,
            Math.ceil((generation.maximum - Number.EPSILON) * 1e6) / 1e6,
        ),
    );
    expect(payment.usage).toEqual(generation.usage);
});

test("generation quotes cover higher cached-token rates without inheriting the x402 output cap", async () => {
    const registry = await getGenerationModelRegistry(
        x402Env as CloudflareBindings,
    );
    const entry = registry.resolve("openai");
    if (!entry) throw new Error("Missing text model");
    const body = chatRequest({
        model: "openai",
        max_tokens: 8192,
        messages: [{ role: "user", content: "Hello" }],
    }).body;
    const quote = quoteGenerationRequest(
        {
            ...entry,
            definition: {
                ...entry.definition,
                cost: {
                    promptTextTokens: 0.01,
                    promptCachedTokens: 0.02,
                    completionTextTokens: 0.03,
                },
                costVariants: undefined,
                selectCostVariant: undefined,
                billing: undefined,
                priceMultiplier: 1,
            },
        },
        body,
    );
    const promptBytes = new TextEncoder().encode(JSON.stringify(body)).length;
    expect(quote?.maximum).toBeCloseTo(promptBytes * 0.02 + 8192 * 0.03, 8);
    await expect(
        quoteX402Request(x402Env as CloudflareBindings, chatRequest(body)),
    ).rejects.toThrow("x402 max_tokens cannot exceed 4096");
});

test.each([
    ["GET", "/image/a%20blue%20flower?model=flux", undefined],
    [
        "POST",
        "/v1/images/generations",
        { model: "flux", prompt: "a blue flower", response_format: "b64_json" },
    ],
    ["POST", "/v1/audio/speech", { model: "elevenflash", input: "Hello" }],
    [
        "POST",
        "/text",
        {
            model: "openai",
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 20,
        },
    ],
] as const)("offers a bounded payment on %s %s", async (method, path, body) => {
    const app = generationApp;
    const response = await app.request(
        path,
        {
            method,
            headers: {
                "content-type": "application/json",
                "idempotency-key": crypto.randomUUID(),
            },
            ...(body && { body: JSON.stringify(body) }),
        },
        x402Env,
    );
    expect(response.status).toBe(402);
    const offer = JSON.parse(
        atob(response.headers.get("payment-required") as string),
    );
    expect(offer.accepts[0].scheme).toBe("upto");
    expect(usd(offer.accepts[0])).toBeGreaterThanOrEqual(0.001);
});

test("offers exact payment only when stable history matches the current price", async () => {
    await env.KV.put(
        "model-stats-v3",
        JSON.stringify({
            value: {
                data: [
                    {
                        model: "black-forest-labs/flux.1-schnell",
                        avg_cost_usd: 0.002,
                        min_price_usd: 0.002,
                        max_price_usd: 0.002,
                        price_sample_count: 100,
                    },
                ],
            },
            ttl: 3600,
        }),
        { expirationTtl: 3600 },
    );
    try {
        const response = await generationApp.request(
            "/image/a%20blue%20flower?model=flux",
            {
                headers: { "idempotency-key": crypto.randomUUID() },
            },
        );
        expect(response.status).toBe(402);
        const offer = JSON.parse(
            atob(response.headers.get("payment-required") as string),
        );
        expect(offer.accepts[0].scheme).toBe("exact");
        expect(usd(offer.accepts[0])).toBe(0.002);

        await env.KV.put(
            "model-stats-v3",
            JSON.stringify({
                value: {
                    data: [
                        {
                            model: "black-forest-labs/flux.1-schnell",
                            avg_cost_usd: 0.003,
                            min_price_usd: 0.003,
                            max_price_usd: 0.003,
                            price_sample_count: 100,
                        },
                    ],
                },
                ttl: 3600,
            }),
            { expirationTtl: 3600 },
        );
        const stale = await generationApp.request(
            "/image/a%20blue%20flower?model=flux",
            {
                headers: { "idempotency-key": crypto.randomUUID() },
            },
        );
        const staleOffer = JSON.parse(
            atob(stale.headers.get("payment-required") as string),
        );
        expect(staleOffer.accepts[0].scheme).toBe("upto");
    } finally {
        await env.KV.delete("model-stats-v3");
    }
});

test.each([
    ["GET", "/image/flower?model=veo", undefined],
    ["GET", "/image/flower?model=gptimage", undefined],
    [
        "POST",
        "/v1/images/generations",
        { model: "flux", prompt: "flower", n: 2 },
    ],
    [
        "POST",
        "/v1/audio/speech",
        { model: "elevenmusic", input: "piano", duration: 30 },
    ],
    ["POST", "/v1/audio/speech", { model: "lyria", input: "piano" }],
] as const)("does not advertise an unsupported media ceiling on %s %s", async (method, path, body) => {
    const response = await generationApp.request(
        path,
        {
            method,
            headers: {
                "content-type": "application/json",
                "idempotency-key": crypto.randomUUID(),
            },
            ...(body && { body: JSON.stringify(body) }),
        },
        x402Env,
    );
    expect(response.status).toBe(400);
    expect(response.headers.has("payment-required")).toBe(false);
});

test("prices image and speech usage with the requested model's Pollen rates", async () => {
    const quote = await quoteX402Request(x402Env as CloudflareBindings, {
        method: "GET",
        path: "/image/flower?model=flux",
        headers: {},
        body: { model: "flux" },
    });
    expect(quote.usage).toEqual({ completionImageTokens: 1 });
    expect(
        await settleActualUsage(
            x402Env as CloudflareBindings,
            quote,
            new Headers({
                "x-model-used": "flux",
                "x-usage-completion-image-tokens": "1",
            }),
        ),
    ).toBe(quote.maximum);
    await expect(
        settleActualUsage(
            x402Env as CloudflareBindings,
            quote,
            new Headers({
                "x-model-used": "flux",
                "x-usage-completion-image-tokens": "10000",
            }),
        ),
    ).rejects.toThrow(/authorized maximum/);

    const speech = await quoteX402Request(x402Env as CloudflareBindings, {
        method: "POST",
        path: "/v1/audio/speech",
        headers: {},
        body: { model: "elevenflash", input: "🧶".repeat(100) },
    });
    expect(speech.usage).toEqual({ completionAudioTokens: 400 });
    const actual = await settleActualUsage(
        x402Env as CloudflareBindings,
        speech,
        new Headers({
            "x-model-used": "elevenflash",
            "x-usage-completion-audio-tokens": "200",
        }),
    );
    expect(actual).toBeLessThan(speech.maximum);
});

test.each([
    { seed: 91739 },
    { transparent: true },
    { guidance_scale: 7 },
    { response_format: "url" },
])("uses the normal image contract for %j", async (options) => {
    const response = await generationApp.request("/v1/images/generations", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
            model: "flux",
            prompt: "image options regression",
            ...options,
        }),
    });
    expect(response.status).toBe(402);
    expect(response.headers.has("payment-required")).toBe(true);
});

test.each([
    { n: 2 },
    { prompt: "" },
    { response_format: "invalid" },
])("returns the same image validation errors with either payment rail: %j", async (options) => {
    const init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "flux",
            prompt: "validation parity",
            ...options,
        }),
    };
    const x402 = await generationApp.request("/v1/images/generations", init);
    const pollen = await generationApp.request("/v1/images/generations", init, {
        ...x402Env,
        WEFT_PAY_TO: "",
    });
    expect(x402.status).toBe(400);
    expect(pollen.status).toBe(400);
    const x402Error = await x402.json<{ error: Record<string, unknown> }>();
    const pollenError = await pollen.json<{
        error: Record<string, unknown>;
    }>();
    const { timestamp: _x402Time, ...x402Details } = x402Error.error;
    const { timestamp: _pollenTime, ...pollenDetails } = pollenError.error;
    expect(x402Details).toEqual(pollenDetails);
    expect(x402.headers.has("payment-required")).toBe(false);
});

test("uses the normal multipart speech parser for the payment quote", async () => {
    const body = new FormData();
    body.set("model", "elevenflash");
    body.set("input", "Hello");
    body.set("voice", "alloy");
    const response = await generationApp.request("/v1/audio/speech", {
        method: "POST",
        body,
        headers: { "idempotency-key": crypto.randomUUID() },
    });
    expect(response.status).toBe(402);
    expect(response.headers.has("payment-required")).toBe(true);
});

test("keeps harmless text extensions accepted by the normal validator", async () => {
    const offer = await challenge(
        request({ metadata: { purpose: "regression" } }),
    );
    expect(offer.accepts[0].scheme).toBe("upto");
});

test.each([
    "/models",
    "/image/models",
    "/v1/models",
])("keeps the normal catalog at %s", async (path) => {
    const response = await generationApp.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.has("payment-required")).toBe(false);
});
const request = (
    overrides: Record<string, unknown> = {},
): CreateChatCompletionRequest =>
    ({
        model: "gpt-oss",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
        ...overrides,
    }) as CreateChatCompletionRequest;

function paymentPayload(
    nonce: string,
    extensions: Record<string, unknown> = {},
    from = "0x0000000000000000000000000000000000000002",
    spender = "0x0000000000000000000000000000000000000003",
): PaymentPayload {
    return {
        x402Version: 2,
        accepted: {
            scheme: "upto",
            network: "eip155:84532",
            asset: "0x0000000000000000000000000000000000000001",
            amount: "1000",
            payTo: PAY_TO,
            maxTimeoutSeconds: 60,
            extra: {},
        },
        payload: {
            signature: "0x1234",
            permit2Authorization: {
                from,
                permitted: {
                    token: "0x0000000000000000000000000000000000000001",
                    amount: "1000",
                },
                spender,
                nonce,
                deadline: "9999999999",
                witness: {
                    to: PAY_TO,
                    facilitator: "0x0000000000000000000000000000000000000004",
                    validAfter: "0",
                },
            },
        },
        extensions,
    };
}

function exactPaymentPayload(nonce: `0x${string}`): PaymentPayload {
    return {
        x402Version: 2,
        accepted: {
            scheme: "exact",
            network: "eip155:84532",
            asset: "0x0000000000000000000000000000000000000001",
            amount: "2000",
            payTo: PAY_TO,
            maxTimeoutSeconds: 60,
            extra: {},
        },
        payload: {
            signature: "0x1234",
            authorization: {
                from: "0x0000000000000000000000000000000000000002",
                to: PAY_TO,
                value: "2000",
                validAfter: "0",
                validBefore: "9999999999",
                nonce,
            },
        },
        extensions: {},
    };
}

const paymentCandidate = (
    paymentPayload: PaymentPayload,
): PaymentResumeCandidate => ({
    paymentPayload,
    paymentRequirements: paymentPayload.accepted,
});

const paymentHeader = (payload: unknown, pretty = false) =>
    btoa(JSON.stringify(payload, null, pretty ? 2 : undefined));
const uniqueNonce = () =>
    (
        BigInt(Date.now()) * 10_000_000_000n +
        BigInt(crypto.getRandomValues(new Uint32Array(1))[0])
    ).toString();

function operationApp(
    operationEnv: CloudflareBindings,
    counts: { work: number; payment: number; settlement: number },
    verifier = { consumed: new Set<string>() },
    options: {
        omitFirstReceipt?: boolean;
        rejectConsumed?: boolean;
        settlementBarrier?: number;
    } = {},
) {
    let settlementAttempts = 0;
    let waitingSettlements = 0;
    let releaseSettlements: (() => void) | undefined;
    const settlementsReady = new Promise<void>((resolve) => {
        releaseSettlements = resolve;
    });
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    app.use(ROUTE, validator("json", CreateChatCompletionRequestSchema));
    app.use(ROUTE, requireX402Idempotency);
    app.use(ROUTE, finalX402Operation);
    app.use(ROUTE, async (c, next) => {
        const encoded = c.req.header("payment-signature") as string;
        const nonce = JSON.parse(atob(encoded)).payload.permit2Authorization
            .nonce as string;
        const resumed = await resumeX402Operation(
            operationEnv,
            c.req.header("idempotency-key") as string,
            c.req.valid("json" as never),
            paymentCandidate(JSON.parse(atob(encoded))),
        );
        if (!resumed) {
            counts.payment += 1;
            if (
                options.rejectConsumed !== false &&
                verifier.consumed.has(nonce)
            ) {
                return c.text("Permit2 nonce already consumed", 402);
            }
            verifier.consumed.add(nonce);
        }
        await next();
        if (c.res.ok) {
            if (options.settlementBarrier) {
                waitingSettlements += 1;
                if (waitingSettlements === options.settlementBarrier) {
                    releaseSettlements?.();
                }
                await settlementsReady;
            }
            counts.settlement += 1;
            settlementAttempts += 1;
            if (options.omitFirstReceipt && settlementAttempts === 1) return;
            c.header("PAYMENT-RESPONSE", btoa(JSON.stringify({ nonce })));
        }
    });
    app.use(ROUTE, runX402Operation);
    app.post(ROUTE, (c) => {
        counts.work += 1;
        c.header("x-model-used", "openai/gpt-oss-20b");
        c.header("x-usage-prompt-text-tokens", "10");
        c.header("x-usage-completion-text-tokens", "1");
        if (
            (c.req.valid("json" as never) as CreateChatCompletionRequest).stream
        ) {
            return c.body(`data: {"choices":[]}\n\n${X402_STREAM_DONE}`, 200, {
                "Content-Type": "text/event-stream",
                "Settlement-Overrides": JSON.stringify({ amount: "$0.001" }),
            });
        }
        return c.json({ ok: true }, 200, {
            "Settlement-Overrides": JSON.stringify({ amount: "$0.001" }),
        });
    });
    return {
        request: (
            key: string | undefined,
            body = request(),
            payment = paymentHeader(paymentPayload(uniqueNonce())),
        ) =>
            app.request(
                ROUTE,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Payment-Signature": payment,
                        ...(key && { "Idempotency-Key": key }),
                    },
                    body: JSON.stringify(body),
                },
                operationEnv,
            ),
    };
}

test("anonymous callers get an upto challenge on the existing route", async () => {
    const { accepts, extensions } = await challenge(request());

    expect(accepts.map((item: { scheme: string }) => item.scheme)).toEqual([
        "upto",
    ]);
    expect(accepts[0].payTo).toBe(PAY_TO);
    expect(accepts[0].maxTimeoutSeconds).toBe(960);
    expect(accepts[0].extra.assetTransferMethod).toBe("permit2");
    expect(extensions["weft.request"].info).toEqual({
        model: "openai/gpt-oss-20b",
        max_tokens: 100,
    });
});

test("explicit production settings advertise Base USDC and the configured recipient", async () => {
    const payTo = "0x0000000000000000000000000000000000000007";
    const { accepts } = await challenge(request(), {
        ...x402Env,
        WEFT_FACILITATOR_URL: "https://x402.weft.network",
        WEFT_NETWORK: "eip155:8453",
        WEFT_PAY_TO: payTo,
    });

    expect(accepts[0]).toMatchObject({
        scheme: "upto",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo,
    });
});

test("the existing default model gets an upto challenge", async () => {
    const { accepts, extensions } = await challenge({
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
    });

    expect(accepts[0].scheme).toBe("upto");
    expect(extensions["weft.request"].info).toEqual({
        model: "openai/gpt-5.4-nano",
        max_tokens: 100,
    });
});

test("authenticated and invalid presented credentials bypass x402", async () => {
    const app = new Hono();
    app.use(ROUTE, x402Payment());
    app.post(ROUTE, (c) =>
        c.req.header("authorization") === "Bearer valid"
            ? c.text("existing handler")
            : c.text("Unauthorized", 401),
    );

    const valid = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: { authorization: "Bearer valid" },
        },
        x402Env,
    );
    const invalid = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: { authorization: "Bearer expired" },
        },
        x402Env,
    );

    expect(await valid.text()).toBe("existing handler");
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test("the obsolete x402-prefixed route is absent", async () => {
    const app = generationApp;
    const response = await app.request("/x402/v1/chat/completions", {
        method: "POST",
    });
    expect(response.status).toBe(404);
});

test("offers an ordinary JSON 402 for streaming chat at the same spending ceiling", async () => {
    const normal = await challenge(request());
    const streaming = await challenge(request({ stream: true }));
    expect(usd(streaming.accepts[0])).toBe(usd(normal.accepts[0]));
    expect(streaming.accepts[0].scheme).toBe("upto");
});

test.each([
    ["missing output cap", { max_tokens: undefined }],
    [
        "multimodal input",
        {
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/image.png" },
                        },
                    ],
                },
            ],
        },
    ],
    ["search", { web_search_options: { search_context_size: "low" } }],
])("rejects unsupported %s before advertising payment", async (_name, change) => {
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request(change)),
        },
        x402Env,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test.each([
    "gpt-5.6-sol",
])("rejects model %s with unsupported billing", async (model) => {
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(request({ model })),
        },
        x402Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test("rejects multiple completions that exceed the single-completion payment bound", async () => {
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(request({ n: 2 })),
        },
        x402Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test("runs body limits and schema validation before payment parsing", async () => {
    const app = generationApp;
    const invalidSchema = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Payment-Signature": "not-a-payment",
            },
            body: JSON.stringify({ model: "openai", max_tokens: 10 }),
        },
        x402Env,
    );
    const tooLarge = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": String(20 * 1024 * 1024 + 1),
                "Payment-Signature": "not-a-payment",
            },
            body: JSON.stringify(request()),
        },
        x402Env,
    );

    expect(invalidSchema.status).toBe(400);
    expect(tooLarge.status).toBe(413);
    expect(invalidSchema.headers.get("PAYMENT-REQUIRED")).toBeNull();
    expect(tooLarge.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test("uses UTF-8 request bytes as a conservative prompt-token maximum", async () => {
    const short = await challenge(request());
    const ascii = await challenge(
        request({ messages: [{ role: "user", content: "x".repeat(40_000) }] }),
    );
    const utf8 = await challenge(
        request({ messages: [{ role: "user", content: "🧶".repeat(10_000) }] }),
    );

    expect(usd(ascii.accepts[0])).toBeGreaterThan(usd(short.accepts[0]));
    expect(usd(utf8.accepts[0])).toBeGreaterThanOrEqual(usd(ascii.accepts[0]));
});

test("actual settlement fails closed without valid model and usage headers", async () => {
    await expect(
        priceActualUsage(
            x402Env as CloudflareBindings,
            request(),
            new Headers(),
        ),
    ).rejects.toThrow(/model usage headers/i);
    await expect(
        priceActualUsage(
            x402Env as CloudflareBindings,
            request(),
            new Headers({
                "x-model-used": "gpt-oss",
                "x-usage-prompt-text-tokens": "not-a-number",
                "x-usage-completion-text-tokens": "1",
            }),
        ),
    ).rejects.toThrow(/usage header/i);
    await expect(
        priceActualUsage(
            x402Env as CloudflareBindings,
            request(),
            new Headers({
                "x-model-used": "not-a-model",
                "x-usage-prompt-text-tokens": "1",
            }),
        ),
    ).rejects.toThrow(/invalid model/i);
    await expect(
        priceActualUsage(
            x402Env as CloudflareBindings,
            request(),
            new Headers({
                "x-model-used": "gpt-oss",
                "x-usage-prompt-text-tokens": "10",
            }),
        ),
    ).rejects.toThrow(/completion.*usage header/i);
});

test.each([
    "x-usage-prompt-text-tokens",
    "x-usage-completion-text-tokens",
])("rejects empty %s instead of treating missing usage as zero", async (name) => {
    const headers = new Headers({
        "x-model-used": "gpt-oss",
        "x-usage-prompt-text-tokens": "10",
        "x-usage-completion-text-tokens": "1",
    });
    headers.set(name, "");
    await expect(priceActualUsage(x402Env, request(), headers)).rejects.toThrow(
        /invalid usage header/i,
    );
    headers.set(name, "0");
    await expect(
        priceActualUsage(x402Env, request(), headers),
    ).resolves.toBeGreaterThanOrEqual(0.001);
});

test("metered actual does not exceed the conservative maximum", async () => {
    const advertised = await challenge(request({ max_tokens: 1_000 }));
    const actual = await priceActualUsage(
        x402Env as CloudflareBindings,
        request({ max_tokens: 1_000 }),
        new Headers({
            "x-model-used": "gpt-oss",
            "x-usage-prompt-text-tokens": "50",
            "x-usage-completion-text-tokens": "1000",
        }),
    );
    expect(actual).toBeLessThanOrEqual(usd(advertised.accepts[0]));
});

test("two-bucket models settle only with prompt and completion usage", async () => {
    await expect(
        priceActualUsage(
            x402Env as CloudflareBindings,
            request(),
            new Headers({
                "x-model-used": "gpt-oss",
                "x-usage-prompt-text-tokens": "10",
            }),
        ),
    ).rejects.toThrow(/completion.*usage header/i);

    await expect(
        priceActualUsage(
            x402Env as CloudflareBindings,
            request(),
            new Headers({
                "x-model-used": "gpt-oss",
                "x-usage-prompt-text-tokens": "10",
                "x-usage-completion-text-tokens": "20",
            }),
        ),
    ).resolves.toBeGreaterThan(0);
});

test("the default model settles cached prompt usage below its maximum", async () => {
    const body = CreateChatCompletionRequestSchema.parse({
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
    });
    const advertised = await challenge(body);
    const actual = await priceActualUsage(
        x402Env as CloudflareBindings,
        body,
        new Headers({
            "x-model-used": "openai",
            "x-usage-prompt-cached-tokens": "10",
            "x-usage-completion-text-tokens": "20",
        }),
    );

    expect(actual).toBeLessThanOrEqual(usd(advertised.accepts[0]));
});

test("requires idempotency before payment processing", async () => {
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request()),
        },
        x402Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test("unpaid challenge performs no durable operation write", async () => {
    let durableCalls = 0;
    const challengeEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: {
            getByName: () => {
                durableCalls += 1;
                throw new Error("unpaid challenge touched durable state");
            },
        },
    } as unknown as CloudflareBindings;
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(request()),
        },
        challengeEnv,
    );

    expect(response.status).toBe(402);
    expect(durableCalls).toBe(0);
});

test("accepts hexadecimal Permit2 nonces for durable payment identity", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const app = operationApp(replayEnv, counts);
    const payment = paymentHeader(paymentPayload("0x2a"));

    const response = await app.request(crypto.randomUUID(), request(), payment);

    expect(response.status).toBe(200);
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });
});

test("accepts exact EIP-3009 payments for durable operation identity", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;

    await expect(
        resumeX402Operation(
            replayEnv,
            crypto.randomUUID(),
            request(),
            paymentCandidate(exactPaymentPayload("0x2a")),
        ),
    ).resolves.toBeUndefined();
});

test("same operation and payment runs protected work once", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const app = operationApp(replayEnv, counts, undefined, {
        rejectConsumed: false,
    });
    const key = crypto.randomUUID();
    const nonce = uniqueNonce();
    const firstAuthorization = paymentHeader(
        paymentPayload(nonce, { first: true }),
    );
    const replayAuthorization = paymentHeader(
        paymentPayload(nonce, { first: true }),
        true,
    );
    const [first, second] = await Promise.all([
        app.request(key, request(), firstAuthorization),
        app.request(key, request(), replayAuthorization),
    ]);

    expect(
        [first.status, second.status].every((status) =>
            [200, 409].includes(status),
        ),
    ).toBe(true);
    expect([first.status, second.status]).toContain(200);
    expect(counts.work).toBe(1);
});

test("rejects changed body and changed payment for one operation", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const app = operationApp(replayEnv, counts);
    const key = crypto.randomUUID();
    const payment = paymentHeader(paymentPayload(uniqueNonce()));
    expect((await app.request(key, request(), payment)).status).toBe(200);

    const changedBody = await app.request(
        key,
        request({ messages: [{ role: "user", content: "changed" }] }),
        payment,
    );
    const changedPayment = await app.request(
        key,
        request(),
        paymentHeader(
            paymentPayload(
                uniqueNonce(),
                {},
                "0x0000000000000000000000000000000000000002",
                "0x0000000000000000000000000000000000000006",
            ),
        ),
    );

    expect(changedBody.status).toBe(409);
    expect(changedPayment.status).toBe(409);
    expect(counts.work).toBe(1);
    expect(counts.payment).toBe(1);
});

test("different payers can reuse an idempotency key", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const app = operationApp(replayEnv, counts);
    const key = crypto.randomUUID();
    const first = paymentHeader(paymentPayload(uniqueNonce()));
    const second = paymentHeader(
        paymentPayload(
            uniqueNonce(),
            {},
            "0x0000000000000000000000000000000000000005",
        ),
    );

    expect((await app.request(key, request(), first)).status).toBe(200);
    expect((await app.request(key, request(), second)).status).toBe(200);
    expect(counts).toEqual({ work: 2, payment: 2, settlement: 2 });
});

test("generated replay skips consumed-nonce verification and settles again", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const verifier = { consumed: new Set<string>() };
    const key = crypto.randomUUID();
    const payload = paymentPayload(uniqueNonce(), { echoed: { value: true } });
    const payment = paymentHeader(payload);
    const firstApp = operationApp(replayEnv, counts, verifier, {
        omitFirstReceipt: true,
    });
    await expect(
        resumeX402Operation(
            replayEnv,
            key,
            request(),
            paymentCandidate(payload),
        ),
    ).resolves.toBeUndefined();
    const first = await firstApp.request(key, request(), payment);
    await expect(
        resumeX402Operation(
            replayEnv,
            key,
            request(),
            paymentCandidate(payload),
        ),
    ).resolves.toEqual({
        paymentPayload: payload,
        paymentRequirements: payload.accepted,
        declaredExtensions: {
            [WEFT_REQUEST_EXTENSION_KEY]: {
                info: { model: "gpt-oss", max_tokens: 100 },
                schema: WEFT_REQUEST_INFO_SCHEMA,
            },
        },
    });
    const secondApp = operationApp(replayEnv, counts, verifier);
    const replay = await secondApp.request(key, request(), payment);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true });
    expect(replay.headers.get("Settlement-Overrides")).toBe(
        JSON.stringify({ amount: "$0.001" }),
    );
    expect(counts.work).toBe(1);
    expect(counts.payment).toBe(1);
    expect(counts.settlement).toBe(2);
});

test("concurrent generated replays both return the same settled response", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const verifier = { consumed: new Set<string>() };
    const key = crypto.randomUUID();
    const payment = paymentHeader(paymentPayload(uniqueNonce()));
    const firstApp = operationApp(replayEnv, counts, verifier, {
        omitFirstReceipt: true,
    });
    expect((await firstApp.request(key, request(), payment)).status).toBe(200);
    expect(tinybird.state.events).toHaveLength(0);

    const retryApp = operationApp(replayEnv, counts, verifier, {
        settlementBarrier: 2,
    });
    const [firstRetry, secondRetry] = await Promise.all([
        retryApp.request(key, request(), payment),
        retryApp.request(key, request(), payment),
    ]);

    expect([firstRetry.status, secondRetry.status]).toEqual([200, 200]);
    expect(await firstRetry.json()).toEqual({ ok: true });
    expect(await secondRetry.json()).toEqual({ ok: true });
    expect(firstRetry.headers.get("PAYMENT-RESPONSE")).toBe(
        secondRetry.headers.get("PAYMENT-RESPONSE"),
    );
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 3 });

    const finalReplay = await retryApp.request(key, request(), payment);
    expect(finalReplay.status).toBe(200);
    expect(finalReplay.headers.get("PAYMENT-RESPONSE")).toBe(
        firstRetry.headers.get("PAYMENT-RESPONSE"),
    );
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 3 });
    await vi.waitFor(() => expect(tinybird.state.events).toHaveLength(1));
});

test("settled retries record revenue once without a Pollen account", async () => {
    const counts = { work: 0, payment: 0, settlement: 0 };
    const app = operationApp(x402Env as CloudflareBindings, counts);
    const key = crypto.randomUUID();
    const payment = paymentHeader(paymentPayload(uniqueNonce()));
    expect((await app.request(key, request(), payment)).status).toBe(200);
    await vi.waitFor(() => expect(tinybird.state.events).toHaveLength(1));
    expect((await app.request(key, request(), payment)).status).toBe(200);
    expect(tinybird.state.events).toHaveLength(1);
    expect(tinybird.state.events[0]).toMatchObject({
        selectedMeterSlug: "v1:meter:crypto",
        isBilledUsage: true,
        totalPrice: 0.001,
        modelUsed: "openai/gpt-oss-20b",
        tokenCountPromptText: 10,
        tokenCountCompletionText: 1,
    });
    expect(tinybird.state.events[0].userId).toBeUndefined();
    expect(tinybird.state.events[0].balances).toBeUndefined();
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });
});

test("x402 accounting separates the requested price from the exact serving model's cost", async () => {
    const usage = { promptTextTokens: 10, completionTextTokens: 1 };
    const served = "openai/gpt-5.4-nano";
    const row = await createX402Event(
        x402Env as CloudflareBindings,
        chatRequest(request()),
        new Response("ok", {
            headers: {
                "x-model-used": served,
                "x-usage-prompt-text-tokens": "10",
                "x-usage-completion-text-tokens": "1",
            },
        }),
        "accounting-fallback",
        new Date(),
    );
    const billing = calculateUsageBilling({
        model: "openai/gpt-oss-20b",
        usage,
        servedBy: getRegistryModelDefinition(served),
        quotedBy: getRegistryModelDefinition("openai/gpt-oss-20b"),
    });
    expect(row).toMatchObject({
        modelUsed: served,
        resolvedModelRequested: "openai/gpt-oss-20b",
        fallbackUsed: true,
        totalCost: billing.cost.totalCost,
        totalPrice: 0.001,
        devPrice: billing.price.totalPrice,
    });
});

test("generated response rejects a forged signature with the same payment identity", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const key = crypto.randomUUID();
    const payload = paymentPayload(uniqueNonce());
    const app = operationApp(replayEnv, counts, undefined, {
        omitFirstReceipt: true,
    });
    expect(
        (await app.request(key, request(), paymentHeader(payload))).status,
    ).toBe(200);

    const forged = {
        ...payload,
        payload: { ...payload.payload, signature: "0xdead" },
    };
    const response = await app.request(key, request(), paymentHeader(forged));

    expect(response.status).toBe(409);
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });
});

test("final replay requires the exact proof and skips verify and settle", async () => {
    const replayEnv = {
        ...x402Env,
        GENERATION_COORDINATOR: env.GENERATION_COORDINATOR,
    } as unknown as CloudflareBindings;
    const counts = { work: 0, payment: 0, settlement: 0 };
    const verifier = { consumed: new Set<string>() };
    const key = crypto.randomUUID();
    const payload = paymentPayload(uniqueNonce());
    const payment = paymentHeader(payload);
    const app = operationApp(replayEnv, counts, verifier);
    expect((await app.request(key, request(), payment)).status).toBe(200);

    const replay = await app.request(key, request(), payment);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });

    const forged = {
        ...payload,
        payload: { ...payload.payload, signature: "0xdead" },
    };
    const rejected = await app.request(key, request(), paymentHeader(forged));
    expect(rejected.status).toBe(409);
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });
});

test("persists a streaming receipt before DONE and replays it without another generation or settlement", async () => {
    const counts = { work: 0, payment: 0, settlement: 0 };
    const app = operationApp(x402Env as CloudflareBindings, counts);
    const key = crypto.randomUUID();
    const payment = paymentHeader(paymentPayload(uniqueNonce()));
    const body = request({ stream: true });
    const first = await app.request(key, body, payment);
    expect(first.status).toBe(200);
    const text = await first.text();
    const receipt = first.headers.get("payment-response");
    expect(text).toContain(
        `event: x402.payment\ndata: ${JSON.stringify({ paymentResponse: receipt })}\n\n${X402_STREAM_DONE}`,
    );
    expect(text.match(/\[DONE\]/g)).toHaveLength(1);
    const replay = await app.request(key, body, payment);
    expect(await replay.text()).toBe(text);
    expect(replay.headers.get("payment-response")).toBe(receipt);
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });
});

test("shared routes keep cache hits free but replay a signed buyer's private receipt first", async () => {
    const body = request({ model: "openai/gpt-oss-20b", seed: 81273 });
    const bodyText = JSON.stringify(body);
    const url = `https://gen.pollinations.ai${ROUTE}`;
    const init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyText,
    };
    const cacheKey = await textCacheKey(new Request(url, init), bodyText);
    const cached = new Response(JSON.stringify({ cached: true }), {
        headers: { "content-type": "application/json" },
    });
    await env.TEXT_BUCKET.put(cacheKey, await cached.text(), {
        customMetadata: prepareMetadata(cached),
    });

    const free = await generationApp.request(url, init);
    expect(free.status).toBe(200);
    expect(await free.json()).toEqual({ cached: true });
    expect(free.headers.get("x-cache")).toBe("HIT");
    expect(free.headers.has("payment-response")).toBe(false);

    const counts = { work: 0, payment: 0, settlement: 0 };
    const key = crypto.randomUUID();
    const payment = paymentHeader(paymentPayload(uniqueNonce()));
    const first = await operationApp(x402Env, counts).request(
        key,
        body,
        payment,
    );
    const ctx = createExecutionContext();
    const replay = await executeX402Request(
        new Request(url, {
            ...init,
            headers: {
                ...init.headers,
                "idempotency-key": key,
                "payment-signature": payment,
            },
        }),
        x402Env,
        ctx,
        {
            onStream: () => {
                throw new Error("Not a streaming request");
            },
        },
    );
    await waitOnExecutionContext(ctx);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true });
    expect(replay.headers.get("payment-response")).toBe(
        first.headers.get("payment-response"),
    );
    expect(replay.headers.get("cache-control")).toBe("private, no-store");
    expect(counts).toEqual({ work: 1, payment: 1, settlement: 1 });
});

test.each([
    "json",
    "multipart",
])("preserves a paid %s speech request when handing it to durable execution", async (encoding) => {
    const payload = {
        model: "elevenflash",
        input: "Hello 🧶",
        voice: "alloy",
    };
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) form.set(key, value);
    const requests: Request[] = [];
    const response = await generationApp.request(
        "/v1/audio/speech",
        {
            method: "POST",
            headers: {
                ...(encoding === "json" && {
                    "content-type": "application/json",
                }),
                "payment-signature": paymentHeader(
                    paymentPayload(uniqueNonce()),
                ),
                "idempotency-key": crypto.randomUUID(),
            },
            body: encoding === "json" ? JSON.stringify(payload) : form,
        },
        {
            ...x402Env,
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    fetch: async (url: string, init: RequestInit) => {
                        requests.push(new Request(url, init));
                        return new Response("detached");
                    },
                }),
            },
        } as unknown as CloudflareBindings,
    );
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    const forwarded = requests[0];
    const body =
        encoding === "json"
            ? await forwarded.json()
            : Object.fromEntries(await forwarded.formData());
    expect(body).toEqual(payload);
});

test("does not offer payment for an implicit HEAD route", async () => {
    const response = await generationApp.request(
        "/image/head-payment-regression?model=flux",
        { method: "HEAD" },
    );
    expect(response.status).toBe(401);
    expect(response.headers.has("payment-required")).toBe(false);
});

test("anonymous x402 applies edge rate limiting", async () => {
    let limits = 0;
    const rateEnv = {
        ...x402Env,
        EDGE_RATE_LIMITER: {
            limit: async () => {
                limits += 1;
                return { success: false };
            },
        },
    } as unknown as CloudflareBindings;
    const app = generationApp;
    const response = await app.request(
        ROUTE,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(request()),
        },
        rateEnv,
    );

    expect(response.status).toBe(429);
    expect(limits).toBe(1);
});
