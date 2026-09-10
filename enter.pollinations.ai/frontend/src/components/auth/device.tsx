import { Button, Heading, Input } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthInfoCard,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient } from "../../auth.ts";
import { useGitHubSignIn } from "../../hooks/use-github-sign-in.ts";

type DeviceProps = {
    prefilledCode: string;
};

const verificationMessages = {
    expired: "This code has expired. Get a new code from your device.",
    used: "This code has already been used. Return to your device, or get a new code to reconnect.",
    invalid: "Code not recognized. Check it and try again.",
    unavailable: "Couldn’t verify the code. Try again.",
};

export function Device({ prefilledCode }: DeviceProps) {
    const navigate = useNavigate();

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [userCode, setUserCode] = useState(prefilledCode);
    const [error, setError] = useState<{
        code: string;
        kind: keyof typeof verificationMessages;
    } | null>(null);
    const [checking, setChecking] = useState(false);
    const [deviceApp, setDeviceApp] = useState<{
        code: string;
        name: string;
    } | null>(null);
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const inputRef = useRef<HTMLInputElement>(null);
    const normalizedCode = userCode.trim().toUpperCase();
    const currentError = error?.code === normalizedCode ? error : null;
    const cannotVerify =
        checking ||
        !normalizedCode ||
        currentError?.kind === "expired" ||
        currentError?.kind === "used";

    // Optional display metadata only; verification and approval still happen below.
    useEffect(() => {
        if (!prefilledCode || user) return;
        let active = true;
        async function loadAppName() {
            try {
                const response = await apiClient.device.info.$get({
                    query: { user_code: prefilledCode },
                });
                if (!response.ok) return;
                const device = await response.json();
                if (device.status !== "pending" || !device.clientId) return;
                const lookup = await apiClient["app-lookup"].$get({
                    query: { app_key: device.clientId },
                });
                if (!lookup.ok) return;
                const app = await lookup.json();
                if (active && app.found && app.appName) {
                    setDeviceApp({ code: prefilledCode, name: app.appName });
                }
            } catch {
                // An unavailable app label must not prevent sign-in.
            }
        }
        loadAppName();
        return () => {
            active = false;
        };
    }, [prefilledCode, user]);

    const verifyAndRedirect = useCallback(
        async (code: string) => {
            code = code.trim().toUpperCase();
            setError(null);
            setChecking(true);
            try {
                const res = await apiClient.device.info.$get({
                    query: { user_code: code },
                });
                if (!res.ok) {
                    const failure = (await res.json().catch(() => null)) as {
                        error?: string;
                    } | null;
                    setError({
                        code,
                        kind:
                            failure?.error === "expired_token"
                                ? "expired"
                                : res.status === 400
                                  ? "invalid"
                                  : "unavailable",
                    });
                    return;
                }
                const data = (await res.json()) as {
                    status: string;
                    scope?: string;
                    clientId?: string | null;
                };
                if (data.status !== "pending") {
                    setError({
                        code,
                        kind: data.status === "expired" ? "expired" : "used",
                    });
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
                setError({ code, kind: "unavailable" });
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
        if (cannotVerify) return;
        verifyAndRedirect(normalizedCode);
    }

    if (isPending || !user) {
        return (
            <AuthFlowLayout
                dialog={{ labelledBy: "device-sign-in-title" }}
                actions={
                    <GitHubSignInButton
                        onClick={signIn}
                        isSigningIn={isPending || isSigningIn}
                        pendingLabel={
                            isPending ? "Checking account…" : undefined
                        }
                        retry={!!signInError}
                        className="w-full"
                    />
                }
            >
                <div className="py-3">
                    <Heading
                        as="h1"
                        size="section"
                        id="device-sign-in-title"
                        className="mb-3"
                    >
                        Sign in to pollinations.ai
                    </Heading>
                    <p className="mb-3 font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                        To connect:
                    </p>
                    <AuthInfoCard title={null}>
                        <p className="font-semibold text-theme-text-strong">
                            {deviceApp?.code === prefilledCode
                                ? deviceApp.name
                                : "Your device"}
                        </p>
                    </AuthInfoCard>
                </div>
                {signInError && <ErrorBanner>{signInError}</ErrorBanner>}
            </AuthFlowLayout>
        );
    }

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "device-code-title" }}
            actions={
                <Button
                    as="button"
                    type="submit"
                    form="device-code-form"
                    disabled={cannotVerify}
                    className="polli:rounded-md whitespace-nowrap"
                >
                    {checking
                        ? "Verifying…"
                        : currentError?.kind === "unavailable"
                          ? "Try again"
                          : "Verify code"}
                </Button>
            }
        >
            <Heading
                as="h1"
                size="section"
                id="device-code-title"
                className="pt-3"
            >
                Enter device code
            </Heading>
            <form
                id="device-code-form"
                onSubmit={handleSubmit}
                className="space-y-4"
            >
                {currentError && (
                    <ErrorBanner>
                        {verificationMessages[currentError.kind]}
                    </ErrorBanner>
                )}

                <AuthInfoCard title={null}>
                    <div className="space-y-3">
                        <p className="text-theme-text-strong">
                            Enter the code from your device.
                        </p>
                        <Input
                            type="text"
                            aria-label="Device code"
                            autoComplete="one-time-code"
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
            </form>
        </AuthFlowLayout>
    );
}
