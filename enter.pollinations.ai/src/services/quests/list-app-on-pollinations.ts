import * as schema from "@shared/db/better-auth.ts";
import type { RewardProposal } from "@shared/quests/definitions.ts";
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
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
    },
    async evaluate({ db, env }) {
        return findRewardProposals(db, env);
    },
} satisfies QuestModule;

async function findRewardProposals(
    db: QuestDb,
    env: CloudflareBindings,
): Promise<RewardProposal[]> {
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
                userId: user.userId,
                eventId: `app:${app.issue_url}`,
                sourceRef: app.issue_url,
                metadata: {
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
