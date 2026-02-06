import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import {
    KeyPermissionsInputs,
    useKeyPermissions,
} from "../components/api-keys";
import { Button } from "../components/button.tsx";

const SECONDS_PER_DAY = 24 * 60 * 60;

// Parse comma-separated string to array, or null if empty
const parseList = (val: unknown): string[] | null => {
    if (!val || typeof val !== "string") return null;
    const items = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return items.length ? items : null;
};

const parseNumber = (val: unknown): number | null => {
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
};

export const Route = createFileRoute("/authorize")({
    component: AuthorizeComponent,
    validateSearch: (search: Record<string, unknown>) => {
        const result: {
            redirect_url: string;
            models?: string[] | null;
            budget?: number | null;
            expiry?: number | null;
            permissions?: string[] | null;
        } = {
            redirect_url: (search.redirect_url as string) || "",
        };

        // Only include optional params if they're present
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
    // No beforeLoad redirect - handle auth state in component for better UX
});

function AuthorizeComponent() {
    const {
        redirect_url,
        models,
        budget,
        expiry,
        permissions: urlPermissions,
    } = Route.useSearch();
    const navigate = useNavigate();

    // Fetch session directly using authClient
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectHostname, setRedirectHostname] = useState<string>("");
    const [isValidUrl, setIsValidUrl] = useState(false);

    // Use shared hook for key permissions, pre-populated from URL params
    // Default to profile permission enabled unless URL explicitly overrides
    const keyPermissions = useKeyPermissions({
        allowedModels: models,
        pollenBudget: budget,
        expiryDays: expiry ?? 30, // Default 30 days for authorize flow
        accountPermissions: urlPermissions ?? ["profile"], // Default profile enabled
    });

    // Parse and validate the redirect URL
    useEffect(() => {
        if (!redirect_url) {
            setError("No redirect URL provided");
            return;
        }

        try {
            const url = new URL(redirect_url);
            setRedirectHostname(url.hostname);
            setIsValidUrl(true);
        } catch {
            setError("Invalid redirect URL format");
        }
    }, [redirect_url]);

    const handleSignIn = async () => {
        setIsSigningIn(true);
        // Pass current URL as callback so we return here after GitHub OAuth
        const callbackURL = window.location.href;
        const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL,
        });
        if (error) {
            setIsSigningIn(false);
            setError("Sign in failed. Please try again.");
        }
        // On success, GitHub OAuth will redirect back to this page with user signed in
    };

    const handleAuthorize = async () => {
        if (!isValidUrl || isAuthorizing) return;

        setIsAuthorizing(true);
        setError(null);

        try {
            // Create a temporary API key using better-auth's built-in endpoint
            const result = await authClient.apiKey.create({
                name: redirectHostname,
                ...(keyPermissions.permissions.expiryDays !== null && {
                    expiresIn:
                        keyPermissions.permissions.expiryDays * SECONDS_PER_DAY,
                }),
                prefix: "sk",
                metadata: {
                    keyType: "secret",
                    createdVia: "redirect-auth",
                },
            });

            if (result.error || !result.data?.key) {
                throw new Error(
                    result.error?.message || "Failed to create temporary key",
                );
            }

            const data = result.data;

            // Set permissions via API
            const { allowedModels, pollenBudget, accountPermissions } =
                keyPermissions.permissions;
            const updates = {
                ...(allowedModels !== null && { allowedModels }),
                ...(pollenBudget !== null && { pollenBudget }),
                ...(accountPermissions?.length && { accountPermissions }),
            };
            if (Object.keys(updates).length > 0) {
                const response = await fetch(
                    `/api/api-keys/${data.id}/update`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(updates),
                    },
                );
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(
                        `Key created but failed to set permissions: ${(error as { message?: string }).message || "Unknown error"}`,
                    );
                }
            }

            // Redirect back to the app with the key in URL fragment (not query param)
            // Using fragment prevents key from leaking to server logs/Referer headers
            const url = new URL(redirect_url);
            url.hash = `api_key=${data.key}`;
            window.location.href = url.toString();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Authorization failed");
            setIsAuthorizing(false);
        }
    };

    const handleCancel = () => {
        // Go back to dashboard
        navigate({ to: "/" });
    };

    // Show loading while checking session
    if (isPending) {
        return (
            <div className="flex flex-col gap-6 max-w-lg mx-auto pt-8">
                <div className="text-center">
                    <img
                        src="/logo_text_black.svg"
                        alt="pollinations.ai"
                        className="h-10 mx-auto invert"
                    />
                </div>
                <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 shadow-lg text-center">
                    <p className="text-gray-500">Loading...</p>
                </div>
            </div>
        );
    }

    // Not signed in - show simple sign-in screen
    if (!user) {
        return (
            <div className="flex flex-col gap-6 max-w-lg mx-auto pt-8">
                <div className="text-center">
                    <img
                        src="/logo_text_black.svg"
                        alt="pollinations.ai"
                        className="h-10 mx-auto invert"
                    />
                </div>

                <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 shadow-lg text-center">
                    <h2 className="font-bold mb-4 text-center">
                        Connect to pollinations.ai
                    </h2>

                    {error ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                            <p className="text-red-800 text-sm">❌ {error}</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-gray-50 rounded-xl p-4 mb-6">
                                <p className="font-semibold text-gray-900">
                                    {redirectHostname}
                                </p>
                                <p className="text-xs text-gray-500">
                                    wants to connect to your account
                                </p>
                            </div>

                            <p className="text-gray-500 text-sm mb-6">
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
                        {isSigningIn ? "Signing in..." : "Sign in with GitHub"}
                    </Button>
                </div>
            </div>
        );
    }

    // Signed in - show authorization details
    return (
        <div className="flex flex-col gap-6 max-w-lg mx-auto pt-8">
            <div className="text-center">
                <img
                    src="/logo_text_black.svg"
                    alt="pollinations.ai"
                    className="h-10 mx-auto invert"
                />
            </div>

            <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 shadow-lg">
                <h2 className="font-bold mb-4 text-center">
                    Authorize Application
                </h2>

                {error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <p className="text-red-800 text-sm">❌ {error}</p>
                    </div>
                ) : (
                    <>
                        {/* Security info - short & sweet */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                            <p className="font-semibold text-blue-900 mb-1">
                                🔑 Sharing my API key with{" "}
                                <span className="font-mono bg-blue-100 rounded px-1.5 py-0.5 text-blue-800">
                                    {redirectHostname}
                                </span>
                            </p>
                            <p className="text-xs text-blue-600 mt-2">
                                Same as copy-pasting your key into their app 💙
                                Only you can use it
                            </p>
                        </div>

                        {/* What this key allows */}
                        <ul className="mb-6 text-sm text-gray-600 space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500">✓</span>
                                <span>
                                    Generate text, images, audio & video
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Use your pollen balance</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-gray-400">⏱</span>
                                <span>
                                    Revoke anytime from{" "}
                                    <a
                                        href="/"
                                        className="text-blue-600 hover:underline"
                                    >
                                        dashboard
                                    </a>
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-gray-400">🔧</span>
                                <span>Model access:</span>
                            </li>
                        </ul>

                        {/* Key permissions inputs */}
                        <div className="mb-6 -mt-2">
                            <KeyPermissionsInputs
                                value={keyPermissions}
                                compact
                            />
                        </div>

                        {/* Redirect URL display */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6">
                            <p className="text-blue-800 text-xs mb-1 font-medium">
                                You will be redirected to:
                            </p>
                            <p className="text-blue-900 text-sm font-mono break-all">
                                {redirect_url}
                            </p>
                        </div>
                    </>
                )}

                <div className="text-center text-sm text-gray-500 mb-4">
                    Signed in as{" "}
                    <strong>{user?.githubUsername || user?.email}</strong>
                </div>
                <p className="text-center text-xs text-gray-400 mb-4">
                    By authorizing, you agree to the{" "}
                    <a
                        href="/terms"
                        className="text-gray-500 hover:text-gray-700 hover:underline"
                    >
                        Terms & Conditions
                    </a>
                </p>
                <div className="flex gap-3">
                    <Button
                        as="button"
                        onClick={handleCancel}
                        weight="outline"
                        className="flex-1"
                    >
                        Cancel
                    </Button>
                    <Button
                        as="button"
                        onClick={handleAuthorize}
                        disabled={!isValidUrl || isAuthorizing || !!error}
                        color="green"
                        className="flex-1"
                    >
                        {isAuthorizing ? "Authorizing..." : "Authorize"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
