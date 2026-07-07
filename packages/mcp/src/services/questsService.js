import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

function questStatus(quest) {
    if (quest.status) return quest.status;
    if (quest.state === "coming_soon") return "coming_soon";
    if (quest.state === "completed") return "completed";
    return "open";
}

async function listQuests(params) {
    requireApiKey();

    const { status } = params || {};

    const data = await fetchJsonWithAuth(`${API_BASE_URL}/account/quests`);
    let quests = (data.quests || []).map((quest) => {
        const reward = quest.reward ?? null;
        return {
            id: quest.id,
            title: quest.title,
            category: quest.category,
            status: questStatus(quest),
            rewardAmount: reward?.pollenAmount ?? quest.rewardAmount,
            balanceBucket: reward?.balanceBucket ?? quest.balanceBucket,
            claimable: Boolean(reward && reward.claimedAt === null),
            url: quest.url ?? null,
        };
    });

    if (status) {
        quests = quests.filter((quest) => quest.status === status);
    }

    const claimable = quests.filter((quest) => quest.claimable);
    const readyToClaimPollen = claimable.reduce(
        (sum, quest) => sum + (quest.rewardAmount || 0),
        0,
    );

    return createMCPResponse([
        createTextContent(
            {
                count: quests.length,
                readyToClaim: {
                    count: claimable.length,
                    pollen: Number(readyToClaimPollen.toFixed(4)),
                    note:
                        claimable.length > 0
                            ? "Rewards are claimed in the dashboard at https://enter.pollinations.ai/#quests. Claiming requires a logged-in dashboard session and cannot be done with an API key."
                            : "No rewards ready to claim.",
                },
                quests,
            },
            true,
        ),
    ]);
}

export const questTools = [
    [
        "listQuests",
        "List Pollinations quests with the authenticated account's status (open / completed / coming_soon) " +
            "and any earned rewards, flagging which are ready to claim. Read-only. Requires an API key with the " +
            "'account:usage' permission. Note: viewing quests works with an API key, but *claiming* a reward " +
            "requires a logged-in dashboard session and cannot be done through the API.",
        {
            status: z
                .enum(["open", "completed", "coming_soon"])
                .optional()
                .describe(
                    "Filter to quests with this status. Omit to return all quests.",
                ),
        },
        listQuests,
    ],
];
