import { apiClient } from "../api.ts";
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
        const result = await response.json().catch(() => null);
        throw new Error(
            (result as { error?: { message?: string } } | null)?.error
                ?.message || "Failed to save key. Please try again.",
        );
    }
}
