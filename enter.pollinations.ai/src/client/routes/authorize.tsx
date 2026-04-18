import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "../../util.ts";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import {
    ACCOUNT_PERMISSIONS,
    AccountPermissionsInput,
} from "../components/api-keys/account-permissions-input.tsx";
import { ExpiryDaysInput } from "../components/api-keys/expiry-days-input.tsx";
import { useKeyPermissions } from "../components/api-keys/key-permissions.tsx";
import { computeCategoryModalities } from "../components/api-keys/model-categories.ts";
import { getPermissionPillClasses } from "../components/api-keys/permission-ui.ts";
import { PollenBudgetInput } from "../components/api-keys/pollen-budget-input.tsx";
import { SCOPE_LABELS } from "../components/auth/scope-labels.ts";
import { Button } from "../components/button.tsx";
import { InfoTip } from "../components/ui/info-tip.tsx";
import { config } from "../config.ts";
import { useScrollLock } from "../hooks/use-scroll-lock.ts";
import {
    AUTHORIZE_VISIBLE_ACCOUNT_PERMISSIONS,
    getAuthorizeInitialPermissions,
    sanitizeAuthorizeAccountPermissions,
    withBaselinePermissions,
} from "../lib/authorize-config.ts";
import { formatPollen } from "../lib/format-pollen.ts";

const SECONDS_PER_DAY = 24 * 60 * 60;

type Attribution = {
    found: boolean;
    userId?: string;
    userName?: string;
    githubUsername?: string;
    appName?: string;
    appUrl?: string;
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
        return new URL(url);
    } catch {
        return null;
    }
}

export const Route = createFileRoute("/authorize")({
    component: AuthorizeComponent,
    validateSearch: (search: Record<string, unknown>) => {
        const result: {
            redirect_url?: string;
            user_code?: string;
            device_scope?: string;
            app_key?: string;
            models?: string[] | null;
            budget?: number | null;
            expiry?: number | null;
            permissions?: string[] | null;
        } = {
            redirect_url: (search.redirect_url as string) || "",
        };

        if (search.user_code && typeof search.user_code === "string") {
            result.user_code = search.user_code;
        }

        if (search.device_scope && typeof search.device_scope === "string") {
            result.device_scope = search.device_scope;
        }

        if (search.app_key && typeof search.app_key === "string") {
            result.app_key = search.app_key;
        }

        const models = parseList(search.models);
        if (models !== null) result.models = models;

        const budget = parseNumber(search.budget);
        if (budget !== null) result.budget = budget;

        const expiry = parseNumber(search.expiry);
        if (expiry !== null) result.expiry = expiry;

        const permissions = parseList(search.permissions);
        if (permissions !== null) result.permissions = permissions;

        return result;
    },
});

function AuthorizeComponent() {
    const {
        redirect_url,
        user_code,
        device_scope,
        app_key,
        models,
        budget,
        expiry,
        permissions: urlPermissions,
    } = Route.useSearch();
    const navigate = useNavigate();

    const isDeviceMode = !!user_code;

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attribution, setAttribution] = useState<Attribution | null>(null);
    const [deviceOutcome, setDeviceOutcome] = useState<
        "pending" | "approved" | "denied"
    >("pending");
    const [totalBalance, setTotalBalance] = useState<number | null>(null);

    const [deviceScopes, setDeviceScopes] = useState<string[]>([]);

    const parsedRedirectUrl = redirect_url ? safeParseUrl(redirect_url) : null;
    const redirectHostname = parsedRedirectUrl?.hostname ?? "";

    const keyPermissions = useKeyPermissions(
        getAuthorizeInitialPermissions({
            models,
            budget,
            expiry,
            permissions: urlPermissions,
        }),
    );
    const { setAccountPermissions } = keyPermissions;

    const modalities = computeCategoryModalities(
        keyPermissions.permissions.allowedModels,
    );
    const hasBudget = keyPermissions.permissions.pollenBudget !== null;
    const canAuthorize =
        (isDeviceMode || parsedRedirectUrl !== null) && hasBudget;

    useScrollLock();

    // Sync device-requested optional permissions (e.g. "usage") into state.
    // Baseline profile+balance is always granted and not stored here.
    useEffect(() => {
        if (deviceScopes.length === 0) return;
        const sanitized = sanitizeAuthorizeAccountPermissions(deviceScopes);
        setAccountPermissions(sanitized);
    }, [deviceScopes, setAccountPermissions]);

    useEffect(() => {
        if (isDeviceMode) {
            if (device_scope) {
                setDeviceScopes(device_scope.split(" ").filter(Boolean));
            } else {
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
                            setDeviceScopes(
                                data.scope.split(" ").filter(Boolean),
                            );
                        }
                    })
                    .catch((e) => setError(e.message));
            }
            // Fetch app attribution if device flow has an app_key
            if (app_key) {
                fetch(`/api/app-lookup?app_key=${encodeURIComponent(app_key)}`)
                    .then((r) => r.json())
                    .then((data) => setAttribution(data as Attribution))
                    .catch(() => {});
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

            const params = new URLSearchParams();
            if (app_key) params.set("app_key", app_key);
            else params.set("redirect_url", redirect_url);

            fetch(`/api/app-lookup?${params}`)
                .then((r) => r.json())
                .then((data) => setAttribution(data as Attribution))
                .catch(() => {});
        }
    }, [isDeviceMode, user_code, device_scope, app_key, redirect_url]);

    useEffect(() => {
        if (!user) return;

        apiClient.customer.balance
            .$get()
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!data) return;
                setTotalBalance(
                    (data.tierBalance ?? 0) +
                        (data.packBalance ?? 0) +
                        (data.cryptoBalance ?? 0),
                );
            })
            .catch(() => {});
    }, [user]);

    async function handleSignIn(): Promise<void> {
        setIsSigningIn(true);
        const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: window.location.href,
        });
        if (error) {
            setIsSigningIn(false);
            setError("Sign in failed. Please try again.");
        }
    }

    async function createKeyAndSetPermissions(): Promise<{
        key: string;
        id: string;
        expiresIn: number | null;
    }> {
        let createdKeyId: string | null = null;
        const displayName = isDeviceMode
            ? `Device ${user_code}`
            : attribution?.appName || redirectHostname;

        const expiryDays = keyPermissions.permissions.expiryDays;
        try {
            const result = await authClient.apiKey.create({
                name: displayName,
                ...(expiryDays !== null && {
                    expiresIn: expiryDays * SECONDS_PER_DAY,
                }),
                prefix: "sk",
                metadata: {
                    keyType: "secret",
                    createdVia: isDeviceMode ? "device-flow" : "redirect-auth",
                    ...(isDeviceMode && { deviceUserCode: user_code }),
                    ...(attribution?.found && {
                        createdForUserId: attribution.userId,
                        createdForApp: attribution.appName,
                    }),
                },
            });

            if (result.error || !result.data?.key) {
                throw new Error(
                    result.error?.message || "Failed to create API key",
                );
            }

            const { key, id } = result.data;
            createdKeyId = id;

            const { allowedModels, pollenBudget, accountPermissions } =
                keyPermissions.permissions;
            const sanitizedOptional =
                sanitizeAuthorizeAccountPermissions(accountPermissions);
            const finalPermissions =
                withBaselinePermissions(sanitizedOptional);
            const updates = {
                ...(allowedModels !== null && { allowedModels }),
                ...(pollenBudget !== null && { pollenBudget }),
                accountPermissions: finalPermissions,
            };
            if (Object.keys(updates).length > 0) {
                const response = await fetch(`/api/api-keys/${id}/update`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(updates),
                });
                if (!response.ok) {
                    const errBody = await response.json().catch(() => null);
                    throw new Error(
                        `Key created but failed to set permissions: ${(errBody as { message?: string }).message || "Unknown error"}`,
                    );
                }
            }

            return {
                key,
                id,
                expiresIn:
                    expiryDays !== null ? expiryDays * SECONDS_PER_DAY : null,
            };
        } catch (error) {
            if (createdKeyId) {
                try {
                    await authClient.apiKey.delete({ keyId: createdKeyId });
                } catch {
                    // Best-effort rollback; preserve the original error.
                }
            }
            throw error;
        }
    }

    async function handleAuthorize(): Promise<void> {
        if (!canAuthorize || isAuthorizing) return;

        setIsAuthorizing(true);
        setError(null);

        try {
            const { key, id, expiresIn } = await createKeyAndSetPermissions();

            if (isDeviceMode) {
                try {
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
                } catch (error) {
                    try {
                        await authClient.apiKey.delete({ keyId: id });
                    } catch {
                        // Best-effort rollback; preserve the original error.
                    }
                    throw error;
                }
                setDeviceOutcome("approved");
            } else {
                if (!parsedRedirectUrl) {
                    throw new Error("Invalid redirect URL format");
                }
                const url = new URL(parsedRedirectUrl.href);
                url.hash = `api_key=${key}`;
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
        } else if (parsedRedirectUrl) {
            window.location.href = parsedRedirectUrl.toString();
        } else {
            navigate({ to: "/" });
        }
    }

    if (deviceOutcome !== "pending") {
        const denied = deviceOutcome === "denied";
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg p-8 text-center max-w-lg w-full">
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
            </div>
        );
    }

    if (isPending) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg p-8 text-center max-w-lg w-full">
                    <p className="text-gray-900">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="authorize-sign-in-title"
                    className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg flex flex-col max-w-lg w-full"
                >
                    <div className="shrink-0 p-6 pb-4 flex items-center justify-between">
                        <h2
                            id="authorize-sign-in-title"
                            className="text-lg font-semibold"
                        >
                            Sign in to Authorize
                        </h2>
                        <img
                            src="/logo.svg"
                            alt="pollinations.ai"
                            className="h-8 w-8 object-contain invert"
                        />
                    </div>

                    <div className="px-6 pb-6 space-y-4">
                        {error ? (
                            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                                <p className="text-red-800 text-sm">{error}</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-4">
                                    {isDeviceMode ? (
                                        attribution?.appName ? (
                                            <>
                                                <p className="font-bold text-gray-900 text-lg">
                                                    {attribution.appName}
                                                </p>
                                                {attribution.githubUsername && (
                                                    <p className="text-sm text-amber-900 mt-0.5">
                                                        by{" "}
                                                        <a
                                                            href={`https://github.com/${attribution.githubUsername}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium underline hover:text-gray-900"
                                                        >
                                                            @
                                                            {
                                                                attribution.githubUsername
                                                            }
                                                        </a>
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="font-semibold text-gray-900">
                                                A device is requesting access to
                                                your account
                                            </p>
                                        )
                                    ) : attribution?.appName ? (
                                        <>
                                            <p className="font-bold text-gray-900 text-lg">
                                                {attribution.appName}
                                            </p>
                                            {attribution.githubUsername && (
                                                <p className="text-sm text-amber-900 mt-0.5">
                                                    by{" "}
                                                    <a
                                                        href={`https://github.com/${attribution.githubUsername}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-medium underline hover:text-gray-900"
                                                    >
                                                        @
                                                        {
                                                            attribution.githubUsername
                                                        }
                                                    </a>
                                                </p>
                                            )}
                                            <p className="text-xs text-amber-900 font-mono mt-1">
                                                {redirectHostname}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="font-semibold text-gray-900">
                                            {redirectHostname}
                                        </p>
                                    )}
                                </div>

                                <p className="text-amber-900 text-sm">
                                    Sign in to let{" "}
                                    <span className="font-semibold">
                                        {attribution?.appName ||
                                            redirectHostname ||
                                            "this app"}
                                    </span>{" "}
                                    access your{" "}
                                    <span className="font-semibold">
                                        Pollinations
                                    </span>{" "}
                                    account.
                                </p>
                            </>
                        )}

                        <div className="flex gap-2 justify-end">
                            <Button
                                as="button"
                                onClick={handleDeny}
                                weight="outline"
                                color="dark"
                                disabled={isSigningIn}
                            >
                                {isDeviceMode ? "Deny" : "Cancel"}
                            </Button>
                            <Button
                                as="button"
                                onClick={handleSignIn}
                                disabled={isSigningIn || !!error}
                                color="dark"
                            >
                                {isSigningIn
                                    ? "Signing in..."
                                    : "Continue with GitHub"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex items-start justify-center p-4 overflow-y-auto bg-green-950/50">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="authorize-dialog-title"
                className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg max-w-lg w-full my-auto"
            >
                <div className="px-6 pt-6 pb-2">
                    <div className="flex items-center justify-between gap-3">
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
                        <div className="shrink-0">
                            <div className="inline-flex items-stretch rounded-full bg-amber-100 border border-amber-300 text-sm overflow-hidden">
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
                    </div>
                </div>

                <div className="px-6 py-2 space-y-4">
                    {error ? (
                        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="-mx-6 px-6 py-4 bg-amber-100">
                                    <p
                                        id="authorize-dialog-title"
                                        className="font-body text-xs font-semibold text-amber-800 tracking-wide mb-2"
                                    >
                                        Authorize
                                    </p>
                                    {isDeviceMode ? (
                                        <>
                                            {attribution?.appName ? (
                                                <>
                                                    <p className="text-xs text-amber-800 mb-1">
                                                        A device is requesting
                                                        access via
                                                    </p>
                                                    <p className="font-bold text-gray-900 text-lg">
                                                        {attribution.appName}
                                                    </p>
                                                    {attribution.githubUsername && (
                                                        <p className="text-sm text-amber-900 mt-0.5">
                                                            by{" "}
                                                            <a
                                                                href={`https://github.com/${attribution.githubUsername}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="font-medium underline hover:text-gray-900"
                                                            >
                                                                @
                                                                {
                                                                    attribution.githubUsername
                                                                }
                                                            </a>
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-sm text-gray-900 font-medium">
                                                    A device is requesting
                                                    access to your account
                                                </p>
                                            )}
                                            <p className="text-xs text-amber-900 mt-1 font-mono">
                                                Code: {user_code}
                                            </p>
                                        </>
                                    ) : attribution?.appName ? (
                                        <>
                                            <div className="flex items-center gap-1.5">
                                                <p className="font-bold text-gray-900 text-lg">
                                                    {attribution.appName}
                                                </p>
                                                {!isDeviceMode && (
                                                    <InfoTip
                                                        text="Same as copy-pasting an API key into their app. Only share with apps you trust."
                                                        label="API key sharing warning"
                                                        tone="amber"
                                                        icon="!"
                                                    />
                                                )}
                                            </div>
                                            {attribution.githubUsername && (
                                                <p className="text-sm text-amber-900 mt-0.5">
                                                    by{" "}
                                                    <a
                                                        href={`https://github.com/${attribution.githubUsername}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-medium underline hover:text-gray-900"
                                                    >
                                                        @
                                                        {
                                                            attribution.githubUsername
                                                        }
                                                    </a>
                                                </p>
                                            )}
                                            <p className="text-xs text-amber-900 font-mono mt-1">
                                                {redirectHostname}
                                            </p>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-gray-900 text-lg font-mono">
                                                {redirectHostname}
                                            </p>
                                            {!isDeviceMode && (
                                                <InfoTip
                                                    text="Same as copy-pasting an API key into their app. Only share with apps you trust."
                                                    label="API key sharing warning"
                                                    tone="amber"
                                                    icon="!"
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {deviceScopes.length > 0 && (
                                    <div className="p-4 border-b border-amber-300">
                                        <p className="text-sm font-medium text-gray-900 mb-2">
                                            This will allow the device to:
                                        </p>
                                        <ul className="text-sm text-amber-900 space-y-2">
                                            {deviceScopes.map((s) => (
                                                <li
                                                    key={s}
                                                    className="flex items-start gap-2"
                                                >
                                                    <span className="text-amber-700">
                                                        &#x2713;
                                                    </span>
                                                    <span>
                                                        {SCOPE_LABELS[s] || s}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {!isDeviceMode && (
                                    <div className="p-4">
                                        <p className="font-body text-xs font-semibold text-amber-800 tracking-wide mb-3">
                                            To
                                        </p>
                                        <ul className="text-sm text-amber-900 space-y-3">
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
                                                    <span>
                                                        No AI models are
                                                        enabled.
                                                    </span>
                                                ) : (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span>Generate</span>
                                                        <div className="flex items-center gap-1 flex-nowrap">
                                                            {modalities.map(
                                                                (m) => (
                                                                    <span
                                                                        key={m}
                                                                        className={`px-2 py-0.5 rounded-full text-xs border shrink-0 ${getPermissionPillClasses(m)}`}
                                                                    >
                                                                        {m}
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="w-4 shrink-0 text-amber-800">
                                                    &#x231B;
                                                </span>
                                                <span>
                                                    {keyPermissions.permissions
                                                        .expiryDays === null
                                                        ? "Never expires"
                                                        : `Expires in ${keyPermissions.permissions.expiryDays} day${keyPermissions.permissions.expiryDays === 1 ? "" : "s"}`}
                                                    {" — revoke anytime at "}
                                                    <a
                                                        href="https://enter.pollinations.ai"
                                                        className="text-gray-900 font-medium underline"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        enter.pollinations.ai
                                                    </a>
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="w-4 shrink-0 text-amber-800">
                                                    &#x1F464;
                                                </span>
                                                <span>
                                                    See{" "}
                                                    {
                                                        ACCOUNT_PERMISSIONS.find(
                                                            (p) =>
                                                                p.id ===
                                                                "profile",
                                                        )?.tooltip
                                                    }
                                                    .
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="w-4 shrink-0 text-amber-800">
                                                    &#x1F4B0;
                                                </span>
                                                <span>
                                                    See{" "}
                                                    {
                                                        ACCOUNT_PERMISSIONS.find(
                                                            (p) =>
                                                                p.id ===
                                                                "balance",
                                                        )?.tooltip
                                                    }
                                                    .
                                                </span>
                                            </li>
                                        </ul>
                                    </div>
                                )}

                                <div className="-mx-6 px-10 py-4 border-t border-amber-300">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-0 shrink-0">
                                            Spending limit
                                            <InfoTip
                                                text="This app can only spend this amount from your pollen balance."
                                                label="Spending limit information"
                                                tone="amber"
                                            />
                                        </p>
                                        <PollenBudgetInput
                                            value={
                                                keyPermissions.permissions
                                                    .pollenBudget
                                            }
                                            onChange={
                                                keyPermissions.setPollenBudget
                                            }
                                            hideLabel
                                            theme="amber"
                                        />
                                    </div>
                                </div>

                                <div className="px-4 pb-4">
                                    <ExpiryDaysInput
                                        value={
                                            keyPermissions.permissions
                                                .expiryDays
                                        }
                                        onChange={keyPermissions.setExpiryDays}
                                        inline
                                        theme="amber"
                                    />
                                </div>

                                <details className="group -mx-6 border-t border-amber-300">
                                    <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-amber-800 flex items-center justify-end gap-1 select-none transition-all hover:bg-amber-100 hover:text-amber-950">
                                        <span>Advanced</span>
                                        <span className="text-amber-700 transition-transform group-open:rotate-180">
                                            &#x25BE;
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
                                                keyPermissions.permissions
                                                    .allowedModels
                                            }
                                            onModelsChange={
                                                keyPermissions.setAllowedModels
                                            }
                                            visiblePermissions={
                                                AUTHORIZE_VISIBLE_ACCOUNT_PERMISSIONS
                                            }
                                            theme="amber"
                                            showApiName={false}
                                        />
                                    </div>
                                </details>
                            </div>
                        </>
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
                            {isDeviceMode ? "Deny" : "Cancel"}
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
            </div>
        </div>
    );
}
