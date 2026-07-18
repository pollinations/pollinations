import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
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

async function getUsage(params) {
    requireApiKey();

    const { daily = false, days, limit } = params || {};

    const url = new URL(
        daily ? "/account/usage/daily" : "/account/usage",
        API_BASE_URL,
    );
    if (days !== undefined) url.searchParams.set("days", String(days));
    if (!daily && limit !== undefined) {
        url.searchParams.set("limit", String(limit));
    }

    return createMCPResponse([
        createTextContent(await fetchJsonWithAuth(url.toString()), true),
    ]);
}

export const accountTools = [
    [
        "getBalance",
        "Get the current Pollen balance for the authenticated API key. " +
            "Returns key-scoped balance if the key has its own budget, otherwise account-wide. " +
            "Requires an API key with 'account:usage' permission.",
        {},
        getBalance,
    ],
    [
        "getUsage",
        "Get usage history for the authenticated key. By default returns the most recent per-request " +
            "records (model, cost, tokens, latency). Set 'daily: true' for a daily aggregated summary " +
            "grouped by date and model. Requires 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe(
                    "If true, return daily aggregated usage instead of per-request rows (default: false)",
                ),
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe(
                    "Time window in days (1-90). Default: 30 for per-request, 90 for daily.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50000)
                .optional()
                .describe(
                    "Max per-request rows to return (1-50000, default: 100). Ignored when daily=true.",
                ),
        },
        getUsage,
    ],
];
