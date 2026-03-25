import type { Logger } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sendTierEventToTinybird } from "@/events.ts";
import { runD1TinybirdSync } from "@/scheduled/d1-tinybird-sync.ts";
import {
    getTierPollen,
    isValidTier,
    TIER_POLLEN,
    type TierName,
} from "@/tier-config.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";

const log = getLogger(["hono", "admin"]);

// KV key for tracking bulk refill timestamp
const HOURLY_REFILL_KV_KEY = "tier:bulk_refill:hourly:last_timestamp";

function getCurrentHourMs(): number {
    const now = new Date();
    return Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
    );
}

async function getLastRefillTime(
    kv: KVNamespace,
    key: string,
): Promise<number> {
    const value = await kv.get(key);
    return value ? Number.parseInt(value, 10) : 0;
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
                    pollenAmount: TIER_POLLEN[tier] ?? 0,
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
        logger.warn(
            "TINYBIRD_TIER_SKIP: url={url} token={token} users={users}",
            {
                url: !!tinybirdUrl,
                token: !!tinybirdToken,
                users: users.length,
            },
        );
        return;
    }

    const events = users
        .map((user) => {
            const tierName = user.tier as TierName;
            const pollenAmount = TIER_POLLEN[tierName] ?? 0;
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

        const responseText = await response.text();

        if (!response.ok) {
            logger.error("TINYBIRD_TIER_ERROR: status={status} error={error}", {
                status: response.status,
                error: responseText,
            });
        } else {
            try {
                const result = JSON.parse(responseText);
                logger.info(
                    "TINYBIRD_TIER_SENT: total={total} success={success} quarantined={quarantined}",
                    {
                        total: users.length,
                        success: result.successful_rows ?? 0,
                        quarantined: result.quarantined_rows ?? 0,
                    },
                );
            } catch {
                logger.info(
                    "TINYBIRD_TIER_SENT: total={total} response={response}",
                    { total: users.length, response: responseText },
                );
            }
        }
    } catch (err) {
        logger.error("TINYBIRD_TIER_FAIL: error={error}", {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Core refill logic — callable from both the HTTP endpoint and CF scheduled handler.
 * Runs hourly refills for all tiers with idempotency check.
 *
 * All tiers refill hourly: adds pollen increment each hour, capped at tier max.
 */
export async function runTierRefill(
    env: CloudflareBindings,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
) {
    const db = drizzle(env.DB);
    const kv = env.KV;
    const refillTimestamp = Date.now();
    const timestamp = new Date(refillTimestamp).toISOString();

    // --- Hourly refill (all tiers) ---
    const currentHourMs = getCurrentHourMs();
    const lastHourlyMs = await getLastRefillTime(kv, HOURLY_REFILL_KV_KEY);
    const hourlySkipped = lastHourlyMs >= currentHourMs;

    if (hourlySkipped) {
        log.info("TIER_REFILL_SKIPPED: hourly already ran", {
            eventType: "tier_refill_skipped",
        });
        return {
            success: true,
            skipped: true,
            timestamp,
        };
    }

    // Snapshot balances before updates (for Tinybird events)
    const usersBeforeRefill = await db
        .select({
            id: userTable.id,
            tier: userTable.tier,
            tierBalance: userTable.tierBalance,
        })
        .from(userTable)
        .where(sql`tier IS NOT NULL`);

    // Add hourly pollen, capped at the tier max (negative balances recover gradually)
    const hourlyResult = await db.run(sql`
        UPDATE user
        SET
            tier_balance = CASE tier
                WHEN 'spore' THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.spore}, ${TIER_POLLEN.spore})
                WHEN 'seed' THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.seed}, ${TIER_POLLEN.seed})
                WHEN 'flower' THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.flower}, ${TIER_POLLEN.flower})
                WHEN 'nectar' THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.nectar}, ${TIER_POLLEN.nectar})
                WHEN 'router' THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.router}, ${TIER_POLLEN.router})
                ELSE tier_balance
            END,
            last_tier_grant = ${refillTimestamp}
        WHERE tier IN ('spore', 'seed', 'flower', 'nectar', 'router')
    `);
    const refillCount = hourlyResult.meta.changes ?? 0;
    await kv.put(HOURLY_REFILL_KV_KEY, refillTimestamp.toString());

    const tierBreakdown = calculateTierBreakdown(usersBeforeRefill);
    const usersForEvents = usersBeforeRefill.filter((u) => u.tier != null);

    ctx.waitUntil(
        sendBulkTierRefillEvents(
            usersForEvents,
            timestamp,
            env.ENVIRONMENT || "unknown",
            env.TINYBIRD_TIER_INGEST_URL,
            env.TINYBIRD_TIER_INGEST_TOKEN,
            log,
        ),
    );
    log.info("TIER_REFILL_COMPLETE: usersUpdated={usersUpdated}", {
        eventType: "tier_refill_complete",
        usersUpdated: refillCount,
        tierBreakdown,
    });

    return {
        success: true,
        skipped: false,
        usersRefilled: refillCount,
        tierBreakdown,
        timestamp,
    };
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

        // Tinybird sync token: authenticates the GH Action AND is used for Tinybird API calls
        const syncToken = c.env.TINYBIRD_D1_SYNC_TOKEN;
        if (
            syncToken &&
            providedKey === syncToken &&
            c.req.path.endsWith("/trigger-d1-sync")
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
                c.env.TINYBIRD_TIER_INGEST_TOKEN,
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
        const result = await runTierRefill(c.env, c.executionCtx);
        return c.json(result);
    })
    .post("/trigger-d1-sync", async (c) => {
        const syncToken = c.env.TINYBIRD_D1_SYNC_TOKEN;
        if (!syncToken) {
            throw new HTTPException(500, {
                message: "TINYBIRD_D1_SYNC_TOKEN not configured",
            });
        }

        const results = await runD1TinybirdSync(c.env.DB, syncToken);
        const hasErrors = results.some((r) => r.status === "error");

        return c.json(
            { success: !hasErrors, tables: results },
            hasErrors ? 207 : 200,
        );
    });
