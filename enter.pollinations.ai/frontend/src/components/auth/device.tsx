import { Button, Field, Heading, Input, Text } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient } from "../../auth.ts";
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
                setError("Couldn’t check this code. Please try again.");
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
            <SignInScreen
                title="Connect your device"
                description="Sign in to enter the code shown on your device."
            />
        );
    }

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "device-title" }}
            actions={
                <Button
                    type="submit"
                    form="device-code-form"
                    disabled={checking}
                >
                    {checking ? "Checking code…" : "Continue"}
                </Button>
            }
        >
            <Heading as="h1" size="section" id="device-title">
                Connect your device
            </Heading>
            <Text size="sm">
                Enter the code shown on your device to review its access.
            </Text>
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
                {error && <ErrorBanner>{error}</ErrorBanner>}
            </form>
        </AuthFlowLayout>
    );
}
