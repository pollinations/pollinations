import {
    fetchGitHubProfileActivity,
    type GitHubProfileActivity,
    loadGitHubUsers,
} from "../github-profile-activity.ts";
import { perUserKey } from "../keys.ts";
import type { Quest, QuestAward, QuestEvaluationContext } from "../types.ts";

/**
 * github-profile group: three threshold quests read off ONE GitHub profile
 * snapshot per user (account age, public repo count, repo stars). Each is a
 * self-contained quest with its own findRewards, but they MUST share one
 * GitHub fetch per user per run — fetching the profile three times would
 * triple the rate-limited GitHub API calls. The shared fetch is a per-run memo
 * keyed by the evaluation ctx (runQuestEvaluator builds a fresh ctx each run),
 * so the cache is automatically scoped to a single run and garbage-collected
 * when the run ends — no clock, no stale data across cron runs.
 */

const MAX_GRANTS_PER_RUN = 500;
const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REPO_THRESHOLD = 2;
const STAR_THRESHOLD = 50;

/**
 * Per-run profile memo: one fetch per githubId, shared across all three quests
 * in a single evaluation. Keyed by ctx so it lives exactly as long as the run
 * — runQuestEvaluator creates a fresh ctx per invocation, and the WeakMap entry
 * is collected when that ctx goes out of scope.
 */
const profileMemoByRun = new WeakMap<
    QuestEvaluationContext,
    Map<number, Promise<GitHubProfileActivity | null>>
>();

function loadProfile(
    ctx: QuestEvaluationContext,
    githubId: number,
): Promise<GitHubProfileActivity | null> {
    let memo = profileMemoByRun.get(ctx);
    if (!memo) {
        memo = new Map();
        profileMemoByRun.set(ctx, memo);
    }
    let pending = memo.get(githubId);
    if (!pending) {
        pending = fetchGitHubProfileActivity(ctx.env, githubId);
        memo.set(githubId, pending);
    }
    return pending;
}

function accountAgeDays(activity: GitHubProfileActivity, now: Date): number {
    if (!activity.githubAccountCreatedAt) return -1;
    return Math.floor(
        (now.getTime() - activity.githubAccountCreatedAt.getTime()) /
            MS_PER_DAY,
    );
}

/**
 * Connect a GitHub account at least one year old. Per-user idempotency key —
 * BYTE-IDENTICAL to the legacy value
 * `quest:onboarding:established_github_account:user:${userId}`.
 */
const establishedGitHubAccountQuest: Quest = {
    id: "onboarding:established_github_account",
    title: "Claim senior dev status",
    description: "Connect a GitHub account that is at least one year old.",
    iconId: "github",
    category: "plant",
    rewardAmount: 6,
    balanceBucket: "pack",
    async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
        const now = new Date();
        const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
        const awards: QuestAward[] = [];
        for (const row of rows) {
            const activity = await loadProfile(ctx, row.githubId);
            if (!activity) continue;
            if (activity.githubAccountCreatedAt === null) continue;
            if (accountAgeDays(activity, now) < GITHUB_ACCOUNT_AGE_DAYS) {
                continue;
            }
            awards.push({
                idempotencyKey: perUserKey(
                    establishedGitHubAccountQuest.id,
                    row.userId,
                ),
                userId: row.userId,
            });
        }
        return awards;
    },
};

/**
 * Have at least 2 non-empty public GitHub repos. Per-user idempotency key —
 * BYTE-IDENTICAL to `quest:engage:github_2_public_repos:user:${userId}`.
 */
const githubPublicReposQuest: Quest = {
    id: "engage:github_2_public_repos",
    title: "Publish 2 public repos",
    description: "Have at least 2 non-empty public GitHub repositories.",
    iconId: "github",
    category: "grow",
    rewardAmount: 1,
    balanceBucket: "pack",
    async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
        const awards: QuestAward[] = [];
        for (const row of rows) {
            const activity = await loadProfile(ctx, row.githubId);
            if (!activity) continue;
            if (activity.qualityRepoCount < REPO_THRESHOLD) continue;
            awards.push({
                idempotencyKey: perUserKey(
                    githubPublicReposQuest.id,
                    row.userId,
                ),
                userId: row.userId,
            });
        }
        return awards;
    },
};

/**
 * Earn 50 stars across non-empty public GitHub repos. Per-user idempotency key
 * — BYTE-IDENTICAL to `quest:engage:github_50_repo_stars:user:${userId}`.
 */
const githubRepoStarsQuest: Quest = {
    id: "engage:github_50_repo_stars",
    title: "Earn 50 GitHub stars",
    description:
        "Earn 50 stars across your non-empty public GitHub repositories.",
    iconId: "github",
    category: "grow",
    rewardAmount: 5,
    balanceBucket: "pack",
    async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
        const awards: QuestAward[] = [];
        for (const row of rows) {
            const activity = await loadProfile(ctx, row.githubId);
            if (!activity) continue;
            if (activity.qualityRepoStars < STAR_THRESHOLD) continue;
            awards.push({
                idempotencyKey: perUserKey(githubRepoStarsQuest.id, row.userId),
                userId: row.userId,
            });
        }
        return awards;
    },
};

export async function loadQuests(
    _ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    return [
        establishedGitHubAccountQuest,
        githubPublicReposQuest,
        githubRepoStarsQuest,
    ];
}
