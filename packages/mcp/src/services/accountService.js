import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

const asJsonText = (data) => createMCPResponse([createTextContent(data, true)]);

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

// Key filters accept names or ids; names are resolved via /account/keys,
// like `polli usage --key`. Ids pass through untouched.
async function resolveKeyIds(keys, context) {
    const KEY_ID = /^[a-zA-Z0-9]{32}$/;
    const ids = keys.filter((k) => KEY_ID.test(k));
    const names = keys.filter((k) => !KEY_ID.test(k));
    if (names.length === 0) return ids;
    const res = await fetchJsonWithAuth(buildUrl("/account/keys"), {}, context);
    const known = res.data ?? [];
    const resolved = names.map((name) => {
        const match = known.find((k) => k.name === name);
        if (!match) throw new Error(`No API key named "${name}".`);
        return match.id;
    });
    return [...ids, ...resolved];
}

async function getUsage(params, context) {
    requireApiKey(context);
    // The daily endpoint has no models param and rejects api_key_ids, so
    // both filters are history-only (same split as the polli CLI).
    if (params.daily) {
        const data = await fetchJsonWithAuth(
            buildUrl("/account/usage/daily", { days: params.days }),
            {},
            context,
        );
        return asJsonText(data);
    }
    const keyIds = params.keys?.length
        ? await resolveKeyIds(params.keys, context)
        : [];
    const data = await fetchJsonWithAuth(
        buildUrl("/account/usage", {
            limit: params.limit ?? 20,
            days: params.days,
            api_key_ids: keyIds.length ? keyIds.join(",") : undefined,
            models: params.models?.length ? params.models.join(",") : undefined,
        }),
        {},
        context,
    );
    return asJsonText(data);
}

async function getEarnings(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/earnings", { days: params.days ?? 30 }),
        {},
        context,
    );
    return asJsonText(data);
}

async function listQuests(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/quests"),
        {},
        context,
    );
    return asJsonText(data);
}

async function listKeys(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {},
        context,
    );
    return asJsonText(data);
}

async function createKey(params, context) {
    requireApiKey(context);
    if (params.type !== "publishable") {
        if (params.redirectUris?.length)
            throw new Error("redirectUris requires type 'publishable'.");
        if (params.earnings)
            throw new Error("earnings requires type 'publishable'.");
    }
    const data = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: params.name,
                type: params.type,
                expiresIn: params.expiresIn,
                allowedModels: params.models?.length
                    ? params.models
                    : undefined,
                pollenBudget: params.budget,
                accountPermissions: params.permissions?.length
                    ? params.permissions
                    : undefined,
                redirectUris: params.redirectUris?.length
                    ? params.redirectUris
                    : undefined,
                earningsEnabled: params.earnings || undefined,
            }),
        },
        context,
    );
    return asJsonText(data);
}

async function revokeKey(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl(`/account/keys/${encodeURIComponent(params.id)}`),
        { method: "DELETE" },
        context,
    );
    return asJsonText(data);
}

const daysParam = z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("Rolling window in days, max 90.");

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
        "Get Pollen usage for the authenticated account: per-request history " +
            "by default, daily aggregates when daily=true. " +
            "Requires an API key with 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe(
                    "Return daily aggregates instead of per-request history. The keys/models filters apply to history only.",
                ),
            days: daysParam,
            limit: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                    "Number of history records to return (default 20, like polli usage). History only.",
                ),
            models: z
                .array(z.string())
                .optional()
                .describe("Filter history by model ids. History only."),
            keys: z
                .array(z.string())
                .optional()
                .describe(
                    "Filter history by API key names or ids. History only.",
                ),
        },
        getUsage,
    ],
    [
        "getEarnings",
        "Get developer earnings from BYOP apps and community models for the " +
            "authenticated account. Requires an API key with 'account:usage' permission.",
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
        "List quests for the authenticated account with status and rewards. " +
            "Requires an API key with 'account:usage' permission.",
        {},
        listQuests,
    ],
    [
        "listKeys",
        "List all API keys of the authenticated account. " +
            "Requires an API key with 'account:keys' permission.",
        {},
        listKeys,
    ],
    [
        "createKey",
        "Create a new API key. Use type 'publishable' for a BYOP app key. " +
            "The full key value is returned once - store it immediately. " +
            "Requires an API key with 'account:keys' permission.",
        {
            name: z.string().min(1).describe("Key name."),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe("Key type (default 'secret')."),
            expiresIn: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe("Expiry in seconds (max 365 days)."),
            models: z
                .array(z.string())
                .optional()
                .describe("Restrict the key to specific model ids."),
            budget: z
                .number()
                .min(0)
                .optional()
                .describe("Pollen budget cap for the key."),
            permissions: z
                .array(z.string())
                .optional()
                .describe(
                    "Account permissions, e.g. ['profile','usage']. 'keys' lets the new key manage keys.",
                ),
            redirectUris: z
                .array(z.string())
                .optional()
                .describe("Allowed BYOP redirect URIs (publishable only)."),
            earnings: z
                .boolean()
                .optional()
                .describe("Enable developer earnings (publishable only)."),
        },
        createKey,
    ],
    [
        "revokeKey",
        "Revoke (delete) an API key of the authenticated account by id. " +
            "Use listKeys to find ids. Requires an API key with 'account:keys' permission.",
        {
            id: z.string().min(1).describe("Id of the key to revoke."),
        },
        revokeKey,
    ],
];
