import { ArrowRightIcon, Button, Field, Input } from "@pollinations/ui";
import { AuthModalLoading } from "@pollinations/ui/auth";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient } from "../../auth.ts";
import { AppAttribution } from "./app-attribution.tsx";
import { AuthFlowScreen } from "./auth-flow-screen.tsx";
import { SignInScreen } from "./sign-in-screen.tsx";

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
                    setError(
                        data?.error_description ||
                            "Code not recognized. Check it and try again.",
                    );
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
                            ? "This code has expired. Get a new code from your device."
                            : "This code has already been used. Return to your device, or get a new code to reconnect.",
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
                setError("Couldn’t verify the code. Try again.");
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

    const subject = (
        <AppAttribution attribution={null} isDeviceMode redirectHostname="" />
    );
    const access = "to access your account.";

    if (isPending) return <AuthModalLoading title="Allow" subject={subject} />;

    if (!user) {
        return (
            <SignInScreen
                title="Allow"
                subject={subject}
                description={`${access} Sign in, then enter the code shown on it.`}
            />
        );
    }

    return (
        <AuthFlowScreen
            title="Allow"
            subject={subject}
            description={`${access} Enter the code shown on it.`}
            error={error}
            actions={
                <Button
                    type="submit"
                    form="device-code-form"
                    icon={<ArrowRightIcon />}
                    disabled={checking}
                >
                    {checking ? "Checking code…" : "Continue"}
                </Button>
            }
        >
            <form
                id="device-code-form"
                onSubmit={handleSubmit}
                className="space-y-4"
            >
                <Field.Root className="space-y-2">
                    <Field.Label className="text-sm font-semibold">
                        Device code
                    </Field.Label>
                    <Field.Input asChild>
                        <Input
                            type="text"
                            value={userCode}
                            onChange={(e) =>
                                setUserCode(e.target.value.toUpperCase())
                            }
                            placeholder="XXXX-XXXX"
                            className="w-full text-center font-mono text-2xl tracking-widest"
                            ref={inputRef}
                            maxLength={20}
                            disabled={checking}
                            autoCapitalize="characters"
                            autoComplete="one-time-code"
                            spellCheck={false}
                            required
                        />
                    </Field.Input>
                </Field.Root>
            </form>
        </AuthFlowScreen>
    );
}
