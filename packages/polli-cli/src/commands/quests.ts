import chalk from "chalk";
import { Command } from "commander";
import { enter, gen, requireKey } from "../lib/api.js";
import { ENTER_URL } from "../lib/config.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";

type QuestStatus = "open" | "completed" | "coming_soon";

interface QuestReward {
    id: string;
    questId: string | null;
    title: string;
    pollenAmount: number;
    balanceBucket: string;
    earnedAt: string;
    claimedAt: string | null;
}

interface QuestEntry {
    id: string;
    title: string;
    description: string;
    category: string;
    state: "available" | "completed" | "coming_soon";
    status?: QuestStatus;
    rewardAmount: number;
    balanceBucket: string;
    url: string | null;
    reward?: QuestReward | null;
}

interface QuestsResponse {
    quests: QuestEntry[];
}

interface QuestRewardsResponse {
    rewards: QuestReward[];
}

function questStatus(quest: QuestEntry): QuestStatus {
    if (quest.status) return quest.status;
    if (quest.state === "coming_soon") return "coming_soon";
    if (quest.state === "completed") return "completed";
    return "open";
}

function rewardLabel(quest: QuestEntry): string {
    const amount = quest.reward?.pollenAmount ?? quest.rewardAmount;
    const bucket = quest.reward?.balanceBucket ?? quest.balanceBucket;
    return `${amount} ${bucket}`;
}

function filterQuests(quests: QuestEntry[], opts: Record<string, unknown>) {
    const wanted = new Set<QuestStatus>();
    if (opts.open) wanted.add("open");
    if (opts.completed) wanted.add("completed");
    if (opts.comingSoon) wanted.add("coming_soon");
    if (wanted.size === 0) return quests;
    return quests.filter((quest) => wanted.has(questStatus(quest)));
}

function addQuestFilters(command: Command, accountStatus = false): Command {
    return command
        .option("--open", "Show only open quests")
        .option(
            "--completed",
            accountStatus
                ? "Show only completed/earned quests"
                : "Show only completed catalog quests",
        )
        .option("--coming-soon", "Show only coming-soon quests");
}

function renderQuests(quests: QuestEntry[]): void {
    if (getOutputMode() === "json") {
        printResult(
            quests.map((quest) => ({
                ...quest,
                status: questStatus(quest),
            })),
        );
        return;
    }

    printTable(
        quests.map((quest) => {
            const status = questStatus(quest);
            return {
                status:
                    status === "open"
                        ? chalk.green(status)
                        : status === "completed"
                          ? chalk.cyan(status)
                          : chalk.dim("coming"),
                category: quest.category,
                reward: rewardLabel(quest),
                title: quest.title,
                url: quest.url ?? "-",
            };
        }),
        ["status", "category", "reward", "title", "url"],
    );
}

async function listPublicQuests(opts: Record<string, unknown>): Promise<void> {
    const data = await gen<QuestsResponse>("/quests/catalog");
    renderQuests(filterQuests(data.quests ?? [], opts));
}

async function listAccountQuests(opts: Record<string, unknown>): Promise<void> {
    const data = await gen<QuestsResponse>("/account/quests", {
        apiKey: requireKey(),
    });
    renderQuests(filterQuests(data.quests ?? [], opts));
}

function renderRewards(rewards: QuestReward[]): void {
    if (getOutputMode() === "json") {
        printResult(rewards);
        return;
    }

    printTable(
        rewards.map((reward) => ({
            status: reward.claimedAt
                ? chalk.dim("claimed")
                : chalk.green("claimable"),
            reward: `${reward.pollenAmount} ${reward.balanceBucket}`,
            title: reward.title,
            earned: reward.earnedAt.slice(0, 10),
        })),
        ["status", "reward", "title", "earned"],
    );
}

async function listRewards(opts: Record<string, unknown>): Promise<void> {
    const data = await enter<QuestRewardsResponse>("/api/quests/rewards", {
        apiKey: requireKey(),
    });
    const all = data.rewards ?? [];
    const claimable = all.filter((reward) => reward.claimedAt === null);

    if (getOutputMode() !== "json" && claimable.length > 0) {
        const total = claimable.reduce(
            (sum, reward) => sum + reward.pollenAmount,
            0,
        );
        printInfo(
            `${claimable.length} reward(s) ready to claim (${total} pollen). ` +
                `Claim them in the dashboard: ${ENTER_URL}/#quests`,
        );
    }

    let rewards = all;
    if (opts.pending) rewards = rewards.filter((r) => r.claimedAt === null);
    if (opts.claimed) rewards = rewards.filter((r) => r.claimedAt !== null);
    renderRewards(rewards);
}

export const questsCommand = addQuestFilters(
    new Command("quests").description("List the public quest catalog"),
)
    .action(async (opts) => {
        try {
            if (getOutputMode() !== "json") {
                printInfo(
                    "Showing public quest catalog. Use `polli quests mine` for earned/completed account status.",
                );
            }
            await listPublicQuests(opts);
        } catch (err) {
            printError(
                `Failed to fetch quests: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    })
    .addCommand(
        addQuestFilters(
            new Command("mine").description(
                "List quests with your earned/completed account status",
            ),
            true,
        ).action(async (opts) => {
            try {
                await listAccountQuests(opts);
            } catch (err) {
                printError(
                    `Failed to fetch account quests: ${err instanceof Error ? err.message : "unknown"}`,
                );
                process.exit(1);
            }
        }),
    );
