import { env, SELF } from "cloudflare:test";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { describe, expect } from "vitest";
import { x402KeysRoutes } from "../../src/routes/x402-keys.ts";
import {
    creditPurchase,
    getPurchase,
    preparePurchase,
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

    test("does not advertise payment terms before the seller is configured", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/x402/keys/p2",
            { method: "POST" },
        );
        expect(response.status).toBe(503);
        expect(response.headers.get("payment-required")).toBeNull();
    });

    test("offers an exact x402 challenge for a configured holding account", async ({
        sessionToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(sessionToken, {
            name: "holding-owner-challenge",
        });
        const owner = await env.DB.prepare(
            "SELECT user_id FROM apikey WHERE id = ?",
        )
            .bind(ownerKey.id)
            .first<{ user_id: string }>();
        if (!owner) throw new Error("Test account is missing");
        const response = await x402KeysRoutes.request(
            "http://localhost/p2",
            { method: "POST" },
            {
                ...env,
                X402_HOLDING_USER_ID: owner.user_id,
                WEFT_SELLER_API_KEY: "ax_test",
                WEFT_FACILITATOR_URL: "https://x402.staging.weft.network",
                WEFT_NETWORK: "eip155:84532",
                WEFT_PAY_TO: "0x3b0b371ae3cb08f272b87319684f6518b3b313a0",
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
                amount: "2000000",
                payTo: "0x3b0b371ae3cb08f272b87319684f6518b3b313a0",
            }),
        );
    });

    test("credits a new key and its holding wallet only once", async ({
        sessionToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(sessionToken, {
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
            "p2",
        );
        expect(issued.key).toMatch(/^sk_/);
        const pending = await getPurchase(env.DB, id);
        expect(pending?.credited_at).toBeNull();
        expect(pending?.encrypted_key).not.toContain(issued.key);
        expect(
            await preparePurchase(env, undefined, id, owner.user_id, "p2"),
        ).toEqual(issued);

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
        expect(await keyBalance.json()).toEqual({ balance: 2 });
        const account = await env.DB.prepare(
            "SELECT pack_balance FROM user WHERE id = ?",
        )
            .bind(owner.user_id)
            .first<{ pack_balance: number }>();
        expect(account?.pack_balance).toBe((owner.pack_balance ?? 0) + 2);

        const listKeys = await SELF.fetch(
            "http://localhost:3000/api/account/keys",
            { headers: { Authorization: `Bearer ${issued.key}` } },
        );
        expect(listKeys.status).toBe(403);
        expect((await getPurchase(env.DB, id))?.credited_at).not.toBeNull();
    });

    test("rejects reusing one payment for a different pack", async ({
        sessionToken,
    }) => {
        const ownerKey = await createApiKeyViaApi(sessionToken, {
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
        ).rejects.toThrow("another purchase");
    });
});
