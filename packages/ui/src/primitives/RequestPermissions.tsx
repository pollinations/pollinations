import { useAuthActions } from "@pollinations_ai/sdk/react";
import { type ReactNode, useCallback, useMemo } from "react";

export type RequestPermissionsRenderProps = {
    /** Requested perms that aren't in the provider's configured set. */
    missing: string[];
    /** Re-trigger login with the union of current + requested permissions. */
    request: () => void;
};

export type RequestPermissionsProps = {
    /** Permissions the caller needs in addition to what's already configured. */
    permissions: string[];
    children: (props: RequestPermissionsRenderProps) => ReactNode;
};

/**
 * Render-prop primitive for asking for extra OAuth scopes. `missing` is
 * computed against the union of (a) the provider's initial `permissions`
 * prop and (b) any extras that have been requested via `login(extras)` so far
 * — i.e. the optimistic "what this client has asked for" set, not what the
 * server confirmed was granted. After `request()` redirects back, the next
 * render reflects the requested extras in `missing` immediately. If the user
 * denies a scope, this will under-report until full token introspection lands.
 */
export function RequestPermissions({
    permissions,
    children,
}: RequestPermissionsProps) {
    const { permissions: granted, login } = useAuthActions();
    const missing = useMemo(() => {
        const grantedSet = new Set(granted);
        return permissions.filter((p) => !grantedSet.has(p));
    }, [granted, permissions]);
    const request = useCallback(() => login(permissions), [login, permissions]);
    return <>{children({ missing, request })}</>;
}
