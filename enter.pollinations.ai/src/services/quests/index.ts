import * as d1Setup from "./groups/d1-setup.ts";
import * as githubIssues from "./groups/github-issues.ts";
import * as githubProfile from "./groups/github-profile.ts";
import * as identity from "./groups/identity.ts";
import * as tinybirdUsage from "./groups/tinybird-usage.ts";
import type { QuestCard, QuestEvaluationContext, QuestGroup } from "./types.ts";

export const QUEST_GROUPS: QuestGroup[] = [
    { id: "tinybird-usage", ...tinybirdUsage },
    { id: "d1-setup", ...d1Setup },
    { id: "github-profile", ...githubProfile },
    { id: "github-issues", ...githubIssues },
    { id: "identity", ...identity },
];

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const lists = await Promise.all(
        QUEST_GROUPS.map((group) => group.listQuestCards(ctx)),
    );
    return lists.flat();
}

export type { QuestCard };
