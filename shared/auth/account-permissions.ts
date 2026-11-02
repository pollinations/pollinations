import { HTTPException } from "hono/http-exception";
import type { RefusalContext } from "../http/fix-link.ts";
import { permissionRequired } from "../http/permission-required-error.ts";
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

/** Refuses a key without the permission, with a link to grant it to that key. */
export function requireAccountPermission(
    c: RefusalContext,
    permission: AccountPermission,
): void {
    if (hasAccountPermission(c.var.auth?.apiKey, permission)) return;
    // Agent run tokens never carry account permissions (api-key.ts), so a
    // grant would only widen the owner's key without letting the agent in.
    if (c.var.auth?.agentRun) {
        throw new HTTPException(403, {
            message: `Agent runs can't use 'account:${permission}'.`,
        });
    }
    throw permissionRequired(
        c,
        { permission },
        `API key does not have 'account:${permission}' permission.`,
    );
}
