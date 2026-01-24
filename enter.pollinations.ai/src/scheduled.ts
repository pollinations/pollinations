import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sendTierEventToTinybird } from "./events.ts";
import { TIER_POLLEN } from "./tier-config.ts";

export async function handleScheduled(
    _controller: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<void> {
    const db = drizzle(env.DB);

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

    console.log(`Tier refill complete: ${refillCount} users updated`);
}
