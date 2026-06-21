import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { inArray } from "drizzle-orm";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../tinybird.ts";
import type { QuestDb, QuestModule } from "./types.ts";

type AppDirectoryQuestRow = {
    name: string;
    web_url: string;
    github_user_id: string;
    github_username: string;
    issue_url: string;
    approved_date: string;
};

export const listAppOnPollinationsQuest = {
    definition: {
        id: "grow:list_app_on_pollinations",
        title: "List an app on Pollinations",
        description: "Get an app approved for the Pollinations app directory.",
        iconId: "app",
        rewardAmount: 5,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        return findGrants(db, env);
    },
} satisfies QuestModule;

async function findGrants(
    db: QuestDb,
    env: CloudflareBindings,
): Promise<GrantRewardInput[]> {
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
            githubUsername: schema.user.githubUsername,
        })
        .from(schema.user)
        .where(inArray(schema.user.githubId, githubIds));
    const userByGithubId = new Map(users.map((user) => [user.githubId, user]));

    return apps.flatMap((app) => {
        const githubId = Number(app.github_user_id);
        const user = userByGithubId.get(githubId);
        if (!user || !app.issue_url) return [];

        return [
            {
                idempotencyKey: `quest:${listAppOnPollinationsQuest.definition.id}:user:${user.userId}:event:app:${app.issue_url}`,
                userId: user.userId,
                source: PRODUCT_QUEST_REWARD_SOURCE,
                questId: listAppOnPollinationsQuest.definition.id,
                amount: listAppOnPollinationsQuest.definition.rewardAmount,
                bucket: listAppOnPollinationsQuest.definition.balanceBucket,
                sourceRef: app.issue_url,
                metadata: {
                    title: listAppOnPollinationsQuest.definition.title,
                    appName: app.name,
                    appUrl: app.web_url,
                    issueUrl: app.issue_url,
                    approvedDate: app.approved_date,
                    githubId,
                    githubUsername: user.githubUsername ?? app.github_username,
                },
            },
        ];
    });
}
