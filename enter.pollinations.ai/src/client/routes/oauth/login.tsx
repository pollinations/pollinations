import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../components/button.tsx";

export const Route = createFileRoute("/oauth/login")({
    component: OAuthLoginPage,
    validateSearch: (search: Record<string, unknown>) => ({
        client_id: search.client_id as string | undefined,
        redirect_uri: search.redirect_uri as string | undefined,
        response_type: search.response_type as string | undefined,
        scope: search.scope as string | undefined,
        state: search.state as string | undefined,
    }),
    beforeLoad: ({ context, search }) => {
        // If user is already signed in, redirect to authorize endpoint
        if (context.user && search.client_id) {
            const params = new URLSearchParams();
            if (search.client_id) params.set("client_id", search.client_id);
            if (search.redirect_uri)
                params.set("redirect_uri", search.redirect_uri);
            if (search.response_type)
                params.set("response_type", search.response_type);
            if (search.scope) params.set("scope", search.scope);
            if (search.state) params.set("state", search.state);
            window.location.href = `/api/auth/oauth2/authorize?${params.toString()}`;
            throw new Error("Redirecting to OAuth authorize");
        }
    },
});

function OAuthLoginPage() {
    const { auth } = Route.useRouteContext();
    const { client_id, redirect_uri, response_type, scope, state } =
        Route.useSearch();
    const [loading, setLoading] = useState(false);

    const scopes = scope?.split(" ") || [];

    // Build callback URL that preserves OAuth params
    const buildCallbackUrl = () => {
        const params = new URLSearchParams();
        if (client_id) params.set("client_id", client_id);
        if (redirect_uri) params.set("redirect_uri", redirect_uri);
        if (response_type) params.set("response_type", response_type);
        if (scope) params.set("scope", scope);
        if (state) params.set("state", state);
        return `/oauth/login?${params.toString()}`;
    };

    const handleSignIn = async (provider: "github" | "discord") => {
        setLoading(true);
        const { error } = await auth.signIn.social({
            provider,
            callbackURL: buildCallbackUrl(),
        });
        if (error) {
            setLoading(false);
            throw error;
        }
    };

    const handleCancel = () => {
        if (redirect_uri) {
            const url = new URL(redirect_uri);
            url.searchParams.set("error", "access_denied");
            url.searchParams.set(
                "error_description",
                "User cancelled the login",
            );
            if (state) url.searchParams.set("state", state);
            window.location.href = url.toString();
        } else {
            window.location.href = "/";
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    {/* Logo */}
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🐝</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            Sign in to Pollinations
                        </h1>
                        <p className="text-gray-500 mt-1">
                            to continue to{" "}
                            <span className="font-medium text-gray-700">
                                {client_id || "this app"}
                            </span>
                        </p>
                    </div>

                    {/* Permissions */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <h2 className="text-sm font-semibold text-gray-700 mb-2">
                            Pollinations will be able to:
                        </h2>
                        <ul className="space-y-1">
                            {scopes.map((s) => (
                                <li
                                    key={s}
                                    className="flex items-center gap-2 text-sm text-gray-600"
                                >
                                    <svg
                                        className="w-4 h-4 text-green-500 flex-shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <title>Check</title>
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                    <span>{getScopeDescription(s)}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-sm text-gray-600 border-t border-gray-200 pt-3">
                            The app will be able to generate media using your
                            Pollen balance.
                        </p>
                    </div>

                    {/* Login Buttons */}
                    <div className="space-y-3">
                        <Button
                            as="button"
                            onClick={() => handleSignIn("github")}
                            disabled={loading}
                            className="w-full bg-gray-900 text-white hover:bg-gray-800 flex items-center justify-center gap-2"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <title>GitHub</title>
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            {loading ? "Signing in..." : "Continue with GitHub"}
                        </Button>
                        <Button
                            as="button"
                            onClick={() => handleSignIn("discord")}
                            disabled={loading}
                            className="w-full bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center gap-2"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <title>Discord</title>
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                            </svg>
                            {loading
                                ? "Signing in..."
                                : "Continue with Discord"}
                        </Button>
                    </div>

                    {/* Cancel */}
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
                    >
                        Cancel
                    </button>

                    {/* Footer */}
                    <p className="text-xs text-gray-400 text-center mt-6">
                        By continuing, you agree to our{" "}
                        <a
                            href="/terms"
                            className="underline hover:text-gray-600"
                        >
                            Terms
                        </a>{" "}
                        and{" "}
                        <a
                            href="/legal/PRIVACY_POLICY.md"
                            className="underline hover:text-gray-600"
                        >
                            Privacy Policy
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}

function getScopeDescription(scope: string): string {
    const descriptions: Record<string, string> = {
        openid: "Verify your identity",
        profile: "Access your profile information",
        email: "Access your email address",
        "api:generate": "Generate images and text",
    };
    return descriptions[scope] || scope;
}
