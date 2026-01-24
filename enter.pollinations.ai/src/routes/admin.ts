import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getTierPollen, isValidTier, type TierName } from "@/tier-config.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";

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
    .post("/update-tier", async (c) => {
        // D1-only tier update - no Polar sync
        const body = await c.req.json<{ userId: string; tier: string }>();

        if (!body.userId) {
            throw new HTTPException(400, { message: "userId is required" });
        }
        if (!body.tier || !isValidTier(body.tier)) {
            throw new HTTPException(400, { message: "Valid tier is required" });
        }

        const targetTier = body.tier as TierName;
        const tierBalance = getTierPollen(targetTier);
        const db = drizzle(c.env.DB);

        // Update tier and balance in D1
        const result = await db
            .update(userTable)
            .set({
                tier: targetTier,
                tierBalance,
                lastTierGrant: Date.now(),
            })
            .where(eq(userTable.id, body.userId))
            .returning({ id: userTable.id });

        if (result.length === 0) {
            throw new HTTPException(404, { message: "User not found" });
        }

        log.info(
            "Tier updated for user {userId} to {tier} with balance {balance}",
            {
                userId: body.userId,
                tier: targetTier,
                balance: tierBalance,
            },
        );

        return c.json({
            success: true,
            userId: body.userId,
            tier: targetTier,
            tierBalance,
        });
    });
