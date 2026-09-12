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
import {
    deviceCodeMessages,
    normalizeDeviceCode,
    readDeviceRequest,
} from "../../lib/device-request.ts";
import { AppAttribution } from "./app-attribution.tsx";
import { AuthAccountIdentity } from "./auth-account-identity.tsx";
import { SignInScreen } from "./sign-in-screen.tsx";

type DeviceProps = {
    prefilledCode: string;
};

export function Device({ prefilledCode }: DeviceProps) {
    const navigate = useNavigate();

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [userCode, setUserCode] = useState(prefilledCode);
    const [error, setError] = useState<{
        code: string;
        kind: keyof typeof deviceCodeMessages;
    } | null>(null);
    const [checking, setChecking] = useState(false);
    const [deviceApp, setDeviceApp] = useState<{
        code: string;
        appName: string;
        githubUsername?: string;
    } | null>(null);
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const inputRef = useRef<HTMLInputElement>(null);
    const normalizedCode = normalizeDeviceCode(userCode);
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
                    query: { user_code: normalizeDeviceCode(prefilledCode) },
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
                    setDeviceApp({
                        code: prefilledCode,
                        appName: app.appName,
                        githubUsername: app.githubUsername,
                    });
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
            code = normalizeDeviceCode(code);
            setError(null);
            setChecking(true);
            try {
                const res = await apiClient.device.info.$get({
                    query: { user_code: code },
                });
                const data = await readDeviceRequest(res);
                if (!data.ok) {
                    setError({ code, kind: data.error });
                    return;
                }
                navigate({
                    to: "/authorize",
                    search: { user_code: code },
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

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (cannotVerify) return;
        verifyAndRedirect(normalizedCode);
    }

    if (isPending || !user) {
        return (
            <SignInScreen
                appFirst
                app={
                    <AppAttribution
                        titleId="sign-in-title"
                        attribution={
                            deviceApp?.code === prefilledCode ? deviceApp : null
                        }
                        isDeviceMode
                        userCode={normalizeDeviceCode(prefilledCode)}
                        redirectHostname=""
                    />
                }
                error={signInError}
                actions={
                    <GitHubSignInButton
                        onClick={signIn}
                        isSigningIn={isPending || isSigningIn}
                        pendingLabel={
                            isPending ? "Checking account…" : undefined
                        }
                        retry={!!signInError}
                    />
                }
            />
        );
    }

    return (
        <AuthFlowLayout
            dialog={{
                labelledBy: "device-code-title",
                initialFocusEl: () => inputRef.current,
            }}
            account={<AuthAccountIdentity user={user} />}
            actions={
                <Button
                    as="button"
                    type="submit"
                    form="device-code-form"
                    disabled={cannotVerify}
                    aria-busy={checking}
                    className="whitespace-nowrap"
                >
                    {checking
                        ? "Verifying…"
                        : currentError?.kind === "unavailable"
                          ? "Try again"
                          : "Verify code"}
                </Button>
            }
        >
            <div className="space-y-2 pt-3">
                <Heading as="h1" size="section" id="device-code-title">
                    Connect your device
                </Heading>
                <p
                    id="device-code-hint"
                    className="font-body text-xs font-semibold tracking-wide text-theme-text-soft"
                >
                    using the code shown on it.
                </p>
            </div>
            <form
                id="device-code-form"
                onSubmit={handleSubmit}
                className="space-y-3"
            >
                <AuthInfoCard title={null}>
                    <Input
                        type="text"
                        aria-label="Device code"
                        aria-describedby={
                            currentError
                                ? "device-code-hint device-code-error"
                                : "device-code-hint"
                        }
                        aria-invalid={
                            !!currentError &&
                            currentError.kind !== "unavailable"
                        }
                        error={
                            !!currentError &&
                            currentError.kind !== "unavailable"
                        }
                        autoComplete="one-time-code"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={userCode}
                        onChange={(e) =>
                            setUserCode(e.target.value.toUpperCase())
                        }
                        placeholder="XXXXXXXX"
                        className="w-full text-center font-mono text-2xl tracking-widest"
                        ref={inputRef}
                        maxLength={20}
                        disabled={checking}
                    />
                </AuthInfoCard>
                {currentError && (
                    <div id="device-code-error">
                        <ErrorBanner>
                            {deviceCodeMessages[currentError.kind]}
                        </ErrorBanner>
                    </div>
                )}
            </form>
        </AuthFlowLayout>
    );
}
