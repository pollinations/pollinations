import { getLogger } from "@logtape/logtape";
import type { RewardProposal } from "@shared/quests/definitions.ts";
import { questUserKeyPrefix } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const log = getLogger(["enter", "quest", "established-github-account"]);
const MAX_GRANTS_PER_RUN = 500;
const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type GitHubAccountProposalRow = {
    userId: string;
    githubId: number;
    githubUsername: string | null;
};

export const establishedGitHubAccountQuest = {
    definition: {
        id: "onboarding:established_github_account",
        title: "Claim senior dev status",
        description: "Connect a GitHub account that is at least one year old.",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    async evaluate({ db, env }) {
        return findRewardProposals(db, env);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = questUserKeyPrefix(
    establishedGitHubAccountQuest.definition,
);

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

async function fetchGitHubAccountCreatedAt(
    env: CloudflareBindings,
    githubId: number,
): Promise<Date | null> {
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: githubApiHeaders(env),
    });
    if (!response.ok) {
        log.warn(
            "GITHUB_ACCOUNT_AGE_PROFILE_FETCH_FAILED: githubId={githubId} status={status}",
            {
                githubId,
                status: response.status,
            },
        );
        return null;
    }

    const profile = (await response.json()) as { created_at?: string };
    if (!profile.created_at) return null;
    const createdAt = new Date(profile.created_at);
    return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

async function findRewardProposals(
    db: QuestDb,
    env: CloudflareBindings,
    now = new Date(),
): Promise<RewardProposal[]> {
    const rows = await db.all<GitHubAccountProposalRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId,
            user.github_username AS githubUsername
        FROM user
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${USER_KEY_PREFIX} || user.id
        WHERE user.github_id IS NOT NULL
            AND reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    const proposals: RewardProposal[] = [];
    for (const row of rows) {
        const createdAt = await fetchGitHubAccountCreatedAt(env, row.githubId);
        if (!createdAt) continue;

        const accountAgeDays = Math.floor(
            (now.getTime() - createdAt.getTime()) / MS_PER_DAY,
        );
        if (accountAgeDays < GITHUB_ACCOUNT_AGE_DAYS) continue;

        proposals.push({
            userId: row.userId,
            sourceRef: `github:${row.githubId}`,
            metadata: {
                githubId: row.githubId,
                githubUsername: row.githubUsername,
                githubAccountCreatedAt: createdAt.toISOString(),
                githubAccountAgeDays: accountAgeDays,
                thresholdDays: GITHUB_ACCOUNT_AGE_DAYS,
            },
        });
    }

    return proposals;
}
