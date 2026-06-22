import * as d1Setup from "./groups/d1-setup.ts";
import * as githubIssues from "./groups/github-issues.ts";
import * as githubProfile from "./groups/github-profile.ts";
import * as identity from "./groups/identity.ts";
import * as tinybirdUsage from "./groups/tinybird-usage.ts";
import {
    type Quest,
    type QuestCard,
    type QuestEvaluationContext,
    type QuestGroup,
    questToCard,
} from "./types.ts";

/**
 * A group is just a file exporting `loadQuests(ctx)` — an async loader for a
 * list of self-contained quests, each owning its own findRewards. Static groups
 * resolve a constant list; dynamic groups build quests from source state.
 * index.ts awaits every group and flattens the results into one list; the
 * consumers (catalog, evaluator) work per-quest from there.
 *
 * app-directory is intentionally parked (not listed): "list your app on
 * Pollinations" was the only per-event quest (per-(user, app) idempotency), and
 * the only scope beyond perUser/once. It returns when "apps as quests" lands —
 * each approved app becoming its own once-quest, mirroring github-issues —
 * which removes the need for a per-event scope entirely.
 */
const GROUPS: QuestGroup[] = [
    tinybirdUsage,
    d1Setup,
    githubProfile,
    githubIssues,
    identity,
];

/** Every quest across all groups, flattened in stable GROUPS order. */
export async function loadQuests(
    ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    const lists = await Promise.all(
        GROUPS.map((group) => group.loadQuests(ctx)),
    );
    return lists.flat();
}

/** Catalog cards — each quest serialized via questToCard. */
export async function loadQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const quests = await loadQuests(ctx);
    return quests.map(questToCard);
}

export type { QuestCard };
