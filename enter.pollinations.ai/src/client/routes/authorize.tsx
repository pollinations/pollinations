import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "../components/button.tsx";
import { ModelPermissions } from "../components/model-permissions.tsx";
import { authClient } from "../auth.ts";

// 6 hours in seconds
const DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60;

export const Route = createFileRoute("/authorize")({
    component: AuthorizeComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        redirect_url: (search.redirect_url as string) || "",
    }),
    // No beforeLoad redirect - handle auth state in component for better UX
});

function AuthorizeComponent() {
    const { redirect_url } = Route.useSearch();
    const navigate = useNavigate();

    // Fetch session directly using authClient
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectHostname, setRedirectHostname] = useState<string>("");
    const [isValidUrl, setIsValidUrl] = useState(false);
    // null = all models allowed, [] = restricted but none selected, [...] = specific models
    const [allowedModels, setAllowedModels] = useState<string[] | null>(null);

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
            // Create a temporary API key with 6h expiry using better-auth's built-in endpoint
            const result = await authClient.apiKey.create({
                name: `Temporary key for ${redirectHostname}`,
                expiresIn: DEFAULT_EXPIRY_SECONDS,
                prefix: "sk",
                metadata: {
                    keyType: "temporary",
                    createdVia: "redirect-auth",
                },
            });

            if (result.error || !result.data?.key) {
                throw new Error(
                    result.error?.message || "Failed to create temporary key",
                );
            }

            const data = result.data;

            // Set permissions if restricted (allowedModels is not null)
            if (allowedModels !== null) {
                const updateResponse = await fetch(
                    `/api/api-keys/${data.id}/update`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ allowedModels }),
                    },
                );

                if (!updateResponse.ok) {
                    console.error("Failed to set API key permissions");
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

    const expiryTime = new Date(Date.now() + DEFAULT_EXPIRY_SECONDS * 1000);
    const expiryString = expiryTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

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

    return (
        <div className="flex flex-col gap-6 max-w-lg mx-auto pt-8">
            {/* Simple logo header */}
            <div className="text-center">
                <img
                    src="/logo_text_black.svg"
                    alt="pollinations.ai"
                    className="h-10 mx-auto invert"
                />
            </div>

            <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 shadow-lg">
                <h1 className="text-2xl font-bold mb-6 text-center">
                    Authorize Application
                </h1>

                {error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <p className="text-red-800 text-sm">❌ {error}</p>
                    </div>
                ) : (
                    <>
                        {/* App info */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-6">
                            <p className="font-semibold text-gray-900">
                                {redirectHostname}
                            </p>
                            <p className="text-xs text-gray-500">
                                wants access to your Pollinations account
                            </p>
                        </div>

                        {/* What this allows */}
                        <div className="mb-6">
                            <h3 className="font-semibold text-sm text-gray-700 mb-2">
                                This will allow the application to:
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li className="flex items-start gap-2">
                                    <span className="text-green-500 mt-0.5">
                                        ✓
                                    </span>
                                    <span>
                                        Generate images and text using your
                                        account
                                    </span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-500 mt-0.5">
                                        ✓
                                    </span>
                                    <span>
                                        Use your pollen balance for API requests
                                    </span>
                                </li>
                            </ul>
                        </div>

                        {/* Expiry notice */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                            <p className="text-amber-800 text-sm">
                                ⏱️ <strong>Temporary access:</strong> This key
                                expires in 6 hours (at {expiryString})
                            </p>
                        </div>

                        {/* Model permissions - only show when signed in */}
                        {user && (
                            <div className="mb-6">
                                <h3 className="font-semibold text-sm text-gray-700 mb-2">
                                    Model Access
                                </h3>
                                <ModelPermissions
                                    value={allowedModels}
                                    onChange={setAllowedModels}
                                    compact
                                />
                            </div>
                        )}

                        {/* Redirect URL display */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                            <p className="text-blue-800 text-xs mb-1 font-medium">
                                You will be redirected to:
                            </p>
                            <p className="text-blue-900 text-sm font-mono break-all">
                                {redirect_url}
                            </p>
                        </div>
                    </>
                )}

                {/* Conditional: Sign in or Authorize */}
                {!user ? (
                    <>
                        <div className="text-center text-sm text-gray-500 mb-4">
                            Sign in to authorize this application
                        </div>
                        <Button
                            as="button"
                            onClick={handleSignIn}
                            disabled={isSigningIn || !!error}
                            className="w-full bg-gray-900 text-white hover:!brightness-90"
                        >
                            {isSigningIn
                                ? "Signing in..."
                                : "Sign in with GitHub"}
                        </Button>
                    </>
                ) : (
                    <>
                        <div className="text-center text-sm text-gray-500 mb-6">
                            Signed in as{" "}
                            <strong>
                                {user?.githubUsername || user?.email}
                            </strong>
                        </div>
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
                                disabled={
                                    !isValidUrl || isAuthorizing || !!error
                                }
                                color="green"
                                className="flex-1"
                            >
                                {isAuthorizing ? "Authorizing..." : "Authorize"}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
