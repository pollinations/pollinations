import {
    permissionRequired,
    type RefusalContext,
} from "@shared/http/refusals.ts";
import type { CONSENT_PERMISSIONS } from "./authorize-config.ts";

type AccountPermission = (typeof CONSENT_PERMISSIONS)[number];

type AccountPermissionApiKey = {
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

/** Refuses a key without the account permission, linking the page that grants it. */
export function requireAccountPermission(
    c: RefusalContext,
    permission: AccountPermission,
): void {
    if (!hasAccountPermission(c.var.auth?.apiKey, permission)) {
        throw permissionRequired(
            c,
            { permission },
            `API key does not have 'account:${permission}' permission.`,
        );
    }
}
