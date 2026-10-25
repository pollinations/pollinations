import {
    discordConfigFromEnv,
    getPollinationsDiscordMember,
} from "../../discord.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
} from "../types.ts";

const DISCORD_INVITE_URL = "https://discord.gg/k9F7SyTgqn";

const joinDiscordQuest: QuestDefinition = {
    id: "join_discord",
    title: "Join the Pollinations Discord",
    description: `[Connect Discord](/account), then [join the Pollinations community server](${DISCORD_INVITE_URL}).`,
    category: "community",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
    url: DISCORD_INVITE_URL,
};

// Arcane, the server's leveling bot, keeps one "Level N+" role on each member
// and swaps it as they level up, so the role is the member's level. Arcane has
// no public API, and reading roles needs no privileged Discord intent.
const ARCANE_LEVEL_ROLES: Record<string, number> = {
    "1365603309536415786": 5,
    "1365603308060016670": 10,
    "1365603306755330068": 15,
    "1365603135858409482": 20,
    "1365603135032135720": 30,
    "1365603134373761135": 40,
    "1365603132838772847": 50,
    "1365603130666123304": 60,
    "1365603127000039574": 70,
};

const levelQuests = [
    { level: 10, rewardAmount: 2 },
    { level: 20, rewardAmount: 5 },
].map(({ level, rewardAmount }) => ({
    level,
    quest: {
        id: `discord_level_${level}`,
        title: `Reach level ${level} on Discord`,
        description: `[Connect Discord](/account), then chat in the [Pollinations server](${DISCORD_INVITE_URL}) until Arcane gives you the Level ${level}+ role.`,
        category: "community",
        scope: "perUser",
        rewardAmount,
        balanceBucket: "tier",
        url: DISCORD_INVITE_URL,
    } satisfies QuestDefinition,
}));

// Discord gives every booster this managed role and removes it when the boost
// ends, so it means "boosting right now".
const SERVER_BOOSTER_ROLE = "1110978276433866842";

const boostQuest: QuestDefinition = {
    id: "discord_boost",
    title: "Boost the Pollinations Discord",
    description: `[Connect Discord](/account), then boost the [Pollinations server](${DISCORD_INVITE_URL}).`,
    category: "community",
    scope: "perUser",
    rewardAmount: 20,
    balanceBucket: "tier",
    url: DISCORD_INVITE_URL,
};

export async function listQuestCards({
    env,
}: QuestEvaluationContext): Promise<QuestCard[]> {
    if (!discordConfigFromEnv(env)) return [];
    return [
        joinDiscordQuest,
        ...levelQuests.map(({ quest }) => quest),
        boostQuest,
    ].map(questToCard);
}

export async function evaluateUser(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const member = await getPollinationsDiscordMember(env, user.id);
    if (!member) return { proposals: [] };

    const level = Math.max(
        0,
        ...member.roles.map((roleId) => ARCANE_LEVEL_ROLES[roleId] ?? 0),
    );
    return {
        proposals: [
            joinDiscordQuest,
            ...levelQuests
                .filter((milestone) => milestone.level <= level)
                .map(({ quest }) => quest),
            ...(member.roles.includes(SERVER_BOOSTER_ROLE) ? [boostQuest] : []),
        ].map((quest) => ({
            quest,
            userId: user.id,
            // Once per Discord account: relinking one Discord account to
            // other Pollinations accounts earns nothing more.
            idempotencyKey: `quest:${quest.id}:discord:${member.discordId}`,
        })),
    };
}
