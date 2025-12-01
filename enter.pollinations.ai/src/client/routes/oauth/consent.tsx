import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { Header } from "../../components/header.tsx";

export const Route = createFileRoute("/oauth/consent")({
    component: ConsentPage,
    validateSearch: (search: Record<string, unknown>) => ({
        consent_code: search.consent_code as string | undefined,
        client_id: search.client_id as string | undefined,
        scope: search.scope as string | undefined,
    }),
    beforeLoad: ({ context, search }) => {
        // Must be signed in to consent
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: {
                    redirect: `/oauth/consent?consent_code=${search.consent_code}&client_id=${search.client_id}&scope=${search.scope}`,
                },
            });
        }
    },
});

function ConsentPage() {
    const { auth } = Route.useRouteContext();
    const { consent_code, client_id, scope } = Route.useSearch();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scopes = scope?.split(" ") || [];

    const handleConsent = async (accept: boolean) => {
        if (!consent_code) {
            setError("Missing consent code");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await auth.oauth2.consent({
                accept,
                consent_code: consent_code,
            });

            if (response.error) {
                setError(response.error.message || "Failed to process consent");
                setLoading(false);
                return;
            }

            // The plugin will handle the redirect automatically
            // If we're still here, something went wrong
            if (!accept) {
                // User denied, redirect to home
                navigate({ to: "/" });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "An error occurred");
            setLoading(false);
        }
    };

    if (!consent_code || !client_id) {
        return (
            <div className="flex flex-col gap-20">
                <Header>
                    <span />
                </Header>
                <div className="max-w-md mx-auto p-6 text-center">
                    <h1 className="text-2xl font-bold mb-4">Invalid Request</h1>
                    <p className="text-gray-600">
                        Missing required authorization parameters.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-20">
            <Header>
                <span />
            </Header>
            <div className="max-w-md mx-auto p-6">
                <div className="bg-white rounded-lg shadow-lg p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg
                                className="w-8 h-8 text-amber-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <title>Authorization</title>
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            Authorize Application
                        </h1>
                        <p className="text-gray-600 mt-2">
                            <span className="font-semibold">{client_id}</span>{" "}
                            wants to access your Pollinations account
                        </p>
                    </div>

                    {scopes.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-gray-700 mb-3">
                                This application will be able to:
                            </h2>
                            <ul className="space-y-2">
                                {scopes.map((s) => (
                                    <li
                                        key={s}
                                        className="flex items-center gap-2 text-sm text-gray-600"
                                    >
                                        <svg
                                            className="w-4 h-4 text-green-500"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <title>Checkmark</title>
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
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <Button
                            as="button"
                            onClick={() => handleConsent(false)}
                            disabled={loading}
                            className="flex-1 bg-gray-200 text-gray-800 hover:bg-gray-300"
                        >
                            Deny
                        </Button>
                        <Button
                            as="button"
                            onClick={() => handleConsent(true)}
                            disabled={loading}
                            className="flex-1 bg-amber-200 text-amber-900 hover:brightness-105"
                        >
                            {loading ? "Authorizing..." : "Allow"}
                        </Button>
                    </div>

                    <p className="text-xs text-gray-500 text-center mt-4">
                        By clicking Allow, you authorize this application to
                        access your information.
                    </p>
                </div>
            </div>
        </div>
    );
}

function getScopeDescription(scope: string): string {
    const descriptions: Record<string, string> = {
        openid: "Verify your identity",
        profile: "Access your profile information (name, avatar)",
        email: "Access your email address",
        "api:generate": "Generate images and text using your account",
    };
    return descriptions[scope] || scope;
}
