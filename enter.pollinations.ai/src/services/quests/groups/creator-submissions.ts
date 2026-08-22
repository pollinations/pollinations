import type { QuestDefinition } from "../definitions.ts";
import type {
    QuestCard,
    QuestEvaluation,
    QuestEvaluationContext,
    QuestUser,
} from "../types.ts";
import { questToCard } from "../types.ts";

const youtubeTutorialQuest: QuestDefinition = {
    // Matches campaignId "youtube_tutorial" in the admin grant endpoint.
    id: "grant:youtube_tutorial",
    title: "Publish a YouTube tutorial",
    description:
        "Create an original tutorial showing how to build or create with Pollinations, then submit it for review.",
    category: "community",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
    url: "https://github.com/pollinations/pollinations/issues/new?template=youtube-tutorial.yml",
};

const xShowcaseQuest: QuestDefinition = {
    // Matches campaignId "x_showcase" in the admin grant endpoint.
    id: "grant:x_showcase",
    title: "Share a creation on X",
    description:
        "Post something original that you built or created with Pollinations, then submit it for review.",
    category: "community",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
    url: "https://github.com/pollinations/pollinations/issues/new?template=x-showcase.yml",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [youtubeTutorialQuest, xShowcaseQuest].map(questToCard);
}

export async function evaluateUser(
    _ctx: QuestEvaluationContext,
    _user: QuestUser,
): Promise<QuestEvaluation> {
    // Completion is recorded after maintainer review through /admin/quest-grants.
    return { proposals: [] };
}
