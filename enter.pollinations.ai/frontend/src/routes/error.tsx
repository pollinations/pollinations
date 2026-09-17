import { ArrowRightIcon, Button } from "@pollinations/ui";
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
        ? "Your Pollinations account is suspended."
        : isStagingInviteOnly
          ? "Staging is invite-only. Use pollinations.ai to continue."
          : "Couldn’t sign you in, please try again.";

    return (
        <AuthFlowScreen
            footnote={isBanned ? "billing" : "help"}
            title="Sign in"
            error={message}
            actions={
                // A suspended account has nowhere to go; the footnote is the way out.
                isBanned ? undefined : (
                    <Button
                        as="a"
                        intent="neutral"
                        icon={<ArrowRightIcon />}
                        href="/"
                    >
                        Go to dashboard
                    </Button>
                )
            }
        />
    );
}
