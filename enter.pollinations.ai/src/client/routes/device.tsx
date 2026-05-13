import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "../auth.ts";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "../components/auth/auth-modal.tsx";
import { Button } from "../components/button.tsx";
import { config } from "../config.ts";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";

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
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
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

    if (isPending) {
        return <AuthModalLoading />;
    }

    if (!user) {
        return (
            <AuthModal tone={signInError ? "error" : undefined}>
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    {signInError && <ErrorBanner>{signInError}</ErrorBanner>}
                    <AuthInfoCard>
                        <p className="text-theme-text-strong">
                            Connect a device to your Pollinations account.
                        </p>
                        <p className="text-sm text-theme-text-base mt-3">
                            Sign in to enter the device code.
                        </p>
                    </AuthInfoCard>
                    <div className="flex justify-end">
                        <Button
                            as="button"
                            onClick={signIn}
                            disabled={isSigningIn}
                            theme="amber"
                        >
                            {isSigningIn
                                ? "Signing in..."
                                : "Continue with GitHub"}
                        </Button>
                    </div>
                </div>
            </AuthModal>
        );
    }

    return (
        <AuthModal tone={error ? "error" : undefined}>
            <AuthModalHeader />
            <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-4">
                {error && <ErrorBanner>{error}</ErrorBanner>}

                <AuthInfoCard>
                    <div className="space-y-3">
                        <p className="text-theme-text-strong">
                            Enter the code from your device.
                        </p>
                        <input
                            type="text"
                            value={userCode}
                            onChange={(e) =>
                                setUserCode(e.target.value.toUpperCase())
                            }
                            placeholder="XXXX-XXXX"
                            className="w-full text-center text-2xl font-mono tracking-widest p-3 border-2 border-theme-border rounded-lg bg-surface-white text-theme-text-strong"
                            ref={inputRef}
                            maxLength={20}
                            disabled={checking}
                        />
                    </div>
                </AuthInfoCard>

                <div className="flex justify-end">
                    <Button
                        as="button"
                        type="submit"
                        theme="amber"
                        disabled={checking}
                    >
                        {checking ? "Verifying..." : "Continue"}
                    </Button>
                </div>
            </form>
        </AuthModal>
    );
}
