import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@/db/schema/better-auth.ts";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { handleBalanceDeduction } from "../utils/track-helpers.ts";

/**
 * Middleware: validates x-enter-token header against PLN_ENTER_TOKEN env var.
 * Protects internal endpoints from unauthorized access.
 */
function requireEnterToken(c: any, env: any) {
    const token = c.req.header("x-enter-token");
    if (!token || token !== env.PLN_ENTER_TOKEN) {
        throw new HTTPException(401, { message: "Invalid internal token" });
    }
}

/**
 * Internal routes for service-to-service communication.
 * Protected by x-enter-token header.
 * Called by gen.pollinations.ai via service binding.
 */
export const internalRoutes = new Hono<Env>()
    /**
     * POST /verify
     * Verifies an API key or session and returns full auth context.
     * gen calls this instead of querying D1 directly.
     */
    .post("/verify", async (c) => {
        requireEnterToken(c, c.env);

        const body = await c.req.json<{
            authorization?: string;
            cookie?: string;
        }>();

        const client = createAuth(c.env);
        const db = drizzle(c.env.DB);

        // Try session cookie first
        if (body.cookie) {
            const headers = new Headers();
            headers.set("cookie", body.cookie);
            const session = await client.api.getSession({ headers });
            if (session?.user) {
                const userData = await db
                    .select({
                        id: userTable.id,
                        tier: userTable.tier,
                        tierBalance: userTable.tierBalance,
                        packBalance: userTable.packBalance,
                        cryptoBalance: userTable.cryptoBalance,
                    })
                    .from(userTable)
                    .where(eq(userTable.id, session.user.id))
                    .get();

                if (userData) {
                    const hasPositiveBalance =
                        (userData.tierBalance ?? 0) > 0 ||
                        (userData.cryptoBalance ?? 0) > 0 ||
                        (userData.packBalance ?? 0) > 0;
                    const hasPaidBalance =
                        (userData.cryptoBalance ?? 0) > 0 ||
                        (userData.packBalance ?? 0) > 0;

                    return c.json({
                        valid: true,
                        userId: userData.id,
                        tier: userData.tier,
                        hasPositiveBalance,
                        hasPaidBalance,
                        balances: {
                            tier: userData.tierBalance ?? 0,
                            crypto: userData.cryptoBalance ?? 0,
                            pack: userData.packBalance ?? 0,
                        },
                    });
                }
            }
        }

        // Try API key
        if (body.authorization) {
            const match = body.authorization.match(/^Bearer (.+)$/);
            const rawKey = match?.[1] || body.authorization;

            const keyResult = await client.api.verifyApiKey({
                body: { key: rawKey },
            });

            if (!keyResult.valid || !keyResult.key) {
                return c.json({ valid: false }, 200);
            }

            // Fetch full key details from D1
            const apiKeyData = await db
                .select()
                .from(apikeyTable)
                .where(eq(apikeyTable.id, keyResult.key.id))
                .get();

            // Check expired/disabled
            if (apiKeyData?.expiresAt) {
                if (new Date(apiKeyData.expiresAt) < new Date()) {
                    return c.json({ valid: false }, 200);
                }
            }
            if (apiKeyData?.enabled === false) {
                return c.json({ valid: false }, 200);
            }

            // Fetch user data
            const userData = apiKeyData
                ? await db
                      .select({
                          id: userTable.id,
                          tier: userTable.tier,
                          tierBalance: userTable.tierBalance,
                          packBalance: userTable.packBalance,
                          cryptoBalance: userTable.cryptoBalance,
                      })
                      .from(userTable)
                      .where(eq(userTable.id, apiKeyData.userId))
                      .get()
                : null;

            const permissions = keyResult.key.permissions as
                | { models?: string[]; account?: string[] }
                | undefined;

            const hasPositiveBalance = userData
                ? (userData.tierBalance ?? 0) > 0 ||
                  (userData.cryptoBalance ?? 0) > 0 ||
                  (userData.packBalance ?? 0) > 0
                : false;
            const hasPaidBalance = userData
                ? (userData.cryptoBalance ?? 0) > 0 ||
                  (userData.packBalance ?? 0) > 0
                : false;

            return c.json({
                valid: true,
                userId: userData?.id,
                tier: userData?.tier,
                apiKeyId: keyResult.key.id,
                keyType: (keyResult.key.metadata as any)?.keyType || "secret",
                keyName: keyResult.key.name || null,
                permissions: permissions || null,
                pollenBudget: apiKeyData?.pollenBalance ?? null,
                hasPositiveBalance,
                hasPaidBalance,
                balances: userData
                    ? {
                          tier: userData.tierBalance ?? 0,
                          crypto: userData.cryptoBalance ?? 0,
                          pack: userData.packBalance ?? 0,
                      }
                    : null,
            });
        }

        return c.json({ valid: false }, 200);
    })
    /**
     * POST /deduct
     * Deducts pollen from user/API key balance.
     * gen calls this after a successful generation request.
     */
    .post("/deduct", async (c) => {
        requireEnterToken(c, c.env);

        const body = await c.req.json<{
            userId?: string;
            apiKeyId?: string;
            apiKeyPollenBalance?: number | null;
            amount: number;
            model?: string;
        }>();

        if (!body.amount || body.amount <= 0) {
            return c.json({ ok: true });
        }

        const db = drizzle(c.env.DB);

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: body.amount,
            userId: body.userId,
            apiKeyId: body.apiKeyId,
            apiKeyPollenBalance: body.apiKeyPollenBalance,
            modelResolved: body.model,
        });

        return c.json({ ok: true });
    });
