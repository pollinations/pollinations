import {
    CONSENT_PERMISSIONS,
    getAuthorizeInitialPermissions,
    parseScopeList,
    sanitizeAuthorizeAccountPermissions,
} from "@shared/auth/authorize-config.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../util.ts";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AccountPermissionsInput } from "../components/api-keys/account-permissions-input.tsx";
import { ExpiryDaysInput } from "../components/api-keys/expiry-days-input.tsx";
import { useKeyPermissions } from "../components/api-keys/key-permissions.tsx";
import { computeCategoryModalities } from "../components/api-keys/model-categories.ts";
import { getPermissionPillClasses } from "../components/api-keys/permission-ui.ts";
import { PollenBudgetInput } from "../components/api-keys/pollen-budget-input.tsx";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "../components/auth/auth-modal.tsx";
import { Button } from "../components/button.tsx";
import { config } from "../config.ts";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import { useScrollLock } from "../hooks/use-scroll-lock.ts";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";
import { formatPollen } from "../lib/format-pollen.ts";

type Attribution = {
    found: boolean;
    error?: "redirect_uri_mismatch";
    clientId?: string;
    userId?: string;
    userName?: string;
    githubUsername?: string;
    appName?: string;
    redirectUris?: string[];
};

function parseList(val: unknown): string[] | null {
    if (!val || typeof val !== "string") return null;
    const items = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return items.length ? items : null;
}

function parseNumber(val: unknown): number | null {
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

function safeParseUrl(url: string): URL | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function isRedirectUriAllowed(
    parsedRedirectUrl: URL | null,
    clientId: string | undefined,
    attribution: Attribution | null,
): boolean {
    if (!parsedRedirectUrl) return false;
    if (!clientId) return false;
    if (!attribution?.found) return false;
    const appUrl = attribution.appUrl
        ? safeParseUrl(attribution.appUrl)
        : null;
    if (!appUrl) return false;
    return appUrl.origin === parsedRedirectUrl.origin;
}

export const Route = createFileRoute("/authorize")({
    component: AuthorizeComponent,
    validateSearch: (search: Record<string, unknown>) => {
        const result: {
            redirect_url?: string;
            user_code?: string;
            app_key?: string;
            state?: string;
            models?: string[] | null;
            budget?: number | null;
            expiry?: number | null;
            scope?: string[] | null;
        } = {
            // Canonical OAuth name is `redirect_uri`; keep `redirect_url`
            // as a legacy alias so existing apps keep working.
            redirect_url:
                (search.redirect_uri as string) ||
                (search.redirect_url as string) ||
                "",
        };

        if (search.user_code && typeof search.user_code === "string") {
            result.user_code = search.user_code;
        }

        // Canonical OAuth name is `client_id`; `app_key` is a legacy alias.
        const appKey =
            (search.client_id as string) || (search.app_key as string);
        if (appKey && typeof appKey === "string") {
            result.app_key = appKey;
        }

        // OAuth `state` — echoed back on the callback so the caller can
        // correlate the response and defeat CSRF.
        if (search.state && typeof search.state === "string") {
            result.state = search.state;
        }

        const models = parseList(search.models);
        if (models !== null) result.models = models;

        const budget = parseNumber(search.budget);
        if (budget !== null) result.budget = budget;

        const expiry = parseNumber(search.expiry);
        if (expiry !== null) result.expiry = expiry;

        // Canonical OAuth name is `scope` (space-separated); `permissions`
        // (comma-separated) is a legacy alias. parseScopeList accepts either
        // separator. Router normalizes the URL to the canonical `scope` name.
        const scope =
            parseScopeList(search.scope) ?? parseList(search.permissions);
        if (scope !== null) result.scope = scope;

        return result;
    },
});

function AuthorizeComponent() {
    const {
        redirect_url,
        user_code,
        app_key,
        state,
        models,
        budget,
        expiry,
        scope: urlScope,
    } = Route.useSearch();
    const navigate = useNavigate();

    const isDeviceMode = !!user_code;

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const [error, setError] = useState<string | null>(null);
    const [attribution, setAttribution] = useState<Attribution | null>(null);
    const [deviceOutcome, setDeviceOutcome] = useState<
        "pending" | "approved" | "denied"
    >("pending");
    const [totalBalance, setTotalBalance] = useState<number | null>(null);

    // Memoize so React/biome can use it as a stable dependency in effects
    // below without re-firing on every render (safeParseUrl returns a new
    // URL instance each call).
    const parsedRedirectUrl = useMemo(
        () => (redirect_url ? safeParseUrl(redirect_url) : null),
        [redirect_url],
    );
    const redirectHostname = parsedRedirectUrl?.hostname ?? "";

    const keyPermissions = useKeyPermissions(
        getAuthorizeInitialPermissions({
            models,
            budget,
            expiry,
            permissions: urlScope,
        }),
    );
    const { setAccountPermissions } = keyPermissions;

    const modalities = computeCategoryModalities(
        keyPermissions.permissions.allowedModels,
    );
    // Which optional scopes the caller requested. Stays constant once set —
    // unaffected by the user toggling a scope off in the Advanced panel.
    // Sources: `scope` URL param (both flows) and /api/device/info fallback.
    const [requestedScopes, setRequestedScopes] = useState<Set<string>>(
        () => new Set(urlScope ?? []),
    );
    const visibleOptionalPermissions = CONSENT_PERMISSIONS.filter((p) =>
        requestedScopes.has(p),
    );
    const hasBudget = keyPermissions.permissions.pollenBudget !== null;
    const redirectAllowed = isRedirectUriAllowed(
        parsedRedirectUrl,
        app_key,
        attribution,
    );
    // Block the Authorize button while the /api/app-lookup round-trip for
    // a provided client_id is still in flight — otherwise a user could
    // click through before the redirect_uri / attribution check completes.
    const isAttributionPending = !!app_key && !attribution;
    const canAuthorize =
        (isDeviceMode || redirectAllowed) &&
        hasBudget &&
        !isAttributionPending;

    useScrollLock();

    useEffect(() => {
        if (isDeviceMode) {
            // device.tsx forwards the server-stored scope as `scope=` in the
            // URL, which flows into `urlScope` and preselects the
            // Advanced toggles. Fallback for direct-link device URLs that
            // skipped /device: fetch scope from the server and apply it.
            if (!urlScope?.length) {
                fetch(
                    `${config.baseUrl}/api/device/info?user_code=${encodeURIComponent(user_code)}`,
                    { credentials: "include" },
                )
                    .then((r) => {
                        if (!r.ok) throw new Error("Invalid device code");
                        return r.json() as Promise<{
                            scope?: string;
                            clientId?: string;
                            status?: string;
                        }>;
                    })
                    .then((data) => {
                        if (data.scope) {
                            const scopes = data.scope
                                .split(" ")
                                .filter(Boolean);
                            setRequestedScopes(new Set(scopes));
                            setAccountPermissions(
                                sanitizeAuthorizeAccountPermissions(scopes),
                            );
                        }
                    })
                    .catch((e) => setError(e.message));
            }
            // Fetch app attribution if device flow has an app_key
            if (app_key) {
                fetch(`/api/app-lookup?app_key=${encodeURIComponent(app_key)}`)
                    .then((r) => r.json())
                    .then((data) => {
                        const attr = data as Attribution;
                        setAttribution(attr);
                        if (!attr.found) {
                            setError(
                                "This app key could not be verified. Authorization blocked.",
                            );
                        }
                    })
                    .catch(() => {
                        setError(
                            "Could not verify this app key. Authorization blocked.",
                        );
                    });
            }
        } else {
            if (!redirect_url) {
                setError("No redirect URL provided");
                return;
            }
            if (!safeParseUrl(redirect_url)) {
                setError("Invalid redirect URL format");
                return;
            }

            if (!app_key) {
                setError(
                    "Missing client_id. The authorize flow requires a registered app key.",
                );
                return;
            }

            const lookupParams = new URLSearchParams({ client_id: app_key });
            if (!isDeviceMode && redirect_url) {
                lookupParams.set("redirect_uri", redirect_url);
            }
            fetch(`/api/app-lookup?${lookupParams.toString()}`)
                .then((r) => r.json())
                .then((data) => {
                    const attr = data as Attribution;
                    setAttribution(attr);
                    if (attr.error === "redirect_uri_mismatch") {
                        setError(
                            "This redirect URL is not registered for this app. Authorization blocked.",
                        );
                    } else if (!attr.found) {
                        setError(
                            "This app key could not be verified. Authorization blocked.",
                        );
                    }
                })
                .catch(() => {
                    setError(
                        "Could not verify this app key. Authorization blocked.",
                    );
                });
        }
    }, [
        isDeviceMode,
        user_code,
        urlScope,
        app_key,
        redirect_url,
        setAccountPermissions,
    ]);

    useEffect(() => {
        if (isDeviceMode) return;
        if (!parsedRedirectUrl) return;
        if (!app_key) return;
        if (!attribution) return;
        if (
            !isRedirectUriAllowed(parsedRedirectUrl, app_key, attribution)
        ) {
            setError(
                "redirect_uri does not match the registered app URL for this client_id.",
            );
        }
    }, [isDeviceMode, parsedRedirectUrl, app_key, attribution]);

    useEffect(() => {
        if (!user) return;

        apiClient.customer.balance
            .$get()
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!data) return;
                setTotalBalance(
                    (data.tierBalance ?? 0) + (data.packBalance ?? 0),
                );
            })
            .catch(() => {});
    }, [user]);

    async function handleAuthorize(): Promise<void> {
        if (!canAuthorize || isAuthorizing) return;

        setIsAuthorizing(true);
        setError(null);

        try {
            const { allowedModels, pollenBudget, accountPermissions } =
                keyPermissions.permissions;
            const { key, id, expiresIn } = await createKeyWithPermissions({
                name: isDeviceMode
                    ? `Device ${user_code}`
                    : attribution?.appName || redirectHostname,
                prefix: "sk",
                expiryDays: keyPermissions.permissions.expiryDays,
                metadata: {
                    ...(isDeviceMode && { deviceUserCode: user_code }),
                    ...(app_key &&
                        (!isDeviceMode || attribution?.found) && {
                            requestedClientId: app_key,
                        }),
                    ...(!isDeviceMode &&
                        parsedRedirectUrl && {
                            redirectOrigin: parsedRedirectUrl.origin,
                            redirectUri: parsedRedirectUrl.href,
                        }),
                    ...(attribution?.found && {
                        clientId: attribution.clientId,
                        createdForUserId: attribution.userId,
                        createdForApp: attribution.appName,
                    }),
                },
                permissions: {
                    allowedModels,
                    pollenBudget,
                    accountPermissions:
                        sanitizeAuthorizeAccountPermissions(
                            accountPermissions,
                        ) ?? [],
                },
            });

            if (isDeviceMode) {
                const res = await fetch(
                    `${config.baseUrl}/api/device/approve`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            userCode: user_code,
                            apiKey: key,
                            apiKeyId: id,
                            expiresIn,
                        }),
                    },
                );
                if (!res.ok) {
                    const data = await res.json().catch(() => null);
                    throw new Error(
                        (data as { message?: string })?.message ||
                            "Failed to approve device",
                    );
                }
                setDeviceOutcome("approved");
            } else {
                if (!parsedRedirectUrl) {
                    throw new Error("Invalid redirect URL format");
                }
                if (
                    !isRedirectUriAllowed(
                        parsedRedirectUrl,
                        app_key,
                        attribution,
                    )
                ) {
                    throw new Error(
                        "redirect_uri does not match the registered app URL for this client_id.",
                    );
                }
                const url = new URL(parsedRedirectUrl.href);
                const hash = new URLSearchParams({ api_key: key });
                if (state) hash.set("state", state);
                url.hash = hash.toString();
                window.location.href = url.toString();
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Authorization failed");
            setIsAuthorizing(false);
        }
    }

    async function handleDeny(): Promise<void> {
        if (isDeviceMode) {
            try {
                await fetch(`${config.baseUrl}/api/device/deny`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        userCode: user_code.toUpperCase(),
                    }),
                });
            } catch {
                // Best-effort deny
            }
            setDeviceOutcome("denied");
        } else if (
            isRedirectUriAllowed(parsedRedirectUrl, app_key, attribution) &&
            parsedRedirectUrl
        ) {
            const url = new URL(parsedRedirectUrl.href);
            const hash = new URLSearchParams({ error: "access_denied" });
            if (state) hash.set("state", state);
            url.hash = hash.toString();
            window.location.href = url.toString();
        } else {
            navigate({ to: "/" });
        }
    }

    if (deviceOutcome !== "pending") {
        const denied = deviceOutcome === "denied";
        return (
            <AuthModal>
                <AuthModalHeader />
                <div className="px-8 pb-8 pt-2 text-center">
                    <div className="text-4xl mb-4">
                        {denied ? "\u{1F6AB}" : "\u{2705}"}
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">
                        {denied ? "Access Denied" : "Device Authorized"}
                    </h2>
                    <p className="text-sm text-amber-900">
                        You can close this tab and return to your device.
                    </p>
                </div>
            </AuthModal>
        );
    }

    if (isPending) {
        return <AuthModalLoading />;
    }

    if (!user) {
        const displayedError = error ?? signInError;
        return (
            <AuthModal dialog={{ label: "Sign in to authorize" }}>
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    {displayedError ? (
                        <ErrorBanner>{displayedError}</ErrorBanner>
                    ) : (
                        <AuthInfoCard>
                            <AppAttribution
                                attribution={attribution}
                                isDeviceMode={isDeviceMode}
                                userCode={user_code}
                                redirectHostname={redirectHostname}
                            />
                            <p className="text-sm text-amber-900 mt-3">
                                Sign in to review and approve the requested
                                access.
                            </p>
                        </AuthInfoCard>
                    )}

                    <div className="flex gap-2 justify-end">
                        <Button
                            as="button"
                            onClick={handleDeny}
                            weight="outline"
                            color="dark"
                            disabled={isSigningIn}
                        >
                            Deny
                        </Button>
                        <Button
                            as="button"
                            onClick={signIn}
                            disabled={isSigningIn || !!error}
                            color="dark"
                        >
                            {isSigningIn
                                ? "Signing in..."
                                : "Continue with GitHub"}
                        </Button>
                    </div>
                </div>
            </AuthModal>
        );
    }

    return (
        <AuthModal dialog={{ labelledBy: "authorize-dialog-title" }}>
            <AuthModalHeader>
                <div className="flex items-center gap-3 min-w-0">
                    <a
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 min-w-0"
                    >
                        {user.image && (
                            <img
                                src={user.image}
                                alt=""
                                className="w-6 h-6 rounded-full shrink-0"
                            />
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate">
                            {user.githubUsername || user.email}
                        </span>
                    </a>
                    <div className="inline-flex items-stretch rounded-full bg-amber-100 border border-amber-300 text-sm overflow-hidden shrink-0">
                        {totalBalance !== null && (
                            <span className="flex items-center px-3 text-amber-900 whitespace-nowrap">
                                {formatPollen(totalBalance)} pollen
                            </span>
                        )}
                        <a
                            href="https://enter.pollinations.ai/#buy-pollen"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "flex items-center px-3 py-1 font-medium text-amber-900 bg-amber-200 hover:bg-amber-300 transition-colors cursor-pointer",
                                totalBalance !== null &&
                                    "border-l border-amber-300",
                            )}
                        >
                            Top up
                        </a>
                    </div>
                </div>
            </AuthModalHeader>

            <div className="px-6 py-2 space-y-4">
                {error ? (
                    <ErrorBanner>{error}</ErrorBanner>
                ) : (
                    <div>
                        <div className="-mx-6 px-6 py-4 bg-amber-100 border-y border-amber-300">
                            <p
                                id="authorize-dialog-title"
                                className="font-body text-xs font-semibold text-amber-800 tracking-wide mb-2"
                            >
                                Authorize
                            </p>
                            <AppAttribution
                                attribution={attribution}
                                isDeviceMode={isDeviceMode}
                                userCode={user_code}
                                redirectHostname={redirectHostname}
                            />
                        </div>

                        <div className="p-4">
                            <p className="font-body text-xs font-semibold text-amber-800 tracking-wide mb-3">
                                To
                            </p>
                            <ul className="text-sm text-amber-900 space-y-3">
                                <li className="flex items-start gap-2">
                                    <span className="w-4 shrink-0 text-amber-800">
                                        &#x1F464;
                                    </span>
                                    <span>
                                        See your username and this key&apos;s
                                        budget and usage.
                                    </span>
                                </li>
                                {keyPermissions.permissions.accountPermissions?.includes(
                                    "profile",
                                ) && (
                                    <li className="flex items-start gap-2">
                                        <span className="w-4 shrink-0 text-amber-800">
                                            &#x2709;
                                        </span>
                                        <span>See your name and email.</span>
                                    </li>
                                )}
                                {keyPermissions.permissions.accountPermissions?.includes(
                                    "usage",
                                ) && (
                                    <li className="flex items-start gap-2">
                                        <span className="w-4 shrink-0 text-amber-800">
                                            &#x1F4CA;
                                        </span>
                                        <span>
                                            See your account balance and usage.
                                        </span>
                                    </li>
                                )}
                                {keyPermissions.permissions.accountPermissions?.includes(
                                    "keys",
                                ) && (
                                    <li className="flex items-start gap-2">
                                        <span className="w-4 shrink-0 text-amber-800">
                                            &#x1F511;
                                        </span>
                                        <span>
                                            Create, list, and revoke API keys.
                                        </span>
                                    </li>
                                )}
                                <li className="flex items-start gap-2">
                                    <span
                                        className={`w-4 shrink-0 ${
                                            modalities.length === 0
                                                ? "text-red-600"
                                                : "text-amber-700"
                                        }`}
                                    >
                                        {modalities.length === 0
                                            ? "\u2717"
                                            : "\u2713"}
                                    </span>
                                    {modalities.length === 0 ? (
                                        <span>No AI models are enabled.</span>
                                    ) : (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span>Generate</span>
                                            <div className="flex items-center gap-1 flex-nowrap">
                                                {modalities.map((m) => (
                                                    <span
                                                        key={m}
                                                        className={`px-2 py-0.5 rounded-full text-xs border shrink-0 ${getPermissionPillClasses(m)}`}
                                                    >
                                                        {m}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </li>
                            </ul>
                        </div>

                        <div className="-mx-6 px-10 py-4 border-t border-amber-300">
                            <PollenBudgetInput
                                value={keyPermissions.permissions.pollenBudget}
                                onChange={keyPermissions.setPollenBudget}
                                inline
                                theme="amber"
                            />
                        </div>

                        <div className="-mx-6 px-10 py-4 border-t border-amber-300">
                            <ExpiryDaysInput
                                value={keyPermissions.permissions.expiryDays}
                                onChange={keyPermissions.setExpiryDays}
                                inline
                                theme="amber"
                            />
                        </div>

                        <details className="group -mx-6 border-t border-amber-300">
                            <summary className="cursor-pointer list-none px-3 py-3 flex items-center justify-end select-none">
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-amber-800 hover:bg-amber-100 hover:text-amber-950 transition-colors">
                                    Permissions
                                    <span className="text-amber-700 transition-transform group-open:rotate-180">
                                        &#x25BE;
                                    </span>
                                </span>
                            </summary>
                            <div className="px-3 pb-3 pt-1 space-y-6">
                                <AccountPermissionsInput
                                    value={
                                        keyPermissions.permissions
                                            .accountPermissions
                                    }
                                    onChange={
                                        keyPermissions.setAccountPermissions
                                    }
                                    allowedModels={
                                        keyPermissions.permissions.allowedModels
                                    }
                                    onModelsChange={
                                        keyPermissions.setAllowedModels
                                    }
                                    visiblePermissions={
                                        visibleOptionalPermissions
                                    }
                                    theme="amber"
                                    showApiName={false}
                                    modelsInitiallyExpanded
                                />
                            </div>
                        </details>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between p-6 pt-4">
                <a
                    href="/terms"
                    className="text-xs text-amber-800 hover:text-gray-900 hover:underline"
                >
                    Terms & Conditions
                </a>
                <div className="flex gap-2">
                    <Button
                        as="button"
                        onClick={handleDeny}
                        weight="outline"
                        color="dark"
                        disabled={isAuthorizing}
                    >
                        Deny
                    </Button>
                    <Button
                        as="button"
                        onClick={handleAuthorize}
                        disabled={!canAuthorize || isAuthorizing || !!error}
                        color="dark"
                    >
                        {isAuthorizing ? "Authorizing..." : "Authorize"}
                    </Button>
                </div>
            </div>
        </AuthModal>
    );
}
