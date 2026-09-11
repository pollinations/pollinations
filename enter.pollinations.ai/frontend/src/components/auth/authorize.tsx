import {
    AccountIcon,
    AccountIdentity,
    Button,
    Chip,
    Collapsible,
    EarningsIcon,
    InlineLink,
    MailIcon,
    SparklesIcon,
    ToolIcon,
    UsageIcon,
    useScrollLock,
} from "@pollinations/ui";
import {
    AuthAccessItem,
    AuthAccessSummary,
    AuthFlowLayout,
    AuthInfoCard,
    DeviceAuthorizationResult,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import {
    formatPollen,
    PollenFundingAction,
    type PollenStatus,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import {
    getAuthorizeInitialPermissions,
    getAuthorizePollenBudget,
    getAuthorizeRequestError,
    sanitizeAuthorizeAccountPermissions,
} from "@shared/auth/authorize-config.ts";
import { redirectUriMatchesAllowlistExact } from "@shared/auth/redirect-uri.ts";
import { useLocation, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient, type User } from "../../auth.ts";
import { config } from "../../config.ts";
import { useGitHubSignIn } from "../../hooks/use-github-sign-in.ts";
import { createKeyWithPermissions } from "../../lib/create-api-key.ts";
import {
    clearSignInContext,
    rememberAppPage,
    rememberSignIn,
} from "../../lib/sign-in-context.ts";
import { ExpiryDaysInput } from "../keys/expiry-days-input.tsx";
import {
    type KeyPermissions,
    useKeyPermissions,
} from "../keys/key-permissions.tsx";
import { PollenBudgetInput } from "../keys/pollen-budget-input.tsx";
import {
    areSelectedModelsPaidOnly,
    getSelectedModelCounts,
} from "../models/model-categories.ts";
import { useModelCategories } from "../models/use-model-categories.ts";
import { useOwnCommunityModels } from "../models/use-own-community-models.ts";
import { AppAttribution } from "./app-attribution.tsx";
import { ConsentModelPicker } from "./consent-model-picker.tsx";
import { SignInScreen } from "./sign-in-screen.tsx";

type Attribution = {
    found: boolean;
    error?: "redirect_uri_mismatch";
    clientId?: string;
    userId?: string;
    userName?: string;
    githubUsername?: string;
    appName?: string;
    redirectUris?: string[];
    earningsEnabled?: boolean;
};

async function readAttribution(response: Response): Promise<Attribution> {
    if (!response.ok) throw new Error("App lookup unavailable");
    return (await response.json()) as Attribution;
}

function safeParseUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

export type AuthorizeConsent = KeyPermissions & { generationEnabled: boolean };

export function Authorize({
    initialConsent,
    onConsentChange,
}: {
    initialConsent?: Partial<AuthorizeConsent>;
    onConsentChange?: (consent: AuthorizeConsent) => void;
} = {}) {
    const {
        redirect_url,
        user_code,
        app_key,
        state,
        response_type,
        code_challenge,
        code_challenge_method,
        models,
        budget,
        expiry,
        scope: urlScope,
        sign_in_error,
    } = useSearch({ from: "/authorize" });
    const location = useLocation();
    const requestUrl = new URL(location.href, window.location.origin);
    requestUrl.searchParams.delete("sign_in_error");
    // Router search values are typed arrays; OAuth callbacks need wire strings.
    if (urlScope) requestUrl.searchParams.set("scope", urlScope.join(" "));
    if (models) requestUrl.searchParams.set("models", models.join(","));
    const requestPath = `${requestUrl.pathname}${requestUrl.search}`;
    const [returnTo, setReturnTo] = useState<string | null>(null);

    const isDeviceMode = !!user_code;
    // OAuth 2.1 authorization-code flow: the callback carries ?code=...
    // instead of the legacy #api_key=... fragment.
    const isCodeFlow = !isDeviceMode && response_type === "code";

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user as User | undefined;

    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [lookupAttempt, setLookupAttempt] = useState(0);
    const [appLookupStatus, setAppLookupStatus] = useState<
        "idle" | "pending" | "valid" | "invalid" | "unavailable"
    >(app_key && !isDeviceMode ? "pending" : "idle");
    const {
        isSigningIn,
        error: signInError,
        signIn,
    } = useGitHubSignIn(requestPath, sign_in_error);
    const [error, setError] = useState<string | null>(null);
    const [attribution, setAttribution] = useState<Attribution | null>(null);
    const [deviceOutcome, setDeviceOutcome] = useState<
        "pending" | "approved" | "denied"
    >("pending");
    const [balances, setBalances] = useState<{
        quest: number;
        paid: number;
    } | null>(null);
    const [generationEnabled, setGenerationEnabled] = useState(
        initialConsent?.generationEnabled ?? models?.length !== 0,
    );

    const parsedRedirectUrl = redirect_url ? safeParseUrl(redirect_url) : null;
    const redirectHostname = parsedRedirectUrl?.hostname ?? "";

    const keyPermissions = useKeyPermissions({
        ...getAuthorizeInitialPermissions({
            models,
            budget,
            expiry,
            permissions: urlScope,
        }),
        ...initialConsent,
    });
    const { setAccountPermissions } = keyPermissions;
    const {
        allowedModels: selectedModels,
        pollenBudget,
        expiryDays,
        accountPermissions,
    } = keyPermissions.permissions;
    useEffect(() => {
        onConsentChange?.({
            allowedModels: selectedModels,
            pollenBudget,
            expiryDays,
            accountPermissions,
            generationEnabled,
        });
    }, [
        selectedModels,
        pollenBudget,
        expiryDays,
        accountPermissions,
        generationEnabled,
        onConsentChange,
    ]);

    // The minted key is the signed-in user's, so it reaches their own private
    // models just as their dashboard keys do — but the anonymous catalog omits
    // them, so the consent screen has to learn them separately.
    const [modelsExpanded, setModelsExpanded] = useState(false);
    const ownModels = useOwnCommunityModels(!!user);
    const {
        categories: modelCategories,
        catalog,
        status: modelStatus,
        retry: retryModels,
    } = useModelCategories(ownModels);
    const catalogModels = modelCategories.flatMap(({ models }) => models);
    const allowedModels = generationEnabled
        ? keyPermissions.permissions.allowedModels
        : [];
    const requestedModels =
        models == null
            ? catalogModels
            : models.map(
                  (id) =>
                      catalogModels.find((model) => model.id === id) ?? {
                          id,
                          label: id,
                      },
              );
    const selectedModelCounts = getSelectedModelCounts(
        allowedModels,
        requestedModels.map(({ id }) => id),
        modelCategories,
    );
    const fundingStatus: PollenStatus | undefined =
        balances && balances.paid <= 0 && balances.quest <= 0
            ? { state: "no-pollen" }
            : balances &&
                balances.paid <= 0 &&
                areSelectedModelsPaidOnly(allowedModels, requestedModels)
              ? { state: "paid-required" }
              : undefined;
    // Preserve the caller's requested scopes for the authorization response.
    // Sources: `scope` URL param (both flows) and /api/device/info fallback.
    const [requestedScopes, setRequestedScopes] = useState<Set<string>>(
        () => new Set(urlScope ?? []),
    );
    const setOptionalPermission = (permission: string, checked: boolean) => {
        if (!requestedScopes.has(permission)) return;
        const current = keyPermissions.permissions.accountPermissions ?? [];
        setAccountPermissions(
            checked
                ? Array.from(new Set([...current, permission]))
                : current.filter((scope) => scope !== permission),
        );
    };
    // Validation/lookup errors end the check even when no attribution arrived.
    const isAttributionPending = isDeviceMode
        ? !!app_key && !attribution && !error
        : appLookupStatus === "pending";
    const requestValidationError = isDeviceMode
        ? null
        : getAuthorizeRequestError({
              redirectUrl: redirect_url,
              appKey: app_key,
              responseType: response_type,
              codeChallenge: code_challenge,
              codeChallengeMethod: code_challenge_method,
          });
    const canAuthorize =
        !error &&
        !requestValidationError &&
        (isDeviceMode || parsedRedirectUrl !== null) &&
        !isAttributionPending &&
        (!generationEnabled || modelStatus === "ready") &&
        // The code flow only runs for registered clients with a validated
        // redirect — no hostname-only fallback like the legacy flow.
        (isDeviceMode || !app_key || appLookupStatus === "valid");
    const canRedirectOnDeny =
        parsedRedirectUrl !== null &&
        (isCodeFlow
            ? appLookupStatus === "valid"
            : !app_key || appLookupStatus === "valid");
    const exitLabel = isDeviceMode ? "Cancel" : "Back to app";
    const hasAppExit = !!returnTo || canRedirectOnDeny || isAttributionPending;

    const isMobile = window.innerWidth < 768;
    useScrollLock(!isMobile);

    // biome-ignore lint/correctness/useExhaustiveDependencies: lookupAttempt intentionally reruns the lookup after Try again.
    useEffect(() => {
        let active = true;
        rememberSignIn(requestPath);
        setReturnTo(null);
        setAppLookupStatus("idle");
        if (isDeviceMode) {
            // device.tsx forwards the server-stored scope as `scope=` in the
            // URL, which flows into `urlScope` and preselects the
            // Advanced toggles. Fallback for direct-link device URLs that
            // skipped /device: fetch scope from the server and apply it.
            if (!urlScope?.length) {
                apiClient.device.info
                    .$get({ query: { user_code } })
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
                apiClient["app-lookup"]
                    .$get({ query: { app_key } })
                    .then(readAttribution)
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
            const validationError = requestValidationError;
            setError(validationError);
            setAppLookupStatus(app_key ? "pending" : "idle");
            // Attribution is identified by client_id only. Without one, the
            // consent screen falls back to the hostname display.
            if (!app_key) {
                setAppLookupStatus(validationError ? "invalid" : "valid");
                return;
            }

            const lookupQuery: {
                client_id: string;
                redirect_uri?: string;
            } = { client_id: app_key };
            if (!validationError && redirect_url) {
                lookupQuery.redirect_uri = redirect_url;
            }
            apiClient["app-lookup"]
                .$get({ query: lookupQuery })
                .then(readAttribution)
                .then((data) => {
                    if (!active) return;
                    const attr = data as Attribution;
                    setAttribution(attr);
                    setReturnTo(
                        rememberAppPage(
                            requestPath,
                            document.referrer,
                            attr.redirectUris ?? [],
                        ),
                    );
                    if (validationError) {
                        setAppLookupStatus("invalid");
                    } else if (attr.error === "redirect_uri_mismatch") {
                        setAppLookupStatus("invalid");
                        setError(
                            "This redirect URL is not registered for this app. Authorization blocked.",
                        );
                    } else if (!attr.found) {
                        setAppLookupStatus("invalid");
                        setError(
                            "This app key could not be verified. Authorization blocked.",
                        );
                    } else if (
                        isCodeFlow &&
                        (!redirect_url ||
                            !redirectUriMatchesAllowlistExact(
                                redirect_url,
                                attr.redirectUris,
                            ))
                    ) {
                        // The code flow needs an exact match (the code rides
                        // the query string); app-lookup applies the legacy
                        // flow's lenient rules, so re-check strictly here —
                        // same check POST /api/oauth/code enforces.
                        setAppLookupStatus("invalid");
                        setError(
                            "This redirect URL is not registered for this app. Authorization blocked.",
                        );
                    } else {
                        setAppLookupStatus("valid");
                    }
                })
                .catch(() => {
                    if (!active) return;
                    setAppLookupStatus("unavailable");
                    setError(
                        validationError ??
                            "Could not verify this app key. Authorization blocked.",
                    );
                });
        }
        return () => {
            active = false;
        };
    }, [
        requestPath,
        lookupAttempt,
        isDeviceMode,
        isCodeFlow,
        user_code,
        urlScope,
        app_key,
        redirect_url,
        requestValidationError,
        setAccountPermissions,
    ]);

    useEffect(() => {
        let active = true;
        setBalances(null);
        if (!user) return;

        apiClient.customer.balance
            .$get()
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!active || !data) return;
                setBalances({
                    quest: data.tierBalance ?? 0,
                    paid: data.packBalance ?? 0,
                });
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [user]);

    async function handleAuthorize(): Promise<void> {
        if (!canAuthorize || isAuthorizing) return;

        setIsAuthorizing(true);
        setError(null);

        try {
            const { pollenBudget, accountPermissions } =
                keyPermissions.permissions;
            const allowedModels = generationEnabled
                ? keyPermissions.permissions.allowedModels
                : [];
            const grantedAccountPermissions =
                sanitizeAuthorizeAccountPermissions(accountPermissions) ?? [];
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
                },
                permissions: {
                    allowedModels,
                    pollenBudget: getAuthorizePollenBudget(
                        allowedModels,
                        pollenBudget,
                    ),
                    accountPermissions: grantedAccountPermissions,
                },
            });

            if (isDeviceMode) {
                const res = await apiClient.device.approve.$post({
                    json: {
                        userCode: user_code,
                        apiKey: key,
                        apiKeyId: id,
                        expiresIn,
                        // Same convention as the code flow below: the token
                        // response must echo the granted scope when it
                        // differs from the requested one (RFC 6749 §5.1)
                        scope: requestedScopes.size
                            ? grantedAccountPermissions.join(" ")
                            : undefined,
                    },
                });
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
                const url = new URL(parsedRedirectUrl.href);
                if (isCodeFlow) {
                    if (!app_key || !code_challenge || !redirect_url) {
                        throw new Error(
                            "Missing client_id or PKCE code_challenge",
                        );
                    }
                    const res = await apiClient.oauth.code
                        .$post({
                            json: {
                                apiKey: key,
                                clientId: app_key,
                                redirectUri: redirect_url,
                                // "" (requested but narrowed to zero) is
                                // distinct from undefined (nothing requested)
                                // — RFC 6749 §5.1 needs the token response to
                                // echo the former
                                scope: requestedScopes.size
                                    ? grantedAccountPermissions.join(" ")
                                    : undefined,
                                codeChallenge: code_challenge,
                                codeChallengeMethod: "S256",
                                expiresIn,
                            },
                        })
                        .catch(() => null);
                    if (!res || !res.ok) {
                        // The key was minted but can't be delivered — don't
                        // leave an active orphan in the account.
                        authClient.apiKey.delete({ keyId: id }).catch(() => {});
                        const data = (await res?.json().catch(() => null)) as {
                            message?: string;
                            error?: { message?: string };
                        } | null;
                        throw new Error(
                            data?.message ||
                                data?.error?.message ||
                                "Failed to create authorization code",
                        );
                    }
                    const { code } = (await res.json()) as { code: string };
                    url.searchParams.set("code", code);
                    if (state) url.searchParams.set("state", state);
                } else {
                    const hash = new URLSearchParams({ api_key: key });
                    if (state) hash.set("state", state);
                    url.hash = hash.toString();
                }
                clearSignInContext();
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
                await apiClient.device.deny.$post({
                    json: {
                        userCode: user_code.toUpperCase(),
                    },
                });
            } catch {
                // Best-effort deny
            }
            setDeviceOutcome("denied");
        } else if (canRedirectOnDeny && parsedRedirectUrl) {
            const url = new URL(parsedRedirectUrl.href);
            if (isCodeFlow) {
                // RFC 6749 §4.1.2.1: code-flow errors ride the query string.
                url.searchParams.set("error", "access_denied");
                if (state) url.searchParams.set("state", state);
            } else {
                const hash = new URLSearchParams({ error: "access_denied" });
                if (state) hash.set("state", state);
                url.hash = hash.toString();
            }
            clearSignInContext();
            window.location.href = url.toString();
        } else if (returnTo) {
            clearSignInContext();
            window.location.href = returnTo;
        }
    }

    if (deviceOutcome !== "pending") {
        return (
            <DeviceAuthorizationResult denied={deviceOutcome === "denied"} />
        );
    }

    const accountHeader = user ? (
        <div
            data-theme="neutral"
            className="polli:inline-flex polli:min-w-0 polli:max-w-full polli:rounded-full polli:bg-theme-bg-subtle polli:p-1 polli:pr-3"
        >
            <AccountIdentity
                name={user.githubUsername || user.name || user.email}
                avatarUrl={user.image}
                secondaryContent={
                    <span className="inline-flex items-center gap-2 text-xs tabular-nums">
                        <span className="inline-flex items-center gap-1">
                            <WalletKindIcon kind="paid" />
                            <span className="sr-only">Paid Pollen: </span>
                            {balances === null
                                ? "…"
                                : formatPollen(Math.max(0, balances.paid))}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <WalletKindIcon kind="tier" />
                            <span className="sr-only">Quest Pollen: </span>
                            {balances === null
                                ? "…"
                                : formatPollen(Math.max(0, balances.quest))}
                        </span>
                    </span>
                }
            />
        </div>
    ) : undefined;
    if (error && !isDeviceMode) {
        return (
            <AuthFlowLayout
                dialog={{ labelledBy: "connection-error-title" }}
                account={accountHeader}
                actions={
                    appLookupStatus === "unavailable" && (
                        <Button
                            onClick={() =>
                                setLookupAttempt((attempt) => attempt + 1)
                            }
                            className="polli:rounded-md"
                        >
                            Try again
                        </Button>
                    )
                }
                secondaryAction={
                    (returnTo || canRedirectOnDeny) && (
                        <Button
                            onClick={handleDeny}
                            data-theme="neutral"
                            className="polli:rounded-md"
                        >
                            Back to app
                        </Button>
                    )
                }
            >
                <div className="space-y-2 pt-3">
                    <div>
                        <AppAttribution
                            titleId="connection-error-title"
                            attribution={attribution}
                            isDeviceMode={false}
                            redirectHostname={redirectHostname}
                        />
                    </div>
                    <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                        {appLookupStatus === "valid"
                            ? "could not connect"
                            : "cannot connect"}{" "}
                        to your{" "}
                        <InlineLink
                            href="https://pollinations.ai/"
                            className="polli:font-semibold"
                        >
                            pollinations.ai account
                        </InlineLink>
                        .
                    </p>
                </div>
                <ErrorBanner>
                    {error}
                    {!returnTo &&
                        !canRedirectOnDeny &&
                        appLookupStatus !== "unavailable" &&
                        !isAttributionPending && (
                            <p className="mt-2">
                                Open this connection from the app.
                            </p>
                        )}
                </ErrorBanner>
            </AuthFlowLayout>
        );
    }

    if (isPending || !user || signInError || isSigningIn) {
        const displayedError = error ?? signInError;
        return (
            <SignInScreen
                appFirst={!isDeviceMode}
                app={
                    <AppAttribution
                        titleId={isDeviceMode ? undefined : "sign-in-title"}
                        attribution={attribution}
                        isDeviceMode={isDeviceMode}
                        userCode={user_code}
                        redirectHostname={redirectHostname}
                    />
                }
                error={displayedError}
                actions={
                    !error && (
                        <GitHubSignInButton
                            onClick={signIn}
                            isSigningIn={
                                isPending || isSigningIn || isAttributionPending
                            }
                            pendingLabel={
                                isPending
                                    ? "Checking account…"
                                    : isAttributionPending
                                      ? "Checking app…"
                                      : undefined
                            }
                            retry={!!signInError}
                        />
                    )
                }
                secondaryAction={
                    (isDeviceMode ||
                        (!isPending && !isSigningIn && hasAppExit)) && (
                        <Button
                            as="button"
                            onClick={handleDeny}
                            data-theme="neutral"
                            className="polli:rounded-md whitespace-nowrap shrink-0"
                            disabled={
                                isPending ||
                                isSigningIn ||
                                (!isDeviceMode &&
                                    isAttributionPending &&
                                    !returnTo)
                            }
                        >
                            {exitLabel}
                        </Button>
                    )
                }
            />
        );
    }

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "authorize-dialog-title" }}
            account={accountHeader}
            actionLayout="inline"
            actions={
                !error && (
                    <Button
                        as="button"
                        onClick={handleAuthorize}
                        className="polli:rounded-md whitespace-nowrap shrink-0"
                        disabled={!canAuthorize || isAuthorizing}
                        aria-busy={isAuthorizing || isAttributionPending}
                    >
                        {isAuthorizing
                            ? "Connecting…"
                            : isAttributionPending
                              ? "Checking app…"
                              : "Allow access"}
                    </Button>
                )
            }
            secondaryAction={
                (isDeviceMode || hasAppExit) && (
                    <Button
                        as="button"
                        onClick={handleDeny}
                        data-theme="neutral"
                        className="polli:rounded-md whitespace-nowrap shrink-0"
                        disabled={
                            isAuthorizing ||
                            (!isDeviceMode && isAttributionPending && !returnTo)
                        }
                    >
                        {exitLabel}
                    </Button>
                )
            }
        >
            <div>
                <div className="pt-3">
                    <AppAttribution
                        titleId="authorize-dialog-title"
                        attribution={attribution}
                        isDeviceMode={isDeviceMode}
                        userCode={user_code}
                        redirectHostname={redirectHostname}
                    />
                </div>
                {error ? (
                    <ErrorBanner>Unable to connect. {error}</ErrorBanner>
                ) : (
                    <>
                        <AuthAccessSummary
                            title={
                                <>
                                    is requesting access to your{" "}
                                    <InlineLink
                                        href="https://pollinations.ai/"
                                        className="polli:font-semibold"
                                    >
                                        pollinations.ai account
                                    </InlineLink>
                                    .
                                </>
                            }
                        >
                            <AuthAccessItem
                                checked
                                icon={<AccountIcon className="h-4 w-4" />}
                                control={
                                    <Chip intent="neutral" size="sm">
                                        Required
                                    </Chip>
                                }
                            >
                                ID, username and picture.
                            </AuthAccessItem>
                            {requestedScopes.has("profile") && (
                                <AuthAccessItem
                                    icon={<MailIcon className="h-4 w-4" />}
                                    ariaLabel="Share display name and email"
                                    checked={
                                        keyPermissions.permissions.accountPermissions?.includes(
                                            "profile",
                                        ) ?? false
                                    }
                                    onChange={(checked) =>
                                        setOptionalPermission(
                                            "profile",
                                            checked,
                                        )
                                    }
                                    disabled={isAuthorizing}
                                >
                                    Display name and email.
                                </AuthAccessItem>
                            )}
                            {requestedScopes.has("usage") && (
                                <AuthAccessItem
                                    icon={<UsageIcon className="h-4 w-4" />}
                                    ariaLabel="Share account activity"
                                    checked={
                                        keyPermissions.permissions.accountPermissions?.includes(
                                            "usage",
                                        ) ?? false
                                    }
                                    onChange={(checked) =>
                                        setOptionalPermission("usage", checked)
                                    }
                                    disabled={isAuthorizing}
                                >
                                    Balance, usage, earnings and quest status.
                                </AuthAccessItem>
                            )}
                            {requestedScopes.has("keys") && (
                                <AuthAccessItem
                                    icon={<ToolIcon className="h-4 w-4" />}
                                    ariaLabel="Allow account management"
                                    checked={
                                        keyPermissions.permissions.accountPermissions?.includes(
                                            "keys",
                                        ) ?? false
                                    }
                                    onChange={(checked) =>
                                        setOptionalPermission("keys", checked)
                                    }
                                    disabled={isAuthorizing}
                                >
                                    API keys, agents, models and connected apps.
                                </AuthAccessItem>
                            )}
                        </AuthAccessSummary>
                        <div className="mb-3">
                            <AuthInfoCard title={null}>
                                <ul className="space-y-3 text-sm text-theme-text-base">
                                    <AuthAccessItem
                                        icon={
                                            <SparklesIcon className="h-4 w-4" />
                                        }
                                        ariaLabel="Allow AI generation"
                                        checked={generationEnabled}
                                        onChange={setGenerationEnabled}
                                        disabled={isAuthorizing}
                                        details={
                                            generationEnabled && (
                                                <div className="space-y-3">
                                                    {modelStatus ===
                                                    "loading" ? (
                                                        <output>
                                                            Loading models…
                                                        </output>
                                                    ) : modelStatus ===
                                                      "error" ? (
                                                        <ErrorBanner>
                                                            <p>
                                                                Couldn’t load
                                                                models.
                                                            </p>
                                                            <Button
                                                                size="sm"
                                                                onClick={
                                                                    retryModels
                                                                }
                                                                aria-label="Retry loading models"
                                                                className="polli:mt-2"
                                                            >
                                                                Try again
                                                            </Button>
                                                        </ErrorBanner>
                                                    ) : null}
                                                    {(attribution?.earningsEnabled ||
                                                        fundingStatus) && (
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {attribution?.earningsEnabled && (
                                                                <Chip
                                                                    intent="info"
                                                                    size="sm"
                                                                    title="The app earns 20% of the pollen you spend in it."
                                                                >
                                                                    <EarningsIcon
                                                                        aria-hidden="true"
                                                                        className="h-3.5 w-3.5"
                                                                    />
                                                                    App earns
                                                                    20%
                                                                </Chip>
                                                            )}
                                                            {fundingStatus && (
                                                                <PollenFundingAction
                                                                    status={
                                                                        fundingStatus
                                                                    }
                                                                    enterUrl={
                                                                        config.baseUrl
                                                                    }
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                    <PollenBudgetInput
                                                        value={
                                                            keyPermissions
                                                                .permissions
                                                                .pollenBudget
                                                        }
                                                        onChange={
                                                            keyPermissions.setPollenBudget
                                                        }
                                                        inline
                                                    />
                                                    {modelStatus ===
                                                        "ready" && (
                                                        <Collapsible
                                                            label={
                                                                <span className="flex flex-wrap items-center gap-2">
                                                                    <span>
                                                                        Models
                                                                    </span>
                                                                    <span className="flex min-w-0 flex-wrap gap-1.5">
                                                                        {selectedModelCounts.map(
                                                                            ({
                                                                                modality,
                                                                                label,
                                                                                count,
                                                                            }) => (
                                                                                <Chip
                                                                                    key={
                                                                                        modality
                                                                                    }
                                                                                    size="sm"
                                                                                    intent="neutral"
                                                                                >
                                                                                    {
                                                                                        label
                                                                                    }{" "}
                                                                                    ·{" "}
                                                                                    {
                                                                                        count
                                                                                    }
                                                                                </Chip>
                                                                            ),
                                                                        )}
                                                                        {selectedModelCounts.length ===
                                                                            0 && (
                                                                            <Chip
                                                                                size="sm"
                                                                                intent="neutral"
                                                                            >
                                                                                None
                                                                                selected
                                                                            </Chip>
                                                                        )}
                                                                    </span>
                                                                </span>
                                                            }
                                                            expanded={
                                                                modelsExpanded
                                                            }
                                                            onToggle={() =>
                                                                setModelsExpanded(
                                                                    (value) =>
                                                                        !value,
                                                                )
                                                            }
                                                            disabled={
                                                                isAuthorizing
                                                            }
                                                            wrapperClassName="polli:border-0"
                                                            triggerClassName="polli:px-0 polli:text-sm polli:font-semibold"
                                                            hoverClassName="polli:hover:bg-transparent"
                                                            panelClassName="polli:pt-2"
                                                        >
                                                            <ConsentModelPicker
                                                                catalog={
                                                                    catalog
                                                                }
                                                                models={
                                                                    requestedModels
                                                                }
                                                                selected={
                                                                    allowedModels
                                                                }
                                                                onChange={
                                                                    keyPermissions.setAllowedModels
                                                                }
                                                                disabled={
                                                                    isAuthorizing
                                                                }
                                                            />
                                                        </Collapsible>
                                                    )}
                                                </div>
                                            )
                                        }
                                    >
                                        AI generation
                                    </AuthAccessItem>
                                </ul>
                            </AuthInfoCard>
                        </div>

                        <AuthInfoCard title={null}>
                            <ExpiryDaysInput
                                value={keyPermissions.permissions.expiryDays}
                                onChange={keyPermissions.setExpiryDays}
                                inline
                            />
                        </AuthInfoCard>
                        <p className="pt-3 text-xs text-theme-text-soft">
                            Revoke access anytime in your{" "}
                            <InlineLink href={`${config.baseUrl}/`} external>
                                dashboard
                            </InlineLink>
                            .
                        </p>
                    </>
                )}
            </div>
        </AuthFlowLayout>
    );
}
