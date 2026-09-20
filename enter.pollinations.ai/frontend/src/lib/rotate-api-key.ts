import { apiClient } from "../api.ts";

export type RotatedApiKey = {
    id: string;
    key: string;
    name: string | null;
    rotatedFromId: string;
};

export async function rotateApiKey(id: string): Promise<RotatedApiKey> {
    const response = await apiClient["api-keys"][":id"].rotate.$post({
        param: { id },
    });

    if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
            message?: string;
            error?: { message?: string };
        } | null;
        throw new Error(
            err?.message || err?.error?.message || "Failed to rotate API key",
        );
    }

    const data = (await response.json()) as {
        id: string;
        key: string;
        name?: string | null;
        rotatedFromId: string;
    };

    return {
        id: data.id,
        key: data.key,
        name: data.name ?? null,
        rotatedFromId: data.rotatedFromId,
    };
}
