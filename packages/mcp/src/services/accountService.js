import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function getBalance(_params) {
    requireApiKey();
    return createMCPResponse([
        createTextContent(
            await fetchJsonWithAuth(`${API_BASE_URL}/account/balance`),
            true,
        ),
    ]);
}

async function getUsage(params = {}) {
    requireApiKey();
    return createMCPResponse([
        createTextContent(
            await fetchJsonWithAuth(buildUrl("/account/key/usage", params)),
            true,
        ),
    ]);
}

async function listQuests(_params) {
    requireApiKey();
    const data = await fetchJsonWithAuth(`${API_BASE_URL}/account/quests`);
    return createMCPResponse([createTextContent(data, true)]);
}

export const accountTools = [
    [
        "getBalance",
        "Get the authenticated key's available Pollen. Returns its remaining key budget when set; " +
            "otherwise returns account balances and requires 'account:usage'.",
        z.object({}),
        getBalance,
    ],
    [
        "getUsage",
        "Get usage history for the authenticated API key. No account-wide permission is required.",
        z
            .object({
                days: z
                    .number()
                    .int()
                    .optional()
                    .describe("Usage window in days"),
                limit: z
                    .number()
                    .int()
                    .optional()
                    .describe("Maximum number of usage records"),
            })
            .passthrough(),
        getUsage,
    ],
    [
        "listQuests",
        "List quests and earned rewards for the authenticated account. " +
            "Read-only; claiming rewards requires a dashboard session. " +
            "Requires 'account:usage' permission.",
        z.object({}),
        listQuests,
    ],
];
