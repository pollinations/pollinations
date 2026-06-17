import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGrantKey,
    type GrantCandidate,
    getQuestDefinition,
} from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const log = getLogger(["enter", "quest-evaluator"]);
const MAX_GRANTS_PER_RUN = 500;

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    granted: number;
};

async function grantCandidates({
    db,
    questId,
    candidates,
}: {
    db: ReturnType<typeof drizzle<typeof schema>>;
    questId: string;
    candidates: GrantCandidate[];
}): Promise<QuestEvaluatorResult> {
    const definition = getQuestDefinition(questId);
    if (!definition) {
        throw new Error(`Unknown quest definition: ${questId}`);
    }

    let granted = 0;
    for (const candidate of candidates) {
        const result = await grantReward(db, {
            idempotencyKey: buildGrantKey(definition, candidate),
            userId: candidate.userId,
            source: definition.eventType,
            questId,
            amount: definition.rewardAmount,
            bucket: definition.balanceBucket,
            sourceRef: candidate.sourceRef,
            metadata: {
                title: definition.title,
                category: definition.category,
                eventType: definition.eventType,
                ...candidate.metadata,
            },
        });
        if (result.granted) granted += 1;
    }

    return {
        questId,
        scanned: candidates.length,
        granted,
    };
}

async function findFirstApiKeyCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<GrantCandidate[]> {
    return await db.all<GrantCandidate>(
        sql`
        SELECT
            apikey.user_id AS userId,
            MIN(apikey.id) AS sourceRef
        FROM apikey
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                'quest:onboarding:first_api_key:user:' || apikey.user_id
        WHERE reward_grants.id IS NULL
        GROUP BY apikey.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );
}

async function findFirstTopUpCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<GrantCandidate[]> {
    return await db.all<GrantCandidate>(
        sql`
        SELECT
            stripe_checkout_credits.user_id AS userId,
            MIN(stripe_checkout_credits.session_id) AS sourceRef
        FROM stripe_checkout_credits
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                'quest:spend:first_top_up:user:' ||
                stripe_checkout_credits.user_id
        WHERE reward_grants.id IS NULL
        GROUP BY stripe_checkout_credits.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );
}

export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: true; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const results = [
        await grantCandidates({
            db,
            questId: "onboarding:first_api_key",
            candidates: await findFirstApiKeyCandidates(db),
        }),
        await grantCandidates({
            db,
            questId: "spend:first_top_up",
            candidates: await findFirstTopUpCandidates(db),
        }),
    ];

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", { results });
    return { success: true, results };
}
