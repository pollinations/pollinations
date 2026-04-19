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
                        ...(data.scope && {
                            scope: data.scope.split(" ").filter(Boolean),
                        }),
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
                <div className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg max-w-xl w-full">
                    <div className="flex justify-start px-6 pt-6">
                        <a
                            href="https://pollinations.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                        >
                            <img
                                src="/logo.svg"
                                alt="pollinations.ai"
                                className="h-8 w-8 object-contain invert"
                            />
                        </a>
                    </div>
                    <div className="px-8 pb-8 pt-2 text-center">
                        <p className="text-gray-900">Loading...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg max-w-xl w-full">
                    <div className="p-6 pb-4">
                        <a
                            href="https://pollinations.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-block"
                        >
                            <img
                                src="/logo.svg"
                                alt="pollinations.ai"
                                className="h-8 w-8 object-contain invert"
                            />
                        </a>
                    </div>
                    <div className="px-6 pb-6 space-y-4">
                        <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-4">
                            <p className="font-body text-xs font-semibold text-amber-800 tracking-wide mb-2">
                                Authorize
                            </p>
                            <p className="text-gray-900">
                                Connect a device to your Pollinations account.
                            </p>
                            <p className="text-sm text-amber-900 mt-3">
                                Sign in to enter the device code.
                            </p>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                as="button"
                                onClick={handleSignIn}
                                disabled={isSigningIn}
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
        <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
            <div className="bg-amber-50 border-4 border-green-950 rounded-lg shadow-lg max-w-xl w-full">
                <div className="p-6 pb-4">
                    <a
                        href="https://pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-block"
                    >
                        <img
                            src="/logo.svg"
                            alt="pollinations.ai"
                            className="h-8 w-8 object-contain invert"
                        />
                    </a>
                </div>

                <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    )}

                    <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-4 space-y-3">
                        <p className="font-body text-xs font-semibold text-amber-800 tracking-wide">
                            Authorize
                        </p>
                        <p className="text-gray-900">
                            Enter the code from your device.
                        </p>
                        <input
                            type="text"
                            value={userCode}
                            onChange={(e) =>
                                setUserCode(e.target.value.toUpperCase())
                            }
                            placeholder="XXXX-XXXX"
                            className="w-full text-center text-2xl font-mono tracking-widest p-3 border-2 border-amber-300 rounded-lg bg-white text-gray-900 focus:border-amber-600 focus:outline-none"
                            ref={inputRef}
                            maxLength={20}
                            disabled={checking}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button
                            as="button"
                            type="submit"
                            color="dark"
                            disabled={checking}
                        >
                            {checking ? "Verifying..." : "Continue"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
