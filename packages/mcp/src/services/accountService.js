import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function getBalance(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/balance"),
        {},
        context,
    );
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

/** Drop null/undefined so a request body only carries the fields the caller set. */
function compact(body) {
    const out = {};
    for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) out[key] = value;
    }
    return out;
}

async function getUsage(params, context) {
    requireApiKey(context);
    const query = {
        limit: params.limit,
        days: params.days,
        api_key_ids: params.keyIds?.length
            ? params.keyIds.join(",")
            : undefined,
        models: params.models?.length ? params.models.join(",") : undefined,
    };
    const path = params.daily ? "/account/usage/daily" : "/account/usage";
    const data = await fetchJsonWithAuth(buildUrl(path, query), {}, context);
    return createMCPResponse([createTextContent(data, true)]);
}

async function getEarnings(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/earnings", { days: params.days }),
        {},
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

async function listQuests(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/quests"),
        {},
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

async function listKeys(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {},
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

async function createKey(params, context) {
    requireApiKey(context);
    const body = compact({
        name: params.name,
        type: params.type,
        expiresIn: params.expiresIn,
        allowedModels: params.models,
        pollenBudget: params.budget,
        accountPermissions: params.permissions,
        redirectUris: params.redirectUris,
        earningsEnabled: params.earnings,
    });
    const created = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        context,
    );
    return createMCPResponse([createTextContent(created, true)]);
}

async function revokeKey(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl(`/account/keys/${encodeURIComponent(params.id)}`),
        { method: "DELETE" },
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
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
        "Get the account's Pollen usage. By default returns per-request history " +
            "(model, token counts, cost, response time); set daily=true for a daily " +
            "summary. Optionally filter by model ids or API key ids and a rolling " +
            "window in days (max 90). Requires 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe(
                    "Return a daily summary instead of per-request history.",
                ),
            limit: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Maximum records to return (history only)."),
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days, max 90."),
            models: z
                .array(z.string())
                .optional()
                .describe("Filter by model id (repeatable)."),
            keyIds: z
                .array(z.string())
                .optional()
                .describe("Filter by API key id (repeatable)."),
        },
        getUsage,
    ],
    [
        "getEarnings",
        "Get developer earnings from BYOP apps and community models, " +
            "daily and per entity. Defaults to the last 30 days (max 90). " +
            "Requires 'account:usage' permission.",
        {
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days, max 90 (default 30)."),
        },
        getEarnings,
    ],
    [
        "listQuests",
        "List the quest catalog with this account's status " +
            "(open / completed / coming soon) and any earned reward. " +
            "Requires 'account:usage' permission.",
        {},
        listQuests,
    ],
    [
        "listKeys",
        "List the account's API keys with their budget, expiry and permissions. " +
            "Requires 'account:keys' permission.",
        {},
        listKeys,
    ],
    [
        "createKey",
        "Create a new API key. Use type 'publishable' for an app key. " +
            "The returned key value is shown only once. Requires 'account:keys' permission.",
        {
            name: z.string().describe("Key name."),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe("secret (default) or publishable app key."),
            expiresIn: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Expiry in seconds from now."),
            models: z
                .array(z.string())
                .optional()
                .describe("Restrict to specific model ids."),
            budget: z
                .number()
                .nonnegative()
                .optional()
                .describe("Pollen budget cap."),
            permissions: z
                .array(z.string())
                .optional()
                .describe('Account permissions, e.g. ["profile","usage"].'),
            redirectUris: z
                .array(z.string())
                .optional()
                .describe("Allowed BYOP redirect URIs (publishable app keys)."),
            earnings: z
                .boolean()
                .optional()
                .describe("Enable developer earnings (publishable app keys)."),
        },
        createKey,
    ],
    [
        "revokeKey",
        "Revoke an API key by id. Requires 'account:keys' permission.",
        {
            id: z.string().describe("Key id to revoke."),
        },
        revokeKey,
    ],
];
