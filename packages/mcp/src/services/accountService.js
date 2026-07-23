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

export const accountTools = [
    [
        "getBalance",
        "Get the authenticated key's available Pollen. Returns its remaining key budget when set; " +
            "otherwise returns account balances and requires 'account:usage'.",
        {},
        getBalance,
    ],
    [
        "getUsage",
        "Get usage history for the authenticated API key. No account-wide permission is required.",
        {
            days: z.number().int().optional().describe("Usage window in days"),
            limit: z
                .number()
                .int()
                .optional()
                .describe("Maximum number of usage records"),
        },
        getUsage,
    ],
];
