import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "../auth.ts";
import { Button } from "../components/button.tsx";
import { config } from "../config.ts";

export const Route = createFileRoute("/device")({
    component: DeviceComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        user_code: (search.user_code as string) || "",
    }),
});

function DeviceComponent() {
    const { user_code: prefilled } = Route.useSearch();
    const navigate = useNavigate();

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [userCode, setUserCode] = useState(prefilled);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const verifyAndRedirect = useCallback(
        async (code: string) => {
            setError(null);
            setChecking(true);
            try {
                const res = await fetch(
                    `${config.baseUrl}/api/device/info?user_code=${encodeURIComponent(code)}`,
                    { credentials: "include" },
                );
                if (!res.ok) {
                    const data = (await res.json().catch(() => null)) as {
                        error_description?: string;
                    } | null;
                    setError(data?.error_description || "Invalid code");
                    return;
                }
                const data = (await res.json()) as {
                    status: string;
                    scope?: string;
                    clientId?: string | null;
                };
                if (data.status !== "pending") {
                    setError(
                        data.status === "expired"
                            ? "This code has expired"
                            : "This code has already been used",
                    );
                    return;
                }
                navigate({
                    to: "/authorize",
                    search: {
                        user_code: code.toUpperCase(),
                        ...(data.scope && { device_scope: data.scope }),
                        ...(data.clientId && { app_key: data.clientId }),
                    },
                });
            } catch {
                setError("Failed to verify code");
            } finally {
                setChecking(false);
            }
        },
        [navigate],
    );

    // Auto-verify and redirect if pre-filled
    useEffect(() => {
        if (prefilled && user) verifyAndRedirect(prefilled);
    }, [prefilled, user, verifyAndRedirect]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const code = userCode.trim().toUpperCase();
        if (!code) return;
        verifyAndRedirect(code);
    }

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
                <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg max-w-lg w-full">
                    <div className="p-6 pb-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">
                                Authorize Device
                            </h2>
                            <img
                                src="/logo_text_black.svg"
                                alt="pollinations.ai"
                                className="h-8 object-contain"
                            />
                        </div>
                    </div>
                    <div className="px-6 pb-6 space-y-4">
                        <p className="text-sm text-green-900">
                            Sign in to authorize your device
                        </p>
                        <Button
                            as="button"
                            onClick={handleSignIn}
                            disabled={isSigningIn}
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
            <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg max-w-lg w-full">
                <div className="p-6 pb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            Authorize Device
                        </h2>
                        <img
                            src="/logo_text_black.svg"
                            alt="pollinations.ai"
                            className="h-8 object-contain"
                        />
                    </div>
                </div>

                <div className="px-6 pb-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <p className="text-sm text-green-900">
                            Enter the code shown on your device:
                        </p>
                        <input
                            type="text"
                            value={userCode}
                            onChange={(e) =>
                                setUserCode(e.target.value.toUpperCase())
                            }
                            placeholder="XXXX-XXXX"
                            className="w-full text-center text-2xl font-mono tracking-widest p-3 border-2 border-green-300 rounded-lg bg-white text-green-950 focus:border-green-600 focus:outline-none"
                            ref={inputRef}
                            maxLength={20}
                            disabled={checking}
                        />
                        <Button
                            as="button"
                            type="submit"
                            color="green"
                            className="w-full"
                            disabled={checking}
                        >
                            {checking ? "Verifying..." : "Continue"}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
