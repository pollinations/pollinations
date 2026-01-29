import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sendTierEventToTinybird } from "@/events.ts";
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

        // Simple string comparison is fine here - timing attacks aren't practical over network
        if (providedKey !== adminKey) {
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

        // Get current tier before update for logging
        const [currentUser] = await db
            .select({ tier: userTable.tier })
            .from(userTable)
            .where(eq(userTable.id, body.userId));

        if (!currentUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        const previousTier = currentUser.tier;

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

        // Log tier change event to Tinybird
        c.executionCtx.waitUntil(
            sendTierEventToTinybird(
                {
                    event_type: "tier_change",
                    environment: c.env.ENVIRONMENT || "unknown",
                    user_id: body.userId,
                    tier: targetTier,
                    pollen_amount: tierBalance,
                },
                c.env.TINYBIRD_TIER_INGEST_URL,
                c.env.TINYBIRD_INGEST_TOKEN,
            ),
        );

        log.info(
            "Tier updated for user {userId} from {previousTier} to {tier} with balance {balance}",
            {
                userId: body.userId,
                previousTier,
                tier: targetTier,
                balance: tierBalance,
            },
        );

        return c.json({
            success: true,
            userId: body.userId,
            previousTier,
            tier: targetTier,
            tierBalance,
        });
    });
