import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "../components/button.tsx";

// 6 hours in seconds
const DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60;

type TemporaryKeyResponse = {
    key: string;
    keyId: string;
    name: string;
    expiresAt: string;
    expiresIn: number;
};

type ErrorResponse = {
    message?: string;
};

export const Route = createFileRoute("/authorize")({
    component: AuthorizeComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        redirect_url: (search.redirect_url as string) || "",
    }),
    beforeLoad: async ({ context, search }) => {
        // Must be logged in
        const result = await context.auth.getSession();
        if (result.error) throw new Error("Authentication failed.");
        if (!result.data?.user) {
            // Store redirect URL and send to sign-in
            if (search.redirect_url) {
                localStorage.setItem("pending_redirect_url", search.redirect_url);
            }
            throw redirect({ to: "/sign-in" });
        }
        return { user: result.data.user };
    },
});

function AuthorizeComponent() {
    const { user } = Route.useRouteContext();
    const { redirect_url } = Route.useSearch();
    const navigate = useNavigate();
    
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectHostname, setRedirectHostname] = useState<string>("");
    const [isValidUrl, setIsValidUrl] = useState(false);

    // Parse and validate the redirect URL
    useEffect(() => {
        if (!redirect_url) {
            setError("No redirect URL provided");
            return;
        }
        
        try {
            const url = new URL(redirect_url);
            // Only allow http/https
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                setError("Invalid redirect URL protocol");
                return;
            }
            setRedirectHostname(url.hostname);
            setIsValidUrl(true);
        } catch {
            setError("Invalid redirect URL format");
        }
    }, [redirect_url]);

    const handleAuthorize = async () => {
        if (!isValidUrl || isAuthorizing) return;
        
        setIsAuthorizing(true);
        setError(null);

        try {
            // Create a temporary API key with 6h expiry
            const response = await fetch("/api/auth/temporary-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: `Temporary key for ${redirectHostname}`,
                    expiresIn: DEFAULT_EXPIRY_SECONDS,
                }),
            });

            if (!response.ok) {
                const data: ErrorResponse = await response.json();
                throw new Error(data.message || "Failed to create temporary key");
            }

            const data: TemporaryKeyResponse = await response.json();

            // Redirect back to the app with the key
            const url = new URL(redirect_url);
            url.searchParams.set("api_key", data.key);
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
        minute: "2-digit" 
    });

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
                            <div className="flex items-center gap-3 mb-3">
                                <img 
                                    src={`https://www.google.com/s2/favicons?domain=${redirectHostname}&sz=32`}
                                    alt=""
                                    className="w-8 h-8 rounded"
                                />
                                <div>
                                    <p className="font-semibold text-gray-900">
                                        {redirectHostname}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        wants access to your Pollinations account
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* What this allows */}
                        <div className="mb-6">
                            <h3 className="font-semibold text-sm text-gray-700 mb-2">
                                This will allow the application to:
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li className="flex items-start gap-2">
                                    <span className="text-green-500 mt-0.5">✓</span>
                                    <span>Generate images and text using your account</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-500 mt-0.5">✓</span>
                                    <span>Use your pollen balance for API requests</span>
                                </li>
                            </ul>
                        </div>

                        {/* Expiry notice */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                            <p className="text-amber-800 text-sm">
                                ⏱️ <strong>Temporary access:</strong> This key expires in 6 hours (at {expiryString})
                            </p>
                        </div>

                        {/* Redirect URL display */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                            <p className="text-blue-800 text-xs mb-1 font-medium">
                                You will be redirected to:
                            </p>
                            <p className="text-blue-900 text-sm font-mono break-all">
                                {redirect_url}
                            </p>
                        </div>

                        {/* User info */}
                        <div className="text-center text-sm text-gray-500 mb-6">
                            Signed in as <strong>{user?.githubUsername || user?.email}</strong>
                        </div>
                    </>
                )}

                {/* Actions */}
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
