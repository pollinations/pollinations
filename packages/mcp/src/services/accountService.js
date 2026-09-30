import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

const MAX_DAYS = 90;

const join = (value) => (Array.isArray(value) ? value.join(",") : value);

function cleanBody(body) {
    const cleaned = {};
    for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

const getBalance = [
    "getBalance",
    "Check the Pollen balance for the authenticated account. Requires the account:usage permission.",
    {},
    async (params, context) => {
        requireApiKey(context);
        const data = await fetchJsonWithAuth(
            buildUrl("/account/balance"),
            {},
            context,
        );
        return createMCPResponse([createTextContent(data, true)]);
    },
];

const getUsage = [
    "getUsage",
    "Get per-request usage history or a daily usage summary for the authenticated account. Requires the account:usage permission. Use daily=true for the daily summary aggregated by date, model and key; otherwise individual request records are returned and can be filtered by model or API key id.",
    {
        days: z.coerce
            .number()
            .int()
            .min(1)
            .max(MAX_DAYS)
            .optional()
            .describe("Rolling window in days, max 90"),
        limit: z.coerce
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Number of request records to return (history view only)"),
        models: z
            .array(z.string())
            .optional()
            .describe("Filter by model ids (history view only)"),
        apiKeyIds: z
            .array(z.string())
            .optional()
            .describe("Filter by API key ids (history view only)"),
        daily: z
            .boolean()
            .optional()
            .describe("Return the daily summary instead of request history"),
    },
    async (params, context) => {
        requireApiKey(context);
        const query = {};
        if (params.days !== undefined) query.days = params.days;
        let path;
        if (params.daily) {
            path = `/account/usage/daily?${new URLSearchParams(query)}`;
        } else {
            if (params.limit !== undefined) query.limit = params.limit;
            if (params.models !== undefined) query.models = join(params.models);
            if (params.apiKeyIds !== undefined)
                query.api_key_ids = join(params.apiKeyIds);
            path = `/account/usage?${new URLSearchParams(query)}`;
        }
        const data = await fetchJsonWithAuth(buildUrl(path), {}, context);
        return createMCPResponse([createTextContent(data, true)]);
    },
];

const getEarnings = [
    "getEarnings",
    "Get developer earnings from BYOP apps and community models for the authenticated account. Requires the account:usage permission.",
    {
        days: z.coerce
            .number()
            .int()
            .min(1)
            .max(MAX_DAYS)
            .optional()
            .describe("Rolling window in days, max 90 (default 30)"),
    },
    async (params, context) => {
        requireApiKey(context);
        const query = {};
        if (params.days !== undefined) query.days = params.days;
        const data = await fetchJsonWithAuth(
            buildUrl(`/account/earnings?${new URLSearchParams(query)}`),
            {},
            context,
        );
        return createMCPResponse([createTextContent(data, true)]);
    },
];

const listQuests = [
    "listQuests",
    "List the quest catalog with the authenticated account's completion and claim state. Requires the account:usage permission.",
    {},
    async (params, context) => {
        requireApiKey(context);
        const data = await fetchJsonWithAuth(
            buildUrl("/account/quests"),
            {},
            context,
        );
        return createMCPResponse([createTextContent(data, true)]);
    },
];

const listKeys = [
    "listKeys",
    "List the API keys for the authenticated account. Secret key values are never returned. Requires the account:keys permission.",
    {},
    async (params, context) => {
        requireApiKey(context);
        const data = await fetchJsonWithAuth(
            buildUrl("/account/keys"),
            {},
            context,
        );
        return createMCPResponse([createTextContent(data, true)]);
    },
];

const createKey = [
    "createKey",
    "Create a new API key for the authenticated account. Use type=publishable to create an app key; secret keys are shown once at creation. Requires the account:keys permission.",
    {
        name: z.string().min(1).describe("Key name"),
        type: z
            .enum(["secret", "publishable"])
            .optional()
            .describe("Key type: secret or publishable app key (default secret)"),
        expiresIn: z.coerce
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Expiry in seconds (max 365 days)"),
        allowedModels: z
            .array(z.string())
            .optional()
            .describe("Restrict to specific model ids"),
        pollenBudget: z.coerce
            .number()
            .min(0)
            .optional()
            .describe("Pollen budget cap"),
        accountPermissions: z
            .array(z.string())
            .optional()
            .describe('Account permissions, e.g. ["profile", "usage", "keys"]'),
        redirectUris: z
            .array(z.string())
            .optional()
            .describe("Allowed BYOP redirect URIs for publishable app keys"),
        earningsEnabled: z
            .boolean()
            .optional()
            .describe("Enable developer earnings for publishable app keys"),
    },
    async (params, context) => {
        requireApiKey(context);
        const body = cleanBody({
            name: params.name,
            type: params.type ?? "secret",
            expiresIn: params.expiresIn,
            allowedModels: params.allowedModels,
            pollenBudget: params.pollenBudget,
            accountPermissions: params.accountPermissions,
            redirectUris: params.redirectUris,
            earningsEnabled: params.earningsEnabled,
        });
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
    },
];

const revokeKey = [
    "revokeKey",
    "Revoke an API key by id for the authenticated account. Requires the account:keys permission.",
    {
        id: z.string().min(1).describe("Key id to revoke"),
    },
    async (params, context) => {
        requireApiKey(context);
        const data = await fetchJsonWithAuth(
            buildUrl(`/account/keys/${params.id}`),
            { method: "DELETE" },
            context,
        );
        return createMCPResponse([createTextContent(data, true)]);
    },
];

export const accountTools = [
    getBalance,
    getUsage,
    getEarnings,
    listQuests,
    listKeys,
    createKey,
    revokeKey,
];
