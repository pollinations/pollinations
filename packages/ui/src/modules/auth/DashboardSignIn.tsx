import { Button } from "../../primitives/Button.tsx";
import { ColorModeToggle } from "../../primitives/ColorModeToggle.tsx";
import { RefreshIcon } from "../../primitives/icons/index.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { Text } from "../../primitives/Typography.tsx";
import { AuthFlowLayout, ErrorBanner } from "./AuthModal.tsx";
import { PollinationsSignInButton } from "./PollinationsSignInButton.tsx";

const signInErrors = {
    admin_required: {
        title: "Admin access required",
        message:
            "Your Pollinations account does not have admin access. Switch accounts on Pollinations, then try again.",
    },
    access_denied: {
        title: "Couldn’t sign in",
        message:
            "Your Pollinations account could not sign in. Please try again.",
    },
    cancelled: {
        title: "Sign-in cancelled",
        message: "Sign-in was cancelled. You can try again.",
    },
    invalid_state: {
        title: "Sign-in link expired",
        message: "Your Pollinations sign-in link expired. Please try again.",
    },
    unavailable: {
        title: "Couldn’t sign in",
        message:
            "Couldn’t complete your Pollinations sign-in. Please try again.",
    },
} as const;

export function DashboardSignIn({
    appName,
    onSignIn,
    isPending = false,
    sessionError,
    description = "Sign in with your Pollinations admin account.",
    authError = typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("auth_error"),
}: {
    appName: string;
    onSignIn: () => void;
    isPending?: boolean;
    sessionError?: string | null;
    description?: string;
    authError?: string | null;
}) {
    const error = sessionError
        ? { title: "Couldn’t check your session", message: sessionError }
        : authError && Object.hasOwn(signInErrors, authError)
          ? signInErrors[authError as keyof typeof signInErrors]
          : null;
    return (
        <AuthFlowLayout
            headerAction={<ColorModeToggle />}
            title={!isPending && error ? error.title : "Sign in"}
            actions={
                isPending ? (
                    <output>Checking sign-in…</output>
                ) : sessionError ? (
                    <Button
                        icon={<RefreshIcon />}
                        onClick={() => window.location.reload()}
                        className="polli:w-full"
                    >
                        Reload
                    </Button>
                ) : (
                    <PollinationsSignInButton onClick={onSignIn}>
                        {error ? "Try again" : "Sign in with Pollinations"}
                    </PollinationsSignInButton>
                )
            }
        >
            {!isPending && error && <ErrorBanner>{error.message}</ErrorBanner>}
            <Surface>
                <Text size="sm" weight="semibold" tone="strong">
                    {appName}
                </Text>
            </Surface>
            {!(!isPending && error) && (
                <Text size="sm" tone="muted">
                    {description}
                </Text>
            )}
        </AuthFlowLayout>
    );
}
