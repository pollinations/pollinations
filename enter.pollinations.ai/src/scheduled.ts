import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { user as userTable } from "./db/schema/better-auth.ts";
import { sendTierEventToTinybird } from "./events.ts";
import { TIER_POLLEN, type TierName } from "./tier-config.ts";

export async function handleScheduled(
    _controller: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<void> {
    const db = drizzle(env.DB);

    // Get users BEFORE the update to track individual refills
    const usersToRefill = await db
        .select({
            id: userTable.id,
            tier: userTable.tier,
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
            }).catch((error) => {
                console.error(
                    "Failed to send tier refill events to Tinybird:",
                    error,
                );
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
                timestamp: new Date().toISOString(),
            },
            env.TINYBIRD_TIER_INGEST_URL,
            env.TINYBIRD_INGEST_TOKEN,
        ),
    );

    console.log(`Tier refill complete: ${refillCount} users updated`);
}
