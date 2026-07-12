import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { ENTER_URL } from "../lib/config.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";

type QuestStatus = "open" | "claimable" | "claimed" | "coming";

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
    status?: "open" | "completed" | "coming_soon";
    rewardAmount: number;
    balanceBucket: string;
    url: string | null;
    reward?: QuestReward | null;
}

interface QuestsResponse {
    quests: QuestEntry[];
}

// Derive the display status. Claim state lives on the reward (claimedAt === null
// means it's earned but not yet banked); everything else falls back to the
// quest's own state.
function questStatus(quest: QuestEntry): QuestStatus {
    if (quest.state === "coming_soon" || quest.status === "coming_soon") {
        return "coming";
    }
    if (quest.reward) {
        return quest.reward.claimedAt === null ? "claimable" : "claimed";
    }
    if (quest.state === "completed" || quest.status === "completed") {
        return "claimed";
    }
    return "open";
}

function colorStatus(status: QuestStatus): string {
    switch (status) {
        case "claimable":
            return chalk.green(status);
        case "claimed":
            return chalk.cyan(status);
        case "coming":
            return chalk.dim(status);
        default:
            return status;
    }
}

function rewardLabel(quest: QuestEntry): string {
    const amount = quest.reward?.pollenAmount ?? quest.rewardAmount;
    const bucket = quest.reward?.balanceBucket ?? quest.balanceBucket;
    return `${amount} ${bucket}`;
}

function filterQuests(
    quests: QuestEntry[],
    opts: Record<string, unknown>,
): QuestEntry[] {
    const wanted = new Set<QuestStatus>();
    if (opts.open) wanted.add("open");
    if (opts.claimable) wanted.add("claimable");
    if (opts.claimed) wanted.add("claimed");
    if (opts.comingSoon) wanted.add("coming");
    if (wanted.size === 0) return quests;
    return quests.filter((quest) => wanted.has(questStatus(quest)));
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
        quests.map((quest) => ({
            status: colorStatus(questStatus(quest)),
            category: quest.category,
            reward: rewardLabel(quest),
            title: quest.title,
            url: quest.url ?? "-",
        })),
        ["status", "category", "reward", "title", "url"],
    );
}

export const questsCommand = new Command("quests")
    .description(
        "List your quests with claim state (open / claimable / claimed / coming)",
    )
    .option("--open", "Show only open quests")
    .option("--claimable", "Show only quests with a reward ready to claim")
    .option("--claimed", "Show only already-claimed quests")
    .option("--coming-soon", "Show only coming-soon quests")
    .action(async (opts) => {
        try {
            const data = await gen<QuestsResponse>("/account/quests", {
                apiKey: requireKey(),
            });
            const all = data.quests ?? [];

            if (getOutputMode() !== "json") {
                const claimable = all.filter(
                    (q) => questStatus(q) === "claimable",
                );
                if (claimable.length > 0) {
                    const total = claimable.reduce(
                        (sum, q) =>
                            sum + (q.reward?.pollenAmount ?? q.rewardAmount),
                        0,
                    );
                    printInfo(
                        `${claimable.length} reward(s) ready to claim (${total} pollen) — claim them at ${ENTER_URL}/#quests`,
                    );
                }
            }

            renderQuests(filterQuests(all, opts));
        } catch (err) {
            printError(
                `Failed to fetch quests: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
