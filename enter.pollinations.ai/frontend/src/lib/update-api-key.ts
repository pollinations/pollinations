import { apiClient } from "../api.ts";
import { readError } from "../components/community-endpoints/types.ts";
import type { ApiKeyUpdateParams } from "../components/keys/types.ts";

/** Server-side fields of a key (budget, models, expiry, permissions). */
export async function updateApiKey(
    id: string,
    updates: ApiKeyUpdateParams,
): Promise<void> {
    const response = await apiClient["api-keys"][":id"].update.$post({
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
        // Includes the server's field-level detail, so an invalid expiry date
        // reads as one instead of a generic save failure.
        throw new Error(await readError(response));
    }
}
