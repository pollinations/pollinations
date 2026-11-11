import { createExecutionContext, env, SELF } from "cloudflare:test";
import {
    decodePaymentRequiredHeader,
    encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { Hono } from "hono";
import { describe, expect, vi } from "vitest";
import type { Env } from "../../src/env.ts";
import { logger } from "../../src/middleware/logger.ts";
import { x402KeysRoutes } from "../../src/routes/x402-keys.ts";
import {
    creditPurchase,
    getPurchase,
    legacyPaymentId,
    paymentId,
    preparePurchase,
} from "../../src/services/x402-key-purchases.ts";
import { createApiKeyViaApi, test } from "../fixtures.ts";

const randomHex = (bytes: number) =>
    `0x${Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("")}`;

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
                authorization: { from: randomHex(20), nonce: randomHex(32) },
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

        const response = await x402KeysRoutes.request(
            "http://localhost/p5",
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
        expect(response.status).toBe(409);
    });

    describe("replays and races", () => {
        const facilitator = "https://x402.staging.weft.network";
        // Mounted with the app logger, which the credit-failure branch uses.
        const app = new Hono<Env>().use("*", logger).route("/", x402KeysRoutes);
        const send = (
            holdingUserId: string,
            pack: string,
            headers: Record<string, string> = {},
        ) =>
            app.request(
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

        const payer = "0x1111111111111111111111111111111111111111";

        // Facilitator stand-in that logs every call. Unless told to refuse,
        // it verifies and settles everything, so the route alone must keep
        // payments single-use.
        function stubFacilitator(
            onVerify?: () => Promise<void>,
            refusals: Record<string, unknown> = {},
        ) {
            const calls: string[] = [];
            const originalFetch = globalThis.fetch;
            vi.stubGlobal(
                "fetch",
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                    );
                    if (url.origin !== facilitator)
                        return originalFetch(input, init);
                    calls.push(url.pathname);
                    if (url.pathname === "/verify") await onVerify?.();
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
                        ...refusals,
                    }[url.pathname];
                    return body
                        ? Response.json(body)
                        : Response.json({}, { status: 500 });
                },
            );
            return calls;
        }

        // A payment for the route's own terms. The facilitator is stubbed,
        // so the transfer needs no real signature.
        async function payment(holdingUserId: string, pack: string) {
            stubFacilitator();
            const terms = (await send(holdingUserId, pack)).headers.get(
                "payment-required",
            );
            vi.unstubAllGlobals();
            if (!terms) throw new Error("Missing x402 payment terms");
            const challenge = decodePaymentRequiredHeader(terms);
            const accepted = challenge.accepts[0];
            const payload: PaymentPayload = {
                x402Version: 2,
                resource: challenge.resource,
                accepted,
                payload: {
                    authorization: {
                        from: randomHex(20),
                        to: accepted.payTo,
                        value: accepted.amount,
                        validAfter: "0",
                        validBefore: "9999999999",
                        nonce: randomHex(32),
                    },
                    signature: randomHex(65),
                },
            };
            const signature = encodePaymentSignatureHeader(payload);
            return { payload, signature, id: await paymentId(signature) };
        }

        // Same signed transfer, other unsigned metadata.
        const variant = ({ payload }: { payload: PaymentPayload }) =>
            encodePaymentSignatureHeader({
                ...payload,
                resource: {
                    url: payload.resource?.url ?? "",
                    description: "Same transfer, other description",
                },
            });

        test("never returns a key for a recorded payment", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "replay-recorded");
            const pending = await payment(owner, "p2");
            await preparePurchase(env, undefined, pending.id, owner, "p2");
            const done = await payment(owner, "p5");
            const issued = await preparePurchase(
                env,
                undefined,
                done.id,
                owner,
                "p5",
            );
            await creditPurchase(env.DB, done.id, owner, issued.id);
            expect(await paymentId(variant(done))).toBe(done.id);
            const before = await ledger(owner);
            const calls = stubFacilitator();

            const responses = await Promise.all(
                [
                    [pending.signature, "p2"],
                    [done.signature, "p5"],
                    [variant(done), "p5"],
                    [done.signature, "p2"],
                ].map(([signature, pack]) =>
                    send(owner, pack, { "payment-signature": signature }),
                ),
            );
            vi.unstubAllGlobals();

            for (const response of responses) {
                expect(response.status).toBe(409);
                const body = await response.text();
                expect(body).not.toContain("sk_");
                expect(body).toContain("hello@pollinations.ai");
            }
            expect(calls).not.toContain("/verify");
            expect(calls).not.toContain("/settle");
            expect(await ledger(owner)).toEqual(before);
            expect(
                (await getPurchase(env.DB, pending.id))?.credited_at,
            ).toBeNull();
        });

        // Purchases recorded before transfer ids are stored under the hash of
        // the whole envelope.
        async function oldPurchase(owner: string) {
            const buyer = await payment(owner, "p2");
            const oldId = await legacyPaymentId(buyer.signature);
            expect(oldId).not.toBe(buyer.id);
            const issued = await preparePurchase(
                env,
                undefined,
                oldId,
                owner,
                "p2",
            );
            await creditPurchase(env.DB, oldId, owner, issued.id);
            return buyer;
        }

        test("an old purchase replayed as recorded gets 409 before verify", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "old-replay");
            const buyer = await oldPurchase(owner);
            const before = await ledger(owner);
            const calls = stubFacilitator();

            const response = await send(owner, "p2", {
                "payment-signature": buyer.signature,
            });
            vi.unstubAllGlobals();

            expect(response.status).toBe(409);
            expect(await response.text()).not.toContain("sk_");
            expect(calls).not.toContain("/verify");
            expect(calls).not.toContain("/settle");
            expect(await ledger(owner)).toEqual(before);
        });

        // Other unsigned fields give another old id, so only the facilitator
        // refusing the spent nonce stops this replay.
        test("an old purchase in another envelope gets no key when its nonce is refused", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "old-variant");
            const reason = "invalid_exact_evm_nonce_already_used";
            for (const refusal of [
                { "/verify": { isValid: false, invalidReason: reason, payer } },
                {
                    "/settle": {
                        success: false,
                        errorReason: reason,
                        transaction: "",
                        network: "eip155:84532",
                        payer,
                    },
                },
            ]) {
                const buyer = await oldPurchase(owner);
                const before = await ledger(owner);
                const calls = stubFacilitator(undefined, refusal);

                const response = await send(owner, "p2", {
                    "payment-signature": variant(buyer),
                });
                vi.unstubAllGlobals();

                expect(response.status).toBe(402);
                expect(await response.text()).not.toContain("sk_");
                expect(calls).toContain("/verify");
                const after = await ledger(owner);
                expect(after.paid).toBe(before.paid);
                expect(after.key_pollen).toBe(before.key_pollen);
                expect(
                    (await getPurchase(env.DB, buyer.id))?.credited_at ?? null,
                ).toBeNull();
            }
        });

        test("one transfer in two envelopes verified at once is one purchase", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "race-envelopes");
            const buyer = await payment(owner, "p2");
            const before = await ledger(owner);
            let verified = 0;
            let release = () => {};
            const bothVerified = new Promise<void>((resolve) => {
                release = resolve;
            });
            const calls = stubFacilitator(async () => {
                if (++verified === 2) release();
                await bothVerified;
            });

            const responses = await Promise.all(
                [buyer.signature, variant(buyer)].map((signature) =>
                    send(owner, "p2", { "payment-signature": signature }),
                ),
            );
            vi.unstubAllGlobals();

            expect(verified).toBe(2);
            expect(
                responses
                    .map((response) => response.status)
                    .sort((a, b) => a - b),
            ).toEqual([200, 409]);
            expect(calls.filter((path) => path === "/settle")).toHaveLength(1);
            expect(await ledger(owner)).toEqual({
                paid: before.paid + 2,
                keys: before.keys + 1,
                key_pollen: before.key_pollen + 2,
                purchases: before.purchases + 1,
            });
        });

        test("credits a racing payment once", async ({ accountToken }) => {
            const owner = await holdingOwner(accountToken, "race-duplicate");
            const buyer = await payment(owner, "p2");
            const before = await ledger(owner);
            const calls = stubFacilitator();

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
            expect(calls.filter((path) => path === "/settle")).toHaveLength(1);
            expect(await ledger(owner)).toEqual({
                paid: before.paid + 2,
                keys: before.keys + 1,
                key_pollen: before.key_pollen + 2,
                purchases: before.purchases + 1,
            });
        });

        test("a failed credit answers 503 without a key", async ({
            accountToken,
        }) => {
            const owner = await holdingOwner(accountToken, "credit-failure");
            const buyer = await payment(owner, "p2");
            const before = await ledger(owner);
            const calls = stubFacilitator();
            const batch = env.DB.batch.bind(env.DB);
            let failed = false;
            const failCredit = vi
                .spyOn(env.DB, "batch")
                .mockImplementation((statements) => {
                    if (!calls.includes("/settle") || failed)
                        return batch(statements);
                    failed = true;
                    return Promise.reject(new Error("Injected credit failure"));
                });
            try {
                const headers = { "payment-signature": buyer.signature };
                const first = await send(owner, "p2", headers);
                expect(failed).toBe(true);
                expect(first.status).toBe(503);
                expect(await first.text()).not.toContain("sk_");
                expect(
                    (await getPurchase(env.DB, buyer.id))?.credited_at,
                ).toBeNull();
                expect((await send(owner, "p2", headers)).status).toBe(409);
                expect(calls.filter((path) => path === "/settle")).toHaveLength(
                    1,
                );
                expect((await ledger(owner)).paid).toBe(before.paid);
            } finally {
                failCredit.mockRestore();
                vi.unstubAllGlobals();
            }
        });
    });
});
