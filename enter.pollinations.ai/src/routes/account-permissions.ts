export type AccountPermission = "profile" | "usage" | "keys";

export type AccountPermissionApiKey = {
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
};

export function isSecretApiKey(apiKey: AccountPermissionApiKey): boolean {
    return ((apiKey.metadata?.keyType as string) || "secret") === "secret";
}

export function hasDirectAccountPermission(
    apiKey: AccountPermissionApiKey | undefined,
    permission: AccountPermission,
): boolean {
    return !!apiKey?.permissions?.account?.includes(permission);
}

export function hasAccountReadPermission(
    apiKey: AccountPermissionApiKey | undefined,
    permission: Exclude<AccountPermission, "keys">,
): boolean {
    if (!apiKey) return true;
    return (
        hasDirectAccountPermission(apiKey, permission) ||
        (isSecretApiKey(apiKey) && hasDirectAccountPermission(apiKey, "keys"))
    );
}
