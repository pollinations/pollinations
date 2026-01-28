import { getLogger } from "@logtape/logtape";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sendTierEventToTinybird } from "@/events.ts";
import {
    getTierPollen,
    isValidTier,
    TIER_POLLEN,
    type TierName,
} from "@/tier-config.ts";
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
    })
    .post("/trigger-refill", async (c) => {
        const db = drizzle(c.env.DB);

        // Get start of today (UTC midnight)
        const now = new Date();
        const todayStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const todayStartMs = todayStart.getTime();

        // Check if refill already ran today (idempotency check)
        const [lastRefill] = await db
            .select({ lastGrant: sql<number>`MAX(last_tier_grant)` })
            .from(userTable)
            .where(sql`tier IS NOT NULL`);

        if (lastRefill?.lastGrant && lastRefill.lastGrant >= todayStartMs) {
            const lastRefillDate = new Date(lastRefill.lastGrant).toISOString();
            log.info("TIER_REFILL_SKIPPED: already ran today at {lastRefill}", {
                eventType: "tier_refill_skipped",
                lastRefill: lastRefillDate,
            });
            return c.json({
                success: true,
                skipped: true,
                reason: "Already refilled today",
                lastRefill: lastRefillDate,
            });
        }

        // Get counts per tier before update
        const tierCounts = await db
            .select({
                tier: userTable.tier,
                count: sql<number>`COUNT(*)`,
            })
            .from(userTable)
            .where(sql`tier IS NOT NULL`)
            .groupBy(userTable.tier);

        // Perform the bulk UPDATE
        const result = await db.run(sql`
            UPDATE user
            SET
                tier_balance = CASE tier
                    WHEN 'spore' THEN ${TIER_POLLEN.spore}
                    WHEN 'seed' THEN ${TIER_POLLEN.seed}
                    WHEN 'flower' THEN ${TIER_POLLEN.flower}
                    WHEN 'nectar' THEN ${TIER_POLLEN.nectar}
                    WHEN 'router' THEN ${TIER_POLLEN.router}
                    ELSE ${TIER_POLLEN.spore}
                END,
                last_tier_grant = ${Date.now()}
            WHERE tier IS NOT NULL
        `);

        const refillCount = result.meta.changes ?? 0;
        const timestamp = new Date().toISOString();
        const environment = c.env.ENVIRONMENT || "unknown";

        // Send one event per tier to Tinybird (NDJSON format)
        c.executionCtx.waitUntil(
            (async () => {
                if (
                    !c.env.TINYBIRD_TIER_INGEST_URL ||
                    !c.env.TINYBIRD_INGEST_TOKEN
                )
                    return;
                const events = tierCounts
                    .filter((t) => t.tier)
                    .map((t) =>
                        JSON.stringify({
                            event_type: "tier_refill",
                            environment,
                            tier: t.tier,
                            user_count: t.count,
                            pollen_amount:
                                TIER_POLLEN[t.tier as TierName] ??
                                TIER_POLLEN.spore,
                            timestamp,
                        }),
                    )
                    .join("\n");

                await fetch(c.env.TINYBIRD_TIER_INGEST_URL, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${c.env.TINYBIRD_INGEST_TOKEN}`,
                        "Content-Type": "application/x-ndjson",
                    },
                    body: events,
                });
            })(),
        );

        log.info("TIER_REFILL_COMPLETE: usersUpdated={usersUpdated}", {
            eventType: "tier_refill_complete",
            usersUpdated: refillCount,
            tierBreakdown: Object.fromEntries(
                tierCounts.map((t) => [t.tier, t.count]),
            ),
        });

        return c.json({
            success: true,
            skipped: false,
            usersRefilled: refillCount,
            tierBreakdown: Object.fromEntries(
                tierCounts.map((t) => [
                    t.tier,
                    {
                        count: t.count,
                        pollenAmount:
                            TIER_POLLEN[t.tier as TierName] ??
                            TIER_POLLEN.spore,
                    },
                ]),
            ),
            timestamp,
        });
    });
