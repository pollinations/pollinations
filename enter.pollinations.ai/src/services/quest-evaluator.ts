import { getLogger } from "@logtape/logtape";
import { recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { inArray } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { QUEST_GROUPS } from "./quests/index.ts";
import { type QuestEvaluationContext, toReward } from "./quests/types.ts";

const log = getLogger(["enter", "quest-evaluator"]);

// D1 caps a statement at ~100 bound variables, so the user-existence lookup
// chunks its IN list.
const USER_LOOKUP_CHUNK = 100;

/**
 * Tinybird-sourced proposals can reference user ids with no D1 user row. This
 * happens in production whenever an account is deleted: the cascade removes the
 * user (and their rewards), but their generation_event rows live on in Tinybird
 * (append-only, not cascade-linked), so the next scan re-proposes the deleted
 * user. rewards.user_id is a NOT NULL foreign key to user.id, so such an orphan
 * fails the whole batched insert and takes every valid reward in its chunk down
 * with it. Resolve which ids actually have a D1 user, so the caller drops the
 * rest.
 */
async function loadExistingUserIds(
    db: DrizzleD1Database<typeof schema>,
    userIds: string[],
): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const found = new Set<string>();
    for (let i = 0; i < userIds.length; i += USER_LOOKUP_CHUNK) {
        const chunk = userIds.slice(i, i + USER_LOOKUP_CHUNK);
        const rows = await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(inArray(schema.user.id, chunk));
        for (const row of rows) found.add(row.id);
    }
    return found;
}

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    recorded: number;
    error?: string;
};

export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: boolean; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const ctx: QuestEvaluationContext = { db, env };

    // Run every group concurrently. Groups are independent — each owns a
    // disjoint set of quest ids and writes its own rewards — so a slow group
    // (e.g. github-profile fetching one GitHub profile per linked user) can no
    // longer starve the request budget of a fast one (e.g. model-usage), which
    // previously left later groups unrecorded when the sequential loop timed
    // out.
    const groupResults = await Promise.all(
        QUEST_GROUPS.map((group) => evaluateGroup(ctx, group)),
    );
    const ordered = groupResults.flat();

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", {
        results: ordered,
    });
    return {
        success: ordered.every((result) => !result.error),
        results: ordered,
    };
}

/**
 * Evaluate a single quest group end to end and return its own result rows. Self
 * contained so groups can run concurrently without sharing a results map; quest
 * ids are unique per group, so the flattened rows never collide.
 */
async function evaluateGroup(
    ctx: QuestEvaluationContext,
    group: (typeof QUEST_GROUPS)[number],
): Promise<QuestEvaluatorResult[]> {
    const { db } = ctx;
    const results = new Map<string, QuestEvaluatorResult>();
    const ensureResult = (questId: string): QuestEvaluatorResult => {
        let entry = results.get(questId);
        if (!entry) {
            entry = { questId, scanned: 0, recorded: 0 };
            results.set(questId, entry);
        }
        return entry;
    };

    try {
        const cards = await group.listQuestCards(ctx);
        for (const card of cards) {
            ensureResult(card.id);
        }

        const proposals = await group.findRewardProposals(ctx);

        // Drop proposals whose user no longer exists in D1 — inserting them
        // would fail the rewards.user_id foreign key and roll back the whole
        // batch (see loadExistingUserIds; deleted accounts leave orphaned
        // Tinybird events behind). D1-sourced groups never hit this (their
        // users come straight from D1); Tinybird-sourced ones can.
        const existingUserIds = await loadExistingUserIds(db, [
            ...new Set(proposals.map((proposal) => proposal.userId)),
        ]);
        const liveProposals = proposals.filter((proposal) =>
            existingUserIds.has(proposal.userId),
        );
        const droppedCount = proposals.length - liveProposals.length;
        if (droppedCount > 0) {
            log.warn(
                "QUEST_PROPOSALS_DROPPED_ORPHAN_USER: groupId={groupId} dropped={dropped}",
                { groupId: group.id, dropped: droppedCount },
            );
        }

        const proposalsByQuest = new Map<string, typeof liveProposals>();
        for (const proposal of liveProposals) {
            const entry = ensureResult(proposal.quest.id);
            entry.scanned += 1;

            const questProposals =
                proposalsByQuest.get(proposal.quest.id) ?? [];
            questProposals.push(proposal);
            proposalsByQuest.set(proposal.quest.id, questProposals);
        }

        for (const [questId, questProposals] of proposalsByQuest) {
            const result = await recordRewards(
                db,
                questProposals.map(toReward),
            );
            ensureResult(questId).recorded += result.recorded;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("QUEST_EVALUATOR_FAILED: groupId={groupId} error={error}", {
            groupId: group.id,
            error: message,
        });
        ensureResult(`group:${group.id}`).error = message;
    }

    return [...results.values()];
}
