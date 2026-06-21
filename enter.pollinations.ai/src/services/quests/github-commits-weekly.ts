import { getLogger } from "@logtape/logtape";
import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const log = getLogger(["enter", "quest", "github-commits-weekly"]);
const MAX_GRANTS_PER_RUN = 500;
const COMMIT_THRESHOLD = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type GitHubCommitQuestRow = {
    userId: string;
    githubId: number;
    githubUsername: string;
};

export const githubCommitsWeeklyQuest = {
    definition: {
        id: "engage:github_20_commits_week",
        title: "Ship 20 commits in a week",
        description: "Make 20 GitHub commits in the last 7 days.",
        rewardAmount: 1,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        return findGrants(db, env);
    },
} satisfies QuestModule;

const GRANT_KEY_PREFIX = `quest:${githubCommitsWeeklyQuest.definition.id}:user:`;

function githubApiHeaders(env: CloudflareBindings): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "pollinations-enter",
    };
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
        headers.Authorization = `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`;
    }
    return headers;
}

function utcWeekKey(date: Date): string {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const day = Math.floor((date.getTime() - start.getTime()) / MS_PER_DAY);
    const week = Math.floor(day / 7) + 1;
    return `${date.getUTCFullYear()}-W${week.toString().padStart(2, "0")}`;
}

async function fetchRecentCommitCount(
    env: CloudflareBindings,
    githubUsername: string,
    since: Date,
): Promise<number | null> {
    const url = new URL("https://api.github.com/search/commits");
    url.searchParams.set(
        "q",
        `author:${githubUsername} committer-date:>=${since.toISOString().slice(0, 10)}`,
    );
    url.searchParams.set("per_page", "1");

    const response = await fetch(url.toString(), {
        headers: githubApiHeaders(env),
    });
    if (!response.ok) {
        log.warn(
            "GITHUB_COMMIT_SEARCH_FAILED: githubUsername={githubUsername} status={status}",
            {
                githubUsername,
                status: response.status,
            },
        );
        return null;
    }

    const payload = (await response.json()) as { total_count?: number };
    return typeof payload.total_count === "number" ? payload.total_count : null;
}

async function findGrants(
    db: QuestDb,
    env: CloudflareBindings,
    now = new Date(),
): Promise<GrantRewardInput[]> {
    const weekKey = utcWeekKey(now);
    const since = new Date(now.getTime() - 7 * MS_PER_DAY);
    const rows = await db.all<GitHubCommitQuestRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId,
            user.github_username AS githubUsername
        FROM user
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${GRANT_KEY_PREFIX} ||
                user.id ||
                ${":week:"} ||
                ${weekKey}
        WHERE user.github_id IS NOT NULL
            AND user.github_username IS NOT NULL
            AND reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    const grants: GrantRewardInput[] = [];
    for (const row of rows) {
        const commitCount = await fetchRecentCommitCount(
            env,
            row.githubUsername,
            since,
        );
        if (commitCount == null || commitCount < COMMIT_THRESHOLD) continue;

        grants.push({
            idempotencyKey: `${GRANT_KEY_PREFIX}${row.userId}:week:${weekKey}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: githubCommitsWeeklyQuest.definition.id,
            amount: githubCommitsWeeklyQuest.definition.rewardAmount,
            bucket: githubCommitsWeeklyQuest.definition.balanceBucket,
            sourceRef: `github:${row.githubId}:week:${weekKey}`,
            metadata: {
                title: githubCommitsWeeklyQuest.definition.title,
                githubId: row.githubId,
                githubUsername: row.githubUsername,
                commitCount,
                threshold: COMMIT_THRESHOLD,
                week: weekKey,
                since: since.toISOString(),
            },
        });
    }

    return grants;
}
