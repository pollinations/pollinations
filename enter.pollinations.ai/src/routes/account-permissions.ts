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
