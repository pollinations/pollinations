import { isPublishableKey, readRedirectUris } from "./key-type.ts";
import type { ApiKey, ApiKeyUpdateParams } from "./types.ts";

type KeyEditValues = Omit<ApiKeyUpdateParams, "expiresAt"> & {
    expiryDays?: number | null;
};

export function initialKeyEditValues(
    apiKey: ApiKey,
    now = Date.now(),
): KeyEditValues {
    if (isPublishableKey(apiKey)) {
        return {
            name: apiKey.name ?? "",
            redirectUris: readRedirectUris(apiKey.metadata)
                .map((uri) => uri.trim())
                .filter(Boolean),
            earningsEnabled: apiKey.metadata?.earningsEnabled === true,
        };
    }
    const days = apiKey.expiresAt
        ? Math.max(0, (new Date(apiKey.expiresAt).getTime() - now) / 86400000)
        : null;
    return {
        name: apiKey.name ?? "",
        allowedModels: apiKey.permissions?.models ?? null,
        accountPermissions: apiKey.permissions?.account ?? [],
        questPollenOnly: apiKey.questPollenOnly ?? false,
        pollenBudget: apiKey.pollenBalance ?? null,
        // Only the editor display is rounded. Unchanged saves omit expiresAt.
        expiryDays: days === null ? null : Number(days.toPrecision(3)),
    };
}

/** PATCH only edited fields, so a stale form cannot reset newer server values. */
export function keyEditUpdates(
    initial: KeyEditValues,
    current: KeyEditValues,
    now = Date.now(),
): ApiKeyUpdateParams {
    const changes = { ...current };
    for (const field of Object.keys(changes) as (keyof KeyEditValues)[]) {
        if (JSON.stringify(changes[field]) === JSON.stringify(initial[field])) {
            delete changes[field];
        }
    }
    const { expiryDays, ...updates } = changes;
    return {
        ...updates,
        ...(expiryDays !== undefined && {
            expiresAt:
                expiryDays === null
                    ? null
                    : new Date(now + expiryDays * 86400000),
        }),
    };
}
