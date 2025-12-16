import { Hono } from "hono";
import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { Polar } from "@polar-sh/sdk";
import type { Env } from "../env.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import {
    isValidTier,
    syncUserTier,
    getTierProductMap,
    type TierName,
} from "../tier-sync.ts";

const log = getLogger(["hono", "admin"]);

export const adminRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        // Use ENTER_TOKEN for admin authentication (already in GH secrets)
        const adminKey = c.env.ENTER_TOKEN;
        if (!adminKey) {
            return c.json({ error: "Admin API not configured" }, 500);
        }

        const authHeader = c.req.header("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return c.json({ error: "Unauthorized" }, 401);
        }
        const providedKey = authHeader.slice(7);

        // Constant-time comparison to prevent timing attacks
        if (providedKey.length !== adminKey.length) {
            return c.json({ error: "Unauthorized" }, 401);
        }
        let result = 0;
        for (let i = 0; i < providedKey.length; i++) {
            result |= providedKey.charCodeAt(i) ^ adminKey.charCodeAt(i);
        }
        if (result !== 0) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        return await next();
    })
    .post("/sync-tier", async (c) => {
        const body = await c.req.json<{ userId: string; tier?: string }>();

        if (!body.userId) {
            return c.json({ error: "userId is required" }, 400);
        }

        const db = drizzle(c.env.DB);

        // Look up the user's tier from D1 if not provided
        let targetTier: TierName;
        if (body.tier && isValidTier(body.tier)) {
            targetTier = body.tier;
        } else {
            const users = await db
                .select({ tier: userTable.tier })
                .from(userTable)
                .where(eq(userTable.id, body.userId))
                .limit(1);

            if (users.length === 0) {
                return c.json({ error: "User not found" }, 404);
            }

            const userTier = users[0]?.tier;
            if (!userTier || !isValidTier(userTier)) {
                return c.json({ error: "User has invalid tier" }, 400);
            }
            targetTier = userTier;
        }

        // Initialize Polar client
        if (!c.env.POLAR_ACCESS_TOKEN) {
            return c.json({ error: "Polar not configured" }, 500);
        }

        const polar = new Polar({
            accessToken: c.env.POLAR_ACCESS_TOKEN,
            server:
                c.env.POLAR_SERVER === "production" ? "production" : "sandbox",
        });

        const productMap = getTierProductMap(c.env);

        // Sync tier directly with retry logic
        const result = await syncUserTier(
            polar,
            body.userId,
            targetTier,
            productMap,
        );

        if (result.success) {
            log.info(
                "Tier sync completed for user {userId} to tier {tier} in {attempts} attempt(s)",
                {
                    userId: body.userId,
                    tier: targetTier,
                    attempts: result.attempts,
                },
            );

            return c.json({
                success: true,
                userId: body.userId,
                targetTier,
                attempts: result.attempts,
            });
        } else {
            log.error("Tier sync failed for user {userId}: {error}", {
                userId: body.userId,
                error: result.error,
            });

            return c.json(
                {
                    success: false,
                    userId: body.userId,
                    targetTier,
                    error: result.error,
                    attempts: result.attempts,
                },
                500,
            );
        }
    });
