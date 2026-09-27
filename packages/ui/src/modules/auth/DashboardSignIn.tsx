import { Button } from "../../primitives/Button.tsx";
import { ColorModeToggle } from "../../primitives/ColorModeToggle.tsx";
import { RefreshIcon } from "../../primitives/icons/index.tsx";
import { AuthFlowLayout } from "./AuthModal.tsx";
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
    description = "Use your Pollinations admin account.",
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
    const shownError = isPending ? null : error;
    return (
        <AuthFlowLayout
            headerAction={<ColorModeToggle />}
            title={shownError ? shownError.title : `Sign in to ${appName}`}
            description={shownError ? undefined : description}
            error={shownError?.message}
            actions={
                isPending ? (
                    <output>Checking sign-in…</output>
                ) : sessionError ? (
                    <Button
                        icon={<RefreshIcon />}
                        onClick={() => window.location.reload()}
                    >
                        Reload
                    </Button>
                ) : (
                    <PollinationsSignInButton onClick={onSignIn}>
                        {error ? "Try again" : "Sign in with Pollinations"}
                    </PollinationsSignInButton>
                )
            }
        />
    );
}
