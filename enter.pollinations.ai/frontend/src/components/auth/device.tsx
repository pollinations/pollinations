import { Button, Input } from "@pollinations/ui";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient } from "../../auth.ts";
import { useSocialProviders } from "../../hooks/use-social-providers.ts";
import { useSocialSignIn } from "../../hooks/use-social-sign-in.ts";
import { SocialSignInButtons } from "./social-sign-in-buttons.tsx";

type DeviceProps = {
    prefilledCode: string;
};

export function Device({ prefilledCode }: DeviceProps) {
    const navigate = useNavigate();

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [userCode, setUserCode] = useState(prefilledCode);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const { pendingProvider, error: signInError, signIn } = useSocialSignIn();
    const socialProviders = useSocialProviders();
    const inputRef = useRef<HTMLInputElement>(null);

    const verifyAndRedirect = useCallback(
        async (code: string) => {
            setError(null);
            setChecking(true);
            try {
                const res = await apiClient.device.info.$get({
                    query: { user_code: code },
                });
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
        if (prefilledCode && user) verifyAndRedirect(prefilledCode);
    }, [prefilledCode, user, verifyAndRedirect]);

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
                    <SocialSignInButtons
                        providers={socialProviders.providers}
                        isLoading={socialProviders.isLoading}
                        error={socialProviders.error}
                        pendingProvider={pendingProvider}
                        onSignIn={signIn}
                    />
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
                        <Input
                            type="text"
                            value={userCode}
                            onChange={(e) =>
                                setUserCode(e.target.value.toUpperCase())
                            }
                            placeholder="XXXX-XXXX"
                            className="w-full border-2 border-theme-border bg-surface-white p-3 text-center font-mono text-2xl tracking-widest text-theme-text-strong"
                            ref={inputRef}
                            maxLength={20}
                            disabled={checking}
                        />
                    </div>
                </AuthInfoCard>

                <div className="flex justify-end">
                    <Button as="button" type="submit" disabled={checking}>
                        {checking ? "Verifying..." : "Continue"}
                    </Button>
                </div>
            </form>
        </AuthModal>
    );
}
