import * as schema from "@shared/db/better-auth.ts";
import { inArray } from "drizzle-orm";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import { perUserEventKey } from "../keys.ts";
import type { Quest, QuestAward, QuestEvaluationContext } from "../types.ts";

type AppDirectoryQuestRow = {
    github_user_id: string;
    issue_url: string;
};

/**
 * list-app-on-pollinations (grow:list_app_on_pollinations). One standing
 * catalog card (the app directory is always open), rewarded once per
 * user+listed-app so a contributor can earn it for each approved app.
 *
 * Source = the public app-directory Tinybird pipe joined to linked GitHub
 * accounts. One AWARD per (user, approved app); the evaluator dedups.
 */
const listAppOnPollinationsQuest: Quest = {
    id: "grow:list_app_on_pollinations",
    title: "List an app on Pollinations",
    description: "Get an app approved for the Pollinations app directory.",
    iconId: "app",
    category: "grow",
    rewardAmount: 5,
    balanceBucket: "pack",
    async findRewards({
        db,
        env,
    }: QuestEvaluationContext): Promise<QuestAward[]> {
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
        if (!githubIds.length) return [];

        const users = await db
            .select({
                userId: schema.user.id,
                githubId: schema.user.githubId,
            })
            .from(schema.user)
            .where(inArray(schema.user.githubId, githubIds));
        const userByGithubId = new Map(
            users.map((user) => [user.githubId, user]),
        );

        return apps.flatMap((app) => {
            const githubId = Number(app.github_user_id);
            const user = userByGithubId.get(githubId);
            if (!user || !app.issue_url) return [];

            // Per-user + per-event scope (one reward per listed app).
            return [
                {
                    idempotencyKey: perUserEventKey(
                        listAppOnPollinationsQuest.id,
                        user.userId,
                        `app:${app.issue_url}`,
                    ),
                    userId: user.userId,
                },
            ];
        });
    },
};

export async function loadQuests(
    _ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    return [listAppOnPollinationsQuest];
}
