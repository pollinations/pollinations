import { createApiKeyForUser } from "@shared/auth/api-key-creation.ts";
import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { HTTPException } from "hono/http-exception";
import { CompactEncrypt, compactDecrypt } from "jose";
import { getAddress, verifyMessage } from "viem";
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

export function purchaseAmountUsd(value: string): number | undefined {
    const pack = getPollenPackByKey(value);
    if (pack) return pack.amountUsd;
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return undefined;
    const amount = Number(value);
    return amount >= 0.01 && amount <= 10_000 ? amount : undefined;
}

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

// One purchase per signed transfer. The EIP-3009 nonce is unique per token
// and payer; unsigned envelope fields (resource, extensions) are left out so
// they cannot mint a second purchase for the same transfer.
export function transferOf(payment: PaymentPayload) {
    const { authorization } = payment.payload as {
        authorization?: { from?: string; nonce?: string };
    };
    const nonce = authorization?.nonce ?? "";
    if (!/^0x[0-9a-fA-F]{64}$/.test(nonce))
        throw new Error("x402 payment has no EIP-3009 nonce");
    return {
        network: payment.accepted.network,
        asset: getAddress(payment.accepted.asset),
        payer: getAddress(authorization?.from ?? ""),
        nonce: nonce.toLowerCase(),
    };
}

export async function paymentIdForPayload(
    payment: PaymentPayload,
): Promise<string> {
    const { network, asset, payer, nonce } = transferOf(payment);
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(`${network}:${asset}:${payer}:${nonce}`.toLowerCase()),
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

// Settlement publishes the signed payment on-chain, so anyone can rebuild a
// PAYMENT-SIGNATURE header. Only the request that records the payment gets
// the new key; later requests must prove they hold the paying wallet.
export async function preparePurchase(
    env: Env["Bindings"],
    ctx: ExecutionContext | undefined,
    id: string,
    userId: string,
    packKey: string,
): Promise<{ id: string; key: string }> {
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
        await env.DB.prepare(
            "DELETE FROM apikey WHERE id = ? AND pollen_balance = 0",
        )
            .bind(created.id)
            .run();
        if (!(await getPurchase(env.DB, id))) throw error;
        throw new HTTPException(409, {
            message: "x402 payment already used",
        });
    }
    return { id: created.id, key: created.key };
}

export async function storedKey(
    env: Env["Bindings"],
    purchase: Purchase,
): Promise<{ id: string; key: string }> {
    return {
        id: purchase.key_id,
        key: await decryptKey(purchase.encrypted_key, env.BETTER_AUTH_SECRET),
    };
}

export const recoveryMessage = (
    origin: string,
    transfer: ReturnType<typeof transferOf>,
    issuedAt: string,
) =>
    [
        "Recover Pollinations x402 key",
        `Origin: ${origin}`,
        `Network: ${transfer.network}`,
        `Asset: ${transfer.asset}`,
        `Payer: ${transfer.payer}`,
        `Nonce: ${transfer.nonce}`,
        `Issued at: ${issuedAt}`,
    ].join("\n");

// The paying wallet personal_signs recoveryMessage. issuedAt must be a whole
// unix second from 120 s before to 30 s after the server clock; the proof is
// reusable inside that window. EOA wallets only: smart-wallet buyers recover
// through support.
export async function isBuyer(
    origin: string,
    paymentHeader: string,
    signature: string | undefined,
    issuedAt: string | undefined,
): Promise<boolean> {
    if (!signature || !issuedAt || !/^\d{1,12}$/.test(issuedAt)) return false;
    const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
    if (age < -30 || age > 120) return false;
    const transfer = transferOf(decodePaymentSignatureHeader(paymentHeader));
    return verifyMessage({
        address: transfer.payer,
        message: recoveryMessage(origin, transfer, issuedAt),
        signature: signature as `0x${string}`,
    }).catch(() => false);
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
    const amountUsd = purchaseAmountUsd(purchase.pack_key);
    if (!amountUsd) throw new Error("Purchase has an invalid amount");

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
            .bind(amountUsd, userId, id),
        db
            .prepare(
                `UPDATE apikey SET pollen_balance = ROUND(pollen_balance + ?, ${POLLEN_BILLING_PRECISION})
             WHERE id = ? AND user_id = ? AND ${eligible}`,
            )
            .bind(amountUsd, keyId, userId, id),
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
