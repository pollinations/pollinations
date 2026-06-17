import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { getQuestDefinition } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const log = getLogger(["enter", "quest-evaluator"]);
const MAX_GRANTS_PER_RUN = 500;

type Candidate = {
    user_id: string;
    source_ref: string | null;
};

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    granted: number;
};

function questGrantKey(questId: string, userId: string): string {
    return `quest:${questId}:user:${userId}`;
}

async function grantCandidates({
    db,
    questId,
    source,
    candidates,
}: {
    db: ReturnType<typeof drizzle<typeof schema>>;
    questId: string;
    source: "onboarding" | "spend";
    candidates: Candidate[];
}): Promise<QuestEvaluatorResult> {
    const definition = getQuestDefinition(questId);
    if (!definition) {
        throw new Error(`Unknown quest definition: ${questId}`);
    }

    let granted = 0;
    for (const candidate of candidates) {
        const result = await grantReward(db, {
            idempotencyKey: questGrantKey(questId, candidate.user_id),
            userId: candidate.user_id,
            source,
            questId,
            amount: definition.rewardAmount,
            bucket: definition.balanceBucket,
            sourceRef: candidate.source_ref,
            metadata: {
                title: definition.title,
                category: definition.category,
                trigger: definition.trigger,
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
): Promise<Candidate[]> {
    return await db.all<Candidate>(
        sql`
        SELECT
            apikey.user_id,
            MIN(apikey.id) AS source_ref
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
): Promise<Candidate[]> {
    return await db.all<Candidate>(
        sql`
        SELECT
            stripe_checkout_credits.user_id,
            MIN(stripe_checkout_credits.session_id) AS source_ref
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
            source: "onboarding",
            candidates: await findFirstApiKeyCandidates(db),
        }),
        await grantCandidates({
            db,
            questId: "spend:first_top_up",
            source: "spend",
            candidates: await findFirstTopUpCandidates(db),
        }),
    ];

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", { results });
    return { success: true, results };
}
