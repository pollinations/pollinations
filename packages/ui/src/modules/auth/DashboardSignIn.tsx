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
}: {
    appName: string;
    onSignIn: () => void;
    isPending?: boolean;
    sessionError?: string | null;
}) {
    const code =
        typeof window === "undefined"
            ? null
            : new URLSearchParams(window.location.search).get("auth_error");
    const error = sessionError
        ? { title: "Couldn’t check your session", message: sessionError }
        : code && Object.hasOwn(signInErrors, code)
          ? signInErrors[code as keyof typeof signInErrors]
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
                    Sign in with your Pollinations admin account.
                </Text>
            )}
        </AuthFlowLayout>
    );
}
