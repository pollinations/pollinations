import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

// Permissions are enforced by the API: the read tools need `account:usage`, the
// key tools `account:keys`, the site tools `account:machines`. Its error
// message is returned unchanged.
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
                accountBalance: data.accountBalance,
                note: "Pollen balance for the authenticated key. Key-scoped when the key has its own budget, otherwise account-wide.",
            },
            true,
        ),
    ]);
}

const getUsage = ({ daily, days, limit, model, key }, context) =>
    callAccount(daily ? "/account/usage/daily" : "/account/usage", context, {
        params: daily
            ? { days, api_key_ids: key?.join(",") }
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
        questPollenOnly,
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
            questPollenOnly,
            redirectUris: redirectUri,
            earningsEnabled: earnings,
        },
    });

const revokeKey = ({ id }, context) =>
    callAccount(`/account/keys/${encodeURIComponent(id)}`, context, {
        method: "DELETE",
    });

const sitePath = (name) => `/account/sites/${encodeURIComponent(name)}`;

const listSites = (_params, context) => callAccount("/account/sites", context);

const deploySite = ({ name, files }, context) =>
    callAccount(sitePath(name), context, { method: "PUT", body: { files } });

const deleteSite = ({ name }, context) =>
    callAccount(sitePath(name), context, { method: "DELETE" });

const siteName = z
    .string()
    .describe(
        "Site name: 3-32 lowercase letters, digits and hyphens, starting with a letter",
    );

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
            "A call to an agent is listed under the models the agent called, not under the agent. " +
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
                .describe("Only these API key ids, from listKeys"),
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
                .optional()
                .describe("Rolling window in days"),
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
                .describe(
                    "Restrict the key to these model categories (text, image, video, audio, 3d, embedding, realtime, decision) or model IDs; a model ID allows only that model",
                ),
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
            questPollenOnly: z
                .boolean()
                .optional()
                .describe(
                    "Never spend paid Pollen; requests stop when Quest Pollen runs out",
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
    [
        "listSites",
        "List the account's static sites at https://<name>.pollinations.app and the site limits (`polli sites list`). " +
            "Requires 'account:machines' permission.",
        {},
        listSites,
    ],
    [
        "deploySite",
        "Publish a static site at https://<name>.pollinations.app, replacing what was there (`polli sites deploy`). " +
            "Send every file inline; index.html is required, up to 5 MB per request. The first deploy claims the name. " +
            "Requires 'account:machines' permission.",
        {
            name: siteName,
            files: z
                .array(
                    z.object({
                        file: z
                            .string()
                            .describe("Path, e.g. index.html or assets/app.js"),
                        data: z.string().describe("File content"),
                        encoding: z
                            .enum(["utf-8", "base64"])
                            .optional()
                            .describe(
                                "utf-8 (default) for text, base64 for images and other binary files",
                            ),
                    }),
                )
                .min(1),
        },
        deploySite,
    ],
    [
        "deleteSite",
        "Take a site offline and free its name (`polli sites delete`). Requires 'account:machines' permission.",
        { name: siteName },
        deleteSite,
    ],
];
