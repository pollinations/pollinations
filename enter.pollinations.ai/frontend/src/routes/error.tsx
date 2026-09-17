import { ArrowRightIcon, Button, MailIcon } from "@pollinations/ui";
import { isBannedLoginError } from "@shared/auth/ban.ts";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";

export const Route = createFileRoute("/error")({
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: (search.error as string) || "",
    }),
});

function ErrorPage() {
    const { error } = Route.useSearch();
    const isBanned = isBannedLoginError(error);
    const isStagingInviteOnly = error === "staging_is_invite-only";
    const { data: session } = authClient.useSession();
    // A sign-in failure is stale once a session exists (a retried callback,
    // a reused link); account-state errors still apply to the signed-in user.
    if (session?.user && !isBanned && !isStagingInviteOnly)
        return <Navigate to="/" replace />;

    // "Sign in" opens the sentence; the error line finishes it.
    const message = isBanned
        ? "Your account is suspended. If you think this is a mistake, contact billing."
        : isStagingInviteOnly
          ? "Staging is invite-only. Use pollinations.ai to continue."
          : "Couldn’t sign you in, please try again.";

    return (
        <AuthFlowScreen
            footnote="help"
            title="Sign in"
            error={message}
            actions={
                <>
                    {isBanned && (
                        <Button
                            as="a"
                            intent="neutral"
                            icon={<MailIcon />}
                            href="mailto:billing@pollinations.ai"
                        >
                            Contact billing
                        </Button>
                    )}
                    <Button as="a" icon={<ArrowRightIcon />} href="/">
                        Go to dashboard
                    </Button>
                </>
            }
        />
    );
}
