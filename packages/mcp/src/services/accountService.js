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
    const data = await fetchJsonWithAuth(`${API_BASE_URL}/account/balance`);
    return createMCPResponse([
        createTextContent(
            {
                pollen: data.balance,
                note: "Pollen balance for the authenticated key. Key-scoped when the key has its own budget, otherwise account-wide.",
            },
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

    const data = await fetchJsonWithAuth(url.toString());
    const records = data.usage || [];

    if (daily) {
        const totalCost = records.reduce(
            (sum, r) => sum + (r.cost_usd || 0),
            0,
        );
        const totalRequests = records.reduce(
            (sum, r) => sum + (r.requests || 0),
            0,
        );
        return createMCPResponse([
            createTextContent(
                {
                    mode: "daily",
                    days: days ?? 90,
                    totals: {
                        requests: totalRequests,
                        cost_usd: Number(totalCost.toFixed(4)),
                    },
                    records,
                    count: data.count ?? records.length,
                },
                true,
            ),
        ]);
    }

    return createMCPResponse([
        createTextContent(
            {
                mode: "per-request",
                days: days ?? 30,
                limit: limit ?? 100,
                records,
                count: data.count ?? records.length,
            },
            true,
        ),
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
