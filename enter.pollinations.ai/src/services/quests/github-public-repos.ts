import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import {
    fetchGitHubRepoStats,
    loadUsersMissingQuestGrant,
} from "./github-profile-activity.ts";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;
const REPO_THRESHOLD = 2;

export const githubPublicReposQuest = {
    definition: {
        id: "engage:github_2_public_repos",
        title: "Publish 2 public repos",
        description: "Have at least 2 non-empty public GitHub repositories.",
        iconId: "github",
        rewardAmount: 1,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        return findGrants(db, env);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${githubPublicReposQuest.definition.id}:user:`;

async function findGrants(
    db: QuestDb,
    env: CloudflareBindings,
): Promise<GrantRewardInput[]> {
    const rows = await loadUsersMissingQuestGrant(
        db,
        USER_KEY_PREFIX,
        MAX_GRANTS_PER_RUN,
    );

    const grants: GrantRewardInput[] = [];
    for (const row of rows) {
        const stats = await fetchGitHubRepoStats(env, row.githubId);
        if (!stats || stats.qualityRepoCount < REPO_THRESHOLD) continue;

        grants.push({
            idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: githubPublicReposQuest.definition.id,
            amount: githubPublicReposQuest.definition.rewardAmount,
            bucket: githubPublicReposQuest.definition.balanceBucket,
            sourceRef: `github:${row.githubId}`,
            metadata: {
                title: githubPublicReposQuest.definition.title,
                githubId: row.githubId,
                githubUsername: row.githubUsername ?? stats.githubLogin,
                qualityRepoCount: stats.qualityRepoCount,
                fetchedRepoCount: stats.fetchedRepoCount,
                threshold: REPO_THRESHOLD,
            },
        });
    }

    return grants;
}
