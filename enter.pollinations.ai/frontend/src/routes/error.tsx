import { ArrowRightIcon, Button } from "@pollinations/ui";
import { isBannedLoginError } from "@shared/auth/ban.ts";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";

export const Route = createFileRoute("/error")({
    head: () => ({ meta: [{ title: "Sign in | pollinations.ai" }] }),
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: (search.error as string) || "",
    }),
});

// Better Auth's codes for a failed Connect GitHub/Discord, shown to the
// signed-in user instead of the sign-in error.
const linkErrors: Record<string, string> = {
    account_already_linked_to_different_user:
        "That account is already connected to another Pollinations account.",
    unable_to_link_account:
        "Couldn’t connect that account. Verify its email address and try again.",
};

function ErrorPage() {
    const { error } = Route.useSearch();
    const isBanned = isBannedLoginError(error);
    const isStagingInviteOnly = error === "staging_is_invite-only";
    const linkError = Object.hasOwn(linkErrors, error)
        ? linkErrors[error]
        : undefined;
    const { data: session } = authClient.useSession();
    // A sign-in failure is stale once a session exists (a retried callback,
    // a reused link); account-state errors still apply to the signed-in user.
    if (session?.user && !isBanned && !isStagingInviteOnly && !linkError)
        return <Navigate to="/" replace />;

    // "Sign in to Pollinations" opens the sentence; the error line finishes it.
    const message = isBanned
        ? "Your Pollinations account is suspended."
        : isStagingInviteOnly
          ? "Staging is invite-only. Use pollinations.ai to continue."
          : linkError
            ? linkError
            : error === "account_not_linked"
              ? "This email already has a Pollinations account. Sign in with GitHub."
              : "Couldn’t sign you in. Please try again.";

    return (
        <AuthFlowScreen
            footnote={isBanned ? "billing" : "help"}
            title={linkError ? "Connect account" : "Sign in to Pollinations"}
            error={message}
            actions={
                // A suspended account has nowhere to go; the footnote is the way out.
                isBanned ? undefined : (
                    <Button
                        as="a"
                        icon={<ArrowRightIcon />}
                        href={linkError ? "/account" : "/"}
                    >
                        {linkError ? "Back to account" : "Go to dashboard"}
                    </Button>
                )
            }
        />
    );
}
