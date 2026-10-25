import { accountClient } from "../api.ts";
import { readError } from "../components/community-endpoints/types.ts";
import type { ApiKeyUpdateParams } from "../components/keys/types.ts";

/** Server-side fields of a key (budget, models, expiry, permissions). */
export async function updateApiKey(
    id: string,
    updates: ApiKeyUpdateParams,
): Promise<void> {
    const response = await accountClient.keys[":id"].$patch({
        param: { id },
        json: {
            ...updates,
            expiresAt:
                updates.expiresAt instanceof Date
                    ? updates.expiresAt.toISOString()
                    : updates.expiresAt,
        },
    });
    if (!response.ok) {
        throw new Error(await readError(response));
    }
}
