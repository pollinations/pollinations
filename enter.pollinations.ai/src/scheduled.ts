import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { user as userTable } from "./db/schema/better-auth.ts";
import { sendTierEventToTinybird } from "./events.ts";
import { ensureConfigured } from "./logger.ts";
import { TIER_POLLEN, type TierName } from "./tier-config.ts";

export async function handleScheduled(
    _controller: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<void> {
    await ensureConfigured({
        level: env.LOG_LEVEL || "debug",
        format: env.LOG_FORMAT || "json",
    });
    const log = getLogger(["scheduled"]);
    const db = drizzle(env.DB);

    // Get users BEFORE the update to track individual refills (including current balance)
    const usersToRefill = await db
        .select({
            id: userTable.id,
            tier: userTable.tier,
            tierBalance: userTable.tierBalance,
        })
        .from(userTable)
        .where(sql`tier IS NOT NULL`);

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

    // Send per-user refill events to Tinybird
    if (usersToRefill.length > 0) {
        const timestamp = new Date().toISOString();
        const events = usersToRefill
            .map((user) => {
                const tierName = user.tier as TierName;
                const pollenAmount = TIER_POLLEN[tierName] ?? TIER_POLLEN.spore;
                return JSON.stringify({
                    event_type: "tier_refill",
                    environment: env.ENVIRONMENT || "unknown",
                    user_id: user.id,
                    tier: user.tier,
                    pollen_amount: pollenAmount,
                    previous_balance: user.tierBalance,
                    timestamp,
                });
            })
            .join("\n");

        ctx.waitUntil(
            fetch(env.TINYBIRD_TIER_INGEST_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
                    "Content-Type": "application/x-ndjson",
                },
                body: events,
            })
                .then(async (response) => {
                    if (!response.ok) {
                        const text = await response.text();
                        log.error(
                            "TINYBIRD_TIER_EVENTS_FAILED: status={status} statusText={statusText}",
                            {
                                eventType: "tinybird_tier_events_failed",
                                status: response.status,
                                statusText: response.statusText,
                                responseBody: text,
                            },
                        );
                    } else {
                        log.info("TINYBIRD_TIER_EVENTS_SENT: count={count}", {
                            eventType: "tinybird_tier_events_sent",
                            count: usersToRefill.length,
                        });
                    }
                })
                .catch((error) => {
                    log.error("TINYBIRD_TIER_EVENTS_ERROR: error={error}", {
                        eventType: "tinybird_tier_events_error",
                        error: String(error),
                    });
                }),
        );
    }

    // Also send aggregate event for backwards compatibility
    ctx.waitUntil(
        sendTierEventToTinybird(
            {
                event_type: "tier_refill",
                environment: env.ENVIRONMENT || "unknown",
                user_count: refillCount,
            },
            env.TINYBIRD_TIER_INGEST_URL,
            env.TINYBIRD_INGEST_TOKEN,
        ),
    );

    log.info("TIER_REFILL_COMPLETE: usersUpdated={usersUpdated}", {
        eventType: "tier_refill_complete",
        usersUpdated: refillCount,
    });
}
