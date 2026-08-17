import { HTTPException } from "hono/http-exception";

export type AccountPermission = "profile" | "usage" | "keys";

export type AccountPermissionApiKey = {
    permissions?: Record<string, string[]>;
};

export function hasAccountPermission(
    apiKey: AccountPermissionApiKey | undefined,
    permission: AccountPermission,
): boolean {
    if (!apiKey) return true;
    return !!apiKey.permissions?.account?.includes(permission);
}

export function requireAccountPermission(
    apiKey: AccountPermissionApiKey | undefined,
    permission: AccountPermission,
): void {
    if (!hasAccountPermission(apiKey, permission)) {
        throw new HTTPException(403, {
            message: `API key does not have 'account:${permission}' permission`,
        });
    }
}
