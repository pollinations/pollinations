import { expiryDaysToExpiresIn } from "@shared/auth/authorize-config.ts";
import { apiClient } from "../api.ts";

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
    expiresAt?: string | null;
};

// Server-side creation keeps Better Auth as an implementation detail and lets
// us validate Pollinations-specific fields before the key exists.
export async function createKeyWithPermissions({
    name,
    prefix,
    expiryDays,
    metadata,
    permissions,
}: CreateKeyInput): Promise<CreatedKey> {
    const expiresIn = expiryDaysToExpiresIn(expiryDays);
    const keyType: "publishable" | "secret" =
        prefix === "pk" ? "publishable" : "secret";
    const body = {
        name,
        type: keyType,
        expiresIn,
        metadata,
        allowedModels: permissions?.allowedModels,
        pollenBudget: permissions?.pollenBudget,
        accountPermissions: permissions?.accountPermissions,
    };

    const response = await apiClient["api-keys"].$post({
        json: body,
    });

    if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
            message?: string;
            error?: { message?: string };
        } | null;
        throw new Error(
            err?.message || err?.error?.message || "Failed to create API key",
        );
    }

    const data = (await response.json()) as {
        id: string;
        key: string;
        name?: string | null;
        expiresAt?: string | null;
    };

    return {
        id: data.id,
        key: data.key,
        name: data.name ?? null,
        expiresIn,
        expiresAt: data.expiresAt,
    };
}
