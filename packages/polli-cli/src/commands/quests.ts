import chalk from "chalk";
import { Command } from "commander";
import { gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
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

export const questsCommand = new Command("quests")
    .description("List quests and read-only account quest status")
    .option("--open", "Show only open quests")
    .option("--completed", "Show only completed/earned quests")
    .option("--coming-soon", "Show only coming-soon quests")
    .action(async (opts) => {
        try {
            const key = resolveApiKey();
            const data = key
                ? await gen<QuestsResponse>("/account/quests", { apiKey: key })
                : await gen<QuestsResponse>("/quests/catalog");
            const quests = filterQuests(data.quests ?? [], opts);

            if (getOutputMode() === "json") {
                printResult(
                    quests.map((quest) => ({
                        ...quest,
                        status: questStatus(quest),
                    })),
                );
                return;
            }

            if (!key) {
                printInfo(
                    "Showing public quest catalog. Log in for earned/completed account status.",
                );
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
        } catch (err) {
            printError(
                `Failed to fetch quests: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
