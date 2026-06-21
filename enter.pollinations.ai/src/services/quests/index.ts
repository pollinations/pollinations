import * as schema from "@shared/db/better-auth.ts";
import type { QuestDefinition } from "@shared/quests/definitions.ts";
import { drizzle } from "drizzle-orm/d1";
import { communityGitHubIssueQuest } from "./community-github-issue.ts";
import { elixpoInternQuest } from "./elixpo-intern.ts";
import { establishedGitHubAccountQuest } from "./established-github-account.ts";
import { firstApiKeyQuest } from "./first-api-key.ts";
import { firstChatCompletionQuest } from "./first-chat-completion.ts";
import { firstImageQuest } from "./first-image.ts";
import { firstTopUpQuest } from "./first-top-up.ts";
import { githubCommits90DaysQuest } from "./github-commits-90-days.ts";
import { githubCommitsWeeklyQuest } from "./github-commits-weekly.ts";
import { githubPublicReposQuest } from "./github-public-repos.ts";
import { githubRepoStarsQuest } from "./github-repo-stars.ts";
import { listAppOnPollinationsQuest } from "./list-app-on-pollinations.ts";
import { topUpStreakQuest } from "./top-up-streak.ts";
import { tryThreeModelsQuest } from "./try-three-models.ts";
import {
    definitionQuestInstance,
    type QuestInstance,
    type QuestModule,
} from "./types.ts";
import { weeklyTopUpsQuest } from "./weekly-top-ups.ts";

export const QUESTS: QuestModule[] = [
    firstApiKeyQuest,
    firstImageQuest,
    firstChatCompletionQuest,
    tryThreeModelsQuest,
    firstTopUpQuest,
    weeklyTopUpsQuest,
    topUpStreakQuest,
    establishedGitHubAccountQuest,
    githubCommits90DaysQuest,
    githubPublicReposQuest,
    githubRepoStarsQuest,
    githubCommitsWeeklyQuest,
    communityGitHubIssueQuest,
    listAppOnPollinationsQuest,
    elixpoInternQuest,
];

export const QUEST_DEFINITIONS = QUESTS.map((quest) => quest.definition);

export function getQuestDefinition(id: string): QuestDefinition | undefined {
    return QUEST_DEFINITIONS.find((quest) => quest.id === id);
}

export async function loadQuestInstances(
    dbBinding: D1Database,
): Promise<QuestInstance[]> {
    const db = drizzle(dbBinding, { schema });
    const groups = await Promise.all(
        QUESTS.map((quest) => {
            if (quest.instances) return quest.instances({ db });
            return [definitionQuestInstance(quest.definition)];
        }),
    );
    return groups.flat();
}

export type { QuestInstance, QuestModule };
