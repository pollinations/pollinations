import { HTTPException } from "hono/http-exception";
import type { CONSENT_PERMISSIONS } from "./authorize-config.ts";

export type AccountPermission = (typeof CONSENT_PERMISSIONS)[number];

export type AccountPermissionApiKey = {
    permissions?: Record<string, string[]>;
};

// The account owner (a dashboard session or session token) has no key, so no
// key restrictions apply. A key needs the scope granted explicitly.
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
