import {
    AccountIcon,
    Button,
    Collapsible,
    Heading,
    KeyIcon,
    MailIcon,
    SproutIcon,
    Surface,
    Text,
    UsageIcon,
    useScrollLock,
} from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import { ModalityChip } from "@pollinations/ui/gen";
import {
    CONSENT_PERMISSIONS,
    getAuthorizeInitialPermissions,
    PKCE_S256_CHALLENGE_REGEX,
    sanitizeAuthorizeAccountPermissions,
} from "@shared/auth/authorize-config.ts";
import { redirectUriMatchesAllowlistExact } from "@shared/auth/redirect-uri.ts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient, type User } from "../../auth.ts";
import { useAccountBalance } from "../../hooks/use-account-balance.ts";
import { createKeyWithPermissions } from "../../lib/create-api-key.ts";
import { AccountPermissionsInput } from "../keys/account-permissions-input.tsx";
import { ExpiryDaysInput } from "../keys/expiry-days-input.tsx";
import { useKeyPermissions } from "../keys/key-permissions.tsx";
import { PollenBudgetInput } from "../keys/pollen-budget-input.tsx";
import { computeCategoryModalities } from "../models/model-categories.ts";
import { useModelCategories } from "../models/use-model-categories.ts";
import { useOwnCommunityModels } from "../models/use-own-community-models.ts";
import { AppAttribution } from "./app-attribution.tsx";
import { AuthAccountIdentity } from "./auth-account-identity.tsx";
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
    return (await response.json()) as Attribution;
}

function safeParseUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

export function Authorize() {
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
    } = useSearch({ from: "/authorize" });
    const navigate = useNavigate();

    const isDeviceMode = !!user_code;
    // OAuth 2.1 authorization-code flow: the callback carries ?code=...
    // instead of the legacy #api_key=... fragment.
    const isCodeFlow = !isDeviceMode && response_type === "code";

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user as User | undefined;

    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attribution, setAttribution] = useState<Attribution | null>(null);
    const [redirectValidationState, setRedirectValidationState] = useState<
        "unchecked" | "valid" | "invalid"
    >("unchecked");
    const [deviceOutcome, setDeviceOutcome] = useState<
        "pending" | "approved" | "denied"
    >("pending");
    const balance = useAccountBalance(Boolean(user));
    const [permissionsExpanded, setPermissionsExpanded] = useState(false);
    const topUpHref =
        typeof window === "undefined"
            ? "/top-up"
            : `/top-up?${new URLSearchParams({ redirect: window.location.href })}`;

    const parsedRedirectUrl = redirect_url ? safeParseUrl(redirect_url) : null;
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

    // The minted key is the signed-in user's, so it reaches their own private
    // models just as their dashboard keys do — but the anonymous catalog omits
    // them, so the consent screen has to learn them separately.
    const modelCategories = useModelCategories(useOwnCommunityModels(!!user));
    const modalities = computeCategoryModalities(
        keyPermissions.permissions.allowedModels,
        modelCategories,
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
    const isAttributionPending = !!app_key && !attribution;
    const canAuthorize =
        (isDeviceMode || parsedRedirectUrl !== null) &&
        !isAttributionPending &&
        // The code flow only runs for registered clients with a validated
        // redirect — no hostname-only fallback like the legacy flow.
        (!isCodeFlow || redirectValidationState === "valid");
    const canRedirectOnDeny =
        parsedRedirectUrl !== null &&
        (isCodeFlow
            ? redirectValidationState === "valid"
            : !app_key || redirectValidationState === "valid");

    const isMobile = window.innerWidth < 768;
    useScrollLock(!isMobile);

    useEffect(() => {
        setRedirectValidationState("unchecked");
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
            if (!redirect_url) {
                setError("No redirect URL provided");
                return;
            }
            if (!safeParseUrl(redirect_url)) {
                setError("Invalid redirect URL format");
                return;
            }

            // The legacy fragment flow is keyed on the *absence* of
            // response_type; an explicit unknown value must not silently
            // alias it (RFC 6749 §4.1.2.1 unsupported_response_type).
            if (response_type && response_type !== "code") {
                setError(
                    'Unsupported response_type — only "code" is supported.',
                );
                return;
            }

            // Code-flow front door (OAuth 2.1): PKCE and a registered client
            // are mandatory. Errors render locally — error params are never
            // redirected to a redirect_uri that hasn't been validated.
            if (isCodeFlow) {
                if (!app_key) {
                    setError(
                        "client_id is required for the authorization code flow",
                    );
                    return;
                }
                if (!code_challenge) {
                    setError(
                        "PKCE code_challenge is required for the authorization code flow",
                    );
                    return;
                }
                // An omitted method means "plain" per RFC 7636 §4.3, which we
                // don't support — require an explicit S256 so unsupported
                // clients fail here, before sign-in and key minting.
                if (code_challenge_method !== "S256") {
                    setError(
                        "code_challenge_method=S256 is required (only S256 is supported)",
                    );
                    return;
                }
                // Same check as the server's CreateCodeSchema, so malformed
                // challenges fail before a key is minted.
                if (!PKCE_S256_CHALLENGE_REGEX.test(code_challenge)) {
                    setError(
                        "code_challenge must be a 43-character base64url S256 challenge",
                    );
                    return;
                }
            }

            // Attribution is identified by client_id only. Without one, the
            // consent screen falls back to the hostname display.
            if (!app_key) {
                setRedirectValidationState("valid");
                return;
            }

            const lookupQuery: {
                client_id: string;
                redirect_uri?: string;
            } = { client_id: app_key };
            if (!isDeviceMode && redirect_url) {
                lookupQuery.redirect_uri = redirect_url;
            }
            apiClient["app-lookup"]
                .$get({ query: lookupQuery })
                .then(readAttribution)
                .then((data) => {
                    const attr = data as Attribution;
                    setAttribution(attr);
                    if (attr.error === "redirect_uri_mismatch") {
                        setRedirectValidationState("invalid");
                        setError(
                            "This redirect URL is not registered for this app. Authorization blocked.",
                        );
                    } else if (!attr.found) {
                        setRedirectValidationState("invalid");
                        setError(
                            "This app key could not be verified. Authorization blocked.",
                        );
                    } else if (
                        isCodeFlow &&
                        !redirectUriMatchesAllowlistExact(
                            redirect_url,
                            attr.redirectUris,
                        )
                    ) {
                        // The code flow needs an exact match (the code rides
                        // the query string); app-lookup applies the legacy
                        // flow's lenient rules, so re-check strictly here —
                        // same check POST /api/oauth/code enforces.
                        setRedirectValidationState("invalid");
                        setError(
                            "This redirect URL is not registered for this app. Authorization blocked.",
                        );
                    } else {
                        setRedirectValidationState("valid");
                    }
                })
                .catch(() => {
                    setRedirectValidationState("invalid");
                    setError(
                        "Could not verify this app key. Authorization blocked.",
                    );
                });
        }
    }, [
        isDeviceMode,
        isCodeFlow,
        user_code,
        urlScope,
        app_key,
        redirect_url,
        response_type,
        code_challenge,
        code_challenge_method,
        setAccountPermissions,
    ]);

    async function handleAuthorize(): Promise<void> {
        if (!canAuthorize || isAuthorizing) return;

        setIsAuthorizing(true);
        setError(null);

        try {
            const { allowedModels, pollenBudget, accountPermissions } =
                keyPermissions.permissions;
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
                    pollenBudget,
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
            window.location.href = url.toString();
        } else {
            navigate({ to: "/" });
        }
    }

    if (deviceOutcome !== "pending") {
        const denied = deviceOutcome === "denied";
        return (
            <AuthFlowLayout dialog={{ labelledBy: "device-result-title" }}>
                <Heading as="h1" id="device-result-title">
                    {denied ? "Access declined" : "Device connected"}
                </Heading>
                <Text size="sm">
                    You can close this tab and return to your device.
                </Text>
            </AuthFlowLayout>
        );
    }

    if (isPending) return <AuthModalLoading />;

    if (!user) {
        if (error) {
            return (
                <AuthFlowLayout
                    dialog={{ labelledBy: "authorize-error-title" }}
                    actions={
                        <Button intent="neutral" onClick={handleDeny}>
                            Go back
                        </Button>
                    }
                >
                    <Heading as="h1" id="authorize-error-title">
                        Couldn’t connect
                    </Heading>
                    <ErrorBanner>{error}</ErrorBanner>
                </AuthFlowLayout>
            );
        }
        return (
            <SignInScreen
                title="Sign in to Pollinations"
                description="Review the access this app is requesting before you connect."
                onCancel={handleDeny}
            >
                <Surface>
                    <AppAttribution
                        attribution={attribution}
                        isDeviceMode={isDeviceMode}
                        userCode={user_code}
                        redirectHostname={redirectHostname}
                    />
                </Surface>
            </SignInScreen>
        );
    }

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "authorize-dialog-title" }}
            headerAction={
                <AuthAccountIdentity
                    user={user}
                    balance={balance}
                    topUpHref={topUpHref}
                />
            }
            actions={
                <>
                    <Button
                        intent="neutral"
                        onClick={handleDeny}
                        disabled={isAuthorizing}
                    >
                        {error ? "Go back" : "Decline"}
                    </Button>
                    {!error && (
                        <Button
                            onClick={handleAuthorize}
                            disabled={!canAuthorize || isAuthorizing}
                        >
                            {isAuthorizing ? "Connecting…" : "Allow access"}
                        </Button>
                    )}
                </>
            }
        >
            <Heading as="h1" id="authorize-dialog-title">
                {error ? "Couldn’t connect" : "Allow app access"}
            </Heading>
            {error ? (
                <ErrorBanner>{error}</ErrorBanner>
            ) : (
                <div>
                    <Surface>
                        <AppAttribution
                            attribution={attribution}
                            isDeviceMode={isDeviceMode}
                            userCode={user_code}
                            redirectHostname={redirectHostname}
                        />
                    </Surface>

                    <Surface className="mt-5">
                        <p className="font-body text-xs font-semibold text-theme-text-soft tracking-wide mb-3">
                            Requested access
                        </p>
                        <ul className="text-sm text-theme-text-base space-y-3">
                            <li className="flex items-start gap-2">
                                <span className="w-4 shrink-0 text-theme-text-soft">
                                    <AccountIcon className="h-4 w-4" />
                                </span>
                                <span>
                                    See your username and this key&apos;s budget
                                    and usage.
                                </span>
                            </li>
                            {keyPermissions.permissions.accountPermissions?.includes(
                                "profile",
                            ) && (
                                <li className="flex items-start gap-2">
                                    <span
                                        className="flex h-5 w-4 shrink-0 items-center justify-center text-theme-text-soft"
                                        aria-hidden="true"
                                    >
                                        <MailIcon className="h-4 w-4" />
                                    </span>
                                    <span>See your name and email.</span>
                                </li>
                            )}
                            {keyPermissions.permissions.accountPermissions?.includes(
                                "usage",
                            ) && (
                                <li className="flex items-start gap-2">
                                    <span className="w-4 shrink-0 text-theme-text-soft">
                                        <UsageIcon className="h-4 w-4" />
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
                                    <span className="w-4 shrink-0 text-theme-text-soft">
                                        <KeyIcon className="h-4 w-4" />
                                    </span>
                                    <span>
                                        Manage API keys, agents, and models when
                                        enabled.
                                    </span>
                                </li>
                            )}
                            <li className="flex items-start gap-2">
                                <span
                                    className={`w-4 shrink-0 ${
                                        modalities.length === 0
                                            ? "text-intent-danger-text"
                                            : "text-theme-text-soft"
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
                                        <div className="flex flex-wrap items-center gap-1">
                                            {modalities.map((m) => (
                                                <ModalityChip
                                                    key={m}
                                                    modality={m}
                                                    size="sm"
                                                >
                                                    {m}
                                                </ModalityChip>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </li>
                            {attribution?.earningsEnabled && (
                                <li className="flex items-start gap-2">
                                    <span
                                        className="w-4 shrink-0 text-theme-text-soft"
                                        aria-hidden="true"
                                    >
                                        <SproutIcon className="h-4 w-4" />
                                    </span>
                                    <span>
                                        Earn{" "}
                                        <span className="font-semibold">
                                            20%
                                        </span>{" "}
                                        of the pollen you spend in-app.
                                    </span>
                                </li>
                            )}
                        </ul>
                    </Surface>

                    <Surface className="mt-5">
                        <PollenBudgetInput
                            value={keyPermissions.permissions.pollenBudget}
                            onChange={keyPermissions.setPollenBudget}
                            inline
                        />
                    </Surface>

                    <Surface className="mt-5">
                        <ExpiryDaysInput
                            value={keyPermissions.permissions.expiryDays}
                            onChange={keyPermissions.setExpiryDays}
                            inline
                        />
                    </Surface>

                    <Collapsible
                        expanded={permissionsExpanded}
                        onToggle={() => setPermissionsExpanded((v) => !v)}
                        wrapperClassName="mt-5 border-0 bg-surface-opaque shadow-well"
                        hoverClassName="hover:bg-theme-bg-pale"
                        panelClassName="px-3 pb-3 pt-1 space-y-6"
                        label={
                            <span className="flex justify-end">
                                <span className="text-sm font-medium text-theme-text-strong">
                                    Edit permissions
                                </span>
                            </span>
                        }
                    >
                        <AccountPermissionsInput
                            value={
                                keyPermissions.permissions.accountPermissions
                            }
                            onChange={keyPermissions.setAccountPermissions}
                            allowedModels={
                                keyPermissions.permissions.allowedModels
                            }
                            onModelsChange={keyPermissions.setAllowedModels}
                            visiblePermissions={visibleOptionalPermissions}
                            showApiName={false}
                            modelsInitiallyExpanded
                            modelCategories={modelCategories}
                        />
                    </Collapsible>
                </div>
            )}
        </AuthFlowLayout>
    );
}
