import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { inArray } from "drizzle-orm";
import appsMarkdown from "../../../../apps/APPS.md?raw";
import type { QuestDb, QuestModule } from "./types.ts";

type AppDirectoryQuestRow = {
    name: string;
    webUrl: string;
    githubUserId: string;
    githubUsername: string;
    issueUrl: string;
    approvedDate: string;
};

const FIELD_TO_HEADER = {
    name: "Name",
    webUrl: "Web_URL",
    githubUsername: "GitHub_Username",
    githubUserId: "GitHub_UserID",
    issueUrl: "Issue_URL",
    approvedDate: "Approved_Date",
} as const satisfies Record<keyof AppDirectoryQuestRow, string>;

const GITHUB_ID_LOOKUP_CHUNK_SIZE = 100;

export const listAppOnPollinationsQuest = {
    definition: {
        id: "grow:list_app_on_pollinations",
        title: "List an app on Pollinations",
        description: "Get an app approved for the Pollinations app directory.",
        rewardAmount: 5,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findAppListingGrants(db);
    },
    async instances() {
        return [];
    },
} satisfies QuestModule;

export async function findAppListingGrants(
    db: QuestDb,
    apps: AppDirectoryQuestRow[] = parseAppsMarkdown(appsMarkdown),
): Promise<GrantRewardInput[]> {
    const githubIds = [
        ...new Set(
            apps
                .map((app) => Number(app.githubUserId))
                .filter((githubId) => Number.isInteger(githubId)),
        ),
    ];
    if (!githubIds.length) return [];

    const users: {
        userId: string;
        githubId: number | null;
        githubUsername: string | null;
    }[] = [];
    for (let i = 0; i < githubIds.length; i += GITHUB_ID_LOOKUP_CHUNK_SIZE) {
        const chunk = githubIds.slice(i, i + GITHUB_ID_LOOKUP_CHUNK_SIZE);
        users.push(
            ...(await db
                .select({
                    userId: schema.user.id,
                    githubId: schema.user.githubId,
                    githubUsername: schema.user.githubUsername,
                })
                .from(schema.user)
                .where(inArray(schema.user.githubId, chunk))),
        );
    }
    const userByGithubId = new Map(users.map((user) => [user.githubId, user]));

    const grantsByKey = new Map<string, GrantRewardInput>();
    for (const app of apps) {
        const githubId = Number(app.githubUserId);
        const user = userByGithubId.get(githubId);
        if (!user || !app.issueUrl) continue;

        const idempotencyKey = `quest:${listAppOnPollinationsQuest.definition.id}:user:${user.userId}:event:app:${app.issueUrl}`;
        grantsByKey.set(idempotencyKey, {
            idempotencyKey,
            userId: user.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: listAppOnPollinationsQuest.definition.id,
            amount: listAppOnPollinationsQuest.definition.rewardAmount,
            bucket: listAppOnPollinationsQuest.definition.balanceBucket,
            sourceRef: app.issueUrl,
            metadata: {
                title: listAppOnPollinationsQuest.definition.title,
                appName: app.name,
                appUrl: app.webUrl,
                issueUrl: app.issueUrl,
                approvedDate: app.approvedDate,
                githubId,
                githubUsername: user.githubUsername ?? app.githubUsername,
            },
        });
    }

    return [...grantsByKey.values()];
}

export function parseAppsMarkdown(markdown: string): AppDirectoryQuestRow[] {
    const lines = markdown.split("\n");
    const headerIndex = lines.findIndex((line) => line.startsWith("| Emoji"));
    if (headerIndex === -1) {
        throw new Error("Could not find APPS.md header row");
    }

    const headers = splitMarkdownTableRow(lines[headerIndex]);
    const fieldIndexes = Object.fromEntries(
        Object.entries(FIELD_TO_HEADER).map(([field, header]) => [
            field,
            headers.findIndex(
                (candidate) => candidate.toLowerCase() === header.toLowerCase(),
            ),
        ]),
    ) as Record<keyof AppDirectoryQuestRow, number>;

    const apps: AppDirectoryQuestRow[] = [];
    for (let index = headerIndex + 2; index < lines.length; index++) {
        const line = lines[index];
        if (!line.startsWith("|")) continue;

        const cells = splitMarkdownTableRow(line);
        if (cells.length < 15) continue;

        const app = Object.fromEntries(
            Object.entries(fieldIndexes).map(([field, fieldIndex]) => [
                field,
                fieldIndex >= 0 && fieldIndex < cells.length
                    ? cells[fieldIndex]
                    : "",
            ]),
        ) as AppDirectoryQuestRow;

        if (app.githubUserId && app.issueUrl && hasApprovedDate(app)) {
            apps.push(app);
        }
    }

    return apps;
}

function splitMarkdownTableRow(line: string): string[] {
    const cells = line.split("|").map((cell) => cell.trim());
    cells.shift();
    cells.pop();
    return cells;
}

function hasApprovedDate(app: AppDirectoryQuestRow): boolean {
    return app.approvedDate.length > 0 && app.approvedDate !== "-";
}
