import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import { appKeyTopUp } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";

export function requireSandboxPurchase(env: CloudflareBindings) {
    if (
        !["local", "test", "staging"].includes(env.ENVIRONMENT) ||
        env.STRIPE_MODE !== "sandbox"
    )
        throw new HTTPException(404);
}

export async function getAppPurchase(
    env: CloudflareBindings,
    id: string,
    userId: string,
) {
    requireSandboxPurchase(env);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new HTTPException(400);
    const [purchase] = await drizzle(env.DB)
        .select()
        .from(appKeyTopUp)
        .where(eq(appKeyTopUp.id, id));
    if (!purchase || purchase.userId !== userId) throw new HTTPException(404);
    if (
        !purchase.completedAt &&
        !purchase.checkoutPack &&
        purchase.createdAt < Date.now() - 600_000
    )
        throw new HTTPException(410, {
            message: "Top-up request expired. Return to Play and try again.",
        });
    const key = await env.DB.prepare(`
        SELECT k.pollen_balance AS allowance, c.name AS appName,
               MAX(0, COALESCE(u.tier_balance, 0)) + MAX(0, COALESCE(u.pack_balance, 0)) AS balance
        FROM apikey k JOIN user u ON u.id = k.user_id JOIN apikey c ON c.id = k.byop_client_key_id
        WHERE k.id = ? AND k.user_id = ? AND k.byop_client_key_id = ?
          AND k.enabled = 1 AND c.enabled = 1
          AND (k.expires_at IS NULL OR k.expires_at > ?)
          AND (c.expires_at IS NULL OR c.expires_at > ?)
    `)
        .bind(
            purchase.keyId,
            userId,
            purchase.clientKeyId,
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
        )
        .first<{
            allowance: number | null;
            appName: string;
            balance: number;
        }>();
    if (!key)
        throw new HTTPException(403, {
            message: "Reconnect this app before topping up.",
        });
    if (key.allowance === null)
        throw new HTTPException(400, {
            message: "This key already has unlimited allowance.",
        });
    return { ...purchase, ...key, allowance: key.allowance };
}

// One database transaction claims the request and changes the allowance. Neither
// retries nor concurrent confirmations can replenish the key a second time.
export async function confirmAppTopUp(
    env: CloudflareBindings,
    id: string,
    userId: string,
) {
    const purchase = await getAppPurchase(env, id, userId);
    await env.DB.batch([
        env.DB.prepare(`UPDATE app_key_top_up SET completed_at = ?
            WHERE id = ? AND completed_at IS NULL AND checkout_pack IS NULL
            AND EXISTS (SELECT 1 FROM apikey k JOIN user u ON u.id = k.user_id
                JOIN apikey c ON c.id = app_key_top_up.client_key_id
                WHERE k.id = app_key_top_up.key_id AND k.enabled = 1
                AND k.user_id = app_key_top_up.user_id AND k.byop_client_key_id = c.id
                AND c.enabled = 1 AND (c.expires_at IS NULL OR c.expires_at > ?)
                AND (k.expires_at IS NULL OR k.expires_at > ?)
                AND ROUND(k.pollen_balance + app_key_top_up.amount, ${POLLEN_BILLING_PRECISION}) <=
                    MAX(0, COALESCE(u.tier_balance, 0)) + MAX(0, COALESCE(u.pack_balance, 0)))`).bind(
            Date.now(),
            id,
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
        ),
        env.DB.prepare(`UPDATE apikey SET pollen_balance = ROUND(pollen_balance + ?, ${POLLEN_BILLING_PRECISION})
            WHERE id = ? AND changes() = 1`).bind(
            purchase.amount,
            purchase.keyId,
        ),
    ]);
    const current = await getAppPurchase(env, id, userId);
    if (current.completedAt || current.checkoutPack) return current;
    const shortfall = current.allowance + current.amount - current.balance;
    const pack = [10, 20, 50, 100].find((amount) => amount >= shortfall);
    if (!pack)
        throw new HTTPException(409, {
            message: "Your balance changed. Start a new top-up.",
        });
    await env.DB.prepare(`UPDATE app_key_top_up SET checkout_pack = ?
        WHERE id = ? AND completed_at IS NULL AND checkout_pack IS NULL`)
        .bind(pack, id)
        .run();
    return getAppPurchase(env, id, userId);
}
