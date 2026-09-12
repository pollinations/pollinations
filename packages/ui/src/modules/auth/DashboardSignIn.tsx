import { Button } from "../../primitives/Button.tsx";
import { Heading } from "../../primitives/Typography.tsx";
import { AuthFlowLayout, ErrorBanner } from "./AuthModal.tsx";
import { dashboardSignInErrors } from "./dashboard-sign-in-errors.ts";
import { PollinationsSignInButton } from "./PollinationsSignInButton.tsx";

export function DashboardSignIn({
    appName,
    onSignIn,
    isPending = false,
    error,
}: {
    appName: string;
    onSignIn: () => void;
    isPending?: boolean;
    error?: string | null;
}) {
    const code =
        typeof window === "undefined"
            ? null
            : new URLSearchParams(window.location.search).get("auth_error");
    const message =
        error ??
        (code && Object.hasOwn(dashboardSignInErrors, code)
            ? dashboardSignInErrors[code as keyof typeof dashboardSignInErrors]
                  .message
            : null);
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "dashboard-sign-in-title" }}
            secondaryAction={
                !isPending && code === "admin_required" ? (
                    <Button
                        as="a"
                        href="https://enter.pollinations.ai/pollen"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-pollinations-action="dashboard"
                    >
                        Open account
                    </Button>
                ) : undefined
            }
            actions={
                <PollinationsSignInButton
                    onClick={onSignIn}
                    isPending={isPending}
                >
                    {isPending
                        ? "Checking sign-in…"
                        : message
                          ? "Try again"
                          : "Sign in with Pollinations"}
                </PollinationsSignInButton>
            }
        >
            <div className="polli:space-y-2 polli:pt-3">
                <Heading as="h1" size="section" id="dashboard-sign-in-title">
                    {appName}
                </Heading>
                <p className="polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                    requires your pollinations.ai admin account.
                </p>
            </div>
            {!isPending && message && <ErrorBanner>{message}</ErrorBanner>}
        </AuthFlowLayout>
    );
}
