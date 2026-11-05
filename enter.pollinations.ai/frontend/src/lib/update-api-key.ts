import { accountClient } from "../api.ts";
import { readError } from "../components/community-endpoints/types.ts";
import type { ApiKeyUpdateParams } from "../components/keys/types.ts";

type UpdateKeyJson = Parameters<
    (typeof accountClient.keys)[":id"]["$patch"]
>[0]["json"];

/** Server-side fields of a key (budget, models, expiry, permissions). */
export async function updateApiKey(
    id: string,
    updates: ApiKeyUpdateParams,
): Promise<void> {
    const response = await accountClient.keys[":id"].$patch({
        param: { id },
        // Forms hold permission names as plain strings; the API rejects
        // unknown ones.
        json: {
            ...updates,
            expiresAt:
                updates.expiresAt instanceof Date
                    ? updates.expiresAt.toISOString()
                    : updates.expiresAt,
        } as UpdateKeyJson,
    });
    if (!response.ok) {
        throw new Error(await readError(response));
    }
}
