import { createExecutionContext, env, SELF } from "cloudflare:test";
import { x402Client } from "@x402/core/client";
import {
    decodePaymentRequiredHeader,
    encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { Hono } from "hono";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, vi } from "vitest";
import type { Env } from "../../src/env.ts";
import { logger } from "../../src/middleware/logger.ts";
import { x402KeysRoutes } from "../../src/routes/x402-keys.ts";
import {
    creditPurchase,
    getPurchase,
    isBuyer,
    paymentId,
    preparePurchase,
    recoveryMessage,
    transferOf,
} from "../../src/services/x402-key-purchases.ts";
import { createApiKeyViaApi, test } from "../fixtures.ts";

describe("x402 prepaid API keys", () => {
    test("lists the existing fixed Pollen packs", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/x402/keys",
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            packs: { packKey: string; priceUsd: number; method: string }[];
        };
        expect(body.packs).toContainEqual(
            expect.objectContaining({
                packKey: "p2",
                priceUsd: 2,
                method: "POST",
            }),
        );
    });

    test("documents both purchase methods", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/docs/open-api/generate-schema",
        );
        expect(response.status).toBe(200);
        const schema = (await response.json()) as {
            paths: Record<string, Record<string, unknown>>;
        };
        const purchase = Object.entries(schema.paths).find(
            ([path]) => path.includes("x402/keys") && path.includes("packKey"),
        )?.[1];
        if (!purchase) {
            throw new Error(
                `Missing x402 purchase route: ${Object.keys(schema.paths)
                    .filter((path) => path.includes("x402"))
                    .join(", ")}`,
            );
        }
        expect(purchase).toHaveProperty("get");
        expect(purchase).toHaveProperty("post");
    });

    test("does not advertise payment terms before the seller is configured", async () => {
        for (const method of ["GET", "POST"]) {
            const response = await SELF.fetch(
                "http://localhost:3000/api/x402/keys/p2",
                { method },
            );
            expect(response.status).toBe(503);
            expect(response.headers.get("payment-required")).toBeNull();
        }
    });

    test("rejects invalid purchase amounts", async () => {
        for (const method of ["GET", "POST"]) {
            for (const value of ["0", "10000.01", "1e2", "0.001"]) {
                const response = await SELF.fetch(
                    `http://localhost:3000/api/x402/keys/${value}`,
                    { method },
                );
                expect(response.status).toBe(404);
            }
        }
    });

    test("offers an exact x402 challenge for a configured holding account", async ({
        accountToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(accountToken, {
            name: "holding-owner-challenge",
        });
        const owner = await env.DB.prepare(
            "SELECT user_id FROM apikey WHERE id = ?",
        )
            .bind(ownerKey.id)
            .first<{ user_id: string }>();
        if (!owner) throw new Error("Test account is missing");
        // The SDK needs facilitator capabilities to build the challenge.
        const originalFetch = globalThis.fetch;
        vi.stubGlobal(
            "fetch",
            (input: RequestInfo | URL, init?: RequestInit) => {
                const url = new URL(
                    input instanceof Request ? input.url : String(input),
                );
                if (
                    url.href === "https://x402.staging.weft.network/supported"
                ) {
                    return Promise.resolve(
                        Response.json({
                            kinds: [
                                {
                                    x402Version: 2,
                                    scheme: "exact",
                                    network: "eip155:84532",
                                },
                            ],
                            extensions: [],
                            signers: {},
                        }),
                    );
                }
                return originalFetch(input, init);
            },
        );
        for (const method of ["GET", "POST"]) {
            for (const [value, atomicAmount] of [
                ["p2", "2000000"],
                ["0.50", "500000"],
            ]) {
                const response = await x402KeysRoutes.request(
                    `http://localhost/${value}`,
                    { method },
                    {
                        ...env,
                        X402_HOLDING_USER_ID: owner.user_id,
                        WEFT_SELLER_API_KEY: "ax_test",
                        WEFT_FACILITATOR_URL:
                            "https://x402.staging.weft.network",
                        WEFT_NETWORK: "eip155:84532",
                        WEFT_PAY_TO:
                            "0x3b0b371ae3cb08f272b87319684f6518b3b313a0",
                    },
                );
                expect(response.status).toBe(402);
                const terms = response.headers.get("payment-required");
                if (!terms) throw new Error("Missing x402 payment terms");
                const challenge = decodePaymentRequiredHeader(terms);
                expect(challenge.x402Version).toBe(2);
                expect(challenge.accepts).toContainEqual(
                    expect.objectContaining({
                        scheme: "exact",
                        network: "eip155:84532",
                        amount: atomicAmount,
                        payTo: "0x3b0b371ae3cb08f272b87319684f6518b3b313a0",
                    }),
                );
            }
        }
    });

    test("credits a new key and its holding wallet only once", async ({
        accountToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(accountToken, {
            name: "holding-owner",
        });
        const owner = await env.DB.prepare(
            "SELECT user_id, pack_balance FROM apikey JOIN user ON user.id = apikey.user_id WHERE apikey.id = ?",
        )
            .bind(ownerKey.id)
            .first<{ user_id: string; pack_balance: number | null }>();
        if (!owner) throw new Error("Test account is missing");

        const id = crypto.randomUUID();
        const issued = await preparePurchase(
            env,
            undefined,
            id,
            owner.user_id,
            "0.50",
        );
        expect(issued.key).toMatch(/^sk_/);
        const pending = await getPurchase(env.DB, id);
        expect(pending?.credited_at).toBeNull();
        expect(pending?.encrypted_key).not.toContain(issued.key);
        await expect(
            preparePurchase(env, undefined, id, owner.user_id, "0.50"),
        ).rejects.toThrow("already used");
        expect((await getPurchase(env.DB, id))?.key_id).toBe(issued.id);

        const before = await SELF.fetch(
            "http://localhost:3000/api/account/balance",
            { headers: { Authorization: `Bearer ${issued.key}` } },
        );
        expect(before.status).toBe(200);
        expect(await before.json()).toEqual({ balance: 0 });

        await Promise.all([
            creditPurchase(env.DB, id, owner.user_id, issued.id),
            creditPurchase(env.DB, id, owner.user_id, issued.id),
        ]);
        await creditPurchase(env.DB, id, owner.user_id, issued.id);

        const keyBalance = await SELF.fetch(
            "http://localhost:3000/api/account/balance",
            { headers: { Authorization: `Bearer ${issued.key}` } },
        );
        expect(keyBalance.status).toBe(200);
        expect(await keyBalance.json()).toEqual({ balance: 0.5 });
        const account = await env.DB.prepare(
            "SELECT pack_balance FROM user WHERE id = ?",
        )
            .bind(owner.user_id)
            .first<{ pack_balance: number }>();
        expect(account?.pack_balance).toBe((owner.pack_balance ?? 0) + 0.5);

        const listKeys = await SELF.fetch(
            "http://localhost:3000/api/account/keys",
            { headers: { Authorization: `Bearer ${issued.key}` } },
        );
        expect(listKeys.status).toBe(403);
        expect((await getPurchase(env.DB, id))?.credited_at).not.toBeNull();
    });

    test("rejects reusing one payment for a different pack", async ({
        accountToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(accountToken, {
            name: "holding-owner-2",
        });
        const owner = await env.DB.prepare(
            "SELECT user_id FROM apikey WHERE id = ?",
        )
            .bind(ownerKey.id)
            .first<{ user_id: string }>();
        if (!owner) throw new Error("Test account is missing");
        const id = crypto.randomUUID();
        await preparePurchase(env, undefined, id, owner.user_id, "p2");
        await expect(
            preparePurchase(env, undefined, id, owner.user_id, "p5"),
        ).rejects.toThrow("already used");
    });

    test("answers a settled payment replayed for another pack with 409", async ({
        accountToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(accountToken, {
            name: "holding-owner-replay",
        });
        const owner = await env.DB.prepare(
            "SELECT user_id FROM apikey WHERE id = ?",
        )
            .bind(ownerKey.id)
            .first<{ user_id: string }>();
        if (!owner) throw new Error("Test account is missing");
        const signature = encodePaymentSignatureHeader({
            x402Version: 2,
            accepted: {
                network: "eip155:84532",
                asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            },
            payload: {
                authorization: {
                    from: privateKeyToAccount(generatePrivateKey()).address,
                    nonce: generatePrivateKey(),
                },
            },
        } as unknown as Parameters<typeof encodePaymentSignatureHeader>[0]);
        const id = await paymentId(signature);
        const issued = await preparePurchase(
            env,
            undefined,
            id,
            owner.user_id,
            "p2",
        );
        await creditPurchase(env.DB, id, owner.user_id, issued.id);

        const replay = (pack: string) =>
            x402KeysRoutes.request(
                `http://localhost/${pack}`,
                { method: "POST", headers: { "payment-signature": signature } },
                {
                    ...env,
                    X402_HOLDING_USER_ID: owner.user_id,
                    WEFT_SELLER_API_KEY: "ax_test",
                    WEFT_FACILITATOR_URL: "https://x402.staging.weft.network",
                    WEFT_NETWORK: "eip155:84532",
                    WEFT_PAY_TO: "0x3b0b371ae3cb08f272b87319684f6518b3b313a0",
                },
                createExecutionContext(),
            );

        expect((await replay("p2")).status).toBe(409);
        const other = await replay("p5");
        expect(other.status).toBe(409);
        expect(await other.text()).toContain("another purchase");
    });

    describe("replays and buyer recovery", () => {
        const facilitator = "https://x402.staging.weft.network";
        const testApp = new Hono<Env>()
            .use("*", logger)
            .route("/", x402KeysRoutes);
        const send = (
            holdingUserId: string,
            pack: string,
            headers: Record<string, string> = {},
        ) =>
            testApp.request(
                `http://localhost/${pack}`,
                { method: "POST", headers },
                {
                    ...env,
                    X402_HOLDING_USER_ID: holdingUserId,
                    WEFT_SELLER_API_KEY: "ax_test",
                    WEFT_FACILITATOR_URL: facilitator,
                    WEFT_NETWORK: "eip155:84532",
                    WEFT_PAY_TO: "0x3b0b371ae3cb08f272b87319684f6518b3b313a0",
                },
                createExecutionContext(),
            );

        async function holdingOwner(accountToken: string, name: string) {
            const key = await createApiKeyViaApi(accountToken, { name });
            const row = await env.DB.prepare(
                "SELECT user_id FROM apikey WHERE id = ?",
            )
                .bind(key.id)
                .first<{ user_id: string }>();
            if (!row) throw new Error("Test account is missing");
            return row.user_id;
        }

        const ledger = async (userId: string) =>
            (await env.DB.prepare(
                `SELECT COALESCE(u.pack_balance, 0) AS paid,
                    (SELECT COUNT(*) FROM apikey WHERE user_id = u.id) AS keys,
                    (SELECT COALESCE(SUM(pollen_balance), 0) FROM apikey WHERE user_id = u.id) AS key_pollen,
                    (SELECT COUNT(*) FROM x402_key_purchase WHERE user_id = u.id) AS purchases
                 FROM user u WHERE u.id = ?`,
            )
                .bind(userId)
                .first()) as Record<
                "paid" | "keys" | "key_pollen" | "purchases",
                number
            >;

        // Facilitator stand-in that logs every call. A repeat settle answers
        // with the original receipt, as Weft does for settlement replay.
        function stubFacilitator(payer: string) {
            const calls: string[] = [];
            const originalFetch = globalThis.fetch;
            vi.stubGlobal(
                "fetch",
                (input: RequestInfo | URL, init?: RequestInit) => {
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                    );
                    if (url.origin !== facilitator)
                        return originalFetch(input, init);
                    calls.push(url.pathname);
                    const body = {
                        "/supported": {
                            kinds: [
                                {
                                    x402Version: 2,
                                    scheme: "exact",
                                    network: "eip155:84532",
                                },
                            ],
                            extensions: [],
                            signers: {},
                        },
                        "/verify": { isValid: true, payer },
                        "/settle": {
                            success: true,
                            transaction: `0x${"ab".repeat(32)}`,
                            network: "eip155:84532",
                            payer,
                        },
                    }[url.pathname];
                    return Promise.resolve(
                        body
                            ? Response.json(body)
                            : Response.json({}, { status: 500 }),
                    );
                },
            );
            return calls;
        }

        async function challenge(holdingUserId: string, pack: string) {
            const terms = (await send(holdingUserId, pack)).headers.get(
                "payment-required",
            );
            if (!terms) throw new Error("Missing x402 payment terms");
            return decodePaymentRequiredHeader(terms);
        }

        async function buyerPayment(holdingUserId: string, pack: string) {
            const account = privateKeyToAccount(generatePrivateKey());
            stubFacilitator(account.address);
            const payment = await registerExactEvmScheme(
                new x402Client().setSpendControls(false),
                { signer: account },
            ).createPaymentPayload(await challenge(holdingUserId, pack));
            vi.unstubAllGlobals();
            const signature = encodePaymentSignatureHeader(payment);
            return {
                account,
                payment,
                signature,
                id: await paymentId(signature),
            };
        }

        async function proof(
            account: ReturnType<typeof privateKeyToAccount>,
            payment: PaymentPayload,
            issuedAt = Math.floor(Date.now() / 1000),
            origin = "http://localhost",
        ) {
            return {
                "x402-buyer-issued-at": String(issuedAt),
                "x402-buyer-signature": await account.signMessage({
                    message: recoveryMessage(
                        origin,
                        transferOf(payment),
                        String(issuedAt),
                    ),
                }),
            };
        }

        test("second review: changing unsigned metadata must not create another purchase", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "metadata-race");
            const buyer = await buyerPayment(owner, "p2");
            const variant = {
                ...buyer.payment,
                resource: {
                    ...(buyer.payment.resource as PaymentPayload["resource"] & {
                        url: string;
                    }),
                    description: "Same signed transfer, other description",
                },
            };
            const variantHeader = encodePaymentSignatureHeader(variant);
            expect(
                JSON.stringify(variant.payload) ===
                    JSON.stringify(buyer.payment.payload),
            ).toBe(true);
            expect(await paymentId(variantHeader)).toBe(buyer.id);
            const before = await ledger(owner);
            const calls = stubFacilitator(buyer.account.address);
            const facilitatorFetch = globalThis.fetch;
            let verified = 0;
            let release!: () => void;
            const bothVerified = new Promise<void>((resolve) => {
                release = resolve;
            });
            vi.stubGlobal(
                "fetch",
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                    );
                    const response = await facilitatorFetch(input, init);
                    if (
                        url.origin === facilitator &&
                        url.pathname === "/verify"
                    ) {
                        verified++;
                        if (verified === 2) release();
                        await bothVerified;
                    }
                    return response;
                },
            );
            try {
                const responses = await Promise.all(
                    [buyer.signature, variantHeader].map((signature) =>
                        send(owner, "p2", { "payment-signature": signature }),
                    ),
                );
                const statuses = responses
                    .map((response) => response.status)
                    .sort();
                const after = await ledger(owner);
                console.info(
                    "METADATA_RACE",
                    JSON.stringify({
                        statuses,
                        verified,
                        settles: calls.filter((path) => path === "/settle")
                            .length,
                        newKeys: after.keys - before.keys,
                        newPurchases: after.purchases - before.purchases,
                        credit: after.paid - before.paid,
                        keyCredit: after.key_pollen - before.key_pollen,
                    }),
                );
                expect(statuses).toEqual([200, 409]);
                expect(after.paid - before.paid).toBe(2);
            } finally {
                vi.unstubAllGlobals();
            }
        });

        test("second review: a failed credit returns no key and the buyer can recover once", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "credit-failure");
            const buyer = await buyerPayment(owner, "p2");
            const before = await ledger(owner);
            const calls = stubFacilitator(buyer.account.address);
            const facilitatorFetch = globalThis.fetch;
            let settlementSucceeded = false;
            let failedCredit = false;
            vi.stubGlobal(
                "fetch",
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    const response = await facilitatorFetch(input, init);
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                    );
                    if (
                        url.origin === facilitator &&
                        url.pathname === "/settle"
                    )
                        settlementSucceeded = true;
                    return response;
                },
            );
            const originalBatch = env.DB.batch.bind(env.DB);
            const batch = vi
                .spyOn(env.DB, "batch")
                .mockImplementation(async (statements) => {
                    if (settlementSucceeded && !failedCredit) {
                        failedCredit = true;
                        throw new Error(
                            "Injected local credit failure after mocked settlement",
                        );
                    }
                    return originalBatch(statements);
                });
            try {
                const headers = { "payment-signature": buyer.signature };
                const first = await send(owner, "p2", headers);
                const firstStatus = first.status;
                const firstBody = (await first.json()) as { key?: string };
                const returnedKey = typeof firstBody.key === "string";
                expect(failedCredit).toBe(true);
                const pending = await getPurchase(env.DB, buyer.id);
                expect(pending?.credited_at).toBeNull();
                expect((await ledger(owner)).paid).toBe(before.paid);
                expect((await send(owner, "p2", headers)).status).toBe(409);
                expect(calls.filter((path) => path === "/settle")).toHaveLength(
                    1,
                );
                const signedHeaders = {
                    ...headers,
                    ...(await proof(buyer.account, buyer.payment)),
                };
                const recovered = await send(owner, "p2", signedHeaders);
                expect(recovered.status).toBe(200);
                expect(((await recovered.json()) as { id: string }).id).toBe(
                    pending?.key_id,
                );
                expect((await send(owner, "p2", signedHeaders)).status).toBe(
                    200,
                );
                expect(calls.filter((path) => path === "/settle")).toHaveLength(
                    2,
                );
                const after = await ledger(owner);
                expect(after.paid - before.paid).toBe(2);
                expect(after.key_pollen - before.key_pollen).toBe(2);
                expect(after.keys - before.keys).toBe(1);
                expect(after.purchases - before.purchases).toBe(1);
                console.info(
                    "CREDIT_FAILURE",
                    JSON.stringify({
                        firstStatus,
                        returnedKey,
                        recoveryStatus: recovered.status,
                        settles: calls.filter((path) => path === "/settle")
                            .length,
                        credit: after.paid - before.paid,
                        keyCredit: after.key_pollen - before.key_pollen,
                    }),
                );
                expect(firstStatus).toBe(503);
                expect(returnedKey).toBe(false);
            } finally {
                batch.mockRestore();
                vi.unstubAllGlobals();
            }
        });

        test("a recovery proof is reusable from 120 s old to 30 s ahead, for its own origin", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "proof-window");
            const buyer = await buyerPayment(owner, "p2");
            const issuedAt = 1_800_000_000;
            const headers = await proof(buyer.account, buyer.payment, issuedAt);
            const check = (origin = "http://localhost") =>
                isBuyer(
                    origin,
                    buyer.signature,
                    headers["x402-buyer-signature"],
                    headers["x402-buyer-issued-at"],
                );
            const clock = vi.spyOn(Date, "now");
            try {
                for (const [offset, accepted] of [
                    [-31, false],
                    [-30, true],
                    [0, true],
                    [120, true],
                    [120.999, true],
                    [121, false],
                ] as const) {
                    clock.mockReturnValue((issuedAt + offset) * 1000);
                    expect(await check(), `${offset}s`).toBe(accepted);
                }
                clock.mockReturnValue(issuedAt * 1000);
                expect(await check()).toBe(true);
                expect(await check("https://enter.pollinations.ai")).toBe(
                    false,
                );
                expect(
                    await isBuyer(
                        "http://localhost",
                        buyer.signature,
                        headers["x402-buyer-signature"],
                        `${issuedAt}.0`,
                    ),
                ).toBe(false);
            } finally {
                clock.mockRestore();
            }
        });

        test("hands a new key out once when one payment races", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "race-new");
            const buyer = await buyerPayment(owner, "p2");
            const before = await ledger(owner);
            const calls = stubFacilitator(buyer.account.address);

            const responses = await Promise.all(
                Array.from({ length: 4 }, () =>
                    send(owner, "p2", { "payment-signature": buyer.signature }),
                ),
            );
            vi.unstubAllGlobals();

            expect(
                responses
                    .map((response) => response.status)
                    .sort((a, b) => a - b),
            ).toEqual([200, 409, 409, 409]);
            const winner = responses.find((response) => response.ok);
            const body = (await winner?.json()) as { id: string };
            const purchase = await getPurchase(env.DB, buyer.id);
            expect(body.id).toBe(purchase?.key_id);
            expect(purchase?.credited_at).not.toBeNull();
            expect(calls.filter((path) => path === "/settle")).toHaveLength(1);
            expect(await ledger(owner)).toEqual({
                paid: before.paid + 2,
                keys: before.keys + 1,
                key_pollen: before.key_pollen + 2,
                purchases: before.purchases + 1,
            });
        });

        test("refuses rebuilt replays that do not prove the paying wallet", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "race-replays");
            // Recorded and settling (or settled with a failed credit).
            const pending = await buyerPayment(owner, "p2");
            await preparePurchase(env, undefined, pending.id, owner, "p2");
            const done = await buyerPayment(owner, "p5");
            const issued = await preparePurchase(
                env,
                undefined,
                done.id,
                owner,
                "p5",
            );
            await creditPurchase(env.DB, done.id, owner, issued.id);

            // A third party rebuilds each header from a fresh public
            // challenge and the authorization published by settlement.
            const calls = stubFacilitator(pending.account.address);
            const rebuild = async (
                pack: string,
                { payload }: PaymentPayload,
            ) => {
                const terms = await challenge(owner, pack);
                return encodePaymentSignatureHeader({
                    x402Version: 2,
                    resource: terms.resource,
                    accepted: terms.accepts[0],
                    extensions: terms.extensions,
                    payload,
                } as PaymentPayload);
            };
            const pendingHeader = await rebuild("p2", pending.payment);
            const doneHeader = await rebuild("p5", done.payment);
            expect(await paymentId(pendingHeader)).toBe(pending.id);
            expect(await paymentId(doneHeader)).toBe(done.id);
            const stranger = privateKeyToAccount(generatePrivateKey());
            const now = Math.floor(Date.now() / 1000);
            const attempts: [string, string, Record<string, string>][] = [
                [pendingHeader, "p2", {}],
                [pendingHeader, "p2", {}],
                [doneHeader, "p5", {}],
                [pendingHeader, "p2", await proof(stranger, pending.payment)],
                [
                    pendingHeader,
                    "p2",
                    await proof(pending.account, done.payment),
                ],
                [
                    doneHeader,
                    "p5",
                    await proof(done.account, done.payment, now - 600),
                ],
                [
                    doneHeader,
                    "p5",
                    await proof(done.account, done.payment, now + 600),
                ],
                [
                    doneHeader,
                    "p5",
                    await proof(
                        done.account,
                        done.payment,
                        now,
                        "https://elsewhere.example",
                    ),
                ],
            ];
            const before = await ledger(owner);
            const responses = await Promise.all(
                attempts.map(([signature, pack, headers]) =>
                    send(owner, pack, {
                        "payment-signature": signature,
                        ...headers,
                    }),
                ),
            );
            vi.unstubAllGlobals();

            for (const response of responses) {
                expect(response.status).toBe(409);
                expect(await response.text()).not.toContain("sk_");
            }
            expect(calls).not.toContain("/verify");
            expect(calls).not.toContain("/settle");
            expect(await ledger(owner)).toEqual(before);
            expect(
                (await getPurchase(env.DB, pending.id))?.credited_at,
            ).toBeNull();
        });

        test("the paying wallet recovers its key; a pending one settles and credits once", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "race-recover");
            const buyer = await buyerPayment(owner, "p2");
            const issued = await preparePurchase(
                env,
                undefined,
                buyer.id,
                owner,
                "p2",
            );
            const before = await ledger(owner);
            const calls = stubFacilitator(buyer.account.address);
            const headers = {
                "payment-signature": buyer.signature,
                ...(await proof(buyer.account, buyer.payment)),
            };

            const recovered = await Promise.all([
                send(owner, "p2", headers),
                send(owner, "p2", headers),
            ]);
            expect(recovered.map((response) => response.status)).toEqual([
                200, 200,
            ]);
            for (const response of recovered)
                expect(((await response.json()) as { key: string }).key).toBe(
                    issued.key,
                );
            expect(calls).not.toContain("/verify");
            expect(calls.filter((path) => path === "/settle")).toHaveLength(2);

            // Credited now: the proof returns the key without settling again.
            const again = await send(owner, "p2", headers);
            vi.unstubAllGlobals();
            expect(again.status).toBe(200);
            expect(calls.filter((path) => path === "/settle")).toHaveLength(2);
            expect(await ledger(owner)).toEqual({
                ...before,
                paid: before.paid + 2,
                key_pollen: before.key_pollen + 2,
            });
        });
    });
});
