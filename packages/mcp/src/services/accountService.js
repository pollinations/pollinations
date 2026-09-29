import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

// Permissions are enforced by the API: the read tools need `account:usage`, the
// key tools `account:keys`. Its error message is returned unchanged.
async function callAccount(
    path,
    context,
    { method = "GET", params, body } = {},
) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl(path, params),
        body
            ? {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
              }
            : { method },
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

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

const getUsage = ({ daily, days, limit, model, key }, context) =>
    callAccount(daily ? "/account/usage/daily" : "/account/usage", context, {
        params: daily
            ? { days }
            : {
                  days,
                  limit,
                  models: model?.join(","),
                  api_key_ids: key?.join(","),
              },
    });

const getEarnings = ({ days }, context) =>
    callAccount("/account/earnings", context, { params: { days } });

const listQuests = (_params, context) =>
    callAccount("/account/quests", context);

const listKeys = (_params, context) => callAccount("/account/keys", context);

const createKey = (
    {
        name,
        type,
        expiresIn,
        models,
        budget,
        permissions,
        redirectUri,
        earnings,
    },
    context,
) =>
    callAccount("/account/keys", context, {
        method: "POST",
        body: {
            name,
            type,
            expiresIn,
            allowedModels: models,
            pollenBudget: budget,
            accountPermissions: permissions,
            redirectUris: redirectUri,
            earningsEnabled: earnings,
        },
    });

const revokeKey = ({ id }, context) =>
    callAccount(`/account/keys/${encodeURIComponent(id)}`, context, {
        method: "DELETE",
    });

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
        "List recent requests with model, tokens, and cost (like `polli usage --history`), " +
            "or set daily=true for a per-day summary (`polli usage --daily`). " +
            "Requires 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe("Daily summary by date, key, and model"),
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days, max 90"),
            limit: z
                .number()
                .int()
                .min(1)
                .default(20)
                .describe("Number of requests to return (history only)"),
            model: z
                .array(z.string())
                .optional()
                .describe("Only these model ids (history only)"),
            key: z
                .array(z.string())
                .optional()
                .describe(
                    "Only these API key ids, from listKeys (history only)",
                ),
        },
        getUsage,
    ],
    [
        "getEarnings",
        "Show developer earnings from BYOP apps and community models, per day and per entity " +
            "(`polli earnings`). Requires 'account:usage' permission.",
        {
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days, max 90"),
        },
        getEarnings,
    ],
    [
        "listQuests",
        "List quests with their reward and claim state (`polli quests`). " +
            "Requires 'account:usage' permission.",
        {},
        listQuests,
    ],
    [
        "listKeys",
        "List the account's API keys with permissions, budget, and expiry (`polli keys list`). " +
            "Requires 'account:keys' permission.",
        {},
        listKeys,
    ],
    [
        "createKey",
        "Create an API key (`polli keys create`). The full key is returned once; show it to the user and never store it. " +
            "Use type=publishable with redirectUri for a BYOP app key. Requires 'account:keys' permission.",
        {
            name: z.string().describe("Key name"),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe("Key type, default secret"),
            expiresIn: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Expiry in seconds from now"),
            models: z
                .array(z.string())
                .optional()
                .describe("Restrict the key to these model ids"),
            budget: z
                .number()
                .min(0)
                .optional()
                .describe("Pollen budget cap for a secret key"),
            permissions: z
                .array(z.string())
                .optional()
                .describe(
                    'Account permissions, e.g. ["profile", "usage"]; "keys" lets the new key create keys',
                ),
            redirectUri: z
                .array(z.string())
                .optional()
                .describe("Allowed BYOP redirect URIs (publishable keys)"),
            earnings: z
                .boolean()
                .optional()
                .describe("Enable developer earnings (publishable keys)"),
        },
        createKey,
    ],
    [
        "revokeKey",
        "Revoke an API key by id (`polli keys revoke`). Get ids from listKeys; the key making the request cannot be revoked. " +
            "Requires 'account:keys' permission.",
        { id: z.string().describe("Key id from listKeys") },
        revokeKey,
    ],
];
