import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import {
    fetchGitHubLogin,
    fetchRecentCommitCount,
    loadUsersMissingQuestGrant,
} from "./github-profile-activity.ts";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;
const COMMIT_THRESHOLD = 30;
const WINDOW_DAYS = 90;

export const githubCommits90DaysQuest = {
    definition: {
        id: "engage:github_30_commits_90_days",
        title: "Make 30 GitHub commits",
        description: "Make 30 commits on GitHub within 90 days.",
        rewardAmount: 3,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        return findGrants(db, env);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${githubCommits90DaysQuest.definition.id}:user:`;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function findGrants(
    db: QuestDb,
    env: CloudflareBindings,
    now = new Date(),
): Promise<GrantRewardInput[]> {
    const since = new Date(now.getTime() - WINDOW_DAYS * MS_PER_DAY);
    const rows = await loadUsersMissingQuestGrant(
        db,
        USER_KEY_PREFIX,
        MAX_GRANTS_PER_RUN,
    );

    const grants: GrantRewardInput[] = [];
    for (const row of rows) {
        const githubUsername =
            row.githubUsername ?? (await fetchGitHubLogin(env, row.githubId));
        if (!githubUsername) continue;

        const commitCount = await fetchRecentCommitCount(
            env,
            githubUsername,
            since,
        );
        if (commitCount == null || commitCount < COMMIT_THRESHOLD) continue;

        grants.push({
            idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: githubCommits90DaysQuest.definition.id,
            amount: githubCommits90DaysQuest.definition.rewardAmount,
            bucket: githubCommits90DaysQuest.definition.balanceBucket,
            sourceRef: `github:${row.githubId}`,
            metadata: {
                title: githubCommits90DaysQuest.definition.title,
                githubId: row.githubId,
                githubUsername,
                commitCount,
                threshold: COMMIT_THRESHOLD,
                windowDays: WINDOW_DAYS,
                since: since.toISOString(),
            },
        });
    }

    return grants;
}
