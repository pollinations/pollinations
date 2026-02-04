import type { Logger } from "@logtape/logtape";
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

// KV key for tracking bulk refill timestamp (separate from individual user refills)
const BULK_REFILL_KV_KEY = "tier:bulk_refill:last_timestamp";

// Helper functions for tier refill
function getTodayStartMs(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

async function getLastBulkRefillTime(kv: KVNamespace): Promise<number> {
    const value = await kv.get(BULK_REFILL_KV_KEY);
    return value ? Number.parseInt(value, 10) : 0;
}

async function setLastBulkRefillTime(
    kv: KVNamespace,
    timestamp: number,
): Promise<void> {
    await kv.put(BULK_REFILL_KV_KEY, timestamp.toString());
}

function calculateTierBreakdown(
    users: Array<{
        tier: string | null;
        id: string;
        tierBalance: number | null;
    }>,
): Record<string, { count: number; pollenAmount: number }> {
    return users.reduce(
        (acc, user) => {
            const tier = user.tier as TierName;
            if (!acc[tier]) {
                acc[tier] = {
                    count: 0,
                    pollenAmount: TIER_POLLEN[tier] ?? TIER_POLLEN.spore,
                };
            }
            acc[tier].count++;
            return acc;
        },
        {} as Record<string, { count: number; pollenAmount: number }>,
    );
}

async function sendBulkTierRefillEvents(
    users: Array<{
        id: string;
        tier: string | null;
        tierBalance: number | null;
    }>,
    timestamp: string,
    environment: string,
    tinybirdUrl: string | undefined,
    tinybirdToken: string | undefined,
    logger: Logger,
): Promise<void> {
    if (!tinybirdUrl || !tinybirdToken || users.length === 0) {
        return;
    }

    const events = users
        .map((user) => {
            const tierName = user.tier as TierName;
            const pollenAmount = TIER_POLLEN[tierName] ?? TIER_POLLEN.spore;
            return JSON.stringify({
                event_type: "tier_refill",
                environment,
                user_id: user.id,
                tier: user.tier,
                pollen_amount: pollenAmount,
                previous_balance: user.tierBalance,
                timestamp,
            });
        })
        .join("\n");

    try {
        const response = await fetch(tinybirdUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tinybirdToken}`,
                "Content-Type": "application/x-ndjson",
            },
            body: events,
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(
                "Failed to send tier refill events to Tinybird: {error}",
                {
                    error: errorText,
                    status: response.status,
                },
            );
        }
    } catch (err) {
        logger.error("Failed to send tier refill events to Tinybird: {error}", {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export const adminRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const providedKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (!providedKey) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        // Full admin token has access to all endpoints
        if (providedKey === c.env.PLN_ENTER_TOKEN) {
            return await next();
        }

        // Refill token only has access to /trigger-refill endpoint
        if (
            providedKey === c.env.REFILL_TOKEN &&
            c.req.path.endsWith("/trigger-refill")
        ) {
            return await next();
        }

        throw new HTTPException(401, { message: "Unauthorized" });
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
        const kv = c.env.KV;

        // Check idempotency: has BULK refill already run today?
        // Uses KV to track bulk refill time separately from individual user refills
        const todayStartMs = getTodayStartMs();
        const lastBulkRefillMs = await getLastBulkRefillTime(kv);

        if (lastBulkRefillMs >= todayStartMs) {
            const lastRefillDate = new Date(lastBulkRefillMs).toISOString();
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

        // Get users before update (for Tinybird events)
        const usersToRefill = await db
            .select({
                id: userTable.id,
                tier: userTable.tier,
                tierBalance: userTable.tierBalance,
            })
            .from(userTable)
            .where(sql`tier IS NOT NULL`);

        // Bulk update all tier balances
        // If pack_balance is negative, use part of the tier refill to top it up to 0
        // This settles any "debt" from overspending the previous day
        const result = await db.run(sql`
            UPDATE user
            SET
                tier_balance = CASE tier
                    WHEN 'microbe' THEN ${TIER_POLLEN.microbe}
                    WHEN 'spore' THEN ${TIER_POLLEN.spore}
                    WHEN 'seed' THEN ${TIER_POLLEN.seed}
                    WHEN 'flower' THEN ${TIER_POLLEN.flower}
                    WHEN 'nectar' THEN ${TIER_POLLEN.nectar}
                    WHEN 'router' THEN ${TIER_POLLEN.router}
                    ELSE ${TIER_POLLEN.spore}
                END + MIN(COALESCE(pack_balance, 0), 0),
                pack_balance = CASE WHEN pack_balance < 0 THEN 0 ELSE pack_balance END,
                last_tier_grant = ${Date.now()}
            WHERE tier IS NOT NULL
        `);

        const refillCount = result.meta.changes ?? 0;
        const refillTimestamp = Date.now();
        const timestamp = new Date(refillTimestamp).toISOString();

        // Store bulk refill timestamp in KV for idempotency
        await setLastBulkRefillTime(kv, refillTimestamp);

        // Calculate tier breakdown for response
        const tierBreakdown = calculateTierBreakdown(usersToRefill);

        // Send per-user events to Tinybird
        c.executionCtx.waitUntil(
            sendBulkTierRefillEvents(
                usersToRefill,
                timestamp,
                c.env.ENVIRONMENT || "unknown",
                c.env.TINYBIRD_TIER_INGEST_URL,
                c.env.TINYBIRD_INGEST_TOKEN,
                log,
            ),
        );

        log.info("TIER_REFILL_COMPLETE: usersUpdated={usersUpdated}", {
            eventType: "tier_refill_complete",
            usersUpdated: refillCount,
            tierBreakdown,
        });

        return c.json({
            success: true,
            skipped: false,
            usersRefilled: refillCount,
            tierBreakdown,
            timestamp,
        });
    });
