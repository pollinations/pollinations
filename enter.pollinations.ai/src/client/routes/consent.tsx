import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { Button } from "../components/button.tsx";

const SCOPE_LABELS: Record<string, string> = {
    openid: "Know who you are",
    profile: "Read your profile (name, picture)",
    email: "Read your email address",
    generate: "Generate images, text, audio, and video",
    "read:usage": "View your usage history",
    "read:balance": "View your pollen balance",
    offline_access: "Stay connected when you're away",
};

export const Route = createFileRoute("/consent")({
    component: ConsentComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        client_id: (search.client_id as string) || "",
        scope: (search.scope as string) || "",
    }),
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (!result.data?.user) throw redirect({ to: "/sign-in" });
    },
});

function ConsentComponent() {
    const { client_id, scope } = Route.useSearch();
    const { data: session } = authClient.useSession();
    const user = session?.user;

    const [clientInfo, setClientInfo] = useState<{
        name?: string;
        icon?: string;
        uri?: string;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scopes = scope ? scope.split(" ").filter(Boolean) : [];

    useEffect(() => {
        if (!client_id) {
            setError("Missing client_id");
            setLoading(false);
            return;
        }
        authClient.oauth2
            .publicClient({ query: { client_id } })
            .then((res) => {
                if ("data" in res && res.data) {
                    const d = res.data as {
                        name?: string;
                        icon?: string;
                        uri?: string;
                    };
                    setClientInfo(d);
                } else {
                    setError("Unknown application");
                }
            })
            .catch(() => setError("Failed to load application info"))
            .finally(() => setLoading(false));
    }, [client_id]);

    const handleConsent = async (accept: boolean) => {
        setSubmitting(true);
        setError(null);
        try {
            await authClient.oauth2.consent({ accept });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Consent failed");
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg p-8 text-center max-w-lg w-full">
                    <p className="text-green-950">Loading...</p>
                </div>
            </div>
        );
    }

    const appName = clientInfo?.name || client_id;

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
            <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg max-h-[85vh] max-w-lg w-full flex flex-col">
                {/* Header */}
                <div className="shrink-0 p-6 pb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            Authorize Application
                        </h2>
                        <img
                            src="/logo_text_black.svg"
                            alt="pollinations.ai"
                            className="h-8 object-contain invert"
                        />
                    </div>
                    {user && (
                        <p className="text-sm text-green-800 mt-1">
                            Signed in as{" "}
                            <strong>{user.githubUsername || user.email}</strong>
                        </p>
                    )}
                </div>

                {/* Content */}
                <div
                    className="flex-1 overflow-y-auto px-6 py-2 space-y-4"
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
                            {/* App info */}
                            <div className="bg-green-200 rounded-lg p-4 flex items-center gap-3">
                                {clientInfo?.icon && (
                                    <img
                                        src={clientInfo.icon}
                                        alt=""
                                        className="w-10 h-10 rounded"
                                    />
                                )}
                                <div>
                                    <p className="font-semibold text-green-950">
                                        {appName}
                                    </p>
                                    {clientInfo?.uri && (
                                        <p className="text-xs text-green-800">
                                            {clientInfo.uri}
                                        </p>
                                    )}
                                    <p className="text-xs text-green-800 mt-0.5">
                                        wants access to your account
                                    </p>
                                </div>
                            </div>

                            {/* Requested scopes */}
                            <div>
                                <p className="text-sm font-medium text-green-950 mb-2">
                                    This will allow the application to:
                                </p>
                                <ul className="text-sm text-green-900 space-y-2">
                                    {scopes.map((s: string) => (
                                        <li
                                            key={s}
                                            className="flex items-start gap-2"
                                        >
                                            <span className="text-green-600">
                                                &#x2713;
                                            </span>
                                            <span>{SCOPE_LABELS[s] || s}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
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
                            onClick={() => handleConsent(false)}
                            disabled={submitting || !!error}
                            weight="outline"
                        >
                            Deny
                        </Button>
                        <Button
                            as="button"
                            onClick={() => handleConsent(true)}
                            disabled={submitting || !!error}
                            color="green"
                        >
                            {submitting ? "Authorizing..." : "Allow"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
