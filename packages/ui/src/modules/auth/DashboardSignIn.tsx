import { Button } from "../../primitives/Button.tsx";
import { ColorModeToggle } from "../../primitives/ColorModeToggle.tsx";
import { RefreshIcon } from "../../primitives/icons/index.tsx";
import { AuthErrorContent } from "./AuthErrorContent.tsx";
import { AuthFlowLayout, AuthInfoCard } from "./AuthModal.tsx";
import { PollinationsSignInButton } from "./PollinationsSignInButton.tsx";

const signInErrors = {
    admin_required: {
        title: "Admin access required",
        message:
            "Your pollinations.ai account does not have admin access. Switch accounts on Pollinations, then try again.",
    },
    cancelled: {
        title: "Sign-in cancelled",
        message: "Sign-in was cancelled. You can try again.",
    },
    invalid_state: {
        title: "Sign-in link expired",
        message: "Your pollinations.ai sign-in link expired. Please try again.",
    },
    unavailable: {
        title: "Couldn’t sign in",
        message:
            "Couldn’t complete your pollinations.ai sign-in. Please try again.",
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
            dialog={{ labelledBy: "dashboard-sign-in-title" }}
            title={!isPending && error ? undefined : appName}
            titleId="dashboard-sign-in-title"
            description="Sign in with a Pollinations admin account."
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
            {!isPending && error ? (
                <AuthErrorContent
                    title={error.title}
                    titleId="dashboard-sign-in-title"
                    message={error.message}
                >
                    <AuthInfoCard title={null}>
                        <p className="polli:font-body polli:font-semibold polli:text-theme-text-strong">
                            {appName}
                        </p>
                    </AuthInfoCard>
                </AuthErrorContent>
            ) : null}
        </AuthFlowLayout>
    );
}
