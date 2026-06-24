import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
    type RewardProposal,
} from "../types.ts";

// elixpo (Ayushman Bhattacharya) joined the team as an intern — a one-off
// welcome quest scoped to his GitHub account. Shown to everyone as a static
// card, but only the target account can complete it. Hand-written one-off;
// not a threshold quest.
const TARGET_GITHUB_ID = 161_109_909;

const elixpoInternQuest: QuestDefinition = {
    id: "easteregg:elixpo_intern",
    title: "Join as Developer Relations Intern 🌻",
    description: "It's official, elixpo — welcome to the Pollinations crew.",
    category: "easteregg",
    scope: "perUser",
    rewardAmount: 100,
    // Per-person easter egg: off the open board (availability "completed"), so
    // the frontend surfaces it only to the account that earned it — it renders
    // as a normal completed card in its own "Easter eggs" lane.
    availability: "completed",
    balanceBucket: "tier",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [questToCard(elixpoInternQuest)];
}

export async function findRewardProposalsForUser(
    _ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    if (user.githubId !== TARGET_GITHUB_ID) return [];
    return [{ quest: elixpoInternQuest, userId: user.id }];
}
