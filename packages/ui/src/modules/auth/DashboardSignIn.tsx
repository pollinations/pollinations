import { Heading } from "../../primitives/Typography.tsx";
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
}: {
    appName: string;
    onSignIn: () => void;
}) {
    const code =
        typeof window === "undefined"
            ? null
            : new URLSearchParams(window.location.search).get("auth_error");
    const error =
        code && Object.hasOwn(signInErrors, code)
            ? signInErrors[code as keyof typeof signInErrors]
            : null;
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "dashboard-sign-in-title" }}
            actions={
                <PollinationsSignInButton onClick={onSignIn}>
                    {error ? "Try again" : "Sign in with Pollinations"}
                </PollinationsSignInButton>
            }
        >
            {error ? (
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
            ) : (
                <div className="polli:space-y-2 polli:pt-3">
                    <Heading
                        as="h1"
                        size="section"
                        id="dashboard-sign-in-title"
                    >
                        {appName}
                    </Heading>
                    <p className="polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                        requires your pollinations.ai admin account.
                    </p>
                </div>
            )}
        </AuthFlowLayout>
    );
}
