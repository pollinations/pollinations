import { Button } from "../../primitives/Button.tsx";
import { useColorMode } from "../../primitives/ColorModeToggle.tsx";
import { RefreshIcon } from "../../primitives/icons/index.tsx";
import { AuthFlowLayout } from "./AuthModal.tsx";
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
    // Auth modals carry no theme switch; they follow the saved or system mode.
    useColorMode();
    const code =
        typeof window === "undefined"
            ? null
            : new URLSearchParams(window.location.search).get("auth_error");
    const error = sessionError
        ? { title: "Couldn’t check your session", message: sessionError }
        : code && Object.hasOwn(signInErrors, code)
          ? signInErrors[code as keyof typeof signInErrors]
          : null;
    const shownError = isPending ? null : error;
    return (
        <AuthFlowLayout
            title={shownError ? shownError.title : `Sign in to ${appName}`}
            description={
                shownError ? undefined : "Use your Pollinations admin account."
            }
            error={shownError?.message}
            actions={
                isPending ? (
                    <PollinationsSignInButton isPending>
                        Checking sign-in…
                    </PollinationsSignInButton>
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
