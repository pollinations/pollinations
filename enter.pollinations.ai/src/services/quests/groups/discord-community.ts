import {
    discordConfigFromEnv,
    getPollinationsDiscordMembership,
} from "../../discord.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
} from "../types.ts";

const joinDiscordQuest: QuestDefinition = {
    id: "join_discord",
    title: "Join the Pollinations Discord",
    description:
        "[Connect Discord](/account), then [join the Pollinations community server](https://discord.gg/pollinations-ai-885844321461485618).",
    category: "community",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
    url: "https://discord.gg/pollinations-ai-885844321461485618",
};

export async function listQuestCards({
    env,
}: QuestEvaluationContext): Promise<QuestCard[]> {
    return discordConfigFromEnv(env) ? [questToCard(joinDiscordQuest)] : [];
}

export async function evaluateUser(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    if (!discordConfigFromEnv(env)) return { proposals: [] };
    const membership = await getPollinationsDiscordMembership(env, user.id);
    return {
        proposals: membership?.member
            ? [{ quest: joinDiscordQuest, userId: user.id }]
            : [],
    };
}
