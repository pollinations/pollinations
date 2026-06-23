import * as accountSetup from "./groups/account-setup.ts";
import * as appGrowth from "./groups/app-growth.ts";
import * as githubContributions from "./groups/github-contributions.ts";
import * as githubProfile from "./groups/github-profile.ts";
import * as identity from "./groups/identity.ts";
import type { QuestCard, QuestEvaluationContext, QuestGroup } from "./types.ts";

export const QUEST_GROUPS: QuestGroup[] = [
    { id: "account-setup", ...accountSetup },
    { id: "app-growth", ...appGrowth },
    { id: "github-profile", ...githubProfile },
    { id: "github-contributions", ...githubContributions },
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
