type SignInContext = { path: string; returnTo: string | null };
const storageKey = "pollinations-sign-in-context";
let current: SignInContext | null | undefined;

function signInPath(value: string): string | null {
    try {
        const url = new URL(value, location.origin);
        return url.origin === location.origin &&
            [
                "/authorize",
                "/sign-in",
                "/device",
                "/app/sign-in",
                "/api/auth/oauth2/authorize",
                "/edit-key",
                "/top-up",
            ].includes(url.pathname)
            ? `${url.pathname}${url.search}`
            : null;
    } catch {
        return null;
    }
}

export function getSignInContext(): SignInContext | null {
    if (current !== undefined) return current;
    current = null;
    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        const path =
            typeof saved?.path === "string" ? signInPath(saved.path) : null;
        if (path)
            current = {
                path,
                returnTo:
                    typeof saved.returnTo === "string" ? saved.returnTo : null,
            };
    } catch {
        /* Storage is optional. */
    }
    return current;
}

function save(context: SignInContext): SignInContext {
    current = context;
    try {
        sessionStorage.setItem(storageKey, JSON.stringify(context));
    } catch {
        /* Keep the current page usable without storage. */
    }
    return context;
}

export function rememberSignIn(value: string): SignInContext | null {
    const path = signInPath(value);
    const previous = getSignInContext();
    if (!path) return save({ path: "/sign-in", returnTo: null });
    return save({
        path,
        returnTo: previous?.path === path ? previous.returnTo : null,
    });
}

// Resume the real authorization page after a provider callback failure so app
// details and return destinations are looked up and validated again.
export function appSignInErrorPath(path: string): string | null {
    const safePath = signInPath(path);
    if (!safePath) return null;
    const url = new URL(safePath, location.origin);
    if (url.pathname !== "/authorize") return null;
    url.searchParams.set("sign_in_error", "1");
    return `${url.pathname}${url.search}`;
}

// Revalidate against server-provided registration on every app lookup.
// Never derive a return address from the requested (possibly rejected) callback.
export function rememberAppPage(
    path: string,
    referrer: string,
    registeredUris: readonly string[],
): string | null {
    const context = rememberSignIn(path);
    if (!context) return null;
    for (const candidate of [referrer, context.returnTo]) {
        if (!candidate) continue;
        try {
            const url = new URL(candidate);
            if (
                !["https:", "http:"].includes(url.protocol) ||
                url.origin === location.origin ||
                url.username ||
                url.password
            )
                continue;
            if (
                registeredUris.some((uri) => {
                    try {
                        return new URL(uri).origin === url.origin;
                    } catch {
                        return false;
                    }
                })
            )
                return save({ ...context, returnTo: url.href }).returnTo;
        } catch {
            /* Ignore malformed or missing referrers. */
        }
    }
    save({ ...context, returnTo: null });
    return null;
}

export function clearSignInContext(): void {
    current = null;
    try {
        sessionStorage.removeItem(storageKey);
    } catch {
        /* Storage is optional. */
    }
}
