import {
    ArrowRightIcon,
    Button,
    Field,
    FieldStack,
    Input,
} from "@pollinations/ui";
import { AuthModalLoading } from "@pollinations/ui/auth";
import { USER_CODE_LENGTH } from "@shared/auth/device-code.ts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient } from "../../auth.ts";
import { AuthFlowScreen } from "./auth-flow-screen.tsx";
import { SignInScreen } from "./sign-in-screen.tsx";

type DeviceProps = {
    prefilledCode: string;
};

// Devices show the bare code; people may type it with a dash or spaces.
const normalizeCode = (value: string) =>
    value.replace(/[^0-9A-Z]/gi, "").toUpperCase();

export function Device({ prefilledCode }: DeviceProps) {
    const navigate = useNavigate();

    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;

    const [userCode, setUserCode] = useState(prefilledCode);
    const [error, setError] = useState<string | null>(null);
    // A rejected code keeps Continue off until it changes; a check that
    // could not run is not remembered, so it can be retried.
    const [rejectedCode, setRejectedCode] = useState<string | null>(null);
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
                    // A 400 is the server's answer about this code (invalid or
                    // expired). Anything else is temporary, so it can be retried.
                    if (res.status !== 400) {
                        setError("Couldn’t verify the code. Try again.");
                        return;
                    }
                    const data = (await res.json().catch(() => null)) as {
                        error_description?: string;
                    } | null;
                    setError(
                        data?.error_description ||
                            "Code not recognized. Check it and try again.",
                    );
                    setRejectedCode(code);
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
                    setRejectedCode(code);
                    return;
                }
                navigate({
                    to: "/authorize",
                    search: {
                        user_code: code,
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
        if (prefilledCode && user)
            verifyAndRedirect(normalizeCode(prefilledCode));
    }, [prefilledCode, user, verifyAndRedirect]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const entered = normalizeCode(userCode);
    const canContinue =
        entered.length === USER_CODE_LENGTH &&
        !checking &&
        entered !== rejectedCode;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (canContinue) verifyAndRedirect(entered);
    }

    const access = "to access your Pollinations account.";

    if (isPending) return <AuthModalLoading title="Allow your device" />;

    if (!user) {
        return (
            <SignInScreen
                title="Allow your device"
                description={`${access} Sign in, then enter the code shown on it.`}
            />
        );
    }

    return (
        <AuthFlowScreen
            title="Allow your device"
            description={`${access} Enter the code shown on it.`}
            actions={
                <Button
                    type="submit"
                    form="device-code-form"
                    icon={<ArrowRightIcon />}
                    disabled={!canContinue}
                    aria-busy={checking}
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
                <FieldStack error={error}>
                    <Field.Input asChild>
                        <Input
                            type="text"
                            aria-label="Device code"
                            value={userCode}
                            onChange={(e) => {
                                setUserCode(e.target.value.toUpperCase());
                                setError(null);
                            }}
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
                </FieldStack>
            </form>
        </AuthFlowScreen>
    );
}
