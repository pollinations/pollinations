// Caches and classifies dashboard session refreshes.
//
// A refresh can fail two very different ways:
//  - the auth server explicitly says the session is gone (expired/revoked).
//    better-auth surfaces this as a *resolved* `{ error }` carrying an auth
//    status code. The user really is signed out.
//  - the get-session request itself never completed (offline blip, timeout,
//    an unrelated 5xx). A hard network failure surfaces as a *rejected*
//    promise; other failures surface as a resolved `{ error }` without an
//    auth status. Nothing is actually known about the session here, and it
//    is very likely still valid.
//
// Only the first case means "signed out". The second is transient: when a
// previously confirmed session exists, it is reused so a blip right after
// (say) creating an API key doesn't tear down the dashboard route — and
// anything mounted under it, like an open create-key dialog holding a
// one-time secret. This is *not* a blanket "always trust the cache"
// fallback: with nothing yet confirmed (e.g. the very first load fails),
// the failure still propagates instead of being silently swallowed.

export type DashboardSessionContext<TUser> = {
    user: TUser | null;
};

export type DashboardSessionResult<TUser> = {
    data?: { user?: TUser | null } | null;
    error?: { status?: number | null } | null;
};

export type GetDashboardSession<TUser> = () => Promise<
    DashboardSessionResult<TUser>
>;

function isUnauthenticatedStatus(status: number | null | undefined): boolean {
    return status === 401 || status === 403;
}

export function createDashboardSessionResolver<TUser>(
    getSession: GetDashboardSession<TUser>,
    staleTimeMs: number,
) {
    let pending: Promise<DashboardSessionResult<TUser>> | null = null;
    let expiresAt = 0;
    let lastKnownContext: DashboardSessionContext<TUser> | null = null;

    function fetchSession(): Promise<DashboardSessionResult<TUser>> {
        if (!pending || Date.now() >= expiresAt) {
            expiresAt = Date.now() + staleTimeMs;
            pending = getSession().catch((error) => {
                pending = null;
                expiresAt = 0;
                throw error;
            });
        }
        return pending;
    }

    function dropCache() {
        pending = null;
        expiresAt = 0;
    }

    async function resolve(): Promise<DashboardSessionContext<TUser>> {
        let result: DashboardSessionResult<TUser>;
        try {
            result = await fetchSession();
        } catch {
            // The get-session request itself failed to complete: transient.
            // Ride it out on the last confirmed session rather than forcing
            // every mounted child of the dashboard route to unmount.
            if (lastKnownContext) return lastKnownContext;
            throw new Error("Couldn't verify your session. Please retry.");
        }

        if (result.error) {
            if (isUnauthenticatedStatus(result.error.status)) {
                dropCache();
                lastKnownContext = null;
                throw new Error("Authentication failed.");
            }
            // A non-auth error status (e.g. a 5xx from the auth service) is
            // also transient, same reasoning as the catch block above.
            dropCache();
            if (lastKnownContext) return lastKnownContext;
            throw new Error("Couldn't verify your session. Please retry.");
        }

        lastKnownContext = { user: result.data?.user ?? null };
        return lastKnownContext;
    }

    return { resolve };
}
