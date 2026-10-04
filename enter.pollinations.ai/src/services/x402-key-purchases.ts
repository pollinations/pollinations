import { createApiKeyForUser } from "@shared/auth/api-key-creation.ts";
import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import stableStringify from "fast-json-stable-stringify";
import { CompactEncrypt, compactDecrypt } from "jose";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";

type Purchase = {
    payment_id: string;
    user_id: string;
    key_id: string;
    pack_key: string;
    encrypted_key: string;
    credited_at: number | null;
};

const encoder = new TextEncoder();

async function encryptionKey(secret: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(
        await crypto.subtle.digest(
            "SHA-256",
            encoder.encode(`x402-key-purchase:${secret}`),
        ),
    );
}

async function encryptKey(key: string, secret: string): Promise<string> {
    return new CompactEncrypt(encoder.encode(key))
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
        .encrypt(await encryptionKey(secret));
}

async function decryptKey(ciphertext: string, secret: string): Promise<string> {
    const { plaintext } = await compactDecrypt(
        ciphertext,
        await encryptionKey(secret),
    );
    return new TextDecoder().decode(plaintext);
}

export async function paymentId(signature: string): Promise<string> {
    return paymentIdForPayload(decodePaymentSignatureHeader(signature));
}

export async function paymentIdForPayload(
    payment: PaymentPayload,
): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(stableStringify(payment)),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

export async function getPurchase(
    db: D1Database,
    id: string,
): Promise<Purchase | null> {
    return (
        (await db
            .prepare("SELECT * FROM x402_key_purchase WHERE payment_id = ?")
            .bind(id)
            .first<Purchase>()) ?? null
    );
}

export async function preparePurchase(
    env: Env["Bindings"],
    ctx: ExecutionContext | undefined,
    id: string,
    userId: string,
    packKey: string,
): Promise<{ id: string; key: string }> {
    const existing = await getPurchase(env.DB, id);
    if (existing) {
        if (existing.user_id !== userId || existing.pack_key !== packKey) {
            throw new Error("Payment already belongs to another purchase");
        }
        return {
            id: existing.key_id,
            key: await decryptKey(
                existing.encrypted_key,
                env.BETTER_AUTH_SECRET,
            ),
        };
    }

    // A pending key cannot spend Pollen. It becomes usable only after Weft
    // settles and creditPurchase atomically funds the wallet and key budget.
    const created = await createApiKeyForUser({
        authClient: createAuth(env, ctx),
        dbBinding: env.DB,
        userId,
        name: `x402 ${packKey}`,
        type: "secret",
        pollenBudget: 0,
        accountPermissions: [],
        defaultCreatedVia: "x402",
    });
    const encrypted = await encryptKey(created.key, env.BETTER_AUTH_SECRET);
    try {
        await env.DB.prepare(
            `INSERT INTO x402_key_purchase
             (payment_id, user_id, key_id, pack_key, encrypted_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
        )
            .bind(id, userId, created.id, packKey, encrypted, Date.now())
            .run();
    } catch (error) {
        // A concurrent retry may have won the unique payment-id insert.
        await env.DB.prepare(
            "DELETE FROM apikey WHERE id = ? AND pollen_balance = 0",
        )
            .bind(created.id)
            .run();
        const winner = await getPurchase(env.DB, id);
        if (!winner || winner.user_id !== userId || winner.pack_key !== packKey)
            throw error;
        return {
            id: winner.key_id,
            key: await decryptKey(winner.encrypted_key, env.BETTER_AUTH_SECRET),
        };
    }
    return { id: created.id, key: created.key };
}

export async function creditPurchase(
    db: D1Database,
    id: string,
    userId: string,
    keyId: string,
): Promise<void> {
    const purchase = await getPurchase(db, id);
    if (!purchase || purchase.user_id !== userId || purchase.key_id !== keyId) {
        throw new Error("Purchase record does not match the issued key");
    }
    if (purchase.credited_at !== null) return;
    const pack = getPollenPackByKey(purchase.pack_key);
    if (!pack) throw new Error("Purchase has an unknown Pollen pack");

    // D1 batch is transactional. Every update checks the pending purchase;
    // after the final update marks it complete, a replay changes no balances.
    const eligible = `EXISTS (
        SELECT 1 FROM x402_key_purchase p
        JOIN user u ON u.id = p.user_id
        JOIN apikey a ON a.id = p.key_id AND a.user_id = p.user_id
        WHERE p.payment_id = ? AND p.credited_at IS NULL
    )`;
    const results = await db.batch([
        db
            .prepare(
                `UPDATE user SET pack_balance = ROUND(COALESCE(pack_balance, 0) + ?, ${POLLEN_BILLING_PRECISION})
             WHERE id = ? AND ${eligible}`,
            )
            .bind(pack.amountUsd, userId, id),
        db
            .prepare(
                `UPDATE apikey SET pollen_balance = ROUND(pollen_balance + ?, ${POLLEN_BILLING_PRECISION})
             WHERE id = ? AND user_id = ? AND ${eligible}`,
            )
            .bind(pack.amountUsd, keyId, userId, id),
        db
            .prepare(
                `UPDATE x402_key_purchase SET credited_at = ?
             WHERE payment_id = ? AND credited_at IS NULL AND ${eligible}`,
            )
            .bind(Date.now(), id, id),
    ]);
    if (results.every((result) => result.meta.changes === 1)) return;
    if (
        results.every((result) => result.meta.changes === 0) &&
        ((await getPurchase(db, id))?.credited_at ?? null) !== null
    )
        return;
    throw new Error("x402 key purchase credit was not applied exactly once");
}
