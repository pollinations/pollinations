import { getLogger } from "@logtape/logtape";
import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    getTierProductMapCached,
    isValidTier,
    type TierName,
} from "@/utils/polar.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { syncUserTier } from "../tier-sync.ts";

const log = getLogger(["hono", "admin"]);

export const adminRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        // Use PLN_ENTER_TOKEN for admin authentication (already in GH secrets)
        const adminKey = c.env.PLN_ENTER_TOKEN;

        const authHeader = c.req.header("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        const providedKey = authHeader.slice(7);

        // Constant-time comparison to prevent timing attacks
        if (providedKey.length !== adminKey.length) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        let result = 0;
        for (let i = 0; i < providedKey.length; i++) {
            result |= providedKey.charCodeAt(i) ^ adminKey.charCodeAt(i);
        }
        if (result !== 0) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return await next();
    })
    .post("/sync-tier", async (c) => {
        const body = await c.req.json<{ userId: string; tier?: string }>();

        if (!body.userId) {
            throw new HTTPException(400, { message: "userId is required" });
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
                throw new HTTPException(404, { message: "User not found" });
            }

            const userTier = users[0]?.tier;
            if (!userTier || !isValidTier(userTier)) {
                throw new HTTPException(400, {
                    message: "User has invalid tier",
                });
            }
            targetTier = userTier;
        }

        // Initialize Polar client
        const polar = new Polar({
            accessToken: c.env.POLAR_ACCESS_TOKEN,
            server:
                c.env.POLAR_SERVER === "production" ? "production" : "sandbox",
        });

        const productMap = await getTierProductMapCached(polar, c.env.KV);

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

            throw new HTTPException(500, {
                message: result.error || "Tier sync failed",
            });
        }
    });
