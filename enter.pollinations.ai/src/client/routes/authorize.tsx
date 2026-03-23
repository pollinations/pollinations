import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import {
    KeyPermissionsInputs,
    useKeyPermissions,
} from "../components/api-keys";
import { SCOPE_LABELS } from "../components/auth/scope-labels.ts";
import { Button } from "../components/button.tsx";
import { config } from "../config.ts";
import { useScrollLock } from "../hooks/use-scroll-lock.ts";

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

    const [deviceScopes, setDeviceScopes] = useState<string[]>([]);

    const parsedRedirectUrl = redirect_url ? safeParseUrl(redirect_url) : null;
    const redirectHostname = parsedRedirectUrl?.hostname ?? "";
    const canAuthorize = isDeviceMode || parsedRedirectUrl !== null;

    const keyPermissions = useKeyPermissions({
        allowedModels: models,
        pollenBudget: budget,
        expiryDays: expiry ?? 30,
        accountPermissions: urlPermissions ?? ["profile"],
    });

    useScrollLock();

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
        const displayName = isDeviceMode
            ? `Device ${user_code}`
            : attribution?.appName || redirectHostname;

        const expiryDays = keyPermissions.permissions.expiryDays;
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
                ...(!isDeviceMode &&
                    attribution?.found && {
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

        const { allowedModels, pollenBudget, accountPermissions } =
            keyPermissions.permissions;
        const updates = {
            ...(allowedModels !== null && { allowedModels }),
            ...(pollenBudget !== null && { pollenBudget }),
            ...(accountPermissions?.length && { accountPermissions }),
        };
        if (Object.keys(updates).length > 0) {
            const response = await fetch(`/api/api-keys/${id}/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(updates),
            });
            if (!response.ok) {
                const errBody = await response.json();
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
    }

    async function handleAuthorize(): Promise<void> {
        if (!canAuthorize || isAuthorizing) return;

        setIsAuthorizing(true);
        setError(null);

        try {
            const { key, id, expiresIn } = await createKeyAndSetPermissions();

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
                const url = new URL(redirect_url!);
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
            window.location.href = redirect_url!;
        } else {
            navigate({ to: "/" });
        }
    }

    if (deviceOutcome !== "pending") {
        const denied = deviceOutcome === "denied";
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg p-8 text-center max-w-lg w-full">
                    <div className="text-4xl mb-4">
                        {denied ? "\u{1F6AB}" : "\u{2705}"}
                    </div>
                    <h2 className="text-lg font-semibold text-green-950 mb-2">
                        {denied ? "Access Denied" : "Device Authorized"}
                    </h2>
                    <p className="text-sm text-green-800">
                        You can close this tab and return to your device.
                    </p>
                </div>
            </div>
        );
    }

    if (isPending) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg p-8 text-center max-w-lg w-full">
                    <p className="text-green-950">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg flex flex-col max-w-lg w-full">
                    <div className="shrink-0 p-6 pb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            Connect to pollinations.ai
                        </h2>
                        <img
                            src="/logo_text_black.svg"
                            alt="pollinations.ai"
                            className="h-8 object-contain"
                        />
                    </div>

                    <div className="px-6 pb-6 space-y-4">
                        {error ? (
                            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                                <p className="text-red-800 text-sm">{error}</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-green-200 rounded-lg p-4">
                                    {isDeviceMode ? (
                                        attribution?.appName ? (
                                            <>
                                                <p className="font-bold text-green-950 text-lg">
                                                    {attribution.appName}
                                                </p>
                                                {attribution.githubUsername && (
                                                    <p className="text-sm text-green-700 mt-0.5">
                                                        by{" "}
                                                        <a
                                                            href={`https://github.com/${attribution.githubUsername}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium underline hover:text-green-950"
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
                                            <p className="font-semibold text-green-950">
                                                A device is requesting access to
                                                your account
                                            </p>
                                        )
                                    ) : attribution?.appName ? (
                                        <>
                                            <p className="font-bold text-green-950 text-lg">
                                                {attribution.appName}
                                            </p>
                                            {attribution.githubUsername && (
                                                <p className="text-sm text-green-700 mt-0.5">
                                                    by{" "}
                                                    <a
                                                        href={`https://github.com/${attribution.githubUsername}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-medium underline hover:text-green-950"
                                                    >
                                                        @
                                                        {
                                                            attribution.githubUsername
                                                        }
                                                    </a>
                                                </p>
                                            )}
                                            <p className="text-xs text-green-800 font-mono mt-1">
                                                {redirectHostname}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="font-semibold text-green-950">
                                            {redirectHostname}
                                        </p>
                                    )}
                                    <p className="text-xs text-green-800 mt-1">
                                        wants to connect to your account
                                    </p>
                                </div>

                                <p className="text-green-800 text-sm">
                                    Sign in to continue
                                </p>
                            </>
                        )}

                        <Button
                            as="button"
                            onClick={handleSignIn}
                            disabled={isSigningIn || !!error}
                            color="dark"
                            className="w-full"
                        >
                            {isSigningIn
                                ? "Signing in..."
                                : "Sign in with GitHub"}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
            <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg max-h-[85vh] max-w-lg w-full flex flex-col">
                <div className="shrink-0 p-6 pb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            {isDeviceMode
                                ? "Authorize Device"
                                : "Authorize Application"}
                        </h2>
                        <img
                            src="/logo_text_black.svg"
                            alt="pollinations.ai"
                            className="h-8 object-contain"
                        />
                    </div>
                    <p className="text-sm text-green-800 mt-1">
                        Signed in as{" "}
                        <strong>{user.githubUsername || user.email}</strong>
                    </p>
                </div>

                <div
                    className="flex-1 overflow-y-auto px-6 py-2 space-y-4 scrollbar-subtle"
                    style={{
                        scrollbarWidth: "thin",
                        overscrollBehavior: "contain",
                    }}
                >
                    {error ? (
                        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-green-200 rounded-lg p-4">
                                {isDeviceMode ? (
                                    <>
                                        {attribution?.appName ? (
                                            <>
                                                <p className="text-xs text-green-700 mb-1">
                                                    A device is requesting
                                                    access via
                                                </p>
                                                <p className="font-bold text-green-950 text-lg">
                                                    {attribution.appName}
                                                </p>
                                                {attribution.githubUsername && (
                                                    <p className="text-sm text-green-700 mt-0.5">
                                                        by{" "}
                                                        <a
                                                            href={`https://github.com/${attribution.githubUsername}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium underline hover:text-green-950"
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
                                            <p className="text-sm text-green-950 font-medium">
                                                A device is requesting access to
                                                your account
                                            </p>
                                        )}
                                        <p className="text-xs text-green-800 mt-1 font-mono">
                                            Code: {user_code}
                                        </p>
                                    </>
                                ) : attribution?.appName ? (
                                    <>
                                        <p className="text-xs text-green-700 mb-1">
                                            Share your API key with
                                        </p>
                                        <p className="font-bold text-green-950 text-lg">
                                            {attribution.appName}
                                        </p>
                                        {attribution.githubUsername && (
                                            <p className="text-sm text-green-700 mt-0.5">
                                                by{" "}
                                                <a
                                                    href={`https://github.com/${attribution.githubUsername}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium underline hover:text-green-950"
                                                >
                                                    @
                                                    {attribution.githubUsername}
                                                </a>
                                            </p>
                                        )}
                                        <p className="text-xs text-green-800 font-mono mt-1">
                                            {redirectHostname}
                                        </p>
                                    </>
                                ) : (
                                    <p className="font-semibold text-green-950 mb-1">
                                        Create and share my API key with{" "}
                                        <span className="font-mono bg-green-300 rounded px-1.5 py-0.5 text-green-950">
                                            {redirectHostname}
                                        </span>
                                    </p>
                                )}
                                {!isDeviceMode && (
                                    <p className="text-xs text-green-800 mt-2">
                                        Same as copy-pasting your key into their
                                        app. Only share with apps you trust.
                                    </p>
                                )}
                            </div>

                            {deviceScopes.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-green-950 mb-2">
                                        This will allow the device to:
                                    </p>
                                    <ul className="text-sm text-green-900 space-y-2">
                                        {deviceScopes.map((s) => (
                                            <li
                                                key={s}
                                                className="flex items-start gap-2"
                                            >
                                                <span className="text-green-600">
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
                                <ul className="text-sm text-green-900 space-y-2">
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-600">
                                            &#x2713;
                                        </span>
                                        <span>
                                            Generate text, images, audio & video
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-600">
                                            &#x2713;
                                        </span>
                                        <span>Use your pollen balance</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-800">
                                            &#x23F1;
                                        </span>
                                        <span>
                                            Revoke anytime from{" "}
                                            <a
                                                href="https://enter.pollinations.ai"
                                                className="text-green-950 font-medium underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                enter.pollinations.ai
                                            </a>
                                        </span>
                                    </li>
                                </ul>
                            )}

                            <KeyPermissionsInputs
                                value={keyPermissions}
                                inline
                            />

                            {!isDeviceMode && (
                                <div className="bg-green-200 rounded-lg p-3">
                                    <p className="text-green-900 text-xs mb-1 font-medium">
                                        You will be redirected to:
                                    </p>
                                    <p className="text-green-950 text-sm font-mono break-all">
                                        {redirect_url}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between p-6 pt-4 shrink-0">
                    <a
                        href="/terms"
                        className="text-xs text-green-700 hover:text-green-950 hover:underline"
                    >
                        Terms & Conditions
                    </a>
                    <div className="flex gap-2">
                        <Button
                            as="button"
                            onClick={handleDeny}
                            weight="outline"
                            disabled={isAuthorizing}
                        >
                            {isDeviceMode ? "Deny" : "Cancel"}
                        </Button>
                        <Button
                            as="button"
                            onClick={handleAuthorize}
                            disabled={!canAuthorize || isAuthorizing || !!error}
                            color="green"
                        >
                            {isAuthorizing ? "Authorizing..." : "Allow"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
