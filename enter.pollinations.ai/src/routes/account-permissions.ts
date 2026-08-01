import { HTTPException } from "hono/http-exception";

export type AccountPermission = "profile" | "usage" | "keys";

export type AccountPermissionApiKey = {
    permissions?: Record<string, string[]>;
};

export function hasDirectAccountPermission(
    apiKey: AccountPermissionApiKey | undefined,
    permission: AccountPermission,
): boolean {
    return !!apiKey?.permissions?.account?.includes(permission);
}

export function requireAccountKeysPermission(
    apiKey: AccountPermissionApiKey | undefined,
): void {
    if (!apiKey) return;
    if (!hasDirectAccountPermission(apiKey, "keys")) {
        throw new HTTPException(403, {
            message: "API key does not have 'account:keys' permission",
        });
    }
}

/**
 * Read APIs have one canonical read permission (`profile` or `usage`).
 */
export function hasAccountReadPermission(
    apiKey: AccountPermissionApiKey | undefined,
    permission: Exclude<AccountPermission, "keys">,
): boolean {
    if (!apiKey) return true;
    return hasDirectAccountPermission(apiKey, permission);
}
