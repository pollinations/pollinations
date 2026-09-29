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

export async function getUsage(params, context) {
    requireApiKey(context);
    const path = params.daily ? "/account/usage/daily" : "/account/usage";
    const query = { days: params.days };
    if (params.apiKeyIds?.length)
        query.api_key_ids = params.apiKeyIds.join(",");
    if (!params.daily) {
        query.limit = params.limit;
        if (params.models?.length) query.models = params.models.join(",");
    }
    const data = await fetchJsonWithAuth(buildUrl(path, query), {}, context);
    return createMCPResponse([createTextContent(data, true)]);
}

export async function getEarnings(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/earnings", { days: params.days }),
        {},
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

export async function listQuests(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/quests"),
        {},
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

export async function listKeys(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {},
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

export async function createKey(params, context) {
    requireApiKey(context);
    const body = { name: params.name, type: params.type };
    if (params.expiresIn !== undefined) body.expiresIn = params.expiresIn;
    if (params.models !== undefined) body.allowedModels = params.models;
    if (params.budget !== undefined) body.pollenBudget = params.budget;
    if (params.permissions !== undefined)
        body.accountPermissions = params.permissions;
    if (params.redirectUri !== undefined)
        body.redirectUris = params.redirectUri;
    if (params.earnings !== undefined) body.earningsEnabled = params.earnings;

    const data = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

export async function revokeKey(params, context) {
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
        "Get request history (GET /account/usage) or a daily summary grouped by date/key/model/source (GET /account/usage/daily, set daily: true). " +
            "Requires an API key with 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe(
                    "Return the daily summary instead of individual requests",
                ),
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days, max 90 (default: 30)"),
            limit: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe("Max records to return (individual requests only)"),
            models: z
                .array(z.string())
                .optional()
                .describe("Filter by model id (individual requests only)"),
            apiKeyIds: z
                .array(z.string())
                .optional()
                .describe(
                    "Filter by API key id. Use listKeys for the live ids.",
                ),
        },
        getUsage,
    ],
    [
        "getEarnings",
        "Get developer earnings from BYOP apps and community models (GET /account/earnings). " +
            "Requires an API key with 'account:usage' permission.",
        {
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days, max 90 (default: 30)"),
        },
        getEarnings,
    ],
    [
        "listQuests",
        "List the authenticated account's quests with claim state (GET /account/quests). " +
            "Requires an API key with 'account:usage' permission.",
        {},
        listQuests,
    ],
    [
        "listKeys",
        "List all API keys for the authenticated account (GET /account/keys). Secret key values are never returned. " +
            "Requires an API key with 'account:keys' permission.",
        {},
        listKeys,
    ],
    [
        "createKey",
        "Create a new API key (POST /account/keys). The full key value is returned only once. " +
            "Requires an API key with 'account:keys' permission.",
        {
            name: z.string().min(1).max(253).describe("Name for the new key"),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe(
                    "Key type: secret (sk_) or publishable app key (pk_). Default: secret",
                ),
            expiresIn: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Expiry in seconds from now (omit for no expiry)"),
            models: z
                .array(z.string())
                .optional()
                .describe("Restrict the key to these model ids"),
            budget: z
                .number()
                .min(0)
                .optional()
                .describe("Pollen budget cap for the key"),
            permissions: z
                .array(z.string())
                .optional()
                .describe(
                    'Account permissions to grant (e.g. ["usage"]). Include "keys" to let the new key create keys too.',
                ),
            redirectUri: z
                .array(z.string())
                .optional()
                .describe(
                    "Allowed OAuth redirect URI(s) for publishable app keys",
                ),
            earnings: z
                .boolean()
                .optional()
                .describe("Enable developer earnings for publishable app keys"),
        },
        createKey,
    ],
    [
        "revokeKey",
        "Revoke an API key by id (DELETE /account/keys/:id). Cannot revoke the key used to authenticate the request. " +
            "Requires an API key with 'account:keys' permission.",
        {
            id: z.string().min(1).describe("Key id to revoke"),
        },
        revokeKey,
    ],
];
