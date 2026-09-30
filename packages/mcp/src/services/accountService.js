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

async function getUsage(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/usage", {
            days: params.days,
            limit: params.limit,
            format: params.format,
            granularity: params.granularity,
            period: params.period,
            models: params.models,
        }),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                count: data.count,
                usage: data.usage,
                note: "Per-request usage history for the authenticated account. Requires the API key to have the 'account:usage' permission.",
            },
            true,
        ),
    ]);
}

async function getDailyUsage(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/usage/daily", {
            days: params.days,
            granularity: params.granularity,
            period: params.period,
        }),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                count: data.count,
                usage: data.usage,
                note: "Usage aggregated by date, API key, model and billing source. Requires the API key to have the 'account:usage' permission.",
            },
            true,
        ),
    ]);
}

async function getEarnings(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/earnings", {
            days: params.days,
            format: params.format,
            granularity: params.granularity,
            period: params.period,
        }),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                daily: data.daily,
                perEntity: data.perEntity,
                note: "Developer earnings across BYOP apps and community models. Requires the API key to have the 'account:usage' permission.",
            },
            true,
        ),
    ]);
}

async function getQuests(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/quests"),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                quests: data.quests,
                note: "Quest catalog with the authenticated account's status (open/completed/coming_soon). Requires the API key to have the 'account:usage' permission.",
            },
            true,
        ),
    ]);
}

async function listApiKeys(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                keys: data.data,
                note: "API keys for the authenticated account. Secret values are never returned. Requires the API key to have the 'account:keys' permission.",
            },
            true,
        ),
    ]);
}

async function createApiKey(params, context) {
    requireApiKey(context);
    const body = {
        name: params.name,
        type: params.type,
        expiresIn: params.expiresIn,
        allowedModels: params.allowedModels,
        pollenBudget: params.pollenBudget,
        accountPermissions: params.accountPermissions,
        redirectUris: params.redirectUris,
        earningsEnabled: params.earningsEnabled,
    };
    for (const key of Object.keys(body)) {
        if (body[key] === undefined || body[key] === null) delete body[key];
    }
    const created = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                created,
                note: "New API key. The full key value is returned only once. Requires the API key to have the 'account:keys' permission.",
            },
            true,
        ),
    ]);
}

async function revokeApiKey(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl(`/account/keys/${encodeURIComponent(params.id)}`),
        { method: "DELETE" },
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                success: data.success,
                note: "Revoked the requested API key. Requires the API key to have the 'account:keys' permission. A key cannot revoke itself.",
            },
            true,
        ),
    ]);
}

async function getApiKeyInfo(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/key"),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                key: data,
                note: "Validity, type, expiry, permissions and remaining budget of the API key used in this request. No account scope needed.",
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
        "Get per-request usage history for the authenticated account: model used, token counts, cost, and response time. " +
            "Defaults to the last 30 days, up to 90 days via days, or exact day/week/month periods via granularity and period. " +
            "Requires an API key with 'account:usage' permission.",
        {
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days (default: 30)"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50000)
                .optional()
                .describe("Maximum rows to return (default: 100)"),
            format: z
                .enum(["json", "csv"])
                .optional()
                .describe("Response format (default: json)"),
            granularity: z
                .enum(["day", "week", "month"])
                .optional()
                .describe("Exact period granularity; pair with period"),
            period: z
                .string()
                .optional()
                .describe(
                    "Exact period: YYYY-MM-DD (day), YYYY-WNN (week), or YYYY-MM (month)",
                ),
            models: z
                .array(z.string())
                .optional()
                .describe("Filter by model IDs"),
        },
        getUsage,
    ],
    [
        "getDailyUsage",
        "Get usage aggregated by date, API key, model and billing source for the authenticated account. " +
            "Use days for rolling windows or granularity and period for exact day/week/month periods. " +
            "Requires an API key with 'account:usage' permission.",
        {
            days: z
                .number()
                .int()
                .min(1)
                .max(90)
                .optional()
                .describe("Rolling window in days (default: 90)"),
            granularity: z
                .enum(["day", "week", "month"])
                .optional()
                .describe("Exact period granularity; pair with period"),
            period: z
                .string()
                .optional()
                .describe(
                    "Exact period: YYYY-MM-DD (day), YYYY-WNN (week), or YYYY-MM (month)",
                ),
        },
        getDailyUsage,
    ],
    [
        "getEarnings",
        "Get developer earnings for the authenticated account: per-(date, entity) buckets and per-entity rollups " +
            "across BYOP apps and community models, including requests, baseline price, reward basis and reward rate. " +
            "Requires an API key with 'account:usage' permission.",
        {
            days: z
                .number()
                .int()
                .min(1)
                .max(365)
                .optional()
                .describe("Rolling window in days (default: 90)"),
            format: z
                .enum(["json", "csv"])
                .optional()
                .describe("Response format (default: json)"),
            granularity: z
                .enum(["day", "week", "month"])
                .optional()
                .describe("Exact period granularity; pair with period"),
            period: z
                .string()
                .optional()
                .describe(
                    "Exact period: YYYY-MM-DD (day), YYYY-WNN (week), or YYYY-MM (month)",
                ),
        },
        getEarnings,
    ],
    [
        "getQuests",
        "Get the quest catalog with the authenticated account's read-only status: each quest's state, category, " +
            "reward amount and whether it has been earned. " +
            "Requires an API key with 'account:usage' permission.",
        {},
        getQuests,
    ],
    [
        "listApiKeys",
        "List all API keys for the authenticated account with id, name, prefix, expiry, permissions and remaining budget. " +
            "Secret key values are never returned. " +
            "Requires an API key with 'account:keys' permission.",
        {},
        listApiKeys,
    ],
    [
        "createApiKey",
        "Create a new API key for the authenticated account. Send type 'publishable' with redirectUris to create an app key; " +
            "publishable keys accept only null, omission, or 0 for pollenBudget and default developer earnings off " +
            "(send earningsEnabled true to opt in). The full key value is returned only once. " +
            "Requires an API key with 'account:keys' permission.",
        {
            name: z
                .string()
                .min(1)
                .max(253)
                .describe("Name for the API key"),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe("Key type: secret (sk_) or publishable app key (pk_), default secret"),
            expiresIn: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Expiry in seconds from now"),
            allowedModels: z
                .array(z.string())
                .nullable()
                .optional()
                .describe("Model IDs this key can access. null = all models"),
            pollenBudget: z
                .number()
                .nullable()
                .optional()
                .describe("Pollen budget cap. Publishable keys accept only null, omission, or 0"),
            accountPermissions: z
                .array(z.string())
                .nullable()
                .optional()
                .describe('Account permissions, e.g. ["usage"]. Include "keys" to let the new key create keys too'),
            redirectUris: z
                .array(z.string())
                .optional()
                .describe("Allowed OAuth redirect URIs for publishable app keys"),
            earningsEnabled: z
                .boolean()
                .optional()
                .describe("Enable developer earnings for publishable app keys (default false)"),
        },
        createApiKey,
    ],
    [
        "revokeApiKey",
        "Revoke (delete) an API key owned by the authenticated account. Cannot revoke the key used to authenticate this request. " +
            "Requires an API key with 'account:keys' permission.",
        {
            id: z.string().describe("Opaque API key id returned by listApiKeys or createApiKey"),
        },
        revokeApiKey,
    ],
    [
        "getApiKeyInfo",
        "Get information about the API key used in this request: validity, type (secret/publishable), expiry, permissions, " +
            "and remaining budget. Useful for validating keys without making generation requests. No account scope needed.",
        {},
        getApiKeyInfo,
    ],
];
