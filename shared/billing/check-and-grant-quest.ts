import type { Logger } from "@logtape/logtape";
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { questDefinitions } from "../db/better-auth.ts";
import { sendRewardGrantEventToTinybird } from "../events.ts";
import type { Bucket } from "./deduction.ts";
import { grantReward } from "./grant-reward.ts";

export interface QuestTriggerContext {
    /** Worker execution context, used to fire the analytics event off the hot path. */
    waitUntil?: (promise: Promise<unknown>) => void;
    environment?: string;
    /** Reference Tinybird ingest URL (the generation_event ingest URL works). */
    tinybirdIngestUrl?: string;
    tinybirdIngestToken?: string;
    log: Logger;
}

export interface CheckAndGrantQuestResult {
    questKey: string;
    granted: boolean;
}

/**
 * Data-driven product-quest evaluation: given a trigger signal (e.g.
 * "first_image"), find the active quest definitions for it and grant any the
 * user hasn't earned yet. Idempotency is enforced by grantReward() via a
 * deterministic key "quest:{questKey}:{userId}", so re-firing the same signal
 * is safe and "once" repeatability falls out for free.
 *
 * Worker context only. After a fresh grant, emits a real-time reward_grant
 * event (via waitUntil, best-effort analytics) so live dashboards don't wait
 * for the daily d1_reward_grants snapshot. The authoritative record is still
 * the D1 reward_grants row written by grantReward().
 */
export async function checkAndGrantQuest(
    db: DrizzleD1Database,
    userId: string,
    triggerType: string,
    ctx: QuestTriggerContext,
): Promise<CheckAndGrantQuestResult[]> {
    const defs = await db
        .select()
        .from(questDefinitions)
        .where(
            and(
                eq(questDefinitions.triggerType, triggerType),
                eq(questDefinitions.active, true),
            ),
        );

    const results: CheckAndGrantQuestResult[] = [];

    for (const def of defs) {
        // NOTE: this handles "once" repeatability via the deterministic
        // idempotency key. weekly/streak/tiered quests need a window check
        // against reward_grants history (or derivation from usage pipes)
        // before granting — deferred until those quest types ship.
        if (def.repeatability !== "once") {
            ctx.log.debug(
                "Skipping non-once quest {key} (repeatability={repeat} not yet supported)",
                { key: def.key, repeat: def.repeatability },
            );
            continue;
        }

        const result = await grantReward(db, {
            idempotencyKey: `quest:${def.key}:${userId}`,
            userId,
            source: def.triggerType,
            questId: def.key,
            amount: def.rewardAmount,
            bucket: (def.balanceBucket as Bucket) ?? "tier",
            metadata: { title: def.title, category: def.category },
        });

        results.push({ questKey: def.key, granted: result.granted });

        if (result.granted) {
            const emit = sendRewardGrantEventToTinybird(
                {
                    environment: ctx.environment ?? "undefined",
                    user_id: userId,
                    source: def.triggerType,
                    quest_id: def.key,
                    pollen_credited: def.rewardAmount,
                    balance_bucket: def.balanceBucket ?? "tier",
                },
                ctx.tinybirdIngestUrl,
                ctx.tinybirdIngestToken,
                ctx.log,
            );
            if (ctx.waitUntil) {
                ctx.waitUntil(emit);
            } else {
                await emit;
            }
        }
    }

    return results;
}
