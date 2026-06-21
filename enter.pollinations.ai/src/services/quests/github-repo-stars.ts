import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import {
    fetchGitHubRepoStats,
    loadUsersMissingQuestGrant,
} from "./github-profile-activity.ts";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;
const STAR_THRESHOLD = 50;

export const githubRepoStarsQuest = {
    definition: {
        id: "engage:github_50_repo_stars",
        title: "Earn 50 GitHub stars",
        description:
            "Earn 50 stars across your non-empty public GitHub repositories.",
        iconId: "github",
        rewardAmount: 5,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        return findGrants(db, env);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${githubRepoStarsQuest.definition.id}:user:`;

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
        if (!stats || stats.qualityRepoStars < STAR_THRESHOLD) continue;

        grants.push({
            idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: githubRepoStarsQuest.definition.id,
            amount: githubRepoStarsQuest.definition.rewardAmount,
            bucket: githubRepoStarsQuest.definition.balanceBucket,
            sourceRef: `github:${row.githubId}`,
            metadata: {
                title: githubRepoStarsQuest.definition.title,
                githubId: row.githubId,
                githubUsername: row.githubUsername ?? stats.githubLogin,
                qualityRepoStars: stats.qualityRepoStars,
                qualityRepoCount: stats.qualityRepoCount,
                fetchedRepoCount: stats.fetchedRepoCount,
                threshold: STAR_THRESHOLD,
            },
        });
    }

    return grants;
}
