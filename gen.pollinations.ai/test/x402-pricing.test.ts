import { env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { test } from "@shared/test/fixtures/index.ts";
import {
    type PaymentResumeCandidate,
    WEFT_REQUEST_EXTENSION_KEY,
    WEFT_REQUEST_INFO_SCHEMA,
} from "@weft-labs/sdk/facilitator/middleware";
import type { PaymentPayload } from "@x402/core/types";
import { Hono } from "hono";
import { expect } from "vitest";
import {
    createAnonymousX402Routes,
    createX402Fallback,
    finalX402Operation,
    priceActualUsage,
    requireX402Idempotency,
    resumeX402Operation,
    runX402Operation,
} from "../src/routes/x402.ts";

const ROUTE = "/v1/chat/completions";
const PAY_TO = "0x000000000000000000000000000000000000dEaD";
const x402Env = { ...env, WEFT_PAY_TO: PAY_TO, WEFT_NETWORK: "eip155:84532" };

async function challenge(body: unknown) {
    const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
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
        x402Env,
    );
    expect(response.status).toBe(402);
    const header = response.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    return JSON.parse(atob(header as string));
}

const usd = (accepts: { amount: string }) => Number(accepts.amount) / 1e6;
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
    expect(accepts[0].maxTimeoutSeconds).toBe(360);
    expect(accepts[0].extra.assetTransferMethod).toBe("permit2");
    expect(extensions["weft.request"].info).toEqual({
        model: "gpt-oss",
        max_tokens: 100,
    });
});

test("the existing default model gets an upto challenge", async () => {
    const { accepts, extensions } = await challenge({
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
    });

    expect(accepts[0].scheme).toBe("upto");
    expect(extensions["weft.request"].info).toEqual({
        model: "openai",
        max_tokens: 100,
    });
});

test("authenticated and invalid presented credentials bypass x402", async () => {
    const app = new Hono();
    app.use(ROUTE, createX402Fallback());
    app.post(ROUTE, (c) =>
        c.req.header("authorization") === "Bearer valid"
            ? c.text("existing handler")
            : c.text("Unauthorized", 401),
    );

    const valid = await app.request(ROUTE, {
        method: "POST",
        headers: { authorization: "Bearer valid" },
    });
    const invalid = await app.request(ROUTE, {
        method: "POST",
        headers: { authorization: "Bearer expired" },
    });

    expect(await valid.text()).toBe("existing handler");
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("PAYMENT-REQUIRED")).toBeNull();
});

test("the obsolete x402-prefixed route is absent", async () => {
    const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
    const response = await app.request("/x402/v1/chat/completions", {
        method: "POST",
    });
    expect(response.status).toBe(404);
});

test.each([
    ["streaming", { stream: true }],
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
])(
    "rejects unsupported %s before advertising payment",
    async (_name, change) => {
        const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
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
    },
);

test.each(["gpt-5.6-sol"])(
    "rejects model %s with unsupported billing",
    async (model) => {
        const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
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
    },
);

test("rejects unknown anonymous request fields before pricing or generation", async () => {
    const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
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
    const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
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
    ).rejects.toThrow(/invalid text model/i);
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
    const app = createAnonymousX402Routes(x402Env as CloudflareBindings);
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
    const app = createAnonymousX402Routes(challengeEnv);
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
    const app = createAnonymousX402Routes(rateEnv);
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
