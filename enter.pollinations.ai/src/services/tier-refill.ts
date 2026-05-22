import type { Logger } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { user as userTable } from "@shared/db/better-auth.ts";
import { TIER_POLLEN, type TierName } from "@shared/tier-config.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

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

    // Restore the free tier floor without clobbering BYOP rewards credited into
    // tier_balance. Negative balances recover gradually through hourly refills.
    const hourlyResult = await db.run(sql`
        UPDATE user
        SET
            tier_balance = CASE tier
                WHEN 'spore' THEN CASE
                    WHEN COALESCE(tier_balance, 0) < 0 THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.spore}, ${TIER_POLLEN.spore})
                    ELSE MAX(COALESCE(tier_balance, 0), ${TIER_POLLEN.spore})
                END
                WHEN 'seed' THEN CASE
                    WHEN COALESCE(tier_balance, 0) < 0 THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.seed}, ${TIER_POLLEN.seed})
                    ELSE MAX(COALESCE(tier_balance, 0), ${TIER_POLLEN.seed})
                END
                WHEN 'flower' THEN CASE
                    WHEN COALESCE(tier_balance, 0) < 0 THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.flower}, ${TIER_POLLEN.flower})
                    ELSE MAX(COALESCE(tier_balance, 0), ${TIER_POLLEN.flower})
                END
                WHEN 'nectar' THEN CASE
                    WHEN COALESCE(tier_balance, 0) < 0 THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.nectar}, ${TIER_POLLEN.nectar})
                    ELSE MAX(COALESCE(tier_balance, 0), ${TIER_POLLEN.nectar})
                END
                WHEN 'router' THEN CASE
                    WHEN COALESCE(tier_balance, 0) < 0 THEN MIN(COALESCE(tier_balance, 0) + ${TIER_POLLEN.router}, ${TIER_POLLEN.router})
                    ELSE MAX(COALESCE(tier_balance, 0), ${TIER_POLLEN.router})
                END
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
            env.TINYBIRD_INGEST_TOKEN,
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
