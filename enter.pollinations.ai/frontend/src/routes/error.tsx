import { Button } from "@pollinations/ui";
import { AuthErrorContent, AuthFlowLayout } from "@pollinations/ui/auth";
import { isBannedLoginError } from "@shared/auth/ban.ts";
import { createFileRoute } from "@tanstack/react-router";

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

    const title = isBanned
        ? "Account suspended"
        : isStagingInviteOnly
          ? "Staging is invite-only"
          : "Something went wrong";
    const message = isBanned
        ? "Your account has been suspended. If you think this is a mistake, contact billing."
        : isStagingInviteOnly
          ? "This is the staging environment and access is limited to the Pollinations team. Head to pollinations.ai to use the production app."
          : "An unexpected error occurred. Please try again or open a GitHub issue if this keeps happening.";

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "login-error-title" }}
            actions={
                <>
                    <Button as="a" size="lg" href="/">
                        Go to dashboard
                    </Button>
                    {isBanned && (
                        <Button
                            as="a"
                            size="lg"
                            href="mailto:billing@pollinations.ai"
                        >
                            Contact billing
                        </Button>
                    )}
                </>
            }
        >
            <AuthErrorContent
                title={title}
                titleId="login-error-title"
                message={message}
            />
        </AuthFlowLayout>
    );
}
