import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

// better-auth mints 32-character API key ids; anything else is a key name.
const KEY_ID = /^[a-zA-Z0-9]{32}$/;

const days = z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("Rolling window in days, 1-90");

function respond(data) {
    return createMCPResponse([createTextContent(data, true)]);
}

async function getBalance(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/balance"),
        {},
        context,
    );
    return respond({
        pollen: data.balance,
        note: "Pollen balance for the authenticated key. Key-scoped when the key has its own budget, otherwise account-wide.",
    });
}

/**
 * Resolve `--key` style values (names or ids) to key ids. Ids pass through
 * untouched, so a key scoped to `account:usage` alone can still filter by id
 * without needing `account:keys` to list names.
 */
async function resolveKeyIds(requested, context) {
    if (!requested?.length) return undefined;
    const ids = requested.filter((value) => KEY_ID.test(value));
    const names = requested.filter((value) => !KEY_ID.test(value));
    if (names.length === 0) return ids;
    const { data = [] } = await fetchJsonWithAuth(
        buildUrl("/account/keys"),
        {},
        context,
    );
    const resolved = names.map((want) => {
        const match = data.find((key) => key.id === want || key.name === want);
        if (match) return match.id;
        const near = data
            .filter((key) =>
                key.name?.toLowerCase().includes(want.toLowerCase()),
            )
            .map((key) => key.name);
        throw new Error(
            `Unknown key "${want}". Near matches: ${near.join(", ") || "(none)"}`,
        );
    });
    return [...ids, ...resolved];
}

async function getUsage(params, context) {
    requireApiKey(context);
    const keyIds = await resolveKeyIds(params.key, context);
    const data = await fetchJsonWithAuth(
        buildUrl(params.daily ? "/account/usage/daily" : "/account/usage", {
            days: params.days,
            limit: params.daily ? undefined : params.limit,
            models: params.model?.length ? params.model.join(",") : undefined,
            api_key_ids: keyIds?.length ? keyIds.join(",") : undefined,
        }),
        {},
        context,
    );
    return respond(data);
}

async function getEarnings(params, context) {
    requireApiKey(context);
    return respond(
        await fetchJsonWithAuth(
            buildUrl("/account/earnings", { days: params.days }),
            {},
            context,
        ),
    );
}

/** Derived claim state, mirroring `polli quests`' own display status. */
function questStatus(quest) {
    if (quest.state === "coming_soon" || quest.status === "coming_soon") {
        return "coming-soon";
    }
    if (quest.reward) {
        return quest.reward.claimedAt === null ? "claimable" : "claimed";
    }
    if (quest.state === "completed" || quest.status === "completed") {
        return "claimed";
    }
    return "open";
}

async function listQuests(params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/quests"),
        {},
        context,
    );
    if (!params.state) return respond(data);
    return respond({
        ...data,
        quests: (data.quests ?? []).filter(
            (quest) => questStatus(quest) === params.state,
        ),
    });
}

async function listKeys(_params, context) {
    requireApiKey(context);
    return respond(
        await fetchJsonWithAuth(buildUrl("/account/keys"), {}, context),
    );
}

async function createKey(params, context) {
    requireApiKey(context);
    return respond(
        await fetchJsonWithAuth(
            buildUrl("/account/keys"),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: params.name,
                    type: params.type,
                    expiresIn: params.expiresIn,
                    allowedModels: params.models,
                    pollenBudget: params.budget,
                    accountPermissions: params.permissions,
                    redirectUris: params.redirectUri,
                    earningsEnabled: params.earnings,
                }),
            },
            context,
        ),
    );
}

async function revokeKey(params, context) {
    requireApiKey(context);
    return respond(
        await fetchJsonWithAuth(
            buildUrl(`/account/keys/${encodeURIComponent(params.id)}`),
            { method: "DELETE" },
            context,
        ),
    );
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
        "Read API usage for the authenticated account, like `polli usage`. " +
            "Defaults to request history; set daily for a per-model daily summary. " +
            "Requires an API key with 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe("Daily summary instead of individual requests"),
            days: days,
            limit: z
                .number()
                .int()
                .min(1)
                .max(50000)
                .optional()
                .describe("Number of history records; ignored for daily"),
            model: z
                .array(z.string())
                .optional()
                .describe("Only these model ids"),
            key: z
                .array(z.string())
                .optional()
                .describe(
                    "Only these API keys, by name or id; names are resolved through /account/keys",
                ),
        },
        getUsage,
    ],
    [
        "getEarnings",
        "Read developer earnings from BYOP apps and community models, like `polli earnings`. " +
            "Requires an API key with 'account:usage' permission.",
        { days },
        getEarnings,
    ],
    [
        "listQuests",
        "List quests with their reward state, like `polli quests`. " +
            "Requires an API key with 'account:usage' permission.",
        {
            state: z
                .enum(["open", "claimable", "claimed", "coming-soon"])
                .optional()
                .describe("Only quests in this state"),
        },
        listQuests,
    ],
    [
        "listKeys",
        "List the account's API keys with their permissions, budget and last use, like `polli keys list`. " +
            "Requires an API key with 'account:keys' permission.",
        {},
        listKeys,
    ],
    [
        "createKey",
        "Create an API key and return its secret value, like `polli keys create`. " +
            "The returned key is shown only once. " +
            "Requires an API key with 'account:keys' permission.",
        {
            name: z.string().min(1).max(253).describe("Name for the API key"),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe("secret (sk_) or publishable app key (pk_)"),
            expiresIn: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Expiry in seconds from now"),
            models: z
                .array(z.string())
                .optional()
                .describe("Model ids this key may use; omit for all models"),
            budget: z
                .number()
                .min(0)
                .optional()
                .describe("Pollen budget cap; omit for unlimited"),
            permissions: z
                .array(z.string())
                .optional()
                .describe(
                    'Account permissions, e.g. ["usage"]; add "keys" to let it create keys',
                ),
            redirectUri: z
                .array(z.string())
                .optional()
                .describe("Allowed OAuth redirect URIs for publishable keys"),
            earnings: z
                .boolean()
                .optional()
                .describe("Enable developer earnings (publishable keys)"),
        },
        createKey,
    ],
    [
        "revokeKey",
        "Revoke an API key by id, like `polli keys revoke`. " +
            "Requires an API key with 'account:keys' permission.",
        {
            id: z
                .string()
                .min(1)
                .describe("Id of the key to revoke, from listKeys"),
        },
        revokeKey,
    ],
];
