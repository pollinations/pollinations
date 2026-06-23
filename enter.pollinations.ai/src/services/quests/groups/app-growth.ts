import * as schema from "@shared/db/better-auth.ts";
import { inArray, sql } from "drizzle-orm";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * App-growth quests intentionally share one source group even though they render
 * in different frontend categories. The category is part of each quest
 * definition; the source file only describes where completion data comes from.
 */

const MAX_GRANTS_PER_RUN = 500;

type QuestUserRow = {
    userId: string;
};

type AppDirectoryQuestRow = {
    github_user_id: string;
};

const firstAppListedQuest: QuestDefinition = {
    id: "grow:list_app_on_pollinations",
    title: "First app listed on Pollinations",
    description: "Get an app approved for the Pollinations app directory.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
    url: "https://pollinations.ai/apps",
};

const firstByopExternalUserQuest: QuestDefinition = {
    id: "grow:first_byop_external_user",
    title: "First BYOP external user connected",
    description: "Have an external user connect to your app with BYOP.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 3,
    balanceBucket: "tier",
};

const QUESTS = [firstAppListedQuest, firstByopExternalUserQuest];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const [listedAppRows, byopExternalRows] = await Promise.all([
        loadListedAppUsers(ctx),
        loadByopExternalAppOwners(ctx),
    ]);

    return [
        ...listedAppRows.map((row) => ({
            quest: firstAppListedQuest,
            userId: row.userId,
        })),
        ...byopExternalRows.map((row) => ({
            quest: firstByopExternalUserQuest,
            userId: row.userId,
        })),
    ];
}

async function loadListedAppUsers({
    db,
    env,
}: QuestEvaluationContext): Promise<QuestUserRow[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const apps = await fetchTinybirdRows<AppDirectoryQuestRow>(
        tinybirdOrigin,
        "/v0/pipes/app_directory_public.json",
        tinybirdToken,
        {},
    );
    const githubIds = [
        ...new Set(
            apps
                .map((app) => Number(app.github_user_id))
                .filter((githubId) => Number.isInteger(githubId)),
        ),
    ];
    if (githubIds.length === 0) return [];

    const users = await db
        .select({
            userId: schema.user.id,
        })
        .from(schema.user)
        .where(inArray(schema.user.githubId, githubIds))
        .limit(MAX_GRANTS_PER_RUN);

    return uniqueUsers(users);
}

async function loadByopExternalAppOwners({
    db,
}: QuestEvaluationContext): Promise<QuestUserRow[]> {
    const rows = await db.all<QuestUserRow>(
        sql`
        SELECT app_key.user_id AS userId
        FROM apikey AS user_key
        INNER JOIN apikey AS app_key
            ON app_key.id = user_key.byop_client_key_id
        WHERE user_key.user_id != app_key.user_id
        GROUP BY app_key.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return uniqueUsers(rows);
}

function uniqueUsers(rows: QuestUserRow[]): QuestUserRow[] {
    return [...new Map(rows.map((row) => [row.userId, row])).values()];
}
