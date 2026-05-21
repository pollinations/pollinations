import { useAuthActions } from "@pollinations_ai/sdk/react";
import type { ReactNode } from "react";

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
 * Render-prop primitive for asking for extra OAuth scopes. v1 compares against
 * the provider's `permissions` prop (no token introspection yet).
 */
export function RequestPermissions({
    permissions,
    children,
}: RequestPermissionsProps) {
    const { permissions: granted, login } = useAuthActions();
    const grantedSet = new Set(granted);
    const missing = permissions.filter((p) => !grantedSet.has(p));
    const request = () => login(permissions);
    return <>{children({ missing, request })}</>;
}
