import { authClient } from "../auth.ts";

const SECONDS_PER_DAY = 24 * 60 * 60;

export function expiryDaysToExpiresIn(
    expiryDays: number | null | undefined,
): number | undefined {
    if (expiryDays == null) return undefined;
    return expiryDays * SECONDS_PER_DAY;
}

type Permissions = {
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
};

type CreateKeyInput = {
    name: string;
    prefix: "sk" | "pk";
    expiryDays?: number | null;
    metadata?: Record<string, unknown>;
    permissions?: Permissions;
};

type CreatedKey = {
    id: string;
    key: string;
    name: string | null;
    expiresIn: number | undefined;
};

// Two-step create: (1) create the key via better-auth, (2) POST the permission
// fields that better-auth's API key plugin doesn't cover (allowedModels,
// pollenBudget, accountPermissions). On step-2 failure the key survives with
// defaults — caller should surface the error so the user can revoke manually.
export async function createKeyWithPermissions({
    name,
    prefix,
    expiryDays,
    metadata,
    permissions,
}: CreateKeyInput): Promise<CreatedKey> {
    const expiresIn = expiryDaysToExpiresIn(expiryDays);
    const result = await authClient.apiKey.create({
        name,
        prefix,
        ...(expiresIn !== undefined && { expiresIn }),
        ...(metadata && { metadata }),
    });

    if (result.error || !result.data?.key) {
        throw new Error(result.error?.message || "Failed to create API key");
    }

    const { id, key } = result.data;

    if (permissions) {
        const updates = Object.fromEntries(
            Object.entries(permissions).filter(
                ([, v]) => v !== undefined && v !== null,
            ),
        );
        if (Object.keys(updates).length > 0) {
            const response = await fetch(`/api/api-keys/${id}/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(updates),
            });
            if (!response.ok) {
                const err = (await response.json().catch(() => null)) as {
                    message?: string;
                } | null;
                throw new Error(
                    `Key created but failed to set permissions: ${err?.message || "Unknown error"}`,
                );
            }
        }
    }

    return {
        id,
        key,
        name: result.data.name ?? null,
        expiresIn,
    };
}
